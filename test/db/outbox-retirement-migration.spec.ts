import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

const MIGRATIONS = resolve(__dirname, '../../packages/data/migrations/platform');
const PREVIOUS = '0025_outbox_attempt_guard_role_independent.sql';
const RETIREMENT = '0026_outbox_event_retirement.sql';
const SEED = resolve(__dirname, '../../database/seed/platform/0026-outbox-retirement.sql');
const TENANT_A = 'e5555555-5555-4555-8555-555555555555';
const TENANT_B = 'e6666666-6666-4666-8666-666666666666';
const EVENT_A = '01900000-0000-7000-8000-000000000081';
const EVENT_B = '01900000-0000-7000-8000-000000000082';
const ACTOR = 'e7777777-7777-4777-8777-777777777777';

async function applyThrough(client: Client, last: string): Promise<void> {
  const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) {
    if (file > last) break;
    await client.query(await readFile(resolve(MIGRATIONS, file), 'utf8'));
    if (file === '0002_extensions.sql') await client.query('set role stynx_owner');
  }
}

async function seed(client: Client): Promise<void> {
  await client.query(
    `insert into tenancy.tenants(id,slug,name) values
    ($1,'retirement-upgrade-a','Upgrade A'),($2,'retirement-upgrade-b','Upgrade B')`,
    [TENANT_A, TENANT_B],
  );
  await client.query(
    `insert into outbox.events(id,tenant_id,entity,entity_id,idempotency_key,payload,metadata,created_at)
    values ($1,$3,'upgrade.retirement','aggregate','legacy-a','{"fact":1}','{"legacy":true}','2026-10-01T12:00:00.123Z'),
           ($2,$4,'upgrade.retirement','aggregate','legacy-b','{"fact":2}',null,'2026-10-01T12:00:00.124Z')`,
    [EVENT_A, EVENT_B, TENANT_A, TENANT_B],
  );
  await client.query(
    `insert into outbox.event_delivery(tenant_id,event_id,status,attempts,last_error,next_attempt_at,updated_at)
    values ($1,$2,'ERROR',2,'historical failure','2026-10-02T12:00:00Z','2026-10-01T12:00:01Z'),
           ($3,$4,'ACKED',1,null,null,'2026-10-01T12:00:02Z')`,
    [TENANT_A, EVENT_A, TENANT_B, EVENT_B],
  );
  await client.query(
    `insert into outbox.event_attempts(tenant_id,event_id,attempt_ordinal,result,request_bytes,response_bytes,completed_at)
    values ($1,$2,1,'SENT',$3,$4,'2026-10-01T12:00:01Z')`,
    [TENANT_A, EVENT_A, Buffer.from('original request'), Buffer.from('original response')],
  );
  await client.query(
    `insert into outbox.event_acks(tenant_id,event_id,status,raw_body,identity_verified,hmac_verified)
    values ($1,$2,'ACKED',$3,true,true)`,
    [TENANT_B, EVENT_B, Buffer.from('original ACK')],
  );
}

async function legacySnapshot(client: Client): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const table of [
    'events',
    'event_delivery',
    'event_attempts',
    'event_acks',
    'legacy_ownership',
    'legacy_event_map',
  ]) {
    result[table] = (
      await client.query(
        `select to_jsonb(t)::text as row from outbox.${table} t order by to_jsonb(t)::text`,
      )
    ).rows;
  }
  return result;
}

async function retirementCatalog(client: Client) {
  return {
    columns: (
      await client.query(`select column_name,data_type,is_nullable,column_default from information_schema.columns
      where table_schema='outbox' and table_name='event_retirements' order by ordinal_position`)
    ).rows,
    constraints: (
      await client.query(`select conname,pg_get_constraintdef(oid) as definition from pg_constraint
      where conrelid in ('outbox.event_retirements'::regclass,'outbox.event_delivery'::regclass) order by conname`)
    ).rows,
    policies: (
      await client.query(`select policyname,permissive,roles,cmd,qual,with_check from pg_policies
      where schemaname='outbox' and tablename='event_retirements' order by policyname`)
    ).rows,
    security: (
      await client.query(
        `select relrowsecurity,relforcerowsecurity from pg_class where oid='outbox.event_retirements'::regclass`,
      )
    ).rows,
    triggers: (
      await client.query(`select tgname,pg_get_triggerdef(oid) as definition from pg_trigger
      where tgrelid='outbox.event_retirements'::regclass and not tgisinternal order by tgname`)
    ).rows,
  };
}

// INV-RBAC-001; ADR-OUTBOX-0004 D3. Forward-only installation must preserve
// populated 1.5.7 evidence and enforce bounds/FKs in the actual database.
describe('outbox retirement forward migration 0026', () => {
  it('produces the same protected catalog from empty and a populated 1.5.7 upgrade without rewriting history', async () => {
    const upgrade = await createPostgresTestDatabase('stynx_retirement_upgrade', {
      useTemplate: false,
    });
    const fresh = await createPostgresTestDatabase('stynx_retirement_empty', {
      useTemplate: false,
    });
    const oldClient = await upgrade.connectAsAdmin();
    const newClient = await fresh.connectAsAdmin();
    try {
      const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql')).sort();
      expect(files.indexOf(RETIREMENT)).toBeGreaterThan(files.indexOf(PREVIOUS));
      await applyThrough(oldClient, PREVIOUS);
      await seed(oldClient);
      const before = await legacySnapshot(oldClient);
      await oldClient.query(await readFile(resolve(MIGRATIONS, RETIREMENT), 'utf8'));
      await oldClient.query(await readFile(SEED, 'utf8'));
      await oldClient.query(await readFile(SEED, 'utf8'));
      expect(await legacySnapshot(oldClient)).toEqual(before);
      expect((await oldClient.query('select * from outbox.event_retirements')).rows).toEqual([]);
      await applyThrough(newClient, RETIREMENT);
      await newClient.query(await readFile(SEED, 'utf8'));
      await newClient.query(await readFile(SEED, 'utf8'));
      expect((await newClient.query('select * from outbox.event_retirements')).rows).toEqual([]);
      expect(await retirementCatalog(oldClient)).toEqual(await retirementCatalog(newClient));
      const catalog = await retirementCatalog(oldClient);
      expect(catalog.security).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
      expect(
        catalog.constraints.some((row) =>
          row.definition.includes(
            'FOREIGN KEY (tenant_id, event_id) REFERENCES outbox.events(tenant_id, id)',
          ),
        ),
      ).toBe(true);
      expect(
        catalog.constraints
          .filter((row) => row.definition.includes('UNIQUE (tenant_id,'))
          .map((row) => row.definition)
          .sort(),
      ).toEqual(['UNIQUE (tenant_id, event_id)', 'UNIQUE (tenant_id, idempotency_key)']);
      expect(catalog.triggers).toHaveLength(1);
      expect(catalog.triggers[0]!.definition).toContain('BEFORE DELETE OR UPDATE');
      const grants = await oldClient.query(`select
        has_table_privilege('stynx_app','outbox.event_retirements','SELECT') as app_select,
        has_table_privilege('stynx_app','outbox.event_retirements','INSERT') as app_insert,
        has_table_privilege('stynx_app','outbox.event_retirements','UPDATE') as app_update,
        has_table_privilege('stynx_app','outbox.event_retirements','DELETE') as app_delete,
        has_table_privilege('stynx_reader','outbox.event_retirements','INSERT') as reader_insert`);
      expect(grants.rows).toEqual([
        {
          app_select: true,
          app_insert: true,
          app_update: false,
          app_delete: false,
          reader_insert: false,
        },
      ]);
      await oldClient.query(
        `update outbox.event_delivery set status='RETIRED' where tenant_id=$1 and event_id=$2`,
        [TENANT_A, EVENT_A],
      );
      await expect(
        oldClient.query(
          `update outbox.event_delivery set status='PURGED' where tenant_id=$1 and event_id=$2`,
          [TENANT_A, EVENT_A],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await oldClient.end();
      await newClient.end();
      await upgrade.dispose();
      await fresh.dispose();
    }
  });

  it('enforces tenant/event identity, receipt bounds and immutable maintenance history', async () => {
    const postgres = await createPostgresTestDatabase('stynx_retirement_constraints', {
      useTemplate: false,
    });
    const client = await postgres.connectAsAdmin();
    try {
      await applyThrough(client, RETIREMENT);
      await seed(client);
      const insert = (
        tenant: string,
        event: string,
        key: string,
        why: string,
        previous = 'ERROR',
      ) =>
        client.query(
          `insert into outbox.event_retirements(tenant_id,event_id,idempotency_key,actor_id,reason,previous_status)
         values ($1,$2,$3,$4,$5,$6) returning *`,
          [tenant, event, key, ACTOR, why, previous],
        );
      await expect(insert(TENANT_A, EVENT_B, 'foreign-event', 'reason')).rejects.toMatchObject({
        code: '23503',
      });
      for (const [key, why, previous] of [
        ['', 'reason', 'ERROR'],
        ['é'.repeat(128), 'reason', 'ERROR'],
        ['key', '', 'ERROR'],
        ['key', ' \t\n ', 'ERROR'],
        ['key', '\u00a0\u2003\ufeff', 'ERROR'],
        ['key', 'é'.repeat(1025), 'ERROR'],
        ['key', 'reason', 'ACKED'],
        ['key', 'reason', 'RETIRED'],
      ])
        await expect(insert(TENANT_A, EVENT_A, key!, why!, previous!)).rejects.toMatchObject({
          code: '23514',
        });
      const receipt = (await insert(TENANT_A, EVENT_A, 'é'.repeat(127) + 'x', 'é'.repeat(1024)))
        .rows[0];
      const beforeSeed = await legacySnapshot(client);
      await client.query(await readFile(SEED, 'utf8'));
      await client.query(await readFile(SEED, 'utf8'));
      expect(await legacySnapshot(client)).toEqual(beforeSeed);
      expect((await client.query('select * from outbox.event_retirements')).rows).toEqual([
        receipt,
      ]);
      await expect(
        insert(TENANT_A, EVENT_A, randomUUID(), 'second operation'),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        client.query('update outbox.event_retirements set reason=$2 where id=$1', [
          receipt.id,
          'tamper',
        ]),
      ).rejects.toMatchObject({ code: 'STY43' });
      await expect(
        client.query('delete from outbox.event_retirements where id=$1', [receipt.id]),
      ).rejects.toMatchObject({ code: 'STY43' });
      expect((await client.query('select * from outbox.event_retirements')).rows).toEqual([
        receipt,
      ]);
    } finally {
      await client.end();
      await postgres.dispose();
    }
  });
});
