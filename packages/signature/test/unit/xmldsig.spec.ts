import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import {
  XMLDSIG_ALGORITHMS,
  XmlDSigInputError,
  resolveReference,
  toXPathLiteral,
  XmlDSigSigner,
  XmlDSigVerificationError,
  XmlDSigVerifier,
  sha256,
} from '../../src';

// Ephemeral fixture keypair generated per test run — never hardcode key
// material in the repo, even throwaway fixtures (secret scanners rightly
// flag any PEM private key). RSASSA-PKCS1-v1_5 signatures are deterministic
// for a given key, so the determinism assertions below are unaffected.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const PRIVATE_KEY = privateKey
  .export({ format: 'pem', type: 'pkcs8' })
  .toString();

const PUBLIC_KEY = publicKey.export({ format: 'pem', type: 'spki' }).toString();

describe('XMLDSig signing and verification', () => {
  const verifier = new XmlDSigVerifier();

  it('signs XML deterministically with the fixture key', () => {
    const xml = '<evento Id="EVT-1"><total>100.00</total></evento>';
    const signedA = sign(xml);
    const signedB = sign(xml);

    expect(signedA).toBe(signedB);
    expect(sha256(signedA)).toBe(sha256(signedB));
    expect(signedA).toContain('<Signature ');
    expect(signedA).toContain('URI="#EVT-1"');
  });

  it('verifies a valid signed XML payload', () => {
    const signedXml = sign('<evento Id="EVT-2"><total>100.00</total></evento>');

    const result = verifier.verify(signedXml, {
      keys: [{ keyId: 'fixture', publicKeyPem: PUBLIC_KEY }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyId).toBe('fixture');
      expect(result.signatureCount).toBe(1);
    }
  });

  it('detects signed payload tampering with reference mismatches', () => {
    const signedXml = sign('<evento Id="EVT-3"><total>100.00</total></evento>');
    const tamperedXml = signedXml.replace(
      '<total>100.00</total>',
      '<total>101.00</total>',
    );

    const result = verifier.verify(tamperedXml, {
      keys: [{ publicKeyPem: PUBLIC_KEY }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('reference-digest-mismatch');
      expect(result.mismatches[0]).toMatchObject({
        reference: '#EVT-3',
        expected: expect.any(String),
        actual: expect.any(String),
      });
      expect(result.mismatches[0]?.expected).not.toBe(
        result.mismatches[0]?.actual,
      );
    }
  });

  it('round-trips DCTFWeb-shaped XML with an explicit declaration location', () => {
    const xml = fixture('dctfweb-sample.xml');
    const signedXml = sign(xml, {
      location: { reference: "//*[local-name(.)='declaracao']" },
    });

    expect(signedXml).toContain('<declaracao Id="DCTFWEB-2026-01">');
    expect(
      verifier.verify(signedXml, { keys: [{ publicKeyPem: PUBLIC_KEY }] }).ok,
    ).toBe(true);
  });

  it('round-trips EFD-Reinf-shaped XML with exclusive C14N', () => {
    const xml = fixture('efd-reinf-sample.xml');
    const signedXml = sign(xml, {
      canonicalizationAlgorithm: XMLDSIG_ALGORITHMS.canonicalization.exclusive,
    });

    expect(signedXml).toContain('<evtTotal Id="ID-R9000-2026-01">');
    expect(
      verifier.verify(signedXml, { keys: [{ publicKeyPem: PUBLIC_KEY }] }).ok,
    ).toBe(true);
  });

  it('throws descriptive errors for unsigned inputs and missing keys', () => {
    expect(() => sign('<evento><total>100.00</total></evento>')).toThrow(
      XmlDSigInputError,
    );

    const signedXml = sign('<evento Id="EVT-4"><total>100.00</total></evento>', {
      includeKeyInfo: false,
    });

    expect(() => verifier.verify(signedXml)).toThrow(XmlDSigVerificationError);
  });

  it('resolves custom and discovered ID references and quotes XPath literals safely', () => {
    expect(resolveReference('<event ID="ID-1"/>')).toMatchObject({
      id: 'ID-1',
      idAttribute: 'ID',
      uri: '#ID-1',
    });
    expect(resolveReference('<event id="id-2"/>', { idAttributes: ['custom', 'id'] })).toMatchObject({
      id: 'id-2',
      idAttribute: 'id',
    });
    expect(resolveReference('<event/>', {
      id: 'explicit',
      idAttribute: 'CustomId',
      xpath: '//event',
      uri: 'urn:custom',
    })).toEqual({ id: 'explicit', idAttribute: 'CustomId', xpath: '//event', uri: 'urn:custom' });
    expect(resolveReference('<event/>', { id: 'explicit' })).toMatchObject({
      idAttribute: 'Id',
      xpath: "//*[@Id='explicit']",
    });
    expect(resolveReference('<event ID="xpath-only"/>', { xpath: '//event' })).toEqual({
      id: 'xpath-only', idAttribute: 'Id', xpath: '//event', uri: '#xpath-only',
    });
    expect(toXPathLiteral("single'quote")).toBe('"single\'quote"');
    expect(toXPathLiteral('double"quote')).toBe("'double\"quote'");
    expect(toXPathLiteral(`both'"quotes`)).toContain('concat(');
  });

  it('supports signature prefixes, attributes and existing namespace prefixes', () => {
    const signedXml = sign('<evento Id="EVT-CUSTOM"><total>5</total></evento>', {
      prefix: 'ds',
      attrs: { Id: 'custom-signature' },
      existingPrefixes: { ds: 'http://www.w3.org/2000/09/xmldsig#' },
      key: { privateKeyPem: PRIVATE_KEY, publicKeyPem: PUBLIC_KEY },
    });
    expect(signedXml).toContain('<ds:Signature');
    expect(signedXml).toContain('Id="custom-signature"');
    expect(verifier.verify(signedXml, { keys: [{ publicKeyPem: PUBLIC_KEY }] }).ok).toBe(true);
  });

  it('reports missing signatures and retries verification against later keys', () => {
    expect(verifier.verify('<event Id="unsigned"/>')).toMatchObject({
      ok: false,
      signatureCount: 0,
      reason: 'missing-signature',
      mismatches: [],
    });
    const signedXml = sign('<evento Id="EVT-KEYS"><total>9</total></evento>');
    const wrong = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey
      .export({ format: 'pem', type: 'spki' }).toString();
    expect(verifier.verify(signedXml, { keys: [
      { keyId: 'wrong', publicKeyPem: wrong },
      { keyId: 'right', publicKeyPem: PUBLIC_KEY },
    ] })).toMatchObject({ ok: true, keyId: 'right' });
  });

  it('verifies an embedded certificate and reports non-digest signature failures', () => {
    const signed = new XmlDSigSigner().sign('<event Id="embedded"><value>ok</value></event>', {
      key: {
        privateKeyPem: fixture('pki/signer.key.pem'),
        certificatePem: fixture('pki/signer.cert.pem'),
      },
    });
    expect(verifier.verify(signed).ok).toBe(true);
    expect(() => verifier.verify(signed, { allowKeyInfoCertificate: false })).toThrow(
      XmlDSigVerificationError,
    );

    const badValue = signed.replace(
      /<SignatureValue>[\s\S]*?<\/SignatureValue>/u,
      '<SignatureValue>bad</SignatureValue>',
    );
    expect(verifier.verify(badValue, { keys: [{ publicKeyPem: PUBLIC_KEY }] })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/signature-mismatch|reference-digest-mismatch/u),
    });
  });

  it('verifies with an explicit nonstandard ID attribute and handles missing targets', () => {
    const signed = new XmlDSigSigner().sign(
      '<envelope><payload RecordKey="record-1"><value>ok</value></payload></envelope>',
      { key: { privateKeyPem: PRIVATE_KEY }, reference: {
        idAttribute: 'RecordKey', idAttributes: ['RecordKey'],
      } },
    );
    expect(verifier.verify(signed, {
      idAttribute: 'RecordKey',
      keys: [{ publicKeyPem: PUBLIC_KEY }],
    })).toMatchObject({ ok: true, signatureCount: 1 });

    const withoutTarget = signed.replace('RecordKey="record-1"', 'RecordKey="record-2"');
    expect(verifier.verify(withoutTarget, { idAttribute: 'RecordKey', keys: [
      { publicKeyPem: PUBLIC_KEY },
    ] })).toMatchObject({ ok: false, reason: 'reference-digest-mismatch' });
  });

  it('reports embedded-key signature and reference digest failures', () => {
    const signed = new XmlDSigSigner().sign(
      '<root><item id="node-1"><value>original</value></item></root>',
      { key: { privateKeyPem: PRIVATE_KEY, certificatePem: fixture('pki/signer.cert.pem') } },
    );

    const badSignatureValue = signed.replace(
      /<SignatureValue>[\s\S]*?<\/SignatureValue>/u,
      '<SignatureValue>not-a-signature</SignatureValue>',
    );
    expect(verifier.verify(badSignatureValue)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/signature-mismatch|reference-digest-mismatch/u),
    });

    const tampered = signed.replace('<value>original</value>', '<value>changed</value>');
    expect(verifier.verify(tampered)).toMatchObject({
      ok: false,
      reason: 'reference-digest-mismatch',
      mismatches: [{ reference: '#node-1', expected: expect.any(String), actual: expect.any(String) }],
    });
  });

  it.each([
    ['SHA-1', XMLDSIG_ALGORITHMS.digest.sha1],
    ['SHA-512', XMLDSIG_ALGORITHMS.digest.sha512],
  ])('calculates reference digests for %s signatures', (_label, digestAlgorithm) => {
    const signed = new XmlDSigSigner().sign(
      '<root><item ID="legacy-1"><value>before</value></item></root>',
      { key: { privateKeyPem: PRIVATE_KEY }, reference: { idAttribute: 'ID' }, digestAlgorithm },
    );
    const tampered = signed.replace('<value>before</value>', '<value>after</value>');
    const result = verifier.verify(tampered, { keys: [{ publicKeyPem: PUBLIC_KEY }] });
    expect(result).toMatchObject({ ok: false, reason: 'reference-digest-mismatch' });
    if (!result.ok) {
      expect(result.mismatches[0]?.actual).not.toBe('unavailable');
      expect(result.mismatches[0]?.actual).not.toBe(result.mismatches[0]?.expected);
    }
  });

  it('reports a failed reference when XMLDSig carries an external URI', () => {
    const signed = new XmlDSigSigner().sign('<root Id="external"><value>before</value></root>', {
      key: { privateKeyPem: PRIVATE_KEY },
      reference: { id: 'external', uri: 'urn:external-reference', xpath: '//*[@Id="external"]' },
    });
    const tampered = signed.replace('<value>before</value>', '<value>after</value>');
    expect(verifier.verify(tampered, { keys: [{ publicKeyPem: PUBLIC_KEY }] })).toMatchObject({
      ok: false,
      reason: 'reference-digest-mismatch',
      mismatches: [{ actual: expect.any(String), expected: expect.any(String) }],
    });
  });

  it('reports an unavailable digest algorithm when a signed reference uses an unknown method', () => {
    const signed = sign('<event Id="unknown-digest"><value>before</value></event>');
    const unsupported = signed.replace(
      XMLDSIG_ALGORITHMS.digest.sha256,
      'urn:example:unsupported-digest',
    );
    const result = verifier.verify(unsupported, { keys: [{ publicKeyPem: PUBLIC_KEY }] });
    expect(result).toMatchObject({ ok: false, reason: 'reference-digest-mismatch' });
    if (!result.ok) expect(result.mismatches[0]?.actual).toBe('unavailable');
  });

  it('reports unavailable mismatches when the parsed document has no root element', () => {
    const signed = sign('<event Id="empty-document"><value>before</value></event>');
    const checkSignature = vi.spyOn(SignedXml.prototype, 'checkSignature').mockReturnValue(false);
    const getReferences = vi.spyOn(SignedXml.prototype, 'getReferences')
      .mockReturnValueOnce([{
        uri: '', xpath: undefined, digestValue: undefined,
        digestAlgorithm: 'urn:unsupported:digest', transforms: [],
      }] as never)
      .mockReturnValueOnce([{
        uri: '#missing', xpath: undefined, digestValue: undefined,
        digestAlgorithm: 'urn:unsupported:digest', transforms: [],
      }] as never)
      .mockReturnValueOnce([]);
    const parseFromString = vi.spyOn(DOMParser.prototype, 'parseFromString')
      .mockReturnValue({ documentElement: null } as never);
    try {
      expect(verifier.verify(signed, { keys: [{ publicKeyPem: PUBLIC_KEY }] })).toMatchObject({
        ok: false,
        reason: 'reference-digest-mismatch',
        mismatches: [{ reference: 'unknown-reference', expected: 'unavailable', actual: 'unavailable' }],
      });
      expect(verifier.verify(signed, { keys: [{ publicKeyPem: PUBLIC_KEY }] })).toMatchObject({
        ok: false,
        reason: 'reference-digest-mismatch',
        mismatches: [{ reference: '#missing', actual: 'unavailable' }],
      });
      expect(verifier.verify(signed, { keys: [{ publicKeyPem: PUBLIC_KEY }] })).toMatchObject({
        ok: false,
        reason: 'signature-mismatch',
        mismatches: [{ reference: 'SignedInfo', expected: 'valid signature value', actual: 'invalid signature value' }],
      });
    } finally {
      checkSignature.mockRestore();
      getReferences.mockRestore();
      parseFromString.mockRestore();
    }
  });
});

function sign(
  xml: string,
  overrides: Partial<Parameters<XmlDSigSigner['sign']>[1]> = {},
): string {
  return new XmlDSigSigner().sign(xml, {
    key: { privateKeyPem: PRIVATE_KEY },
    ...overrides,
  });
}

function fixture(name: string): string {
  return readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');
}
