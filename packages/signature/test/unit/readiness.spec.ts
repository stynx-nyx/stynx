import { Test } from '@nestjs/testing';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as sig from '../../src';
import { StynxHealthService } from '@stynx-nyx/health';
import { profile, now } from '../fixtures/trust';

// UPS-SIG-02 / INV-SIGNATURE-001. A capability is operational evidence,
// rather than a provider's HTTP /health assertion.
const api = sig as Record<string, any>;
const all = () => ({
  simulated: false,
  pades: true,
  tsa: true,
  lta: true,
  certificateValidation: ['ocsp', 'crl'],
  evidenceSource: 'authenticated-challenge',
  checkedAt: now,
});
const service = (capabilities: unknown) => {
  const backend = sig.createMockSignatureBackend();
  const verifier = {
    capabilities: vi.fn().mockResolvedValue(capabilities),
    verifySignedArtifact: vi.fn(),
  };
  return new (sig.SignatureService as any)(backend, { verifier, trustVerifier: verifier });
};

describe('signature readiness', () => {
  it('returns typed capabilities for an operational profile', async () => {
    const result = await service(all()).checkReadiness(profile);
    expect(result).toMatchObject({ ok: true, capabilities: all() });
  });

  it.each([
    ['PAdES', { pades: false }, profile],
    ['TSA', { tsa: false }, profile],
    ['LTA', { lta: false }, { ...profile, requireLta: true, requiredPadesProfile: 'PAdES-B-LTA' }],
    ['OCSP-only', { certificateValidation: ['crl'] }, { ...profile, revocation: 'ocsp' }],
    ['CRL-only', { certificateValidation: ['ocsp'] }, { ...profile, revocation: 'crl' }],
    ['all revocation', { certificateValidation: [] }, profile],
    ['simulated production', { simulated: true }, { ...profile, environment: 'production' }],
    ['missing observation', { checkedAt: undefined }, profile],
    ['stale observation', { checkedAt: new Date(0) }, profile],
  ])('fails down when %s is unavailable', async (_label, change, selected) => {
    await expect(service({ ...all(), ...change }).checkReadiness(selected)).rejects.toMatchObject({
      name: 'SignatureCapabilityError',
    });
  });

  it('allows the permitted OCSP to CRL fallback but rejects unsupported PAdES profile', async () => {
    const fallback = await service({ ...all(), certificateValidation: ['crl'] }).checkReadiness(
      profile,
    );
    expect(fallback.ok).toBe(true);
    await expect(
      service(all()).checkReadiness({
        ...profile,
        requiredPadesProfile: 'PAdES-B-X',
      }),
    ).rejects.toMatchObject({ name: 'SignatureCapabilityError' });
  });

  it('exports a health-compatible signature indicator that reports down on probe error', async () => {
    expect(api.SignatureReadinessIndicator).toEqual(expect.any(Function));
    const checkReadiness = vi.fn().mockRejectedValue(new Error('OCSP timed out'));
    const indicator = new api.SignatureReadinessIndicator({ checkReadiness }, profile);
    expect(indicator.name).toBe('signature');
    expect(await indicator.check()).toMatchObject({ status: 'down' });
  });

  it('does not trust a forged verifier kind during production readiness', async () => {
    const fake = {
      verifierKind: 'stynx-cms',
      capabilities: vi.fn().mockResolvedValue(all()),
      verifySignedArtifact: vi.fn(),
    };
    const instance = new (sig.SignatureService as any)(
      { sign: vi.fn(), verify: vi.fn() },
      { verifier: fake },
    );
    await expect(instance.checkReadiness({ ...profile, environment: 'production' }))
      .rejects.toMatchObject({ name: 'SignatureProviderConfigurationError' });
  });

  it('makes health readiness fail when its registered signature check fails', async () => {
    const verifier = {
      capabilities: vi.fn().mockRejectedValue(new Error('OCSP unavailable')),
      verifySignedArtifact: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [api.SignatureHealthIntegration.forRoot({
        signatureOptions: {
          backend: { sign: vi.fn(), verify: vi.fn() },
          verifier,
          trustProfile: { ...profile, environment: 'production' },
          consumerOwnedVerifier: { acknowledged: true },
        },
      })],
    }).compile();
    try {
      await moduleRef.init();
      await expect(moduleRef.get(StynxHealthService).readiness()).rejects.toMatchObject({
        message: 'stynx readiness failed',
        causes: expect.objectContaining({
          details: expect.objectContaining({ signature: expect.objectContaining({ status: 'down' }) }),
        }),
      });
    } finally {
      await moduleRef.close();
    }
  });

  it('fails production bootstrap when the exact signature indicator is not health-registered', async () => {
    await expect(
      Test.createTestingModule({
        imports: [
          sig.StynxSignatureModule.forRoot({
            backend: sig.createMockSignatureBackend(),
            trustProfile: { ...profile, environment: 'production' },
            verifier: { capabilities: async () => all(), verifySignedArtifact: async () => ({}) },
            consumerOwnedVerifier: { acknowledged: true },
          } as any),
        ],
      })
        .compile()
        .then(async (moduleRef) => {
          try {
            await moduleRef.init();
          } finally {
            await moduleRef.close();
          }
        }),
    ).rejects.toMatchObject({
      name: expect.stringMatching(/SignatureProviderConfigurationError|SignatureCapabilityError/),
    });
  });

  it('keeps health independent of signature at the module boundary', async () => {
    const health = await import('@stynx-nyx/health');
    expect(health.StynxHealthModule).toEqual(expect.any(Function));
    expect(api.SignatureHealthIntegration).toEqual(expect.any(Function));
    expect(api.SignatureHealthIntegration.name).toBe('SignatureHealthIntegration');
    const healthSrc = join(__dirname, '../../../health/src');
    for (const file of readdirSync(healthSrc).filter((x) => x.endsWith('.ts'))) {
      expect(readFileSync(join(healthSrc, file), 'utf8')).not.toMatch(
        /@stynx-nyx\/signature|packages\/signature/,
      );
    }
  });
});
