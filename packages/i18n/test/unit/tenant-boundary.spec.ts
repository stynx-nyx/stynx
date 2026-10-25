import { ModuleRef } from '@nestjs/core';
import { RequestContext, SystemContext } from '@stynx-nyx/core';
import { Database, type Transaction, type StynxDataRole } from '@stynx-nyx/data';
import { createFakeTransaction } from '@stynx-nyx/testing';
import { I18nAdminService } from '../../src/i18n-admin.service.js';
import { CatalogService } from '../../src/catalog.service.js';
import { LocaleService } from '../../src/locale.service.js';

const TENANT_A = '00000000-0000-4000-8000-000000000001';
const TENANT_B = '00000000-0000-4000-8000-000000000002';

function fixture() {
  const context = {
    active: true,
    tenantId: TENANT_A as string | undefined,
    actorId: 'actor-a' as string | undefined,
    locale: undefined,
    hasActiveContext() {
      return this.active;
    },
  };
  let system = false;
  const transactions: ReturnType<typeof createFakeTransaction>[] = [];
  const run = async (
    fn: (trx: Transaction) => Promise<unknown>,
    options: { role: StynxDataRole },
  ) => {
    const fake = createFakeTransaction(
      [
        { rows: [{ settings: { 'i18n.override.pt-BR.title': 'Tenant A' } }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ],
      options,
    );
    transactions.push(fake);
    try {
      return await fn(fake.transaction);
    } finally {
      fake.transaction.close();
    }
  };
  const database = { withSystemContext: vi.fn(), txIndependent: vi.fn(run) };
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
    get query() {
      return transactions.flatMap((fake) => fake.queries);
    },
    run,
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
    await expect(f.admin.listTenantOverrides(TENANT_A)).resolves.toEqual({
      'i18n.override.pt-BR.title': 'Tenant A',
    });
    expect(f.database.txIndependent).toHaveBeenLastCalledWith(expect.any(Function), {
      role: 'reader',
      readonly: true,
      replica: false,
    });
    await f.admin.updateTenantOverrides(TENANT_A, {
      locale: 'pt-BR',
      catalog: { title: 'Updated' },
    });
    expect(f.database.txIndependent).toHaveBeenLastCalledWith(expect.any(Function), {
      role: 'app',
      readonly: false,
      replica: false,
    });
    expect(f.catalog.translate('title', 'pt-BR', {}, TENANT_A)).toBe('Updated');
    expect(f.database.withSystemContext).not.toHaveBeenCalled();
  });

  it('refuses legacy administration without an already active system capability', async () => {
    const f = fixture();
    await expect(f.admin.listOverrides(TENANT_A)).rejects.toThrow('system capability absent');
    await expect(
      f.admin.updateOverrides(TENANT_A, { locale: 'pt-BR', catalog: {} }),
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
      f.catalog.setTenantOverrides(TENANT_A, { 'i18n.override.pt-BR.title': 'Warm' });
      f.system();
      if (admission === 'inactive') f.context.active = false;
      if (admission === 'missing tenant') f.context.tenantId = undefined;
      if (admission === 'missing actor') f.context.actorId = undefined;
      if (admission === 'blank actor') f.context.actorId = ' \t ';
      if (admission === 'wrong tenant') f.context.tenantId = TENANT_B;
      await expect(f.admin.listTenantOverrides(TENANT_A)).rejects.toThrow();
      await expect(
        f.admin.updateTenantOverrides(TENANT_A, {
          locale: 'pt-BR',
          catalog: { title: 'Poison' },
        }),
      ).rejects.toThrow();
      // A caller with no tenant frame may use its explicit internal capability. A
      // present tenant frame, however, cannot borrow that capability for a cache hit.
      if (admission !== 'inactive' && admission !== 'missing tenant') {
        expect(() => f.catalog.translate('title', 'pt-BR', {}, TENANT_A)).toThrow();
        await expect(f.catalog.primeTenantOverrides(TENANT_A)).rejects.toThrow();
        expect(() => f.catalog.setTenantOverrides(TENANT_A, {})).toThrow();
      }
      expect(f.database.txIndependent).not.toHaveBeenCalled();
      expect(f.database.withSystemContext).not.toHaveBeenCalled();
    });
  }

  it('keeps the prior cache when a transaction callback succeeds but COMMIT fails', async () => {
    const f = fixture();
    f.catalog.setTenantOverrides(TENANT_A, { 'i18n.override.pt-BR.title': 'Before' });
    f.database.txIndependent.mockImplementationOnce(async (fn) => {
      await f.run(fn, { role: 'app' });
      throw new Error('COMMIT refused');
    });
    await expect(
      f.admin.updateTenantOverrides(TENANT_A, {
        locale: 'pt-BR',
        catalog: { title: 'Uncommitted' },
      }),
    ).rejects.toThrow('COMMIT refused');
    expect(f.catalog.translate('title', 'pt-BR', {}, TENANT_A)).toBe('Before');
  });

  it('publishes new cache only after the transaction promise resolves', async () => {
    const f = fixture();
    f.catalog.setTenantOverrides(TENANT_A, { 'i18n.override.pt-BR.title': 'Before' });
    let commit!: () => void;
    const committed = new Promise<void>((resolve) => {
      commit = resolve;
    });
    f.database.txIndependent.mockImplementationOnce(async (fn) => {
      const result = await f.run(fn, { role: 'app' });
      await committed;
      return result;
    });
    const update = f.admin.updateTenantOverrides(TENANT_A, {
      locale: 'pt-BR',
      catalog: { title: 'After' },
    });
    await Promise.resolve();
    expect(f.catalog.translate('title', 'pt-BR', {}, TENANT_A)).toBe('Before');
    commit();
    await update;
    expect(f.catalog.translate('title', 'pt-BR', {}, TENANT_A)).toBe('After');
  });

  it('does not touch tenant SQL or cached translations on public pre-authentication resolution', async () => {
    const f = fixture();
    f.catalog.setTenantOverrides(TENANT_A, { 'i18n.override.pt-BR.title': 'Secret' });
    f.context.actorId = undefined;
    const mutator = { patch: vi.fn() };
    const providers = {
      get(token: unknown) {
        return token === RequestContext ? f.context : token === Database ? f.database : mutator;
      },
    } as ModuleRef;
    const locale = new LocaleService(providers, f.catalog);
    // SM-19: no locale configured, so the pre-authentication fallback is en-US.
    await expect(locale.resolve('unsupported')).resolves.toBe('en-US');
    expect(locale.t('title')).toBe('title');
    await expect(locale.resolve('en-US')).resolves.toBe('en-US');
    expect(f.query).toHaveLength(0);
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
      return f.run(fn, { role: 'reader' });
    });
    const prime = f.catalog.primeTenantOverrides(TENANT_A);
    f.context.tenantId = TENANT_B;
    release();
    await expect(prime).rejects.toThrow('I18n tenant differs');
    f.context.tenantId = TENANT_A;
    expect(f.catalog.translate('title', 'pt-BR', {}, TENANT_A)).toBe('title');
  });

  it('refuses tenant cache APIs without either caller capability', async () => {
    const f = fixture();
    f.context.active = false;
    expect(() => f.catalog.setTenantOverrides(TENANT_A, {})).toThrow('system capability absent');
    expect(() => f.catalog.translate('title', 'pt-BR', {}, TENANT_A)).toThrow(
      'system capability absent',
    );
    await expect(f.catalog.primeTenantOverrides(TENANT_A)).rejects.toThrow(
      'system capability absent',
    );
    expect(f.query).toHaveLength(0);
  });
  it('admits a matching internal system tenant frame and refuses mismatched or incomplete frames before SQL', async () => {
    const f = fixture();
    f.system();
    await expect(f.admin.listOverrides(TENANT_A)).resolves.toEqual({
      'i18n.override.pt-BR.title': 'Tenant A',
    });
    expect(f.database.txIndependent).toHaveBeenLastCalledWith(expect.any(Function), {
      role: 'owner',
      readonly: true,
      replica: false,
    });
    f.database.txIndependent.mockClear();
    f.context.tenantId = TENANT_B;
    await expect(f.admin.listOverrides(TENANT_A)).rejects.toThrow();
    await expect(
      f.admin.updateOverrides(TENANT_A, { locale: 'pt-BR', catalog: { title: 'Poison' } }),
    ).rejects.toThrow();
    f.context.tenantId = TENANT_A;
    f.context.actorId = undefined;
    await expect(f.admin.listOverrides(TENANT_A)).rejects.toThrow();
    await expect(
      f.admin.updateOverrides(TENANT_A, { locale: 'pt-BR', catalog: { title: 'Poison' } }),
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
