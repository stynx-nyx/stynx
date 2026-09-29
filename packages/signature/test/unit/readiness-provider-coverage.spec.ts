import {
  createCmsTrustVerifier,
  HttpSignatureProviderClient,
  ProviderBackedSignatureBackend,
  SignatureService,
  sha256Hex,
} from '../../src';
import {
  bltCmsSignature,
  bltSignedDocument,
  bltSourceDocument,
  certificate,
  now,
  profile,
  rootPem,
} from '../fixtures/trust';

const currentCapabilities = () => ({
  simulated: false,
  pades: true,
  tsa: true,
  lta: true,
  certificateValidation: ['ocsp', 'crl'] as const,
  evidenceSource: 'coverage-test',
  checkedAt: new Date(),
});

describe('signature readiness and provider coverage', () => {
  it('accepts a recent production observation from an acknowledged consumer verifier', async () => {
    const verifier = {
      capabilities: vi.fn().mockResolvedValue(currentCapabilities()),
      verifySignedArtifact: vi.fn(),
    };
    const service = new SignatureService(
      { sign: vi.fn(), verify: vi.fn() },
      { verifier, consumerOwnedVerifier: { acknowledged: true } },
    );

    await expect(service.checkReadiness({ ...profile, environment: 'production' }))
      .resolves.toMatchObject({ ok: true, verifierKind: 'consumer-owned' });
  });

  it('reports the branded CMS verifier kind for readiness', async () => {
    const cmsVerifier = createCmsTrustVerifier({ trustAnchorsPem: [rootPem] });
    const service = new SignatureService({ sign: vi.fn(), verify: vi.fn() }, { verifier: cmsVerifier });

    await expect(service.checkReadiness(profile)).resolves.toMatchObject({
      ok: true,
      verifierKind: 'stynx-cms',
    });
  });

  it('binds real CMS trust proof into regulated provider signing evidence', async () => {
    const cmsVerifier = createCmsTrustVerifier({
      trustAnchorsPem: [rootPem],
      tsaTrustAnchorsPem: [rootPem],
      acceptedPolicies: profile.acceptedPolicies,
      now: () => now,
    });
    const backend = new ProviderBackedSignatureBackend({
      async validateCertificate() {
        return { good: true, source: 'ocsp', checkedAt: now };
      },
      async signPades() {
        return {
          signedDocument: bltSignedDocument,
          cmsSignature: bltCmsSignature,
          signedAt: now,
          tsaTime: now,
          revocationSource: 'ocsp',
          revocationCheckedAt: now,
        };
      },
      async verifyPades() {
        return { status: 'unknown', documentSha256: '', checkedAt: now,
          revocationSource: 'none', reasons: [] };
      },
    });
    const service = new SignatureService(backend, { trustVerifier: cmsVerifier });

    const result = await service.sign({
      tenantId: 'tenant-a',
      actorId: 'doctor-a',
      document: bltSourceDocument,
      documentSha256: sha256Hex(bltSourceDocument),
      tsa: { endpoint: 'https://tsa.example.test' },
      certificate,
      minimumSignatureLevel: 'ADVANCED',
      trustProfile: profile,
    });

    expect(result.evidence).toMatchObject({
      signatureLevel: 'ADVANCED',
      verifierKind: 'stynx-cms',
      trustProof: { verifierKind: 'stynx-cms', padesProfile: 'PAdES-B-LT' },
    });
  });

  it('wraps non-Error transport failures with their string value', async () => {
    const client = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      fetch: vi.fn<typeof fetch>(async () => { throw 'socket reset'; }),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });

    await expect(client.validateCertificate({
      tenantId: 'tenant-a',
      actorId: 'doctor-a',
      certificate,
      allowCrlFallback: true,
    })).rejects.toMatchObject({
      name: 'SignatureProviderError',
      message: expect.stringContaining('socket reset'),
    });
  });
});
