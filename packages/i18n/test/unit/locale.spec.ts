import type { ModuleRef } from '@nestjs/core';
import { RequestContext, RequestContextMutator } from '@stynx/core';
import { Database } from '@stynx/data';
import { CatalogService } from '../../src/catalog.service';
import { LocaleService } from '../../src/locale.service';

function moduleRef(providers: Map<unknown, unknown>): ModuleRef {
  return {
    get: vi.fn((token: unknown) => providers.get(token)),
  } as unknown as ModuleRef;
}

function context(values: { active?: boolean; locale?: string; tenantId?: string } = {}) {
  return {
    locale: values.locale,
    tenantId: values.tenantId,
    hasActiveContext: vi.fn(() => values.active ?? false),
  } as unknown as RequestContext;
}

describe('LocaleService', () => {
  it('returns the active request locale without patching context', async () => {
    const mutator = { patch: vi.fn() } as unknown as RequestContextMutator;
    const catalog = { supportedLocales: vi.fn(() => ['en-US', 'pt-BR']) } as unknown as CatalogService;
    const service = new LocaleService(
      moduleRef(new Map([[RequestContext, context({ active: true, locale: 'en-US' })], [RequestContextMutator, mutator]])),
      catalog,
    );

    await expect(service.resolve('pt-BR,en-US')).resolves.toBe('en-US');
    expect(mutator.patch).not.toHaveBeenCalled();
  });

  it('uses the first supported Accept-Language entry and patches context', async () => {
    const mutator = { patch: vi.fn() } as unknown as RequestContextMutator;
    const catalog = { supportedLocales: vi.fn(() => ['en-US', 'pt-BR']) } as unknown as CatalogService;
    const service = new LocaleService(
      moduleRef(new Map([[RequestContext, context({ active: false })], [RequestContextMutator, mutator]])),
      catalog,
    );

    await expect(service.resolve('fr-FR;q=0.9, pt-BR;q=0.8')).resolves.toBe('pt-BR');
    expect(mutator.patch).toHaveBeenCalledWith({ locale: 'pt-BR' });
  });

  it('loads tenant overrides and tenant locale when the header has no supported locale', async () => {
    const mutator = { patch: vi.fn() } as unknown as RequestContextMutator;
    const catalog = {
      supportedLocales: vi.fn(() => ['en-US', 'pt-BR']),
      primeTenantOverrides: vi.fn(async () => undefined),
    } as unknown as CatalogService;
    const database = {
      withSystemContext: vi.fn(async (_label: string, callback: () => Promise<string>) => callback()),
      tx: vi.fn(async (callback: (trx: unknown) => Promise<string>) =>
        callback({ query: vi.fn(async () => ({ rows: [{ locale: 'en-US' }] })) }),
      ),
    };
    const service = new LocaleService(
      moduleRef(
        new Map([
          [RequestContext, context({ active: true, tenantId: 'tenant-1' })],
          [RequestContextMutator, mutator],
          [Database, database],
        ]),
      ),
      catalog,
    );

    await expect(service.resolve('fr-FR')).resolves.toBe('en-US');
    expect(catalog.primeTenantOverrides).toHaveBeenCalledWith('tenant-1');
    expect(mutator.patch).toHaveBeenCalledWith({ locale: 'en-US' });
  });

  it('falls through tenant lookup when settings have no locale', async () => {
    const mutator = { patch: vi.fn() } as unknown as RequestContextMutator;
    const catalog = {
      supportedLocales: vi.fn(() => ['en-US']),
      primeTenantOverrides: vi.fn(async () => undefined),
    } as unknown as CatalogService;
    const database = {
      withSystemContext: vi.fn(async (_label: string, callback: () => Promise<string | undefined>) => callback()),
      tx: vi.fn(async (callback: (trx: unknown) => Promise<string | undefined>) =>
        callback({ query: vi.fn(async () => ({ rows: [{ locale: null }] })) }),
      ),
    };
    const service = new LocaleService(
      moduleRef(
        new Map([
          [RequestContext, context({ active: true, tenantId: 'tenant-1' })],
          [RequestContextMutator, mutator],
          [Database, database],
        ]),
      ),
      catalog,
    );

    await expect(service.resolve('fr-FR')).resolves.toBe('en-US');
    expect(mutator.patch).toHaveBeenCalledWith({ locale: 'en-US' });
  });

  it('falls back to pt-BR when supported and translates with explicit or contextual locale', async () => {
    const mutator = { patch: vi.fn() } as unknown as RequestContextMutator;
    const requestContext = context({ active: true });
    const catalog = {
      supportedLocales: vi.fn(() => ['pt-BR', 'en-US']),
      translate: vi.fn(() => 'Olá'),
    } as unknown as CatalogService;
    const service = new LocaleService(
      moduleRef(new Map([[RequestContext, requestContext], [RequestContextMutator, mutator]])),
      catalog,
    );

    await expect(service.resolve()).resolves.toBe('pt-BR');
    expect(mutator.patch).toHaveBeenCalledWith({ locale: 'pt-BR' });
    expect(service.t('hello', { name: 'Ana' }, 'en-US')).toBe('Olá');
    expect(catalog.translate).toHaveBeenCalledWith('hello', 'en-US', { name: 'Ana' }, undefined);
  });

  it('uses contextual locale and tenant when translate is called without explicit locale', () => {
    const catalog = {
      translate: vi.fn(() => 'Olá'),
    } as unknown as CatalogService;
    const service = new LocaleService(
      moduleRef(new Map([[RequestContext, context({ active: true, locale: 'pt-BR', tenantId: 'tenant-1' })]])),
      catalog,
    );

    expect(service.t('hello')).toBe('Olá');
    expect(catalog.translate).toHaveBeenCalledWith('hello', 'pt-BR', {}, 'tenant-1');
  });

  it('falls back to en-US and default translation locale when no request context is active', async () => {
    const mutator = { patch: vi.fn() } as unknown as RequestContextMutator;
    const catalog = {
      supportedLocales: vi.fn(() => ['en-US']),
      translate: vi.fn(() => 'Hello'),
    } as unknown as CatalogService;
    const service = new LocaleService(
      moduleRef(new Map([[RequestContext, context({ active: false })], [RequestContextMutator, mutator]])),
      catalog,
    );

    await expect(service.resolve('fr-FR')).resolves.toBe('en-US');
    expect(mutator.patch).toHaveBeenCalledWith({ locale: 'en-US' });
    expect(service.t('hello')).toBe('Hello');
    expect(catalog.translate).toHaveBeenCalledWith('hello', 'pt-BR', {}, undefined);
  });

  it('uses en-US when the catalog reports no supported locales', async () => {
    const mutator = { patch: vi.fn() } as unknown as RequestContextMutator;
    const catalog = {
      supportedLocales: vi.fn(() => []),
    } as unknown as CatalogService;
    const service = new LocaleService(
      moduleRef(new Map([[RequestContext, context({ active: false })], [RequestContextMutator, mutator]])),
      catalog,
    );

    await expect(service.resolve()).resolves.toBe('en-US');
    expect(mutator.patch).toHaveBeenCalledWith({ locale: 'en-US' });
  });
});
