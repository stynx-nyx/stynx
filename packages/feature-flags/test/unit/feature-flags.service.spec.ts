import { FeatureFlagsService, InMemoryFeatureFlagProvider } from '../../src';

describe('FeatureFlagsService', () => {
  it('resolves tenant overrides before environment and global defaults', async () => {
    const service = new FeatureFlagsService(
      new InMemoryFeatureFlagProvider({
        flags: {
          'billing.new-flow': {
            default: false,
            environments: {
              staging: true,
            },
            tenants: {
              'tenant-a': true,
              'tenant-b': false,
            },
          },
        },
      }),
    );

    await expect(
      service.isEnabled('billing.new-flow', {
        tenantId: 'tenant-a',
        environment: 'production',
      }),
    ).resolves.toBe(true);
    await expect(
      service.isEnabled('billing.new-flow', {
        tenantId: 'tenant-b',
        environment: 'staging',
      }),
    ).resolves.toBe(false);
    await expect(
      service.isEnabled('billing.new-flow', {
        environment: 'staging',
      }),
    ).resolves.toBe(true);
  });

  it('returns variants and rejects non-domain flag names', async () => {
    const service = new FeatureFlagsService(
      new InMemoryFeatureFlagProvider({
        flags: {
          'reports.export': {
            default: 'legacy',
            environments: {
              staging: 'next',
            },
          },
        },
      }),
    );

    await expect(service.variant('reports.export', { environment: 'staging' })).resolves.toBe(
      'next',
    );
    await expect(service.isEnabled('bad')).rejects.toThrow('Invalid feature flag name');
  });
});
