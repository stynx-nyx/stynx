import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { createCmsTrustVerifier } from '../../src/cms-trust-verifier';
import type { SignatureTrustProfile } from '../../src/types';
import { ltaDigest } from '../support/lta-fixture';

const directory = join(__dirname, '../fixtures/lta-inspector');
const bytes = (name: string) => readFileSync(join(directory, name));
const provenance = JSON.parse(bytes('provenance.json').toString('utf8'));
const archiveAt = new Date(provenance.archiveAt);
const roots = [
  'signer-root.cert.pem',
  'signature-tsa-root.cert.pem',
  'archive-tsa-root.cert.pem',
].map((name) => bytes(name).toString('utf8'));
const profile: SignatureTrustProfile = {
  id: 'independent-fresh-lta',
  revision: '1',
  environment: 'test',
  minimumSignatureLevel: 'ADVANCED',
  requiredPadesProfile: 'PAdES-B-LTA',
  requireLta: true,
  requireTsa: true,
  revocation: 'crl',
  trustAnchorsPem: roots,
  atTime: 'trusted-timestamp',
};
const input = (name: string) => ({
  tenantId: 'tenant-test',
  originalDocument: bytes('source.pdf'),
  signedDocument: bytes(name),
  cmsSignature: bytes('signature.cms.der'),
  certificate: {
    subject: 'TEST signer',
    issuer: 'TEST root',
    serialNumber: '03E9',
    pem: bytes('signer.cert.pem').toString('utf8'),
  },
  profile,
});
const verifier = (now = archiveAt) =>
  createCmsTrustVerifier({
    trustAnchorsPem: roots,
    tsaTrustAnchorsPem: [roots[1]!],
    archiveTsaTrustAnchorsPem: [roots[2]!],
    now: () => now,
  });
const negatives = provenance.files.filter((file: { negative?: string }) => file.negative) as {
  path: string;
  sha256: string;
  bytes: number;
  cryptographicTokenSignatureVerified: boolean;
}[];

describe('fresh Inspector cryptographically signed alternative timestamp semantics', () => {
  it.each(
    provenance.files.filter(
      (file: { positive?: string }) => file.positive && file.positive !== 'positive-max-clock-skew',
    ),
  )('accepts the compatible authenticated token variant $path', async (file: { path: string }) => {
    expect(await verifier().verifySignedArtifact(input(file.path))).toMatchObject({
      lta: true,
      archiveAt,
      certificateValidatedAt: archiveAt,
    });
  });
  it('binds the complete public corpus with no copied private keys and verifies the independent valid control', async () => {
    expect(ltaDigest(readFileSync(join(__dirname, '../support/generate-lta-variants.mjs')))).toBe(
      provenance.generatorSha256,
    );
    expect(ltaDigest(readFileSync(join(__dirname, '../support/generate-lta-pki.py')))).toBe(
      provenance.seedBuilderSha256,
    );
    expect(readdirSync(directory).sort()).toEqual(
      [...provenance.files.map((file: { path: string }) => file.path), 'provenance.json'].sort(),
    );
    for (const file of provenance.files) {
      expect(ltaDigest(bytes(file.path))).toBe(file.sha256);
      expect(bytes(file.path).length).toBe(file.bytes);
      expect(bytes(file.path).includes(Buffer.from('PRIVATE KEY'))).toBe(false);
    }
    expect(await verifier().verifySignedArtifact(input('minimal-lta.pdf'))).toMatchObject({
      padesProfile: 'PAdES-B-LTA',
      lta: true,
      archiveAt,
      certificateValidatedAt: archiveAt,
    });
  });
  it.each(negatives)(
    'refuses the cryptographically signed $path semantic negative',
    async (file) => {
      const pdf = bytes(file.path);
      const ranges = [
        ...pdf.toString('latin1').matchAll(/\/ByteRange\s*\[(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\]/gu),
      ];
      const range = ranges.at(-1)!.slice(1).map(Number);
      const padded = Buffer.from(
        pdf.subarray(range[1]! + 1, range[2]! - 1).toString('ascii'),
        'hex',
      );
      const decoded = asn1js.fromBER(padded);
      expect(decoded.offset).toBeGreaterThan(0);
      const token = new pkijs.SignedData({
        schema: new pkijs.ContentInfo({ schema: decoded.result }).content,
      });
      const signer = token
        .certificates!.filter(
          (certificate): certificate is pkijs.Certificate =>
            certificate instanceof pkijs.Certificate,
        )
        .find((certificate) =>
          certificate.serialNumber.isEqual(
            (token.signerInfos[0]!.sid as pkijs.IssuerAndSerialNumber).serialNumber,
          ),
        )!;
      const info = token.signerInfos[0]!;
      expect(
        await pkijs
          .getCrypto(true)
          .verifyWithPublicKey(
            info.signedAttrs!.encodedValue,
            info.signature,
            signer.subjectPublicKeyInfo,
            info.signatureAlgorithm,
          ),
      ).toBe(true);
      expect(file.cryptographicTokenSignatureVerified).toBe(true);
      await expect(verifier().verifySignedArtifact(input(file.path))).rejects.toMatchObject({
        name: 'SignatureTrustError',
      });
    },
  );
  it('accepts exactly the inherited five-minute archive-token clock allowance with all other evidence applicable', async () => {
    expect(
      await verifier().verifySignedArtifact(input('positive-max-clock-skew.pdf')),
    ).toMatchObject({
      padesProfile: 'PAdES-B-LTA',
      lta: true,
      archiveAt: new Date(archiveAt.getTime() + 300000),
      certificateValidatedAt: new Date(archiveAt.getTime() + 300000),
    });
  });
  it('requires current archive status even though covered historical signer and signature-TSA evidence remains applicable', async () => {
    await expect(
      verifier(new Date(archiveAt.getTime() + 1000)).verifySignedArtifact(input('minimal-lta.pdf')),
    ).rejects.toMatchObject({ name: 'SignatureTrustUnavailableError' });
  });
  it('refuses an archive TSA expired now instead of validating its path only at token time', async () => {
    await expect(
      verifier(new Date(archiveAt.getTime() + 31 * 86400000)).verifySignedArtifact(
        input('minimal-lta.pdf'),
      ),
    ).rejects.toMatchObject({ name: 'SignatureTrustError' });
  });
});

const statusScenarios = provenance.files.filter(
  (file: { statusScenario?: string }) => file.statusScenario,
) as {
  path: string;
  expected: 'pass' | 'refuse';
  mode: SignatureTrustProfile['revocation'];
  authenticatedArchiveSignature: boolean;
  archiveAt: string;
  cmsPath?: string;
  certPath?: string;
  errorMessage?: string;
}[];
it.each(statusScenarios)(
  'authenticates the full changed DSS before enforcing historical status scenario $path',
  async (file) => {
    const pdf = bytes(file.path);
    const ranges = [
      ...pdf.toString('latin1').matchAll(/\/ByteRange\s*\[(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\]/gu),
    ];
    const range = ranges.at(-1)!.slice(1).map(Number);
    const padded = Buffer.from(pdf.subarray(range[1]! + 1, range[2]! - 1).toString('ascii'), 'hex');
    const parsed = asn1js.fromBER(padded);
    const archive = new pkijs.SignedData({
      schema: new pkijs.ContentInfo({ schema: parsed.result }).content,
    });
    const covered = Buffer.concat([pdf.subarray(0, range[1]), pdf.subarray(range[2])]);
    expect(
      (await archive.verify({ signer: 0, data: covered, checkChain: false, extendedMode: true }))
        .signatureVerified,
    ).toBe(true);
    expect(file.authenticatedArchiveSignature).toBe(true);
    const at = new Date(file.archiveAt);
    const current = { ...input(file.path), profile: { ...profile, revocation: file.mode } };
    if (file.cmsPath) {
      current.cmsSignature = bytes(file.cmsPath);
      const approvalRange = ranges[0]!.slice(1).map(Number);
      const approval = new pkijs.SignedData({
        schema: new pkijs.ContentInfo({ schema: asn1js.fromBER(current.cmsSignature).result })
          .content,
      });
      const approvalBytes = Buffer.concat([
        pdf.subarray(0, approvalRange[1]),
        pdf.subarray(approvalRange[2], approvalRange[2]! + approvalRange[3]!),
      ]);
      expect(
        (
          await approval.verify({
            signer: 0,
            data: approvalBytes,
            checkChain: false,
            extendedMode: true,
          })
        ).signatureVerified,
      ).toBe(true);
    }
    if (file.certPath) current.certificate.pem = bytes(file.certPath).toString('utf8');
    if (file.certPath?.startsWith('path-signer-')) {
      const leaf = new pkijs.Certificate({
        schema: asn1js.fromBER(
          Buffer.from(current.certificate.pem.replace(/-----[^-]+-----|\s/gu, ''), 'base64'),
        ).result,
      });
      const anchor = new pkijs.Certificate({
        schema: asn1js.fromBER(Buffer.from(roots[0]!.replace(/-----[^-]+-----|\s/gu, ''), 'base64'))
          .result,
      });
      expect(leaf.notAfter.value.getTime()).toBeLessThan(at.getTime());
      expect(
        (
          await new pkijs.CertificateChainValidationEngine({
            trustedCerts: [anchor],
            certs: [leaf],
            checkDate: archiveAt,
          }).verify()
        ).result,
      ).toBe(true);
      expect(
        (
          await new pkijs.CertificateChainValidationEngine({
            trustedCerts: [anchor],
            certs: [leaf],
            checkDate: at,
          }).verify()
        ).result,
      ).toBe(false);
    }
    const check = file.cmsPath
      ? createCmsTrustVerifier({
          trustAnchorsPem: roots,
          tsaTrustAnchorsPem: [roots[1]!],
          archiveTsaTrustAnchorsPem: [roots[2]!],
          now: () => at,
          fetchCrl: async () => bytes('current-archive-plus-two-days.crl.der'),
        })
      : verifier();
    if (file.expected === 'pass')
      expect(await check.verifySignedArtifact(current)).toMatchObject({
        padesProfile: 'PAdES-B-LTA',
        lta: true,
        archiveAt: at,
      });
    else
      await expect(check.verifySignedArtifact(current)).rejects.toMatchObject({
        name: expect.stringMatching(/^SignatureTrust(?:Unavailable)?Error$/u),
        ...(file.errorMessage ? { message: file.errorMessage } : {}),
      });
  },
);

it('uses current authenticated archive status while preserving the archive-time validation of historical paths', async () => {
  const fetchCrl = async () => bytes('current-archive-plus-day.crl.der');
  const current = createCmsTrustVerifier({
    trustAnchorsPem: roots,
    tsaTrustAnchorsPem: [roots[1]!],
    archiveTsaTrustAnchorsPem: [roots[2]!],
    now: () => new Date(archiveAt.getTime() + 86400000),
    fetchCrl,
  });
  expect(await current.verifySignedArtifact(input('minimal-lta.pdf'))).toMatchObject({
    padesProfile: 'PAdES-B-LTA',
    lta: true,
    archiveAt,
    certificateValidatedAt: archiveAt,
  });
});
it('refuses actual current archive revocation even when historical signer evidence was good', async () => {
  const current = createCmsTrustVerifier({
    trustAnchorsPem: roots,
    tsaTrustAnchorsPem: [roots[1]!],
    archiveTsaTrustAnchorsPem: [roots[2]!],
    now: () => new Date(archiveAt.getTime() + 86400000),
    fetchCrl: async () => bytes('current-archive-revoked.crl.der'),
  });
  await expect(current.verifySignedArtifact(input('minimal-lta.pdf'))).rejects.toMatchObject({
    name: 'SignatureTrustError',
    message: 'Certificate revoked',
  });
});
it('never rescues missing historical covered DSS status through an online fetcher', async () => {
  let calls = 0;
  const current = createCmsTrustVerifier({
    trustAnchorsPem: roots,
    tsaTrustAnchorsPem: [roots[1]!],
    archiveTsaTrustAnchorsPem: [roots[2]!],
    now: () => archiveAt,
    fetchCrl: async () => {
      calls++;
      return bytes('current-archive-plus-day.crl.der');
    },
  });
  await expect(
    current.verifySignedArtifact(input('historical-missing-signer-status.pdf')),
  ).rejects.toMatchObject({
    name: 'SignatureTrustError',
    message: 'Embedded DSS revocation evidence absent',
  });
  expect(calls).toBe(0);
});
it('refuses an invalid actual verification clock without accepting otherwise authentic LTA bytes', async () => {
  await expect(
    verifier(new Date(NaN)).verifySignedArtifact(input('minimal-lta.pdf')),
  ).rejects.toMatchObject({ name: 'SignatureTrustError', message: 'Verification clock invalid' });
});
it('classifies a failing current archive-status provider as unavailable and never returns historical status as current', async () => {
  const check = createCmsTrustVerifier({
    trustAnchorsPem: roots,
    tsaTrustAnchorsPem: [roots[1]!],
    archiveTsaTrustAnchorsPem: [roots[2]!],
    now: () => new Date(archiveAt.getTime() + 86400000),
    fetchCrl: async () => {
      throw new Error('private provider diagnostic');
    },
  });
  await expect(check.verifySignedArtifact(input('minimal-lta.pdf'))).rejects.toMatchObject({
    name: 'SignatureTrustUnavailableError',
    message: 'Archive TSA revocation evidence unavailable',
  });
});
it('refuses a current archive-status response for another issuer', async () => {
  const check = createCmsTrustVerifier({
    trustAnchorsPem: roots,
    tsaTrustAnchorsPem: [roots[1]!],
    archiveTsaTrustAnchorsPem: [roots[2]!],
    now: () => new Date(archiveAt.getTime() + 86400000),
    fetchOcsp: async () => bytes('signer.ocsp.der'),
  });
  const current = {
    ...input('minimal-lta.pdf'),
    profile: { ...profile, revocation: 'ocsp' as const },
  };
  await expect(check.verifySignedArtifact(current)).rejects.toMatchObject({
    name: 'SignatureTrustUnavailableError',
    message: 'Archive TSA revocation evidence unavailable',
  });
});
