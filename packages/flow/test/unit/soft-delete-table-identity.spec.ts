import { NotFoundException } from '@nestjs/common';
import {
  agentRules, answers, edges, fills, forms, graphs, nodeFormRules, nodes,
  policyRules, policySets, questions, scopes, scores, transitionEffects, waivers,
} from '@stynx-nyx/data';
import { FlowFormsService } from '../../src/flow-forms.service.js';
import { FlowDesignTableStore } from '../../src/internal/design/design-table-store.js';

const ID = '0190abcd-1234-7abc-89ab-000000000001';
const designCases = [
  { kind: 'design', key: 'scopes', sqlName: 'flow.scopes', table: scopes },
  { kind: 'design', key: 'graphs', sqlName: 'flow.graphs', table: graphs },
  { kind: 'design', key: 'nodes', sqlName: 'flow.nodes', table: nodes },
  { kind: 'design', key: 'edges', sqlName: 'flow.edges', table: edges },
  { kind: 'design', key: 'agentRules', sqlName: 'flow.agent_rules', table: agentRules },
  { kind: 'design', key: 'transitionEffects', sqlName: 'flow.transition_effects', table: transitionEffects },
  { kind: 'design', key: 'nodeFormRules', sqlName: 'flow.node_form_rules', table: nodeFormRules },
  { kind: 'design', key: 'policySets', sqlName: 'flow.policy_sets', table: policySets },
  { kind: 'design', key: 'policyRules', sqlName: 'flow.policy_rules', table: policyRules },
] as const;
const formCases = [
  { kind: 'forms', key: 'forms', sqlName: 'flow.forms', table: forms },
  { kind: 'forms', key: 'questions', sqlName: 'flow.questions', table: questions },
  { kind: 'forms', key: 'scores', sqlName: 'flow.scores', table: scores },
  { kind: 'forms', key: 'fills', sqlName: 'flow.fills', table: fills },
  { kind: 'forms', key: 'answers', sqlName: 'flow.answers', table: answers },
  { kind: 'forms', key: 'waivers', sqlName: 'flow.waivers', table: waivers },
] as const;
const cases = [...designCases, ...formCases];
type Case = typeof cases[number];

function harness(item: Case, outcome: 'found' | 'missing' | 'precheck-error' | 'delete-error') {
  const order: string[] = [];
  const marker = new Error(outcome);
  const query = vi.fn(async (_sql: string, _params: unknown[]) => {
    order.push('precheck');
    await Promise.resolve();
    if (outcome === 'precheck-error') throw marker;
    order.push('precheck-resolved');
    return { rows: outcome === 'missing' ? [] : [{ id: ID, exists: true }], rowCount: 99 };
  });
  const softDelete = vi.fn(async (table: unknown, id: string) => {
    order.push('delete');
    expect(table).toBe(item.table);
    expect(id).toBe(ID);
    if (outcome === 'delete-error') throw marker;
  });
  const trx = { query, softDelete };
  const tx = vi.fn(async (callback: (transaction: typeof trx) => unknown) => {
    order.push('tx');
    return callback(trx);
  });
  const design = new FlowDesignTableStore({ tx } as never, {} as never);
  const service = new FlowFormsService({ tx } as never, {} as never);
  const run = () => item.kind === 'design'
    ? design.softDeleteRow(item.key, ID)
    : service['softDeleteRow'](item.key, ID);
  return { order, marker, query, softDelete, tx, run };
}

describe('all concrete Flow soft-delete tables retain identity and precheck ordering', () => {
  it.each(cases)('$kind/$key passes the original table and id after awaited existence check', async (item) => {
    const h = harness(item, 'found');
    expect(await h.run()).toEqual({ id: ID, deleted: true });
    expect(h.order).toEqual(['tx', 'precheck', 'precheck-resolved', 'delete']);
    expect(h.query).toHaveBeenCalledExactlyOnceWith(
      item.kind === 'design'
        ? `select * from ${item.sqlName} where id = $1::uuid limit 1`
        : `select exists(select 1 from ${item.sqlName} where id = $1::uuid) as exists`,
      [ID],
    );
    expect(h.softDelete).toHaveBeenCalledExactlyOnceWith(item.table, ID);
    expect(h.tx.mock.calls[0]).toHaveLength(1);
  });

  it.each(cases)('$kind/$key missing rows refuse deletion despite nonzero rowCount', async (item) => {
    const h = harness(item, 'missing');
    await expect(h.run()).rejects.toThrow(new NotFoundException('Flow row not found'));
    expect(h.order).toEqual(['tx', 'precheck', 'precheck-resolved']);
    expect(h.softDelete).not.toHaveBeenCalled();
  });

  it.each(cases)('$kind/$key retains precheck error identity and never deletes', async (item) => {
    const h = harness(item, 'precheck-error');
    await expect(h.run()).rejects.toBe(h.marker);
    expect(h.order).toEqual(['tx', 'precheck']);
    expect(h.softDelete).not.toHaveBeenCalled();
  });

  it.each(cases)('$kind/$key retains deletion error identity after its precheck', async (item) => {
    const h = harness(item, 'delete-error');
    await expect(h.run()).rejects.toBe(h.marker);
    expect(h.order).toEqual(['tx', 'precheck', 'precheck-resolved', 'delete']);
    expect(h.softDelete).toHaveBeenCalledOnce();
  });

  it('score deletion looks up question score before String(id), existence and actual scores deletion', async () => {
    const order: string[] = [];
    const scoreId = { toString() { order.push('String(score.id)'); return ID; } };
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      order.push('query');
      if (query.mock.calls.length === 1) {
        expect(sql).toBe('select * from flow.scores where question_id = $1::uuid limit 1');
        expect(params).toEqual(['question-key']);
        return { rows: [{ id: scoreId }] };
      }
      expect(sql).toBe('select exists(select 1 from flow.scores where id = $1::uuid) as exists');
      expect(params).toEqual([ID]);
      return { rows: [{ exists: true }] };
    });
    const softDelete = vi.fn(async (table: unknown, id: string) => {
      order.push('delete');
      expect(table).toBe(scores);
      expect(id).toBe(ID);
    });
    const trx = { query, softDelete };
    const tx = vi.fn(async (callback: (transaction: typeof trx) => unknown) => callback(trx));
    const service = new FlowFormsService({ tx } as never, {} as never);
    await expect(service.deleteQuestionScore('question-key')).resolves.toEqual({ id: ID, deleted: true });
    expect(order).toEqual(['query', 'String(score.id)', 'query', 'delete']);
    expect(tx.mock.calls[0]).toEqual([expect.any(Function), { role: 'reader', readonly: true }]);
    expect(tx.mock.calls[1]).toHaveLength(1);
  });

  it('score lookup failure stops before score precheck and deletion', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const softDelete = vi.fn();
    const trx = { query, softDelete };
    const tx = vi.fn(async (callback: (transaction: typeof trx) => unknown) => callback(trx));
    const service = new FlowFormsService({ tx } as never, {} as never);
    await expect(service.deleteQuestionScore(ID)).rejects.toThrow(new NotFoundException('Question score not found'));
    expect(query).toHaveBeenCalledOnce();
    expect(tx).toHaveBeenCalledOnce();
    expect(softDelete).not.toHaveBeenCalled();
  });
});
