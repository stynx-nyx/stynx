import type { ModuleRef } from '@nestjs/core';
import { I18nAdminService } from '../../src/i18n-admin.service';
import type { CatalogService } from '../../src/catalog.service';

describe('I18nAdminService', () => {
  it('lists only i18n override settings for a tenant', async () => {
    const query = vi.fn(async () => ({
      rows: [{
        settings: {
          'i18n.override.pt-BR.title': 'Titulo',
          unrelated: 'noise',
        },
      }],
    }));
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn((fn: (trx: { query: typeof query }) => unknown) => fn({ query })),
    };
    const service = new I18nAdminService(
      { get: vi.fn(() => database) } as unknown as ModuleRef,
      { setTenantOverrides: vi.fn() } as unknown as CatalogService,
    );

    await expect(service.listOverrides('tenant-1')).resolves.toEqual({
      'i18n.override.pt-BR.title': 'Titulo',
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('tenant_settings'), ['tenant-1']);
  });

  it('returns no overrides when the tenant has no settings row', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn((fn: (trx: { query: typeof query }) => unknown) => fn({ query })),
    };
    const service = new I18nAdminService(
      { get: vi.fn(() => database) } as unknown as ModuleRef,
      { setTenantOverrides: vi.fn() } as unknown as CatalogService,
    );

    await expect(service.listOverrides('tenant-1')).resolves.toEqual({});
  });

  it('updates override settings and refreshes the catalog cache', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ settings: { existing: true } }] })
      .mockResolvedValueOnce({ rows: [] });
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn((fn: (trx: { query: typeof query }) => unknown) => fn({ query })),
    };
    const catalog = { setTenantOverrides: vi.fn() } as unknown as CatalogService;
    const service = new I18nAdminService(
      { get: vi.fn(() => database) } as unknown as ModuleRef,
      catalog,
    );

    await expect(service.updateOverrides('tenant-1', {
      locale: 'pt-BR',
      catalog: { title: 'Titulo' },
    })).resolves.toEqual({
      'i18n.override.pt-BR.title': 'Titulo',
    });
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('insert into tenancy.tenant_settings'), [
      'tenant-1',
      JSON.stringify({ existing: true, 'i18n.override.pt-BR.title': 'Titulo' }),
    ]);
    expect(catalog.setTenantOverrides).toHaveBeenCalledWith('tenant-1', {
      'i18n.override.pt-BR.title': 'Titulo',
    });
  });

  it('creates an empty override set when update input has no catalog entries', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn((fn: (trx: { query: typeof query }) => unknown) => fn({ query })),
    };
    const catalog = { setTenantOverrides: vi.fn() } as unknown as CatalogService;
    const service = new I18nAdminService(
      { get: vi.fn(() => database) } as unknown as ModuleRef,
      catalog,
    );

    await expect(service.updateOverrides('tenant-1', {
      locale: 'pt-BR',
      catalog: {},
    })).resolves.toEqual({});
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('insert into tenancy.tenant_settings'), [
      'tenant-1',
      JSON.stringify({}),
    ]);
    expect(catalog.setTenantOverrides).toHaveBeenCalledWith('tenant-1', {});
  });
});
