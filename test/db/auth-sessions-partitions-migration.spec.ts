import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

// auth.sessions is partitioned by month. Migration 0023 must keep inserts working
// across month rollovers: the current and next month exist after migrating, and
// the app role can create any month within the maintained window, but no other.
describe('auth sessions partition migration 0023', () => {
  it('maintains monthly session partitions within a bounded window for the app role', async () => {
    const database = await createPostgresTestDatabase('stynx_auth_sessions_partitions', {
      useTemplate: false,
    });
    const client = await database.connectAsAdmin();
    const migrations = resolve(__dirname, '../../packages/data/migrations/platform');
    const tenantId = 'a1111111-1111-4111-8111-111111111111';
    const userId = 'b2222222-2222-4222-8222-222222222222';
    const monthName = async (offset: number): Promise<string> => {
      const result = await client.query<{ name: string }>(
        `select 'sessions_' || to_char(date_trunc('month', clock_timestamp()) + ($1::int * interval '1 month'), 'YYYY_MM') as name`,
        [offset],
      );
      return result.rows[0]!.name;
    };
    const monthStart = (offset: number): string =>
      `date_trunc('month', clock_timestamp()) + (${offset} * interval '1 month') + interval '1 day'`;
    const ensureAsApp = async (offset: number): Promise<string> => {
      await client.query('set role stynx_app');
      try {
        const result = await client.query<{ name: string }>(
          `select auth.ensure_sessions_partition(${monthStart(offset)}) as name`,
        );
        return result.rows[0]!.name;
      } finally {
        await client.query('reset role');
      }
    };
    const insertSession = (offset: number, sid: string) =>
      client.query(
        `insert into auth.sessions (tenant_id, user_id, sid, status, created_at, expires_at)
         values ($1::uuid, $2::uuid, $3, 'active', ${monthStart(offset)}, ${monthStart(offset)} + interval '1 hour')`,
        [tenantId, userId, sid],
      );
    const errorCode = async (offset: string): Promise<string | undefined> => {
      await client.query('set role stynx_app');
      try {
        await client.query(`select auth.ensure_sessions_partition(${offset})`);
        return undefined;
      } catch (error) {
        return (error as { code?: string }).code;
      } finally {
        await client.query('reset role');
      }
    };

    try {
      const files = (await readdir(migrations)).filter((file) => file.endsWith('.sql')).sort();
      expect(files).toContain('0023_auth_sessions_partitions.sql');
      for (const filename of files) {
        await client.query(await readFile(resolve(migrations, filename), 'utf8'));
        if (filename === '0002_extensions.sql') await client.query('set role stynx_owner');
        if (filename === '0023_auth_sessions_partitions.sql') break;
      }
      await client.query('reset role');

      const fn = await client.query<{
        definer: boolean;
        config: string[];
        public_execute: boolean;
        app_execute: boolean;
      }>(`
        select p.prosecdef as definer,
               p.proconfig as config,
               has_function_privilege('public', p.oid, 'execute') as public_execute,
               has_function_privilege('stynx_app', p.oid, 'execute') as app_execute
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'auth' and p.proname = 'ensure_sessions_partition'
      `);
      expect(fn.rows).toEqual([
        {
          definer: true,
          config: ['search_path=pg_catalog, auth'],
          public_execute: false,
          app_execute: true,
        },
      ]);

      const partitions = await client.query<{ name: string }>(`
        select c.relname as name from pg_inherits i
        join pg_class c on c.oid = i.inhrelid
        where i.inhparent = 'auth.sessions'::regclass order by 1
      `);
      expect(partitions.rows.map((row) => row.name)).toEqual([
        await monthName(0),
        await monthName(1),
      ]);

      await client.query(
        `insert into tenancy.tenants (id, slug, name) values ($1::uuid, 'sessions-a', 'Sessions A')`,
        [tenantId],
      );
      await client.query(
        `insert into auth.users (id, email) values ($1::uuid, 'sessions-a@example.test')`,
        [userId],
      );

      // The next month already exists, so a rollover insert succeeds without the writer.
      await expect(insertSession(1, 'sid-next-month')).resolves.toMatchObject({ rowCount: 1 });

      // A past month inside the window is missing until the app role ensures it.
      await expect(insertSession(-3, 'sid-before-ensure')).rejects.toMatchObject({ code: '23514' });
      expect(await ensureAsApp(-3)).toBe(await monthName(-3));
      expect(await ensureAsApp(-3)).toBe(await monthName(-3));
      await expect(insertSession(-3, 'sid-after-ensure')).resolves.toMatchObject({ rowCount: 1 });
      expect(await ensureAsApp(0)).toBe(await monthName(0));

      // Outside the maintained window and a null reference are refused; nothing is created.
      expect(await errorCode(monthStart(2))).toBe('22023');
      expect(await errorCode(monthStart(-13))).toBe('22023');
      expect(await errorCode('null')).toBe('22004');
      const after = await client.query<{ count: string }>(
        `select count(*)::text as count from pg_inherits where inhparent = 'auth.sessions'::regclass`,
      );
      expect(after.rows).toEqual([{ count: '3' }]);
    } finally {
      await client.query('reset role').catch(() => undefined);
      await client.end();
      await database.dispose();
    }
  });
});
