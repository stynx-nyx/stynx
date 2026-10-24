import { BadRequestException } from '@nestjs/common';
import { FlowDesignService } from '../../src/flow-design.service.js';
import { FlowDesignTableStore } from '../../src/internal/design/design-table-store.js';
import { FlowGraphPackage } from '../../src/internal/design/graph-package.js';
import type { FlowGraphExportDocument } from '../../src/types.js';

const SCOPE = '0190abcd-1234-7abc-89ab-000000000001';
const GRAPH = '0190abcd-1234-7abc-89ab-000000000002';
const NODE = '0190abcd-1234-7abc-89ab-000000000003';
const FORM = '0190abcd-1234-7abc-89ab-000000000004';
const exported: FlowGraphExportDocument = {
  graph: { id: GRAPH, scopeId: SCOPE, status: 'draft' },
  nodes: [], edges: [], transitionEffects: [], agentRules: [], nodeFormRules: [], policySets: [], policyRules: [],
};

function document() {
  return {
    graph: { scopeId: SCOPE, code: ' graph ' },
    nodes: [{ code: ' start ', kind: 'start' }],
    edges: [{ fromNodeCode: ' start ', toNodeCode: ' start ' }],
    transitionEffects: [{ effectKey: ' notify ' }],
    agentRules: [{ nodeCode: ' start ', ruleType: 'permission' }],
    nodeFormRules: [{ nodeCode: ' start ', formId: FORM }],
  };
}

afterEach(() => vi.restoreAllMocks());

describe('public graph import preserves actual parser ownership and defaults', () => {
  it.each([false, true])('preserves optional own undefined fields (explicit=%s) in every imported entity', async (explicit) => {
    const input = document();
    const opaque = { date: new Date(0), bigint: 1n, absent: undefined };
    Object.assign(input.graph, { meta: { opaque }, discarded: 'unknown-key' });
    if (explicit) {
      Object.assign(input.graph, { name: undefined, version: undefined });
      Object.assign(input.nodes[0], { name: undefined });
      Object.assign(input.edges[0], { action: undefined });
      Object.assign(input.transitionEffects[0], { payload: undefined });
      Object.assign(input.agentRules[0], { params: undefined });
      Object.assign(input.nodeFormRules[0], { gatingMode: undefined });
    }
    const importer = vi.spyOn(FlowGraphPackage.prototype, 'importGraph').mockResolvedValue(exported);
    const service = new FlowDesignService({} as never, {} as never);
    expect(await service.importGraph(input)).toBe(exported);
    expect(importer).toHaveBeenCalledOnce();
    const parsed = importer.mock.calls[0]?.[0];
    expect(parsed).toBeDefined();
    if (!parsed) throw new Error('expected parsed import');
    expect(parsed.graph.code).toBe('graph');
    expect(parsed.graph.version).toBe('v1');
    expect(Object.hasOwn(parsed.graph, 'version')).toBe(true);
    expect(Object.hasOwn(parsed.graph, 'discarded')).toBe(false);
    expect(parsed.graph.meta?.opaque).toBe(opaque);
    expect(parsed.nodes[0]?.code).toBe('start');
    expect(parsed.edges?.[0]?.fromNodeCode).toBe('start');
    expect(parsed.edges?.[0]?.toNodeCode).toBe('start');
    expect(parsed.transitionEffects?.[0]?.effectKey).toBe('notify');
    expect(parsed.agentRules?.[0]?.nodeCode).toBe('start');
    expect(parsed.nodeFormRules?.[0]?.nodeCode).toBe('start');
    const fields = [
      [parsed.graph, 'name'], [parsed.nodes[0], 'name'], [parsed.edges?.[0], 'action'],
      [parsed.transitionEffects?.[0], 'payload'], [parsed.agentRules?.[0], 'params'],
      [parsed.nodeFormRules?.[0], 'gatingMode'],
    ] as const;
    for (const [entity, key] of fields) {
      expect(entity).toBeDefined();
      if (!entity) throw new Error('expected parsed entity');
      expect(Object.hasOwn(entity, key)).toBe(explicit);
      if (Object.hasOwn(entity, key)) expect(Reflect.get(entity, key)).toBeUndefined();
    }
  });

  it('invalid parser input refuses delegation with the existing validation error', () => {
    const importer = vi.spyOn(FlowGraphPackage.prototype, 'importGraph');
    const service = new FlowDesignService({} as never, {} as never);
    try {
      service.importGraph({ graph: { scopeId: 'bad', code: ' ' }, nodes: [] });
      throw new Error('expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      if (!(error instanceof BadRequestException)) throw error;
      expect(error.getResponse()).toMatchObject({ code: 'FLOW_VALIDATION_ERROR' });
    }
    expect(importer).not.toHaveBeenCalled();
  });
});

function executionHarness() {
  const order: string[] = [];
  const runGuarded = vi.fn(async () => []);
  const trx = { runGuarded };
  const tx = vi.fn(async (callback: (transaction: typeof trx) => unknown) => {
    order.push('tx');
    return callback(trx);
  });
  const service = new FlowDesignService({ tx } as never, {} as never);
  const insert = vi.spyOn(FlowDesignTableStore.prototype, 'insertRow').mockImplementation(async (transaction, key) => {
    expect(transaction).toBe(trx);
    order.push(key);
    return { id: key === 'graphs' ? GRAPH : NODE };
  });
  const get = vi.spyOn(FlowDesignTableStore.prototype, 'getRowFromTransaction').mockImplementation(async (transaction, config, id) => {
    expect(transaction).toBe(trx);
    expect(config.sqlName).toBe('flow.graphs');
    expect(id).toBe(GRAPH);
    order.push('export');
    return { id: GRAPH, scopeId: SCOPE };
  });
  return { service, order, tx, trx, insert, get, runGuarded };
}

describe('actual graph import keeps mutation, error and export order', () => {
  it('inserts all six families in order, retains own undefined and resolves parent IDs before export', async () => {
    const h = executionHarness();
    const input = document();
    Object.assign(input.graph, { name: undefined });
    Object.assign(input.nodes[0], { name: undefined });
    Object.assign(input.transitionEffects[0], { payload: undefined });
    Object.assign(input.agentRules[0], { params: undefined });
    Object.assign(input.nodeFormRules[0], { gatingMode: undefined });
    expect(await h.service.importGraph(input)).toEqual(exported);
    expect(h.order).toEqual(['tx', 'graphs', 'nodes', 'edges', 'transitionEffects', 'agentRules', 'nodeFormRules', 'export']);
    expect(h.tx).toHaveBeenCalledOnce();
    expect(h.tx.mock.calls[0]).toHaveLength(1);
    expect(h.insert.mock.calls.map((call) => call[2])).toEqual([
      { scopeId: SCOPE, code: 'graph', version: 'v1', name: undefined },
      { code: 'start', kind: 'start', name: undefined, graphId: GRAPH },
      { graphId: GRAPH, fromNodeId: NODE, toNodeId: NODE, action: undefined, rule: undefined, spawn: undefined, sortOrder: undefined, meta: undefined },
      { effectKey: 'notify', payload: undefined, graphId: GRAPH },
      { nodeCode: 'start', ruleType: 'permission', params: undefined, nodeId: NODE },
      { nodeCode: 'start', formId: FORM, gatingMode: undefined, nodeId: NODE },
    ]);
    for (const [index, key] of [[0, 'name'], [1, 'name'], [2, 'action'], [3, 'payload'], [4, 'params'], [5, 'gatingMode']] as const) {
      const body = h.insert.mock.calls[index]?.[2];
      expect(body).toBeDefined();
      if (!body) throw new Error('missing insertion');
      expect(Object.hasOwn(body, key)).toBe(true);
    }
    expect(h.runGuarded).toHaveBeenCalledTimes(6);
  });

  it('missing rule node codes still reach insertion with own undefined parent IDs', async () => {
    const h = executionHarness();
    const input = document();
    input.agentRules[0]!.nodeCode = 'missing-agent';
    input.nodeFormRules[0]!.nodeCode = 'missing-form';
    await expect(h.service.importGraph(input)).resolves.toEqual(exported);
    for (const key of ['agentRules', 'nodeFormRules']) {
      const body = h.insert.mock.calls.find((call) => call[1] === key)?.[2];
      expect(body).toBeDefined();
      if (!body) throw new Error('missing rule insertion');
      expect(Object.hasOwn(body, 'nodeId')).toBe(true);
      expect(body.nodeId).toBeUndefined();
    }
  });

  it.each([
    { label: 'duplicate node', nodes: [{ code: 'a', kind: 'start' }, { code: 'a', kind: 'end' }], edges: [], message: 'Duplicate node code: a' },
    { label: 'missing start', nodes: [{ code: 'a', kind: 'end' }], edges: [], message: 'Graph import requires at least one start node' },
    { label: 'missing edge target', nodes: [{ code: 'a', kind: 'start' }], edges: [{ fromNodeCode: 'a', toNodeCode: 'missing' }], message: 'Graph import edge references a missing node code' },
    { label: 'duplicate edge', nodes: [{ code: 'a', kind: 'start' }], edges: [{ fromNodeCode: 'a', toNodeCode: 'a' }, { fromNodeCode: 'a', toNodeCode: 'a' }], message: 'Duplicate graph edge: a::a' },
  ])('$label remains a synchronous domain rejection before opening a transaction', ({ nodes, edges, message }) => {
    const h = executionHarness();
    expect(() => h.service.importGraph({ graph: { scopeId: SCOPE, code: 'g' }, nodes, edges }))
      .toThrow(new BadRequestException(message));
    expect(h.tx).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it.each(['graphs', 'nodes', 'edges', 'transitionEffects', 'agentRules', 'nodeFormRules'])('%s insertion rejection preserves identity and stops later work', async (target) => {
    const h = executionHarness();
    const marker = new Error(target);
    h.insert.mockImplementation(async (_transaction, key) => {
      h.order.push(key);
      if (key === target) throw marker;
      return { id: key === 'graphs' ? GRAPH : NODE };
    });
    await expect(h.service.importGraph(document())).rejects.toBe(marker);
    const order = ['tx', 'graphs', 'nodes', 'edges', 'transitionEffects', 'agentRules', 'nodeFormRules'];
    expect(h.order).toEqual(order.slice(0, order.indexOf(target) + 1));
    expect(h.get).not.toHaveBeenCalled();
    expect(h.runGuarded).not.toHaveBeenCalled();
  });

  it.each([
    { target: 'graphs', message: 'graph.id is required' },
    { target: 'nodes', message: 'node start is required' },
  ])('$target malformed returned id keeps domain error and stops export', async ({ target, message }) => {
    const h = executionHarness();
    h.insert.mockImplementation(async (_transaction, key) => ({ id: key === target ? undefined : GRAPH }));
    await expect(h.service.importGraph(document())).rejects.toThrow(new BadRequestException(message));
    expect(h.insert).toHaveBeenCalledTimes(target === 'graphs' ? 1 : 2);
    expect(h.get).not.toHaveBeenCalled();
  });

  it('transaction rejection preserves identity before any table mutation', async () => {
    const h = executionHarness();
    const marker = new Error('transaction failed');
    h.tx.mockRejectedValueOnce(marker);
    await expect(h.service.importGraph(document())).rejects.toBe(marker);
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.get).not.toHaveBeenCalled();
  });
});
