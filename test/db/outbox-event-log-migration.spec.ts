import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

// INV-RBAC-001; CTG9: the platform event log starts in LEGACY ownership and
// tenant data remains isolated under the actual runtime roles.
describe('outbox event log migration 0021', () => {
  it('applies from empty, seeds LEGACY ownership, and denies cross-tenant access', async () => {
    const database = await createPostgresTestDatabase('stynx_outbox_event_log', { useTemplate: false });
    const client = await database.connectAsAdmin();
    const migrations = resolve(__dirname, '../../packages/data/migrations/platform');
    const tenantA = 'a1111111-1111-4111-8111-111111111111';
    const tenantB = 'b2222222-2222-4222-8222-222222222222';
    const eventA = '01900000-0000-7000-8000-000000000001';
    const eventB = '01900000-0000-7000-8000-000000000002';
    const tables = [
      'legacy_ownership', 'tenant_clock', 'events', 'event_delivery',
      'event_attempts', 'event_acks', 'legacy_event_map', 'ack_quarantine',
    ];
    try {
      const files = (await readdir(migrations)).filter((file) => file.endsWith('.sql')).sort();
      expect(files).toContain('0021_outbox_event_log.sql');
      for (const filename of files) {
        await client.query(await readFile(resolve(migrations, filename), 'utf8'));
        if (filename === '0002_extensions.sql') await client.query('set role stynx_owner');
        if (filename === '0021_outbox_event_log.sql') break;
      }
      const ownership = await client.query<{ state: string; generation: string }>(
        'select state, generation::text from outbox.legacy_ownership',
      );
      expect(ownership.rows).toEqual([{ state: 'LEGACY', generation: '0' }]);

      const security = await client.query<{ table_name: string; enabled: boolean; forced: boolean }>(`
        select relname as table_name, relrowsecurity as enabled, relforcerowsecurity as forced
        from pg_class where oid = any($1::regclass[]) order by relname
      `, [tables.map((table) => `outbox.${table}`)]);
      expect(security.rows).toEqual([...tables].sort().map((table_name) => ({
        table_name, enabled: true, forced: true,
      })));

      await client.query('reset role');
      await client.query(`
        insert into tenancy.tenants (id, slug, name)
        values ($1::uuid, 'ctg9-a', 'CTG9 A'), ($2::uuid, 'ctg9-b', 'CTG9 B')
      `, [tenantA, tenantB]);
      await client.query(`
        insert into outbox.events
          (id, tenant_id, entity, entity_id, idempotency_key, payload, created_at)
        values ($1::uuid, $3::uuid, 'test', 'a', 'a', '{}'::jsonb, now()),
               ($2::uuid, $4::uuid, 'test', 'b', 'b', '{}'::jsonb, now())
      `, [eventA, eventB, tenantA, tenantB]);
      await client.query(`
        insert into outbox.tenant_clock (tenant_id) values ($1::uuid), ($2::uuid)
      `, [tenantA, tenantB]);
      await client.query(`
        insert into outbox.event_delivery (tenant_id, event_id)
        values ($1::uuid, $2::uuid), ($3::uuid, $4::uuid)
      `, [tenantA, eventA, tenantB, eventB]);
      await client.query(`
        insert into outbox.event_attempts (tenant_id, event_id, attempt_ordinal, result)
        values ($1::uuid, $2::uuid, 1, 'sent'), ($3::uuid, $4::uuid, 1, 'sent')
      `, [tenantA, eventA, tenantB, eventB]);
      await client.query(`
        insert into outbox.event_acks (tenant_id, event_id, status, identity_verified, hmac_verified)
        values ($1::uuid, $2::uuid, 'ACKED', true, true),
               ($3::uuid, $4::uuid, 'ACKED', true, true)
      `, [tenantA, eventA, tenantB, eventB]);
      await client.query(`
        insert into outbox.legacy_event_map (legacy_id, tenant_id, event_id, generation)
        values ('01900000-0000-4000-8000-000000000011', $1::uuid, $2::uuid, 0),
               ('01900000-0000-4000-8000-000000000012', $3::uuid, $4::uuid, 0)
      `, [tenantA, eventA, tenantB, eventB]);

      await client.query('set role stynx_app');
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      for (const table of ['tenant_clock', 'events', 'event_delivery', 'event_attempts', 'event_acks', 'legacy_event_map']) {
        const visible = await client.query<{ tenant_id: string }>(
          `select tenant_id::text from outbox.${table}`,
        );
        expect(visible.rows).toEqual([{ tenant_id: tenantA }]);
      }
      const locked = await client.query<{ state: string }>(
        'select state from outbox.legacy_ownership for share',
      );
      expect(locked.rows).toEqual([{ state: 'LEGACY' }]);
      expect((await client.query(`
        update outbox.event_delivery set status = 'ERROR' where tenant_id = $1::uuid
      `, [tenantB])).rowCount).toBe(0);
      await client.query('rollback');

      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(client.query(`
        update outbox.legacy_ownership set state = 'NEW' where id = true
      `)).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback');

      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(client.query(`
        insert into outbox.events
          (id, tenant_id, entity, entity_id, idempotency_key, payload, created_at)
        values (gen_random_uuid(), $1::uuid, 'test', 'foreign', 'foreign', '{}'::jsonb, now())
      `, [tenantB])).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback');

      await client.query('reset role');
      await client.query('set role stynx_reader');
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(client.query('select * from outbox.events')).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback');
      await expect(client.query('select * from outbox.ack_quarantine')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.query('reset role').catch(() => undefined);
      await client.end();
      await database.dispose();
    }
  });
});
