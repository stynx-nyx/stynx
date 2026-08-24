import { Test, type TestingModule } from '@nestjs/testing';
import { StynxDataModule } from '@stynx-nyx/data';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const tenantA = '01978f4a-32bf-7c27-a131-fd73a9e101a1';
const tenantB = '01978f4a-32bf-7c27-a131-fd73a9e101b2';
const reviewerA = '01978f4a-32bf-7c27-a131-fd73a9e201a1';
const reviewerB = '01978f4a-32bf-7c27-a131-fd73a9e201b2';
const outsider = '01978f4a-32bf-7c27-a131-fd73a9e201c3';
const supervisor = '01978f4a-32bf-7c27-a131-fd73a9e201d4';

interface IdRow {
  id: string;
}

interface ClaimRow {
  item_id: string | null;
}

async function createMigratedModule(connectionString: string): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      StynxDataModule.forRoot({
        connections: {
          owner: { connectionString },
          app: { connectionString },
          reader: { connectionString },
        },
        migrations: { enabled: true },
      }),
    ],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

async function asRole<T>(
  client: Client,
  role: 'stynx_app' | 'stynx_reader',
  tenantId: string,
  actorId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query(`set role ${role}`);
  await client.query('begin');
  try {
    await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
    if (actorId) {
      await client.query(`select set_config('app.actor_id', $1, true)`, [actorId]);
    }
    const result = await fn();
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.query('reset role');
  }
}

async function seedBaseState(client: Client): Promise<void> {
  await client.query(`
    insert into tenancy.tenants (id, slug, name)
    values
      ('${tenantA}', 'worklist-a', 'Worklist A'),
      ('${tenantB}', 'worklist-b', 'Worklist B')
  `);
  await client.query(`
    insert into auth.users (id, email)
    values
      ('${reviewerA}', 'reviewer-a@worklist.test'),
      ('${reviewerB}', 'reviewer-b@worklist.test'),
      ('${outsider}', 'outsider@worklist.test'),
      ('${supervisor}', 'supervisor@worklist.test')
  `);
  await client.query(`
    insert into auth.memberships (id, tenant_id, user_id, is_active)
    values
      ('01978f4a-32bf-7c27-a131-fd73a9e301a1', '${tenantA}', '${reviewerA}', true),
      ('01978f4a-32bf-7c27-a131-fd73a9e301b2', '${tenantA}', '${reviewerB}', true),
      ('01978f4a-32bf-7c27-a131-fd73a9e301c3', '${tenantA}', '${outsider}', true),
      ('01978f4a-32bf-7c27-a131-fd73a9e301d4', '${tenantA}', '${supervisor}', true),
      ('01978f4a-32bf-7c27-a131-fd73a9e301e5', '${tenantB}', '${reviewerA}', true)
  `);
  await client.query(`
    insert into auth.perms (id, key, description)
    values
      ('01978f4a-32bf-7c27-a131-fd73a9e401a1', 'rait:review:appeals', 'Review appeals'),
      ('01978f4a-32bf-7c27-a131-fd73a9e401b2', 'rait:supervise:appeals', 'Supervise appeals'),
      ('01978f4a-32bf-7c27-a131-fd73a9e401c3', 'rait:*:*', 'RAIT wildcard')
  `);
  await client.query(`
    insert into auth.roles (id, tenant_id, key, name)
    values
      ('01978f4a-32bf-7c27-a131-fd73a9e501a1', '${tenantA}', 'reviewer', 'Reviewer'),
      ('01978f4a-32bf-7c27-a131-fd73a9e501b2', '${tenantA}', 'wildcard-reviewer', 'Wildcard reviewer'),
      ('01978f4a-32bf-7c27-a131-fd73a9e501c3', '${tenantA}', 'supervisor', 'Supervisor'),
      ('01978f4a-32bf-7c27-a131-fd73a9e501d4', '${tenantB}', 'reviewer', 'Reviewer')
  `);
  await client.query(`
    insert into auth.role_perms (role_id, perm_id)
    values
      ('01978f4a-32bf-7c27-a131-fd73a9e501a1', '01978f4a-32bf-7c27-a131-fd73a9e401a1'),
      ('01978f4a-32bf-7c27-a131-fd73a9e501b2', '01978f4a-32bf-7c27-a131-fd73a9e401c3'),
      ('01978f4a-32bf-7c27-a131-fd73a9e501c3', '01978f4a-32bf-7c27-a131-fd73a9e401b2'),
      ('01978f4a-32bf-7c27-a131-fd73a9e501d4', '01978f4a-32bf-7c27-a131-fd73a9e401a1')
  `);
  await client.query(`
    insert into auth.membership_roles (membership_id, role_id)
    values
      ('01978f4a-32bf-7c27-a131-fd73a9e301a1', '01978f4a-32bf-7c27-a131-fd73a9e501b2'),
      ('01978f4a-32bf-7c27-a131-fd73a9e301b2', '01978f4a-32bf-7c27-a131-fd73a9e501a1'),
      ('01978f4a-32bf-7c27-a131-fd73a9e301d4', '01978f4a-32bf-7c27-a131-fd73a9e501c3'),
      ('01978f4a-32bf-7c27-a131-fd73a9e301e5', '01978f4a-32bf-7c27-a131-fd73a9e501d4')
  `);
}

async function createQueue(
  client: Client,
  code: string,
  strategy = 'pull',
  tenantId = tenantA,
): Promise<string> {
  return asRole(client, 'stynx_app', tenantId, tenantId === tenantA ? supervisor : reviewerA, async () => {
    const result = await client.query<IdRow>(
      `
        insert into worklist.queues (
          tenant_id, code, name, strategy, required_permission,
          supervisor_permission, created_by, updated_by
        )
        values (
          current_setting('app.tenant_id')::uuid, $1, $1, $2,
          'rait:review:appeals', 'rait:supervise:appeals',
          current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid
        )
        returning id
      `,
      [code, strategy],
    );
    return result.rows[0]?.id ?? '';
  });
}

async function enqueue(
  client: Client,
  queueCode: string,
  entityId: string,
  dueAt?: Date,
): Promise<string> {
  return asRole(client, 'stynx_app', tenantA, supervisor, async () => {
    const result = await client.query<ClaimRow>(
      `select worklist.item_enqueue($1, 'rait.appeal', $2, null, $3, $4, null, null, '{}'::jsonb, '{}'::jsonb) as item_id`,
      [queueCode, entityId, dueAt ?? null, dueAt ? 'absolute' : null],
    );
    return result.rows[0]?.item_id ?? '';
  });
}

describe('worklist database integration', () => {
  let database: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let admin: Client;

  beforeAll(async () => {
    database = await createPostgresTestDatabase('stynx_worklist');
    moduleRef = await createMigratedModule(database.connectionString('@stynx-nyx/worklist:owner'));
    admin = await database.connectAsAdmin();
    await seedBaseState(admin);
  });

  afterAll(async () => {
    await admin?.end();
    await moduleRef?.close();
    await database?.dispose();
  });

  it('applies tenant RLS, audit triggers, archive mirrors, and an append-only event ledger', async () => {
    const tables = await admin.query<{ name: string; forced: boolean }>(`
      select c.relname as name, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'worklist' and c.relkind = 'r'
      order by c.relname
    `);
    expect(tables.rows).toEqual([
      { name: 'item_events', forced: true },
      { name: 'items', forced: true },
      { name: 'queues', forced: true },
      { name: 'worker_state', forced: true },
    ]);

    const archiveTables = await admin.query<{ name: string }>(`
      select table_name as name
      from information_schema.tables
      where table_schema = 'archive' and table_name like 'worklist_%'
      order by table_name
    `);
    expect(archiveTables.rows.map((row) => row.name)).toEqual([
      'worklist_queues',
      'worklist_worker_state',
    ]);

    const triggers = await admin.query<{ table_name: string; trigger_name: string }>(`
      select c.relname as table_name, t.tgname as trigger_name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'worklist' and not t.tgisinternal
      order by c.relname, t.tgname
    `);
    expect(new Set(triggers.rows.filter((row) => row.trigger_name.startsWith('trg_audit_')).map((row) => row.table_name))).toEqual(
      new Set(['queues', 'worker_state', 'items', 'item_events']),
    );
    expect(triggers.rows).toContainEqual({
      table_name: 'item_events',
      trigger_name: 'trg_worklist_item_events_append_only',
    });

    const queueA = await createQueue(admin, 'rls-shared', 'pull', tenantA);
    const queueB = await createQueue(admin, 'rls-shared', 'pull', tenantB);
    const visibleA = await asRole(admin, 'stynx_reader', tenantA, undefined, () =>
      admin.query<IdRow>(`select id from worklist.queues where code = 'rls-shared'`),
    );
    const visibleB = await asRole(admin, 'stynx_reader', tenantB, undefined, () =>
      admin.query<IdRow>(`select id from worklist.queues where code = 'rls-shared'`),
    );
    expect(visibleA.rows.map((row) => row.id)).toEqual([queueA]);
    expect(visibleB.rows.map((row) => row.id)).toEqual([queueB]);
  });

  it('derives eligibility from RBAC and treats worker state as availability, not an ACL', async () => {
    const queueId = await createQueue(admin, 'rbac-derived');
    await asRole(admin, 'stynx_app', tenantA, supervisor, async () => {
      await admin.query(
        `insert into worklist.worker_state (tenant_id, queue_id, user_id, is_available, weight, created_by, updated_by)
         values
           (current_setting('app.tenant_id')::uuid, $1, $2, false, 1, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid),
           (current_setting('app.tenant_id')::uuid, $1, $3, true, 1, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)`,
        [queueId, reviewerB, outsider],
      );
    });

    const eligible = await asRole(admin, 'stynx_reader', tenantA, undefined, () =>
      admin.query<{ user_id: string }>(`select user_id from worklist.eligible_workers($1) order by user_id`, [queueId]),
    );
    expect(eligible.rows.map((row) => row.user_id)).toEqual([reviewerA]);

    await asRole(admin, 'stynx_app', tenantA, supervisor, () =>
      admin.query(`update worklist.worker_state set is_available = true where queue_id = $1 and user_id = $2`, [
        queueId,
        reviewerB,
      ]),
    );
    const restored = await asRole(admin, 'stynx_reader', tenantA, undefined, () =>
      admin.query<{ user_id: string }>(`select user_id from worklist.eligible_workers($1) order by user_id`, [queueId]),
    );
    expect(restored.rows.map((row) => row.user_id)).toEqual([reviewerA, reviewerB]);
  });

  it('prevents a double claim when two real PostgreSQL sessions race', async () => {
    const queueId = await createQueue(admin, 'claim-race');
    const itemId = await enqueue(admin, 'claim-race', 'appeal-race');
    const first = new Client({ connectionString: database.connectionString('worklist-racer-a') });
    const second = new Client({ connectionString: database.connectionString('worklist-racer-b') });
    await Promise.all([first.connect(), second.connect()]);
    try {
      const claims = await Promise.all([
        asRole(first, 'stynx_app', tenantA, reviewerA, () =>
          first.query<ClaimRow>(`select worklist.item_claim_next($1, $2) as item_id`, [queueId, reviewerA]),
        ),
        asRole(second, 'stynx_app', tenantA, reviewerB, () =>
          second.query<ClaimRow>(`select worklist.item_claim_next($1, $2) as item_id`, [queueId, reviewerB]),
        ),
      ]);
      expect(claims.map((result) => result.rows[0]?.item_id).sort()).toEqual([null, itemId].sort());
    } finally {
      await Promise.all([first.end(), second.end()]);
    }

    const state = await admin.query<{ status: string; assignee_id: string; claims: string }>(
      `select i.status::text, i.assignee_id, count(e.id)::text as claims
       from worklist.items i
       join worklist.item_events e on e.item_id = i.id and e.kind = 'claim'
       where i.id = $1
       group by i.id`,
      [itemId],
    );
    expect(state.rows[0]?.status).toBe('claimed');
    expect([reviewerA, reviewerB]).toContain(state.rows[0]?.assignee_id);
    expect(state.rows[0]?.claims).toBe('1');
  });

  it('round-robins and load-balances across RBAC-derived workers without membership rows', async () => {
    const roundRobinQueue = await createQueue(admin, 'round-robin', 'round_robin');
    await enqueue(admin, 'round-robin', 'rr-1');
    await enqueue(admin, 'round-robin', 'rr-2');
    const assigned = await asRole(admin, 'stynx_app', tenantA, supervisor, async () => {
      const one = await admin.query<ClaimRow>(`select worklist.assign_next($1) as item_id`, [roundRobinQueue]);
      const two = await admin.query<ClaimRow>(`select worklist.assign_next($1) as item_id`, [roundRobinQueue]);
      return [one.rows[0]?.item_id, two.rows[0]?.item_id];
    });
    const assignees = await admin.query<{ assignee_id: string }>(
      `select assignee_id from worklist.items where id = any($1::uuid[]) order by assignee_id`,
      [assigned],
    );
    expect(assignees.rows.map((row) => row.assignee_id)).toEqual([reviewerA, reviewerB]);

    const balancedQueue = await createQueue(admin, 'load-balanced', 'load_balanced');
    await enqueue(admin, 'load-balanced', 'lb-existing');
    await enqueue(admin, 'load-balanced', 'lb-next');
    await asRole(admin, 'stynx_app', tenantA, reviewerA, () =>
      admin.query(`select worklist.item_claim_next($1, $2)`, [balancedQueue, reviewerA]),
    );
    const next = await asRole(admin, 'stynx_app', tenantA, supervisor, () =>
      admin.query<ClaimRow>(`select worklist.assign_next($1) as item_id`, [balancedQueue]),
    );
    const selected = await admin.query<{ assignee_id: string }>(
      `select assignee_id from worklist.items where id = $1`,
      [next.rows[0]?.item_id],
    );
    expect(selected.rows[0]?.assignee_id).toBe(reviewerB);
  });

  it('audits release, completion, reasoned reassignment, and supervisor override', async () => {
    const queueId = await createQueue(admin, 'operations');
    const released = await enqueue(admin, 'operations', 'release-me');
    await asRole(admin, 'stynx_app', tenantA, reviewerA, () =>
      admin.query(`select worklist.item_claim($1, $2)`, [released, reviewerA]),
    );
    await expect(asRole(admin, 'stynx_app', tenantA, reviewerB, () =>
      admin.query(`select worklist.item_release($1, 'not mine', false)`, [released]),
    )).rejects.toThrow('current assignee');
    await asRole(admin, 'stynx_app', tenantA, reviewerA, () =>
      admin.query(`select worklist.item_release($1, 'return to pool', false)`, [released]),
    );

    const reassigned = await enqueue(admin, 'operations', 'reassign-me');
    await asRole(admin, 'stynx_app', tenantA, reviewerA, () =>
      admin.query(`select worklist.item_claim($1, $2)`, [reassigned, reviewerA]),
    );
    await expect(asRole(admin, 'stynx_app', tenantA, supervisor, () =>
      admin.query(`select worklist.item_reassign($1, $2, ' ', false)`, [reassigned, reviewerB]),
    )).rejects.toThrow('reason');
    await asRole(admin, 'stynx_app', tenantA, supervisor, () =>
      admin.query(`select worklist.item_reassign($1, $2, 'balance JARI load', false)`, [reassigned, reviewerB]),
    );
    await asRole(admin, 'stynx_app', tenantA, reviewerB, () =>
      admin.query(`select worklist.item_complete($1, 'reviewed', '{"decision":"uphold"}'::jsonb, false)`, [reassigned]),
    );

    const overrideItem = await enqueue(admin, 'operations', 'override-me');
    await asRole(admin, 'stynx_app', tenantA, supervisor, async () => {
      await admin.query(
        `insert into worklist.worker_state (tenant_id, queue_id, user_id, is_available, weight, created_by, updated_by)
         values (current_setting('app.tenant_id')::uuid, $1, $2, false, 1, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
         on conflict (tenant_id, queue_id, user_id) do update set is_available = false`,
        [queueId, reviewerB],
      );
      await admin.query(`select worklist.item_reassign($1, $2, 'board override', true)`, [overrideItem, reviewerB]);
    });

    const events = await admin.query<{ kind: string; reason: string | null }>(
      `select kind::text as kind, reason from worklist.item_events
       where item_id = any($1::uuid[]) order by created_at, id`,
      [[released, reassigned, overrideItem]],
    );
    expect(events.rows).toEqual(expect.arrayContaining([
      { kind: 'release', reason: 'return to pool' },
      { kind: 'reassign', reason: 'balance JARI load' },
      { kind: 'complete', reason: 'reviewed' },
      { kind: 'override', reason: 'board override' },
    ]));

    const auditRows = await admin.query<{ table_name: string }>(
      `select distinct table_name from audit.log where table_schema = 'worklist' order by table_name`,
    );
    expect(auditRows.rows.map((row) => row.table_name)).toEqual(expect.arrayContaining([
      'item_events',
      'items',
      'queues',
      'worker_state',
    ]));

    const eventId = await admin.query<IdRow>(
      `select id from worklist.item_events where item_id = $1 order by created_at limit 1`,
      [released],
    );
    await expect(asRole(admin, 'stynx_app', tenantA, supervisor, () =>
      admin.query(`update worklist.item_events set reason = 'mutated' where id = $1`, [eventId.rows[0]?.id]),
    )).rejects.toThrow('append-only');
  });

  it('records each overdue item once across concurrent breach sweeps', async () => {
    await createQueue(admin, 'sla-breach');
    const itemId = await enqueue(admin, 'sla-breach', 'overdue', new Date('2026-08-01T00:00:00.000Z'));
    const [first, second] = await Promise.all([
      asRole(admin, 'stynx_app', tenantA, supervisor, () =>
        admin.query<{ item_id: string }>(`select item_id from worklist.detect_breaches(10)`),
      ),
      (async () => {
        const client = new Client({ connectionString: database.connectionString('worklist-sla-racer') });
        await client.connect();
        try {
          return await asRole(client, 'stynx_app', tenantA, supervisor, () =>
            client.query<{ item_id: string }>(`select item_id from worklist.detect_breaches(10)`),
          );
        } finally {
          await client.end();
        }
      })(),
    ]);
    expect([...first.rows, ...second.rows].map((row) => row.item_id)).toEqual([itemId]);

    const recorded = await admin.query<{ breaches: string; breached: boolean }>(
      `select count(e.id)::text as breaches, i.breach_detected_at is not null as breached
       from worklist.items i
       left join worklist.item_events e on e.item_id = i.id and e.kind = 'deadline_breach'
       where i.id = $1 group by i.id`,
      [itemId],
    );
    expect(recorded.rows[0]).toEqual({ breaches: '1', breached: true });
  });
});
