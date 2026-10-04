import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

// ADR-SESSIONS-0003: an auth.sessions month partition is retained until 90 days
// after the month ends and is then dropped by the owner-run, dry-run-first sweep.
describe('auth sessions partition retention migration 0024', () => {
  it('drops only expired session months, owner-only, and never resurrects them', async () => {
    const database = await createPostgresTestDatabase('stynx_auth_sessions_retention', {
      useTemplate: false,
    });
    const client = await database.connectAsAdmin();
    const migrations = resolve(__dirname, '../../packages/data/migrations/platform');
    const tenantId = 'c3333333-3333-4333-8333-333333333333';
    const userId = 'd4444444-4444-4444-8444-444444444444';
    const monthStart = (offset: number): string =>
      `(date_trunc('month', clock_timestamp()) + (${offset} * interval '1 month'))::date`;
    const monthName = async (offset: number): Promise<string> => {
      const result = await client.query<{ name: string }>(
        `select 'sessions_' || to_char(${monthStart(offset)}, 'YYYY_MM') as name`,
      );
      return result.rows[0]!.name;
    };
    const partitions = async (): Promise<string[]> => {
      const result = await client.query<{ name: string }>(`
        select c.relname as name from pg_inherits i
        join pg_class c on c.oid = i.inhrelid
        where i.inhparent = 'auth.sessions'::regclass order by 1
      `);
      return result.rows.map((row) => row.name);
    };
    const sweep = async (dryRun: boolean) =>
      (
        await client.query<{ partition_name: string; dropped: boolean }>(
          'select partition_name, dropped from auth.drop_expired_sessions_partitions($1::boolean)',
          [dryRun],
        )
      ).rows;
    const errorCode = async (role: string, sql: string): Promise<string | undefined> => {
      await client.query(`set role ${role}`);
      try {
        await client.query(sql);
        return undefined;
      } catch (error) {
        return (error as { code?: string }).code;
      } finally {
        await client.query('reset role');
      }
    };

    try {
      const files = (await readdir(migrations)).filter((file) => file.endsWith('.sql')).sort();
      expect(files).toContain('0024_auth_sessions_partition_retention.sql');
      for (const filename of files) {
        await client.query(await readFile(resolve(migrations, filename), 'utf8'));
        if (filename === '0002_extensions.sql') await client.query('set role stynx_owner');
        if (filename === '0024_auth_sessions_partition_retention.sql') break;
      }
      await client.query('reset role');

      const grants = await client.query<{
        name: string;
        owner: boolean;
        app: boolean;
        public: boolean;
      }>(`
        select p.proname as name,
               has_function_privilege('stynx_owner', p.oid, 'execute') as owner,
               has_function_privilege('stynx_app', p.oid, 'execute') as app,
               has_function_privilege('public', p.oid, 'execute') as public
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'auth' and p.proname = 'drop_expired_sessions_partitions'
      `);
      expect(grants.rows).toEqual([
        { name: 'drop_expired_sessions_partitions', owner: true, app: false, public: false },
      ]);

      // Fixtures: an expired month (five months back, always beyond 90 days after its
      // end), an in-retention month created through the ensure function, and a
      // partition whose name the sweep must never interpret.
      const expired = await monthName(-5);
      await client.query(
        `create table auth.${expired} partition of auth.sessions
         for values from (${monthStart(-5)}) to (${monthStart(-4)})`,
      );
      await client.query('set role stynx_app');
      const retained = (
        await client.query<{ name: string }>(
          `select auth.ensure_sessions_partition(${monthStart(-2)} + interval '1 day') as name`,
        )
      ).rows[0]!.name;
      await client.query('reset role');
      expect(retained).toBe(await monthName(-2));
      await client.query(
        `create table auth.sessions_legacy partition of auth.sessions
         for values from (${monthStart(-9)}) to (${monthStart(-8)})`,
      );
      await client.query(
        `insert into tenancy.tenants (id, slug, name) values ($1::uuid, 'retention-a', 'Retention A')`,
        [tenantId],
      );
      await client.query(
        `insert into auth.users (id, email) values ($1::uuid, 'retention-a@example.test')`,
        [userId],
      );
      await client.query(
        `insert into auth.sessions (tenant_id, user_id, sid, status, created_at, expires_at)
         values ($1::uuid, $2::uuid, 'sid-expired', 'expired', ${monthStart(-5)} + interval '2 days', ${monthStart(-5)} + interval '3 days')`,
        [tenantId, userId],
      );

      const before = await partitions();
      expect(before).toEqual(
        [expired, retained, await monthName(0), await monthName(1), 'sessions_legacy'].sort(),
      );

      // The dry run (the default) lists only the expired month and changes nothing.
      expect(await sweep(true)).toEqual([{ partition_name: `auth.${expired}`, dropped: false }]);
      const defaultRun = await client.query<{ partition_name: string }>(
        'select partition_name from auth.drop_expired_sessions_partitions()',
      );
      expect(defaultRun.rows).toEqual([{ partition_name: `auth.${expired}` }]);
      expect(await partitions()).toEqual(before);

      // Only the owner may run the sweep.
      expect(
        await errorCode('stynx_app', 'select * from auth.drop_expired_sessions_partitions(false)'),
      ).toBe('42501');
      expect(
        await errorCode('stynx_owner', 'select * from auth.drop_expired_sessions_partitions(null)'),
      ).toBe('22004');

      await client.query('set role stynx_owner');
      try {
        expect(await sweep(false)).toEqual([{ partition_name: `auth.${expired}`, dropped: true }]);
        expect(await sweep(false)).toEqual([]);
      } finally {
        await client.query('reset role');
      }
      expect(await partitions()).toEqual(before.filter((name) => name !== expired));
      const expiredRows = await client.query<{ count: string }>(
        `select count(*)::text as count from auth.sessions where sid = 'sid-expired'`,
      );
      expect(expiredRows.rows).toEqual([{ count: '0' }]);

      // The ensure function never resurrects a month retention would drop.
      expect(
        await errorCode(
          'stynx_app',
          `select auth.ensure_sessions_partition(${monthStart(-5)} + interval '1 day')`,
        ),
      ).toBe('22023');
      expect(await partitions()).toEqual(before.filter((name) => name !== expired));
    } finally {
      await client.query('reset role').catch(() => undefined);
      await client.end();
      await database.dispose();
    }
  });
});
