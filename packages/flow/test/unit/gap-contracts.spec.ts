import { ForbiddenException } from '@nestjs/common';
import { FlowAdapterRegistry, type FlowDomainAdapter } from '../../src/adapters';
import { FlowAnalyticsService } from '../../src/flow-analytics.service';
import { FlowPolicyService } from '../../src/flow-policy.service';
import { FlowRuntimeService } from '../../src/flow-runtime.service';
import type { Mock } from 'vitest';

const tenantId = '01978f4a-32bf-7c27-a131-fd73a9e101a1';
const actorId = '01978f4a-32bf-7c27-a131-fd73a9e201a1';
const otherActorId = '01978f4a-32bf-7c27-a131-fd73a9e201b2';
const runId = '01978f4a-32bf-7c27-a131-fd73a9e301a1';
const nodeId = '01978f4a-32bf-7c27-a131-fd73a9e401a1';
const taskId = '01978f4a-32bf-7c27-a131-fd73a9e501a1';
const effectEventId = '01978f4a-32bf-7c27-a131-fd73a9e601a1';
const ruleId = '01978f4a-32bf-7c27-a131-fd73a9e701a1';
const policySetId = '01978f4a-32bf-7c27-a131-fd73a9e801a1';

function requestContext(actor = actorId) {
  return {
    get tenantId() {
      return tenantId;
    },
    get actorId() {
      return actor;
    },
  };
}

function dbWithQuery(query: Mock) {
  return {
    tx: vi.fn(async (callback: (trx: { query: Mock }) => Promise<unknown>) =>
      callback({ query }),
    ),
  };
}

describe('Flow backend gap contracts', () => {
  it('dispatches pending effects through the adapter and skips already terminal events on retry', async () => {
    const terminalEffectEventIds = new Set<string>();
    const applyEffect = vi.fn(async () => ({ ok: true, payload: { delivered: true } }));
    const adapter: FlowDomainAdapter = {
      key: 'test',
      buildFacts: async () => ({}),
      applyEffect,
      canManage: async () => true,
      canView: async () => true,
    };
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("e.kind = 'effect_requested'")) {
        return {
          rows: terminalEffectEventIds.has(effectEventId)
            ? []
            : [{
                event_id: effectEventId,
                run_id: runId,
                node_id: nodeId,
                task_id: taskId,
                adapter_key: 'test',
                target_type: 'generic',
                target_id: 'target-1',
                node_code: 'review',
                action: 'approve',
                payload: { effectKey: 'notify', payload: { channel: 'ops' } },
              }],
        };
      }
      if (sql.includes('insert into flow.events')) {
        const payload = values?.find((value) =>
          value && typeof value === 'object' && 'effectEventId' in value,
        ) as { effectEventId?: string } | undefined;
        if (payload?.effectEventId) {
          terminalEffectEventIds.add(payload.effectEventId);
        }
      }
      return { rows: [] };
    });
    const service = new FlowRuntimeService(
      dbWithQuery(query) as never,
      requestContext() as never,
      new FlowAdapterRegistry([adapter]),
    );

    await expect(service.dispatchPendingEffects({ limit: 10 })).resolves.toMatchObject({
      attempted: 1,
      succeeded: 1,
      failed: 0,
    });
    await expect(service.dispatchPendingEffects({ limit: 10 })).resolves.toMatchObject({
      attempted: 0,
      succeeded: 0,
      failed: 0,
    });

    expect(applyEffect).toHaveBeenCalledTimes(1);
    expect(applyEffect).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      adapterKey: 'test',
      targetType: 'generic',
      targetId: 'target-1',
      runId,
      effectKey: 'notify',
      nodeCode: 'review',
      action: 'approve',
      payload: { channel: 'ops' },
    }));
    expect(query.mock.calls.some(([sql, values]) =>
      String(sql).includes('insert into flow.events')
      && Array.isArray(values)
      && values.includes('effect_succeeded'),
    )).toBe(true);
  });

  it('records failed adapter effect delivery as an effect_failed event', async () => {
    const adapter: FlowDomainAdapter = {
      key: 'test',
      buildFacts: async () => ({}),
      applyEffect: async () => {
        throw new Error('delivery failed');
      },
      canManage: async () => true,
      canView: async () => true,
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("e.kind = 'effect_requested'")) {
        return {
          rows: [{
            event_id: effectEventId,
            run_id: runId,
            node_id: nodeId,
            task_id: taskId,
            adapter_key: 'test',
            target_type: 'generic',
            target_id: 'target-1',
            node_code: 'review',
            action: 'approve',
            payload: { effectKey: 'notify', payload: {} },
          }],
        };
      }
      return { rows: [] };
    });
    const service = new FlowRuntimeService(
      dbWithQuery(query) as never,
      requestContext() as never,
      new FlowAdapterRegistry([adapter]),
    );

    await expect(service.dispatchPendingEffects({ limit: 1 })).resolves.toMatchObject({
      attempted: 1,
      succeeded: 0,
      failed: 1,
    });
    expect(query.mock.calls.some(([sql, values]) =>
      String(sql).includes('insert into flow.events')
      && Array.isArray(values)
      && values.includes('effect_failed'),
    )).toBe(true);
  });

  it('expands resolver_fn candidates through the registered adapter', async () => {
    const resolveAgents = vi.fn(async () => [
      { type: 'user' as const, id: otherActorId, label: 'Reviewer' },
      { type: 'permission' as const, id: 'flow:execute:task' },
    ]);
    const adapter: FlowDomainAdapter = {
      key: 'test',
      buildFacts: async () => ({}),
      applyEffect: async () => ({ ok: true }),
      canManage: async () => true,
      canView: async () => true,
      resolveAgents,
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('flow.resolve_agents')) {
        return {
          rows: [{
            agent_type: 'resolver',
            agent_id: 'department-head',
            rule_id: ruleId,
            params: { department: 'finance' },
            run_id: runId,
            node_id: nodeId,
            adapter_key: 'test',
            target_type: 'generic',
            target_id: 'target-1',
          }],
        };
      }
      return { rows: [] };
    });
    const service = new FlowRuntimeService(
      dbWithQuery(query) as never,
      requestContext() as never,
      new FlowAdapterRegistry([adapter]),
    );

    await expect(service.taskCandidates(taskId)).resolves.toEqual([
      expect.objectContaining({
        agentType: 'user',
        agentId: otherActorId,
        label: 'Reviewer',
        resolverKey: 'department-head',
        ruleId,
      }),
      expect.objectContaining({
        agentType: 'permission',
        agentId: 'flow:execute:task',
        resolverKey: 'department-head',
        ruleId,
      }),
    ]);
    expect(resolveAgents).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      adapterKey: 'test',
      targetType: 'generic',
      targetId: 'target-1',
      runId,
      nodeId,
      ruleId,
      resolverKey: 'department-head',
      params: { department: 'finance' },
    }));
  });

  it('rejects task actions from actors that are neither assignees nor concrete candidates', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('allowed_actions')) {
        return { rows: [{ allowed: true }] };
      }
      if (sql.includes('as assignee_user_id')) {
        return {
          rows: [{
            assignee_user_id: otherActorId,
            is_user_candidate: false,
            adapter_key: 'test',
            target_type: 'generic',
            target_id: 'target-1',
          }],
        };
      }
      return { rows: [] };
    });
    const service = new FlowRuntimeService(
      dbWithQuery(query) as never,
      requestContext(actorId) as never,
      new FlowAdapterRegistry([]),
    );

    await expect(service.actTask(taskId, { action: 'approve' })).rejects.toThrow(ForbiddenException);
  });

  it('returns paged analytics envelopes with stable metadata', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('count(*)::text as total')) {
        return { rows: [{ total: '2' }] };
      }
      return {
        rows: [{
          id: taskId,
          run_id: runId,
          status: 'open',
          target_type: 'generic',
          target_id: 'target-1',
          node_code: 'review',
        }],
      };
    });
    const service = new FlowAnalyticsService(dbWithQuery(query) as never);

    await expect(service.openTasks({
      page: '2',
      pageSize: '1',
      scopeCode: 'runtime-scope',
      status: 'open',
    })).resolves.toEqual({
      data: [expect.objectContaining({ id: taskId, runId })],
      meta: { page: 2, pageSize: 1, total: 2 },
    });
  });

  it('evaluates policies deterministically with highest priority and deny-on-tie ordering', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from flow.policy_sets')) {
        return { rows: [{ id: policySetId }] };
      }
      if (sql.includes('from flow.policy_rules')) {
        return {
          rows: [
            {
              id: ruleId,
              effect: 'deny',
              priority: 10,
              reason_code: 'BLOCKED',
              conditions: {},
            },
            {
              id: '01978f4a-32bf-7c27-a131-fd73a9e701b2',
              effect: 'allow',
              priority: 1,
              reason_code: 'ALLOW_LOW',
              conditions: {},
            },
          ],
        };
      }
      return { rows: [] };
    });
    const service = new FlowPolicyService({} as never, dbWithQuery(query) as never);

    await expect(service.evaluate({
      scopeId: '01978f4a-32bf-7c27-a131-fd73a9e901a1',
      action: 'approve',
      facts: { score: 1 },
    })).resolves.toEqual(expect.objectContaining({
      allowed: false,
      effect: 'deny',
      reasonCode: 'BLOCKED',
      matchedRuleId: ruleId,
      defaulted: false,
    }));
  });
});
