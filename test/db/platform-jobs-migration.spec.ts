import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

// UPS-JOB-01/02: jobs exist in the platform migration graph, not root DDL.
describe('platform jobs migration and explicit seed', () => {
  it('applies the platform graph and seeds an actorful tenant schedule', async () => {
    const database = await createPostgresTestDatabase('stynx_jobs_seed', { useTemplate: false });
    const client = await database.connectAsAdmin();
    try {
      const migrations = resolve(__dirname, '../../packages/data/migrations/platform');
      for (const filename of (await readdir(migrations)).filter((file) => file.endsWith('.sql')).sort()) {
        await client.query(await readFile(resolve(migrations, filename), 'utf8'));
        if (filename === '0002_extensions.sql') await client.query('set role stynx_owner');
      }
      const seed = resolve(__dirname, '../../database/seed/platform/0019-jobs-actor-timezone.sql');
      await client.query(await readFile(seed, 'utf8'));
      await client.query('reset role');

      const rows = await client.query<{
        tenant_id: string;
        actor_id: string | null;
        timezone: string;
        is_enabled: boolean;
        membership_active: boolean;
      }>(`
        select s.tenant_id::text, s.actor_id::text, s.timezone, s.is_enabled,
               m.is_active as membership_active
        from jobs.schedules s
        join auth.memberships m on m.tenant_id = s.tenant_id and m.user_id = s.actor_id
        order by s.name
      `);
      expect(rows.rows.length).toBeGreaterThan(0);
      expect(rows.rows[0]).toEqual({
        tenant_id: '01900000-0000-4000-8000-000000000001',
        actor_id: '01900000-0000-4000-8000-000000000002',
        timezone: 'UTC',
        is_enabled: true,
        membership_active: true,
      });

      const checks = await client.query<{ convalidated: boolean; definition: string }>(`
        select convalidated, pg_get_constraintdef(c.oid) as definition
        from pg_constraint c
        where c.conrelid = 'jobs.schedules'::regclass
          and c.contype = 'c'
          and pg_get_constraintdef(c.oid) like '%actor_id%'
      `);
      expect(checks.rows).toHaveLength(1);
      expect(checks.rows[0]?.convalidated).toBe(true);
      expect(checks.rows[0]?.definition).toContain('actor_id IS NOT NULL');
      expect(checks.rows[0]?.definition).toContain('NOT is_enabled');
      const fk = await client.query<{ confdeltype: string }>(`
        select confdeltype from pg_constraint
        where conrelid = 'jobs.schedules'::regclass and contype = 'f'
          and conkey = array[(select attnum from pg_attribute
                              where attrelid = 'jobs.schedules'::regclass and attname = 'actor_id')]::smallint[]
      `);
      expect(fk.rows).toEqual([{ confdeltype: 'r' }]);
    } finally {
      await client.end();
      await database.dispose();
    }
  });
});
