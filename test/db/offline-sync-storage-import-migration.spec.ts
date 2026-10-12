import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

// D6: the forward migration and data-neutral bootstrap preserve native history and
// install owner-only immutable custody independently of the package renderer.
describe('offline storage import migration 0008 and bootstrap', () => {
  it.each([false, true])(
    'preserves a fresh/populated=%s 0007 database and never seeds evidence',
    async (populated) => {
      const database = await createPostgresTestDatabase('offline_import_ddl', {
        useTemplate: false,
      });
      const client = await database.connectAsAdmin();
      let app: Client | undefined;
      const offline = resolve(__dirname, '../../packages/offline-sync/migrations');
      const seed = await readFile(
        resolve(__dirname, '../../database/seed/offline-sync/0008-storage-import.sql'),
        'utf8',
      );
      const tenant = '11111111-1111-4111-8111-111111111111';
      try {
        const platform = resolve(__dirname, '../../packages/data/migrations/platform');
        for (const file of (await readdir(platform))
          .filter((file) => file.endsWith('.sql'))
          .sort()) {
          await client.query(await readFile(resolve(platform, file), 'utf8'));
          if (file === '0002_extensions.sql') await client.query('set role stynx_owner');
        }
        await client.query('reset role');
        for (const file of (await readdir(offline))
          .filter((file) => /^000[1-7]_.*\.sql$/.test(file))
          .sort())
          await client.query(await readFile(resolve(offline, file), 'utf8'));
        await client.query(
          "insert into tenancy.tenants(id,slug,name) values($1,'import-migration','Import migration')",
          [tenant],
        );
        if (populated)
          await client.query(
            `insert into offline.sync_batches(tenant_id,device_id,device_batch_id,org_unit_id,agent_id,context_hash,declared_keys,status,created_at,updated_at)
        values($1,'device','historic','org','agent','original-context','[null,null]','open','2020-02-29T06:34:56.123456+03:30','2020-02-29T06:34:56.123456+03:30')`,
            [tenant],
          );
        const before = (
          await client.query('select to_jsonb(b)::text as body from offline.sync_batches b')
        ).rows;
        await expect(client.query(seed)).rejects.toThrow(/complete 0008/);
        await client.query(await readFile(resolve(offline, '0008_import_receipts.sql'), 'utf8'));
        expect(
          (
            await client.query(
              "select (to_jsonb(b)-'response_body_is_archived')::text as body from offline.sync_batches b",
            )
          ).rows,
        ).toEqual(before);
        expect(
          (await client.query('select response_body_is_archived from offline.sync_batches')).rows,
        ).toEqual(populated ? [{ response_body_is_archived: false }] : []);
        await client.query('set role stynx_owner');
        await client.query(seed);
        await client.query(seed);
        expect(
          (await client.query('select count(*)::text as count from offline.sync_import_receipts'))
            .rows,
        ).toEqual([{ count: '0' }]);
        await client.query('reset role');
        const security =
          await client.query(`select c.relrowsecurity as enabled,c.relforcerowsecurity as forced,
        has_table_privilege('stynx_app',c.oid,'SELECT,INSERT,UPDATE,DELETE') as app_access,
        has_table_privilege('stynx_reader',c.oid,'SELECT,INSERT,UPDATE,DELETE') as reader_access
        from pg_class c where c.oid='offline.sync_import_receipts'::regclass`);
        expect(security.rows).toEqual([
          { enabled: true, forced: true, app_access: false, reader_access: false },
        ]);
        await database.ensureRoleLogin('stynx_app');
        app = new Client({ connectionString: database.appConnectionString() });
        await app.connect();
        expect((await app.query('select current_user,session_user')).rows).toEqual([
          { current_user: 'stynx_app', session_user: 'stynx_app' },
        ]);
        for (const sql of [
          'select * from offline.sync_import_receipts',
          'delete from offline.sync_import_receipts',
          "update offline.sync_import_receipts set imported_by='forged'",
        ]) {
          await expect(app.query(sql)).rejects.toMatchObject({ code: '42501' });
        }
        await client.query('set role stynx_owner');
        await client.query(
          `insert into offline.sync_import_receipts values($1,'source','snapshot',$1,$1,$1,'{}','stynx_owner','2020-02-29T06:34:56.123456+03:30','{}')`,
          [`sha256:${'a'.repeat(64)}`],
        );
        const receipt = (
          await client.query('select to_jsonb(r)::text as body from offline.sync_import_receipts r')
        ).rows;
        await client.query(seed);
        await client.query(seed);
        expect(
          (
            await client.query(
              'select to_jsonb(r)::text as body from offline.sync_import_receipts r',
            )
          ).rows,
        ).toEqual(receipt);
        await expect(
          client.query("update offline.sync_import_receipts set imported_by='different'"),
        ).rejects.toMatchObject({ code: 'STY50' });
        await expect(
          client.query('delete from offline.sync_import_receipts'),
        ).rejects.toMatchObject({ code: 'STY50' });
        await client.query('reset role');
        await client.query('alter table offline.sync_item_attempts no force row level security');
        await expect(client.query(seed)).rejects.toThrow(/sync_item_attempts/);
        expect(
          (
            await client.query(
              'select to_jsonb(r)::text as body from offline.sync_import_receipts r',
            )
          ).rows,
        ).toEqual(receipt);
      } finally {
        await app?.end();
        await client.query('rollback').catch(() => undefined);
        await client.query('reset role').catch(() => undefined);
        await client.end();
        await database.dispose();
      }
    },
    60_000,
  );
});
