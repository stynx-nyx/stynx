import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { StynxHealthService } from '@stynx-nyx/health';
import * as sig from '../../src';
import {
  blt2CmsSignature,
  blt2SignedDocument,
  blt2SourceDocument,
  bltCmsSignature,
  bltSignedDocument,
  bltSourceDocument,
  certificate,
  certificate2,
  hex,
  now2,
  profile,
  root2Pem,
  rootPem,
} from '../fixtures/trust';

// UPS-SIG-07 / ADR-SIGNATURE-0002 D2 / INV-SIGNATURE-001. Several production
// trust profiles in one mounted module, proven with two real, disjoint test PKI
// roots: tenant A anchors in root.cert.pem, tenant B in root2.cert.pem. Resolve
// through the published barrel so a missing behavior is an observable failure.
const api = sig as Record<string, any>;

const profileA = {
  ...profile,
  id: 'tenant-a-clinical',
  revision: '1',
  environment: 'production',
  trustAnchorsPem: [rootPem],
} as const;
const profileB = {
  ...profile,
  id: 'tenant-b-clinical',
  revision: '1',
  environment: 'production',
  trustAnchorsPem: [root2Pem],
} as const;
type Profile = sig.SignatureTrustProfile;

// Consumer-side resolution (D2 item 8): tenant -> profile stays outside STYNX.
const tenantProfiles: Record<string, Profile> = { 'tenant-a': profileA, 'tenant-b': profileB };
const resolveProfile = (tenantId: string): Profile => tenantProfiles[tenantId]!;

const artifactA = {
  tenantId: 'tenant-a',
  originalDocument: bltSourceDocument,
  signedDocument: bltSignedDocument,
  cmsSignature: bltCmsSignature,
  certificate,
};
const artifactB = {
  tenantId: 'tenant-b',
  originalDocument: blt2SourceDocument,
  signedDocument: blt2SignedDocument,
  cmsSignature: blt2CmsSignature,
  certificate: certificate2,
};
const artifacts: Record<string, typeof artifactA> = {
  'tenant-a': artifactA,
  'tenant-b': artifactB,
};

// One verifier with the union of both tenants' anchors (D2 item 6); the
// intersection with each profile keeps the trust of each tenant separate.
const verifier = (overrides: Record<string, unknown> = {}) =>
  sig.createCmsTrustVerifier({
    trustAnchorsPem: [rootPem, root2Pem],
    tsaTrustAnchorsPem: [rootPem, root2Pem],
    acceptedPolicies: profile.acceptedPolicies,
    now: () => now2,
    readinessChallenge: async (selected: Profile) => ({
      ...artifacts[profileA.id === selected.id ? 'tenant-a' : 'tenant-b']!,
      profile: selected,
    }),
    ...overrides,
  });
const backend = () => ({ sign: vi.fn(), verify: vi.fn() });
const signedResultFor = (tenantId: string) => {
  const artifact = artifacts[tenantId]!;
  return {
    status: 'signed',
    signedDocument: artifact.signedDocument,
    cmsSignature: artifact.cmsSignature,
    evidence: {
      signatureId: `sig-${tenantId}`,
      documentSha256: hex(artifact.originalDocument),
      signedAt: now2,
      tsaTime: now2,
      signerCertificate: artifact.certificate,
      revocationSource: 'ocsp',
      revocationCheckedAt: now2,
    },
  };
};
const signRequest = (tenantId: string, trustProfile: Profile = resolveProfile(tenantId)) => ({
  tenantId,
  actorId: `doctor-${tenantId}`,
  document: artifacts[tenantId]!.originalDocument,
  documentSha256: hex(artifacts[tenantId]!.originalDocument),
  tsa: { endpoint: 'https://tsa.example.test' },
  certificate: artifacts[tenantId]!.certificate,
  minimumSignatureLevel: 'ADVANCED' as const,
  trustProfile,
});
const verifyRequest = (tenantId: string, trustProfile: Profile) => {
  const artifact = artifacts[tenantId]!;
  return {
    tenantId,
    document: artifact.originalDocument,
    documentSha256: hex(artifact.originalDocument),
    signedDocument: artifact.signedDocument,
    cmsSignature: artifact.cmsSignature,
    certificate: artifact.certificate,
    minimumSignatureLevel: 'ADVANCED' as const,
    trustProfile,
  };
};
const integration = (signatureOptions: Record<string, unknown>) =>
  Test.createTestingModule({
    imports: [api.SignatureHealthIntegration.forRoot({ signatureOptions })],
  }).compile();
const bootstrap = async (moduleOptions: Record<string, unknown>) => {
  const moduleRef = await Test.createTestingModule({
    imports: [sig.StynxSignatureModule.forRoot(moduleOptions as any)],
  }).compile();
  try {
    await moduleRef.init();
    return 'started';
  } finally {
    await moduleRef.close();
  }
};
const profileEntry = (selected: Profile, extra: Record<string, unknown>) =>
  expect.objectContaining({ id: selected.id, revision: selected.revision, ...extra });
const up = (selected: Profile) =>
  profileEntry(selected, { status: 'up', pades: true, tsa: true, verifierKind: 'stynx-cms' });
const down = (selected: Profile) =>
  profileEntry(selected, {
    status: 'down',
    reason: 'SIGNATURE_CAPABILITY_UNAVAILABLE',
    verifierKind: 'stynx-cms',
  });

describe('trust-profile sets (UPS-SIG-07)', () => {
  // Readiness freshness is judged against Date.now(); pin it to the verifier clock.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now2);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('disjoint anchors per tenant', () => {
    it('verifies each tenant artifact under its own profile with the union verifier', async () => {
      const shared = verifier();
      await expect(
        shared.verifySignedArtifact({ ...artifactA, profile: profileA }),
      ).resolves.toMatchObject({
        profileId: profileA.id,
        padesProfile: 'PAdES-B-LT',
        signerCertificateSha256: hex(
          Buffer.from(certificate.pem.replace(/-----[^-]+-----|\s/gu, ''), 'base64'),
        ),
      });
      await expect(
        shared.verifySignedArtifact({ ...artifactB, profile: profileB }),
      ).resolves.toMatchObject({
        profileId: profileB.id,
        padesProfile: 'PAdES-B-LT',
        signerCertificateSha256: hex(
          Buffer.from(certificate2.pem.replace(/-----[^-]+-----|\s/gu, ''), 'base64'),
        ),
      });
    });

    it("refuses tenant A's artifact under tenant B's profile and vice versa", async () => {
      const shared = verifier();
      await expect(
        shared.verifySignedArtifact({ ...artifactA, profile: profileB }),
      ).rejects.toMatchObject({ name: 'SignatureTrustError' });
      await expect(
        shared.verifySignedArtifact({ ...artifactB, profile: profileA }),
      ).rejects.toMatchObject({ name: 'SignatureTrustError' });
    });

    it('keeps the refusal through the service with a consumer-side resolver', async () => {
      const moduleRef = await integration({
        backend: backend(),
        verifier: verifier(),
        trustProfiles: [profileA, profileB],
      });
      try {
        const service = moduleRef.get(sig.SignatureService);
        await expect(
          service.verify(verifyRequest('tenant-a', resolveProfile('tenant-a'))),
        ).resolves.toMatchObject({ status: 'valid', trustProof: { profileId: profileA.id } });
        await expect(
          service.verify(verifyRequest('tenant-b', resolveProfile('tenant-b'))),
        ).resolves.toMatchObject({ status: 'valid', trustProof: { profileId: profileB.id } });
        await expect(
          service.verify(verifyRequest('tenant-a', resolveProfile('tenant-b'))),
        ).resolves.toMatchObject({ status: 'invalid', reasons: ['TRUST_PROOF_FAILED'] });
        await expect(
          service.verify(verifyRequest('tenant-b', resolveProfile('tenant-a'))),
        ).resolves.toMatchObject({ status: 'invalid', reasons: ['TRUST_PROOF_FAILED'] });
      } finally {
        await moduleRef.close();
      }
    });

    it('signs under the resolved profile and refuses a provider artifact anchored in the other tenant', async () => {
      const b = backend();
      b.sign
        .mockResolvedValueOnce(signedResultFor('tenant-b'))
        .mockResolvedValueOnce(signedResultFor('tenant-a'));
      const moduleRef = await integration({
        backend: b,
        verifier: verifier(),
        trustProfiles: [profileA, profileB],
      });
      try {
        const service = moduleRef.get(sig.SignatureService);
        await expect(service.sign(signRequest('tenant-b') as any)).resolves.toMatchObject({
          status: 'signed',
          evidence: { verifierKind: 'stynx-cms', trustProof: { profileId: profileB.id } },
        });
        await expect(service.sign(signRequest('tenant-b') as any)).rejects.toMatchObject({
          name: 'SignatureTrustError',
        });
      } finally {
        await moduleRef.close();
      }
    });

    it('lets the declared profile object govern a call that names it by id and revision', async () => {
      // A per-call copy with widened anchors selects the declared profile; it does
      // not replace it, so tenant A's artifact still fails under tenant B's id.
      const widened = { ...profileB, trustAnchorsPem: [rootPem, root2Pem] };
      const moduleRef = await integration({
        backend: backend(),
        verifier: verifier(),
        trustProfiles: [profileA, profileB],
      });
      try {
        const service = moduleRef.get(sig.SignatureService);
        await expect(service.verify(verifyRequest('tenant-a', widened))).resolves.toMatchObject({
          status: 'invalid',
        });
      } finally {
        await moduleRef.close();
      }
    });
  });

  describe('health per declared profile', () => {
    it('lists each profile with its own state under one signature indicator', async () => {
      const moduleRef = await integration({
        backend: backend(),
        verifier: verifier(),
        trustProfiles: [profileA, profileB],
      });
      try {
        await moduleRef.init();
        const readiness = await moduleRef.get(StynxHealthService).readiness();
        expect(Object.keys(readiness.info).filter((name) => name === 'signature')).toHaveLength(1);
        expect(readiness).toMatchObject({
          status: 'ok',
          info: {
            signature: {
              status: 'up',
              aggregation: 'all',
              profiles: [up(profileA), up(profileB)],
            },
          },
          error: {},
        });
      } finally {
        await moduleRef.close();
      }
    });

    it('downs only the profile with an invalid challenge under any, with the failure visible', async () => {
      const wrongChallengeForB = verifier({
        readinessChallenge: async (selected: Profile) => ({ ...artifactA, profile: selected }),
      });
      const moduleRef = await integration({
        backend: backend(),
        verifier: wrongChallengeForB,
        trustProfiles: [profileA, profileB],
        trustProfileAggregation: 'any',
      });
      try {
        await moduleRef.init();
        await expect(moduleRef.get(StynxHealthService).readiness()).resolves.toMatchObject({
          status: 'ok',
          info: {
            signature: {
              status: 'up',
              aggregation: 'any',
              profiles: [up(profileA), down(profileB)],
            },
          },
        });
        // Aggregation never authorizes: the failing profile is still not ready per call.
        const service = moduleRef.get(sig.SignatureService);
        await expect(service.checkReadiness(profileA)).resolves.toMatchObject({ ok: true });
        await expect(service.checkReadiness(profileB)).rejects.toMatchObject({
          name: 'SignatureCapabilityError',
        });
      } finally {
        await moduleRef.close();
      }
    });

    it('downs the whole indicator under all (the default) when one profile fails', async () => {
      const wrongChallengeForB = verifier({
        readinessChallenge: async (selected: Profile) => ({ ...artifactA, profile: selected }),
      });
      const moduleRef = await integration({
        backend: backend(),
        verifier: wrongChallengeForB,
        trustProfiles: [profileA, profileB],
      });
      try {
        await moduleRef.init();
        await expect(moduleRef.get(StynxHealthService).readiness()).rejects.toMatchObject({
          message: 'stynx readiness failed',
          causes: expect.objectContaining({
            details: expect.objectContaining({
              signature: expect.objectContaining({
                status: 'down',
                aggregation: 'all',
                profiles: [up(profileA), down(profileB)],
              }),
            }),
          }),
        });
      } finally {
        await moduleRef.close();
      }
    });

    it('leaves a profile not ready after a revision change without a new challenge', async () => {
      const revised = { ...profileB, revision: '2' };
      const staleChallenge = verifier({
        // The challenge store still labels tenant B's artifact with revision 1.
        readinessChallenge: async (selected: Profile) => ({
          ...artifacts[selected.id === profileA.id ? 'tenant-a' : 'tenant-b']!,
          profile: selected.id === profileA.id ? profileA : profileB,
        }),
      });
      await expect(staleChallenge.capabilities(revised)).rejects.toMatchObject({
        name: 'SignatureCapabilityError',
      });
      const moduleRef = await integration({
        backend: backend(),
        verifier: staleChallenge,
        trustProfiles: [profileA, revised],
        trustProfileAggregation: 'any',
      });
      try {
        await moduleRef.init();
        await expect(moduleRef.get(StynxHealthService).readiness()).resolves.toMatchObject({
          info: { signature: { status: 'up', profiles: [up(profileA), down(revised)] } },
        });
        await expect(
          moduleRef.get(sig.SignatureService).checkReadiness(revised),
        ).rejects.toMatchObject({
          name: 'SignatureCapabilityError',
        });
      } finally {
        await moduleRef.close();
      }
    });

    it('accepts the single-profile constructor and the profile-list constructor', async () => {
      const checkReadiness = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          capabilities: { pades: true },
          verifierKind: 'stynx-cms',
        })
        .mockRejectedValueOnce(new Error('unavailable'));
      const listed = new api.SignatureReadinessIndicator(
        { checkReadiness },
        [profileA, profileB],
        'stynx-cms',
        'any',
      );
      expect(listed.name).toBe('signature');
      expect(await listed.check()).toEqual({
        status: 'up',
        details: {
          aggregation: 'any',
          profiles: [
            {
              id: profileA.id,
              revision: '1',
              status: 'up',
              pades: true,
              verifierKind: 'stynx-cms',
            },
            {
              id: profileB.id,
              revision: '1',
              status: 'down',
              reason: 'SIGNATURE_CAPABILITY_UNAVAILABLE',
              verifierKind: 'stynx-cms',
            },
          ],
        },
      });
      const single = new api.SignatureReadinessIndicator(
        {
          checkReadiness: vi.fn().mockResolvedValue({
            ok: true,
            capabilities: { pades: true },
            verifierKind: 'stynx-cms',
          }),
        },
        profileA,
      );
      expect(await single.check()).toEqual({
        status: 'up',
        details: { pades: true, verifierKind: 'stynx-cms' },
      });
    });
  });

  describe('boot guard over the declared set', () => {
    it('refuses startup when a listed production profile has no trusted verifier', async () => {
      const unbranded = { capabilities: vi.fn(), verifySignedArtifact: vi.fn() };
      await expect(
        bootstrap({
          backend: backend(),
          trustProfile: profile,
          trustProfiles: [profileB],
          verifier: unbranded,
        }),
      ).rejects.toMatchObject({ name: 'SignatureProviderConfigurationError' });
    });

    it('refuses startup when a listed production profile has no health witness', async () => {
      await expect(
        bootstrap({
          backend: backend(),
          trustProfiles: [profileA, profileB],
          verifier: verifier(),
        }),
      ).rejects.toMatchObject({ name: 'SignatureProviderConfigurationError' });
    });

    it('refuses a simulated backend once any listed profile is production', async () => {
      await expect(
        bootstrap({
          backend: sig.createMockSignatureBackend(),
          trustProfile: profile,
          trustProfiles: [profileA],
          verifier: verifier(),
        }),
      ).rejects.toMatchObject({ name: 'SignatureProviderConfigurationError' });
    });

    it('starts with test-only profiles exactly as before', async () => {
      await expect(
        bootstrap({ backend: sig.createMockSignatureBackend(), trustProfiles: [profile] }),
      ).resolves.toBe('started');
    });

    it('refuses a duplicate profile id at forRoot', () => {
      expect(() =>
        sig.StynxSignatureModule.forRoot({
          backend: backend(),
          trustProfile: profileA,
          trustProfiles: [{ ...profileA, revision: '2' }],
        } as any),
      ).toThrow(sig.SignatureProviderConfigurationError);
      expect(() =>
        sig.StynxSignatureModule.forRoot({
          backend: backend(),
          trustProfiles: [profileB, profileB],
        } as any),
      ).toThrow(sig.SignatureProviderConfigurationError);
      expect(() =>
        api.SignatureHealthIntegration.forRoot({
          signatureOptions: {
            backend: backend(),
            verifier: verifier(),
            trustProfiles: [profileA, profileA],
          },
        }),
      ).toThrow(sig.SignatureProviderConfigurationError);
    });
  });

  describe('declared profiles only', () => {
    it('refuses an undeclared production profile per call with a typed error', async () => {
      const b = backend();
      const moduleRef = await integration({
        backend: b,
        verifier: verifier(),
        trustProfiles: [profileA],
      });
      try {
        const service = moduleRef.get(sig.SignatureService);
        expect(api.SignatureProfileNotDeclaredError).toEqual(expect.any(Function));
        const undeclared = [profileB, { ...profileA, revision: '2' }];
        for (const selected of undeclared) {
          await expect(
            service.sign(signRequest('tenant-b', selected) as any),
          ).rejects.toMatchObject({
            name: 'SignatureProfileNotDeclaredError',
          });
          await expect(service.verify(verifyRequest('tenant-b', selected))).rejects.toMatchObject({
            name: 'SignatureProfileNotDeclaredError',
          });
          await expect(service.checkReadiness(selected)).rejects.toMatchObject({
            name: 'SignatureProfileNotDeclaredError',
          });
        }
        expect(b.sign).not.toHaveBeenCalled();
        expect(new api.SignatureProfileNotDeclaredError()).toBeInstanceOf(
          sig.SignatureProviderConfigurationError,
        );
      } finally {
        await moduleRef.close();
      }
    });

    it('keeps 1.5.3 per-call behavior for test profiles and without trustProfiles', async () => {
      const declaredOnlyA = await integration({
        backend: backend(),
        verifier: verifier(),
        trustProfiles: [profileA],
      });
      try {
        // A test-environment profile is not subject to the declared-only rule.
        await expect(
          declaredOnlyA.get(sig.SignatureService).verify(verifyRequest('tenant-a', profile)),
        ).resolves.toMatchObject({ status: 'valid' });
      } finally {
        await declaredOnlyA.close();
      }
      const singleProfile = await integration({
        backend: backend(),
        verifier: verifier(),
        trustProfile: profileA,
      });
      try {
        // Without trustProfiles an undeclared production profile is evaluated as in 1.5.3.
        await expect(
          singleProfile.get(sig.SignatureService).verify(verifyRequest('tenant-b', profileB)),
        ).resolves.toMatchObject({ status: 'valid', trustProof: { profileId: profileB.id } });
      } finally {
        await singleProfile.close();
      }
    });
  });
});
