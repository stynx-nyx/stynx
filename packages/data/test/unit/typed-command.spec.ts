import { z } from 'zod';
import {
  executeTypedCommand,
  executeTypedQueryResult,
  type CheckedQueryClient,
} from '../../src/checked-executor.js';
import {
  QueryArgumentError,
  QueryCardinalityError,
  QueryRowValidationError,
} from '../../src/errors.js';
import { defineQuery, sql } from '../../src/typed-query.js';
import * as publicData from '../../src/index.js';

const command = defineQuery({
  name: 'unit.command.delete',
  text: sql`delete from demo.note where id = $1`,
  params: z.tuple([z.string().trim().max(8)]),
  row: z.object({}),
  expects: 'none',
});

function connection(result: unknown) {
  const query = vi.fn(async () => result);
  const release = vi.fn();
  return { query, release, client: { query, release } as unknown as CheckedQueryClient };
}

describe('typed command execution', () => {
  it('exports the checked command entry and preserves exact SQL, arguments and connection ownership', async () => {
    const { client, query, release } = connection({ rows: [], rowCount: 2 });
    expect(publicData.executeTypedCommand).toBe(executeTypedCommand);
    await expect(executeTypedCommand(client, command, [' row-1 '])).resolves.toBe(2);
    expect(query).toHaveBeenCalledExactlyOnceWith(command.text, ['row-1']);
    expect(command.text).toBe('delete from demo.note where id = $1');
    expect(command.text).not.toMatch(/returning/i);
    expect(release).not.toHaveBeenCalled();
  });

  it.each([0, 1, 9])('returns the unchanged valid affected-row count %s', async (rowCount) => {
    const { client, query } = connection({ rows: [], rowCount });
    await expect(executeTypedCommand(client, command, ['row-1'])).resolves.toBe(rowCount);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined])(
    'retains unavailable affected-row count %s as null',
    async (rowCount) => {
      const { client } = connection({ rows: [], rowCount });
      await expect(executeTypedCommand(client, command, ['row-1'])).resolves.toBe(null);
    },
  );

  it('rejects invalid caller arguments before executing SQL without exposing their values', async () => {
    const { client, query } = connection({ rows: [], rowCount: 1 });
    const secret = 'argument-value-must-not-appear';
    const error = await executeTypedCommand(client, command, [secret]).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(QueryArgumentError);
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a runtime cardinality other than none before executing SQL', async () => {
    const queryWithRows = defineQuery({
      name: 'unit.command.wrong-cardinality',
      text: sql`select 1`,
      params: z.tuple([]),
      row: z.object({}),
      expects: 'many',
    });
    const { client, query } = connection({ rows: [], rowCount: 0 });
    await expect(executeTypedCommand(client, queryWithRows as never, [])).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects returned rows instead of treating them as affected rows', async () => {
    const { client, query } = connection({ rows: [{ hidden: 'driver-payload' }], rowCount: 1 });
    await expect(executeTypedCommand(client, command, ['row-1'])).rejects.toBeInstanceOf(
      QueryCardinalityError,
    );
    expect(query).toHaveBeenCalledExactlyOnceWith(command.text, ['row-1']);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 'driver-secret', true, {}, 1n])(
    'classifies invalid driver count %s as a redacted infrastructure row-contract failure',
    async (rowCount) => {
      const { client, query } = connection({ rows: [], rowCount });
      const error = await executeTypedCommand(client, command, ['row-1']).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(QueryRowValidationError);
      expect(error).not.toBeInstanceOf(QueryArgumentError);
      expect(error).toMatchObject({ issues: [{ path: ['rowCount'], code: 'invalid_type' }] });
      expect(JSON.stringify(error)).not.toContain('driver-secret');
      expect(query).toHaveBeenCalledTimes(1);
    },
  );
});

describe('checked query result metadata', () => {
  const selection = defineQuery({
    name: 'unit.metadata.selection',
    text: sql`select id from demo.note`,
    params: z.tuple([]),
    row: z.object({ id: z.string() }),
    expects: 'many',
  });

  it.each([9, null, undefined])(
    'preserves checked rows and independent driver count %s',
    async (rowCount) => {
      const rows = [{ id: 'row-1' }];
      const { client, query, release } = connection({ rows, rowCount });
      expect(publicData.executeTypedQueryResult).toBe(executeTypedQueryResult);
      await expect(executeTypedQueryResult(client, selection, [])).resolves.toEqual({
        value: rows,
        rowCount: rowCount ?? null,
      });
      expect(query).toHaveBeenCalledExactlyOnceWith(selection.text, []);
      expect(release).not.toHaveBeenCalled();
    },
  );

  it('retains row validation when affected-row metadata is requested', async () => {
    const { client, query } = connection({ rows: [{ id: 42 }], rowCount: 1 });
    await expect(executeTypedQueryResult(client, selection, [])).rejects.toBeInstanceOf(
      QueryRowValidationError,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid count metadata even when every returned row is valid', async () => {
    const { client, query } = connection({ rows: [{ id: 'row-1' }], rowCount: -1 });
    await expect(executeTypedQueryResult(client, selection, [])).rejects.toMatchObject({
      issues: [{ path: ['rowCount'], code: 'invalid_type' }],
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
