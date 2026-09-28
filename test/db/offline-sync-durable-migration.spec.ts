import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

// INV-OFFLINE-001; UPS-OFS-01…04: package DDL must work on the canonical
// platform schema and enforce tenant isolation with real runtime roles.
describe('offline sync durable migration 0002', () => {
  it('upgrades 0001 with forced RLS and tenant-scoped app/reader grants', async () => {
    const database = await createPostgresTestDatabase('stynx_ofs_durable_ddl', {
      useTemplate: false,
    });
    const client = await database.connectAsAdmin();
    const platform = resolve(__dirname, '../../packages/data/migrations/platform');
    const offline = resolve(__dirname, '../../packages/offline-sync/migrations');
    const tenantA = 'a1111111-1111-4111-8111-111111111111';
    const tenantB = 'b2222222-2222-4222-8222-222222222222';
    const tables = [
      'sync_batches',
      'sync_batch_transport_keys',
      'sync_item_receipts',
      'sync_item_attempts',
      'numbering_consumption',
      'sync_conflict_evidence',
    ];
    try {
      const migrations = (await readdir(platform))
        .filter((file) => file.endsWith('.sql'))
        .sort();
      for (const filename of migrations) {
        await client.query(await readFile(resolve(platform, filename), 'utf8'));
        if (filename === '0002_extensions.sql') await client.query('set role stynx_owner');
      }
      await client.query('reset role');
      await client.query(await readFile(resolve(offline, '0001_offline_sync.sql'), 'utf8'));
      await client.query(await readFile(resolve(offline, '0002_durable_sync.sql'), 'utf8'));

      const security = await client.query<{
        table_name: string;
        enabled: boolean;
        forced: boolean;
        app_write: boolean;
        reader_select: boolean;
        reader_write: boolean;
      }>(`
        select c.relname as table_name,
               c.relrowsecurity as enabled,
               c.relforcerowsecurity as forced,
               has_table_privilege('stynx_app', c.oid, 'INSERT') as app_write,
               has_table_privilege('stynx_reader', c.oid, 'SELECT') as reader_select,
               has_table_privilege('stynx_reader', c.oid, 'INSERT') as reader_write
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'offline' and c.relname = any($1::text[])
        order by c.relname
      `, [tables]);
      expect(security.rows).toEqual([...tables].sort().map((table_name) => ({
        table_name,
        enabled: true,
        forced: true,
        app_write: true,
        reader_select: true,
        reader_write: false,
      })));

      const transportKeyPrimaryColumns = await client.query<{ column_name: string }>(`
        select kcu.column_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on kcu.constraint_schema = tc.constraint_schema
         and kcu.constraint_name = tc.constraint_name
        where tc.table_schema = 'offline'
          and tc.table_name = 'sync_batch_transport_keys'
          and tc.constraint_type = 'PRIMARY KEY'
        order by kcu.ordinal_position
      `);
      expect(transportKeyPrimaryColumns.rows.map((row) => row.column_name)).toEqual([
        'tenant_id', 'transport_key',
      ]);

      await client.query(`
        insert into tenancy.tenants (id, slug, name)
        values ($1::uuid, 'ofs-ddl-a', 'OFS DDL A'),
               ($2::uuid, 'ofs-ddl-b', 'OFS DDL B')
      `, [tenantA, tenantB]);
      await client.query(`
        insert into offline.sync_batches
          (tenant_id, device_id, device_batch_id, org_unit_id, agent_id,
           context_hash, declared_keys, status)
        values ($1::uuid, 'device-a', 'batch-a', 'org-a', 'agent-a',
                'hash-a', '[]'::jsonb, 'open'),
               ($2::uuid, 'device-b', 'batch-b', 'org-b', 'agent-b',
                'hash-b', '[]'::jsonb, 'open')
      `, [tenantA, tenantB]);
      await client.query(`
        insert into offline.sync_batch_transport_keys
          (tenant_id, transport_key, device_id, device_batch_id, transport_fingerprint)
        values ($1::uuid, 'shared-transport-key', 'device-a', 'batch-a', 'fingerprint-a'),
               ($2::uuid, 'shared-transport-key', 'device-b', 'batch-b', 'fingerprint-b')
      `, [tenantA, tenantB]);

      for (const role of ['stynx_app', 'stynx_reader'] as const) {
        await client.query(`set role ${role}`);
        await client.query('begin');
        await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
        const visible = await client.query<{ tenant_id: string }>(
          'select tenant_id::text from offline.sync_batches',
        );
        expect(visible.rows).toEqual([{ tenant_id: tenantA }]);
        const visibleTransportKeys = await client.query<{ tenant_id: string; transport_fingerprint: string }>(
          'select tenant_id::text, transport_fingerprint from offline.sync_batch_transport_keys',
        );
        expect(visibleTransportKeys.rows).toEqual([{
          tenant_id: tenantA,
          transport_fingerprint: 'fingerprint-a',
        }]);
        await client.query('rollback');
        await client.query('reset role');
      }

      await client.query('set role stynx_app');
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(client.query(`
        insert into offline.sync_batches
          (tenant_id, device_id, device_batch_id, org_unit_id, agent_id,
           context_hash, declared_keys, status)
        values ($1::uuid, 'foreign', 'foreign', 'org-b', 'agent-b',
                'foreign', '[]'::jsonb, 'open')
      `, [tenantB])).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback');

      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(client.query(`
        insert into offline.sync_batch_transport_keys
          (tenant_id, transport_key, device_id, device_batch_id, transport_fingerprint)
        values ($1::uuid, 'foreign-key', 'device-b', 'batch-b', 'foreign-fingerprint')
      `, [tenantB])).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback');
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.query('reset role').catch(() => undefined);
      await client.end();
      await database.dispose();
    }
  });
});
