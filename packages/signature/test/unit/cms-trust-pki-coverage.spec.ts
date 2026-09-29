import { describe, expect, it, vi } from 'vitest';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import {
  bltCmsSignature,
  bltSignedDocument,
  bltSourceDocument,
  bytes,
  certificate,
  now,
  profile,
  rootPem,
} from '../fixtures/trust';
import { createCmsTrustVerifier, SignatureTrustUnavailableError } from '../../src';
import { readPdfTrustEvidence } from '../../src/pdf-trust-evidence';

const verifier = (overrides: Record<string, unknown> = {}) => createCmsTrustVerifier({
  trustAnchorsPem: [rootPem],
  tsaTrustAnchorsPem: [rootPem],
  acceptedPolicies: profile.acceptedPolicies,
  now: () => now,
  ...overrides,
});

const input = (changes: Record<string, unknown> = {}) => ({
  tenantId: 'tenant-pki-coverage',
  originalDocument: bytes('pades-bt-source.pdf'),
  signedDocument: bytes('pades-bt-blt.pdf'),
  cmsSignature: bytes('pades-bt-blt.cms.der'),
  certificate,
  profile: { ...profile, requiredPadesProfile: 'PAdES-B-T' as const },
  ...changes,
});

const archivalEvidence = async (pdfName = 'pades-blt.pdf', cmsName = 'pades-blt.cms.der') => {
  const signedPdf = bytes(pdfName);
  const cms = bytes(cmsName);
  const pdf = Buffer.from(signedPdf);
  const byteRange = /\/ByteRange\s*\[\s*\d+\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/u.exec(pdf.toString('latin1'));
  if (!byteRange) throw new Error('PAdES fixture has no ByteRange');
  const revisionEnd = Number(byteRange[2]) + Number(byteRange[3]);
  return readPdfTrustEvidence(signedPdf, revisionEnd, cms);
};

const cmsWithNonCmsTimestamp = (): Buffer => {
  const cms = Buffer.from(bltCmsSignature);
  const timestampAttribute = Buffer.from('060b2a864886f70d010910020e', 'hex');
  const attributeStart = cms.indexOf(timestampAttribute);
  if (attributeStart < 0) throw new Error('PAdES CMS has no signature timestamp attribute');
  const signedDataOid = Buffer.from('06092a864886f70d010702', 'hex');
  const oidStart = cms.indexOf(signedDataOid, attributeStart + timestampAttribute.length);
  if (oidStart < 0) throw new Error('Timestamp attribute has no SignedData content type');
  // id-data has the same DER length as id-signedData, leaving the enclosing
  // unsigned attribute and the signer signature untouched.
  cms[oidStart + signedDataOid.length - 1] = 0x01;
  return cms;
};

const signedPdfWithCms = (cms: Uint8Array): Buffer => {
  const pdf = Buffer.from(bltSignedDocument);
  const start = pdf.indexOf(Buffer.from('/Contents <', 'latin1')) + Buffer.byteLength('/Contents <');
  const end = pdf.indexOf('>'.charCodeAt(0), start);
  const encoded = Buffer.from(cms).toString('hex');
  if (start < 0 || end < start || encoded.length > end - start)
    throw new Error('Mutated CMS does not fit the PAdES placeholder');
  pdf.fill('0'.charCodeAt(0), start, end);
  pdf.write(encoded, start, 'latin1');
  return pdf;
};

describe('CMS trust verifier online PKI evidence paths', () => {
  it('authenticates online OCSP and CRL evidence for a B-T signature and keeps the achieved profile at B-T', async () => {
    const archive = await archivalEvidence();
    const fetchOcsp = vi.fn(async (context: { certificate: pkijs.Certificate; issuer: pkijs.Certificate }) => {
      for (const evidence of archive.ocsp) {
        const parsed = asn1js.fromBER(evidence.buffer.slice(
          evidence.byteOffset, evidence.byteOffset + evidence.byteLength,
        ));
        const response = new pkijs.OCSPResponse({ schema: parsed.result });
        if ((await response.getCertificateStatus(context.certificate, context.issuer)).isForCertificate)
          return evidence;
      }
      return undefined;
    });
    const fetchCrl = vi.fn(async (context: { certificate: pkijs.Certificate; issuer: pkijs.Certificate }) => {
      for (const evidence of archive.crls) {
        const parsed = asn1js.fromBER(evidence.buffer.slice(
          evidence.byteOffset, evidence.byteOffset + evidence.byteLength,
        ));
        const crl = new pkijs.CertificateRevocationList({ schema: parsed.result });
        if (crl.issuer.isEqual(context.issuer.subject)) return evidence;
      }
      return undefined;
    });

    const result = await verifier({ fetchOcsp, fetchCrl }).verifySignedArtifact(input());

    expect(result).toMatchObject({
      padesProfile: 'PAdES-B-T',
      revocationSource: 'ocsp',
      achievedLevel: 'ADVANCED',
    });
    expect(fetchOcsp).toHaveBeenCalledWith(expect.objectContaining({
      certificate: expect.any(pkijs.Certificate),
      issuer: expect.any(pkijs.Certificate),
      signedDocument: input().signedDocument,
      signerInfo: expect.any(pkijs.SignerInfo),
    }));
    expect(fetchCrl).toHaveBeenCalledWith(expect.objectContaining({
      certificate: expect.any(pkijs.Certificate),
      issuer: expect.any(pkijs.Certificate),
      signedDocument: input().signedDocument,
      signerInfo: expect.any(pkijs.SignerInfo),
    }));
    // The verifier fetches status for both the signer and TSA certificate paths.
    expect(fetchOcsp.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('reports unavailable evidence when online fetchers return no applicable status', async () => {
    const fetchOcsp = vi.fn(async () => undefined);
    const fetchCrl = vi.fn(async () => undefined);

    await expect(verifier({ fetchOcsp, fetchCrl }).verifySignedArtifact(input()))
      .rejects.toBeInstanceOf(SignatureTrustUnavailableError);
    expect(fetchOcsp).toHaveBeenCalledWith(expect.objectContaining({
      certificate: expect.any(pkijs.Certificate),
      issuer: expect.any(pkijs.Certificate),
      signedDocument: input().signedDocument,
      signerInfo: expect.any(pkijs.SignerInfo),
    }));
    expect(fetchCrl).toHaveBeenCalledWith(expect.objectContaining({
      certificate: expect.any(pkijs.Certificate),
      issuer: expect.any(pkijs.Certificate),
      signedDocument: input().signedDocument,
      signerInfo: expect.any(pkijs.SignerInfo),
    }));
  });

  it('rejects a timestamp unsigned attribute whose value is not an RFC 3161 CMS token', async () => {
    const cms = cmsWithNonCmsTimestamp();

    await expect(verifier().verifySignedArtifact(input({
      originalDocument: bltSourceDocument,
      signedDocument: signedPdfWithCms(cms),
      cmsSignature: cms,
    }))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'Embedded timestamp is not CMS',
    });
  });

  it('rejects a cryptographically valid B-T signer when online status proves revocation', async () => {
    const archive = await archivalEvidence('pades-revoked-ocsp-blt.pdf', 'pades-revoked-ocsp-blt.cms.der');
    await expect(verifier({
      fetchOcsp: async (context: { certificate: pkijs.Certificate; issuer: pkijs.Certificate }) => {
        for (const evidence of archive.ocsp) {
          const parsed = asn1js.fromBER(evidence.buffer.slice(
            evidence.byteOffset, evidence.byteOffset + evidence.byteLength,
          ));
          const response = new pkijs.OCSPResponse({ schema: parsed.result });
          if ((await response.getCertificateStatus(context.certificate, context.issuer)).isForCertificate)
            return evidence;
        }
        return undefined;
      },
      fetchCrl: async () => bytes('root.crl.der'),
    }).verifySignedArtifact(input({
      profile: { ...profile, requiredPadesProfile: 'PAdES-B-T' as const, revocation: 'ocsp' as const },
    }))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'Certificate revoked',
    });
  });

  it('does not accept a policy from verifier defaults when the certificate lacks an accepted policy', async () => {
    await expect(verifier({ fetchOcsp: async () => bytes('ocsp-good.der'),
      fetchCrl: async () => bytes('root.crl.der') }).verifySignedArtifact(input({
      profile: { ...profile, requiredPadesProfile: 'PAdES-B-T' as const, acceptedPolicies: ['9.9.9'] },
    }))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'Certificate policy is not accepted',
    });
  });

  it('validates the signer path at the declared signing time when no trusted timestamp policy is selected', async () => {
    const result = await verifier({
      fetchOcsp: async () => bytes('ocsp-good.der'),
      fetchCrl: async () => bytes('root.crl.der'),
    }).verifySignedArtifact(input({
      originalDocument: bltSourceDocument,
      signedDocument: bltSignedDocument,
      cmsSignature: bltCmsSignature,
      profile: { ...profile, requiredPadesProfile: 'PAdES-B-T' as const, atTime: undefined },
    }));

    expect(result.certificateValidatedAt).toEqual(result.signedAt);
  });
});
