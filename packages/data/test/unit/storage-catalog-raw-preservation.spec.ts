import { describe, expect, it } from 'vitest';
import { collectStorageCatalog } from '../../src/storage-catalog.js';
import { storageCatalogQueries } from '../../src/storage-catalog.repository.js';
import { QueryRowValidationError } from '../../src/errors.js';

// Complete values observed with the stock PostgreSQL 18.6 JSONB parser.
const values: Record<string, Record<string, unknown>> = {
  "column": {
    "type": "int4",
    "default": null,
    "notNull": true,
    "identity": "",
    "position": 1,
    "collation": null,
    "generated": "",
    "typeSchema": "pg_catalog",
    "typeModifier": -1,
    "collationSchema": null
  },
  "constraint": {
    "kind": "f",
    "match": "s",
    "columns": [
      "parent"
    ],
    "deferred": false,
    "onDelete": "a",
    "onUpdate": "a",
    "noInherit": true,
    "validated": true,
    "deferrable": false,
    "expression": null,
    "referencedTable": "parent",
    "referencedSchema": "specimen",
    "referencedColumns": [
      "id"
    ]
  },
  "default-grant": {
    "kind": "r",
    "owner": "stynx_inspector",
    "grantee": "PUBLIC",
    "grantable": false,
    "privilege": "SELECT"
  },
  "enum": {
    "owner": "stynx_inspector",
    "labels": [
      "a",
      "b"
    ]
  },
  "function": {
    "owner": "stynx_inspector",
    "config": null,
    "strict": false,
    "parallel": "u",
    "leakproof": false,
    "definition": "CREATE OR REPLACE FUNCTION specimen.touch()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$BEGIN RETURN NEW; END$function$\n",
    "volatility": "v",
    "securityDefiner": false
  },
  "grant": {
    "object": "child",
    "grantee": "stynx_inspector",
    "grantable": false,
    "privilege": "DELETE"
  },
  "index": {
    "ready": true,
    "table": "child",
    "valid": true,
    "unique": true,
    "primary": true,
    "definition": "CREATE UNIQUE INDEX child_pkey ON specimen.child USING btree (id)"
  },
  "policy": {
    "check": "true",
    "roles": [
      "PUBLIC"
    ],
    "using": "true",
    "command": "*",
    "permissive": true
  },
  "relation": {
    "rls": true,
    "kind": "r",
    "owner": "stynx_inspector",
    "forceRls": false
  },
  "sequence": {
    "max": "9223372036854775807",
    "min": "1",
    "type": "bigint",
    "cache": "1",
    "cycle": false,
    "start": "1",
    "increment": "1"
  },
  "trigger": {
    "type": 7,
    "enabled": "O",
    "function": "touch",
    "arguments": "",
    "condition": null,
    "functionSchema": "specimen"
  }
};

describe('catalog raw driver preservation', () => {
  it.each(storageCatalogQueries)('preserves nested order, identity and extras for $kind', async ({ kind }) => {
    const opaque = { sentinel: Symbol('nested') };
    const value = { ...Object.fromEntries(Object.entries(values[kind]!).reverse()), opaque };
    Object.defineProperty(value, '__proto__', { value: opaque, enumerable: true });
    const row = { name: 'sample', value, extra: opaque };
    let calls = 0;
    const entries = await collectStorageCatalog({ async query(sql, params) {
      const definition = storageCatalogQueries[calls++]!;
      expect(sql).toBe(definition.query.text);
      expect(params).toEqual(['specimen']);
      return { rows: definition.kind === kind ? [row] : [], get rowCount() { throw new Error('unused count'); } };
    } }, 'specimen');
    expect(calls).toBe(11);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ kind, ...row });
    expect(entries[0]).not.toBe(row);
    expect(entries[0]!.value).toBe(value);
    expect(Object.keys(entries[0]!.value)).toEqual(Object.keys(value));
    expect(entries[0]!.value.opaque).toBe(opaque);
    expect(Object.getOwnPropertyDescriptor(entries[0]!.value, '__proto__')?.value).toBe(opaque);
    expect(Reflect.get(entries[0]!, 'extra')).toBe(opaque);
  });

  for (const { kind, query } of storageCatalogQueries) {
    for (const field of Object.keys(values[kind]!)) {
      it(`refuses missing fixed ${kind}.${field} before later queries`, async () => {
        const value = { ...values[kind], secret: 'sensitive-driver-secret' };
        Reflect.deleteProperty(value, field);
        let calls = 0;
        const failure = await collectStorageCatalog({ async query() {
          const definition = storageCatalogQueries[calls++]!;
          return { rows: definition.kind === kind ? [{ name: 'sample', value }] : [] };
        } }, 'specimen').catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(QueryRowValidationError);
        expect(failure).toMatchObject({ query: query.name, rowIndex: 0 });
        expect(JSON.stringify(failure)).not.toContain('sensitive-driver-secret');
        expect(calls).toBe(storageCatalogQueries.findIndex(item => item.kind === kind) + 1);
      });
    }
  }

  it('retains valid string kind overwrite and sorts the new outer entries', async () => {
    const value = values.relation!;
    const rows = [{ name: 'z', value, kind: 'custom' }, { name: 'a', value, kind: 'custom' }];
    let calls = 0;
    const entries = await collectStorageCatalog({ async query() { return { rows: calls++ === 0 ? rows : [] }; } }, 'specimen');
    expect(entries.map(row => [row.kind, row.name])).toEqual([['custom', 'a'], ['custom', 'z']]);
    expect(rows.map(row => row.name)).toEqual(['z', 'a']);
    expect(entries[0]!.value).toBe(value);
    expect(Object.isFrozen(entries)).toBe(false);
  });

  const malformed = ['inherited-name', 'inherited-value', 'nonenumerable-name', 'nonenumerable-value', 'kind', 'changing-name', 'changing-value'] as const;
  it.each(malformed)('refuses the actual exposed spread envelope: %s', async scenario => {
    const row = { name: 'sample', value: values.relation! };
    if (scenario === 'kind') Object.defineProperty(row, 'kind', { value: 123, enumerable: true });
    if (scenario.startsWith('inherited')) {
      const key = scenario === 'inherited-name' ? 'name' : 'value';
      Object.setPrototypeOf(row, { [key]: row[key] });
      Reflect.deleteProperty(row, key);
    }
    if (scenario.startsWith('nonenumerable')) Object.defineProperty(row, scenario === 'nonenumerable-name' ? 'name' : 'value', { enumerable: false });
    if (scenario.startsWith('changing')) {
      const key = scenario === 'changing-name' ? 'name' : 'value';
      const original = row[key]; let reads = 0;
      Object.defineProperty(row, key, { enumerable: true, get() { return ++reads < 3 ? original : null; } });
    }
    let calls = 0;
    const failure = await collectStorageCatalog({ async query() { calls++; return { rows: calls === 1 ? [row] : [] }; } }, 'specimen').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QueryRowValidationError);
    expect(failure).toMatchObject({ query: 'data.storage-catalog.relation', rowIndex: 0 });
    expect(calls).toBe(1);
  });

  it('preserves getter error identity and does not execute later catalog queries', async () => {
    const sentinel = new Error('native getter'); let calls = 0;
    await expect(collectStorageCatalog({ async query() {
      calls++; return { rows: [{ name: 'sample', get value() { throw sentinel; } }] };
    } }, 'specimen')).rejects.toBe(sentinel);
    expect(calls).toBe(1);
  });
});
