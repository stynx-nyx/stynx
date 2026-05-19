import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FlowDesignService } from '../../src/flow-design.service';
import type { Mock } from 'vitest';

const SCOPE = '0190abcd-1234-7abc-89ab-000000000001';
const GRAPH = '0190abcd-1234-7abc-89ab-000000000002';
const NODE = '0190abcd-1234-7abc-89ab-000000000003';
const EDGE = '0190abcd-1234-7abc-89ab-000000000004';
const RULE = '0190abcd-1234-7abc-89ab-000000000005';
const FORM = '0190abcd-1234-7abc-89ab-000000000006';
const POLICYSET = '0190abcd-1234-7abc-89ab-000000000007';
const POLICYRULE = '0190abcd-1234-7abc-89ab-000000000008';

interface FakeTrx {
  query: Mock<Promise<{ rows: unknown[] }>, [string, unknown[]?]>;
  softDelete: Mock<Promise<void>, [unknown, string]>;
}

function makeTrx(rowsByCall: Array<unknown[]> = []) {
  let i = 0;
  return {
    query: vi.fn(async () => ({ rows: rowsByCall[i++] ?? [] })),
    softDelete: vi.fn(async () => undefined),
  } as FakeTrx;
}

function makeDb(rowsByCall: Array<unknown[]> = []) {
  const trx = makeTrx(rowsByCall);
  return {
    db: { tx: vi.fn(async (fn: (t: FakeTrx) => unknown) => fn(trx)) } as never,
    trx,
  };
}

function makeService(
  rowsByCall: Array<unknown[]> = [],
  ctx: { tenantId?: string; actorId?: string } = { tenantId: 't-1', actorId: 'u-1' },
) {
  const { db, trx } = makeDb(rowsByCall);
  return { service: new FlowDesignService(db, ctx as never), trx, db };
}

describe('FlowDesignService — scopes', () => {
  it('listScopes returns camelized rows', async () => {
    const { service } = makeService([[{ id: SCOPE, code: 'c', label: 'L' }]]);
    const result = await service.listScopes();
    expect(result[0]).toMatchObject({ id: SCOPE });
  });

  it('getScope returns one or throws NotFound', async () => {
    const found = makeService([[{ id: SCOPE }]]);
    await expect(found.service.getScope(SCOPE)).resolves.toMatchObject({ id: SCOPE });
    const missing = makeService([[]]);
    await expect(missing.service.getScope(SCOPE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createScope INSERTs and returns the new row', async () => {
    const { service, trx } = makeService([[{ id: SCOPE, code: 'c' }]]);
    await service.createScope({ code: 'c', label: 'L', adapterKey: 'foo' });
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('insert into flow.scopes');
  });

  it('updateScope rejects empty patch (no defined entries + no audit columns on scope)', async () => {
    const { service } = makeService([]);
    await expect(service.updateScope(SCOPE, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateScope returns NotFound when row absent', async () => {
    const { service } = makeService([[]]);
    await expect(service.updateScope(SCOPE, { label: 'L2' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updateScope returns the camelized row', async () => {
    const { service } = makeService([[{ id: SCOPE, label: 'L2' }]]);
    const result = await service.updateScope(SCOPE, { label: 'L2' });
    expect(result).toMatchObject({ id: SCOPE, label: 'L2' });
  });

  it('deleteScope asserts existence then softDeletes', async () => {
    const { service, trx } = makeService([[{ id: SCOPE }]]);
    const result = await service.deleteScope(SCOPE);
    expect(trx.softDelete).toHaveBeenCalled();
    expect(result).toEqual({ id: SCOPE, deleted: true });
  });

  it('deleteScope throws NotFound when row absent', async () => {
    const { service } = makeService([[]]);
    await expect(service.deleteScope(SCOPE)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FlowDesignService — graphs / nodes / edges', () => {
  it('listGraphs filters by scope_id when provided', async () => {
    const { service, trx } = makeService([[]]);
    await service.listGraphs(SCOPE);
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('scope_id = $1::uuid');
  });

  it('listGraphs without scopeId omits WHERE', async () => {
    const { service, trx } = makeService([[]]);
    await service.listGraphs();
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).not.toContain('where');
  });

  it('getGraph, updateGraph, and deleteGraph route through shared CRUD helpers', async () => {
    const get = makeService([[{ id: GRAPH }]]);
    await expect(get.service.getGraph(GRAPH)).resolves.toMatchObject({ id: GRAPH });

    const update = makeService([[{ id: GRAPH, name: 'New graph' }]]);
    await expect(update.service.updateGraph(GRAPH, { name: 'New graph' })).resolves.toMatchObject({
      id: GRAPH,
      name: 'New graph',
    });

    const del = makeService([[{ id: GRAPH }]]);
    await expect(del.service.deleteGraph(GRAPH)).resolves.toEqual({ id: GRAPH, deleted: true });
    expect(del.trx.softDelete).toHaveBeenCalled();
  });

  it('createGraph INSERTs into flow.graphs', async () => {
    const { service, trx } = makeService([[{ id: GRAPH }]]);
    await service.createGraph({ scopeId: SCOPE, code: 'g' });
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('insert into flow.graphs');
  });

  it('listGraphNodes filters by graph_id', async () => {
    const { service, trx } = makeService([[]]);
    await service.listGraphNodes(GRAPH);
    const [sql, params] = trx.query.mock.calls[0]!;
    expect(sql).toContain('graph_id = $1::uuid');
    expect(params).toEqual([GRAPH]);
  });

  it('createGraphNode attaches graphId to the input', async () => {
    const { service, trx } = makeService([[{ id: NODE }]]);
    await service.createGraphNode(GRAPH, { code: 'n', kind: 'start' });
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params).toContain(GRAPH);
  });

  it('createGraphNode rejects non-object input', () => {
    const { service } = makeService([]);
    expect(() => service.createGraphNode(GRAPH, null)).toThrow(BadRequestException);
  });

  it('getNode returns one or throws NotFound', async () => {
    const found = makeService([[{ id: NODE }]]);
    await expect(found.service.getNode(NODE)).resolves.toMatchObject({ id: NODE });
    const missing = makeService([[]]);
    await expect(missing.service.getNode(NODE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateNode requires at least one defined field', async () => {
    const { service } = makeService([]);
    await expect(service.updateNode(NODE, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateNode returns NotFound when row absent', async () => {
    const { service } = makeService([[]]);
    await expect(service.updateNode(NODE, { name: 'New' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deleteNode asserts existence then softDeletes', async () => {
    const { service, trx } = makeService([[{ id: NODE }]]);
    const result = await service.deleteNode(NODE);
    expect(trx.softDelete).toHaveBeenCalled();
    expect(result).toEqual({ id: NODE, deleted: true });
  });

  it('listGraphEdges filters by graph_id and orders by sort_order/action', async () => {
    const { service, trx } = makeService([[]]);
    await service.listGraphEdges(GRAPH);
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('graph_id = $1::uuid');
    expect(sql).toContain('order by sort_order, action NULLS FIRST');
  });

  it('createGraphEdge attaches graphId', async () => {
    const { service, trx } = makeService([[{ id: EDGE }]]);
    await service.createGraphEdge(GRAPH, { fromNodeId: NODE, toNodeId: SCOPE });
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params).toContain(GRAPH);
  });

  it('updateEdge returns the camelized row', async () => {
    const { service } = makeService([[{ id: EDGE, action: 'a' }]]);
    const result = await service.updateEdge(EDGE, { action: 'a' });
    expect(result).toMatchObject({ id: EDGE });
  });

  it('getEdge throws NotFound when missing', async () => {
    const { service } = makeService([[]]);
    await expect(service.getEdge(EDGE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deleteEdge softDeletes after assertion', async () => {
    const { service, trx } = makeService([[{ id: EDGE }]]);
    await service.deleteEdge(EDGE);
    expect(trx.softDelete).toHaveBeenCalled();
  });
});

describe('FlowDesignService — agentRules / transitionEffects / nodeFormRules', () => {
  it('createNodeAgentRule attaches nodeId', async () => {
    const { service, trx } = makeService([[{ id: RULE }]]);
    await service.createNodeAgentRule(NODE, { ruleType: 'permission', permissionKey: 'doc:read' });
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params).toContain(NODE);
  });

  it('updateAgentRule + getAgentRule + deleteAgentRule round-trip', async () => {
    const upd = makeService([[{ id: RULE }]]);
    await upd.service.updateAgentRule(RULE, { sortOrder: 10 });
    const get = makeService([[{ id: RULE }]]);
    await expect(get.service.getAgentRule(RULE)).resolves.toMatchObject({ id: RULE });
    const del = makeService([[{ id: RULE }]]);
    await del.service.deleteAgentRule(RULE);
    expect(del.trx.softDelete).toHaveBeenCalled();
  });

  it('createGraphTransitionEffect attaches graphId', async () => {
    const { service, trx } = makeService([[{ id: 'te-1' }]]);
    await service.createGraphTransitionEffect(GRAPH, { effectKey: 'k' });
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params).toContain(GRAPH);
  });

  it('createNodeFormRule normalizes score_threshold → threshold gating mode', async () => {
    const { service, trx } = makeService([[{ id: 'fr-1' }]]);
    await service.createNodeFormRule(NODE, { formId: FORM, gatingMode: 'score_threshold' });
    const columns = (trx.query.mock.calls[0]?.[0] as string).toLowerCase();
    expect(columns).toContain('insert into flow.node_form_rules');
  });

  it('lists node-scoped rules and normalizes any_answered node-form rules', async () => {
    const agentRules = makeService([[{ id: RULE }]]);
    await expect(agentRules.service.listNodeAgentRules(NODE)).resolves.toHaveLength(1);
    expect(agentRules.trx.query.mock.calls[0]?.[0]).toContain('node_id = $1::uuid');

    const formRules = makeService([[{ id: 'fr-1' }]]);
    await expect(formRules.service.listNodeFormRules(NODE)).resolves.toHaveLength(1);
    expect(formRules.trx.query.mock.calls[0]?.[0]).toContain('node_id = $1::uuid');

    const normalized = makeService([[{ id: 'fr-2' }]]);
    await normalized.service.createNodeFormRule(NODE, { formId: FORM, gatingMode: 'any_answered' });
    expect(normalized.trx.query.mock.calls[0]?.[1]).toContain('any');
  });

  it('transition effect read, list, update, and delete routes are covered', async () => {
    const list = makeService([[{ id: 'te-1' }]]);
    await expect(list.service.listGraphTransitionEffects(GRAPH)).resolves.toHaveLength(1);
    expect(list.trx.query.mock.calls[0]?.[0]).toContain('graph_id = $1::uuid');

    const update = makeService([[{ id: 'te-1', effect_key: 'email' }]]);
    await expect(update.service.updateTransitionEffect('te-1', { effectKey: 'email' })).resolves.toMatchObject({
      id: 'te-1',
      effectKey: 'email',
    });

    const get = makeService([[{ id: 'te-1' }]]);
    await expect(get.service.getTransitionEffect('te-1')).resolves.toMatchObject({ id: 'te-1' });

    const del = makeService([[{ id: 'te-1' }]]);
    await expect(del.service.deleteTransitionEffect('te-1')).resolves.toEqual({ id: 'te-1', deleted: true });
    expect(del.trx.softDelete).toHaveBeenCalled();
  });

  it('updateNodeFormRule passes through partial updates', async () => {
    const { service } = makeService([[{ id: 'fr-1' }]]);
    await expect(service.updateNodeFormRule('fr-1', { required: false })).resolves.toMatchObject({
      id: 'fr-1',
    });
  });

  it('getNodeFormRule + deleteNodeFormRule round-trip', async () => {
    const g = makeService([[{ id: 'fr-1' }]]);
    await expect(g.service.getNodeFormRule('fr-1')).resolves.toMatchObject({ id: 'fr-1' });
    const d = makeService([[{ id: 'fr-1' }]]);
    await d.service.deleteNodeFormRule('fr-1');
    expect(d.trx.softDelete).toHaveBeenCalled();
  });
});

describe('FlowDesignService — policySets / policyRules', () => {
  it('listPolicySets filters by scope_id when provided', async () => {
    const { service, trx } = makeService([[]]);
    await service.listPolicySets(SCOPE);
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('scope_id = $1::uuid');
  });

  it('createPolicySet INSERTs', async () => {
    const { service, trx } = makeService([[{ id: POLICYSET }]]);
    await service.createPolicySet({ scopeId: SCOPE, version: 'v1' });
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('insert into flow.policy_sets');
  });

  it('updatePolicySet, getPolicySet, and deletePolicySet route through shared helpers', async () => {
    const update = makeService([[{ id: POLICYSET, name: 'Policy' }]]);
    await expect(update.service.updatePolicySet(POLICYSET, { name: 'Policy' })).resolves.toMatchObject({
      id: POLICYSET,
      name: 'Policy',
    });

    const get = makeService([[{ id: POLICYSET }]]);
    await expect(get.service.getPolicySet(POLICYSET)).resolves.toMatchObject({ id: POLICYSET });

    const del = makeService([[{ id: POLICYSET }]]);
    await expect(del.service.deletePolicySet(POLICYSET)).resolves.toEqual({
      id: POLICYSET,
      deleted: true,
    });
    expect(del.trx.softDelete).toHaveBeenCalled();
  });

  it('listPolicyRules filters by policy_set_id', async () => {
    const { service, trx } = makeService([[]]);
    await service.listPolicyRules(POLICYSET);
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('policy_set_id = $1::uuid');
  });

  it('createPolicyRule attaches policySetId', async () => {
    const { service, trx } = makeService([[{ id: POLICYRULE }]]);
    await service.createPolicyRule(POLICYSET, { effect: 'allow' });
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params).toContain(POLICYSET);
  });

  it('updatePolicyRule / getPolicyRule / deletePolicyRule work', async () => {
    const u = makeService([[{ id: POLICYRULE }]]);
    await expect(u.service.updatePolicyRule(POLICYRULE, { priority: 5 })).resolves.toMatchObject({
      id: POLICYRULE,
    });
    const g = makeService([[{ id: POLICYRULE }]]);
    await expect(g.service.getPolicyRule(POLICYRULE)).resolves.toMatchObject({ id: POLICYRULE });
    const d = makeService([[{ id: POLICYRULE }]]);
    await d.service.deletePolicyRule(POLICYRULE);
    expect(d.trx.softDelete).toHaveBeenCalled();
  });
});

describe('FlowDesignService.importGraph', () => {
  // validateImport throws synchronously before db.tx is awaited, so these are
  // .toThrow checks rather than .rejects.
  it('rejects when no start node is present', () => {
    const { service } = makeService([]);
    expect(() =>
      service.importGraph({
        graph: { scopeId: SCOPE, code: 'g' },
        nodes: [{ code: 'a', kind: 'auto' }],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects duplicate node codes', () => {
    const { service } = makeService([]);
    expect(() =>
      service.importGraph({
        graph: { scopeId: SCOPE, code: 'g' },
        nodes: [
          { code: 'a', kind: 'start' },
          { code: 'a', kind: 'end' },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects edges referencing missing node codes', () => {
    const { service } = makeService([]);
    expect(() =>
      service.importGraph({
        graph: { scopeId: SCOPE, code: 'g' },
        nodes: [{ code: 'a', kind: 'start' }],
        edges: [{ fromNodeCode: 'a', toNodeCode: 'missing' }],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects duplicate edge keys', () => {
    const { service } = makeService([]);
    expect(() =>
      service.importGraph({
        graph: { scopeId: SCOPE, code: 'g' },
        nodes: [
          { code: 'a', kind: 'start' },
          { code: 'b', kind: 'end' },
        ],
        edges: [
          { fromNodeCode: 'a', toNodeCode: 'b', action: 'go' },
          { fromNodeCode: 'a', toNodeCode: 'b', action: 'go' },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('inserts graph + nodes + edges and returns an export document', async () => {
    const NODE_A = '0190abcd-1234-7abc-89ab-aaaaaaaaaaaa';
    const NODE_B = '0190abcd-1234-7abc-89ab-bbbbbbbbbbbb';
    const { service } = makeService([
      [{ id: GRAPH, scope_id: SCOPE }], // insert graph
      [{ id: NODE_A, code: 'a' }], // insert node a
      [{ id: NODE_B, code: 'b' }], // insert node b
      [{ id: EDGE }], // insert edge
      // exportGraphFromTransaction:
      [{ id: GRAPH, scope_id: SCOPE }], // get graph
      [], // nodes
      [], // edges
      [], // transitionEffects
      [], // agentRules
      [], // nodeFormRules
      [], // policySets (empty → skip policy_rules)
    ]);
    const result = await service.importGraph({
      graph: { scopeId: SCOPE, code: 'g' },
      nodes: [
        { code: 'a', kind: 'start' },
        { code: 'b', kind: 'end' },
      ],
      edges: [{ fromNodeCode: 'a', toNodeCode: 'b', action: 'go' }],
    });
    expect(result.graph).toMatchObject({ id: GRAPH });
  });

  it('imports optional transition effects, agent rules, and node form rules', async () => {
    const NODE_A = '0190abcd-1234-7abc-89ab-aaaaaaaaaaaa';
    const NODE_B = '0190abcd-1234-7abc-89ab-bbbbbbbbbbbb';
    const { service, trx } = makeService([
      [{ id: GRAPH, scope_id: SCOPE }],
      [{ id: NODE_A, code: 'a' }],
      [{ id: NODE_B, code: 'b' }],
      [{ id: 'te-1' }],
      [{ id: 'ar-1' }],
      [{ id: 'fr-1' }],
      [{ id: GRAPH, scope_id: SCOPE }],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);

    await service.importGraph({
      graph: { scopeId: SCOPE, code: 'g' },
      nodes: [
        { code: 'a', kind: 'start' },
        { code: 'b', kind: 'end' },
      ],
      transitionEffects: [{ nodeCode: 'a', effectKey: 'notify' }],
      agentRules: [{ nodeCode: 'a', ruleType: 'permission', permissionKey: 'doc:read' }],
      nodeFormRules: [{ nodeCode: 'b', formId: FORM, gatingMode: 'any' }],
    });

    expect(trx.query.mock.calls.map(([sql]) => sql)).toEqual(expect.arrayContaining([
      expect.stringContaining('insert into flow.transition_effects'),
      expect.stringContaining('insert into flow.agent_rules'),
      expect.stringContaining('insert into flow.node_form_rules'),
    ]));
  });

  it('throws when an insert returns no row', async () => {
    const { service } = makeService([[]]);
    await expect(service.createScope({ code: 'c', label: 'L', adapterKey: 'foo' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when import graph insertion returns a non-string graph id', async () => {
    const { service } = makeService([[{ id: null }]]);
    await expect(service.importGraph({
      graph: { scopeId: SCOPE, code: 'g' },
      nodes: [{ code: 'a', kind: 'start' }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('FlowDesignService.exportGraph', () => {
  it('queries graph + nodes + edges + transitionEffects + agentRules + nodeFormRules + policySets', async () => {
    const { service, trx } = makeService([
      [{ id: GRAPH, scope_id: SCOPE }], // getRow
      [{ id: NODE, code: 'a' }], // nodes
      [{ id: EDGE }], // edges
      [], // transitionEffects
      [], // agentRules
      [], // nodeFormRules
      [{ id: POLICYSET }], // policySets
      [{ id: POLICYRULE }], // policyRules (because policySetIds nonempty)
    ]);
    const result = await service.exportGraph(GRAPH);
    expect(result.graph).toMatchObject({ id: GRAPH });
    expect(result.policySets).toHaveLength(1);
    expect(result.policyRules).toHaveLength(1);
    // 8 queries when there are policy sets to follow up.
    expect(trx.query.mock.calls.length).toBe(8);
  });

  it('skips the policyRules query when no policySets matched', async () => {
    const { service, trx } = makeService([
      [{ id: GRAPH, scope_id: SCOPE }],
      [],
      [],
      [],
      [],
      [],
      [], // policySets empty
    ]);
    const result = await service.exportGraph(GRAPH);
    expect(result.policyRules).toEqual([]);
    expect(trx.query.mock.calls.length).toBe(7);
  });
});

describe('FlowDesignService — tenant + input validation', () => {
  it('requireTenantId throws when no tenant in context', async () => {
    const { service } = makeService([], { actorId: 'u-1' });
    await expect(service.createScope({ code: 'c', label: 'L', adapterKey: 'foo' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('objectInput rejects arrays + null via createNodeAgentRule', () => {
    const { service } = makeService([]);
    expect(() => service.createNodeAgentRule(NODE, [])).toThrow(BadRequestException);
    expect(() => service.createNodeAgentRule(NODE, null)).toThrow(BadRequestException);
  });
});
