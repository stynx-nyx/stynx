import {
  canonicalSeedIds,
  createDbRuntimeFixture,
  type DbRuntimeFixture,
} from '../fixtures';

const tenantA = '10000000-0000-0000-0000-000000000001';
const tenantB = '10000000-0000-0000-0000-000000000002';
const userA = '20000000-0000-0000-0000-000000000001';

type PgError = Error & { code?: string };

async function expectPgError(
  action: () => Promise<unknown>,
  expected: { code: string; message: RegExp },
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const pgError = error as PgError;
    expect(pgError.code).toBe(expected.code);
    expect(pgError.message).toMatch(expected.message);
    return;
  }

  throw new Error('Expected Postgres error');
}

describe('auth tenant context runtime helpers', () => {
  let fixture: DbRuntimeFixture;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_auth_tenant_context');
  });

  beforeEach(async () => {
    await fixture.client.query('select auth.set_tenant(null)');
    await fixture.client.query('select auth.set_user_context(null, null, null)');
    await fixture.client.query('drop schema if exists w3_auth_runtime cascade');
    await fixture.client.query('create schema w3_auth_runtime');
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it('sets and clears user, role, language, and tenant context on the current connection', async () => {
    await fixture.client.query('select auth.set_user_context($1::uuid, $2::text[], $3::text)', [
      userA,
      ['Tenant:Admin', ' platform:SUPERADMIN ', '', 'tenant:user'],
      'pt-BR',
    ]);
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);

    const setResult = await fixture.client.query<{
      current_user_id: string;
      current_roles: string[];
      has_tenant_admin: boolean;
      has_missing_role: boolean;
      current_tenant: string;
      lang: string;
    }>(
      `
        select
          auth.current_user_id()::text as current_user_id,
          auth.current_roles() as current_roles,
          auth.has_role('tenant:admin') as has_tenant_admin,
          auth.has_role('tenant:missing') as has_missing_role,
          auth.current_tenant()::text as current_tenant,
          current_setting('auth.lang', true) as lang
      `,
    );

    expect(setResult.rows).toEqual([
      {
        current_user_id: userA,
        current_roles: ['tenant:admin', 'platform:superadmin', 'tenant:user'],
        has_tenant_admin: true,
        has_missing_role: false,
        current_tenant: tenantA,
        lang: 'pt-BR',
      },
    ]);

    await fixture.client.query('select auth.set_tenant(null)');
    await fixture.client.query('select auth.set_user_context(null, null, null)');

    const clearedResult = await fixture.client.query<{
      current_user_id: string | null;
      current_roles: string[];
      current_tenant: string | null;
      lang: string;
    }>(
      `
        select
          auth.current_user_id()::text as current_user_id,
          auth.current_roles() as current_roles,
          auth.current_tenant()::text as current_tenant,
          current_setting('auth.lang', true) as lang
      `,
    );

    expect(clearedResult.rows).toEqual([
      {
        current_user_id: null,
        current_roles: [],
        current_tenant: null,
        lang: '',
      },
    ]);
  });

  it('rejects a non-UUID user context value with SQLSTATE 22023', async () => {
    await fixture.client.query("select set_config('auth.app_user_id', 'not-a-uuid', false)");

    await expectPgError(
      () => fixture.client.query('select auth.current_user_id()'),
      {
        code: '22023',
        message: /auth\.current_user_id received non-uuid value not-a-uuid/,
      },
    );
  });

  it('keeps tenant context isolated per database connection', async () => {
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);

    const secondClient = await fixture.database.connectAsAdmin();
    try {
      const firstResult = await fixture.client.query<{ current_tenant: string }>(
        'select auth.current_tenant()::text as current_tenant',
      );
      const secondResult = await secondClient.query<{ current_tenant: string | null }>(
        'select auth.current_tenant()::text as current_tenant',
      );

      expect(firstResult.rows).toEqual([{ current_tenant: tenantA }]);
      expect(secondResult.rows).toEqual([{ current_tenant: null }]);
    } finally {
      await secondClient.end();
    }
  });

  it('enforces tenancy_id with auth.create_tenant_enforcement_trigger and auth.apply_tenant', async () => {
    await fixture.client.query(
      `
        create table w3_auth_runtime.tenancy_scoped_rows (
          row_id uuid primary key,
          tenancy_id uuid,
          label text not null
        )
      `,
    );
    await fixture.client.query(
      "select auth.create_tenant_enforcement_trigger('w3_auth_runtime', 'tenancy_scoped_rows', 'trig_tenancy_scoped_rows_tenant')",
    );
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);

    await fixture.client.query(
      `
        insert into w3_auth_runtime.tenancy_scoped_rows (row_id, label)
        values ('30000000-0000-0000-0000-000000000001', 'implicit tenant')
      `,
    );
    await fixture.client.query(
      `
        insert into w3_auth_runtime.tenancy_scoped_rows (row_id, tenancy_id, label)
        values ('30000000-0000-0000-0000-000000000002', $1::uuid, 'explicit current tenant')
      `,
      [tenantA],
    );

    const insertedRows = await fixture.client.query<{ row_id: string; tenancy_id: string }>(
      `
        select row_id::text, tenancy_id::text
        from w3_auth_runtime.tenancy_scoped_rows
        order by row_id
      `,
    );

    expect(insertedRows.rows).toEqual([
      {
        row_id: '30000000-0000-0000-0000-000000000001',
        tenancy_id: tenantA,
      },
      {
        row_id: '30000000-0000-0000-0000-000000000002',
        tenancy_id: tenantA,
      },
    ]);

    await expectPgError(
      () =>
        fixture.client.query(
          `
            insert into w3_auth_runtime.tenancy_scoped_rows (row_id, tenancy_id, label)
            values ('30000000-0000-0000-0000-000000000003', $1::uuid, 'wrong tenant')
          `,
          [tenantB],
        ),
      {
        code: '42501',
        message: /Tenant mismatch\. expected=10000000-0000-0000-0000-000000000001, provided=10000000-0000-0000-0000-000000000002/,
      },
    );
  });

  it('enforces tenant_id through auth.attach_tenant_enforcement_triggers and auth.apply_tenant_id', async () => {
    await fixture.client.query(
      `
        create table w3_auth_runtime.tenant_scoped_rows (
          row_id uuid primary key,
          tenant_id uuid,
          label text not null
        );

        create table w3_auth_runtime.unscoped_rows (
          row_id uuid primary key,
          label text not null
        );
      `,
    );
    await fixture.client.query(
      "select auth.attach_tenant_enforcement_triggers('w3_auth_runtime', 'trig_attached_tenant_context')",
    );

    const triggers = await fixture.client.query<{ table_name: string; trigger_name: string }>(
      `
        select event_object_table as table_name, trigger_name
        from information_schema.triggers
        where event_object_schema = 'w3_auth_runtime'
        order by event_object_table, trigger_name
      `,
    );

    expect(triggers.rows).toEqual([
      {
        table_name: 'tenant_scoped_rows',
        trigger_name: 'trig_attached_tenant_context',
      },
    ]);

    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);
    await fixture.client.query(
      `
        insert into w3_auth_runtime.tenant_scoped_rows (row_id, label)
        values ('40000000-0000-0000-0000-000000000001', 'implicit tenant')
      `,
    );

    const insertedRow = await fixture.client.query<{ tenant_id: string }>(
      `
        select tenant_id::text
        from w3_auth_runtime.tenant_scoped_rows
        where row_id = '40000000-0000-0000-0000-000000000001'
      `,
    );

    expect(insertedRow.rows).toEqual([{ tenant_id: tenantA }]);

    await expectPgError(
      () =>
        fixture.client.query(
          `
            insert into w3_auth_runtime.tenant_scoped_rows (row_id, tenant_id, label)
            values ('40000000-0000-0000-0000-000000000002', $1::uuid, 'wrong tenant')
          `,
          [tenantB],
        ),
      {
        code: '42501',
        message: /Tenant mismatch\. expected=10000000-0000-0000-0000-000000000001, provided=10000000-0000-0000-0000-000000000002/,
      },
    );
  });

  it('permits cross-tenant insert only when the session role context includes platform:superadmin', async () => {
    await fixture.client.query(
      `
        create table w3_auth_runtime.superadmin_bypass_rows (
          row_id uuid primary key,
          tenancy_id uuid,
          label text not null
        )
      `,
    );
    await fixture.client.query(
      "select auth.create_tenant_enforcement_trigger('w3_auth_runtime', 'superadmin_bypass_rows', 'trig_superadmin_bypass_tenant')",
    );

    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);
    await fixture.client.query('select auth.set_user_context($1::uuid, $2::text[], null)', [
      canonicalSeedIds.user,
      ['platform:superadmin'],
    ]);
    await fixture.client.query(
      `
        insert into w3_auth_runtime.superadmin_bypass_rows (row_id, tenancy_id, label)
        values ('50000000-0000-0000-0000-000000000001', $1::uuid, 'cross tenant')
      `,
      [tenantB],
    );

    const insertedRow = await fixture.client.query<{ tenancy_id: string }>(
      `
        select tenancy_id::text
        from w3_auth_runtime.superadmin_bypass_rows
        where row_id = '50000000-0000-0000-0000-000000000001'
      `,
    );

    expect(insertedRow.rows).toEqual([{ tenancy_id: tenantB }]);
  });
});
