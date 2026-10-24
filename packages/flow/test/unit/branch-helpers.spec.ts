import { executeGuardedQueryRows, executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { analyticsTaskRow, analyticsTaskView } from '../fixtures/analytics-rows.js';
import { BadRequestException } from '@nestjs/common';
import { FlowAdapterRegistry, type FlowDomainAdapter } from '../../src/adapters.js';
import { FlowAnalyticsService } from '../../src/flow-analytics.service.js';
import { FlowPolicyService } from '../../src/flow-policy.service.js';
import { evaluatePolicyConditionQuery } from '../../src/policy-queries.repository.js';
import { camelizeKey, camelizeRow, pageLimitOffset, requireObject } from '../../src/row-utils.js';
import {
  addTextFilter,
  addUuidFilter,
  asJsonObject,
  optionalString,
} from '../../src/internal/runtime/runtime-filters.js';

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
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: rowsByCall[call++] ?? [] }));
  const run: Transaction['run'] = (statement, params) => executeTypedQuery({ query }, statement, params);
  const runGuarded: Transaction['runGuarded'] = (statement, params, guard) => executeGuardedQueryRows({ query }, statement, params, guard);
  const trx = { query, run, runGuarded };
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
    expect(pageLimitOffset({ page: 'bad' })).toMatchObject({
      page: 1,
      pageSize: 50,
      offset: 0,
    });
    expect(pageLimitOffset({})).toEqual({
      page: 1,
      pageSize: 50,
      limit: 50,
      offset: 0,
    });
  });

  it('accepts object bodies and rejects null, arrays, and primitives', () => {
    expect(requireObject({ ok: true })).toEqual({ ok: true });
    expect(() => requireObject(null)).toThrow(BadRequestException);
    expect(() => requireObject([])).toThrow(BadRequestException);
    expect(() => requireObject('x')).toThrow(BadRequestException);
  });

  it('normalizes runtime filters and JSON objects exactly', () => {
    expect(optionalString('value')).toBe('value');
    for (const invalid of ['', null, undefined, 1, []]) {
      expect(optionalString(invalid)).toBe(undefined);
    }

    const object = { exact: true };
    expect(asJsonObject(object)).toBe(object);
    for (const invalid of [null, undefined, 'value', 1, true, []]) {
      expect(asJsonObject(invalid)).toEqual({});
    }

    const where: string[] = [];
    const values: unknown[] = [];
    addUuidFilter(where, values, 'run_id', 'run-1');
    addTextFilter(where, values, 'status', 'open');
    addUuidFilter(where, values, 'ignored_uuid', '');
    addTextFilter(where, values, 'ignored_text', null);
    expect(where).toEqual(['run_id = $1::uuid', 'status = $2']);
    expect(values).toEqual(['run-1', 'open']);
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
    })).rejects.toMatchObject({
      response: {
        code: 'FLOW_ADAPTER_ERROR',
        adapterKey: 'docs',
        operation: 'canManage',
        message: 'no manage',
      },
    });
    await expect(registry.canView({
      tenantId: 't-1',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'd-1',
    })).rejects.toMatchObject({
      response: {
        code: 'FLOW_ADAPTER_ERROR',
        adapterKey: 'docs',
        operation: 'canView',
        message: 'no view',
      },
    });
    await expect(registry.applyEffect({
      tenantId: 't-1',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'd-1',
      effectKey: 'email',
    })).rejects.toMatchObject({
      response: {
        code: 'FLOW_ADAPTER_ERROR',
        adapterKey: 'docs',
        operation: 'applyEffect',
        message: 'bad effect',
      },
    });
    await expect(registry.resolveAgents({
      tenantId: 't-1',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'd-1',
      nodeId: 'n-1',
      ruleId: 'r-1',
      resolverKey: 'owner',
    })).rejects.toMatchObject({
      response: {
        code: 'FLOW_ADAPTER_ERROR',
        adapterKey: 'docs',
        operation: 'resolveAgents',
        message: 'no agents',
      },
    });
    await expect(registry.applyEffect({
      tenantId: 't-1',
      adapterKey: 'missing',
      targetType: 'doc',
      targetId: 'd-1',
      effectKey: 'email',
    })).rejects.toMatchObject({
      response: {
        code: 'FLOW_ADAPTER_NOT_FOUND',
        adapterKey: 'missing',
        operation: 'applyEffect',
      },
    });
  });

  it('wraps buildFacts failures with the exact adapter diagnostic', async () => {
    const registry = new FlowAdapterRegistry([
      makeAdapter({ buildFacts: vi.fn(async () => { throw new Error('facts failed'); }) }),
    ]);
    await expect(registry.buildFacts({
      tenantId: 't-1',
      adapterKey: 'docs',
      targetType: 'doc',
      targetId: 'd-1',
    })).rejects.toMatchObject({
      response: {
        code: 'FLOW_ADAPTER_ERROR',
        adapterKey: 'docs',
        operation: 'buildFacts',
        message: 'facts failed',
      },
    });
  });
});

describe('FlowAnalyticsService', () => {
  it('assembles open task filters and maps snake_case rows', async () => {
    const { db, trx } = makeDb([
      [analyticsTaskRow],
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
      data: [analyticsTaskView],
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
    const { db, trx } = makeDb([[{ scope_id: SCOPE, graph_id: SCOPE, status: 'active', run_count: 2, first_created_at: '2026-10-24', last_updated_at: '2026-10-25' }], []]);
    const result = await new FlowAnalyticsService(db as never).runsSummary();
    expect(result).toEqual({
      data: [{ scopeId: SCOPE, graphId: SCOPE, status: 'active', runCount: 2, firstCreatedAt: '2026-10-24', lastUpdatedAt: '2026-10-25' }],
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

  it('assembles filtered dashboard aggregates and completion ratios', async () => {
    const { db, trx } = makeDb([
      [{ total: '5' }],
      [{ p50_seconds: '10.4', p95_seconds: '42.6' }],
      [
        { window: 'last7Days', completed: '3', total: '4' },
        { window: 'last30Days', completed: '0', total: '0' },
      ],
      [{ total: '2' }],
    ]);

    await expect(new FlowAnalyticsService(db as never).dashboard({ scopeId: SCOPE, scopeCode: 'main' }))
      .resolves.toEqual({
        openTasks: 5,
        cycleTime: { p50Seconds: 10, p95Seconds: 43 },
        completionRate: { last7Days: 0.75, last30Days: 0 },
        slaBreaches: 2,
      });
    expect(trx.query.mock.calls.every(([, values]) => values[0] === SCOPE && values[1] === 'main')).toBe(true);
    expect(trx.query.mock.calls[0]?.[0]).toContain("and t.status = 'open'");
  });

  it('defaults absent dashboard rows and unfiltered windows to zero', async () => {
    const { db, trx } = makeDb([[], [], [], []]);

    await expect(new FlowAnalyticsService(db as never).dashboard()).resolves.toEqual({
      openTasks: 0,
      cycleTime: { p50Seconds: 0, p95Seconds: 0 },
      completionRate: { last7Days: 0, last30Days: 0 },
      slaBreaches: 0,
    });
    expect(trx.query.mock.calls[0]?.[0]).toContain("where t.status = 'open'");
    expect(trx.query.mock.calls.every(([, values]) => Array.isArray(values) && values.length === 0)).toBe(true);
  });
});

describe('FlowPolicyService', () => {
  it.each(['action', 'capability'])('keeps exact %s policy SQL, parser trimming, binds and direct-ID precedence', async (targetColumn) => {
    const { db, trx } = makeDb([[]]);
    await expect(new FlowPolicyService({} as never, db as never).evaluate({
      policySetId: POLICY_SET, scopeId: SCOPE, scopeCode: 'other',
      [targetColumn]: '  chosen  ', nodeCode: ' node ', statusCode: ' status ',
    })).resolves.toEqual({ allowed: true, effect: 'allow', reasonCode: null, matchedRuleId: null, defaulted: true });
    expect(trx.query).toHaveBeenCalledExactlyOnceWith(`
          select id, effect, priority, reason_code, conditions
          from flow.policy_rules
          where policy_set_id = $1::uuid
            and ${targetColumn} = $2
            and (node_code is null or node_code = $3)
            and (status_code is null or status_code = $4)
          order by priority desc, case effect when 'deny' then 0 else 1 end, id
        `, [POLICY_SET, 'chosen', 'node', 'status']);
    expect(db.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { role: 'reader', readonly: true });
  });

  it.each([
    {}, { action: 'approve', capability: 'read' }, { action: ' ' }, { capability: ' ' },
    { action: 17 }, { capability: false },
  ])('rejects invalid target selector %j before any transaction', async (target) => {
    const { db, trx } = makeDb();
    await expect(new FlowPolicyService({} as never, db as never).evaluate({ policySetId: POLICY_SET, ...target }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.tx).not.toHaveBeenCalled(); expect(trx.query).not.toHaveBeenCalled();
  });

  it('rejects missing policy scope before any transaction', async () => {
    const { db, trx } = makeDb();
    await expect(new FlowPolicyService({} as never, db as never).evaluate({ action: 'approve' })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.tx).not.toHaveBeenCalled(); expect(trx.query).not.toHaveBeenCalled();
  });

  it('resolves the policy set first and preserves null optional bindings', async () => {
    const { db, trx } = makeDb([[{ id: POLICY_SET }], []]);
    await new FlowPolicyService({} as never, db as never).evaluate({ scopeId: SCOPE, scopeCode: 'scope', action: 'approve' });
    expect(trx.query).toHaveBeenCalledTimes(2);
    expect(trx.query.mock.calls[0]?.[1]).toEqual([SCOPE, 'scope']);
    expect(trx.query.mock.calls[1]?.[1]).toEqual([POLICY_SET, 'approve', null, null]);
  });

  it('uses returned priority order and the first matching opaque condition without reordering', async () => {
    const nested = { date: new Date(NaN), absent: undefined };
    const ruleId = 'opaque-rule';
    const rows = [
      { id: 'not-matching', effect: 'deny', priority: 99, conditions: { key: 'other' } },
      { id: ruleId, effect: 'allow', priority: 10, conditions: { nested } },
      { id: 'later-deny', effect: 'deny', priority: 100, conditions: { jsonpath: '$.mustNotRun' } },
    ];
    const { db, trx } = makeDb([rows]);
    await expect(new FlowPolicyService({} as never, db as never).evaluate({ policySetId: POLICY_SET, action: 'approve', facts: { nested } }))
      .resolves.toEqual({ allowed: true, effect: 'allow', reasonCode: null, matchedRuleId: ruleId, defaulted: false });
    expect(trx.query).toHaveBeenCalledTimes(1);
    expect(rows[1]?.conditions.nested).toBe(nested);
  });

  it('propagates the exact selection query error without further calls', async () => {
    const { db, trx } = makeDb(); const error = new Error('policy database failure');
    trx.query.mockRejectedValueOnce(error);
    await expect(new FlowPolicyService({} as never, db as never).evaluate({ policySetId: POLICY_SET, capability: 'read' })).rejects.toBe(error);
    expect(trx.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: 'no row', rows: [] },
    { label: 'absent field', rows: [{}] },
    { label: 'null', rows: [{ matched: null }] },
    { label: 'false', rows: [{ matched: false }] },
  ])('keeps $label JSON-path results unmatched and facts opaque', async ({ rows }) => {
    const nested = { date: new Date(NaN), absent: undefined };
    const facts = { nested };
    const { db, trx } = makeDb([
      [{ id: 'opaque-rule', effect: 'deny', priority: 1, conditions: { jsonpath: '$.nested' } }], rows,
    ]);
    await expect(new FlowPolicyService({} as never, db as never).evaluate({
      policySetId: POLICY_SET, capability: 'view', facts,
    })).resolves.toMatchObject({ defaulted: true, matchedRuleId: null });
    expect(trx.query).toHaveBeenCalledTimes(2);
    expect(trx.query.mock.calls[1]?.[0]).toBe('select flow.eval_rule($1::text, $2::jsonb) as matched');
    const boundFacts = trx.query.mock.calls[1]?.[1]?.[1];
    // Existing DTO parsing copies the outer record before checked execution.
    expect(boundFacts).not.toBe(facts);
    expect(boundFacts).toEqual(facts);
    if (typeof boundFacts !== 'object' || boundFacts === null || !('nested' in boundFacts))
      throw new Error('bound facts record is missing');
    expect(boundFacts.nested).toBe(nested);
    expect(facts.nested).toBe(nested);
    expect(db.tx.mock.calls[0]?.[1]).toEqual({ role: 'reader', readonly: true });
  });

  it('retains the actual post-DTO facts object at the checked query boundary', async () => {
    const nested = { date: new Date(NaN), missing: undefined };
    const facts = { nested };
    const query = vi.fn(async () => ({ rows: [{ matched: true }] }));
    await expect(executeTypedQuery({ query }, evaluatePolicyConditionQuery, ['$.nested', facts]))
      .resolves.toEqual([{ matched: true }]);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      'select flow.eval_rule($1::text, $2::jsonb) as matched', ['$.nested', facts],
    );
    expect(query.mock.calls[0]?.[1]?.[1]).toBe(facts);
    expect(facts.nested).toBe(nested);
  });

  it.each([1, 'true', {}])('rejects malformed declared matched output %j', async (matched) => {
    const { db, trx } = makeDb([
      [{ id: 'opaque-rule', effect: 'deny', priority: 1, conditions: { jsonpath: '$.approved' } }], [{ matched }],
    ]);
    await expect(new FlowPolicyService({} as never, db as never).evaluate({
      policySetId: POLICY_SET, capability: 'view', facts: {},
    })).rejects.toMatchObject({ code: 'QUERY_ROW_INVALID', query: 'flow.policy.evaluate-condition', rowIndex: 0 });
    expect(trx.query).toHaveBeenCalledTimes(2);
  });

  it('keeps a missing policy-set id as absence and rejects malformed present ids', async () => {
    const absent = makeDb([[{}]]);
    await expect(new FlowPolicyService({} as never, absent.db as never).evaluate({
      scopeCode: 'custom text', capability: 'view',
    })).resolves.toMatchObject({ defaulted: true });
    expect(absent.trx.query.mock.calls[0]?.[1]).toEqual([null, 'custom text']);
    const malformed = makeDb([[{ id: 7 }]]);
    await expect(new FlowPolicyService({} as never, malformed.db as never).evaluate({
      scopeCode: 'custom text', capability: 'view',
    })).rejects.toMatchObject({ code: 'QUERY_ROW_INVALID', query: 'flow.policy.resolve-policy-set-id' });
    expect(malformed.trx.query).toHaveBeenCalledTimes(1);
  });

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

  it('resolves policy sets by scopeCode when scopeId is omitted', async () => {
    const { db, trx } = makeDb([[]]);
    await new FlowPolicyService({} as never, db as never).evaluate({
      scopeCode: 'main',
      capability: 'view',
    });
    expect(trx.query.mock.calls[0]?.[1]).toEqual([null, 'main']);
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

  it('treats null rule conditions as an unconditional match', async () => {
    const { db } = makeDb([
      [{
        id: 'rule-null',
        effect: 'allow',
        priority: 1,
        reason_code: null,
        conditions: null,
      }],
    ]);
    await expect(new FlowPolicyService({} as never, db as never).evaluate({
      policySetId: POLICY_SET,
      action: 'approve',
    })).resolves.toMatchObject({ allowed: true, matchedRuleId: 'rule-null' });
  });
});


describe('FlowPolicyService checked selected rule fields', () => {
  it.each([
    { label: 'missing id', patch: { id: undefined } },
    { label: 'number id', patch: { id: 17 } },
    { label: 'missing effect', patch: { effect: undefined } },
    { label: 'unknown effect', patch: { effect: 'secret-effect' } },
    { label: 'missing priority', patch: { priority: undefined } },
    { label: 'fractional priority', patch: { priority: 1.5 } },
    { label: 'text priority', patch: { priority: '1' } },
    { label: 'malformed reason', patch: { reason_code: { secret: 'must-not-leak' } } },
  ])('refuses $label in a later row before exposing the first match', async ({ patch }) => {
    const first = { id: 'opaque-first', effect: 'allow', priority: 1, conditions: {} };
    const { db, trx } = makeDb([[first, { ...first, ...patch }]]);
    const result = new FlowPolicyService({} as never, db as never).evaluate({ policySetId: POLICY_SET, action: 'read' });
    await expect(result).rejects.toMatchObject({ code: 'QUERY_ROW_INVALID', query: 'flow.policy.select-action-rules', rowIndex: 1 });
    await expect(result).rejects.not.toThrow('must-not-leak');
    expect(trx.query).toHaveBeenCalledTimes(1);
  });

  it.each([null, false, [], 'secret-row'])('refuses a malformed selected row envelope %j', async (row) => {
    const { db, trx } = makeDb([[row]]);
    await expect(new FlowPolicyService({} as never, db as never).evaluate({ policySetId: POLICY_SET, capability: 'read' })).rejects.toMatchObject({ code: 'QUERY_ROW_INVALID', query: 'flow.policy.select-capability-rules', rowIndex: 0 });
    expect(trx.query).toHaveBeenCalledTimes(1);
  });

  it('preserves empty reason and opaque own keys with original rule identity', async () => {
    const nested = { value: new Date(NaN) };
    const row = { id: 'opaque', effect: 'allow', priority: 1, reason_code: '', conditions: {} };
    Object.defineProperty(row, '__proto__', { value: nested, enumerable: true });
    const { db, trx } = makeDb([[row]]); const run = vi.spyOn(trx, 'runGuarded');
    await expect(new FlowPolicyService({} as never, db as never).evaluate({ policySetId: POLICY_SET, action: 'read' })).resolves.toMatchObject({ reasonCode: '', matchedRuleId: 'opaque' });
    const returned = await run.mock.results[0]?.value;
    expect(returned?.[0]).toBe(row); expect(Reflect.get(row, '__proto__')).toBe(nested);
  });
});

describe('FlowPolicyService opaque read-condition preservation', () => {
  const cases: Array<{ label: string; conditions: unknown; facts?: Record<string, unknown>; matches: boolean }> = [
    { label: 'omitted', conditions: undefined, matches: true },
    { label: 'null', conditions: null, matches: true },
    { label: 'empty object', conditions: {}, matches: true },
    { label: 'empty array', conditions: [], matches: true },
    { label: 'false', conditions: false, matches: true },
    { label: 'true', conditions: true, matches: true },
    { label: 'zero', conditions: 0, matches: true },
    { label: 'number', conditions: 17, matches: true },
    { label: 'empty string', conditions: '', matches: true },
    { label: 'matching string', conditions: 'ab', facts: { 0: 'a', 1: 'b' }, matches: true },
    { label: 'nonmatching string', conditions: 'ab', facts: { 0: 'a', 1: 'c' }, matches: false },
    { label: 'matching array', conditions: [17, false], facts: { 0: 17, 1: false }, matches: true },
    { label: 'nonmatching array', conditions: [17], facts: { 0: '17' }, matches: false },
  ];
  for (const target of ['action', 'capability']) {
    it.each(cases)(`preserves ${target} $label condition semantics without JSONPath execution`, async ({ conditions, facts, matches }) => {
      const rule = { id: 'opaque-rule', effect: 'deny', priority: 1, conditions };
      const { db, trx } = makeDb([[rule]]);
      await expect(new FlowPolicyService({} as never, db as never).evaluate({
        policySetId: POLICY_SET, [target]: 'read', facts: facts ?? {},
      })).resolves.toMatchObject({ allowed: !matches, matchedRuleId: matches ? rule.id : null, defaulted: !matches });
      expect(trx.query).toHaveBeenCalledTimes(1);
      expect(trx.query.mock.calls[0]?.[1]).toEqual([POLICY_SET, 'read', null, null]);
      expect(db.tx.mock.calls[0]?.[1]).toEqual({ role: 'reader', readonly: true });
    });
  }

  it.each([true, false])('compares nested array elements by original identity: %s', async (same) => {
    const nested = { opaque: new Date(NaN) };
    const { db, trx } = makeDb([[{ id: 'nested', effect: 'deny', priority: 1, conditions: [nested] }]]);
    await expect(new FlowPolicyService({} as never, db as never).evaluate({
      policySetId: POLICY_SET, action: 'read', facts: { 0: same ? nested : { ...nested } },
    })).resolves.toMatchObject({ defaulted: !same, allowed: !same });
    expect(trx.query).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('enumerates before two original-receiver JSONPath reads; malformed second=%s', async (malformed) => {
    const events: string[] = [];
    const receivers: unknown[] = [];
    let reads = 0;
    const target = { get jsonpath() { receivers.push(this); events.push('get'); return ++reads === 1 ? '$.first' : malformed ? 17 : '$.second'; } };
    const conditions = new Proxy(target, { ownKeys(value) { events.push('keys'); return Reflect.ownKeys(value); } });
    const { db, trx } = makeDb([[{ id: 'getter', effect: 'deny', priority: 1, conditions }], [{ matched: true }]]);
    const run = vi.spyOn(trx, 'run');
    const nested = { opaque: undefined };
    const result = new FlowPolicyService({} as never, db as never).evaluate({ policySetId: POLICY_SET, action: 'read', facts: { nested } });
    if (malformed) {
      await expect(result).rejects.toMatchObject({ code: 'QUERY_ARGUMENT_INVALID', query: 'flow.policy.evaluate-condition' });
      expect(trx.query).toHaveBeenCalledTimes(1);
    } else {
      await expect(result).resolves.toMatchObject({ allowed: false, matchedRuleId: 'getter' });
      expect(trx.query.mock.calls[1]?.[1]?.[0]).toBe('$.second');
      expect(trx.query.mock.calls[1]?.[1]?.[1]).toBe(run.mock.calls[0]?.[1]?.[1]);
    }
    expect(events).toEqual(['keys', 'get', 'get']);
    expect(receivers).toEqual([conditions, conditions]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps empty-key short circuit ahead of a throwing JSONPath getter', async () => {
    const get = vi.fn(() => { throw new Error('must not read'); });
    const conditions = Object.defineProperty({}, 'jsonpath', { get, enumerable: false });
    const { db, trx } = makeDb([[{ id: 'empty', effect: 'deny', priority: 1, conditions }]]);
    await expect(new FlowPolicyService({} as never, db as never).evaluate({ policySetId: POLICY_SET, action: 'read' })).resolves.toMatchObject({ allowed: false });
    expect(get).not.toHaveBeenCalled(); expect(trx.query).toHaveBeenCalledTimes(1);
  });

  it('retains primitive getter receiver and two reads for a nonempty string', async () => {
    const previous = Object.getOwnPropertyDescriptor(String.prototype, 'jsonpath');
    const receivers: unknown[] = [];
    Object.defineProperty(String.prototype, 'jsonpath', { configurable: true, get: function (this: unknown) { receivers.push(this); return '$.primitive'; } });
    try {
      const { db, trx } = makeDb([[{ id: 'primitive', effect: 'deny', priority: 1, conditions: 'x' }], [{ matched: true }]]);
      await expect(new FlowPolicyService({} as never, db as never).evaluate({ policySetId: POLICY_SET, capability: 'read' })).resolves.toMatchObject({ allowed: false });
      expect(receivers).toEqual(['x', 'x']); expect(trx.query).toHaveBeenCalledTimes(2);
    } finally {
      if (previous) Object.defineProperty(String.prototype, 'jsonpath', previous);
      else Reflect.deleteProperty(String.prototype, 'jsonpath');
    }
  });
});
