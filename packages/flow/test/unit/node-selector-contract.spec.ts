import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import ts from 'typescript';
import { executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { selectNodeInsertQuery } from '../../src/internal/design/generated/nodes-insert.repository.js';
import { selectNodeUpdateQuery } from '../../src/internal/design/generated/nodes-update.repository.js';
import { nodeMutationParams, nodeMutationRow } from '../../src/internal/design/node-mutation-schemas.js';
import { FlowDesignTableStore } from '../../src/internal/design/design-table-store.js';

const baseline = z.object({ queryCount: z.literal(8191), queries: z.record(z.string(), z.object({
  sqlSha256: z.string(), params: z.array(z.enum(['uuid','actor','text','numeric','integer','textArray','json','timestamp'])),
  row: z.literal('nodeMutationRow'), expects: z.literal('many'), module: z.string(), ordinal: z.number(),
})) }).parse(JSON.parse(readFileSync(resolve(__dirname, '../fixtures/node-query-baseline.json'), 'utf8')));
const id = '0190abcd-1234-7abc-89ab-000000000001';
const actor = '0190abcd-1234-7abc-89ab-000000000002';
const sample = { uuid: id, actor, text: 'bound hostile value "; drop table flow.nodes;--', numeric: '0.25', integer: 7, textArray: ['a', null], json: { nested: [1, null] }, timestamp: new Date('2026-10-24T00:00:00Z') };
const columns = ['graphId','code','name','kind','decisionPolicy','quorumRatio','allowedActions','slaSeconds','entryRule','exitRule','sortOrder','meta'];
const values = [id, 'node', null, 'human', 'all', '0.5', ['approve'], 60, null, null, 0, { nested: true }];
const physical = { id, tenant_id: id, graph_id: id, code: 'node', name: null, kind: 'human', decision_policy: 'all', quorum_ratio: '0.5', allowed_actions: ['approve'], sla_seconds: 60, entry_rule: null, exit_rule: null, sort_order: 0, meta: { nested: true }, created_by: actor, updated_by: actor, created_at: new Date('2026-10-24T00:00:00Z'), updated_at: new Date('2026-10-24T00:00:00Z') };

for (const [operation, select, start] of [['insert', selectNodeInsertQuery, 0], ['update', selectNodeUpdateQuery, 1]] as const) {
  it(`preserves every ${operation} SQL, tuple, row schema, mask and eager identity`, () => {
    const identities = new Set();
    for (let mask = start; mask < 4096; mask++) {
      const query = select(mask);
      const prior = baseline.queries[`flow.nodes.${operation}.mask.${mask}`];
      expect(prior).toBeDefined();
      expect(query.name).toBe(`flow.nodes.${operation}.mask.${mask}`);
      expect(createHash('sha256').update(query.text).digest('hex')).toBe(prior.sqlSha256);
      expect(query.expects).toBe(prior.expects);
      expect(query.row).toBe(nodeMutationRow);
      expect(query.params.def.items).toEqual(prior.params.map((name) => nodeMutationParams[name]));
      const bound = prior.params.map((name) => sample[name]);
      expect(query.params.safeParse(bound).success).toBe(true);
      expect(query.params.safeParse([...bound, null]).success).toBe(false);
      expect(query.params.safeParse(bound.slice(1)).success).toBe(false);
      expect(Object.isFrozen(query)).toBe(true);
      expect(select(mask)).toBe(query);
      identities.add(query);
    }
    expect(identities.size).toBe(4096 - start);
  });

  it(`preserves ${operation} rejection for masks outside its finite domain`, () => {
    for (const mask of [-1, 4096, 0.5, NaN, Infinity, -Infinity, '1', null, undefined, {}]) {
      expect(() => Reflect.apply(select, undefined, [mask])).toThrow('Missing fixed Flow node mutation definition');
    }
    if (operation === 'update') expect(() => select(0)).toThrow('Missing fixed Flow node mutation definition');
  });
}

function storeFixture(rows: unknown[] = [physical]) {
  const query = vi.fn(async (_text: string, _values?: unknown[]) => ({ rows }));
  const run: Transaction['run'] = (statement, params) => executeTypedQuery({ query }, statement, params);
  const tx = vi.fn(async (consume: (trx: { run: typeof run; query: typeof query }) => Promise<unknown>) => consume({ run, query }));
  const store = new FlowDesignTableStore({ tx } as never, { tenantId: id, actorId: actor } as never);
  return { query, tx, store };
}

it('preserves all node insert masks, own-defined fields, audit bindings and row mapping through actual checked execution', async () => {
  const { store, query, tx } = storeFixture();
  for (let mask = 0; mask < 4096; mask++) {
    const input: Record<string, unknown> = { ignored: 'extra', notAColumn: undefined };
    const bound: unknown[] = [id];
    columns.forEach((column, bit) => {
      if ((mask & (1 << bit)) !== 0) { input[column] = values[bit]; bound.push(values[bit]); }
      else input[column] = undefined;
    });
    bound.push(actor, actor);
    const result = await store.createRow('nodes', input);
    expect(query).toHaveBeenLastCalledWith(selectNodeInsertQuery(mask).text, bound);
    expect(result).toMatchObject({ id, tenantId: id, graphId: id, decisionPolicy: 'all' });
  }
  expect(query).toHaveBeenCalledTimes(4096);
  expect(tx).toHaveBeenCalledTimes(4096);
});

it('preserves all nonempty node update masks, binding order and timestamp placement through actual checked execution', async () => {
  const { store, query } = storeFixture();
  for (let mask = 1; mask < 4096; mask++) {
    const input: Record<string, unknown> = {};
    const bound: unknown[] = [id];
    columns.forEach((column, bit) => {
      if ((mask & (1 << bit)) !== 0) { input[column] = values[bit]; bound.push(values[bit]); }
    });
    await store.updateRow('nodes', id, input);
    expect(query).toHaveBeenLastCalledWith(selectNodeUpdateQuery(mask).text, [...bound, actor, expect.any(Date)]);
  }
  expect(query).toHaveBeenCalledTimes(4095);
});

it('keeps empty update and empty returned-row failures at their established boundary', async () => {
  const { store, query } = storeFixture([]);
  await expect(store.updateRow('nodes', id, { name: undefined })).rejects.toThrow('At least one update field is required');
  expect(query).not.toHaveBeenCalled();
  await expect(store.createRow('nodes', {})).rejects.toThrow('Flow insert did not return a row');
  expect(query).toHaveBeenCalledTimes(1);
  await expect(store.updateRow('nodes', id, { name: null })).rejects.toThrow('Flow row not found');
  expect(query).toHaveBeenCalledTimes(2);
});

it('retains driver error identity and excludes inherited node fields', async () => {
  const { store, query } = storeFixture();
  const input = { name: null };
  Object.setPrototypeOf(input, { code: 'inherited' });
  await store.createRow('nodes', input);
  expect(query).toHaveBeenLastCalledWith(selectNodeInsertQuery(4).text, [id, null, actor, actor]);
  const failure = new Error('driver sentinel');
  query.mockRejectedValueOnce(failure);
  await expect(store.updateRow('nodes', id, { name: null })).rejects.toBe(failure);
});

it('preserves eager module construction and numeric leaf order across every original chunk', () => {
  const directory = resolve(__dirname, '../../src/internal/design/generated');
  const modules = [...new Set(Object.values(baseline.queries).map((entry) => entry.module))];
  let visited = 0;
  for (const module of modules) {
    const path = resolve(directory, module);
    const text = readFileSync(path, 'utf8');
    const parsed = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const names: string[] = [];
    for (const statement of parsed.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer || !ts.isCallExpression(declaration.initializer) ||
            !ts.isIdentifier(declaration.initializer.expression) || declaration.initializer.expression.text !== 'defineQuery') continue;
        expect(statement.declarationList.flags & ts.NodeFlags.Const).not.toBe(0);
        const options = declaration.initializer.arguments[0];
        expect(ts.isObjectLiteralExpression(options)).toBe(true);
        if (!ts.isObjectLiteralExpression(options)) throw new Error('Expected actual query options');
        const name = options.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(parsed) === 'name');
        if (!name || !ts.isPropertyAssignment(name) || !ts.isStringLiteral(name.initializer)) throw new Error('Expected literal query name');
        names.push(name.initializer.text);
      }
    }
    const expected = Object.entries(baseline.queries).filter(([, entry]) => entry.module === module).sort(([, left], [, right]) => left.ordinal - right.ordinal).map(([name]) => name);
    expect(names).toEqual(expected);
    visited += names.length;
  }
  expect(visited).toBe(8191);
  for (const operation of ['insert','update']) {
    const path = resolve(directory, `nodes-${operation}.repository.ts`);
    const parsed = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const imports = parsed.statements.filter(ts.isImportDeclaration).map((statement) => statement.moduleSpecifier).filter(ts.isStringLiteral).map((specifier) => specifier.text).filter((specifier) => specifier.startsWith('./nodes-'));
    expect(imports).toEqual(Array.from({ length: 32 }, (_, index) => `./nodes-${operation}-${String(index).padStart(2, '0')}.repository.js`));
  }
});
