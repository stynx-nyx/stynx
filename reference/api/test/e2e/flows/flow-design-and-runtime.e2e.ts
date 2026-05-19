import { PermissionCache } from '@stynx/auth';
import { auditExpect, expectRLSIsolated } from '@stynx/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeReferenceApiE2e,
  queryRowsAsTenant,
  setupReferenceApiE2e,
  type ReferenceApiE2eContext,
} from '../fixtures/app';
import { createAuthenticatedAgent, type AuthenticatedAgent } from '../fixtures/http';
import { actors, tenants } from '../fixtures/seed';

interface FlowRow {
  id: string;
  code?: string;
  createdBy?: string;
}

interface FlowScenario {
  scope: FlowRow & { code: string };
  graph: FlowRow & { code: string };
  reviewNode: FlowRow;
  form: FlowRow;
  requiredQuestion: FlowRow;
  waivedQuestion: FlowRow;
  targetId: string;
}

interface RunEnsureBody {
  runId: string;
}

interface TaskBody {
  id: string;
  status: string;
  assigneeUserId?: string | null;
  decidedAction?: string | null;
}

interface PagedBody<T> {
  data: T[];
  meta: {
    total: number;
  };
}

interface TenantScopedFlowRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  target_id?: string;
}

const flowPermissions = [
  'flow:read:design',
  'flow:write:design',
  'flow:read:runtime',
  'flow:execute:task',
  'flow:assign:task',
  'flow:read:analytics',
  'flow:admin:*',
] as const;

async function grantFlowPermissions(context: ReferenceApiE2eContext): Promise<void> {
  const client = await context.postgres.connectAsAdmin();
  try {
    for (const permission of flowPermissions) {
      await client.query(
        `
          insert into auth.perms (id, key, description)
          values (gen_random_uuid(), $1, $1)
          on conflict (key) do nothing
        `,
        [permission],
      );

      for (const membershipId of [actors.adminA.membershipId, actors.adminB.membershipId]) {
        await client.query(
          `
            insert into auth.direct_perms (id, membership_id, perm_id, effect)
            select gen_random_uuid(), $1::uuid, perm.id, 'allow'
            from auth.perms perm
            where perm.key = $2
              and not exists (
                select 1
                from auth.direct_perms existing
                where existing.membership_id = $1::uuid
                  and existing.perm_id = perm.id
                  and existing.effect = 'allow'
              )
          `,
          [membershipId, permission],
        );
      }
    }
  } finally {
    await client.end();
  }

  const permissionCache = context.app.get(PermissionCache);
  await permissionCache.publishInvalidation(`${actors.adminA.userId}:${tenants.tenantA}`);
  await permissionCache.publishInvalidation(`${actors.adminB.userId}:${tenants.tenantB}`);
}

function putQuestionScore(
  context: ReferenceApiE2eContext,
  token: string,
  questionId: string,
  body: Record<string, unknown>,
): request.Test {
  return request(context.app.getHttpServer())
    .put(`/flow/questions/${questionId}/score`)
    .set('authorization', `Bearer ${token}`)
    .set('Idempotency-Key', `flow-score-${questionId}`)
    .send(body);
}

async function countRows(context: ReferenceApiE2eContext, sql: string, values: unknown[]): Promise<number> {
  return context.database.withSystemContext('flow e2e count', async () =>
    context.database.tx(
      async (trx) => {
        const result = await trx.query<{ value: string | number }>(sql, values);
        return Number(result.rows[0]?.value ?? 0);
      },
      { role: 'owner', readonly: true, replica: false },
    ),
  );
}

async function createFlowScenario(
  context: ReferenceApiE2eContext,
  admin: AuthenticatedAgent,
  token: string,
  actorId: string,
  suffix: string,
): Promise<FlowScenario> {
  const scope = (await admin.post('/flow/scopes').send({
    code: `design-runtime-${suffix}`,
    label: `Design Runtime ${suffix}`,
    adapterKey: 'reference',
  }).expect(201)).body as FlowScenario['scope'];
  expect(scope.createdBy).toBe(actorId);

  const graph = (await admin.post('/flow/graphs').send({
    scopeId: scope.id,
    code: `approval-${suffix}`,
    version: 'v1',
    isActive: true,
    name: `Approval ${suffix}`,
  }).expect(201)).body as FlowScenario['graph'];

  const start = (await admin.post(`/flow/graphs/${graph.id}/nodes`).send({
    code: 'start',
    kind: 'start',
    sortOrder: 1,
  }).expect(201)).body as FlowRow;
  const reviewNode = (await admin.post(`/flow/graphs/${graph.id}/nodes`).send({
    code: 'review',
    name: 'Review',
    kind: 'human',
    decisionPolicy: 'any',
    allowedActions: ['approve', 'reject'],
    sortOrder: 2,
  }).expect(201)).body as FlowRow;
  const end = (await admin.post(`/flow/graphs/${graph.id}/nodes`).send({
    code: 'end',
    kind: 'end',
    sortOrder: 3,
  }).expect(201)).body as FlowRow;

  await admin.post(`/flow/graphs/${graph.id}/edges`).send({
    fromNodeId: start.id,
    toNodeId: reviewNode.id,
    sortOrder: 1,
  }).expect(201);
  const approvalEdge = (await admin.post(`/flow/graphs/${graph.id}/edges`).send({
    fromNodeId: reviewNode.id,
    toNodeId: end.id,
    action: 'approve',
    sortOrder: 2,
  }).expect(201)).body as FlowRow;

  await admin.post(`/flow/nodes/${reviewNode.id}/agent-rules`).send({
    ruleType: 'user',
    userId: actorId,
    sortOrder: 1,
  }).expect(201);

  const form = (await admin.post('/flow/forms').send({
    scopeId: scope.id,
    code: `review-screen-${suffix}`,
    title: `Review screen ${suffix}`,
    isActive: true,
  }).expect(201)).body as FlowScenario['form'];
  const requiredQuestion = (await admin.post(`/flow/forms/${form.id}/questions`).send({
    key: 'approved',
    label: 'Approved',
    fieldType: 'boolean',
    required: true,
    sortOrder: 1,
  }).expect(201)).body as FlowScenario['requiredQuestion'];
  const waivedQuestion = (await admin.post(`/flow/forms/${form.id}/questions`).send({
    key: 'evidence',
    label: 'Evidence',
    fieldType: 'file',
    required: true,
    sortOrder: 2,
  }).expect(201)).body as FlowScenario['waivedQuestion'];

  await putQuestionScore(context, token, requiredQuestion.id, {
    passPoints: '2',
    failPoints: '0',
  }).expect(200);
  await admin.post(`/flow/nodes/${reviewNode.id}/form-rules`).send({
    formId: form.id,
    required: true,
    gatingMode: 'all_required',
  }).expect(201);

  await admin.get(`/flow/graphs/${graph.id}/export`).expect(200)
    .expect(({ body }) => {
      expect(body.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'start' }),
        expect.objectContaining({ code: 'review' }),
        expect.objectContaining({ code: 'end' }),
      ]));
      expect(body.edges).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: approvalEdge.id, action: 'approve' }),
      ]));
    });

  return {
    scope,
    graph,
    reviewNode,
    form,
    requiredQuestion,
    waivedQuestion,
    targetId: `target-${suffix}`,
  };
}

describe('@stynx/reference-api e2e flow design and runtime', () => {
  let context: ReferenceApiE2eContext;
  let adminA: AuthenticatedAgent;
  let viewerA: AuthenticatedAgent;
  let adminB: AuthenticatedAgent;
  let tenantARunId = '';
  let tenantBRunId = '';
  let tenantATargetId = '';
  let tenantBTargetId = '';

  beforeAll(async () => {
    context = await setupReferenceApiE2e({
      databaseName: 'reference_api_flow_design_runtime',
    });
    await grantFlowPermissions(context);
    adminA = createAuthenticatedAgent(context.app, context.tokens.adminA);
    viewerA = createAuthenticatedAgent(context.app, context.tokens.viewerA);
    adminB = createAuthenticatedAgent(context.app, context.tokens.adminB);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  it('runs design authoring, runtime execution, form completion, signals, analytics, and audit rows', async () => {
    const suffix = `a-${Date.now().toString(36)}`;
    const scenario = await createFlowScenario(
      context,
      adminA,
      context.tokens.adminA,
      actors.adminA.userId,
      suffix,
    );
    tenantATargetId = scenario.targetId;

    await auditExpect(context.database, 'scopes', 'flow.scope.create', {
      schema: 'flow',
      rowId: scenario.scope.id,
    });
    await auditExpect(context.database, 'graphs', 'flow.graph.create', {
      schema: 'flow',
      rowId: scenario.graph.id,
    });
    await auditExpect(context.database, 'questions', 'flow.question.create', {
      schema: 'flow',
      rowId: scenario.requiredQuestion.id,
    });
    await auditExpect(context.database, 'scores', 'flow.score.put', { schema: 'flow' });

    const ensureBody = {
      graphCode: scenario.graph.code,
      version: 'v1',
      scopeCode: scenario.scope.code,
      targetType: 'generic',
      targetId: scenario.targetId,
    };
    const ensured = (await adminA.post('/flow/runs/ensure').send(ensureBody).expect(201)).body as RunEnsureBody;
    tenantARunId = ensured.runId;
    expect(tenantARunId).toEqual(expect.any(String));
    await auditExpect(context.database, 'runs', 'flow.run.ensure', { schema: 'flow' });

    const tasks = (await adminA.get(`/flow/runs/${tenantARunId}/tasks`).expect(200)).body as TaskBody[];
    expect(tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'open',
        assigneeUserId: actors.adminA.userId,
      }),
    ]));
    const task = tasks[0];
    if (!task) {
      throw new Error('Expected Flow run to create at least one task');
    }

    await adminA.get(`/flow/tasks/${task.id}/candidates`).expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(expect.arrayContaining([
          expect.objectContaining({
            agentType: 'user',
            agentId: actors.adminA.userId,
          }),
        ]));
      });

    await adminA.get(`/flow/open-tasks?scopeCode=${scenario.scope.code}`).expect(200)
      .expect(({ body }: { body: PagedBody<TaskBody> }) => {
        expect(body.meta.total).toBeGreaterThanOrEqual(1);
      });

    await adminA.post(`/flow/tasks/${task.id}/act`)
      .send({ action: 'approve', note: 'blocked until required forms are satisfied' })
      .expect(500)
      .expect(({ text }) => {
        expect(text).toContain('required flow form rules are not satisfied');
      });

    const fill = (await adminA.post(`/flow/forms/${scenario.form.id}/fills`).send({
      scopeId: scenario.scope.id,
      runId: tenantARunId,
      taskId: task.id,
      targetType: 'generic',
      targetId: scenario.targetId,
      status: 'submitted',
    }).expect(201)).body as FlowRow;
    await auditExpect(context.database, 'fills', 'flow.fill.create', {
      schema: 'flow',
      rowId: fill.id,
    });

    const answer = (await adminA.post(`/flow/fills/${fill.id}/answers`).send({
      questionId: scenario.requiredQuestion.id,
      value: { value: true },
    }).expect(201)).body as FlowRow;
    await auditExpect(context.database, 'answers', 'flow.answer.upsert', {
      schema: 'flow',
      rowId: answer.id,
    });

    const waiver = (await adminA.post(`/flow/fills/${fill.id}/waivers`).send({
      questionId: scenario.waivedQuestion.id,
      reason: 'File evidence waived for reference backend E2E',
      waivedBy: actors.adminA.userId,
    }).expect(201)).body as FlowRow;
    await auditExpect(context.database, 'waivers', 'flow.waiver.create', {
      schema: 'flow',
      rowId: waiver.id,
    });

    await adminA.post('/flow/signal').send({
      scopeCode: scenario.scope.code,
      targetType: 'generic',
      targetId: scenario.targetId,
    }).expect(201);
    await auditExpect(context.database, 'runs', 'flow.signal', { schema: 'flow' });
    await adminA.get(`/flow/events?runId=${tenantARunId}&kind=signal_received`).expect(200)
      .expect(({ body }: { body: PagedBody<FlowRow> }) => {
        expect(body.meta.total).toBeGreaterThanOrEqual(1);
      });

    await adminA.post(`/flow/tasks/${task.id}/accept`)
      .send({ note: 'Accepted after evidence completion' })
      .expect(201);
    await auditExpect(context.database, 'tasks', 'flow.task.accept', {
      schema: 'flow',
      rowId: task.id,
    });

    const acted = (await adminA.post(`/flow/tasks/${task.id}/act`)
      .send({ action: 'approve', note: 'Approved with complete form evidence' })
      .expect(201)).body as TaskBody;
    expect(acted.status).toBe('completed');
    expect(acted.decidedAction).toBe('approve');
    await auditExpect(context.database, 'tasks', 'flow.task.act', {
      schema: 'flow',
      rowId: task.id,
    });

    await adminA.get(`/flow/runs/${tenantARunId}`).expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('completed');
      });
    await adminA.get(`/flow/runs/summary?scopeCode=${scenario.scope.code}`).expect(200)
      .expect(({ body }: { body: PagedBody<{ status: string; runCount: number }> }) => {
        expect(body.data).toEqual(expect.arrayContaining([
          expect.objectContaining({
            status: 'completed',
            runCount: 1,
          }),
        ]));
      });

    await expect(
      countRows(
        context,
        `
          select count(*)::int as value
          from flow.runs
          where tenant_id = $1::uuid
            and target_id = $2
        `,
        [tenants.tenantA, scenario.targetId],
      ),
    ).resolves.toBe(1);
  });

  it('denies unauthenticated and missing-permission design mutations', async () => {
    await request(context.app.getHttpServer()).get('/flow/scopes').expect(401);
    await viewerA.post('/flow/scopes').send({
      code: 'viewer-denied-flow',
      label: 'Viewer Denied Flow',
      adapterKey: 'reference',
    }).expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('Missing permission flow:write:design');
      });
  });

  it('keeps flow runs hidden across tenant-scoped RLS reads', async () => {
    const suffix = `b-${Date.now().toString(36)}`;
    const scenario = await createFlowScenario(
      context,
      adminB,
      context.tokens.adminB,
      actors.adminB.userId,
      suffix,
    );

    const ensured = (await adminB.post('/flow/runs/ensure').send({
      graphCode: scenario.graph.code,
      version: 'v1',
      scopeCode: scenario.scope.code,
      targetType: 'generic',
      targetId: scenario.targetId,
    }).expect(201)).body as RunEnsureBody;
    tenantBRunId = ensured.runId;
    tenantBTargetId = scenario.targetId;

    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<TenantScopedFlowRow>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, tenant_id::text, target_id from flow.runs',
      ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
    await expect(
      queryRowsAsTenant<TenantScopedFlowRow>(
        context,
        tenants.tenantA,
        actors.adminA.userId,
        `
          select id::text, tenant_id::text, target_id
          from flow.runs
          where target_id = $1
        `,
        [tenantBTargetId],
      ),
    ).resolves.toEqual([]);
    await expect(
      queryRowsAsTenant<TenantScopedFlowRow>(
        context,
        tenants.tenantB,
        actors.adminB.userId,
        `
          select id::text, tenant_id::text, target_id
          from flow.runs
          where target_id = $1
        `,
        [tenantBTargetId],
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: tenantBRunId,
        tenant_id: tenants.tenantB,
        target_id: tenantBTargetId,
      }),
    ]);
    await expect(
      queryRowsAsTenant<TenantScopedFlowRow>(
        context,
        tenants.tenantA,
        actors.adminA.userId,
        `
          select id::text, tenant_id::text, target_id
          from flow.runs
          where target_id = $1
        `,
        [tenantATargetId],
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: tenantARunId,
        tenant_id: tenants.tenantA,
        target_id: tenantATargetId,
      }),
    ]);
  });
});
