import { bytes, certificate, now, profile, rootPem } from '../fixtures/trust';
import { createCmsTrustVerifier } from '../../src';

const bTInput = () => ({
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
  fetchTsa: undefined,
  fetchOcsp: undefined,
  fetchCrl: undefined,
  ...overrides,
});

const responseStatusOnly = (status: number) => Buffer.from([0x30, 0x03, 0x0a, 0x01, status]);

const withAlternateCrlIssuer = () => {
  const crl = Buffer.from(bytes('root.crl.der'));
  const distinguishedName = Buffer.from('STYNX Test Trust Root', 'ascii');
  const nameOffset = crl.indexOf(distinguishedName);
  if (nameOffset < 0) throw new Error('Root CRL issuer name not found');
  crl[nameOffset + distinguishedName.length - 1] = 'X'.charCodeAt(0);
  return crl;
};

const withCorruptedCrlSignature = () => {
  const crl = Buffer.from(bytes('root.crl.der'));
  crl[crl.length - 1] = crl[crl.length - 1]! ^ 1;
  return crl;
};

describe('CMS OCSP and CRL evidence boundaries', () => {
  it('classifies an OCSP tryLater response as unavailable', async () => {
    await expect(verifier({ fetchOcsp: async () => responseStatusOnly(3) })
      .verifySignedArtifact(bTInput())).rejects.toMatchObject({
        name: 'SignatureTrustUnavailableError',
        message: 'Revocation evidence not current',
      });
  });

  it('rejects a successful OCSP status without responseBytes', async () => {
    await expect(verifier({ fetchOcsp: async () => responseStatusOnly(0) })
      .verifySignedArtifact(bTInput())).rejects.toMatchObject({
        name: 'SignatureTrustError',
        message: 'OCSP response invalid',
      });
  });

  it('ignores a correctly signed OCSP response for a different certificate ID', async () => {
    await expect(verifier({ fetchOcsp: async () => bytes('ocsp-unknown.der') })
      .verifySignedArtifact(bTInput())).rejects.toMatchObject({
        name: 'SignatureTrustUnavailableError',
        message: 'Revocation evidence unavailable',
      });
  });

  it('rejects a signed OCSP response from an unauthorized responder', async () => {
    await expect(verifier().verifySignedArtifact({
      ...bTInput(),
      originalDocument: bytes('pades-bad-responder-source.pdf'),
      signedDocument: bytes('pades-bad-responder-blt.pdf'),
      cmsSignature: bytes('pades-bad-responder-blt.cms.der'),
      profile: { ...profile, revocation: 'ocsp' as const },
    })).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'OCSP signature invalid',
    });
  });

  it('rejects a revoked certificate from a correctly signed OCSP response', async () => {
    await expect(verifier().verifySignedArtifact({
      ...bTInput(),
      originalDocument: bytes('pades-revoked-ocsp-source.pdf'),
      signedDocument: bytes('pades-revoked-ocsp-blt.pdf'),
      cmsSignature: bytes('pades-revoked-ocsp-blt.cms.der'),
      profile: { ...profile, revocation: 'ocsp' as const },
    })).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'Certificate revoked',
    });
  });

  it('skips a CRL whose issuer does not match the certificate issuer', async () => {
    await expect(verifier({
      fetchCrl: async () => withAlternateCrlIssuer(),
    }).verifySignedArtifact({
      ...bTInput(),
      profile: { ...profile, requiredPadesProfile: 'PAdES-B-T' as const, revocation: 'crl' as const },
    })).rejects.toMatchObject({
      name: 'SignatureTrustUnavailableError',
      message: 'Revocation evidence unavailable',
    });
  });

  it('rejects a CRL with a matching issuer and invalid signature', async () => {
    await expect(verifier({
      fetchCrl: async () => withCorruptedCrlSignature(),
    }).verifySignedArtifact({
      ...bTInput(),
      profile: { ...profile, requiredPadesProfile: 'PAdES-B-T' as const, revocation: 'crl' as const },
    })).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'CRL signature invalid',
    });
  });
});
