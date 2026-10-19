import { ModuleRef } from '@nestjs/core';
import { RequestContext, SystemContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { I18nAdminService } from '../../src/i18n-admin.service.js';
import { CatalogService } from '../../src/catalog.service.js';
import { LocaleService } from '../../src/locale.service.js';

function fixture() {
  const context = {
    active: true,
    tenantId: 'tenant-a' as string | undefined,
    actorId: 'actor-a' as string | undefined,
    locale: undefined,
    hasActiveContext() {
      return this.active;
    },
  };
  let system = false;
  const query = vi.fn(async () => ({
    rows: [{ settings: { 'i18n.override.pt-BR.title': 'Tenant A' } }],
  }));
  const database = {
    withSystemContext: vi.fn(),
    txIndependent: vi.fn(async (fn: (trx: { query: typeof query }) => unknown) => fn({ query })),
  };
  const providers = new Map<unknown, unknown>([
    [RequestContext, context],
    [
      SystemContext,
      {
        current() {
          if (!system) throw new Error('system capability absent');
          return {};
        },
      },
    ],
    [Database, database],
  ]);
  const moduleRef = { get: (token: unknown) => providers.get(token) } as ModuleRef;
  const catalog = new CatalogService(moduleRef, { workspaceRoot: '/nonexistent-i18n-fixture' });
  const admin = new I18nAdminService(moduleRef, catalog);
  return {
    context,
    query,
    database,
    catalog,
    admin,
    moduleRef,
    system: () => {
      system = true;
    },
  };
}

describe('i18n tenant capability boundaries', () => {
  it('uses restricted reader/app without elevating, including when a system capability exists', async () => {
    const f = fixture();
    f.system();
    await expect(f.admin.listTenantOverrides('tenant-a')).resolves.toEqual({
      'i18n.override.pt-BR.title': 'Tenant A',
    });
    expect(f.database.txIndependent).toHaveBeenLastCalledWith(expect.any(Function), {
      role: 'reader',
      readonly: true,
      replica: false,
    });
    await f.admin.updateTenantOverrides('tenant-a', {
      locale: 'pt-BR',
      catalog: { title: 'Updated' },
    });
    expect(f.database.txIndependent).toHaveBeenLastCalledWith(expect.any(Function), {
      role: 'app',
      readonly: false,
      replica: false,
    });
    expect(f.catalog.translate('title', 'pt-BR', {}, 'tenant-a')).toBe('Updated');
    expect(f.database.withSystemContext).not.toHaveBeenCalled();
  });

  it('refuses legacy administration without an already active system capability', async () => {
    const f = fixture();
    await expect(f.admin.listOverrides('tenant-a')).rejects.toThrow('system capability absent');
    await expect(
      f.admin.updateOverrides('tenant-a', { locale: 'pt-BR', catalog: {} }),
    ).rejects.toThrow('system capability absent');
    expect(f.database.txIndependent).not.toHaveBeenCalled();
    expect(f.database.withSystemContext).not.toHaveBeenCalled();
  });

  for (const admission of [
    'inactive',
    'missing tenant',
    'missing actor',
    'blank actor',
    'wrong tenant',
  ] as const) {
    it(`refuses ${admission} before normal administration or warm cache access`, async () => {
      const f = fixture();
      f.catalog.setTenantOverrides('tenant-a', { 'i18n.override.pt-BR.title': 'Warm' });
      f.system();
      if (admission === 'inactive') f.context.active = false;
      if (admission === 'missing tenant') f.context.tenantId = undefined;
      if (admission === 'missing actor') f.context.actorId = undefined;
      if (admission === 'blank actor') f.context.actorId = ' \t ';
      if (admission === 'wrong tenant') f.context.tenantId = 'tenant-b';
      await expect(f.admin.listTenantOverrides('tenant-a')).rejects.toThrow();
      await expect(
        f.admin.updateTenantOverrides('tenant-a', {
          locale: 'pt-BR',
          catalog: { title: 'Poison' },
        }),
      ).rejects.toThrow();
      // A caller with no tenant frame may use its explicit internal capability. A
      // present tenant frame, however, cannot borrow that capability for a cache hit.
      if (admission !== 'inactive' && admission !== 'missing tenant') {
        expect(() => f.catalog.translate('title', 'pt-BR', {}, 'tenant-a')).toThrow();
        await expect(f.catalog.primeTenantOverrides('tenant-a')).rejects.toThrow();
        expect(() => f.catalog.setTenantOverrides('tenant-a', {})).toThrow();
      }
      expect(f.database.txIndependent).not.toHaveBeenCalled();
      expect(f.database.withSystemContext).not.toHaveBeenCalled();
    });
  }

  it('keeps the prior cache when a transaction callback succeeds but COMMIT fails', async () => {
    const f = fixture();
    f.catalog.setTenantOverrides('tenant-a', { 'i18n.override.pt-BR.title': 'Before' });
    f.database.txIndependent.mockImplementationOnce(async (fn) => {
      await fn({ query: f.query });
      throw new Error('COMMIT refused');
    });
    await expect(
      f.admin.updateTenantOverrides('tenant-a', {
        locale: 'pt-BR',
        catalog: { title: 'Uncommitted' },
      }),
    ).rejects.toThrow('COMMIT refused');
    expect(f.catalog.translate('title', 'pt-BR', {}, 'tenant-a')).toBe('Before');
  });

  it('publishes new cache only after the transaction promise resolves', async () => {
    const f = fixture();
    f.catalog.setTenantOverrides('tenant-a', { 'i18n.override.pt-BR.title': 'Before' });
    let commit!: () => void;
    const committed = new Promise<void>((resolve) => {
      commit = resolve;
    });
    f.database.txIndependent.mockImplementationOnce(async (fn) => {
      const result = await fn({ query: f.query });
      await committed;
      return result;
    });
    const update = f.admin.updateTenantOverrides('tenant-a', {
      locale: 'pt-BR',
      catalog: { title: 'After' },
    });
    await Promise.resolve();
    expect(f.catalog.translate('title', 'pt-BR', {}, 'tenant-a')).toBe('Before');
    commit();
    await update;
    expect(f.catalog.translate('title', 'pt-BR', {}, 'tenant-a')).toBe('After');
  });

  it('does not touch tenant SQL or cached translations on public pre-authentication resolution', async () => {
    const f = fixture();
    f.catalog.setTenantOverrides('tenant-a', { 'i18n.override.pt-BR.title': 'Secret' });
    f.context.actorId = undefined;
    const mutator = { patch: vi.fn() };
    const providers = {
      get(token: unknown) {
        return token === RequestContext ? f.context : token === Database ? f.database : mutator;
      },
    } as ModuleRef;
    const locale = new LocaleService(providers, f.catalog);
    await expect(locale.resolve('unsupported')).resolves.toBe('pt-BR');
    expect(locale.t('title')).toBe('title');
    await expect(locale.resolve('en-US')).resolves.toBe('en-US');
    expect(f.query).not.toHaveBeenCalled();
    expect(f.database.txIndependent).not.toHaveBeenCalled();
  });
  it('revalidates the tenant after asynchronous priming before publishing cache', async () => {
    const f = fixture();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.database.txIndependent.mockImplementationOnce(async (fn) => {
      await pending;
      return fn({ query: f.query });
    });
    const prime = f.catalog.primeTenantOverrides('tenant-a');
    f.context.tenantId = 'tenant-b';
    release();
    await expect(prime).rejects.toThrow('I18n tenant differs');
    f.context.tenantId = 'tenant-a';
    expect(f.catalog.translate('title', 'pt-BR', {}, 'tenant-a')).toBe('title');
  });

  it('refuses tenant cache APIs without either caller capability', async () => {
    const f = fixture();
    f.context.active = false;
    expect(() => f.catalog.setTenantOverrides('tenant-a', {})).toThrow('system capability absent');
    expect(() => f.catalog.translate('title', 'pt-BR', {}, 'tenant-a')).toThrow(
      'system capability absent',
    );
    await expect(f.catalog.primeTenantOverrides('tenant-a')).rejects.toThrow(
      'system capability absent',
    );
    expect(f.query).not.toHaveBeenCalled();
  });
  it('admits a matching internal system tenant frame and refuses mismatched or incomplete frames before SQL', async () => {
    const f = fixture();
    f.system();
    await expect(f.admin.listOverrides('tenant-a')).resolves.toEqual({
      'i18n.override.pt-BR.title': 'Tenant A',
    });
    expect(f.database.txIndependent).toHaveBeenLastCalledWith(expect.any(Function), {
      role: 'owner',
      readonly: true,
      replica: false,
    });
    f.database.txIndependent.mockClear();
    f.context.tenantId = 'tenant-b';
    await expect(f.admin.listOverrides('tenant-a')).rejects.toThrow();
    await expect(
      f.admin.updateOverrides('tenant-a', { locale: 'pt-BR', catalog: { title: 'Poison' } }),
    ).rejects.toThrow();
    f.context.tenantId = 'tenant-a';
    f.context.actorId = undefined;
    await expect(f.admin.listOverrides('tenant-a')).rejects.toThrow();
    await expect(
      f.admin.updateOverrides('tenant-a', { locale: 'pt-BR', catalog: { title: 'Poison' } }),
    ).rejects.toThrow();
    expect(f.database.txIndependent).not.toHaveBeenCalled();
  });
  it('refuses blank or malformed explicit tenant identifiers before SQL or cache use', async () => {
    const f = fixture();
    f.system();
    for (const tenantId of ['', ' \t ', null, undefined, 3]) {
      await expect(f.admin.listTenantOverrides(tenantId as string)).rejects.toMatchObject({
        code: 'TENANT_CONTEXT_MISSING',
      });
      await expect(f.admin.listOverrides(tenantId as string)).rejects.toMatchObject({
        code: 'TENANT_CONTEXT_MISSING',
      });
      expect(() => f.catalog.setTenantOverrides(tenantId as string, {})).toThrow();
    }
    expect(f.database.txIndependent).not.toHaveBeenCalled();
  });
});
