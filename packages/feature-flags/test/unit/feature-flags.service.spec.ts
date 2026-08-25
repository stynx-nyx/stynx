import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FeatureFlagsService,
  InMemoryFeatureFlagProvider,
  JsonFileFeatureFlagProvider,
} from '../../src';

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

  it('uses global and caller fallbacks without changing the evaluation context', async () => {
    const service = new FeatureFlagsService(
      new InMemoryFeatureFlagProvider({
        flags: {
          'reports.export': { default: { format: 'pdf' } },
          'reports.enabled': { default: true },
        },
      }),
    );
    const context = { actorId: 'actor-1', attributes: { plan: 'pro' } };

    await expect(service.evaluate('reports.export', context)).resolves.toEqual({
      flag: 'reports.export',
      value: { format: 'pdf' },
      source: 'global',
      context,
    });
    await expect(service.evaluate('reports.missing', context, 7)).resolves.toEqual({
      flag: 'reports.missing',
      value: 7,
      source: 'fallback',
      context,
    });
    await expect(service.isEnabled('reports.export', context, true)).resolves.toBe(false);
    await expect(service.variant('reports.enabled', context, 'classic')).resolves.toBe('classic');
  });

  it('uses default providers and default service arguments', async () => {
    const service = new FeatureFlagsService();

    await expect(service.evaluate('feature.missing')).resolves.toMatchObject({
      value: false,
      source: 'fallback',
      context: {},
    });
    await expect(service.isEnabled('feature.missing')).resolves.toBe(false);
    await expect(service.variant('feature.missing')).resolves.toBe('default');
  });

  it('loads JSON definitions for each evaluation and honors tenant precedence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stynx-feature-flags-'));
    const path = join(directory, 'flags.json');
    try {
      await writeFile(
        path,
        JSON.stringify({
          flags: {
            'checkout.variant': {
              default: 'control',
              environments: { staging: 'environment' },
              tenants: { 'tenant-a': 'tenant' },
            },
          },
        }),
      );
      const service = new FeatureFlagsService(new JsonFileFeatureFlagProvider(path));

      await expect(
        service.variant('checkout.variant', { tenantId: 'tenant-a', environment: 'staging' }),
      ).resolves.toBe('tenant');

      await writeFile(path, JSON.stringify({ flags: {} }));
      await expect(service.variant('checkout.variant', {}, 'fallback')).resolves.toBe('fallback');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
