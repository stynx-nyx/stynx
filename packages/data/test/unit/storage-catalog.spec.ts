import { collectStorageCatalog } from '../../src/storage-catalog';
import type { StorageVerifierTransaction } from '../../src/storage-contract';

// ADR-OUTBOX-0004 closed storage: a catalog is deterministic, schema-scoped,
// carries all original security metadata, and never owns the caller transaction.
describe('storage catalog collection boundary', () => {
  it('binds the schema on every read and returns all categories in stable order without changing metadata', async () => {
    const schema = 'schema name; "ação"';
    const source = [
      { name: 'z-last', value: { owner: 'owner-a', grantable: true, nested: { enabled: false } } },
      { name: 'A-first', value: { owner: 'owner-a', grantable: false, labels: ['b', 'a'] } },
    ];
    const original = structuredClone(source);
    const statements: Array<{ sql: string; parameters?: readonly unknown[] }> = [];
    const trx = {
      query: vi.fn(async (sql: string, parameters?: readonly unknown[]) => {
        statements.push({ sql, parameters });
        return { rows: source };
      }),
    } as unknown as StorageVerifierTransaction;
    const result = await collectStorageCatalog(trx, schema);
    const kinds = [
      'column',
      'constraint',
      'default-grant',
      'enum',
      'function',
      'grant',
      'index',
      'policy',
      'relation',
      'sequence',
      'trigger',
    ];
    expect(result.map(({ kind, name }) => `${kind}:${name}`)).toEqual(
      kinds.flatMap((kind) => [`${kind}:A-first`, `${kind}:z-last`]),
    );
    expect(result.filter(({ name }) => name === 'z-last').map(({ value }) => value)).toEqual(
      kinds.map(() => original[0]!.value),
    );
    expect(result.filter(({ name }) => name === 'A-first').map(({ value }) => value)).toEqual(
      kinds.map(() => original[1]!.value),
    );
    expect(source).toEqual(original);
    expect(statements).toHaveLength(kinds.length);
    for (const { sql, parameters } of statements) {
      expect(sql.trimStart()).toMatch(/^select\b/iu);
      expect(sql).not.toContain(schema);
      expect(parameters).toEqual([schema]);
      expect(sql).not.toMatch(/\b(?:nextval|setval|BEGIN|COMMIT|ROLLBACK)\s*\(/iu);
    }
  });

  it('returns an empty catalog for an absent schema using only the supplied transaction', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    expect(
      await collectStorageCatalog({ query } as unknown as StorageVerifierTransaction, 'absent'),
    ).toEqual([]);
    expect(query).toHaveBeenCalledTimes(11);
  });

  it('propagates a catalog read refusal without returning partial evidence or opening another connection', async () => {
    const refusal = Object.assign(new Error('permission denied'), { code: '42501' });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ name: 'partial', value: { rls: true } }] })
      .mockRejectedValueOnce(refusal);
    await expect(
      collectStorageCatalog({ query } as unknown as StorageVerifierTransaction, 'protected'),
    ).rejects.toBe(refusal);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
