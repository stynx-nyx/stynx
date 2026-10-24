import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import {
  createScopedQueryExecutor,
  executeTypedQuery,
  type CheckedQueryScope,
} from '../../src/checked-executor.js';
import { defineQuery, sql } from '../../src/typed-query.js';
import { QueryRowValidationError } from '../../src/errors.js';
import * as publicData from '../../src/index.js';

const statement = defineQuery({
  name: 'unit.scoped.selection',
  text: sql`select value from demo.entry where id = $1`,
  params: z.tuple([z.string()]),
  row: z.object({ value: z.string() }),
  expects: 'one',
});

it('keeps system context active until one dispatch completes, then restores it before resolving', async () => {
  const context = new AsyncLocalStorage<{ role: string }>();
  const events: string[] = [];
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const query = vi.fn(async (_text: string, _values?: unknown[]) => {
    events.push('query');
    expect(context.getStore()).toEqual({ role: 'owner' });
    started.resolve();
    await finish.promise;
    expect(context.getStore()).toEqual({ role: 'owner' });
    events.push('query-complete');
    return { rows: [{ value: 'checked' }] };
  });
  let scopes = 0;
  const runWithin: CheckedQueryScope = (consume) =>
    context.run({ role: 'owner' }, async () => {
      scopes += 1;
      events.push('begin');
      try {
        const value = await consume({ query });
        events.push('commit');
        return value;
      } finally {
        events.push('release');
      }
    });
  expect(publicData.createScopedQueryExecutor).toBe(createScopedQueryExecutor);
  let settled = false;
  const pending = executeTypedQuery(createScopedQueryExecutor(runWithin), statement, ['id']).then(
    (value) => {
      settled = true;
      return value;
    },
  );
  await started.promise;
  expect(context.getStore()).toBeUndefined();
  expect(settled).toBe(false);
  expect(events).toEqual(['begin', 'query']);
  finish.resolve();
  await expect(pending).resolves.toEqual({ value: 'checked' });
  expect(events).toEqual(['begin', 'query', 'query-complete', 'commit', 'release']);
  expect(query).toHaveBeenCalledExactlyOnceWith(statement.text, ['id']);
  expect(scopes).toBe(1);
  expect(context.getStore()).toBeUndefined();
});

it('preserves driver-error identity and the supplied rollback/cleanup lifecycle without retry', async () => {
  const context = new AsyncLocalStorage<string>();
  const failure = new Error('driver unavailable');
  const events: string[] = [];
  const query = vi.fn(async () => {
    expect(context.getStore()).toBe('system-owner');
    throw failure;
  });
  const runWithin: CheckedQueryScope = (consume) =>
    context.run('system-owner', async () => {
      events.push('begin');
      try {
        const result = await consume({ query });
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      } finally {
        events.push('release');
      }
    });
  await expect(
    executeTypedQuery(createScopedQueryExecutor(runWithin), statement, ['id']),
  ).rejects.toBe(failure);
  expect(query).toHaveBeenCalledTimes(1);
  expect(events).toEqual(['begin', 'rollback', 'release']);
  expect(context.getStore()).toBeUndefined();
});

it('still validates application rows downstream of the supplied query scope', async () => {
  const query = vi.fn(async () => ({ rows: [{ value: 17 }] }));
  const runWithin: CheckedQueryScope = (consume) => consume({ query });
  await expect(
    executeTypedQuery(createScopedQueryExecutor(runWithin), statement, ['id']),
  ).rejects.toBeInstanceOf(QueryRowValidationError);
  expect(query).toHaveBeenCalledTimes(1);
});
