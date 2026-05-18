import { expectAuditRow, findAuditRows, type Queryable } from '../../src/test-helpers';

function queryable(rows: Array<Record<string, unknown>>): Queryable {
  return {
    query: vi.fn(async () => ({ rows })) as never,
  };
}

describe('audit test helpers', () => {
  it('returns all rows when no tag subset is requested', async () => {
    const db = queryable([{ id: 1, tags: null }, { id: 2, tags: { source: 'unit' } }]);

    await expect(findAuditRows(db, { operation: 'insert' })).resolves.toHaveLength(2);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('from audit.log'), [
      'insert',
      null,
      null,
      null,
    ]);
  });

  it('filters rows by tag subset and reports missing audit rows', async () => {
    const db = queryable([
      { id: 1, tags: null },
      { id: 2, tags: { source: 'unit', requestId: 'req-1' } },
    ]);

    await expect(findAuditRows(db, {
      operation: 'update',
      tableSchema: 'public',
      tableName: 'records',
      rowId: 'row-1',
      tags: { source: 'unit' },
    })).resolves.toEqual([{ id: 2, tags: { source: 'unit', requestId: 'req-1' } }]);

    await expect(expectAuditRow(queryable([]), { operation: 'delete' })).rejects.toThrow(
      'Expected audit row was not found for delete',
    );
  });
});
