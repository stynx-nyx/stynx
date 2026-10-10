import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ltaBytes,
  ltaDigest,
  ltaInput,
  ltaVerifier,
  ltaRoots,
  ltaProfile,
  ltaArchiveAt,
} from '../support/lta-fixture';

describe('independent minimal LTA public TEST packet', () => {
  it('pins every copied public fixture and keeps private key material outside the packet', () => {
    const directory = join(__dirname, '../fixtures/lta');
    const provenance = JSON.parse(readFileSync(join(directory, 'provenance.json'), 'utf8'));
    expect(provenance.classification).toBe(
      'SYNTHETIC TEST ONLY; no actual provider or production policy claim',
    );
    expect(readdirSync(directory).sort()).toEqual(
      [...provenance.files.map((file: { path: string }) => file.path), 'provenance.json'].sort(),
    );
    for (const file of provenance.files) {
      const bytes = ltaBytes(file.path);
      expect(bytes.length).toBe(file.bytes);
      expect(ltaDigest(bytes)).toBe(file.sha256);
      expect(bytes.includes(Buffer.from('PRIVATE KEY'))).toBe(false);
    }
  });
  it.each(['signing-time', 'trusted-timestamp'] as const)(
    'verifies covered evidence at archive time independently of profile.atTime=%s',
    async (atTime) => {
      const input = ltaInput('minimal-lta.pdf', { ...ltaProfile, atTime });
      const result = await ltaVerifier().verifySignedArtifact(input);
      expect(result).toMatchObject({
        verifierKind: 'stynx-cms',
        padesProfile: 'PAdES-B-LTA',
        lta: true,
        archiveAt: ltaArchiveAt,
        certificateValidatedAt: ltaArchiveAt,
        originalDocumentSha256: ltaDigest(input.originalDocument),
        signedDocumentSha256: ltaDigest(input.signedDocument),
        cmsSha256: ltaDigest(input.cmsSignature),
        signerCertificateSha256: ltaDigest(ltaBytes('signer.cert.der')),
        achievedLevel: 'ADVANCED',
        revocationSource: 'crl',
      });
      expect(result.signedAt.getTime()).toBeLessThanOrEqual(result.tsaAt.getTime());
      expect(result.tsaAt.getTime()).toBeLessThanOrEqual(result.archiveAt!.getTime());
    },
  );
  it.each([
    'blt-only.pdf',
    'negative-tampered-archive-token.pdf',
    'negative-tampered-content.pdf',
    'negative-trailing-bytes.pdf',
    'negative-later-metadata.pdf',
    'negative-second-dss.pdf',
    'negative-renewed-timestamp.pdf',
  ])('refuses unsupported or invalid artifact %s without a partial positive', async (name) => {
    await expect(ltaVerifier().verifySignedArtifact(ltaInput(name))).rejects.toMatchObject({
      name: expect.stringMatching(/^Signature(?:Trust|EvidenceMismatch)/u),
    });
  });
  it.each([
    ['absent', []],
    ['signer root', [ltaRoots[0]!]],
    ['signature TSA root', [ltaRoots[1]!]],
  ] as const)(
    'requires explicit matching archive anchors: %s',
    async (_label, archiveTsaTrustAnchorsPem) => {
      await expect(
        ltaVerifier({ archiveTsaTrustAnchorsPem }).verifySignedArtifact(ltaInput()),
      ).rejects.toMatchObject({ name: 'SignatureTrustError' });
    },
  );
  it('keeps the archive shape refused for an ordinary non-LTA profile', async () => {
    await expect(
      ltaVerifier().verifySignedArtifact(
        ltaInput('minimal-lta.pdf', {
          ...ltaProfile,
          requireLta: false,
          requiredPadesProfile: 'PAdES-B-LT',
        }),
      ),
    ).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'Post-signature modification',
    });
  });
  it('does not turn test anchor configuration alone into verified LTA readiness', async () => {
    expect(await ltaVerifier().capabilities(ltaProfile)).toMatchObject({
      lta: false,
      simulated: false,
      evidenceSource: 'stynx-cms',
    });
  });
  it('refuses a real advanced-only challenge for a qualified production profile', async () => {
    const profile = {
      ...ltaProfile,
      environment: 'production' as const,
      minimumSignatureLevel: 'QUALIFIED' as const,
    };
    await expect(
      ltaVerifier({
        readinessChallenge: async () => ltaInput('minimal-lta.pdf', profile),
      }).capabilities(profile),
    ).rejects.toMatchObject({
      name: 'SignatureCapabilityError',
      message: 'Authenticated readiness challenge failed',
    });
  });
  it('captures and freezes requested profile semantics across the asynchronous readiness port', async () => {
    const profile = {
      ...ltaProfile,
      environment: 'production' as const,
      trustAnchorsPem: [...ltaRoots],
    };
    const check = ltaVerifier({
      readinessChallenge: async (requested) => {
        expect(Object.isFrozen(requested)).toBe(true);
        expect(Object.isFrozen(requested.trustAnchorsPem)).toBe(true);
        profile.requireLta = false;
        profile.requiredPadesProfile = 'PAdES-B-LT';
        profile.trustAnchorsPem.length = 0;
        await Promise.resolve();
        return ltaInput('minimal-lta.pdf', { ...profile, trustAnchorsPem: [...ltaRoots] });
      },
    });
    expect(await check.capabilities(profile)).toMatchObject({ lta: true, simulated: false });
  });
  it('requires a real exact-profile production challenge before reporting LTA readiness', async () => {
    const profile = { ...ltaProfile, environment: 'production' as const };
    const readinessChallenge = vi.fn(async () => ltaInput('minimal-lta.pdf', profile));
    expect(await ltaVerifier({ readinessChallenge }).capabilities(profile)).toMatchObject({
      lta: true,
      simulated: false,
      evidenceSource: 'stynx-cms',
    });
    expect(readinessChallenge).toHaveBeenCalledWith(profile);
    await expect(ltaVerifier().capabilities(profile)).rejects.toMatchObject({
      name: 'SignatureCapabilityError',
      message: 'Authenticated readiness challenge unavailable',
    });
  });
  it('verifies requested policy semantics even when challenge supplies weaker semantics under identical labels', async () => {
    const profile = {
      ...ltaProfile,
      environment: 'production' as const,
      acceptedPolicies: ['1.2.3.999.404'],
    };
    await expect(
      ltaVerifier({
        readinessChallenge: async () =>
          ltaInput('minimal-lta.pdf', { ...profile, acceptedPolicies: undefined }),
      }).capabilities(profile),
    ).rejects.toMatchObject({
      name: 'SignatureCapabilityError',
      message: 'Authenticated readiness challenge failed',
    });
  });
});
