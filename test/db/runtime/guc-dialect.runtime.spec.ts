import { createDbRuntimeFixture, type DbRuntimeFixture } from './fixtures';

// SM-05 acceptance on the bootstrap layout (ddl, then database/migrations, then seed):
// the RLS policies and every helper in the auth, audit and storage schemas read and
// write only app.* settings, the dialect Database.tx sets. The policy query alone
// is vacuous while policies route through helpers, so the helper bodies are
// checked too, and each policy must read app.tenant_id itself.

const bootstrapSchemas = ['auth', 'audit', 'storage'];
const legacyRead = String.raw`current_setting\(\s*'(auth|stynx)\.`;
const legacyWrite = String.raw`set_config\(\s*'(auth|stynx)\.`;
const tenantA = '60000000-0000-0000-0000-00000000a001';
const tenantB = '60000000-0000-0000-0000-00000000b001';
const actorA = '60000000-0000-0000-0000-00000000a101';

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

describe('bootstrap GUC dialect (SM-05)', () => {
  let fixture: DbRuntimeFixture;
  let runtimeRole: string;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_guc_dialect');
    runtimeRole = `stynx_guc_${fixture.database.database.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    await fixture.client.query(`CREATE ROLE ${quoteIdentifier(runtimeRole)} NOLOGIN NOBYPASSRLS`);
    await fixture.client.query(`GRANT USAGE ON SCHEMA auth TO ${quoteIdentifier(runtimeRole)}`);
    await fixture.client.query(`GRANT SELECT ON auth.tenancies TO ${quoteIdentifier(runtimeRole)}`);
    await fixture.client.query(
      `
        INSERT INTO auth.tenancies (tenancy_id, code, name)
        VALUES ($1::uuid, 'guc-a', 'GUC tenant A'), ($2::uuid, 'guc-b', 'GUC tenant B')
      `,
      [tenantA, tenantB],
    );
    // The seed leaves a session-wide superadmin context on this connection.
    await fixture.client.query('SELECT auth.set_tenant(NULL), auth.set_user_context(NULL, NULL)');
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.client.query('RESET ROLE').catch(() => undefined);
      if (runtimeRole) {
        await fixture.client
          .query(`DROP ROLE IF EXISTS ${quoteIdentifier(runtimeRole)}`)
          .catch(() => undefined);
      }
      await fixture.dispose();
    }
  });

  it('applies database/migrations between the bootstrap DDL and the seed', () => {
    const ddl = fixture.appliedFiles.filter((file) => file.startsWith('database/ddl/'));
    const migrations = fixture.appliedFiles.filter((file) => file.startsWith('database/migrations/'));
    const seed = fixture.appliedFiles.filter((file) => file.startsWith('database/seed/'));
    expect(migrations).toContain('database/migrations/001_app_guc_context.sql');
    expect(fixture.appliedFiles).toEqual([...ddl, ...migrations, ...seed]);
  });

  it('leaves no bootstrap policy reading an auth.* or stynx.* setting', async () => {
    const result = await fixture.client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM pg_policies
        WHERE coalesce(qual, '') || coalesce(with_check, '') ~ $1
      `,
      [legacyRead],
    );
    expect(result.rows).toEqual([{ count: '0' }]);
  });

  it('makes every bootstrap policy read app.tenant_id directly', async () => {
    const result = await fixture.client.query<{ policy: string; direct: boolean }>(
      `
        SELECT schemaname || '.' || tablename || '.' || policyname AS policy,
               coalesce(qual, '') ~ $2 AND coalesce(with_check, '') ~ $2 AS direct
        FROM pg_policies
        WHERE schemaname = ANY($1::text[])
        ORDER BY 1
      `,
      [bootstrapSchemas, String.raw`current_setting\('app\.tenant_id'::text, true\)`],
    );
    expect(result.rows).toEqual([
      { policy: 'audit.events.tenant_scope', direct: true },
      { policy: 'auth.tenancies.tenant_isolation', direct: true },
      { policy: 'auth.tenancy_members.membership_isolation', direct: true },
      { policy: 'auth.tenancy_members.tenant_isolation', direct: true },
      { policy: 'auth.user_groups.user_groups_isolation', direct: true },
      { policy: 'auth.user_roles.user_roles_isolation', direct: true },
      { policy: 'auth.users.users_isolation', direct: true },
      { policy: 'storage.files.tenant_scope', direct: true },
    ]);
  });

  it('leaves no bootstrap function reading or writing an auth.* or stynx.* setting', async () => {
    const result = await fixture.client.query<{ reads: string[]; writes: string[] }>(
      `
        SELECT
          coalesce(array_agg(n.nspname || '.' || p.proname ORDER BY n.nspname, p.proname) FILTER (WHERE p.prosrc ~ $2), '{}') AS reads,
          coalesce(array_agg(n.nspname || '.' || p.proname ORDER BY n.nspname, p.proname) FILTER (WHERE p.prosrc ~ $3), '{}') AS writes
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ANY($1::text[])
      `,
      [bootstrapSchemas, legacyRead, legacyWrite],
    );
    expect(result.rows).toEqual([{ reads: [], writes: [] }]);
  });

  it('keeps the setter signatures and writes the app.* settings', async () => {
    const client = await fixture.database.connectAsAdmin();
    try {
      await client.query('SELECT auth.set_user_context($1::uuid, $2::text[], $3::text)', [
        actorA,
        ['Tenant:Admin', 'platform:superadmin'],
        'pt-BR',
      ]);
      await client.query('SELECT auth.set_tenant($1::uuid)', [tenantA]);
      const result = await client.query<Record<string, string | null>>(
        `
          SELECT
            current_setting('app.actor_id', true) AS actor,
            current_setting('app.roles', true) AS roles,
            current_setting('app.lang', true) AS lang,
            current_setting('app.tenant_id', true) AS tenant,
            nullif(current_setting('auth.app_user_id', true), '') AS legacy_actor,
            nullif(current_setting('auth.roles', true), '') AS legacy_roles,
            nullif(current_setting('auth.current_tenant', true), '') AS legacy_tenant
        `,
      );
      expect(result.rows).toEqual([
        {
          actor: actorA,
          roles: 'Tenant:Admin,platform:superadmin',
          lang: 'pt-BR',
          tenant: tenantA,
          legacy_actor: null,
          legacy_roles: null,
          legacy_tenant: null,
        },
      ]);
    } finally {
      await client.end();
    }
  });

  it('scopes reads by app.tenant_id and bypasses with platform:superadmin in app.roles', async () => {
    async function visibleCodes(settings: Record<string, string>): Promise<string[]> {
      await fixture.client.query('BEGIN');
      try {
        for (const [name, value] of Object.entries(settings)) {
          await fixture.client.query('SELECT set_config($1, $2, true)', [name, value]);
        }
        await fixture.client.query(`SET LOCAL ROLE ${quoteIdentifier(runtimeRole)}`);
        const result = await fixture.client.query<{ code: string }>(
          `SELECT code FROM auth.tenancies WHERE tenancy_id IN ($1::uuid, $2::uuid) ORDER BY code`,
          [tenantA, tenantB],
        );
        return result.rows.map((row) => row.code);
      } finally {
        await fixture.client.query('ROLLBACK');
      }
    }

    expect(await visibleCodes({ 'app.tenant_id': tenantA })).toEqual(['guc-a']);
    expect(await visibleCodes({ 'app.tenant_id': tenantB, 'app.roles': 'tenant:admin' })).toEqual([
      'guc-b',
    ]);
    expect(
      await visibleCodes({ 'app.tenant_id': tenantA, 'app.roles': ' tenant:admin , Platform:SuperAdmin ' }),
    ).toEqual(['guc-a', 'guc-b']);
    expect(await visibleCodes({ 'auth.current_tenant': tenantA, 'auth.roles': 'platform:superadmin' })).toEqual(
      [],
    );
  });
});
