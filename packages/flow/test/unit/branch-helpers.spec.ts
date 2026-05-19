import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { FlowAdapterRegistry, type FlowDomainAdapter } from '../../src/adapters';
import { FlowAnalyticsService } from '../../src/flow-analytics.service';
import { FlowPolicyService } from '../../src/flow-policy.service';
import { camelizeKey, camelizeRow, pageLimitOffset, requireObject } from '../../src/row-utils';

const SCOPE = '0190abcd-1234-7abc-89ab-000000000001';
const POLICY_SET = '0190abcd-1234-7abc-89ab-000000000002';

function makeAdapter(overrides: Partial<FlowDomainAdapter> = {}): FlowDomainAdapter {
  return {
    key: 'docs',
    buildFacts: vi.fn(async () => ({ approved: true })),
    applyEffect: vi.fn(async () => ({ ok: true, payload: { sent: true } })),
    canView: vi.fn(async () => true),
    canManage: vi.fn(async () => false),
    resolveAgents: vi.fn(async () => [{ type: 'user', id: 'u-1' }]),
    ...overrides,
  };
}

function makeDb(rowsByCall: Array<unknown[]> = []) {
  let call = 0;
  const trx = {
    query: vi.fn(async () => ({ rows: rowsByCall[call++] ?? [] })),
  };
  const db = {
    tx: vi.fn(async (fn: (input: typeof trx) => unknown, _options?: unknown) => fn(trx)),
  };
  return { db, trx };
}

describe('Flow row utilities', () => {
  it('camelizes rows and clamps pagination inputs', () => {
    expect(camelizeKey('created_at')).toBe('createdAt');
    expect(camelizeRow({ created_at: 'now', alreadyCamel: true })).toEqual({
      createdAt: 'now',
      alreadyCamel: true,
    });
    expect(pageLimitOffset({ page: '3', pageSize: '500' })).toEqual({
      page: 3,
      pageSize: 100,
      limit: 100,
      offset: 200,
    });
    expect(pageLimitOffset({ page: '-1', pageSize: 'bad' })).toMatchObject({
      page: 1,
      pageSize: 50,
      offset: 0,
    });
  });

  it('accepts object bodies and rejects null, arrays, and primitives', () => {
    expect(requireObject({ ok: true })).toEqual({ ok: true });
    expect(() => requireObject(null)).toThrow(BadRequestException);
    expect(() => requireObject([])).toThrow(BadRequestException);
    expect(() => requireObject('x')).toThrow(BadRequestException);
  });
});

describe('FlowAdapterRegistry', () => {
  it('returns safe defaults when optional adapters or capabilities are absent', async () => {
    const empty = new FlowAdapterRegistry(undefined);
    await expect(empty.buildFacts({
      tenantId: 't-1',
      adapterKey: 'missing',
      targetType: 'doc',
      targetId: 'd-1',
    })).resolves.toEqual({});
    await expect(empty.canView({
      tenantId: 't-1',
      adapterKey: 'missing',
      targetType: 'doc',
      targetId: 'd-1',
    })).resolves.toBe(true);
    await expect(empty.canManage({
      tenantId: 't-1',
      adapterKey: 'missing',
      targetType: 'doc',
      targetId: 'd-1',
    })).resolves.toBe(true);

    const withoutResolver = new FlowAdapterRegistry([
      makeAdapter({ resolveAgents: undefined }),
    ]);
    await expect(withoutResolver.resolveAgents({
      tenantId: 't-1',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'd-1',
      nodeId: 'n-1',
      ruleId: 'r-1',
      resolverKey: 'owner',
    })).resolves.toEqual([]);
  });

  it('delegates adapter operations and wraps adapter failures', async () => {
    const adapter = makeAdapter({
      canView: vi.fn(async () => { throw new Error('no view'); }),
      canManage: vi.fn(async () => { throw new Error('no manage'); }),
      applyEffect: vi.fn(async () => { throw 'bad effect'; }),
      resolveAgents: vi.fn(async () => { throw new Error('no agents'); }),
    });
    const registry = new FlowAdapterRegistry([adapter]);

    await expect(registry.buildFacts({
      tenantId: 't-1',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'd-1',
    })).resolves.toEqual({ approved: true });
    await expect(registry.canManage({
      tenantId: 't-1',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'd-1',
    })).rejects.toBeInstanceOf(BadGatewayException);
    await expect(registry.canView({
      tenantId: 't-1',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'd-1',
    })).rejects.toBeInstanceOf(BadGatewayException);
    await expect(registry.applyEffect({
      tenantId: 't-1',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'd-1',
      effectKey: 'email',
    })).rejects.toBeInstanceOf(BadGatewayException);
    await expect(registry.resolveAgents({
      tenantId: 't-1',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'd-1',
      nodeId: 'n-1',
      ruleId: 'r-1',
      resolverKey: 'owner',
    })).rejects.toBeInstanceOf(BadGatewayException);
    await expect(registry.applyEffect({
      tenantId: 't-1',
      adapterKey: 'missing',
      targetType: 'doc',
      targetId: 'd-1',
      effectKey: 'email',
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FLOW_ADAPTER_NOT_FOUND' }),
    });
  });
});

describe('FlowAnalyticsService', () => {
  it('assembles open task filters and maps snake_case rows', async () => {
    const { db, trx } = makeDb([
      [{ id: 'task-1', target_type: 'document', node_code: 'review' }],
      [{ total: '7' }],
    ]);
    const result = await new FlowAnalyticsService(db as never).openTasks({
      scopeId: SCOPE,
      scopeCode: '',
      targetType: 'document',
      assigneeUserId: '0190abcd-1234-7abc-89ab-000000000003',
      page: 2,
      pageSize: 2,
      ignored: 123,
    });
    expect(result).toEqual({
      data: [{ id: 'task-1', targetType: 'document', nodeCode: 'review' }],
      meta: { page: 2, pageSize: 2, total: 7 },
    });
    const [sql, params] = trx.query.mock.calls[0]!;
    expect(sql).toContain("t.status = 'open'");
    expect(sql).toContain('r.scope_id = $1::uuid');
    expect(sql).toContain('r.target_type = $2');
    expect(sql).toContain('t.assignee_user_id = $3::uuid');
    expect(params).toEqual([SCOPE, 'document', '0190abcd-1234-7abc-89ab-000000000003', 2, 2]);
  });

  it('omits runs summary WHERE when no filters and defaults total to zero', async () => {
    const { db, trx } = makeDb([[{ run_count: 2 }], []]);
    const result = await new FlowAnalyticsService(db as never).runsSummary();
    expect(result).toEqual({
      data: [{ runCount: 2 }],
      meta: { page: 1, pageSize: 50, total: 0 },
    });
    const [sql, params] = trx.query.mock.calls[0]!;
    expect(sql).not.toContain('where');
    expect(params).toEqual([50, 0]);
  });

  it('uses open task default query values when no query is supplied', async () => {
    const { db, trx } = makeDb([[], []]);
    const result = await new FlowAnalyticsService(db as never).openTasks();
    expect(result).toEqual({
      data: [],
      meta: { page: 1, pageSize: 50, total: 0 },
    });
    expect(trx.query.mock.calls[0]?.[1]).toEqual([50, 0]);
  });

  it('adds runs summary filters only for non-empty string values', async () => {
    const { db, trx } = makeDb([[], [{ total: '3' }]]);
    await new FlowAnalyticsService(db as never).runsSummary({
      graphId: SCOPE,
      scopeCode: 'main',
      targetType: '',
      targetId: 42,
      status: 'active',
    });
    const [sql, params] = trx.query.mock.calls[0]!;
    expect(sql).toContain('where r.graph_id = $1::uuid and s.code = $2 and r.status = $3');
    expect(params).toEqual([SCOPE, 'main', 'active', 50, 0]);
  });
});

describe('FlowPolicyService', () => {
  it('delegates policy set and rule CRUD to the design service', async () => {
    const design = {
      listPolicySets: vi.fn(async () => []),
      createPolicySet: vi.fn(async (input) => input),
      getPolicySet: vi.fn(async (id) => ({ id })),
      updatePolicySet: vi.fn(async (id, input) => ({ id, input })),
      deletePolicySet: vi.fn(async (id) => ({ id, deleted: true })),
      listPolicyRules: vi.fn(async () => []),
      createPolicyRule: vi.fn(async (id, input) => ({ id, input })),
      getPolicyRule: vi.fn(async (id) => ({ id })),
      updatePolicyRule: vi.fn(async (id, input) => ({ id, input })),
      deletePolicyRule: vi.fn(async (id) => ({ id, deleted: true })),
    };
    const service = new FlowPolicyService(design as never, makeDb().db as never);

    await service.listPolicySets(SCOPE);
    await service.createPolicySet({ scopeId: SCOPE });
    await service.getPolicySet(POLICY_SET);
    await service.updatePolicySet(POLICY_SET, { name: 'Policy' });
    await service.deletePolicySet(POLICY_SET);
    await service.listPolicyRules(POLICY_SET);
    await service.createPolicyRule(POLICY_SET, { effect: 'allow' });
    await service.getPolicyRule('rule-1');
    await service.updatePolicyRule('rule-1', { effect: 'deny' });
    await service.deletePolicyRule('rule-1');

    expect(design.listPolicySets).toHaveBeenCalledWith(SCOPE);
    expect(design.createPolicyRule).toHaveBeenCalledWith(POLICY_SET, { effect: 'allow' });
  });

  it('defaults allow when no active policy set resolves', async () => {
    const { db, trx } = makeDb([[]]);
    const result = await new FlowPolicyService({} as never, db as never).evaluate({
      scopeId: SCOPE,
      capability: 'view',
    });
    expect(result).toEqual({
      allowed: true,
      effect: 'allow',
      reasonCode: null,
      matchedRuleId: null,
      defaulted: true,
    });
    expect(trx.query).toHaveBeenCalledTimes(1);
  });

  it('returns the first matching rule using empty, jsonpath, and object conditions', async () => {
    const { db } = makeDb([
      [{
        id: 'rule-empty',
        effect: 'deny',
        priority: 10,
        reason_code: null,
        conditions: {},
      }],
    ]);
    await expect(new FlowPolicyService({} as never, db as never).evaluate({
      policySetId: POLICY_SET,
      action: 'approve',
    })).resolves.toMatchObject({
      allowed: false,
      effect: 'deny',
      matchedRuleId: 'rule-empty',
      defaulted: false,
    });

    const jsonpath = makeDb([
      [{
        id: 'rule-jsonpath',
        effect: 'allow',
        priority: 1,
        reason_code: 'OK',
        conditions: { jsonpath: '$.approved == true' },
      }],
      [{ matched: true }],
    ]);
    await expect(new FlowPolicyService({} as never, jsonpath.db as never).evaluate({
      policySetId: POLICY_SET,
      capability: 'view',
      facts: { approved: true },
    })).resolves.toMatchObject({
      allowed: true,
      reasonCode: 'OK',
      matchedRuleId: 'rule-jsonpath',
    });

    const objectConditions = makeDb([
      [{
        id: 'rule-object',
        effect: 'deny',
        priority: 1,
        reason_code: 'MISMATCH',
        conditions: { region: 'south' },
      }],
    ]);
    await expect(new FlowPolicyService({} as never, objectConditions.db as never).evaluate({
      policySetId: POLICY_SET,
      capability: 'view',
      facts: { region: 'north' },
    })).resolves.toMatchObject({ defaulted: true });
  });
});
