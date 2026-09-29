import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCmsTrustVerifier } from '../../src';
import { bltCmsSignature, bltSignedDocument, bytes, certificate, now, profile, rootPem } from '../fixtures/trust';

const input = () => ({
  tenantId: 'tenant-a',
  originalDocument: bytes('pades-bt-source.pdf'),
  signedDocument: bytes('pades-bt-blt.pdf'),
  cmsSignature: bytes('pades-bt-blt.cms.der'),
  certificate,
  profile: { ...profile, requiredPadesProfile: 'PAdES-B-T' as const, revocation: 'ocsp' as const },
});

const verifier = (overrides: Record<string, unknown> = {}) => createCmsTrustVerifier({
  trustAnchorsPem: [rootPem],
  tsaTrustAnchorsPem: [rootPem],
  acceptedPolicies: profile.acceptedPolicies,
  now: () => now,
  ...overrides,
});

const der = (value: Uint8Array): ArrayBuffer => value.buffer.slice(
  value.byteOffset,
  value.byteOffset + value.byteLength,
) as ArrayBuffer;

const rewriteCms = (change: (signed: pkijs.SignedData) => void): Buffer => {
  const source = Buffer.from(bltCmsSignature);
  const parsed = asn1js.fromBER(der(source));
  if (parsed.offset !== source.length) throw new Error('Fixture CMS is not a complete ASN.1 value');
  const contentInfo = new pkijs.ContentInfo({ schema: parsed.result });
  const signed = new pkijs.SignedData({ schema: contentInfo.content });
  change(signed);
  return Buffer.from(new pkijs.ContentInfo({
    contentType: pkijs.ContentInfo.SIGNED_DATA,
    content: signed.toSchema(),
  }).toSchema().toBER(false));
};

const cmsWithChangedPdf = (
  cms: Uint8Array,
  change: (pdf: Buffer) => void,
  sourcePdf: Uint8Array = bltSignedDocument,
): Buffer => {
  const pdf = Buffer.from(sourcePdf);
  const marker = pdf.indexOf(Buffer.from('/Contents <', 'latin1'));
  if (marker < 0) throw new Error('Fixture PDF has no Contents placeholder');
  const start = marker + Buffer.byteLength('/Contents <');
  const end = pdf.indexOf('>'.charCodeAt(0), start);
  const hex = Buffer.from(cms).toString('hex');
  if (hex.length > end - start) throw new Error('Mutated CMS exceeds fixture placeholder');
  pdf.fill('0'.charCodeAt(0), start, end);
  pdf.write(hex, start, 'latin1');
  change(pdf);
  return pdf;
};

const rewriteOcsp = (change: (response: pkijs.BasicOCSPResponse) => void): Buffer => {
  const source = Buffer.from(bytes('ocsp-good.der'));
  const parsed = asn1js.fromBER(der(source));
  if (parsed.offset !== source.length) throw new Error('Fixture OCSP response is incomplete');
  const response = new pkijs.OCSPResponse({ schema: parsed.result });
  const responseBytes = response.responseBytes;
  if (!responseBytes) throw new Error('Fixture OCSP response has no responseBytes');
  const basicParsed = asn1js.fromBER(responseBytes.response.valueBlock.valueHexView);
  const basic = new pkijs.BasicOCSPResponse({ schema: basicParsed.result });
  change(basic);
  responseBytes.response = new asn1js.OctetString({ valueHex: basic.toSchema().toBER(false) });
  return Buffer.from(response.toSchema().toBER(false));
};

const forceOcspProducedAt = (producedAt: Date): void => {
  const original = pkijs.ResponseData.prototype.fromSchema;
  vi.spyOn(pkijs.ResponseData.prototype, 'fromSchema').mockImplementation(function (schema) {
    original.call(this, schema);
    this.producedAt = producedAt;
  });
};

afterEach(() => vi.restoreAllMocks());

const expectRejectedEvidence = async (
  promise: Promise<unknown>,
  name: string,
  message: string,
): Promise<void> => {
  await expect(promise).rejects.toMatchObject({ name });
  await expect(promise).rejects.toThrow(message);
};

describe('CMS trust verifier low-level evidence edges', () => {
  it('rejects a matching PDF Contents gap with a nonzero ByteRange start', async () => {
    const testInput = input();
    const pdf = cmsWithChangedPdf(testInput.cmsSignature, (value) => {
      const range = /\/ByteRange\s*\[\s*\d+/u.exec(value.toString('latin1'));
      if (!range) throw new Error('Fixture PDF has no ByteRange');
      const digit = range.index + range[0].length - 1;
      value[digit] = '1'.charCodeAt(0);
    }, testInput.signedDocument);
    await expectRejectedEvidence(verifier().verifySignedArtifact({ ...testInput, signedDocument: pdf }),
      'SignatureTrustError', 'PDF ByteRange is incomplete');
  });

  it('rejects a PDF ByteRange gap that does not contain the Contents token', async () => {
    const testInput = input();
    const pdf = cmsWithChangedPdf(testInput.cmsSignature, (value) => {
      const marker = value.indexOf(Buffer.from('/Contents <', 'latin1'));
      if (marker < 0) throw new Error('Fixture PDF has no Contents token');
      value.write('ContentX', marker + 1, 'latin1');
    }, testInput.signedDocument);
    await expectRejectedEvidence(verifier().verifySignedArtifact({ ...testInput, signedDocument: pdf }),
      'SignatureTrustError', 'PDF Contents is not the ByteRange gap');
  });

  it('rejects ESS issuerSerial with absent GeneralNames and a non-integer serial', async () => {
    const cms = rewriteCms((signed) => {
      const signer = signed.signerInfos[0];
      const ess = signer?.signedAttrs?.attributes.find((attribute) => attribute.type === '1.2.840.113549.1.9.16.2.47');
      const outer = ess?.values[0];
      if (!(outer instanceof asn1js.Sequence)) throw new Error('Fixture ESS value is not a sequence');
      const certs = outer.valueBlock.value[0];
      if (!(certs instanceof asn1js.Sequence)) throw new Error('Fixture ESS certificate list is missing');
      const first = certs.valueBlock.value[0];
      if (!(first instanceof asn1js.Sequence)) throw new Error('Fixture ESS certificate ID is missing');
      const hash = first.valueBlock.value.find((field) => field instanceof asn1js.OctetString);
      if (!(hash instanceof asn1js.OctetString)) throw new Error('Fixture ESS certificate hash is missing');
      ess!.values = [new asn1js.Sequence({ value: [new asn1js.Sequence({
        value: [new asn1js.Sequence({ value: [hash, new asn1js.Sequence()] })],
      })] })];
    });
    const pdf = cmsWithChangedPdf(cms, () => {});
    await expectRejectedEvidence(verifier().verifySignedArtifact({
      ...input(), cmsSignature: cms, signedDocument: pdf,
    }), 'SignatureTrustError', 'SigningCertificateV2 issuerSerial differs from signer');
  });

  it('rejects a matching OCSP response whose signature verifier returns false', async () => {
    vi.spyOn(pkijs.BasicOCSPResponse.prototype, 'verify').mockResolvedValue(false as never);
    await expectRejectedEvidence(
      verifier({ fetchOcsp: async () => bytes('ocsp-good.der') }).verifySignedArtifact(input()),
      'SignatureTrustError', 'OCSP signature invalid',
    );
  });

  it('rejects a validly parsed OCSP response produced too far in the future', async () => {
    vi.spyOn(pkijs.BasicOCSPResponse.prototype, 'verify').mockResolvedValue(true as never);
    forceOcspProducedAt(new Date(now.getTime() + 10 * 60_000));
    vi.spyOn(pkijs.OCSPResponse.prototype, 'getCertificateStatus').mockResolvedValue({
      isForCertificate: true,
      status: 0,
    } as never);
    await expectRejectedEvidence(verifier({ fetchOcsp: async () => bytes('ocsp-good.der') }).verifySignedArtifact(input()),
      'SignatureTrustError', 'OCSP production time invalid');
  });

  it('treats an OCSP CertID with an unsupported hash algorithm as unavailable', async () => {
    vi.spyOn(pkijs.BasicOCSPResponse.prototype, 'verify').mockResolvedValue(true as never);
    forceOcspProducedAt(now);
    vi.spyOn(pkijs.OCSPResponse.prototype, 'getCertificateStatus').mockResolvedValue({
      isForCertificate: true,
      status: 0,
    } as never);
    const response = rewriteOcsp((basic) => {
      basic.tbsResponseData.responses[0]!.certID.hashAlgorithm.algorithmId = '1.2.3.4.999';
    });
    await expectRejectedEvidence(verifier({ fetchOcsp: async () => response }).verifySignedArtifact(input()),
      'SignatureTrustUnavailableError', 'Revocation evidence not current');
  });

  it('treats a response whose CertID does not match as unavailable', async () => {
    vi.spyOn(pkijs.BasicOCSPResponse.prototype, 'verify').mockResolvedValue(true as never);
    forceOcspProducedAt(now);
    vi.spyOn(pkijs.OCSPResponse.prototype, 'getCertificateStatus').mockResolvedValue({
      isForCertificate: true,
      status: 0,
    } as never);
    await expectRejectedEvidence(
      verifier({ fetchOcsp: async () => bytes('ocsp-unknown.der') }).verifySignedArtifact(input()),
      'SignatureTrustUnavailableError', 'Revocation evidence not current',
    );
  });

  it('treats a matching OCSP response with expired single-response freshness as unavailable', async () => {
    vi.spyOn(pkijs.BasicOCSPResponse.prototype, 'verify').mockResolvedValue(true as never);
    forceOcspProducedAt(now);
    const response = rewriteOcsp((basic) => {
      basic.tbsResponseData.responses[0]!.nextUpdate = undefined;
    });
    await expectRejectedEvidence(verifier({ fetchOcsp: async () => response }).verifySignedArtifact(input()),
      'SignatureTrustUnavailableError', 'Revocation evidence not current');
  });

  it('treats an OCSP unknown certificate status as unavailable', async () => {
    vi.spyOn(pkijs.BasicOCSPResponse.prototype, 'verify').mockResolvedValue(true as never);
    forceOcspProducedAt(now);
    vi.spyOn(pkijs.OCSPResponse.prototype, 'getCertificateStatus').mockResolvedValue({
      isForCertificate: true,
      status: 2,
    } as never);
    await expectRejectedEvidence(
      verifier({ fetchOcsp: async () => bytes('ocsp-good.der') }).verifySignedArtifact(input()),
      'SignatureTrustUnavailableError', 'Revocation evidence not current',
    );
  });

  it('treats a correctly signed future CRL as unavailable', async () => {
    vi.spyOn(pkijs.CertificateRevocationList.prototype, 'verify').mockResolvedValue(true as never);
    await expectRejectedEvidence(verifier({
      fetchCrl: async () => bytes('root.crl.der'),
    }).verifySignedArtifact({
      ...input(),
      profile: { ...input().profile, revocation: 'crl' as const },
    }), 'SignatureTrustUnavailableError', 'Revocation evidence not current');
  });

  it('treats a CRL whose nextUpdate is before the trusted signing time as unavailable', async () => {
    vi.spyOn(pkijs.CertificateRevocationList.prototype, 'verify').mockResolvedValue(true as never);
    const source = Buffer.from(bytes('root.crl.der'));
    const parsed = asn1js.fromBER(der(source));
    const crl = new pkijs.CertificateRevocationList({ schema: parsed.result });
    const trustedAt = new Date('2026-09-28T15:42:19.000Z');
    crl.thisUpdate.value = new Date(trustedAt.getTime() + 60_000);
    if (!crl.nextUpdate) throw new Error('Fixture CRL has no nextUpdate');
    crl.nextUpdate.value = new Date(trustedAt.getTime() - 1);
    const expired = Buffer.from(crl.toSchema().toBER(false));
    await expectRejectedEvidence(verifier({ fetchCrl: async () => expired }).verifySignedArtifact({
      ...input(),
      profile: { ...input().profile, revocation: 'crl' as const },
    }), 'SignatureTrustUnavailableError', 'Revocation evidence not current');
  });
});
