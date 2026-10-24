import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as ts from 'typescript';
import { z } from 'zod';
import * as data from '@stynx-nyx/data';
import { buildProgram } from '../src/cli.js';

const roots: string[] = [];
const tenant = '11111111-1111-1111-1111-111111111111';
const id = '22222222-2222-2222-2222-222222222222';
const validRow = { id, tenant_id: tenant, label: 'label', count: 2, enabled: true, note: null };

async function repositorySource(timestamp = false): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'stynx-checked-generator-'));
  roots.push(root);
  const blueprint = JSON.parse(readFileSync(join(__dirname, 'fixtures/BP-OPS-EXAMPLE-001.json'), 'utf8'));
  blueprint.database.entities[0].fields.push(
    { name: 'count', type: 'integer' },
    { name: 'enabled', type: 'boolean', nullable: true },
    { name: 'note', type: 'text', nullable: true },
    ...(timestamp ? [{ name: 'created_at', type: 'timestamptz', nullable: true }] : []),
  );
  blueprint.api.resources[0].operations = ['list', 'get', 'create', 'update', 'delete'];
  const input = join(root, 'blueprint.json');
  writeFileSync(input, JSON.stringify(blueprint));
  const program = buildProgram();
  program.exitOverride();
  await program.parseAsync(['generate', 'module', '--blueprint', input, '--out', join(root, 'out')], { from: 'user' });
  return readFileSync(join(root, 'out/src/example.repository.ts'), 'utf8');
}

function executableRepository(source: string, rows: Array<Record<string, unknown>>, context: { tenantId?: string } = { tenantId: tenant }) {
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows }));
  const run: data.Transaction['run'] = (statement, params) => data.executeTypedQuery({ query }, statement, params);
  const tx = vi.fn(async (callback: (trx: { query: typeof query; run: typeof run }) => unknown) => callback({ query, run }));
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true,
  }, reportDiagnostics: true });
  expect(compiled.diagnostics ?? []).toEqual([]);
  const exports: Record<string, unknown> = {};
  // Execute only generated fixture bytes. Module bindings are the real checked
  // APIs, with inert DI decorators; no CommonJS host loader or database is used.
  runInNewContext(compiled.outputText, {
    exports,
    require(name: string) {
      if (name === '@stynx-nyx/data') return data;
      if (name === 'zod') return { z };
      if (name === '@nestjs/common') return { Injectable: () => (target: unknown) => target };
      if (name === '@stynx-nyx/core') return { RequestContext: class RequestContext {} };
      throw new Error(`Unexpected generated dependency: ${name}`);
    },
  });
  type Repository = {
    listExampleRecord(): Promise<Array<Record<string, unknown>>>;
    getExampleRecord(id: string): Promise<Record<string, unknown> | null>;
    deleteExampleRecord(id: string): Promise<Record<string, unknown> | null>;
    createExampleRecord(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    updateExampleRecord(id: string, input: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  };
  const Constructor = exports.ExampleRepository as new (database: unknown, context: unknown) => Repository;
  return { repository: new Constructor({ tx }, context), query, tx };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('emits exactly three trusted zero-hole repository definitions for supported fixed operations', async () => {
  const source = await repositorySource();
  const ast = ts.createSourceFile('example.repository.ts', source, ts.ScriptTarget.Latest, true);
  const definitions: ts.CallExpression[] = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineQuery') definitions.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  expect(definitions).toHaveLength(3);
  for (const definition of definitions) {
    const options = definition.arguments[0];
    expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
    if (!options || !ts.isObjectLiteralExpression(options)) throw new Error('Missing literal definition');
    const text = options.properties.find((property) => property.name?.getText(ast) === 'text');
    expect(text && ts.isPropertyAssignment(text) && ts.isTaggedTemplateExpression(text.initializer)
      && text.initializer.tag.getText(ast) === 'sql' && ts.isNoSubstitutionTemplateLiteral(text.initializer.template)).toBe(true);
  }
  expect(source).toContain("import { Database, defineQuery, sql } from '@stynx-nyx/data'");
  expect(source).toContain("import { z } from 'zod'");
});

it('checks fixed-operation rows while retaining nullable scalars, unknown columns, Unicode bounds and mutable lists', async () => {
  const row = { ...validRow, label: '😀'.repeat(80), enabled: null, extra: { opaque: [1, null] } };
  const { repository, query, tx } = executableRepository(await repositorySource(), [row]);
  const listed = await repository.listExampleRecord();
  expect(listed).toEqual([row]);
  listed.push({ ...row, id: tenant });
  expect(listed).toHaveLength(2);
  await expect(repository.getExampleRecord(id)).resolves.toEqual(row);
  await expect(repository.deleteExampleRecord(id)).resolves.toEqual(row);
  expect(query).toHaveBeenNthCalledWith(1, 'SELECT * FROM "ops"."example_record" WHERE "tenant_id" = $1', [tenant]);
  expect(query).toHaveBeenNthCalledWith(2, 'SELECT * FROM "ops"."example_record" WHERE "id" = $1 AND "tenant_id" = $2', [id, tenant]);
  expect(query).toHaveBeenNthCalledWith(3, 'DELETE FROM "ops"."example_record" WHERE "id" = $1 AND "tenant_id" = $2 RETURNING *', [id, tenant]);
  expect(tx).toHaveBeenCalledWith(expect.any(Function), { role: 'app' });
});

it.each([
  { count: 2147483648 }, { count: 1.5 }, { count: '2' }, { enabled: 1 },
  { id: 'not-a-uuid' }, { label: '😀'.repeat(81) }, { note: 17 },
])('rejects malformed populated generated rows: %j', async (invalid) => {
  const { repository, query } = executableRepository(await repositorySource(), [{ ...validRow, ...invalid }]);
  await expect(repository.listExampleRecord()).rejects.toBeInstanceOf(data.QueryRowValidationError);
  expect(query).toHaveBeenCalledTimes(1);
});

it('retains empty results and absent-context binding instead of inventing tenant state', async () => {
  const { repository, query } = executableRepository(await repositorySource(), [], {});
  await expect(repository.listExampleRecord()).resolves.toEqual([]);
  await expect(repository.getExampleRecord(id)).resolves.toBe(null);
  await expect(repository.deleteExampleRecord(id)).resolves.toBe(null);
  expect(query.mock.calls.map((call) => call[1])).toEqual([[undefined], [id, undefined], [id, undefined]]);
});

it('preserves deferred partial-write field omission and tenant-scoped update predicates', async () => {
  const { repository, query } = executableRepository(await repositorySource(), [validRow]);
  await repository.createExampleRecord({ label: 'partial' });
  await repository.updateExampleRecord(id, { enabled: false });
  expect(query).toHaveBeenNthCalledWith(1,
    'INSERT INTO "ops"."example_record" ("tenant_id", "label") VALUES ($1, $2) RETURNING *', [tenant, 'partial']);
  expect(query).toHaveBeenNthCalledWith(2,
    'UPDATE "ops"."example_record" SET "enabled" = $1 WHERE "id" = $2 AND "tenant_id" = $3 RETURNING *', [false, id, tenant]);
  await expect(repository.updateExampleRecord(id, {})).rejects.toThrow('Unsupported writable field');
  expect(query).toHaveBeenCalledTimes(2);
});

it('keeps timestamp-bearing entity output explicitly on its existing deferred path', async () => {
  const source = await repositorySource(true);
  expect(source).not.toContain('defineQuery');
  expect(source).not.toContain("from 'zod'");
  expect(source).toContain('created_at: string | null');
  expect(source.match(/trx\.query<ExampleRecordRecord>/gu)).toHaveLength(5);
  expect(source).not.toContain('trx.run(');
});
