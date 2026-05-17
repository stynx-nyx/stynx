import { Test, type TestingModule } from '@nestjs/testing';
import { StynxDataModule } from '@stynx/data';
import type { Client } from 'pg';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';

const tenantA = '01978f4a-32bf-7c27-a131-fd73a9e101a1';
const tenantB = '01978f4a-32bf-7c27-a131-fd73a9e101b2';
const actorA = '01978f4a-32bf-7c27-a131-fd73a9e201a1';
const actorB = '01978f4a-32bf-7c27-a131-fd73a9e201b2';

interface IdRow {
  id: string;
}

interface RuntimeSeed {
  scopeId: string;
  formId: string;
  requiredQuestionId: string;
  waivedQuestionId: string;
  runId: string;
  taskId: string;
  eventId: string;
  facts: {
    forms?: {
      byFormCode?: Record<string, { autoPass?: boolean; score?: number; missing?: string[] }>;
      required?: { allPass?: boolean };
    };
  };
  eventKinds: string[];
  runStatus: string;
  completedNodeRuns: number;
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

async function withSessionContext<T>(
  client: Client,
  tenantId: string,
  actorId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('begin');
  try {
    await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
    await client.query(`select set_config('app.actor_id', $1, true)`, [actorId]);
    const result = await fn();
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function seedTenantAndUser(
  client: Client,
  tenantId: string,
  actorId: string,
  slug: string,
): Promise<void> {
  await client.query(
    `
      insert into auth.users (id, email)
      values ($1::uuid, $2)
      on conflict (id) do nothing
    `,
    [actorId, `${slug}@example.test`],
  );
  await asRole(client, 'stynx_app', tenantId, actorId, async () => {
    await client.query(
      `
        insert into tenancy.tenants (id, slug, name)
        values ($1::uuid, $2, $3)
        on conflict (id) do nothing
      `,
      [tenantId, slug, slug],
    );
  });
}

async function createScope(client: Client, tenantId: string, actorId: string, code: string): Promise<string> {
  return withSessionContext(client, tenantId, actorId, async () => {
    const result = await client.query<IdRow>(
      `
        insert into flow.scopes (tenant_id, code, label, adapter_key, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1, $2, 'test', current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
        returning id
      `,
      [code, code],
    );
    return result.rows[0]?.id ?? '';
  });
}

async function seedRuntime(client: Client): Promise<RuntimeSeed> {
  return withSessionContext(client, tenantA, actorA, async () => {
    const scope = await client.query<IdRow>(
      `
        insert into flow.scopes (tenant_id, code, label, adapter_key, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, 'runtime-scope', 'Runtime Scope', 'test', current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
        returning id
      `,
    );
    const scopeId = scope.rows[0]?.id ?? '';

    const graph = await client.query<IdRow>(
      `
        insert into flow.graphs (tenant_id, scope_id, code, version, is_active, name, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, 'approval', 'v1', true, 'Approval', current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
        returning id
      `,
      [scopeId],
    );
    const graphId = graph.rows[0]?.id ?? '';

    const start = await client.query<IdRow>(
      `
        insert into flow.nodes (tenant_id, graph_id, code, kind, sort_order, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, 'start', 'start', 1, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
        returning id
      `,
      [graphId],
    );
    const human = await client.query<IdRow>(
      `
        insert into flow.nodes (tenant_id, graph_id, code, kind, decision_policy, allowed_actions, sort_order, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, 'review', 'human', 'any', ARRAY['approve','reject']::text[], 2, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
        returning id
      `,
      [graphId],
    );
    const end = await client.query<IdRow>(
      `
        insert into flow.nodes (tenant_id, graph_id, code, kind, sort_order, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, 'end', 'end', 3, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
        returning id
      `,
      [graphId],
    );
    const startNodeId = start.rows[0]?.id ?? '';
    const humanNodeId = human.rows[0]?.id ?? '';
    const endNodeId = end.rows[0]?.id ?? '';

    await client.query(
      `
        insert into flow.edges (tenant_id, graph_id, from_node_id, to_node_id, sort_order, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, $2::uuid, $3::uuid, 1, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
      `,
      [graphId, startNodeId, humanNodeId],
    );
    await client.query(
      `
        insert into flow.edges (tenant_id, graph_id, from_node_id, to_node_id, action, sort_order, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, $2::uuid, $3::uuid, 'approve', 2, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
      `,
      [graphId, humanNodeId, endNodeId],
    );
    await client.query(
      `
        insert into flow.agent_rules (tenant_id, node_id, rule_type, user_id, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, 'user', current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
      `,
      [humanNodeId],
    );

    const form = await client.query<IdRow>(
      `
        insert into flow.forms (tenant_id, scope_id, code, title, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, 'screen', 'Review Screen', current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
        returning id
      `,
      [scopeId],
    );
    const formId = form.rows[0]?.id ?? '';
    const required = await client.query<IdRow>(
      `
        insert into flow.questions (tenant_id, form_id, key, label, field_type, required, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, 'approved', 'Approved', 'boolean', true, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
        returning id
      `,
      [formId],
    );
    const waived = await client.query<IdRow>(
      `
        insert into flow.questions (tenant_id, form_id, key, label, field_type, required, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, 'attachment', 'Attachment', 'file', true, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
        returning id
      `,
      [formId],
    );
    const requiredQuestionId = required.rows[0]?.id ?? '';
    const waivedQuestionId = waived.rows[0]?.id ?? '';

    await client.query(
      `
        insert into flow.scores (tenant_id, question_id, pass_points, fail_points, created_by, updated_by)
        values
          (current_setting('app.tenant_id')::uuid, $1::uuid, 2, 0, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid),
          (current_setting('app.tenant_id')::uuid, $2::uuid, 1, 0, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
      `,
      [requiredQuestionId, waivedQuestionId],
    );
    await client.query(
      `
        insert into flow.node_form_rules (tenant_id, node_id, form_id, required, gating_mode, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, $2::uuid, true, 'all_required', current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
      `,
      [humanNodeId, formId],
    );

    const run = await client.query<IdRow>(
      `select flow.run_ensure('approval', 'v1', 'runtime-scope', NULL::text, 'generic', 'target-1') as id`,
    );
    const runId = run.rows[0]?.id ?? '';
    const task = await client.query<IdRow>(
      `select id from flow.tasks where run_id = $1::uuid and status = 'open' limit 1`,
      [runId],
    );
    const taskId = task.rows[0]?.id ?? '';

    const fill = await client.query<IdRow>(
      `
        insert into flow.fills (tenant_id, form_id, scope_id, run_id, target_type, target_id, status, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, $2::uuid, $3::uuid, 'generic', 'target-1', 'submitted', current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
        returning id
      `,
      [formId, scopeId, runId],
    );
    await client.query(
      `
        insert into flow.answers (tenant_id, fill_id, question_id, value, created_by, updated_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, $2::uuid, '{"value": true}'::jsonb, current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid)
      `,
      [fill.rows[0]?.id, requiredQuestionId],
    );
    await client.query(
      `
        insert into flow.waivers (tenant_id, scope_id, target_type, target_id, form_id, question_id, reason, waived_by)
        values (current_setting('app.tenant_id')::uuid, $1::uuid, 'generic', 'target-1', $2::uuid, $3::uuid, 'not applicable', current_setting('app.actor_id')::uuid)
      `,
      [scopeId, formId, waivedQuestionId],
    );

    const factsResult = await client.query<Pick<RuntimeSeed, 'facts'>>(
      `select flow.build_facts($1::uuid, 'generic', 'target-1') as facts`,
      [scopeId],
    );
    await client.query(`select flow.task_accept($1::uuid, 'accepting')`, [taskId]);
    await client.query(`select flow.task_unaccept($1::uuid, 'reconsidering')`, [taskId]);
    await client.query(`select flow.task_accept($1::uuid, 'accepting again')`, [taskId]);
    await client.query(`select flow.task_decline($1::uuid, 'needs assignment')`, [taskId]);
    await client.query(`select flow.task_assign($1::uuid, $2::uuid, 'assigned')`, [taskId, actorA]);
    await client.query(`select flow.task_accept($1::uuid, 'accepted')`, [taskId]);
    await client.query(`select flow.task_complete($1::uuid, 'approve', 'approved', '{}'::jsonb)`, [taskId]);

    const summary = await client.query<{ run_status: string; completed_node_runs: string }>(
      `
        select
          (select status::text from flow.runs where id = $1::uuid) as run_status,
          (select count(*)::text from flow.node_runs where run_id = $1::uuid and status = 'completed') as completed_node_runs
      `,
      [runId],
    );
    const eventKinds = await client.query<{ kinds: string[] }>(
      `select array_agg(kind::text order by created_at, id) as kinds from flow.events where run_id = $1::uuid`,
      [runId],
    );
    const event = await client.query<IdRow>(
      `select id from flow.events where run_id = $1::uuid order by created_at, id limit 1`,
      [runId],
    );

    return {
      scopeId,
      formId,
      requiredQuestionId,
      waivedQuestionId,
      runId,
      taskId,
      eventId: event.rows[0]?.id ?? '',
      facts: factsResult.rows[0]?.facts ?? {},
      eventKinds: eventKinds.rows[0]?.kinds ?? [],
      runStatus: summary.rows[0]?.run_status ?? '',
      completedNodeRuns: Number(summary.rows[0]?.completed_node_runs ?? 0),
    };
  });
}

describe('Flow database and runtime integration', () => {
  jest.setTimeout(180_000);

  let testDatabase: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let adminClient: Client;

  beforeAll(async () => {
    testDatabase = await createPostgresTestDatabase('stynx_flow');
    moduleRef = await createMigratedModule(testDatabase.connectionString('@stynx/flow:owner'));
    adminClient = await testDatabase.connectAsAdmin();
    await seedTenantAndUser(adminClient, tenantA, actorA, 'flow-tenant-a');
    await seedTenantAndUser(adminClient, tenantB, actorB, 'flow-tenant-b');
  });

  afterAll(async () => {
    await adminClient?.end();
    await moduleRef?.close();
    await testDatabase?.dispose();
  });

  it('applies Flow DDL with RLS, archive mirrors, and an append-only event ledger', async () => {
    const tables = await adminClient.query<{ name: string; forced: boolean }>(
      `
        select c.relname as name, c.relforcerowsecurity as forced
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'flow'
          and c.relkind = 'r'
        order by c.relname
      `,
    );
    expect(tables.rows.map((row) => row.name)).toEqual(expect.arrayContaining([
      'agent_rules',
      'answers',
      'edges',
      'events',
      'fills',
      'forms',
      'graphs',
      'node_form_rules',
      'node_runs',
      'nodes',
      'policy_rules',
      'policy_sets',
      'questions',
      'runs',
      'scopes',
      'scores',
      'tasks',
      'transition_effects',
      'waivers',
    ]));
    expect(tables.rows.every((row) => row.forced)).toBe(true);

    const archiveTables = await adminClient.query<{ name: string }>(
      `
        select table_name as name
        from information_schema.tables
        where table_schema = 'archive'
          and table_name like 'flow_%'
        order by table_name
      `,
    );
    expect(archiveTables.rows.map((row) => row.name)).toEqual(expect.arrayContaining([
      'flow_agent_rules',
      'flow_answers',
      'flow_edges',
      'flow_fills',
      'flow_forms',
      'flow_graphs',
      'flow_node_form_rules',
      'flow_nodes',
      'flow_policy_rules',
      'flow_policy_sets',
      'flow_questions',
      'flow_scopes',
      'flow_scores',
      'flow_transition_effects',
      'flow_waivers',
    ]));
    expect(archiveTables.rows.map((row) => row.name)).not.toContain('flow_events');

    const triggers = await adminClient.query<{ name: string }>(
      `
        select tgname as name
        from pg_trigger
        where tgrelid = 'flow.events'::regclass
          and not tgisinternal
      `,
    );
    expect(triggers.rows.map((row) => row.name)).toContain('trg_flow_events_append_only');
  });

  it('enforces tenant isolation on tenant-scoped Flow tables', async () => {
    const scopeA = await createScope(adminClient, tenantA, actorA, 'shared-code');
    const scopeB = await createScope(adminClient, tenantB, actorB, 'shared-code');

    const visibleToA = await asRole(adminClient, 'stynx_reader', tenantA, undefined, async () =>
      adminClient.query<IdRow>(`select id from flow.scopes where code = 'shared-code' order by id`),
    );
    const visibleToB = await asRole(adminClient, 'stynx_reader', tenantB, undefined, async () =>
      adminClient.query<IdRow>(`select id from flow.scopes where code = 'shared-code' order by id`),
    );

    expect(visibleToA.rows.map((row) => row.id)).toEqual([scopeA]);
    expect(visibleToB.rows.map((row) => row.id)).toEqual([scopeB]);
  });

  it('runs the workflow lifecycle, task actions, events, and form facts without PORM domains', async () => {
    const runtime = await seedRuntime(adminClient);

    expect(runtime.facts.forms?.required?.allPass).toBe(true);
    expect(runtime.facts.forms?.byFormCode?.screen).toMatchObject({
      autoPass: true,
      score: 3,
      missing: [],
    });
    expect(runtime.runStatus).toBe('completed');
    expect(runtime.completedNodeRuns).toBe(3);
    expect(runtime.eventKinds).toEqual(expect.arrayContaining([
      'run_ensure',
      'node_open',
      'task_create',
      'task_accept',
      'task_unaccept',
      'task_decline',
      'task_assign',
      'task_done',
      'node_complete',
      'transition',
      'run_complete',
    ]));

    await expect(asRole(adminClient, 'stynx_app', tenantA, actorA, async () =>
      adminClient.query(`update flow.events set note = 'mutated' where id = $1::uuid`, [runtime.eventId]),
    )).rejects.toThrow('flow.events is append-only');
  });
});
