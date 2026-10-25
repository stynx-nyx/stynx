import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FeatureFlagsService,
  InMemoryFeatureFlagProvider,
  JsonFileFeatureFlagProvider,
} from '../../src/index.js';

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

  it('falls back for explicitly undefined tenant and environment overrides', async () => {
    const provider = new InMemoryFeatureFlagProvider({
      flags: {
        'billing.undefined-overrides': {
          default: 'global',
          tenants: { 'tenant-a': undefined },
          environments: { staging: undefined },
        },
        'billing.no-overrides': { default: 'global' },
      },
    });

    await expect(
      provider.evaluate('billing.undefined-overrides', { tenantId: 'tenant-a' }, 'fallback'),
    ).resolves.toMatchObject({ value: 'fallback', source: 'tenant' });
    await expect(
      provider.evaluate('billing.undefined-overrides', { environment: 'staging' }, 'fallback'),
    ).resolves.toMatchObject({ value: 'fallback', source: 'environment' });
    await expect(
      provider.evaluate(
        'billing.no-overrides',
        { tenantId: 'tenant-a', environment: 'staging' },
        'fallback',
      ),
    ).resolves.toMatchObject({ value: 'global', source: 'global' });
  });
});


describe('native JSON feature flag selected values', () => {
  async function withFile(value: unknown, action: (provider: JsonFileFeatureFlagProvider, path: string) => Promise<void>) {
    const directory = await mkdtemp(join(tmpdir(), 'stynx-flags-selected-'));
    const path = join(directory, 'flags.json');
    try {
      await writeFile(path, JSON.stringify(value));
      await action(new JsonFileFeatureFlagProvider(path), path);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  for (const source of ['global', 'environment', 'tenant'] as const) {
    it.each([null, [], { nested: { value: null } }, {}])(`preserves native ${source} selected value %j`, async (selected) => {
      const definition = source === 'global' ? { default: selected } : source === 'environment'
        ? { default: 'global', environments: { production: selected } }
        : { default: 'global', environments: { production: 'environment' }, tenants: { tenant: selected } };
      const context = source === 'global' ? {} : source === 'environment' ? { environment: 'production' } : { tenantId: 'tenant', environment: 'production' };
      await withFile({ flags: { 'test.selected': definition } }, async (provider) => {
        const fallback = { fallback: true };
        const result = await provider.evaluate('test.selected', context, fallback);
        expect(result.source).toBe(source);
        expect(result.context).toBe(context);
        if (selected === null && source !== 'global') expect(result.value).toBe(fallback);
        else expect(result.value).toEqual(selected);
      });
    });
  }
  it('returns undefined for a native definition with no default', async () => {
    await withFile({ flags: { 'test.selected': {} } }, async (provider) => {
      const result = await provider.evaluate('test.selected', {}, false);
      expect(result.source).toBe('global');
      expect(Object.hasOwn(result, 'value')).toBe(true);
      expect(result.value).toBeUndefined();
    });
  });
  it.each([false, 0, ''])('preserves fallback for native falsy definition %j', async (definition) => {
    await withFile({ flags: { 'test.selected': definition } }, async (provider) => {
      const fallback = { fallback: true };
      expect(await provider.evaluate('test.selected', {}, fallback)).toMatchObject({ source: 'fallback' });
      expect((await provider.evaluate('test.selected', {}, fallback)).value).toBe(fallback);
    });
  });
  it('validates the flag name before attempting file access', async () => {
    const provider = new JsonFileFeatureFlagProvider('/nonexistent/stynx-feature-flags.json');
    await expect(provider.evaluate('invalid', {}, false)).rejects.toThrow('Invalid feature flag name');
    await expect(provider.evaluate('test.selected', {}, false)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('retains native parse errors before reading evaluation context', async () => {
    await withFile({}, async (provider, path) => {
      await writeFile(path, '{');
      const read = vi.fn(() => 'tenant');
      await expect(provider.evaluate('test.selected', { get tenantId() { return read(); } }, false)).rejects.toBeInstanceOf(SyntaxError);
      expect(read).not.toHaveBeenCalled();
    });
  });
  it('retains missing flags failure before context access', async () => {
    await withFile({}, async (provider) => {
      const read = vi.fn(() => 'tenant');
      await expect(provider.evaluate('test.selected', { get tenantId() { return read(); } }, false)).rejects.toBeInstanceOf(TypeError);
      expect(read).not.toHaveBeenCalled();
    });
  });
  it('reads tenant identity three times and skips environment after tenant selection', async () => {
    await withFile({ flags: { 'test.selected': { default: 'global', tenants: { tenant: [] } } } }, async (provider) => {
      const order: string[] = [];
      const context = { get tenantId() { order.push('tenant'); return 'tenant'; }, get environment() { order.push('environment'); throw new Error('unselected'); } };
      const result = await provider.evaluate('test.selected', context, false);
      expect(result.value).toEqual([]);
      expect(result.context).toBe(context);
      expect(order).toEqual(['tenant', 'tenant', 'tenant']);
    });
  });
  it('forwards rich JSON results through evaluate while boolean and variant methods retain their narrow outputs', async () => {
    await withFile({ flags: { 'test.selected': { default: [null, { deep: true }] } } }, async (provider) => {
      const service = new FeatureFlagsService(provider);
      expect((await service.evaluate('test.selected')).value).toEqual([null, { deep: true }]);
      await expect(service.isEnabled('test.selected')).resolves.toBe(false);
      await expect(service.variant('test.selected', {}, 'fallback')).resolves.toBe('fallback');
    });
  });
});
