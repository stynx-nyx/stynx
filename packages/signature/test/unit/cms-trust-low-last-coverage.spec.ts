import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCmsTrustVerifier } from '../../src';
import { bytes, certificate, now, profile, rootPem } from '../fixtures/trust';

const controls = vi.hoisted(() => ({ forceOnlineRevocation: false }));

vi.mock('../../src/pdf-trust-evidence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/pdf-trust-evidence')>();
  return {
    ...actual,
    readPdfTrustEvidence: async (...args: Parameters<typeof actual.readPdfTrustEvidence>) => {
      const evidence = await actual.readPdfTrustEvidence(...args);
      return controls.forceOnlineRevocation
        ? { ...evidence, ocsp: [], crls: [], vriOcsp: [], vriCrls: [] }
        : evidence;
    },
  };
});

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

const enableOnlineRevocation = () => { controls.forceOnlineRevocation = true; };

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
  const basicSchema = basic.toSchema();
  basicSchema.valueBlock.value[0] = basic.tbsResponseData.toSchema(true);
  responseBytes.response = new asn1js.OctetString({ valueHex: basicSchema.toBER(false) });
  return Buffer.from(response.toSchema().toBER(false));
};

const withCurrentOcspTimes = (basic: pkijs.BasicOCSPResponse): void => {
  basic.tbsResponseData.producedAt = now;
  const response = basic.tbsResponseData.responses[0];
  if (!response) throw new Error('Fixture OCSP response has no SingleResponse');
  response.thisUpdate = new Date('2026-09-28T17:20:00.000Z');
  response.nextUpdate = new Date('2026-09-29T11:59:00.000Z');
};

const forceParsedOcspProducedAt = (): void => {
  const original = pkijs.ResponseData.prototype.fromSchema;
  vi.spyOn(pkijs.ResponseData.prototype, 'fromSchema').mockImplementation(function (schema) {
    original.call(this, schema);
    this.producedAt = now;
  });
};

afterEach(() => {
  controls.forceOnlineRevocation = false;
  vi.restoreAllMocks();
  vi.mocked(pkijs.getAlgorithmByOID).mockReset();
  if (originalGetAlgorithmByOID)
    vi.mocked(pkijs.getAlgorithmByOID).mockImplementation(originalGetAlgorithmByOID);
});

describe('CMS trust verifier final low-level revocation branches', () => {
  it('treats an OCSP CertID whose hash algorithm has no resolver name as unavailable', async () => {
    enableOnlineRevocation();
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

    const fetchOcsp = vi.fn(async () => response);
    await expect(verifier({ fetchOcsp }).verifySignedArtifact(input()))
      .rejects.toMatchObject({
        name: 'SignatureTrustUnavailableError',
        message: 'Revocation evidence not current',
      });
    expect(fetchOcsp).toHaveBeenCalledWith(expect.objectContaining({
      certificate: expect.any(pkijs.Certificate),
      issuer: expect.any(pkijs.Certificate),
      signedDocument: input().signedDocument,
      signerInfo: expect.any(pkijs.SignerInfo),
    }));
    expect(pkijs.getAlgorithmByOID).toHaveBeenCalledWith('1.2.3.4.999');
  });

  it('treats a fresh matching OCSP response with unknown certificate status as unavailable', async () => {
    enableOnlineRevocation();
    vi.spyOn(pkijs.BasicOCSPResponse.prototype, 'verify').mockResolvedValue(true as never);
    forceParsedOcspProducedAt();
    vi.spyOn(pkijs.OCSPResponse.prototype, 'getCertificateStatus').mockResolvedValue({
      isForCertificate: true,
      status: 2,
    } as never);
    const response = rewriteOcsp(withCurrentOcspTimes);

    const fetchOcsp = vi.fn(async () => response);
    await expect(verifier({ fetchOcsp }).verifySignedArtifact(input()))
      .rejects.toMatchObject({
        name: 'SignatureTrustUnavailableError',
        message: 'Revocation evidence not current',
      });
    expect(fetchOcsp).toHaveBeenCalledWith(expect.objectContaining({
      certificate: expect.any(pkijs.Certificate),
      issuer: expect.any(pkijs.Certificate),
      signedDocument: input().signedDocument,
      signerInfo: expect.any(pkijs.SignerInfo),
    }));
  });

  const crlWithTimes = (thisUpdate: Date, nextUpdate: Date | undefined): Buffer => {
    const source = Buffer.from(bytes('root.crl.der'));
    const parsed = asn1js.fromBER(der(source));
    const crl = new pkijs.CertificateRevocationList({ schema: parsed.result });
    crl.thisUpdate.value = thisUpdate;
    if (nextUpdate) {
      if (!crl.nextUpdate) throw new Error('Fixture CRL has no nextUpdate');
      crl.nextUpdate.value = nextUpdate;
    } else {
      crl.nextUpdate = undefined;
    }
    return Buffer.from(crl.toSchema(true).toBER(false));
  };

  const expectUnavailableCrl = async (crlBytes: Uint8Array) => {
    enableOnlineRevocation();
    vi.spyOn(pkijs.CertificateRevocationList.prototype, 'verify').mockResolvedValue(true as never);
    const fetchCrl = vi.fn(async () => crlBytes);
    await expect(verifier({ fetchCrl }).verifySignedArtifact({
      ...input(),
      profile: { ...input().profile, revocation: 'crl' as const },
    })).rejects.toMatchObject({
      name: 'SignatureTrustUnavailableError',
      message: 'Revocation evidence not current',
    });
    expect(fetchCrl).toHaveBeenCalledWith(expect.objectContaining({
      certificate: expect.any(pkijs.Certificate),
      issuer: expect.any(pkijs.Certificate),
      signedDocument: input().signedDocument,
      signerInfo: expect.any(pkijs.SignerInfo),
    }));
  };

  it('treats a CRL without nextUpdate as unavailable', async () => {
    await expectUnavailableCrl(crlWithTimes(new Date('2026-09-28T17:20:00.000Z'), undefined));
  });

  it('treats a CRL issued more than five minutes in the future as unavailable', async () => {
    await expectUnavailableCrl(crlWithTimes(
      new Date('2026-09-29T12:10:00.000Z'),
      new Date('2026-09-29T13:10:00.000Z'),
    ));
  });

  it('treats a CRL with nextUpdate before the trusted time as unavailable', async () => {
    await expectUnavailableCrl(crlWithTimes(
      new Date('2026-09-28T17:20:00.000Z'),
      new Date('2026-09-28T17:12:00.000Z'),
    ));
  });

  it('deduplicates a certificate shared by the signer and timestamp trust paths', async () => {
    enableOnlineRevocation();
    const signedData = new pkijs.ContentInfo({ schema: asn1js.fromBER(der(bytes('pades-bt-blt.cms.der'))).result });
    const cms = new pkijs.SignedData({ schema: signedData.content });
    const sharedSigner = cms.certificates.find((item) => item instanceof pkijs.Certificate &&
      item.serialNumber.valueBlock.toString() === '1001');
    if (!(sharedSigner instanceof pkijs.Certificate)) throw new Error('Fixture signer certificate absent');
    vi.spyOn(pkijs.BasicOCSPResponse.prototype, 'verify').mockResolvedValue(true as never);
    forceParsedOcspProducedAt();
    vi.spyOn(pkijs.OCSPResponse.prototype, 'getCertificateStatus').mockResolvedValue({
      isForCertificate: true,
      status: 0,
    } as never);
    vi.spyOn(pkijs.CertID.prototype, 'isEqual').mockReturnValue(true);
    const response = rewriteOcsp(withCurrentOcspTimes);
    const originalVerify = pkijs.SignedData.prototype.verify;
    const verify = vi.spyOn(pkijs.SignedData.prototype, 'verify').mockImplementation(
      async function (this: pkijs.SignedData, options) {
        const result = await originalVerify.call(this, options);
        if (options?.checkChain && this.encapContentInfo.eContentType === '1.2.840.113549.1.9.16.1.4') {
          return { ...result, certificatePath: [sharedSigner, ...result.certificatePath.slice(1)] };
        }
        return result;
      },
    );
    try {
      await expect(verifier({ fetchOcsp: async () => response }).verifySignedArtifact(input())).resolves.toMatchObject({
        verifierKind: 'stynx-cms',
        padesProfile: 'PAdES-B-T',
      });
      expect(verify).toHaveBeenCalledWith(expect.objectContaining({
        signer: 0,
        data: expect.any(ArrayBuffer),
        trustedCerts: expect.any(Array),
        checkChain: true,
        checkDate: expect.any(Date),
        extendedMode: true,
      }));
    } finally {
      verify.mockRestore();
    }
  });
});
