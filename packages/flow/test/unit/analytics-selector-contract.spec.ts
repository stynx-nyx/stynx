import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';
import { executeTypedQuery, type Transaction, type TypedQuery } from '@stynx-nyx/data';
import * as queries from '../../src/analytics.repository.js';
import { FlowAnalyticsService } from '../../src/flow-analytics.service.js';

const baseline = z.object({ queries: z.record(z.string(), z.object({ text: z.string(), params: z.array(z.string()) })) })
  .parse(JSON.parse(readFileSync(resolve(__dirname, '../fixtures/analytics-query-baseline.json'), 'utf8'))).queries;
const selectors: Array<{ select: (mask: number) => TypedQuery; count: number }> = [
  { select: queries.selectOpenTaskQuery, count: 64 },
  { select: queries.selectOpenTaskCountQuery, count: 64 },
  { select: queries.selectRunsSummaryQuery, count: 64 },
  { select: queries.selectRunsSummaryCountQuery, count: 64 },
  { select: queries.selectDashboardOpenTaskQuery, count: 8 },
  { select: queries.selectDashboardCycleTimeQuery, count: 8 },
  { select: queries.selectDashboardCompletionQuery, count: 8 },
  { select: queries.selectDashboardSlaBreachQuery, count: 8 },
];
const common = ['scopeId', 'graphId', 'scopeCode'];
const task = [...common, 'targetType', 'targetId', 'assigneeUserId'];
const summary = [...common, 'targetType', 'targetId', 'status'];

function fixture(rows: unknown[][] = []) {
  let next = 0;
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: rows[next++] ?? [] }));
  const run: Transaction['run'] = (statement, params) => executeTypedQuery({ query }, statement, params);
  const tx = vi.fn(async (consume: (trx: { query: typeof query; run: typeof run }) => Promise<unknown>, _options?: unknown) => consume({ query, run }));
  return { query, tx, service: new FlowAnalyticsService({ tx } as never) };
}

function filterInput(keys: string[], mask: number) {
  const input: Record<string, unknown> = {};
  const values: string[] = [];
  keys.forEach((key, bit) => {
    if (mask & (1 << bit)) {
      const value = `bound-${key}-'--`;
      input[key] = value;
      values.push(value);
    }
  });
  return { input, values };
}

describe('Flow analytics finite selector preservation', () => {
  it('retains all 288 historical SQL bodies, tuple domains and eager immutable query identities', () => {
    const names = new Set<string>();
    const instances = new Set<TypedQuery>();
    for (const { select, count } of selectors) for (let mask = 0; mask < count; mask++) {
      const query = select(mask);
      const previous = baseline[query.name];
      expect(previous).toBeDefined();
      expect(query.text).toBe(previous?.text);
      expect(query.expects).toBe('many');
      expect(Object.isFrozen(query)).toBe(true);
      expect(select(mask)).toBe(query);
      const params = previous?.params.map((kind) => kind === 'text' ? "bound-'--" : 2.5) ?? [];
      expect(query.params.safeParse(params).success).toBe(true);
      expect(query.params.safeParse([...params, 'extra']).success).toBe(false);
      if (params.length) expect(query.params.safeParse(params.slice(1)).success).toBe(false);
      names.add(query.name); instances.add(query);
    }
    expect(names.size).toBe(288);
    expect(instances.size).toBe(288);
    expect([...names].sort()).toEqual(Object.keys(baseline).sort());
  });

  it.each(selectors.map((entry, index) => ({ ...entry, index })))('refuses invalid masks for selector $index without fallback', ({ select, count }) => {
    for (const mask of [-1, count, 1.5, NaN, Infinity, -Infinity]) {
      expect(() => select(mask)).toThrow(new Error('Unknown Flow analytics filter mask'));
    }
    for (const mask of ['0', undefined, null, {}]) {
      expect(() => Reflect.apply(select, undefined, [mask])).toThrow('Unknown Flow analytics filter mask');
    }
  });

  it.each(['tasks', 'summary', 'dashboard'] as const)('preserves every $0 mask SQL, bound order and reader transaction', async (family) => {
    const keys = family === 'tasks' ? task : family === 'summary' ? summary : common;
    for (let mask = 0; mask < 2 ** keys.length; mask++) {
      const { service, query, tx } = fixture();
      const { input, values } = filterInput(keys, mask);
      const selected = family === 'tasks'
        ? [queries.selectOpenTaskQuery(mask), queries.selectOpenTaskCountQuery(mask)]
        : family === 'summary'
          ? [queries.selectRunsSummaryQuery(mask), queries.selectRunsSummaryCountQuery(mask)]
          : [queries.selectDashboardOpenTaskQuery(mask), queries.selectDashboardCycleTimeQuery(mask), queries.selectDashboardCompletionQuery(mask), queries.selectDashboardSlaBreachQuery(mask)];
      if (family === 'tasks') await service.openTasks({ ...input, page: 2, pageSize: 3 });
      else if (family === 'summary') await service.runsSummary({ ...input, page: 2, pageSize: 3 });
      else await service.dashboard(input);
      expect(tx).toHaveBeenCalledTimes(1);
      expect(tx).toHaveBeenCalledWith(expect.any(Function), { role: 'reader', readonly: true });
      expect(query).toHaveBeenCalledTimes(selected.length);
      selected.forEach((definition, index) => {
        expect(query.mock.calls[index]?.[0]).toBe(baseline[definition.name]?.text);
        expect(query.mock.calls[index]?.[1]).toEqual(family !== 'dashboard' && index === 0 ? [...values, 3, 3] : values);
        for (const value of values) expect(definition.text).not.toContain(value);
      });
    }
  });

  it('retains numeric paging and driver error identity without an earlier narrowing', async () => {
    const failure = new Error('driver owns numeric paging');
    const { service, query } = fixture();
    query.mockRejectedValue(failure);
    await expect(service.openTasks({ page: 1.5, pageSize: Infinity })).rejects.toBe(failure);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual([100, 50]);
  });

  it.each(['tasks', 'summary', 'dashboard'] as const)('ignores empty and non-string $0 filters without changing defaults', async (family) => {
    const { service, query } = fixture();
    const input = { scopeId: '', graphId: 42, scopeCode: null, targetType: false, targetId: [], assigneeUserId: {}, status: undefined };
    if (family === 'tasks') await service.openTasks(input);
    else if (family === 'summary') await service.runsSummary(input);
    else await service.dashboard(input);
    expect(query.mock.calls[0]?.[1]).toEqual(family === 'dashboard' ? [] : [50, 0]);
  });

  it('rejects malformed aggregate rows at their real checked boundary with redacted evidence', async () => {
    const { service, query } = fixture([[{ total: { secret: 'private-aggregate' } }]]);
    const failure: unknown = await service.dashboard().catch((error: unknown) => error);
    expect(failure).toMatchObject({ name: 'QueryRowValidationError' });
    expect(JSON.stringify(failure)).not.toContain('private-aggregate');
    expect(query).toHaveBeenCalledTimes(1);
  });
});

it('regenerates the exact analytics source deterministically without touching the checkout', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'stynx-analytics-generator-'));
  try {
    mkdirSync(resolve(directory, 'scripts'));
    mkdirSync(resolve(directory, 'src'));
    const script = resolve(directory, 'scripts/generate-analytics-queries.mjs');
    copyFileSync(resolve(__dirname, '../../scripts/generate-analytics-queries.mjs'), script);
    const expected = readFileSync(resolve(__dirname, '../../src/analytics.repository.ts'), 'utf8');
    for (let attempt = 0; attempt < 2; attempt++) {
      execFileSync(process.execPath, [script], { cwd: directory, timeout: 10000 });
      expect(readFileSync(resolve(directory, 'src/analytics.repository.ts'), 'utf8')).toBe(expected);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
