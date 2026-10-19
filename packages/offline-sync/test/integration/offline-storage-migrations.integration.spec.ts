import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { collectStorageCatalog } from '@stynx-nyx/data';
import { createPostgresTestDatabase } from '../../../data/test/support/postgres.js';
import {
  renderOfflineStorage,
  renderOfflineStorageMigrations,
  verifyOfflineStorage,
} from '../../src/storage.js';

// INV-OFFLINE-001: admitted forward prefixes preserve history and tenant isolation.
describe('Bound offline forward SQL on populated consumer installations', () => {
  it.each([1, 8, 5])(
    'preserves populated prefix 000%s and admits only supported forward upgrade with no reader',
    async (prefix) => {
      const postgres = await createPostgresTestDatabase('stynx_offline_forward', {
        useTemplate: false,
      });
      const admin = await postgres.connectAsAdmin();
      const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
      const options = {
        ownerRole: `forward_owner_${suffix}`,
        appRole: `forward_app_${suffix}`,
        readerRole: null,
        tenantTable: { schema: 'auth', table: 'tenants', column: 'tenant_uuid' },
      };
      const tenants = [randomUUID(), randomUUID()];
      let app: Client | undefined;
      const artifact = renderOfflineStorageMigrations(options);
      const apply = async (sql: string) => {
        await admin.query('begin');
        try {
          await admin.query(`set local role ${admin.escapeIdentifier(options.ownerRole)}`);
          await admin.query(sql);
          await admin.query('commit');
        } catch (error) {
          await admin.query('rollback');
          throw error;
        }
      };
      try {
        await admin.query(
          `create role ${admin.escapeIdentifier(options.ownerRole)} nosuperuser bypassrls noinherit`,
        );
        await admin.query(
          `create role ${admin.escapeIdentifier(options.appRole)} login nosuperuser nobypassrls noinherit`,
        );
        await postgres.ensureRoleLogin(options.appRole);
        await admin.query(
          `grant connect,create on database ${admin.escapeIdentifier(postgres.database)} to ${admin.escapeIdentifier(options.ownerRole)}`,
        );
        await apply('create schema auth;create table auth.tenants(tenant_uuid uuid primary key)');
        await admin.query('insert into auth.tenants values($1),($2)', tenants);
        await apply(artifact.migrations[0]!.sql);
        for (const [index, tenant] of tenants.entries()) {
          await admin.query(
            `insert into offline.sync_queue_items
          (id,tenant_id,device_batch_id,org_unit_id,agent_id,device_id,entity_type,local_entity_id,idempotency_key,payload_hash,payload_json,status,created_locally_at,received_at,created_at)
          values($1,$2,'historic-batch','org','business-agent','historic-device','record',$1,$1,$3,'{}','received','2020-01-02T03:04:05.123456Z','2020-01-02T03:04:06.123456Z','2020-01-02T03:04:06.123456Z')`,
            [`historic-${index}`, tenant, `sha256:${String(index + 1).repeat(64)}`],
          );
        }
        for (const migration of artifact.migrations.slice(1, prefix)) await apply(migration.sql);
        const historicalRows = async () =>
          (
            await admin.query(`select tenant_id,id,device_batch_id,agent_id,payload_hash,payload_json,status,
        to_char(created_locally_at,'YYYY-MM-DD HH24:MI:SS.US') as local_at,
        to_char(received_at,'YYYY-MM-DD HH24:MI:SS.US') as received_at
        from offline.sync_queue_items order by tenant_id,id`)
          ).rows;
        const before = await historicalRows();
        if (prefix === 5) {
          const range = randomUUID();
          await admin.query(
            `insert into offline.numbering_ranges
            (id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number)
            values($1,$2,'org','record','A',1,10,1)`,
            [range, tenants[0]],
          );
          for (let index = 0; index < 2; index++)
            await admin.query(
              `insert into offline.numbering_reservations
              (tenant_id,range_id,org_unit_id,entity_type,series,agent_id,device_id,shift_id,start_number,end_number,next_number,valid_until)
              values($1,$2,'org','record','A','business-agent','same-device','same-shift',$3,$3,$3,'2100-01-01')`,
              [tenants[0], range, index + 1],
            );
          const collisionRows = (
            await admin.query(
              'select to_jsonb(r)::text as bytes from offline.numbering_reservations r order by id',
            )
          ).rows;
          const collisionCatalog = await collectStorageCatalog(admin, 'offline');
          await expect(apply(artifact.migrations[5]!.sql)).rejects.toMatchObject({ code: 'STY45' });
          expect(
            (
              await admin.query(
                'select to_jsonb(r)::text as bytes from offline.numbering_reservations r order by id',
              )
            ).rows,
          ).toEqual(collisionRows);
          expect(await collectStorageCatalog(admin, 'offline')).toEqual(collisionCatalog);
          expect(await historicalRows()).toEqual(before);
          return;
        }
        const ledger = artifact.migrations
          .slice(0, prefix)
          .map(({ source, sqlSha256 }) => ({ ...source, sqlSha256 }));
        const selected = artifact.migrations.slice(ledger.length);
        expect(selected).toHaveLength(9 - prefix);
        for (const migration of selected) {
          await apply(migration.sql);
          ledger.push({ ...migration.source, sqlSha256: migration.sqlSha256 });
        }
        await apply(renderOfflineStorage(options).roleBindingsSql);
        expect(artifact.migrations.slice(ledger.length)).toEqual([]);
        expect(await historicalRows()).toEqual(before);
        expect(
          (await admin.query('select count(*)::int as n from offline.sync_item_receipts')).rows,
        ).toEqual([{ n: 2 }]);
        expect(
          (
            await admin.query(
              'select status,count(*)::int as n from offline.sync_batches group by status',
            )
          ).rows,
        ).toEqual([{ status: 'legacy_closed_unverified', n: 2 }]);
        expect(
          (await admin.query('select count(*)::int as n from offline.numbering_reconciliations'))
            .rows,
        ).toEqual([{ n: 0 }]);
        await admin.query(
          `begin read only;set local role ${admin.escapeIdentifier(options.ownerRole)}`,
        );
        const report = await verifyOfflineStorage(admin, options);
        await admin.query('rollback');
        expect(
          report.supported,
          JSON.stringify(report.checks.filter((check) => check.status !== 'pass')),
        ).toBe(true);
        const catalog = await collectStorageCatalog(admin, 'offline');
        const rls = (
          await admin.query(
            "select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='offline' and c.relkind='r'",
          )
        ).rows;
        expect(rls.length).toBe(14);
        expect(rls.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
        expect(
          catalog
            .filter((entry) => entry.kind === 'policy')
            .every((entry) => !(entry.value.roles as string[]).includes('PUBLIC')),
        ).toBe(true);
        app = new Client({
          connectionString: postgres.appConnectionString('forward-restricted', options.appRole),
        });
        await app.connect();
        expect((await app.query('select current_user,session_user')).rows).toEqual([
          { current_user: options.appRole, session_user: options.appRole },
        ]);
        for (const tenant of tenants) {
          await app.query('begin');
          await app.query(
            "select set_config('app.tenant_id',$1,true),set_config('app.actor_id','audit-actor',true)",
            [tenant],
          );
          expect((await app.query('select tenant_id from offline.sync_queue_items')).rows).toEqual([
            { tenant_id: tenant },
          ]);
          expect(
            (await app.query('select tenant_id from offline.sync_item_receipts')).rows,
          ).toEqual([{ tenant_id: tenant }]);
          await app.query('savepoint tenant_write');
          await expect(
            app.query('update offline.sync_queue_items set tenant_id=$1 where tenant_id=$2', [
              tenants.find((id) => id !== tenant),
              tenant,
            ]),
          ).rejects.toMatchObject({ code: '42501' });
          await app.query('rollback to savepoint tenant_write');
          await app.query('rollback');
        }
        await app.query('begin');
        expect((await app.query('select id from offline.sync_queue_items')).rows).toEqual([]);
        await app.query('rollback');
        // A full old-chain replay is not ledger admission: its backfill failure rolls back.
        await expect(apply(artifact.migrations[1]!.sql)).rejects.toMatchObject({ code: '42701' });
        expect(await historicalRows()).toEqual(before);
        expect(await collectStorageCatalog(admin, 'offline')).toEqual(catalog);
      } finally {
        await app?.end();
        await admin.query('rollback');
        for (const role of [options.appRole, options.ownerRole]) {
          await admin
            .query(`drop owned by ${admin.escapeIdentifier(role)} cascade`)
            .catch(() => undefined);
          await admin
            .query(`drop role if exists ${admin.escapeIdentifier(role)}`)
            .catch(() => undefined);
        }
        await admin.end();
        await postgres.dispose();
      }
    },
  );
});
