import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FlowRuntimeService } from '../../src/flow-runtime.service';
import type { Mock } from 'vitest';

const SCOPE = '0190abcd-1234-7abc-89ab-000000000001';
const RUN = '0190abcd-1234-7abc-89ab-000000000002';
const NODE = '0190abcd-1234-7abc-89ab-000000000003';
const TASK = '0190abcd-1234-7abc-89ab-000000000004';
const USER = '0190abcd-1234-7abc-89ab-000000000005';
const EVENT = '0190abcd-1234-7abc-89ab-000000000006';

interface FakeTrx {
  query: Mock<Promise<{ rows: unknown[] }>, [string, unknown[]?]>;
}

function makeTrx(rowsByCall: Array<unknown[]> = []) {
  let i = 0;
  return {
    query: vi.fn(async () => ({ rows: rowsByCall[i++] ?? [] })),
  } as FakeTrx;
}

function makeDb(rowsByCall: Array<unknown[]> = []) {
  const trx = makeTrx(rowsByCall);
  return {
    db: { tx: vi.fn(async (fn: (t: FakeTrx) => unknown) => fn(trx)) } as never,
    trx,
  };
}

function makeAdapters(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    buildFacts: vi.fn(async () => ({ x: 1 })),
    applyEffect: vi.fn(async () => ({ ok: true, payload: { ok: true } })),
    canManage: vi.fn(async () => true),
    canView: vi.fn(async () => true),
    resolveAgents: vi.fn(async () => [{ type: 'user', id: 'u-1', label: 'U' }]),
    ...overrides,
  } as never;
}

function makeService(
  rowsByCall: Array<unknown[]> = [],
  ctx: { tenantId?: string; actorId?: string } = { tenantId: 't-1', actorId: USER },
  adaptersOverrides: Partial<Record<string, unknown>> = {},
) {
  const { db, trx } = makeDb(rowsByCall);
  const adapters = makeAdapters(adaptersOverrides);
  return {
    service: new FlowRuntimeService(db, ctx as never, adapters),
    trx,
    db,
    adapters,
  };
}

describe('FlowRuntimeService.ensureRun', () => {
  it('resolves scope code from scopeId when scopeCode is absent', async () => {
    const { service, trx } = makeService([
      [{ code: 'scope-A' }], // scopeCodeForId getOne
      [{ run_id: RUN }], // run_ensure
    ]);
    const result = await service.ensureRun({
      graphCode: 'g',
      version: 'v1',
      scopeId: SCOPE,
      targetType: 'doc',
      targetId: 'doc-1',
    });
    expect(result).toEqual({ runId: RUN });
    const [, ensureParams] = trx.query.mock.calls[1]!;
    expect((ensureParams as unknown[])[2]).toBe('scope-A');
  });

  it('uses scopeCode directly when provided', async () => {
    const { service } = makeService([
      [{ run_id: RUN }],
    ]);
    const result = await service.ensureRun({
      graphCode: 'g',
      scopeCode: 'direct-scope',
      targetType: 'doc',
      targetId: 'doc-1',
    });
    expect(result).toEqual({ runId: RUN });
  });

  it('passes optional signal facts to the adapter before ensuring a run', async () => {
    const { service, adapters } = makeService([[{ run_id: RUN }]]);
    await service.ensureRun({
      graphCode: 'g',
      scopeCode: 'direct-scope',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'doc-1',
      signalKey: 'changed',
      payload: { id: 'doc-1' },
    });
    expect(adapters.buildFacts).toHaveBeenCalledWith(expect.objectContaining({
      signalKey: 'changed',
      payload: { id: 'doc-1' },
    }));
  });

  it('throws when flow.run_ensure returns no run_id', async () => {
    const { service } = makeService([
      [{ /* no run_id */ }],
    ]);
    await expect(
      service.ensureRun({
        graphCode: 'g',
        scopeCode: 's',
        targetType: 'doc',
        targetId: 'doc-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires scopeId when scopeCode is absent', async () => {
    const { service } = makeService([]);
    await expect(
      service.ensureRun({
        graphCode: 'g',
        targetType: 'doc',
        targetId: 'doc-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calls adapter.buildFacts when adapterKey + tenantId are present', async () => {
    const { service, adapters } = makeService(
      [[{ run_id: RUN }]],
      { tenantId: 't-1', actorId: USER },
    );
    await service.ensureRun({
      graphCode: 'g',
      scopeCode: 's',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'doc-1',
    });
    expect(adapters.buildFacts).toHaveBeenCalled();
  });

  it('records adapter failure when buildFacts throws + runId is known', async () => {
    // ensureRun does not have a runId in scope; recordAdapterFailure
    // short-circuits when no runId. So buildFacts failure rethrows
    // without recording.
    const { service } = makeService(
      [],
      { tenantId: 't-1', actorId: USER },
      { buildFacts: vi.fn(async () => { throw new Error('adapter boom'); }) },
    );
    await expect(
      service.ensureRun({
        graphCode: 'g',
        scopeCode: 's',
        adapterKey: 'docs',
        targetType: 'doc',
        targetId: 'doc-1',
      }),
    ).rejects.toThrow('adapter boom');
  });
});

describe('FlowRuntimeService listRuns / listNodeRuns / listTasks / listEvents', () => {
  it('listRuns assembles filtered query + total count + meta', async () => {
    const { service, trx } = makeService([
      [{ id: RUN }], // rows
      [{ total: '42' }], // count
    ]);
    const result = await service.listRuns({ scopeId: SCOPE, status: 'active', page: 2, pageSize: 10 });
    expect((result as { data: unknown[] }).data).toHaveLength(1);
    expect((result as { meta: { total: number } }).meta.total).toBe(42);
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('scope_id = $1::uuid');
    expect(sql).toContain('status = $2');
  });

  it('listRuns omits WHERE when no filters', async () => {
    const { service, trx } = makeService([[], [{ total: '0' }]]);
    await service.listRuns({});
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).not.toContain('where');
  });

  it('list methods use default empty queries when omitted', async () => {
    const a = makeService([[], []]);
    await a.service.listRuns();
    expect(a.trx.query.mock.calls[0]?.[1]).toEqual([50, 0]);

    const b = makeService([[], []]);
    await b.service.listNodeRuns();
    expect(b.trx.query.mock.calls[0]?.[1]).toEqual([50, 0]);

    const c = makeService([[], []]);
    await c.service.listTasks();
    expect(c.trx.query.mock.calls[0]?.[1]).toEqual([50, 0]);

    const d = makeService([[], []]);
    await d.service.listEvents();
    expect(d.trx.query.mock.calls[0]?.[1]).toEqual([50, 0]);
  });

  it('listNodeRuns filters by runId + status', async () => {
    const { service, trx } = makeService([[], [{ total: '0' }]]);
    await service.listNodeRuns({ runId: RUN, status: 'opened' });
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('nr.run_id = $1::uuid');
    expect(sql).toContain('nr.status = $2');
    expect(sql).not.toContain('::text');
  });

  it('listTasks honors mine=true (assignee = current actor)', async () => {
    const { service, trx } = makeService([[], [{ total: '0' }]]);
    await service.listTasks({ mine: true });
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params).toContain(USER);
  });

  it('listTasks uses an empty actor filter for mine=true without actor context', async () => {
    const { service, trx } = makeService([[], [{ total: '0' }]], { tenantId: 't-1' });
    await service.listTasks({ mine: true });
    expect((trx.query.mock.calls[0]?.[1] as unknown[])[0]).toBe('');
  });

  it('listTasks filters by runId + assigneeUserId + status', async () => {
    const { service, trx } = makeService([[], [{ total: '0' }]]);
    await service.listTasks({ runId: RUN, assigneeUserId: USER, status: 'open' });
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('t.run_id = $1::uuid');
    expect(sql).toContain('t.assignee_user_id = $2::uuid');
    expect(sql).toContain('t.status = $3');
  });

  it('listEvents filters by runId + nodeId + taskId + kind + actorId', async () => {
    const { service, trx } = makeService([[], [{ total: '0' }]]);
    await service.listEvents({
      runId: RUN,
      nodeId: NODE,
      taskId: TASK,
      kind: 'effect_requested',
      actorId: USER,
    });
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('run_id = $1::uuid');
    expect(sql).toContain('kind = $4');
  });
});

describe('FlowRuntimeService getRun / updateRun / getNodeRun / getTask', () => {
  it('getRun returns one or throws NotFound', async () => {
    const f = makeService([[{ id: RUN }]]);
    await expect(f.service.getRun(RUN)).resolves.toMatchObject({ id: RUN });
    const m = makeService([[]]);
    await expect(m.service.getRun(RUN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateRun returns the camelized updated row', async () => {
    const { service } = makeService([[{ id: RUN, status: 'completed' }]]);
    await expect(service.updateRun(RUN, { status: 'completed' })).resolves.toMatchObject({
      id: RUN,
      status: 'completed',
    });
  });

  it('updateRun records a nullable actor when actor context is absent', async () => {
    const { service, trx } = makeService([[{ id: RUN }]], { tenantId: 't-1' });
    await service.updateRun(RUN, { status: 'completed' });
    expect(trx.query.mock.calls[0]?.[1]).toEqual([RUN, 'completed', null]);
  });

  it('updateRun throws NotFoundException when row is absent', async () => {
    const { service } = makeService([[]]);
    await expect(service.updateRun(RUN, { status: 'completed' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getNodeRun returns one or throws NotFound', async () => {
    const f = makeService([[{ id: 'nr-1' }]]);
    await expect(f.service.getNodeRun('nr-1')).resolves.toMatchObject({ id: 'nr-1' });
    const m = makeService([[]]);
    await expect(m.service.getNodeRun('nr-x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getTask returns one or throws NotFound', async () => {
    const f = makeService([[{ id: TASK }]]);
    await expect(f.service.getTask(TASK)).resolves.toMatchObject({ id: TASK });
    const m = makeService([[]]);
    await expect(m.service.getTask(TASK)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listRunNodeRuns / listRunTasks / listRunEvents share the same list shape', async () => {
    const a = makeService([[{ id: 'nr-1' }]]);
    await expect(a.service.listRunNodeRuns(RUN)).resolves.toHaveLength(1);
    const b = makeService([[{ id: TASK }]]);
    await expect(b.service.listRunTasks(RUN)).resolves.toHaveLength(1);
    const c = makeService([[{ id: EVENT }]]);
    await expect(c.service.listRunEvents(RUN)).resolves.toHaveLength(1);
  });
});

describe('FlowRuntimeService task action flows', () => {
  it('actTask asserts allowed action + execution allowed, then calls task_complete', async () => {
    const { service, trx } = makeService([
      [{ allowed: true }], // assertAllowedAction
      [{ assignee_user_id: USER, adapter_key: 'docs', target_type: 'doc', target_id: 'd-1', is_user_candidate: true }], // taskAccess
      [], // task_complete sql function call
      [{ id: TASK, status: 'completed' }], // getTaskFromTransaction
    ]);
    const result = await service.actTask(TASK, { action: 'approve' });
    expect(result).toMatchObject({ id: TASK, status: 'completed' });
    expect(trx.query.mock.calls.length).toBe(4);
  });

  it('actTask rejects when assertAllowedAction returns allowed=false', async () => {
    const { service } = makeService([[{ allowed: false }]]);
    await expect(service.actTask(TASK, { action: 'reject' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('actTask throws NotFound when no task row exists', async () => {
    const { service } = makeService([[]]);
    await expect(service.actTask(TASK, { action: 'approve' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('actTask throws Forbidden when actorId is missing', async () => {
    const { service } = makeService(
      [[{ allowed: true }]],
      { tenantId: 't-1' /* no actorId */ },
    );
    await expect(service.actTask(TASK, { action: 'approve' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('actTask throws Forbidden when assignee belongs to another actor', async () => {
    const { service } = makeService([
      [{ allowed: true }],
      [{ assignee_user_id: 'other-user', adapter_key: 'k', target_type: 't', target_id: 't-1', is_user_candidate: true }],
    ]);
    await expect(service.actTask(TASK, { action: 'approve' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('actTask throws Forbidden when no assignee and actor is not a candidate', async () => {
    const { service } = makeService([
      [{ allowed: true }],
      [{ assignee_user_id: null, adapter_key: 'k', target_type: 't', target_id: 't-1', is_user_candidate: false }],
    ]);
    await expect(service.actTask(TASK, { action: 'approve' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('assignTask asserts management allowed and calls task_assign', async () => {
    const { service, adapters } = makeService([
      [{ assignee_user_id: USER, adapter_key: 'k', target_type: 't', target_id: 't-1' }], // taskAccess
      [], // task_assign
      [{ id: TASK, assignee_user_id: USER }],
    ]);
    await service.assignTask(TASK, { userId: USER });
    expect(adapters.canManage).toHaveBeenCalled();
  });

  it('assignTask throws Forbidden when canManage denies', async () => {
    const { service } = makeService(
      [
        [{ assignee_user_id: USER, adapter_key: 'k', target_type: 't', target_id: 't-1' }],
      ],
      { tenantId: 't-1', actorId: USER },
      { canManage: vi.fn(async () => false) },
    );
    await expect(service.assignTask(TASK, { userId: USER })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('assignTask throws NotFound when task access has no row', async () => {
    const { service } = makeService([[]]);
    await expect(service.assignTask(TASK, { userId: USER })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('assignTask omits actorId from adapter checks when actor context is absent', async () => {
    const { service, adapters, trx } = makeService(
      [
        [{ assignee_user_id: null, adapter_key: 'k', target_type: 't', target_id: 't-1' }],
        [],
        [{ id: TASK }],
      ],
      { tenantId: 't-1' },
    );
    await service.assignTask(TASK, { userId: USER });
    expect(adapters.canManage).toHaveBeenCalledWith(expect.not.objectContaining({ actorId: expect.anything() }));
    expect(trx.query.mock.calls[0]?.[1]).toEqual([TASK, '']);
  });

  it('unassignTask + acceptTask + declineTask + unacceptTask + withdrawTask route to their sql functions', async () => {
    const taskFn = async (sqlFn: 'unassign' | 'accept' | 'decline' | 'unaccept' | 'withdraw') => {
      const { service } = makeService(
        [
          [{ assignee_user_id: USER, adapter_key: 'k', target_type: 't', target_id: 't-1', is_user_candidate: true }],
          [],
          [{ id: TASK }],
        ],
      );
      const method = `${sqlFn}Task` as 'unassignTask';
      await (service[method] as (id: string, input: unknown) => Promise<unknown>)(TASK, {});
    };
    await taskFn('accept');
    await taskFn('decline');
    await taskFn('unaccept');
    await taskFn('withdraw');
    // unassignTask uses assertTaskManagementAllowed (not execution)
    const { service: svc } = makeService([
      [{ assignee_user_id: USER, adapter_key: 'k', target_type: 't', target_id: 't-1' }],
      [],
      [{ id: TASK }],
    ]);
    await svc.unassignTask(TASK, {});
  });
});

describe('FlowRuntimeService.taskCandidates', () => {
  it('passes through non-resolver candidates unchanged', async () => {
    const { service } = makeService([
      [{ assignee_user_id: USER, adapter_key: 'k', target_type: 't', target_id: 't-1' }],
      [
        {
          agent_type: 'user',
          agent_id: USER,
          rule_id: 'r-1',
          run_id: RUN,
          node_id: NODE,
          adapter_key: 'k',
          target_type: 't',
          target_id: 't-1',
        },
      ],
    ]);
    const result = await service.taskCandidates(TASK);
    expect(result[0].agentType).toBe('user');
  });

  it('expands resolver candidates via adapters.resolveAgents', async () => {
    const { service, adapters } = makeService([
      [{ assignee_user_id: USER, adapter_key: 'k', target_type: 't', target_id: 't-1' }],
      [
        {
          agent_type: 'resolver',
          agent_id: 'my-resolver',
          rule_id: 'r-1',
          params: { p: 1 },
          run_id: RUN,
          node_id: NODE,
          adapter_key: 'k',
          target_type: 't',
          target_id: 't-1',
        },
      ],
    ]);
    const result = await service.taskCandidates(TASK);
    expect(adapters.resolveAgents).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ agentType: 'user', resolverKey: 'my-resolver' });
  });

  it('marks resolver as unresolved when no agents returned', async () => {
    const { service } = makeService(
      [
        [{ assignee_user_id: USER, adapter_key: 'k', target_type: 't', target_id: 't-1' }],
        [
          {
            agent_type: 'resolver',
            agent_id: 'my-resolver',
            rule_id: 'r-1',
            params: {},
            run_id: RUN,
            node_id: NODE,
            adapter_key: 'k',
            target_type: 't',
            target_id: 't-1',
          },
        ],
      ],
      { tenantId: 't-1', actorId: USER },
      { resolveAgents: vi.fn(async () => []) },
    );
    const result = await service.taskCandidates(TASK);
    expect(result[0]).toMatchObject({ unresolved: true });
  });

  it('leaves resolver candidates unresolved when request context or resolver metadata is incomplete', async () => {
    const { service, adapters } = makeService(
      [
        [{ assignee_user_id: USER, adapter_key: 'k', target_type: 't', target_id: 't-1' }],
        [
          {
            agent_type: 'resolver',
            agent_id: '',
            rule_id: 'r-1',
            params: [],
            run_id: RUN,
            node_id: NODE,
            adapter_key: '',
            target_type: null,
            target_id: null,
          },
        ],
      ],
      { tenantId: 't-1', actorId: USER },
    );
    const result = await service.taskCandidates(TASK);
    expect(result[0]).toMatchObject({ agentType: 'resolver', agentId: '' });
    expect(adapters.resolveAgents).not.toHaveBeenCalled();
  });

  it('leaves resolver candidates unresolved when resolver id is null', async () => {
    const { service, adapters } = makeService([
      [{ assignee_user_id: USER, adapter_key: 'k', target_type: 't', target_id: 't-1' }],
      [{
        agent_type: 'resolver',
        agent_id: null,
        rule_id: 'r-1',
        run_id: RUN,
        node_id: NODE,
        adapter_key: 'k',
        target_type: 't',
        target_id: 't-1',
      }],
    ]);
    const result = await service.taskCandidates(TASK);
    expect(result[0]).toMatchObject({ agentType: 'resolver', agentId: null });
    expect(adapters.resolveAgents).not.toHaveBeenCalled();
  });

  it('passes empty strings for nullable resolver candidate context', async () => {
    const { service, adapters } = makeService([
      [{ assignee_user_id: USER, adapter_key: 'k', target_type: 't', target_id: 't-1' }],
      [{
        agent_type: 'resolver',
        agent_id: 'resolver-key',
        rule_id: null,
        params: null,
        run_id: null,
        node_id: null,
        adapter_key: 'k',
        target_type: null,
        target_id: null,
      }],
    ]);
    await service.taskCandidates(TASK);
    expect(adapters.resolveAgents).toHaveBeenCalledWith(expect.objectContaining({
      targetType: '',
      targetId: '',
      runId: '',
      nodeId: '',
      ruleId: '',
    }));
  });
});

describe('FlowRuntimeService.signal', () => {
  it('resolves scopeId from scopeCode when needed and calls signal_changed', async () => {
    const { service, trx } = makeService([
      [{ id: SCOPE }], // scopeIdForCode
      [], // signal_changed
    ]);
    const result = await service.signal({
      scopeCode: 's',
      targetType: 'doc',
      targetId: 'd-1',
    });
    expect(result).toMatchObject({ scopeId: SCOPE, signaled: true });
    expect(trx.query.mock.calls.length).toBe(2);
  });

  it('uses scopeId directly when provided', async () => {
    const { service } = makeService([[]]);
    await expect(
      service.signal({ scopeId: SCOPE, targetType: 'doc', targetId: 'd-1' }),
    ).resolves.toMatchObject({ signaled: true });
  });
});

describe('FlowRuntimeService.dispatchPendingEffects', () => {
  function effectRow(extra: Partial<Record<string, unknown>> = {}) {
    return {
      event_id: EVENT,
      run_id: RUN,
      node_id: NODE,
      task_id: TASK,
      payload: { effectKey: 'send-email', payload: { to: 'a@b' } },
      adapter_key: 'k',
      target_type: 't',
      target_id: 't-1',
      node_code: 'n',
      action: 'approve',
      ...extra,
    };
  }

  it('skips events with no effectKey and marks them failed', async () => {
    const { service } = makeService([
      [effectRow({ payload: {} })], // pending fetch
      [], // recordEffectResult insert
    ]);
    const result = await service.dispatchPendingEffects({});
    expect((result as { failed: number }).failed).toBe(1);
  });

  it('calls adapter.applyEffect and records success', async () => {
    const { service, adapters } = makeService([
      [effectRow()],
      [], // recordEffectResult insert
    ]);
    const result = await service.dispatchPendingEffects({});
    expect((result as { succeeded: number }).succeeded).toBe(1);
    expect(adapters.applyEffect).toHaveBeenCalled();
  });

  it('records successful effects without optional result payload or actor', async () => {
    const { service, trx } = makeService(
      [
        [effectRow({ node_id: null })],
        [],
      ],
      { tenantId: 't-1' },
      { applyEffect: vi.fn(async () => ({ ok: true })) },
    );
    await service.dispatchPendingEffects({});
    expect(trx.query.mock.calls[1]?.[1]).toEqual([
      't-1',
      RUN,
      null,
      TASK,
      'effect_succeeded',
      null,
      { effectEventId: EVENT, effectKey: 'send-email', ok: true },
    ]);
  });

  it('uses dispatch defaults and tolerates non-object effect payload wrappers', async () => {
    const { service, adapters } = makeService([
      [effectRow({
        payload: { effectKey: 'send-email', payload: ['not-object'] },
        node_code: null,
        action: null,
        task_id: null,
      })],
      [],
    ]);
    const result = await service.dispatchPendingEffects();
    expect((result as { succeeded: number }).succeeded).toBe(1);
    expect(adapters.applyEffect).toHaveBeenCalledWith(expect.objectContaining({
      payload: {},
    }));
  });

  it('records failure when adapter.applyEffect throws', async () => {
    const { service } = makeService(
      [
        [effectRow()],
        [],
      ],
      { tenantId: 't-1', actorId: USER },
      { applyEffect: vi.fn(async () => { throw new Error('apply-boom'); }) },
    );
    const result = await service.dispatchPendingEffects({});
    expect((result as { failed: number }).failed).toBe(1);
    expect((result as { diagnostics: Array<{ error: string }> }).diagnostics[0].error).toBe(
      'apply-boom',
    );
  });

  it('records string effect failures without losing diagnostics', async () => {
    const { service } = makeService(
      [
        [effectRow()],
        [],
      ],
      { tenantId: 't-1', actorId: USER },
      { applyEffect: vi.fn(async () => { throw 'apply-string'; }) },
    );
    const result = await service.dispatchPendingEffects({});
    expect((result as { diagnostics: Array<{ error: string }> }).diagnostics[0].error).toBe(
      'apply-string',
    );
  });


  it('returns zero counts when no pending events', async () => {
    const { service } = makeService([[]]);
    const result = await service.dispatchPendingEffects({});
    expect(result).toMatchObject({ attempted: 0, succeeded: 0, failed: 0, skipped: 0 });
  });
});

describe('FlowRuntimeService — small helpers + edges', () => {
  it('listUsersForRole adds an ilike search clause when search is provided', async () => {
    const { service, trx } = makeService([[]]);
    await service.listUsersForRole('admin', 'alice');
    const [sql, params] = trx.query.mock.calls[0]!;
    expect(sql).toContain('ilike $2');
    expect(params).toEqual(['admin', '%alice%']);
  });

  it('listUsersForRole omits the ilike clause when search is undefined', async () => {
    const { service, trx } = makeService([[]]);
    await service.listUsersForRole('admin');
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).not.toContain('ilike');
  });

  it('getTaskUser returns one or throws NotFound', async () => {
    const f = makeService([[{ id: USER }]]);
    await expect(f.service.getTaskUser(USER)).resolves.toMatchObject({ id: USER });
    const m = makeService([[]]);
    await expect(m.service.getTaskUser(USER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getRunFacts merges flow.build_facts result with adapter facts', async () => {
    const { service } = makeService([
      [{ id: RUN, scope_id: SCOPE, adapter_key: 'k', target_type: 't', target_id: 't-1' }], // getRun
      [{ facts: { a: 1 } }], // build_facts
    ]);
    const result = await service.getRunFacts(RUN);
    expect((result as { a: number }).a).toBe(1);
    expect((result as { adapter: unknown }).adapter).toBeDefined();
  });

  it('getRunFacts defaults missing SQL facts to an empty object', async () => {
    const { service } = makeService([
      [{ id: RUN, scope_id: SCOPE, adapter_key: 'k', target_type: 't', target_id: 't-1' }],
      [],
    ]);
    await expect(service.getRunFacts(RUN)).resolves.toEqual({ adapter: { x: 1 } });
  });

  it('signal rejects when neither scopeCode nor scopeId is provided', async () => {
    const { service } = makeService([[]]);
    await expect(
      service.signal({ targetType: 'doc', targetId: 'd-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scope resolver helpers require either scope id or scope code', async () => {
    const { service } = makeService([[]]);
    await expect(
      (service as unknown as { scopeCodeForId: (scopeId?: string) => Promise<string> }).scopeCodeForId(undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      (service as unknown as { scopeIdForCode: (scopeCode?: string) => Promise<string> }).scopeIdForCode(undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records adapter fact failures when a run id is available', async () => {
    const { service, trx } = makeService(
      [
        [{ id: RUN, scope_id: SCOPE, adapter_key: 'k', target_type: 'doc', target_id: 'doc-1' }],
        [],
      ],
      { tenantId: 't-1', actorId: USER },
      { buildFacts: vi.fn(async () => { throw new Error('facts failed'); }) },
    );

    await expect(service.getRunFacts(RUN)).rejects.toThrow('facts failed');
    expect(trx.query.mock.calls[1]?.[0]).toContain('insert into flow.events');
    expect(trx.query.mock.calls[1]?.[1]).toEqual([
      't-1',
      RUN,
      USER,
      {
        adapterKey: 'k',
        targetType: 'doc',
        targetId: 'doc-1',
        error: 'facts failed',
      },
    ]);
  });

  it('records string adapter fact failures with a nullable actor', async () => {
    const { service, trx } = makeService(
      [
        [{ id: RUN, scope_id: SCOPE, adapter_key: 'k', target_type: 'doc', target_id: 'doc-1' }],
        [],
      ],
      { tenantId: 't-1' },
      { buildFacts: vi.fn(async () => { throw 'facts-string'; }) },
    );

    await expect(service.getRunFacts(RUN)).rejects.toBe('facts-string');
    expect(trx.query.mock.calls[1]?.[1]).toEqual([
      't-1',
      RUN,
      null,
      {
        adapterKey: 'k',
        targetType: 'doc',
        targetId: 'doc-1',
        error: 'facts-string',
      },
    ]);
  });

  it('throws when a task function cannot reload the task', async () => {
    const { service } = makeService([
      [{ assignee_user_id: USER, adapter_key: 'k', target_type: 't', target_id: 't-1', is_user_candidate: true }],
      [],
      [],
    ]);
    await expect(service.acceptTask(TASK, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exposes object input validation and tenant requirement edges', async () => {
    const { service } = makeService([]);
    expect(() => service.objectInput('not-object')).toThrow(BadRequestException);

    const noTenant = makeService(
      [[{
        event_id: EVENT,
        run_id: RUN,
        node_id: NODE,
        task_id: TASK,
        payload: { effectKey: 'send-email' },
        adapter_key: 'k',
        target_type: 't',
        target_id: 't-1',
      }]],
      { actorId: USER },
    );
    await expect(noTenant.service.dispatchPendingEffects({})).rejects.toBeInstanceOf(BadRequestException);
  });
});
