import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

// INV-OFFLINE-001; UPS-OFS-05 (#317): forward-only 0003 keeps forced RLS and grants and
// enforces one reservation per tenant idempotency key.
describe('offline sync reservation idempotency migration 0003', () => {
  it('adds tenant-scoped nullable reservation keys without weakening RLS or grants', async () => {
    const database = await createPostgresTestDatabase('stynx_ofs_reserve_key_ddl', { useTemplate: false });
    const client = await database.connectAsAdmin();
    const platform = resolve(__dirname, '../../packages/data/migrations/platform');
    const offline = resolve(__dirname, '../../packages/offline-sync/migrations');
    const tenantA = 'a3333333-3333-4333-8333-333333333333';
    const tenantB = 'b4444444-4444-4444-8444-444444444444';
    const range = '30000000-0000-4000-8000-000000000001';
    const rangeB = '30000000-0000-4000-8000-000000000002';
    const reservation = (id: string, tenant: string, rangeId: string, key: string | null, fingerprint: string | null) => client.query(`
      insert into offline.numbering_reservations
        (id, tenant_id, range_id, org_unit_id, entity_type, series, agent_id, device_id, shift_id,
         start_number, end_number, next_number, valid_until, idempotency_key, idempotency_fingerprint)
      values ($1::uuid, $2::uuid, $3::uuid, 'org', 'record', 'S', 'agent', 'device', 'shift',
              1, 1, 1, clock_timestamp() + interval '1 day', $4, $5)`, [id, tenant, rangeId, key, fingerprint]);
    try {
      for (const filename of (await readdir(platform)).filter((file) => file.endsWith('.sql')).sort()) {
        await client.query(await readFile(resolve(platform, filename), 'utf8'));
        if (filename === '0002_extensions.sql') await client.query('set role stynx_owner');
      }
      await client.query('reset role');
      for (const filename of ['0001_offline_sync.sql', '0002_durable_sync.sql', '0003_reservation_idempotency.sql'])
        await client.query(await readFile(resolve(offline, filename), 'utf8'));

      const security = await client.query<{ forced: boolean; app_write: boolean; reader_select: boolean; reader_write: boolean }>(`
        select c.relforcerowsecurity as forced,
               has_column_privilege('stynx_app', c.oid, 'idempotency_key', 'INSERT') as app_write,
               has_column_privilege('stynx_reader', c.oid, 'idempotency_key', 'SELECT') as reader_select,
               has_column_privilege('stynx_reader', c.oid, 'idempotency_key', 'INSERT') as reader_write
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'offline' and c.relname = 'numbering_reservations'`);
      expect(security.rows).toEqual([{ forced: true, app_write: true, reader_select: true, reader_write: false }]);
      const index = await client.query<{ indexdef: string }>(`select indexdef from pg_indexes
        where schemaname = 'offline' and indexname = 'numbering_reservations_tenant_idempotency_uq'`);
      expect(index.rows[0]?.indexdef).toMatch(/UNIQUE INDEX .* \(tenant_id, idempotency_key\) WHERE \(idempotency_key IS NOT NULL\)/u);

      await client.query(`insert into tenancy.tenants (id, slug, name) values
        ($1::uuid, 'ofs-key-a', 'OFS key A'), ($2::uuid, 'ofs-key-b', 'OFS key B')`, [tenantA, tenantB]);
      await client.query(`insert into offline.numbering_ranges
        (id, tenant_id, org_unit_id, entity_type, series, start_number, end_number, next_number)
        values ($1::uuid, $2::uuid, 'org', 'record', 'S', 1, 10, 1), ($3::uuid, $4::uuid, 'org', 'record', 'S', 1, 10, 1)`,
      [range, tenantA, rangeB, tenantB]);
      await reservation('40000000-0000-4000-8000-000000000001', tenantA, range, 'key-1', 'fp');
      await reservation('40000000-0000-4000-8000-000000000002', tenantA, range, null, null);
      await reservation('40000000-0000-4000-8000-000000000003', tenantA, range, null, null);
      await reservation('40000000-0000-4000-8000-000000000004', tenantB, rangeB, 'key-1', 'fp');
      await expect(reservation('40000000-0000-4000-8000-000000000005', tenantA, range, 'key-1', 'fp')).rejects.toMatchObject({ code: '23505' });
      await expect(reservation('40000000-0000-4000-8000-000000000006', tenantA, range, 'key-2', null)).rejects.toMatchObject({ code: '23514' });
      await expect(reservation('40000000-0000-4000-8000-000000000007', tenantA, range, '', 'fp')).rejects.toMatchObject({ code: '23514' });

      await client.query('set role stynx_app');
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      const visible = await client.query<{ tenant_id: string }>(
        `select tenant_id::text from offline.numbering_reservations where idempotency_key = 'key-1'`);
      expect(visible.rows).toEqual([{ tenant_id: tenantA }]);
      await client.query('rollback');
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.query('reset role').catch(() => undefined);
      await client.end();
      await database.dispose();
    }
  });
});
