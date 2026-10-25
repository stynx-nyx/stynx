import { createFakeTransaction } from '@stynx-nyx/testing';
import { systemModuleRef } from '../support/module-ref.js';
import { I18nAdminService } from '../../src/i18n-admin.service.js';
import type { CatalogService } from '../../src/catalog.service.js';

const TENANT = '00000000-0000-4000-8000-000000000001';

describe('I18nAdminService', () => {
  it('lists only i18n override settings for a tenant', async () => {
    const fake = createFakeTransaction(
      [
        {
          rows: [
            {
              settings: {
                'i18n.override.pt-BR.title': 'Titulo',
                unrelated: 'noise',
              },
            },
          ],
          rowCount: 1,
        },
      ],
      { role: 'owner' },
    );
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      txIndependent: vi.fn((fn: (trx: typeof fake.transaction) => unknown) => fn(fake.transaction)),
    };
    const service = new I18nAdminService(systemModuleRef(database), {
      setTenantOverrides: vi.fn(),
    } as unknown as CatalogService);

    await expect(service.listOverrides(TENANT)).resolves.toEqual({
      'i18n.override.pt-BR.title': 'Titulo',
    });
    expect(fake.queries).toContainEqual({
      text: expect.stringContaining('tenant_settings'),
      values: [TENANT],
    });
    expect(database.withSystemContext).not.toHaveBeenCalled();
    expect(database.txIndependent).toHaveBeenCalledWith(expect.any(Function), {
      role: 'owner',
      readonly: true,
      replica: false,
    });
  });

  it('returns no overrides when the tenant has no settings row', async () => {
    const fake = createFakeTransaction([{ rows: [], rowCount: 0 }], { role: 'owner' });
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      txIndependent: vi.fn((fn: (trx: typeof fake.transaction) => unknown) => fn(fake.transaction)),
    };
    const service = new I18nAdminService(systemModuleRef(database), {
      setTenantOverrides: vi.fn(),
    } as unknown as CatalogService);

    await expect(service.listOverrides(TENANT)).resolves.toEqual({});
  });

  it('updates override settings and refreshes the catalog cache', async () => {
    const fake = createFakeTransaction(
      [
        { rows: [{ settings: { existing: true } }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ],
      { role: 'owner' },
    );
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      txIndependent: vi.fn((fn: (trx: typeof fake.transaction) => unknown) => fn(fake.transaction)),
    };
    const catalog = { setTenantOverrides: vi.fn() } as unknown as CatalogService;
    const service = new I18nAdminService(systemModuleRef(database), catalog);

    await expect(
      service.updateOverrides(TENANT, {
        locale: 'pt-BR',
        catalog: { title: 'Titulo' },
      }),
    ).resolves.toEqual({
      'i18n.override.pt-BR.title': 'Titulo',
    });
    expect(fake.queries[1]).toEqual({
      text: expect.stringContaining('insert into tenancy.tenant_settings'),
      values: [TENANT, JSON.stringify({ existing: true, 'i18n.override.pt-BR.title': 'Titulo' })],
    });
    expect(catalog.setTenantOverrides).toHaveBeenCalledWith(TENANT, {
      'i18n.override.pt-BR.title': 'Titulo',
    });
    expect(database.withSystemContext).not.toHaveBeenCalled();
    expect(database.txIndependent).toHaveBeenCalledWith(expect.any(Function), {
      role: 'owner',
      readonly: false,
      replica: false,
    });
  });

  it('creates an empty override set when update input has no catalog entries', async () => {
    const fake = createFakeTransaction(
      [
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      ],
      { role: 'owner' },
    );
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      txIndependent: vi.fn((fn: (trx: typeof fake.transaction) => unknown) => fn(fake.transaction)),
    };
    const catalog = { setTenantOverrides: vi.fn() } as unknown as CatalogService;
    const service = new I18nAdminService(systemModuleRef(database), catalog);

    await expect(
      service.updateOverrides(TENANT, {
        locale: 'pt-BR',
        catalog: {},
      }),
    ).resolves.toEqual({});
    expect(fake.queries[1]).toEqual({
      text: expect.stringContaining('insert into tenancy.tenant_settings'),
      values: [TENANT, JSON.stringify({})],
    });
    expect(catalog.setTenantOverrides).toHaveBeenCalledWith(TENANT, {});
  });
});
