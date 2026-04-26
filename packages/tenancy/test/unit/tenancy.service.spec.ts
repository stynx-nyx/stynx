import { NotFoundException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { TenancyService } from '../../src/tenancy.service';

const TENANT_ID = '018f53e4-28a1-7cd8-a0ff-5b22c3a07121';
const OWNER_ID = '018f53e4-28a1-7cd8-a0ff-5b22c3a07122';
const MEMBERSHIP_ID = '018f53e4-28a1-7cd8-a0ff-5b22c3a07123';
const OWNER_ROLE_ID = '018f53e4-28a1-7cd8-a0ff-5b22c3a07124';

function tenantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TENANT_ID,
    slug: 'tenant-alpha',
    name: 'Tenant Alpha',
    state: 'active',
    is_active: true,
    created_at: '2026-04-25T00:00:00.000Z',
    updated_at: '2026-04-25T00:00:00.000Z',
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
    settings: { theme: 'default' },
    suspended_reason: null,
    archived_at: null,
    ...overrides,
  };
}

describe('TenancyService', () => {
  function createService() {
    const txQuery = jest.fn();
    const database = {
      withSystemContext: jest.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()),
      tx: jest.fn(async (fn: (trx: { query: typeof txQuery }) => Promise<unknown>) => fn({ query: txQuery })),
    };
    const moduleRef = {
      get: jest.fn((token: unknown) => {
        if (typeof token === 'function' && token.name === 'Database') {
          return database;
        }
        return undefined;
      }),
    } as unknown as ModuleRef;
    const membershipCache = {
      invalidateTenant: jest.fn(),
    };
    const prefixProvisioner = {
      ensurePrefix: jest.fn(),
    };
    const inviteSender = {
      sendOwnerInvite: jest.fn(),
    };
    const archiveExporter = {
      exportPlaceholder: jest.fn().mockResolvedValue('exports/tenant.json'),
    };
    const purgeDelegate = {
      purgeTenant: jest.fn(),
    };

    const service = new TenancyService(
      moduleRef,
      membershipCache as never,
      prefixProvisioner as never,
      inviteSender as never,
      archiveExporter as never,
      purgeDelegate as never,
    );

    return { service, txQuery, database, membershipCache, prefixProvisioner, inviteSender, archiveExporter, purgeDelegate };
  }

  it('provisions a new tenant and fans out the expected side effects', async () => {
    const { service, txQuery, prefixProvisioner, inviteSender } = createService();
    txQuery.mockImplementation((sql: string, values?: unknown[]) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        expect(values).toEqual(['tenant-alpha']);
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('where tenant.slug = $1')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('insert into tenancy.tenants')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('insert into auth.users')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('select id::text as id from auth.users')) {
        expect(values).toEqual(['owner@example.test']);
        return Promise.resolve({ rows: [{ id: OWNER_ID }] });
      }
      if (sql.includes('insert into auth.roles')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('returning id::text as id')) {
        return Promise.resolve({ rows: [{ id: MEMBERSHIP_ID }] });
      }
      if (sql.includes("select id::text as id from auth.roles")) {
        expect(values).toEqual([expect.any(String)]);
        return Promise.resolve({ rows: [{ id: OWNER_ROLE_ID }] });
      }
      if (sql.includes('insert into auth.membership_roles')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('insert into auth.invitations')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes("set state = 'active'")) {
        expect(values).toEqual([expect.any(String)]);
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('where tenant.id = $1::uuid limit 1')) {
        expect(values).toEqual([expect.any(String)]);
        return Promise.resolve({
          rows: [tenantRow()],
        });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await service.provisionTenant({
      slug: 'tenant-alpha',
      name: 'Tenant Alpha',
      ownerEmail: 'owner@example.test',
    });

    expect(result.tenant.slug).toBe('tenant-alpha');
    expect(prefixProvisioner.ensurePrefix).toHaveBeenCalled();
    expect(inviteSender.sendOwnerInvite).toHaveBeenCalledWith(expect.objectContaining({
      tenantSlug: 'tenant-alpha',
      tenantName: 'Tenant Alpha',
      email: 'owner@example.test',
    }));
    expect(txQuery.mock.calls.filter(([sql]) => String(sql).includes('insert into auth.roles')).map(([, values]) => values)).toEqual([
      expect.arrayContaining(['owner', 'Owner']),
      expect.arrayContaining(['admin', 'Admin']),
      expect.arrayContaining(['member', 'Member']),
      expect.arrayContaining(['viewer', 'Viewer']),
    ]);
    expect(txQuery).toHaveBeenCalledWith(
      expect.stringContaining('insert into auth.membership_roles'),
      [MEMBERSHIP_ID, OWNER_ROLE_ID],
    );
  });

  it('archives and purges tenants while invalidating membership cache', async () => {
    const { service, txQuery, database, membershipCache, archiveExporter, purgeDelegate } = createService();
    txQuery.mockImplementation((sql: string, values?: unknown[]) => {
      if (sql.includes('where tenant.id = $1::uuid limit 1')) {
        expect(values).toEqual([TENANT_ID]);
        return Promise.resolve({
          rows: [tenantRow({
            state: 'archived',
            is_active: false,
            archived_at: '2026-04-25T00:00:00.000Z',
          })],
        });
      }
      if (sql.includes("state = 'archived'") || sql.includes("state = 'purged'")) {
        expect(values).toEqual([TENANT_ID]);
        return Promise.resolve({ rows: [] });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(service.archiveTenant(TENANT_ID)).resolves.toMatchObject({
      exportKey: 'exports/tenant.json',
    });
    await expect(service.purgeTenant(TENANT_ID)).resolves.toMatchObject({
      tenant: expect.objectContaining({ slug: 'tenant-alpha' }),
    });

    expect(archiveExporter.exportPlaceholder).toHaveBeenCalled();
    expect(purgeDelegate.purgeTenant).toHaveBeenCalledWith(TENANT_ID);
    expect(membershipCache.invalidateTenant).toHaveBeenCalledWith(TENANT_ID);
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining("state = 'archived'"), [TENANT_ID]);
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining("state = 'purged'"), [TENANT_ID]);
    expect(database.withSystemContext).toHaveBeenCalledWith(`tenant archive ${TENANT_ID}`, expect.any(Function));
    expect(database.withSystemContext).toHaveBeenCalledWith(`tenant purge ${TENANT_ID}`, expect.any(Function));
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), { role: 'owner' });
  });

  it('lists, gets, and updates tenants with owner-scoped database calls', async () => {
    const { service, txQuery, database } = createService();
    txQuery.mockImplementation((sql: string, values?: unknown[]) => {
      if (sql.includes('order by tenant.created_at desc')) {
        expect(values).toBeUndefined();
        return Promise.resolve({ rows: [tenantRow({ slug: 'tenant-list' })] });
      }
      if (sql.includes('where tenant.id = $1::uuid limit 1')) {
        expect(values).toEqual([TENANT_ID]);
        return Promise.resolve({ rows: [tenantRow({ name: 'Tenant Updated' })] });
      }
      if (sql.includes('update tenancy.tenants')) {
        expect(values?.[0]).toBe(TENANT_ID);
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('insert into tenancy.tenant_settings')) {
        expect(values?.[0]).toBe(TENANT_ID);
        return Promise.resolve({ rows: [] });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(service.listTenants()).resolves.toEqual([
      expect.objectContaining({ slug: 'tenant-list' }),
    ]);
    await expect(service.getTenant(TENANT_ID)).resolves.toMatchObject({ id: TENANT_ID });
    await expect(
      service.updateTenant(TENANT_ID, {
        name: 'Tenant Updated',
        timezone: 'UTC',
        locale: 'en-US',
        settings: { compact: true },
      }),
    ).resolves.toMatchObject({ name: 'Tenant Updated' });

    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('order by tenant.created_at desc'));
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('where tenant.id = $1::uuid limit 1'), [TENANT_ID]);
    expect(txQuery).toHaveBeenCalledWith(
      expect.stringContaining('update tenancy.tenants'),
      [TENANT_ID, 'tenant-alpha', 'Tenant Updated'],
    );
    expect(txQuery).toHaveBeenCalledWith(
      expect.stringContaining('insert into tenancy.tenant_settings'),
      [TENANT_ID, 'UTC', 'en-US', JSON.stringify({ compact: true })],
    );
    expect(database.withSystemContext).toHaveBeenCalledWith('tenant admin list tenants', expect.any(Function));
    expect(database.withSystemContext).toHaveBeenCalledWith(`tenant admin get ${TENANT_ID}`, expect.any(Function));
    expect(database.withSystemContext).toHaveBeenCalledWith(`tenant admin patch ${TENANT_ID}`, expect.any(Function));
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), { role: 'owner', readonly: true });
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), { role: 'owner' });
  });

  it('updates core tenant fields without writing settings when settings inputs are absent', async () => {
    const { service, txQuery } = createService();
    txQuery.mockImplementation((sql: string, values?: unknown[]) => {
      if (sql.includes('where tenant.id = $1::uuid limit 1')) {
        expect(values).toEqual([TENANT_ID]);
        return Promise.resolve({ rows: [tenantRow({ name: 'Name Only' })] });
      }
      if (sql.includes('update tenancy.tenants')) {
        expect(values).toEqual([TENANT_ID, 'tenant-alpha', 'Name Only']);
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('insert into tenancy.tenant_settings')) {
        throw new Error('tenant_settings should not be written');
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(service.updateTenant(TENANT_ID, { name: 'Name Only' })).resolves.toMatchObject({ name: 'Name Only' });
  });

  it('updates tenant settings when only one settings field is supplied', async () => {
    const { service, txQuery, database } = createService();
    txQuery.mockImplementation((sql: string, values?: unknown[]) => {
      if (sql.includes('where tenant.id = $1::uuid limit 1')) {
        expect(values).toEqual([TENANT_ID]);
        return Promise.resolve({ rows: [tenantRow()] });
      }
      if (sql.includes('update tenancy.tenants')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('insert into tenancy.tenant_settings')) {
        return Promise.resolve({ rows: [] });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(service.updateTenant(TENANT_ID, { locale: 'en-US' })).resolves.toMatchObject({ id: TENANT_ID });
    await expect(service.updateTenant(TENANT_ID, { settings: { compact: true } })).resolves.toMatchObject({
      id: TENANT_ID,
    });

    expect(txQuery).toHaveBeenCalledWith(
      expect.stringContaining('insert into tenancy.tenant_settings'),
      [TENANT_ID, 'America/Sao_Paulo', 'en-US', JSON.stringify({ theme: 'default' })],
    );
    expect(txQuery).toHaveBeenCalledWith(
      expect.stringContaining('insert into tenancy.tenant_settings'),
      [TENANT_ID, 'America/Sao_Paulo', 'pt-BR', JSON.stringify({ compact: true })],
    );
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), { role: 'owner' });
  });

  it('uses owner readonly transactions for single-tenant reads', async () => {
    const { service, txQuery, database } = createService();
    txQuery.mockResolvedValue({ rows: [tenantRow()] });

    await expect(service.getTenant(TENANT_ID)).resolves.toMatchObject({ id: TENANT_ID });

    expect(database.withSystemContext).toHaveBeenCalledTimes(1);
    expect(database.withSystemContext).toHaveBeenCalledWith(`tenant admin get ${TENANT_ID}`, expect.any(Function));
    expect(database.tx).toHaveBeenCalledTimes(1);
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), { role: 'owner', readonly: true });
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('where tenant.id = $1::uuid limit 1'), [TENANT_ID]);
  });

  it('suspends tenants with a trimmed reason and returns active session count', async () => {
    const { service, txQuery, database, membershipCache } = createService();
    txQuery.mockImplementation((sql: string, values?: unknown[]) => {
      if (sql.includes('where tenant.id = $1::uuid limit 1')) {
        expect(values).toEqual([TENANT_ID]);
        return Promise.resolve({
          rows: [tenantRow({ state: 'suspended', is_active: false, suspended_reason: 'policy review' })],
        });
      }
      if (sql.includes("state = 'suspended'")) {
        expect(values).toEqual([TENANT_ID, 'policy review']);
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('from auth.sessions')) {
        expect(values).toEqual([TENANT_ID]);
        return Promise.resolve({ rows: [{ count: '7' }] });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(service.suspendTenant(TENANT_ID, { reason: '  policy review  ' })).resolves.toMatchObject({
      activeSessionCount: 7,
      tenant: expect.objectContaining({ state: 'suspended' }),
    });

    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining("state = 'suspended'"), [TENANT_ID, 'policy review']);
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('from auth.sessions'), [TENANT_ID]);
    expect(database.withSystemContext).toHaveBeenCalledWith(`tenant suspend ${TENANT_ID}`, expect.any(Function));
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), { role: 'owner' });
    expect(membershipCache.invalidateTenant).toHaveBeenCalledWith(TENANT_ID);
  });

  it('uses default tenant side-effect adapters when none are provided', async () => {
    const txQuery = jest.fn((sql: string) => {
      if (sql.includes('where tenant.id = $1::uuid limit 1')) {
        return Promise.resolve({ rows: [tenantRow({ archived_at: '2026-04-25T00:00:00.000Z' })] });
      }
      if (sql.includes("state = 'archived'")) {
        return Promise.resolve({ rows: [] });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const database = {
      withSystemContext: jest.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()),
      tx: jest.fn(async (fn: (trx: { query: typeof txQuery }) => Promise<unknown>) => fn({ query: txQuery })),
    };
    const moduleRef = {
      get: jest.fn(() => database),
    } as unknown as ModuleRef;
    const membershipCache = { invalidateTenant: jest.fn() };
    const service = new TenancyService(moduleRef, membershipCache as never);

    await expect(service.archiveTenant(TENANT_ID)).resolves.toMatchObject({
      exportKey: `tenants/${TENANT_ID}/exports/placeholder.json`,
    });
  });

  it('throws when a tenant cannot be found', async () => {
    const { service, txQuery } = createService();
    txQuery.mockResolvedValue({ rows: [] });

    await expect(service.getTenant(TENANT_ID)).rejects.toMatchObject({ message: 'TENANT_NOT_FOUND' });
    await expect(service.updateTenant(TENANT_ID, { name: 'Missing Tenant' })).rejects.toMatchObject({
      message: 'TENANT_NOT_FOUND',
    });
    await expect(service.suspendTenant(TENANT_ID, { reason: 'missing' })).rejects.toMatchObject({
      message: 'TENANT_NOT_FOUND',
    });
    await expect(service.archiveTenant(TENANT_ID)).rejects.toMatchObject({ message: 'TENANT_NOT_FOUND' });
    await expect(service.purgeTenant(TENANT_ID)).rejects.toMatchObject({ message: 'TENANT_NOT_FOUND' });
  });
});
