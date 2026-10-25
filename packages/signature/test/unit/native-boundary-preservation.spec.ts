import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { PDFObjectParser } from 'pdf-lib';
import { readPdfTrustEvidence } from '../../src/pdf-trust-evidence.js';
import { generateKeyPairSync } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { SignedXml } from 'xml-crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createCmsTrustVerifier, SignatureWithdrawalVerifier, sha256Hex,
  XmlDSigSigner, XmlDSigVerifier, canonicalJson, sha256CanonicalJson,
} from '../../src/index.js';
import { bytes, bltCmsSignature, bltSignedDocument, bltSourceDocument, certificate, now, profile, rootPem } from '../fixtures/trust.js';

function shapeBytes(kind: string, input: Uint8Array): unknown {
  if (kind === 'Buffer') return Buffer.from(input);
  if (kind === 'offset Buffer') return Buffer.concat([Buffer.from([9]), Buffer.from(input), Buffer.from([8])]).subarray(1, input.length + 1);
  if (kind === 'Uint8Array') return new Uint8Array(input);
  if (kind === 'offset Uint8Array') { const bytes = new Uint8Array(input.length + 2); bytes.set(input, 1); return bytes.subarray(1, input.length + 1); }
  if (kind === 'cross-realm ArrayBuffer') return runInNewContext('Uint8Array.from(values)', { values: [...input] });
  if (kind === 'SharedArrayBuffer') { const bytes = new Uint8Array(new SharedArrayBuffer(input.length)); bytes.set(input); return bytes; }
  throw new Error(`Unrecognized test shape ${kind}`);
}
const shapes = ['Buffer', 'offset Buffer', 'Uint8Array', 'offset Uint8Array', 'cross-realm ArrayBuffer', 'SharedArrayBuffer'];

describe('native ASN.1 backing-buffer boundaries through original callers', () => {
  it.each(shapes)('CMS actual signed fixture with %s backing', async (kind) => {
    const cmsSignature = shapeBytes(kind, bltCmsSignature);
    const verifier = createCmsTrustVerifier({ trustAnchorsPem: [rootPem], tsaTrustAnchorsPem: [rootPem], acceptedPolicies: profile.acceptedPolicies, now: () => now });
    const result = Reflect.apply(verifier.verifySignedArtifact, verifier, [{ tenantId: 'native-boundary', originalDocument: bltSourceDocument, signedDocument: bltSignedDocument, cmsSignature, certificate, profile }]);
    if (kind === 'SharedArrayBuffer') await expect(result).rejects.toThrow('Cryptographic trust evidence is invalid');
    else await expect(result).resolves.toMatchObject({ achievedLevel: 'ADVANCED', padesProfile: 'PAdES-B-LT', cmsSha256: sha256Hex(bltCmsSignature) });
  });
  it.each(shapes)('withdrawal parses actual ASN.1 and reaches original attestor fallback with %s', async (kind) => {
    const evidenceBytes = shapeBytes(kind, new Uint8Array([0x30, 0]));
    const verifier = new SignatureWithdrawalVerifier({});
    const document = Buffer.from('document');
    const result = Reflect.apply(verifier.verifyWithdrawalEvidence, verifier, [{ tenantId: 'tenant', caseId: 'case', documentId: 'document', contentHash: sha256Hex(document), document, signerPartyId: 'party', eligiblePartyIds: ['party'], evidenceRef: 'ref', evidenceBytes, verificationMethod: 'physical_verified', trustProfile: profile }]);
    if (kind === 'SharedArrayBuffer') await expect(result).rejects.toThrow("The provided value is not of type '(ArrayBuffer or ArrayBufferView)'");
    else await expect(result).resolves.toEqual({ status: 'unavailable', reasons: ['ATTESTOR_UNAVAILABLE'] });
  });
  it.each(shapes)('withdrawal empty %s exits before ASN.1 and native backing conversion', async (kind) => {
    const evidenceBytes = shapeBytes(kind, new Uint8Array()); const document = Buffer.from('document');
    const verifier = new SignatureWithdrawalVerifier({});
    await expect(Reflect.apply(verifier.verifyWithdrawalEvidence, verifier, [{ tenantId: 'tenant', caseId: 'case', documentId: 'document', contentHash: sha256Hex(document), document, signerPartyId: 'party', eligiblePartyIds: ['party'], evidenceRef: 'ref', evidenceBytes, verificationMethod: 'physical_verified', trustProfile: profile }])).resolves.toEqual({ status: 'unavailable', reasons: ['EVIDENCE_ABSENT'] });
  });
});

describe('native XML canonicalization mismatch path', () => {
  it('delegates native canonicalization with actual receiver, transform array and Element', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const signed = new XmlDSigSigner().sign('<root xmlns="urn:original"><item Id="native-1"><value>before</value></item></root>', { key: { privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() } });
    const tampered = signed.replace('>before<', '>after<');
    const original = SignedXml.prototype.getCanonXml;
    const nativeCalls: { receiver: unknown; transforms: unknown; node: unknown; args: number; output: unknown }[] = [];
    const observer = vi.spyOn(SignedXml.prototype, 'getCanonXml').mockImplementation(function (...args) {
      const output: unknown = Reflect.apply(original, this, args);
      nativeCalls.push({ receiver: this, transforms: args[0], node: args[1], args: args.length, output });
      return output;
    });
    try {
      const result = new XmlDSigVerifier().verify(tampered, { keys: [{ publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString() }] });
      expect(result).toMatchObject({ ok: false, reason: 'reference-digest-mismatch' });
      if (result.ok) throw new Error('tampered fixture unexpectedly valid');
      expect(result.mismatches[0]?.actual).not.toBe('unavailable');
      expect(result.mismatches[0]?.actual).not.toBe(result.mismatches[0]?.expected);
      const direct = nativeCalls.filter((call) => call.args === 2);
      expect(direct.length).toBeGreaterThan(0);
      for (const call of direct) { expect(call.receiver).toBeInstanceOf(SignedXml); expect(Array.isArray(call.transforms)).toBe(true); expect(call.node).toMatchObject({ nodeType: 1 }); expect(call.output).toEqual(expect.any(String)); }
    } finally { observer.mockRestore(); }
  });
});

describe('canonical JSON declared-unknown input preservation', () => {
  it.each([undefined, function opaque() {}, Symbol('opaque')])('retains unsupported top-level result and downstream native error %s', (value) => {
    expect(canonicalJson(value)).toBeUndefined();
    expect(() => sha256CanonicalJson(value)).toThrow(TypeError);
  });
  it('keeps sparse array commas and sorted getter/receiver order', () => {
    expect(canonicalJson(Array(2))).toBe('[,]'); const order: string[] = [];
    const value = { get z() { expect(this).toBe(value); order.push('z'); return 1; }, get a() { expect(this).toBe(value); order.push('a'); return 2; } };
    expect(canonicalJson(value)).toBe('{"a":2,"z":1}'); expect(order).toEqual(['a', 'z']);
  });
  it('keeps inherited/non-enumerable/symbol exclusions and thrown getter identity', () => {
    const value = Object.assign(Object.create({ inherited: 1 }), { own: 2 }); Object.defineProperty(value, 'hidden', { value: 3 }); value[Symbol('opaque')] = 4;
    expect(canonicalJson(value)).toBe('{"own":2}'); const failure = new Error('original getter');
    expect(() => canonicalJson({ get field() { throw failure; } })).toThrow(failure);
  });
});

describe('actual DER and PDF native shape witnesses', () => {
  it.each([0, 1, 2])('round-trips actual DER OCSP status tag %s through installed parser', (tag) => {
    const original = Buffer.from(bytes('ocsp-good.der'));
    const parsed = asn1js.fromBER(original);
    const envelope = new pkijs.OCSPResponse({ schema: parsed.result });
    if (!envelope.responseBytes) throw new Error('fixture responseBytes missing');
    const basic = new pkijs.BasicOCSPResponse({ schema: asn1js.fromBER(envelope.responseBytes.response.valueBlock.valueHexView).result });
    const response = basic.tbsResponseData.responses[0];
    if (!response) throw new Error('fixture single response missing');
    response.certStatus = tag === 1
      ? new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 1 }, value: [new asn1js.GeneralizedTime({ valueDate: now })] })
      : new asn1js.Primitive({ idBlock: { tagClass: 3, tagNumber: tag }, valueHex: new ArrayBuffer(0) });
    const roundtrip = new pkijs.SingleResponse({ schema: asn1js.fromBER(response.toSchema().toBER(false)).result });
    const status: unknown = roundtrip.certStatus;
    expect(status).toBeInstanceOf(tag === 1 ? asn1js.Constructed : asn1js.Primitive);
    expect(status).toMatchObject({ idBlock: { tagClass: 3, tagNumber: tag } });
  });
  it.each(['non-time', 'generalized'] as const)('retains actual CMS %s signing-time failure position', async (kind) => {
    const cms = Buffer.from(bltCmsSignature);
    const content = new pkijs.ContentInfo({ schema: asn1js.fromBER(cms).result });
    const signed = new pkijs.SignedData({ schema: content.content });
    const attribute = signed.signerInfos[0]?.signedAttrs?.attributes.find((a) => a.type === '1.2.840.113549.1.9.5');
    if (!attribute) throw new Error('fixture signing time missing');
    const old: unknown = attribute.values[0];
    if (!(old instanceof asn1js.UTCTime)) throw new Error('fixture time is not native time');
    attribute.values = [kind === 'non-time' ? new asn1js.Integer({ value: 7 }) : new asn1js.GeneralizedTime({ valueDate: old.toDate() })];
    content.content = signed.toSchema(); const changed = Buffer.from(content.toSchema().toBER(false));
    const pdf = Buffer.from(bltSignedDocument); const start = pdf.indexOf('/Contents <') + Buffer.byteLength('/Contents <'); const end = pdf.indexOf('>', start);
    const hex = changed.toString('hex'); expect(hex.length).toBeLessThanOrEqual(end - start); pdf.fill('0'.charCodeAt(0), start, end); pdf.write(hex, start, 'latin1');
    const verifier = createCmsTrustVerifier({ trustAnchorsPem: [rootPem], tsaTrustAnchorsPem: [rootPem], acceptedPolicies: profile.acceptedPolicies, now: () => now });
    const result = verifier.verifySignedArtifact({ tenantId: 'native-time', originalDocument: bltSourceDocument, signedDocument: pdf, cmsSignature: changed, certificate, profile });
    if (kind === 'non-time') await expect(result).rejects.toThrow('CMS signed signing time absent');
    else { let failure: unknown; try { await result; } catch (error) { failure = error; } expect(failure).toBeInstanceOf(Error); expect(failure).not.toMatchObject({ message: 'CMS signed signing time absent' }); }
  });
  it('delegates actual PDF parser offset with its original native stream receiver', async () => {
    const native = PDFObjectParser.forBytes; const calls: { args: number; output: unknown }[] = []; const restores: (() => void)[] = [];
    const observer = vi.spyOn(PDFObjectParser, 'forBytes').mockImplementation(function (...args) {
      const parser = Reflect.apply(native, this, args);
      const stream: unknown = Reflect.get(parser, 'bytes');
      if ((typeof stream !== 'object' || stream === null) && typeof stream !== 'function') throw new Error('native stream missing');
      const offset: unknown = Reflect.get(stream, 'offset'); if (typeof offset !== 'function') throw new Error('native offset missing');
      const own = Object.getOwnPropertyDescriptor(stream, 'offset');
      Object.defineProperty(stream, 'offset', { configurable: true, value: function(this: unknown, ...parameters: unknown[]) { expect(this).toBe(stream); const result: unknown = Reflect.apply(offset, this, parameters); calls.push({ args: parameters.length, output: result }); return result; } });
      restores.push(() => { if (own) Object.defineProperty(stream, 'offset', own); else Reflect.deleteProperty(stream, 'offset'); }); return parser;
    });
    try { const range = /\/ByteRange\s*\[\s*\d+\s+\d+\s+(\d+)\s+(\d+)\s*\]/u.exec(Buffer.from(bltSignedDocument).toString('latin1')); if (!range) throw new Error('fixture range missing'); await readPdfTrustEvidence(bltSignedDocument, Number(range[1]) + Number(range[2]), bltCmsSignature); expect(calls.length).toBeGreaterThan(0); expect(calls.every((call) => call.args === 0 && typeof call.output === 'number')).toBe(true); }
    finally { observer.mockRestore(); for (const restore of restores) restore(); }
  });
});

describe('broken native implementation invariant', () => {
  it('refuses a replaced canonicalizer non-string result instead of promising a digest', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const signed = new XmlDSigSigner().sign('<root><item Id="broken-native"><value>before</value></item></root>', { key: { privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() } });
    const descriptor = Object.getOwnPropertyDescriptor(SignedXml.prototype, 'getCanonXml');
    if (!descriptor) throw new Error('native canonicalizer descriptor missing');
    // This unsupported replaced-native invariant is deliberately separate from
    // the original native delegation and historical compatibility controls.
    Object.defineProperty(SignedXml.prototype, 'getCanonXml', { ...descriptor, value: function(this: unknown, ...args: unknown[]) {
      const node = args[1];
      if (args.length === 2 && typeof node === 'object' && node !== null && Reflect.get(node, 'localName') === 'item') return 3;
      return Reflect.apply(descriptor.value, this, args);
    } });
    try {
      expect(() => new XmlDSigVerifier().verify(signed.replace('>before<', '>after<'), { keys: [{ publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString() }] })).toThrow('XML canonicalization did not produce a string');
    } finally { Object.defineProperty(SignedXml.prototype, 'getCanonXml', descriptor); }
  });
});
