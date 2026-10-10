import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

// INV-OFFLINE-001; UPS-OFS-06, UPS-OFS-07 (ADR-MOBILE-OFFLINE-0003 D1, D2): migration 0004 widens the
// three status CHECK constraints with `pending` without touching stored rows and adds the append-only
// `offline.sync_conflict_actions` history with forced RLS, the shared policy and read/append-only grants.
describe('offline sync pending-state migration 0004', () => {
  it('upgrades a populated 0003 schema, admits pending, and installs the forced-RLS append-only action history', async () => {
    const database = await createPostgresTestDatabase('stynx_ofs_pending_ddl', {
      useTemplate: false,
    });
    const client = await database.connectAsAdmin();
    const platform = resolve(__dirname, '../../packages/data/migrations/platform');
    const offline = resolve(__dirname, '../../packages/offline-sync/migrations');
    const tenantA = 'a4444444-4444-4444-8444-444444444444';
    const tenantB = 'b5555555-5555-4555-8555-555555555555';
    const hash = `sha256:${'a'.repeat(64)}`;
    const conflictA = '0197aaaa-0000-4000-8000-00000000000a';
    const conflictB = '0197bbbb-0000-4000-8000-00000000000b';
    try {
      const migrations = (await readdir(platform)).filter((file) => file.endsWith('.sql')).sort();
      for (const filename of migrations) {
        await client.query(await readFile(resolve(platform, filename), 'utf8'));
        if (filename === '0002_extensions.sql') await client.query('set role stynx_owner');
      }
      await client.query('reset role');
      for (const name of [
        '0001_offline_sync.sql',
        '0002_durable_sync.sql',
        '0003_reservation_idempotency.sql',
      ])
        await client.query(await readFile(resolve(offline, name), 'utf8'));

      // A populated 0003 database: one conflict item per tenant with its batch, receipt and attempt.
      await client.query(
        `insert into tenancy.tenants (id, slug, name) values ($1::uuid, 'ofs-pending-a', 'A'), ($2::uuid, 'ofs-pending-b', 'B')`,
        [tenantA, tenantB],
      );
      for (const [tenant, conflictId] of [
        [tenantA, conflictA],
        [tenantB, conflictB],
      ] as const) {
        await client.query(
          `insert into offline.sync_batches (tenant_id, device_id, device_batch_id, org_unit_id, agent_id, context_hash, declared_keys, status)
           values ($1::uuid, 'dev', 'batch', 'org', 'agent', 'ctx', '["key"]'::jsonb, 'closed'),
                  ($1::uuid, 'dev', 'other-batch', 'org', 'agent', 'ctx-2', '["key"]'::jsonb, 'closed'),
                  ($1::uuid, 'dev', 'retry-batch', 'org', 'agent', 'ctx-3', '["key"]'::jsonb, 'closed')`,
          [tenant],
        );
        await client.query(
          `insert into offline.sync_queue_items (id, tenant_id, device_batch_id, org_unit_id, agent_id, device_id, entity_type,
             local_entity_id, idempotency_key, payload_hash, payload_json, status, created_locally_at, identity_mode)
           values ('item', $1::uuid, 'batch', 'org', 'agent', 'dev', 'citation', 'local', 'key', $2, '{}'::jsonb, 'conflict',
             '2026-09-28T12:00:00Z', 'ctg9')`,
          [tenant, hash],
        );
        await client.query(
          `insert into offline.sync_item_receipts (tenant_id, idempotency_key, queue_item_id, device_id, device_batch_id, payload_hash, status, context_json)
           values ($1::uuid, 'key', 'item', 'dev', 'batch', $2, 'conflict', '{"conflictId":"x"}'::jsonb)`,
          [tenant, hash],
        );
        await client.query(
          `insert into offline.sync_item_attempts (tenant_id, device_id, device_batch_id, queue_item_id, idempotency_key, payload_hash, status)
           values ($1::uuid, 'dev', 'other-batch', 'item', 'key', $2, 'rejected')`,
          [tenant, hash],
        );
        await client.query(
          `insert into offline.sync_conflicts (id, tenant_id, sync_queue_item_id, local_entity_id, payload_hash, conflict_type, description, status)
           values ($1::uuid, $2::uuid, 'item', 'local', $3, 'domain', 'OFFLINE_SYNC_NUMBERING_EXPIRED', 'open')`,
          [conflictId, tenant, hash],
        );
      }
      const before = await client.query<{ queue: string; receipts: string; attempts: string }>(
        `select (select count(*) from offline.sync_queue_items) as queue,
                (select count(*) from offline.sync_item_receipts) as receipts,
                (select count(*) from offline.sync_item_attempts) as attempts`,
      );

      const files = (await readdir(offline)).filter((name) => /^0004_.*\.sql$/.test(name));
      expect(files).toEqual(['0004_pending_state_and_conflict_actions.sql']);
      await client.query(await readFile(resolve(offline, files[0]!), 'utf8'));

      // Rows survive unchanged: same counts, same statuses, same context bytes.
      const after = await client.query<{ queue: string; receipts: string; attempts: string }>(
        `select (select count(*) from offline.sync_queue_items) as queue,
                (select count(*) from offline.sync_item_receipts) as receipts,
                (select count(*) from offline.sync_item_attempts) as attempts`,
      );
      expect(after.rows).toEqual(before.rows);
      expect(before.rows[0]).toEqual({ queue: '2', receipts: '2', attempts: '2' });
      const preserved = await client.query<{
        status: string;
        context_json: Record<string, unknown>;
      }>(
        `select r.status, r.context_json from offline.sync_item_receipts r where r.tenant_id = $1::uuid`,
        [tenantA],
      );
      expect(preserved.rows).toEqual([{ status: 'conflict', context_json: { conflictId: 'x' } }]);

      // The widened constraints keep their names and now admit `pending` on all three tables, nothing else new.
      const checks = await client.query<{
        table_name: string;
        constraint_name: string;
        definition: string;
      }>(`
        select c.conrelid::regclass::text as table_name, c.conname as constraint_name, pg_get_constraintdef(c.oid) as definition
        from pg_constraint c
        where c.contype = 'c' and c.conname in ('sync_queue_items_status_check', 'sync_item_receipts_status_check', 'sync_item_attempts_status_check')
        order by c.conname
      `);
      expect(checks.rows.map((row) => [row.table_name, row.constraint_name])).toEqual([
        ['offline.sync_item_attempts', 'sync_item_attempts_status_check'],
        ['offline.sync_item_receipts', 'sync_item_receipts_status_check'],
        ['offline.sync_queue_items', 'sync_queue_items_status_check'],
      ]);
      for (const row of checks.rows) {
        for (const status of ['received', 'applied', 'conflict', 'rejected', 'pending'])
          expect(row.definition).toContain(`'${status}'`);
        expect(row.definition).not.toContain('expired');
      }
      await client.query(
        `update offline.sync_queue_items set status = 'pending' where tenant_id = $1::uuid`,
        [tenantA],
      );
      await client.query(
        `update offline.sync_item_receipts set status = 'pending' where tenant_id = $1::uuid`,
        [tenantA],
      );
      await client.query(
        `insert into offline.sync_item_attempts (tenant_id, device_id, device_batch_id, queue_item_id, idempotency_key, payload_hash, status)
         values ($1::uuid, 'dev', 'retry-batch', 'item', 'key', $2, 'pending')`,
        [tenantA, hash],
      );
      const pending = await client.query<{ source: string; status: string }>(
        `select 'queue' as source, status from offline.sync_queue_items where tenant_id = $1::uuid
         union all select 'receipt', status from offline.sync_item_receipts where tenant_id = $1::uuid
         union all select 'attempt', status from offline.sync_item_attempts where tenant_id = $1::uuid and device_batch_id = 'retry-batch'`,
        [tenantA],
      );
      expect(pending.rows).toEqual([
        { source: 'queue', status: 'pending' },
        { source: 'receipt', status: 'pending' },
        { source: 'attempt', status: 'pending' },
      ]);
      for (const table of ['sync_queue_items', 'sync_item_receipts']) {
        await expect(
          client.query(
            `update offline.${table} set status = 'superseded' where tenant_id = $1::uuid`,
            [tenantA],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }

      // History table shape: tenant-leading key, composite FK to the conflict, bounded text, two resulting statuses.
      const columns = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(`
        select column_name, data_type, is_nullable from information_schema.columns
        where table_schema = 'offline' and table_name = 'sync_conflict_actions' order by ordinal_position
      `);
      expect(columns.rows).toEqual([
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'tenant_id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'conflict_id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'action', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'reason', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'user_ref', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'actor_id', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'resulting_status', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      ]);
      const keys = await client.query<{ constraint_type: string; columns: string[] }>(`
        select tc.constraint_type, array_agg(kcu.column_name::text order by kcu.ordinal_position) as columns
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on kcu.constraint_schema = tc.constraint_schema and kcu.constraint_name = tc.constraint_name
        where tc.table_schema = 'offline' and tc.table_name = 'sync_conflict_actions' and tc.constraint_type in ('PRIMARY KEY', 'FOREIGN KEY')
        group by tc.constraint_name, tc.constraint_type order by tc.constraint_type, columns
      `);
      expect(keys.rows).toEqual([
        { constraint_type: 'FOREIGN KEY', columns: ['tenant_id'] },
        { constraint_type: 'FOREIGN KEY', columns: ['tenant_id', 'conflict_id'] },
        { constraint_type: 'PRIMARY KEY', columns: ['tenant_id', 'id'] },
      ]);
      await expect(
        client.query(
          `insert into offline.sync_conflict_actions (tenant_id, conflict_id, action, actor_id, resulting_status)
         values ($1::uuid, $2::uuid, 'manual_review', 'actor', 'open')`,
          [tenantA, conflictB],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        client.query(
          `insert into offline.sync_conflict_actions (tenant_id, conflict_id, action, actor_id, resulting_status)
         values ($1::uuid, $2::uuid, 'manual_review', 'actor', 'pending')`,
          [tenantA, conflictA],
        ),
      ).rejects.toMatchObject({ code: '23514' });

      // Forced RLS with the sibling policy; the app role appends and reads only; the reader only reads.
      const security = await client.query<Record<string, unknown>>(`
        select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
               (select array_agg(p.polname::text) from pg_policy p where p.polrelid = c.oid) as policies,
               has_table_privilege('stynx_app', c.oid, 'SELECT') as app_select,
               has_table_privilege('stynx_app', c.oid, 'INSERT') as app_insert,
               has_table_privilege('stynx_app', c.oid, 'UPDATE') as app_update,
               has_table_privilege('stynx_app', c.oid, 'DELETE') as app_delete,
               has_table_privilege('stynx_reader', c.oid, 'SELECT') as reader_select,
               has_table_privilege('stynx_reader', c.oid, 'INSERT') as reader_insert,
               has_table_privilege('stynx_reader', c.oid, 'UPDATE') as reader_update,
               has_table_privilege('stynx_reader', c.oid, 'DELETE') as reader_delete
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'offline' and c.relname = 'sync_conflict_actions'
      `);
      expect(security.rows).toEqual([
        {
          enabled: true,
          forced: true,
          policies: ['offline_tenant_isolation'],
          app_select: true,
          app_insert: true,
          app_update: false,
          app_delete: false,
          reader_select: true,
          reader_insert: false,
          reader_update: false,
          reader_delete: false,
        },
      ]);
      const policy = await client.query<{
        cmd: string;
        roles: string;
        qual: string;
        with_check: string;
      }>(`
        select cmd, roles::text as roles, qual, with_check from pg_policies where schemaname = 'offline' and tablename = 'sync_conflict_actions'
      `);
      expect(policy.rows).toEqual([
        {
          cmd: 'ALL',
          roles: '{public}',
          qual: "(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)",
          with_check:
            "(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)",
        },
      ]);

      // Two tenants under the application role: own rows only, no cross-tenant insert, no update or delete at all.
      await client.query(
        `insert into offline.sync_conflict_actions (tenant_id, conflict_id, action, reason, user_ref, actor_id, resulting_status)
         values ($1::uuid, $2::uuid, 'manual_review', 'seeded', 'user-b', 'actor-b', 'open')`,
        [tenantB, conflictB],
      );
      await client.query('set role stynx_app');
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await client.query(
        `insert into offline.sync_conflict_actions (tenant_id, conflict_id, action, actor_id, resulting_status)
         values ($1::uuid, $2::uuid, 'retry_after_correction', 'actor-a', 'resolved')`,
        [tenantA, conflictA],
      );
      const visible = await client.query<{ tenant_id: string; action: string }>(
        'select tenant_id::text, action from offline.sync_conflict_actions',
      );
      expect(visible.rows).toEqual([{ tenant_id: tenantA, action: 'retry_after_correction' }]);
      await client.query('savepoint foreign_insert');
      await expect(
        client.query(
          `insert into offline.sync_conflict_actions (tenant_id, conflict_id, action, actor_id, resulting_status)
         values ($1::uuid, $2::uuid, 'reject', 'actor-a', 'resolved')`,
          [tenantB, conflictB],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback to savepoint foreign_insert');
      await client.query('savepoint own_update');
      await expect(
        client.query(`update offline.sync_conflict_actions set reason = 'edited'`),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback to savepoint own_update');
      await client.query('savepoint own_delete');
      await expect(client.query(`delete from offline.sync_conflict_actions`)).rejects.toMatchObject(
        { code: '42501' },
      );
      await client.query('rollback to savepoint own_delete');
      await client.query('commit');
      await client.query('reset role');

      await client.query('set role stynx_reader');
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantB]);
      const readerSees = await client.query<{ action: string; reason: string }>(
        'select action, reason from offline.sync_conflict_actions',
      );
      expect(readerSees.rows).toEqual([{ action: 'manual_review', reason: 'seeded' }]);
      await client.query('savepoint reader_insert');
      await expect(
        client.query(
          `insert into offline.sync_conflict_actions (tenant_id, conflict_id, action, actor_id, resulting_status)
         values ($1::uuid, $2::uuid, 'reject', 'reader', 'resolved')`,
          [tenantB, conflictB],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback to savepoint reader_insert');
      await client.query('rollback');
      await client.query('reset role');
      const total = await client.query<{ count: string }>(
        'select count(*) from offline.sync_conflict_actions',
      );
      expect(total.rows).toEqual([{ count: '2' }]);
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.query('reset role').catch(() => undefined);
      await client.end();
      await database.dispose();
    }
  }, 60_000);
});
