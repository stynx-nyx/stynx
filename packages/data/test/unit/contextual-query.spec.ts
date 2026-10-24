import { z } from 'zod';
import {
  bindQueryContext,
  executeTypedQuery,
  executeTypedQueryResult,
} from '../../src/checked-executor.js';
import { defineQuery, sql } from '../../src/typed-query.js';
import { QueryRowValidationError } from '../../src/errors.js';
import * as publicData from '../../src/index.js';

const selection = defineQuery({
  name: 'unit.contextual.selection',
  text: sql`select value from demo.entry where id = $1`,
  params: z.tuple([z.string()]),
  row: z.object({ value: z.string() }),
  expects: 'many',
});

it('exports the context bridge and forwards the same object without owning the connection lifecycle', async () => {
  const context = { tenantId: 'tenant', private: { authorization: 'kept-by-identity' } };
  const query = vi.fn(async (_text: string, _values?: readonly unknown[], _context?: unknown) => ({
    rows: [{ value: 'checked' }],
    rowCount: 9,
  }));
  const release = vi.fn();
  const end = vi.fn();
  const client = { query, release, end };
  expect(publicData.bindQueryContext).toBe(bindQueryContext);
  await expect(
    executeTypedQueryResult(bindQueryContext(client, context), selection, ['id']),
  ).resolves.toEqual({ value: [{ value: 'checked' }], rowCount: 9 });
  expect(query).toHaveBeenCalledExactlyOnceWith(selection.text, ['id'], context);
  expect(query.mock.calls[0]?.[2]).toBe(context);
  expect(release).not.toHaveBeenCalled();
  expect(end).not.toHaveBeenCalled();
});

it('distinguishes omitted context from an explicitly supplied undefined context', async () => {
  const query = vi.fn(async (_text: string, _values?: readonly unknown[], _context?: unknown) => ({
    rows: [],
  }));
  await executeTypedQuery(bindQueryContext({ query }), selection, ['first']);
  await executeTypedQuery(bindQueryContext({ query }, undefined), selection, ['second']);
  expect(query.mock.calls).toEqual([
    [selection.text, ['first']],
    [selection.text, ['second'], undefined],
  ]);
});

it.each([
  [[{ value: 'a' }, { value: 'b' }], null],
  [{ rows: [{ value: 'a' }, { value: 'b' }] }, null],
  [{ rows: [{ value: 'a' }, { value: 'b' }], rowCount: null }, null],
  [{ rows: [{ value: 'a' }, { value: 'b' }], rowCount: 0 }, 0],
  [{ rows: [{ value: 'a' }, { value: 'b' }], rowCount: 17 }, 17],
])(
  'keeps checked rows separate from actual or unavailable driver metadata: %j',
  async (response, count) => {
    const query = vi.fn(async () => response);
    await expect(
      executeTypedQueryResult(bindQueryContext({ query }), selection, ['id']),
    ).resolves.toEqual({ value: [{ value: 'a' }, { value: 'b' }], rowCount: count });
    expect(query).toHaveBeenCalledTimes(1);
  },
);

it.each([
  null,
  undefined,
  'private-bad-envelope',
  {},
  { rows: null },
  { rows: 'private-bad-envelope' },
  { rows: [], rowCount: -1 },
  { rows: [], rowCount: 0.5 },
  { rows: [], rowCount: Number.NaN },
])(
  'rejects malformed envelopes without returning unchecked metadata or raw driver data: %j',
  async (response) => {
    const query = vi.fn(async () => response);
    const error = await executeTypedQueryResult(bindQueryContext({ query }), selection, [
      'id',
    ]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(String(error)).not.toContain('private-bad-envelope');
    expect(query).toHaveBeenCalledTimes(1);
  },
);

it('does not treat a valid envelope as evidence that its application rows are valid', async () => {
  const query = vi.fn(async () => [{ value: 17 }]);
  await expect(
    executeTypedQuery(bindQueryContext({ query }), selection, ['id']),
  ).rejects.toBeInstanceOf(QueryRowValidationError);
  expect(query).toHaveBeenCalledTimes(1);
});

it('propagates the original driver failure without retrying or replacing its identity', async () => {
  const failure = new Error('driver unavailable');
  const query = vi.fn(async () => {
    throw failure;
  });
  await expect(
    executeTypedQuery(bindQueryContext({ query }, { requestId: 'request' }), selection, ['id']),
  ).rejects.toBe(failure);
  expect(query).toHaveBeenCalledTimes(1);
});
