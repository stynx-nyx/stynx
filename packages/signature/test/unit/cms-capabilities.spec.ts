import { createCmsTrustVerifier, isCmsTrustVerifier } from '../../src';
import {
  bltCmsSignature,
  bltSignedDocument,
  bltSourceDocument,
  cmsSignature,
  certificate,
  now,
  profile,
  rootPem,
  signedDocument,
  sourceDocument,
} from '../fixtures/trust';

describe('createCmsTrustVerifier capabilities', () => {
  it('returns STYNX owned capabilities under a valid local clock', async () => {
    const verifier = createCmsTrustVerifier({ trustAnchorsPem: [rootPem], now: () => now });
    expect(isCmsTrustVerifier(verifier)).toBe(true);
    await expect(verifier.capabilities(profile)).resolves.toMatchObject({
      simulated: false,
      pades: true,
      tsa: true,
      lta: false,
      certificateValidation: ['ocsp', 'crl'],
      evidenceSource: 'stynx-cms',
      checkedAt: now,
    });
  });

  it.each([
    ['no verifier anchors', { trustAnchorsPem: [] }, profile],
    ['no profile anchors', { trustAnchorsPem: [rootPem] }, { ...profile, trustAnchorsPem: [] }],
    ['invalid clock', { trustAnchorsPem: [rootPem], now: () => new Date(0) }, profile],
  ])('fails closed with %s', async (_label, options, selected) => {
    const verifier = createCmsTrustVerifier(options);
    await expect(verifier.capabilities(selected)).rejects.toMatchObject({
      name: 'SignatureCapabilityError',
    });
  });

  it('requires and validates an authenticated production readiness challenge', async () => {
    const production = { ...profile, environment: 'production' };
    const noChallenge = createCmsTrustVerifier({ trustAnchorsPem: [rootPem], now: () => now });
    await expect(noChallenge.capabilities(production)).rejects.toThrow(
      'Authenticated readiness challenge unavailable',
    );

    const mismatched = createCmsTrustVerifier({
      trustAnchorsPem: [rootPem],
      now: () => now,
      readinessChallenge: async () => ({
        profile: { ...production, id: 'different' },
      } as never),
    });
    await expect(mismatched.capabilities(production)).rejects.toThrow(
      'Authenticated readiness challenge failed',
    );

    const validChallenge = createCmsTrustVerifier({
      trustAnchorsPem: [rootPem],
      tsaTrustAnchorsPem: [rootPem],
      acceptedPolicies: profile.acceptedPolicies,
      now: () => now,
      readinessChallenge: async () => ({
        tenantId: 'tenant-a', originalDocument: bltSourceDocument,
        signedDocument: bltSignedDocument, cmsSignature: bltCmsSignature,
        certificate, profile: production,
      }),
    });
    await expect(validChallenge.capabilities(production)).resolves.toMatchObject({
      simulated: false, pades: true, tsa: true, evidenceSource: 'stynx-cms', checkedAt: now,
    });
  });

  it('rejects trust artifacts before PKI and wraps an unexpected verifier dependency failure', async () => {
    const noAnchors = createCmsTrustVerifier({ trustAnchorsPem: [] });
    const input = {
      tenantId: 'tenant-a',
      originalDocument: sourceDocument,
      signedDocument,
      cmsSignature,
      certificate: { subject: '', issuer: '', serialNumber: '' },
      profile,
    };
    await expect(noAnchors.verifySignedArtifact(input)).rejects.toThrow('No matching trust anchor');

    const verifier = createCmsTrustVerifier({ trustAnchorsPem: [rootPem] });
    await expect(verifier.verifySignedArtifact(input)).rejects.toThrow('Signer certificate absent');
    await expect(verifier.verifySignedArtifact({
      ...input,
      certificate: { subject: '', issuer: '', serialNumber: '', pem: rootPem },
      signedDocument: Buffer.from('not a PDF'),
    })).rejects.toThrow('Signed PDF required');

    const brokenClock = createCmsTrustVerifier({
      trustAnchorsPem: [rootPem],
      now: () => { throw new Error('clock source failed'); },
    });
    await expect(brokenClock.verifySignedArtifact({
      ...input,
      signedDocument: bltSignedDocument,
      cmsSignature: bltCmsSignature,
      originalDocument: bltSourceDocument,
    })).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'Cryptographic trust evidence is invalid',
    });
  });
});
