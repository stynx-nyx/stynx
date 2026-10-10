import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

// INV-RBAC-001; UPS-OBX-10 (ADR-OUTBOX-0003 D1 item 6): the attempt-completion
// guard applies to every role except the owner of outbox.event_attempts, so a
// renamed application role keeps the 0022 immutability without naming it.
const MIGRATIONS = resolve(__dirname, '../../packages/data/migrations/platform');
const GUARD_MIGRATION = '0025_outbox_attempt_guard_role_independent.sql';
const TENANT_A = 'a7777777-7777-4777-8777-777777777777';
const TENANT_B = 'b8888888-8888-4888-8888-888888888888';
const EVENT_A = '01900000-0000-7000-8000-000000000071';
const EVENT_B = '01900000-0000-7000-8000-000000000072';

async function migrationFiles(): Promise<string[]> {
  return (await readdir(MIGRATIONS)).filter((file) => file.endsWith('.sql')).sort();
}

async function applyThrough(client: Client, last: string): Promise<void> {
  for (const filename of await migrationFiles()) {
    if (filename > last) break;
    await client.query(await readFile(resolve(MIGRATIONS, filename), 'utf8'));
    if (filename === '0002_extensions.sql') await client.query('set role stynx_owner');
  }
}

async function guardDefinition(client: Client): Promise<string> {
  const row = await client.query<{ definition: string }>(
    `select pg_get_functiondef('outbox.guard_app_attempt_completion'::regproc) as definition`,
  );
  return row.rows[0]!.definition;
}

async function seedAttempts(client: Client): Promise<void> {
  await client.query(
    `insert into tenancy.tenants (id,slug,name)
    values ($1::uuid,'guard-a','Guard A'),($2::uuid,'guard-b','Guard B')`,
    [TENANT_A, TENANT_B],
  );
  await client.query(
    `insert into outbox.events
    (id,tenant_id,entity,entity_id,idempotency_key,payload,created_at)
    values ($1::uuid,$3::uuid,'guard','a','guard-a','{}'::jsonb,now()),
           ($2::uuid,$4::uuid,'guard','b','guard-b','{}'::jsonb,now())`,
    [EVENT_A, EVENT_B, TENANT_A, TENANT_B],
  );
  await client.query(
    `insert into outbox.event_attempts
    (tenant_id,event_id,attempt_ordinal,result,completed_at,legacy_message_id,legacy_state)
    values ($1::uuid,$2::uuid,1,'SENT',clock_timestamp(),null,null),
           ($1::uuid,$2::uuid,2,'LEGACY_HISTORY_UNAVAILABLE',null,
            '01900000-0000-4000-8000-000000000073'::uuid,'{"source":"legacy"}'::jsonb),
           ($1::uuid,$2::uuid,3,'CLAIMED',null,null,null),
           ($1::uuid,$2::uuid,4,'CLAIMED',null,null,null),
           ($3::uuid,$4::uuid,1,'CLAIMED',null,null,null)`,
    [TENANT_A, EVENT_A, TENANT_B, EVENT_B],
  );
}

/** Every mutation 0022 forbids to the application role, applied to the seeded rows. */
const FORBIDDEN_MUTATIONS: ReadonlyArray<{ ordinal: number; set: string }> = [
  { ordinal: 1, set: "result='ERROR'" },
  { ordinal: 2, set: "result='ERROR'" },
  { ordinal: 3, set: "result='SENT'" },
  { ordinal: 3, set: "result='CLAIMED',error='rewrite'" },
  { ordinal: 3, set: "result='SENT',completed_at=clock_timestamp(),attempt_ordinal=9" },
  { ordinal: 3, set: `result='SENT',completed_at=clock_timestamp(),tenant_id='${TENANT_B}'::uuid` },
];

async function expectGuarded(client: Client): Promise<void> {
  for (const mutation of FORBIDDEN_MUTATIONS) {
    await client.query('begin');
    await client.query("select set_config('app.tenant_id',$1,true)", [TENANT_A]);
    await expect(
      client.query(
        `update outbox.event_attempts set ${mutation.set}
      where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`,
        [TENANT_A, EVENT_A, mutation.ordinal],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await client.query('rollback');
  }
}

async function completeOwnClaim(client: Client, ordinal: number): Promise<void> {
  await client.query('begin');
  await client.query("select set_config('app.tenant_id',$1,true)", [TENANT_A]);
  const completed = await client.query<{ result: string }>(
    `update outbox.event_attempts
    set result='SENT',completed_at=clock_timestamp()
    where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3 returning result`,
    [TENANT_A, EVENT_A, ordinal],
  );
  expect(completed.rows).toEqual([{ result: 'SENT' }]);
  await client.query('commit');
}

describe('outbox attempt guard migration 0025', () => {
  it('reaches the same role-independent guard from a 0024 upgrade and from empty', async () => {
    const upgraded = await createPostgresTestDatabase('stynx_outbox_guard_upgrade', {
      useTemplate: false,
    });
    const fresh = await createPostgresTestDatabase('stynx_outbox_guard_fresh', {
      useTemplate: false,
    });
    const upgradedClient = await upgraded.connectAsAdmin();
    const freshClient = await fresh.connectAsAdmin();
    try {
      const files = await migrationFiles();
      expect(files).toContain(GUARD_MIGRATION);
      expect(files.indexOf(GUARD_MIGRATION)).toBe(files.length - 1);
      const migration = await readFile(resolve(MIGRATIONS, GUARD_MIGRATION), 'utf8');
      expect(migration).toMatch(
        /CREATE OR REPLACE FUNCTION outbox\.guard_app_attempt_completion\(\)/u,
      );
      expect(migration).not.toMatch(/CREATE TRIGGER|ALTER TABLE|stynx_app/u);
      expect(migration).toMatch(/TG_RELID/u);
      expect(migration).toMatch(/42501/u);

      await applyThrough(upgradedClient, '0024_auth_sessions_partition_retention.sql');
      const before = await guardDefinition(upgradedClient);
      expect(before).toContain("current_user = 'stynx_app'");
      await seedAttempts(upgradedClient);
      await upgradedClient.query(migration);
      const after = await guardDefinition(upgradedClient);
      expect(after).not.toContain('stynx_app');
      expect(after).toContain('TG_RELID');

      await applyThrough(freshClient, GUARD_MIGRATION);
      expect(await guardDefinition(freshClient)).toBe(after);

      const trigger = await upgradedClient.query<{
        tgname: string;
        tgtype: number;
        tgenabled: string;
      }>(
        `select tgname,tgtype,tgenabled from pg_trigger
          where tgrelid='outbox.event_attempts'::regclass and not tgisinternal order by tgname`,
      );
      expect(trigger.rows).toEqual([
        { tgname: 'guard_app_attempt_completion', tgtype: 19, tgenabled: 'O' },
      ]);
      const owner = await upgradedClient.query<{ owner: string }>(
        `select pg_get_userbyid(relowner) as owner from pg_class where oid='outbox.event_attempts'::regclass`,
      );
      expect(owner.rows).toEqual([{ owner: 'stynx_owner' }]);
      const preserved = await upgradedClient.query<{ attempt_ordinal: number; result: string }>(
        `select attempt_ordinal,result from outbox.event_attempts where tenant_id=$1::uuid order by 1`,
        [TENANT_A],
      );
      expect(preserved.rows.map((row) => row.result)).toEqual([
        'SENT',
        'LEGACY_HISTORY_UNAVAILABLE',
        'CLAIMED',
        'CLAIMED',
      ]);
    } finally {
      for (const client of [upgradedClient, freshClient]) {
        await client.query('rollback').catch(() => undefined);
        await client.query('reset role').catch(() => undefined);
        await client.end();
      }
      await upgraded.dispose();
      await fresh.dispose();
    }
  });

  it('keeps the owner path, guards stynx_app as before and guards a third non-owner role', async () => {
    const database = await createPostgresTestDatabase('stynx_outbox_guard_roles', {
      useTemplate: false,
    });
    const client = await database.connectAsAdmin();
    const probeRole = `stynx_obx10_probe_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const probeIdentifier = client.escapeIdentifier(probeRole);
    try {
      await applyThrough(client, GUARD_MIGRATION);
      await seedAttempts(client);

      // Owner path: the table owner completes and rewrites attempts unguarded.
      await client.query('set role stynx_owner');
      await client.query('begin');
      const ownerRewrite = await client.query<{ error: string | null }>(
        `update outbox.event_attempts
        set error='owner rewrite' where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=1
        returning error`,
        [TENANT_A, EVENT_A],
      );
      expect(ownerRewrite.rows).toEqual([{ error: 'owner rewrite' }]);
      await client.query('rollback');
      await client.query('begin');
      const ownerLegacy = await client.query<{ result: string }>(
        `update outbox.event_attempts
        set result='ERROR' where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=2
        returning result`,
        [TENANT_A, EVENT_A],
      );
      expect(ownerLegacy.rows).toEqual([{ result: 'ERROR' }]);
      await client.query('rollback');
      await client.query('reset role');

      // A third role, neither owner nor stynx_app, bound like an application role.
      await client.query(
        `create role ${probeIdentifier} nologin noinherit nosuperuser nobypassrls`,
      );
      await client.query('set role stynx_owner');
      await client.query(`grant usage on schema outbox to ${probeIdentifier}`);
      await client.query(
        `grant select,update (result,error,completed_at) on outbox.event_attempts to ${probeIdentifier}`,
      );
      await client.query(`create policy probe_attempts_tenant on outbox.event_attempts to ${probeIdentifier}
        using (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
        with check (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)`);
      await client.query('reset role');

      await client.query(`set role ${probeIdentifier}`);
      const probeIdentity = await client.query<{ current_user: string }>('select current_user');
      expect(probeIdentity.rows).toEqual([{ current_user: probeRole }]);
      await completeOwnClaim(client, 4);
      await expectGuarded(client);
      await client.query('reset role');

      // The platform application role is guarded exactly as 0022 guarded it.
      await client.query('set role stynx_app');
      await completeOwnClaim(client, 3);
      await expectGuarded(client);
      await client.query('begin');
      await client.query("select set_config('app.tenant_id',$1,true)", [TENANT_A]);
      const foreign = await client.query(
        `update outbox.event_attempts set result='SENT',completed_at=clock_timestamp()
        where tenant_id=$1::uuid and attempt_ordinal=1`,
        [TENANT_B],
      );
      expect(foreign.rowCount).toBe(0);
      await client.query('rollback');
      await client.query('reset role');

      const final = await client.query<{
        tenant_id: string;
        attempt_ordinal: number;
        result: string;
        completed: boolean;
      }>(
        `select tenant_id::text,attempt_ordinal,result,completed_at is not null as completed
           from outbox.event_attempts order by tenant_id,attempt_ordinal`,
      );
      expect(final.rows).toEqual([
        { tenant_id: TENANT_A, attempt_ordinal: 1, result: 'SENT', completed: true },
        {
          tenant_id: TENANT_A,
          attempt_ordinal: 2,
          result: 'LEGACY_HISTORY_UNAVAILABLE',
          completed: false,
        },
        { tenant_id: TENANT_A, attempt_ordinal: 3, result: 'SENT', completed: true },
        { tenant_id: TENANT_A, attempt_ordinal: 4, result: 'SENT', completed: true },
        { tenant_id: TENANT_B, attempt_ordinal: 1, result: 'CLAIMED', completed: false },
      ]);
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.query('reset role').catch(() => undefined);
      await client.query(`drop owned by ${probeIdentifier}`).catch(() => undefined);
      await client.query(`drop role if exists ${probeIdentifier}`).catch(() => undefined);
      await client.end();
      await database.dispose();
    }
  });
});
