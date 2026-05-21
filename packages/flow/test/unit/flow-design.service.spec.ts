import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

  it('deleteScope asserts existence then softDeletes (CW-1: bind softDelete args)', async () => {
    const { service, trx } = makeService([[{ id: SCOPE }]]);
    const result = await service.deleteScope(SCOPE);
    // Soft-delete must be invoked with (table reference, scope id). The bare
    // .toHaveBeenCalled() form does not catch mutations on the id literal.
    expect(trx.softDelete).toHaveBeenCalledWith(expect.anything(), SCOPE);
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

  it('listGraphs derives draft and published presentation state from graph metadata', async () => {
    const { service } = makeService([[
      { id: GRAPH, code: 'draft', meta: {} },
      {
        id: '0190abcd-1234-7abc-89ab-000000000009',
        code: 'published',
        meta: {
          publish: {
            publishedVersion: 3,
            publishedAt: '2026-05-19T00:00:00.000Z',
            publishedBy: '0190abcd-1234-7abc-89ab-000000000010',
          },
        },
      },
    ]]);

    await expect(service.listGraphs()).resolves.toEqual([
      expect.objectContaining({ id: GRAPH, status: 'draft' }),
      expect.objectContaining({
        code: 'published',
        status: 'published',
        publishedVersion: 3,
        publishedAt: '2026-05-19T00:00:00.000Z',
        publishedBy: '0190abcd-1234-7abc-89ab-000000000010',
      }),
    ]);
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
    // CW-1: bind softDelete args (table ref + graph id).
    expect(del.trx.softDelete).toHaveBeenCalledWith(expect.anything(), GRAPH);
  });

  it('createGraph INSERTs into flow.graphs', async () => {
    const { service, trx } = makeService([[{ id: GRAPH }]]);
    await service.createGraph({ scopeId: SCOPE, code: 'g' });
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('insert into flow.graphs');
  });

  it('publishGraph validates and records package-owned publish metadata', async () => {
    const { service, trx } = makeService([
      [{ id: GRAPH, version: 'v2', meta: {} }],
      [
        { id: NODE, code: 'start', kind: 'start' },
        { id: '0190abcd-1234-7abc-89ab-000000000009', code: 'end', kind: 'end' },
      ],
      [{ id: EDGE, from_node_id: NODE, to_node_id: '0190abcd-1234-7abc-89ab-000000000009' }],
      [{ id: GRAPH }],
    ]);

    const result = await service.publishGraph(GRAPH, {
      expectedDraftVersion: 'v2',
      notes: 'Ship',
    });

    expect(result).toMatchObject({
      graphId: GRAPH,
      status: 'published',
      draftVersion: 'v2',
      publishedVersion: 1,
      publishedBy: 'u-1',
      runtimeGraphRef: { graphId: GRAPH, version: 1 },
    });
    expect(trx.query.mock.calls[0]).toEqual([
      'select * from flow.graphs where id = $1::uuid limit 1 for update',
      [GRAPH],
    ]);
    expect(trx.query.mock.calls[1]).toEqual([
      'select id, code, kind from flow.nodes where graph_id = $1::uuid order by sort_order, code',
      [GRAPH],
    ]);
    expect(trx.query.mock.calls[2]).toEqual([
      'select id, from_node_id, to_node_id from flow.edges where graph_id = $1::uuid',
      [GRAPH],
    ]);
    const [sql, params] = trx.query.mock.calls[3]!;
    expect(sql).toContain('update flow.graphs');
    expect(params).toEqual([
      GRAPH,
      expect.objectContaining({
        publish: {
          publishedVersion: 1,
          publishedBy: 'u-1',
          draftVersion: 'v2',
          notes: 'Ship',
          publishedAt: expect.any(String),
        },
      }),
      'u-1',
      expect.any(Date),
    ]);
    expect(params?.[1]).toMatchObject({
      publish: {
        publishedVersion: 1,
        publishedBy: 'u-1',
        draftVersion: 'v2',
        notes: 'Ship',
      },
    });
  });

  it('publishGraph rejects stale draft versions and invalid graph structure', async () => {
    const stale = makeService([[{ id: GRAPH, version: 'v2', meta: {} }]]);
    await expect(stale.service.publishGraph(GRAPH, { expectedDraftVersion: 'v1' })).rejects.toThrow(
      new ConflictException('Draft version does not match the current graph version'),
    );

    const invalid = makeService([
      [{ id: GRAPH, version: 'v2', meta: {} }],
      [{ id: NODE, code: 'start', kind: 'start' }],
      [],
    ]);
    await expect(invalid.service.publishGraph(GRAPH, { expectedDraftVersion: 'v2' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('publishGraph rejects invalid graph structure with exact messages', async () => {
    const noStart = makeService([
      [{ id: GRAPH, version: 'v2', meta: {} }],
      [{ id: NODE, code: 'end', kind: 'end' }],
      [],
    ]);
    await expect(noStart.service.publishGraph(GRAPH)).rejects.toThrow(
      new BadRequestException('Graph publish requires exactly one start node'),
    );

    const noEnd = makeService([
      [{ id: GRAPH, version: 'v2', meta: {} }],
      [{ id: NODE, code: 'start', kind: 'start' }],
      [],
    ]);
    await expect(noEnd.service.publishGraph(GRAPH)).rejects.toThrow(
      new BadRequestException('Graph publish requires at least one terminal node'),
    );

    const nonStringEndpoint = makeService([
      [{ id: GRAPH, version: 'v2', meta: {} }],
      [
        { id: NODE, code: 'start', kind: 'start' },
        { id: '0190abcd-1234-7abc-89ab-000000000009', code: 'end', kind: 'end' },
      ],
      [{ id: EDGE, from_node_id: NODE, to_node_id: null }],
    ]);
    await expect(nonStringEndpoint.service.publishGraph(GRAPH)).rejects.toThrow(
      new BadRequestException('Graph publish edge references a missing node'),
    );

    const missingEndpoint = makeService([
      [{ id: GRAPH, version: 'v2', meta: {} }],
      [
        { id: NODE, code: 'start', kind: 'start' },
        { id: '0190abcd-1234-7abc-89ab-000000000009', code: 'end', kind: 'end' },
      ],
      [{ id: EDGE, from_node_id: NODE, to_node_id: '0190abcd-1234-7abc-89ab-deadbeefdead' }],
    ]);
    await expect(missingEndpoint.service.publishGraph(GRAPH)).rejects.toThrow(
      new BadRequestException('Graph publish edge references a missing node'),
    );
  });

  it('listGraphNodes filters by graph_id', async () => {
    const { service, trx } = makeService([[]]);
    await service.listGraphNodes(GRAPH);
    const [sql, params] = trx.query.mock.calls[0]!;
    expect(sql).toBe('select * from flow.nodes where graph_id = $1::uuid order by sort_order, code');
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

  it('deleteNode asserts existence then softDeletes (CW-1: bind softDelete args)', async () => {
    const { service, trx } = makeService([[{ id: NODE }]]);
    const result = await service.deleteNode(NODE);
    expect(trx.softDelete).toHaveBeenCalledWith(expect.anything(), NODE);
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

  it('deleteEdge softDeletes after assertion (CW-1)', async () => {
    const { service, trx } = makeService([[{ id: EDGE }]]);
    await service.deleteEdge(EDGE);
    expect(trx.softDelete).toHaveBeenCalledWith(expect.anything(), EDGE);
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
    expect(del.trx.softDelete).toHaveBeenCalledWith(expect.anything(), RULE);
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
    expect(agentRules.trx.query.mock.calls[0]).toEqual([
      'select * from flow.agent_rules where node_id = $1::uuid order by sort_order, id',
      [NODE],
    ]);

    const formRules = makeService([[{ id: 'fr-1' }]]);
    await expect(formRules.service.listNodeFormRules(NODE)).resolves.toHaveLength(1);
    expect(formRules.trx.query.mock.calls[0]).toEqual([
      'select * from flow.node_form_rules where node_id = $1::uuid order by id',
      [NODE],
    ]);

    const normalized = makeService([[{ id: 'fr-2' }]]);
    await normalized.service.createNodeFormRule(NODE, { formId: FORM, gatingMode: 'any_answered' });
    expect(normalized.trx.query.mock.calls[0]?.[1]).toContain('any');
  });

  it('transition effect read, list, update, and delete routes are covered', async () => {
    const list = makeService([[{ id: 'te-1' }]]);
    await expect(list.service.listGraphTransitionEffects(GRAPH)).resolves.toHaveLength(1);
    expect(list.trx.query.mock.calls[0]).toEqual([
      'select * from flow.transition_effects where graph_id = $1::uuid order by sort_order, id',
      [GRAPH],
    ]);

    const update = makeService([[{ id: 'te-1', effect_key: 'email' }]]);
    await expect(update.service.updateTransitionEffect('te-1', { effectKey: 'email' })).resolves.toMatchObject({
      id: 'te-1',
      effectKey: 'email',
    });

    const get = makeService([[{ id: 'te-1' }]]);
    await expect(get.service.getTransitionEffect('te-1')).resolves.toMatchObject({ id: 'te-1' });

    const del = makeService([[{ id: 'te-1' }]]);
    await expect(del.service.deleteTransitionEffect('te-1')).resolves.toEqual({ id: 'te-1', deleted: true });
    expect(del.trx.softDelete).toHaveBeenCalledWith(expect.anything(), 'te-1');
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
    expect(d.trx.softDelete).toHaveBeenCalledWith(expect.anything(), 'fr-1');
  });
});

describe('FlowDesignService — policySets / policyRules', () => {
  it('listPolicySets filters by scope_id when provided', async () => {
    const { service, trx } = makeService([[]]);
    await service.listPolicySets(SCOPE);
    const [sql, params] = trx.query.mock.calls[0]!;
    expect(sql).toBe('select * from flow.policy_sets where scope_id = $1::uuid order by version, id');
    expect(sql).toContain('scope_id = $1::uuid');
    expect(params).toEqual([SCOPE]);
  });

  it('listPolicySets without scopeId omits WHERE', async () => {
    const { service, trx } = makeService([[]]);
    await service.listPolicySets();
    expect(trx.query.mock.calls[0]?.[0]).not.toContain('where');
  });

  it('createPolicySet INSERTs', async () => {
    const { service, trx } = makeService([[{ id: POLICYSET }]]);
    await service.createPolicySet({ scopeId: SCOPE, version: 'v1' });
    const [sql] = trx.query.mock.calls[0]!;
    expect(sql).toContain('insert into flow.policy_sets');
  });

  it('createPolicySet records nullable audit actors when actor context is absent', async () => {
    const { service, trx } = makeService([[{ id: POLICYSET }]], { tenantId: 't-1' });
    await service.createPolicySet({ scopeId: SCOPE, version: 'v1' });
    expect((trx.query.mock.calls[0]?.[1] as unknown[]).slice(-2)).toEqual([null, null]);
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
    expect(del.trx.softDelete).toHaveBeenCalledWith(expect.anything(), POLICYSET);
  });

  it('listPolicyRules filters by policy_set_id', async () => {
    const { service, trx } = makeService([[]]);
    await service.listPolicyRules(POLICYSET);
    const [sql, params] = trx.query.mock.calls[0]!;
    expect(sql).toBe('select * from flow.policy_rules where policy_set_id = $1::uuid order by priority, id');
    expect(sql).toContain('policy_set_id = $1::uuid');
    expect(params).toEqual([POLICYSET]);
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
    expect(d.trx.softDelete).toHaveBeenCalledWith(expect.anything(), POLICYRULE);
  });

  it('updatePolicySet records a nullable audit actor when actor context is absent', async () => {
    const { service, trx } = makeService([[{ id: POLICYSET }]], { tenantId: 't-1' });
    await service.updatePolicySet(POLICYSET, { name: 'Policy' });
    // The audit actor param (slot 2 from the end, before the row id) must be null.
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params[2]).toBe(null);
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
    ).toThrow(new BadRequestException('Graph import requires at least one start node'));
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
    ).toThrow(new BadRequestException('Duplicate node code: a'));
  });

  it('rejects edges referencing missing node codes', () => {
    const { service } = makeService([]);
    expect(() =>
      service.importGraph({
        graph: { scopeId: SCOPE, code: 'g' },
        nodes: [{ code: 'a', kind: 'start' }],
        edges: [{ fromNodeCode: 'a', toNodeCode: 'missing' }],
      }),
    ).toThrow(new BadRequestException('Graph import edge references a missing node code'));
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
    ).toThrow(new BadRequestException('Duplicate graph edge: a:go:b'));
  });

  it('rejects duplicate edge keys when action is omitted', () => {
    const { service } = makeService([]);
    expect(() =>
      service.importGraph({
        graph: { scopeId: SCOPE, code: 'g' },
        nodes: [
          { code: 'a', kind: 'start' },
          { code: 'b', kind: 'end' },
        ],
        edges: [
          { fromNodeCode: 'a', toNodeCode: 'b' },
          { fromNodeCode: 'a', toNodeCode: 'b' },
        ],
      }),
    ).toThrow('Duplicate graph edge: a::b');
  });

  it('inserts graph + nodes + edges and returns an export document', async () => {
    const NODE_A = '0190abcd-1234-7abc-89ab-aaaaaaaaaaaa';
    const NODE_B = '0190abcd-1234-7abc-89ab-bbbbbbbbbbbb';
    const { service, trx } = makeService([
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
    expect(trx.query.mock.calls[0]).toEqual([
      'insert into flow.graphs (tenant_id, scope_id, code, version, created_by, updated_by) values ($1, $2, $3, $4, $5, $6) returning *',
      ['t-1', SCOPE, 'g', 'v1', 'u-1', 'u-1'],
    ]);
    expect(trx.query.mock.calls[1]).toEqual([
      'insert into flow.nodes (tenant_id, graph_id, code, kind, created_by, updated_by) values ($1, $2, $3, $4, $5, $6) returning *',
      ['t-1', GRAPH, 'a', 'start', 'u-1', 'u-1'],
    ]);
    expect(trx.query.mock.calls[2]).toEqual([
      'insert into flow.nodes (tenant_id, graph_id, code, kind, created_by, updated_by) values ($1, $2, $3, $4, $5, $6) returning *',
      ['t-1', GRAPH, 'b', 'end', 'u-1', 'u-1'],
    ]);
    expect(trx.query.mock.calls[3]).toEqual([
      'insert into flow.edges (tenant_id, graph_id, from_node_id, to_node_id, action, created_by, updated_by) values ($1, $2, $3, $4, $5, $6, $7) returning *',
      ['t-1', GRAPH, NODE_A, NODE_B, 'go', 'u-1', 'u-1'],
    ]);
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

    expect(trx.query.mock.calls[3]).toEqual([
      'insert into flow.transition_effects (tenant_id, graph_id, node_code, effect_key, created_by, updated_by) values ($1, $2, $3, $4, $5, $6) returning *',
      ['t-1', GRAPH, 'a', 'notify', 'u-1', 'u-1'],
    ]);
    expect(trx.query.mock.calls[4]).toEqual([
      'insert into flow.agent_rules (tenant_id, node_id, rule_type, permission_key, created_by, updated_by) values ($1, $2, $3, $4, $5, $6) returning *',
      ['t-1', NODE_A, 'permission', 'doc:read', 'u-1', 'u-1'],
    ]);
    expect(trx.query.mock.calls[5]).toEqual([
      'insert into flow.node_form_rules (tenant_id, node_id, form_id, gating_mode, created_by, updated_by) values ($1, $2, $3, $4, $5, $6) returning *',
      ['t-1', NODE_B, FORM, 'any', 'u-1', 'u-1'],
    ]);
  });

  it('throws when an insert returns no row', async () => {
    const { service } = makeService([[]]);
    await expect(service.createScope({ code: 'c', label: 'L', adapterKey: 'foo' }))
      .rejects.toThrow(new BadRequestException('Flow insert did not return a row'));
  });

  it('throws when import graph insertion returns a non-string graph id', async () => {
    const { service } = makeService([[{ id: null }]]);
    await expect(service.importGraph({
      graph: { scopeId: SCOPE, code: 'g' },
      nodes: [{ code: 'a', kind: 'start' }],
    })).rejects.toThrow(new BadRequestException('graph.id is required'));
  });

  it('throws when import node insertion returns a non-string node id', async () => {
    const { service } = makeService([
      [{ id: GRAPH, scope_id: SCOPE }],
      [{ id: null, code: 'a' }],
    ]);
    await expect(service.importGraph({
      graph: { scopeId: SCOPE, code: 'g' },
      nodes: [{ code: 'a', kind: 'start' }],
    })).rejects.toThrow(new BadRequestException('node a is required'));
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
    expect(trx.query.mock.calls[0]).toEqual([
      'select * from flow.graphs where id = $1::uuid limit 1',
      [GRAPH],
    ]);
    expect(trx.query.mock.calls[1]).toEqual([
      'select * from flow.nodes where graph_id = $1::uuid order by sort_order, code',
      [GRAPH],
    ]);
    expect(trx.query.mock.calls[2]?.[0]).toContain('from flow.edges edge');
    expect(trx.query.mock.calls[2]?.[0]).toContain('where edge.graph_id = $1::uuid');
    expect(trx.query.mock.calls[2]?.[0]).toContain('order by edge.sort_order, edge.id');
    expect(trx.query.mock.calls[2]?.[1]).toEqual([GRAPH]);
    expect(trx.query.mock.calls[3]).toEqual([
      'select * from flow.transition_effects where graph_id = $1::uuid order by sort_order, id',
      [GRAPH],
    ]);
    expect(trx.query.mock.calls[4]?.[0]).toContain('from flow.agent_rules rule');
    expect(trx.query.mock.calls[4]?.[0]).toContain('where node.graph_id = $1::uuid');
    expect(trx.query.mock.calls[4]?.[0]).toContain('order by node.sort_order, rule.sort_order, rule.id');
    expect(trx.query.mock.calls[4]?.[1]).toEqual([GRAPH]);
    expect(trx.query.mock.calls[5]?.[0]).toContain('from flow.node_form_rules rule');
    expect(trx.query.mock.calls[5]?.[0]).toContain('where node.graph_id = $1::uuid');
    expect(trx.query.mock.calls[5]?.[0]).toContain('order by node.sort_order, rule.id');
    expect(trx.query.mock.calls[5]?.[1]).toEqual([GRAPH]);
    expect(trx.query.mock.calls[6]).toEqual([
      'select * from flow.policy_sets where scope_id = $1::uuid order by version, id',
      [SCOPE],
    ]);
    expect(trx.query.mock.calls[7]).toEqual([
      'select * from flow.policy_rules where policy_set_id = any($1::uuid[]) order by priority, id',
      [[POLICYSET]],
    ]);
    expect(trx.query.mock.calls.length).toBe(8);
  });

  it('filters policy rule lookup to string policy set ids only', async () => {
    const { service, trx } = makeService([
      [{ id: GRAPH, scope_id: SCOPE }],
      [],
      [],
      [],
      [],
      [],
      [{ id: POLICYSET }, { id: 42 }, { id: null }],
      [{ id: POLICYRULE }],
    ]);
    await service.exportGraph(GRAPH);
    expect(trx.query.mock.calls[7]).toEqual([
      'select * from flow.policy_rules where policy_set_id = any($1::uuid[]) order by priority, id',
      [[POLICYSET]],
    ]);
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
    await expect(service.createScope({ code: 'c', label: 'L', adapterKey: 'foo' })).rejects.toThrow(
      new BadRequestException('Tenant context is required'),
    );
  });

  it('objectInput rejects arrays + null via createNodeAgentRule', () => {
    const { service } = makeService([]);
    expect(() => service.createNodeAgentRule(NODE, [])).toThrow(BadRequestException);
    expect(() => service.createNodeAgentRule(NODE, null)).toThrow(BadRequestException);
  });

  // =========================================================================
  // WAVE-05A Phase 2 — flow-design.service.ts mutation kills.
  // Targets objectInput (L847) + jsonObject (L247) + normalizeNodeFormRule (L269-274).
  // =========================================================================

  it('objectInput rejects string primitive (kills ConditionalExpression at flow-design.service.ts:847)', () => {
    const { service } = makeService([]);
    expect(() => service.createNodeAgentRule(NODE, 'string-input' as never)).toThrow(BadRequestException);
  });

  it('objectInput rejects numeric primitive', () => {
    const { service } = makeService([]);
    expect(() => service.createNodeAgentRule(NODE, 42 as never)).toThrow(BadRequestException);
  });

  it('objectInput rejects boolean primitive', () => {
    const { service } = makeService([]);
    expect(() => service.createNodeAgentRule(NODE, true as never)).toThrow(BadRequestException);
  });

  it('objectInput error message contains the exact "Request body must be an object" string (kills StringLiteral)', () => {
    const { service } = makeService([]);
    expect(() => service.createNodeAgentRule(NODE, [])).toThrow(
      new BadRequestException('Request body must be an object'),
    );
  });
});

// =============================================================================
// WAVE-05A Phase 2 / Turn A.2a — flow-design.service.ts targeted mutation kills.
// Focuses the surviving mutant clusters at L226-L243 (graphPublishMeta),
// L246-L249 (jsonObject), L259-L266 (definedEntries), L269-L276 (normalizeNodeFormRule).
// =============================================================================

describe('FlowDesignService — graphPublishMeta validation (kills survivors at L226-L243)', () => {
  it('rejects non-object meta and falls back to draft status', async () => {
    // meta=null route: graphPublishMeta returns null → status 'draft'.
    const { service } = makeService([[
      { id: GRAPH, code: 'g', meta: null },
    ]]);
    await expect(service.listGraphs()).resolves.toEqual([
      expect.objectContaining({ id: GRAPH, status: 'draft' }),
    ]);
  });

  it('rejects array meta and falls back to draft status (kills Array.isArray ConditionalExpression at L226)', async () => {
    const { service } = makeService([[
      { id: GRAPH, code: 'g', meta: [1, 2] },
    ]]);
    await expect(service.listGraphs()).resolves.toEqual([
      expect.objectContaining({ id: GRAPH, status: 'draft' }),
    ]);
  });

  it('rejects publish entry when array (kills second Array.isArray check at L230)', async () => {
    const { service } = makeService([[
      { id: GRAPH, code: 'g', meta: { publish: ['not-object'] } },
    ]]);
    await expect(service.listGraphs()).resolves.toEqual([
      expect.objectContaining({ id: GRAPH, status: 'draft' }),
    ]);
  });

  it('rejects publishedVersion of wrong type (kills ConditionalExpression at L235)', async () => {
    const { service } = makeService([[
      { id: GRAPH, code: 'g', meta: { publish: { publishedVersion: 'not-a-number', publishedAt: '2026-01-01' } } },
    ]]);
    await expect(service.listGraphs()).resolves.toEqual([
      expect.objectContaining({ id: GRAPH, status: 'draft' }),
    ]);
  });

  it('rejects infinite publishedVersion (kills !Number.isFinite mutation)', async () => {
    const { service } = makeService([[
      { id: GRAPH, code: 'g', meta: { publish: { publishedVersion: Number.POSITIVE_INFINITY, publishedAt: '2026-01-01' } } },
    ]]);
    await expect(service.listGraphs()).resolves.toEqual([
      expect.objectContaining({ id: GRAPH, status: 'draft' }),
    ]);
  });

  it('coalesces non-string publishedBy to null (kills typeof guard at L242)', async () => {
    const { service } = makeService([[
      { id: GRAPH, code: 'g', meta: { publish: { publishedVersion: 1, publishedAt: '2026-01-01', publishedBy: 42 } } },
    ]]);
    const result = await service.listGraphs();
    expect(result[0]).toMatchObject({ status: 'published', publishedBy: null });
  });

  it('preserves string publishedBy verbatim', async () => {
    const { service } = makeService([[
      { id: GRAPH, code: 'g', meta: { publish: { publishedVersion: 1, publishedAt: '2026-01-01', publishedBy: 'actor-1' } } },
    ]]);
    const result = await service.listGraphs();
    expect(result[0]).toMatchObject({ status: 'published', publishedBy: 'actor-1' });
  });
});

describe('FlowDesignService — definedEntries undefined-value omission (kills LogicalOperator at L262)', () => {
  it('throws BadRequestException when patch has only undefined values (kills `&&` → `||`)', async () => {
    // With `&&`: undefined value → skip → entries empty → throws BadRequest.
    // With `||`: hasOwnProperty true → push entry → ensureNonEmptyUpdate passes → SQL writes undefined.
    const { service } = makeService([]);
    await expect(service.updateScope(SCOPE, { label: undefined } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('includes defined values in the UPDATE while skipping undefined ones', async () => {
    const { service, trx } = makeService([[{ id: SCOPE, label: 'New' }]]);
    await service.updateScope(SCOPE, { label: 'New', adapterKey: undefined } as never);
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    // params should NOT contain undefined (definedEntries dropped it).
    expect(params.includes(undefined)).toBe(false);
    expect(params).toContain('New');
  });
});

describe('FlowDesignService — normalizeNodeFormRule gating-mode rewrites (kills L269-276 survivors)', () => {
  it('rewrites gatingMode="any_answered" → "any" in the SQL params', async () => {
    const { service, trx } = makeService([[{ id: 'fr-1' }]]);
    await service.createNodeFormRule(NODE, { formId: FORM, gatingMode: 'any_answered' });
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params).toContain('any');
    expect(params).not.toContain('any_answered');
  });

  it('rewrites gatingMode="score_threshold" → "threshold" in the SQL params (kills EqualityOperator at L273)', async () => {
    const { service, trx } = makeService([[{ id: 'fr-1' }]]);
    await service.createNodeFormRule(NODE, { formId: FORM, gatingMode: 'score_threshold' });
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params).toContain('threshold');
    expect(params).not.toContain('score_threshold');
  });

  it('preserves "threshold" gatingMode verbatim (no double-rewrite)', async () => {
    const { service, trx } = makeService([[{ id: 'fr-1' }]]);
    await service.createNodeFormRule(NODE, { formId: FORM, gatingMode: 'threshold' });
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params).toContain('threshold');
  });

  it('preserves "any" gatingMode verbatim', async () => {
    const { service, trx } = makeService([[{ id: 'fr-1' }]]);
    await service.createNodeFormRule(NODE, { formId: FORM, gatingMode: 'any' });
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params).toContain('any');
  });
});

describe('FlowDesignService — requireString validation (kills survivors at L252-256)', () => {
  it('publishGraph throws BadRequest when graph.version is empty string (kills EqualityOperator on length > 0)', async () => {
    const { service } = makeService([
      [{ id: GRAPH, version: '', meta: {} }],  // empty-string version
    ]);
    await expect(service.publishGraph(GRAPH)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('publishGraph throws BadRequest with "graph.version is required" message', async () => {
    const { service } = makeService([
      [{ id: GRAPH, version: '', meta: {} }],
    ]);
    await expect(service.publishGraph(GRAPH)).rejects.toThrow(/graph\.version is required/);
  });

  it('publishGraph throws BadRequest when graph.version is non-string', async () => {
    const { service } = makeService([
      [{ id: GRAPH, version: 42, meta: {} }],
    ]);
    await expect(service.publishGraph(GRAPH)).rejects.toBeInstanceOf(BadRequestException);
  });
});
