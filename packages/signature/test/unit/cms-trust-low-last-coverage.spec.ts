import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCmsTrustVerifier } from '../../src';
import { bytes, certificate, now, profile, rootPem } from '../fixtures/trust';

vi.mock('pkijs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pkijs')>();
  return { ...actual, getAlgorithmByOID: vi.fn(actual.getAlgorithmByOID) };
});

const originalGetAlgorithmByOID = vi.mocked(pkijs.getAlgorithmByOID).getMockImplementation();

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

const withCurrentOcspTimes = (basic: pkijs.BasicOCSPResponse): void => {
  basic.tbsResponseData.producedAt = now;
  const response = basic.tbsResponseData.responses[0];
  if (!response) throw new Error('Fixture OCSP response has no SingleResponse');
  response.thisUpdate = new Date('2026-09-28T15:41:19.000Z');
  response.nextUpdate = new Date('2026-09-28T16:42:19.000Z');
};

const forceParsedOcspProducedAt = (): void => {
  const original = pkijs.ResponseData.prototype.fromSchema;
  vi.spyOn(pkijs.ResponseData.prototype, 'fromSchema').mockImplementation(function (schema) {
    original.call(this, schema);
    this.producedAt = now;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(pkijs.getAlgorithmByOID).mockReset();
  if (originalGetAlgorithmByOID)
    vi.mocked(pkijs.getAlgorithmByOID).mockImplementation(originalGetAlgorithmByOID);
});

describe('CMS trust verifier final low-level revocation branches', () => {
  it('treats a parsed OCSP CertID with an unrecognized hash OID as unavailable', async () => {
    vi.spyOn(pkijs.BasicOCSPResponse.prototype, 'verify').mockResolvedValue(true as never);
    forceParsedOcspProducedAt();
    vi.spyOn(pkijs.OCSPResponse.prototype, 'getCertificateStatus').mockResolvedValue({
      isForCertificate: true,
      status: 0,
    } as never);
    vi.mocked(pkijs.getAlgorithmByOID).mockImplementation((oid) =>
      oid === '1.2.3.4.999' ? {} as never : originalGetAlgorithmByOID!(oid));
    const response = rewriteOcsp((basic) => {
      withCurrentOcspTimes(basic);
      basic.tbsResponseData.responses[0]!.certID.hashAlgorithm.algorithmId = '1.2.3.4.999';
    });

    await expect(verifier({ fetchOcsp: async () => response }).verifySignedArtifact(input()))
      .rejects.toMatchObject({
        name: 'SignatureTrustUnavailableError',
        message: 'Revocation evidence not current',
      });
  });

  it('treats a fresh matching OCSP response with unknown certificate status as unavailable', async () => {
    vi.spyOn(pkijs.BasicOCSPResponse.prototype, 'verify').mockResolvedValue(true as never);
    forceParsedOcspProducedAt();
    vi.spyOn(pkijs.OCSPResponse.prototype, 'getCertificateStatus').mockResolvedValue({
      isForCertificate: true,
      status: 2,
    } as never);
    const response = rewriteOcsp(withCurrentOcspTimes);

    await expect(verifier({ fetchOcsp: async () => response }).verifySignedArtifact(input()))
      .rejects.toMatchObject({
        name: 'SignatureTrustUnavailableError',
        message: 'Revocation evidence not current',
      });
  });

  it('treats a correctly signed current CRL without nextUpdate as unavailable', async () => {
    vi.spyOn(pkijs.CertificateRevocationList.prototype, 'verify').mockResolvedValue(true as never);
    const source = Buffer.from(bytes('root.crl.der'));
    const parsed = asn1js.fromBER(der(source));
    const crl = new pkijs.CertificateRevocationList({ schema: parsed.result });
    crl.thisUpdate.value = new Date('2026-09-28T15:43:19.000Z');
    crl.nextUpdate = undefined;
    const withoutNextUpdate = Buffer.from(crl.toSchema().toBER(false));

    await expect(verifier({ fetchCrl: async () => withoutNextUpdate }).verifySignedArtifact({
      ...input(),
      profile: { ...input().profile, revocation: 'crl' as const },
    })).rejects.toMatchObject({
      name: 'SignatureTrustUnavailableError',
      message: 'Revocation evidence not current',
    });
  });
});
