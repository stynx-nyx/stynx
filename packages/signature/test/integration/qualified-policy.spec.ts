import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import * as sig from '../../src';
import {
  bltCmsSignature,
  bltSignedDocument,
  bltSourceDocument,
  bltTimestampResponse,
  bytes,
  certificate,
  hex,
  now,
  profile,
  request,
  rootPem,
  signedResult,
} from '../fixtures/trust';

// UPS-SIG-06: declarative QUALIFIED rule by consumer-supplied certificate policy
// OIDs per profile. The real test-PKI signer carries policy 1.2.3.4.5.6.7.
const signerPolicy = '1.2.3.4.5.6.7';
const create = (overrides: Record<string, unknown> = {}) => sig.createCmsTrustVerifier({
  trustAnchorsPem: [rootPem],
  acceptedPolicies: profile.acceptedPolicies,
  tsaTrustAnchorsPem: [rootPem],
  now: () => now,
  fetchOcsp: async () => bytes('ocsp-good.der'),
  fetchCrl: async () => bytes('root.crl.der'),
  fetchTsa: async () => bltTimestampResponse,
  ...overrides,
});
const input = (profileChanges: Record<string, unknown> = {}) => ({
  tenantId: 'tenant-a',
  originalDocument: bltSourceDocument,
  signedDocument: bltSignedDocument,
  cmsSignature: bltCmsSignature,
  certificate,
  profile: { ...profile, ...profileChanges } as sig.SignatureTrustProfile,
});
const backend = () => ({
  sign: vi.fn().mockResolvedValue(signedResult({
    signedDocument: bltSignedDocument,
    cmsSignature: bltCmsSignature,
    evidence: { ...signedResult().evidence, documentSha256: hex(bltSourceDocument) },
  })),
  verify: vi.fn(),
});
const sign = (verifier: sig.SignatureTrustVerifier, trustProfile: sig.SignatureTrustProfile) =>
  new (sig.SignatureService as any)(backend(), { trustVerifier: verifier, verifier }).sign({
    ...request,
    document: bltSourceDocument,
    documentSha256: hex(bltSourceDocument),
    minimumSignatureLevel: 'QUALIFIED',
    trustProfile,
  });

describe('declarative QUALIFIED certificate policy rule', () => {
  it('attains QUALIFIED from a profile policy OID and satisfies a QUALIFIED minimum', async () => {
    const qualifiedProfile = input({ minimumSignatureLevel: 'QUALIFIED', qualifiedPolicies: [signerPolicy] }).profile;
    const qualifiesCertificate = vi.fn().mockRejectedValue(new Error('not consulted'));
    const proof = await create({ qualifiesCertificate }).verifySignedArtifact(input({ qualifiedPolicies: [signerPolicy] }));
    expect(proof).toMatchObject({ achievedLevel: 'QUALIFIED', qualifiedBy: 'certificate-policy' });
    expect(qualifiesCertificate).not.toHaveBeenCalled();
    const result = await sign(create(), qualifiedProfile);
    expect(result.status).toBe('signed');
    expect(result.evidence).toMatchObject({
      signatureLevel: 'QUALIFIED',
      trustProof: { achievedLevel: 'QUALIFIED', qualifiedBy: 'certificate-policy' },
    });
  });

  it('stays ADVANCED without a matching OID and refuses a QUALIFIED minimum', async () => {
    const proof = await create().verifySignedArtifact(input({ qualifiedPolicies: ['9.9.9'] }));
    expect(proof.achievedLevel).toBe('ADVANCED');
    expect(proof).not.toHaveProperty('qualifiedBy');
    await expect(sign(create(), input({ minimumSignatureLevel: 'QUALIFIED', qualifiedPolicies: ['9.9.9'] }).profile))
      .rejects.toMatchObject({ name: 'SignatureLevelNotMetError' });
  });

  it('evaluates the same certificate per profile with different OID lists', async () => {
    const verifier = create();
    const a = await verifier.verifySignedArtifact(input({ id: 'profile-a', qualifiedPolicies: [signerPolicy] }));
    const b = await verifier.verifySignedArtifact(input({ id: 'profile-b', qualifiedPolicies: ['2.16.76.1.2.3.4'] }));
    expect([a.profileId, a.achievedLevel]).toEqual(['profile-a', 'QUALIFIED']);
    expect([b.profileId, b.achievedLevel]).toEqual(['profile-b', 'ADVANCED']);
  });

  it('falls back to verifier qualifiedPolicies only when the profile omits its own list', async () => {
    const verifier = create({ qualifiedPolicies: [signerPolicy] });
    expect((await verifier.verifySignedArtifact(input())).qualifiedBy).toBe('certificate-policy');
    expect((await verifier.verifySignedArtifact(input({ qualifiedPolicies: [] }))).achievedLevel).toBe('ADVANCED');
    expect((await verifier.verifySignedArtifact(input({ qualifiedPolicies: ['9.9.9'] }))).achievedLevel).toBe('ADVANCED');
  });

  it('consults the predicate when the rule does not qualify and records which rule attained QUALIFIED', async () => {
    const qualifiesCertificate = vi.fn().mockResolvedValue(true);
    const proof = await create({ qualifiesCertificate }).verifySignedArtifact(input({ qualifiedPolicies: ['9.9.9'] }));
    expect(proof).toMatchObject({ achievedLevel: 'QUALIFIED', qualifiedBy: 'consumer-predicate' });
    expect(qualifiesCertificate).toHaveBeenCalledTimes(1);
    expect(qualifiesCertificate.mock.calls[0]?.[1]).toMatchObject({ qualifiedPolicies: ['9.9.9'] });
    const declined = await create({ qualifiesCertificate: async () => false })
      .verifySignedArtifact(input({ qualifiedPolicies: ['9.9.9'] }));
    expect(declined.achievedLevel).toBe('ADVANCED');
    expect(declined).not.toHaveProperty('qualifiedBy');
  });

  it('reports an unavailable predicate without a positive proof when the rule does not qualify', async () => {
    await expect(create({ qualifiesCertificate: async () => { throw new Error('qualification offline'); } })
      .verifySignedArtifact(input({ qualifiedPolicies: ['9.9.9'] }))).rejects.toMatchObject({
      name: 'SignatureTrustUnavailableError',
      message: 'Certificate qualification service unavailable',
    });
  });

  it('keeps 1.5.0 behavior without a rule or predicate', async () => {
    const proof = await create().verifySignedArtifact(input());
    expect(proof.achievedLevel).toBe('ADVANCED');
    expect(proof).not.toHaveProperty('qualifiedBy');
    const viaPredicate = await create({ qualifiesCertificate: async () => true }).verifySignedArtifact(input());
    expect(viaPredicate).toMatchObject({ achievedLevel: 'QUALIFIED', qualifiedBy: 'consumer-predicate' });
  });
});
