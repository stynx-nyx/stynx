import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import test from 'node:test';
import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { stynxPlugin } from '../plugin.mjs';

const workspace = resolve(import.meta.dirname, '../../..');
const transactionPath = join(workspace, 'packages/data/src/transaction.ts');
const typedQueryPath = join(workspace, 'packages/data/src/typed-query.ts');
const executorPath = join(workspace, 'packages/data/src/checked-executor.ts');
const imports = `import type { PoolClient, Client, Pool } from 'pg';\nimport type { Transaction } from ${JSON.stringify(transactionPath)};\n`;

// A real TypeScript checker sees actual pg and Transaction declarations. Virtual
// files exercise exact admitted paths without writing or modifying production.
async function lint(source, relativePath, rule, extraSources = {}) {
  assert.equal(typeof stynxPlugin.rules[rule]?.create, 'function', `missing stynx/${rule}`);
  const filename = join(workspace, relativePath);
  const sources = new Map([
    [filename, source],
    ...Object.entries(extraSources).map(([path, text]) => [join(workspace, path), text]),
  ]);
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    noEmit: true,
  };
  // The negative fixture deliberately lives in health, which has no pg
  // dependency. Resolve the real driver declarations from its actual consumer;
  // otherwise TypeScript would silently turn these receivers into `any`.
  const pg = ts.resolveModuleName('pg', transactionPath, options, ts.sys).resolvedModule;
  assert.ok(pg, 'the real data package must resolve PostgreSQL declarations');
  options.paths = { pg: [pg.resolvedFileName] };
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile.bind(host);
  const originalExists = host.fileExists.bind(host);
  const originalSource = host.getSourceFile.bind(host);
  host.readFile = (file) => sources.get(resolve(file)) ?? originalRead(file);
  host.fileExists = (file) => sources.has(resolve(file)) || originalExists(file);
  host.getSourceFile = (file, languageVersion, ...rest) =>
    sources.has(resolve(file))
      ? ts.createSourceFile(file, sources.get(resolve(file)), languageVersion, true)
      : originalSource(file, languageVersion, ...rest);
  const program = ts.createProgram([...sources.keys()], options, host);
  const eslint = new ESLint({
    cwd: workspace,
    overrideConfigFile: true,
    ignore: false,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser, parserOptions: { programs: [program] } },
        plugins: { stynx: stynxPlugin },
        rules: { [`stynx/${rule}`]: ['error', { rootDir: workspace }] },
      },
    ],
  });
  const [result] = await eslint.lintText(source, { filePath: filename });
  assert.deepEqual(
    result.messages.filter((message) => message.fatal),
    [],
    'expected semantic lint findings, not parser errors',
  );
  return result.messages;
}

const applicationPath = 'packages/health/src/typed-query-lint-probe.ts';
const rawCases = [
  ['pg PoolClient direct', 'declare const client: PoolClient; client.query("select 1");'],
  ['pg Client direct', 'declare const client: Client; client.query("select 1");'],
  ['pg Pool direct', 'declare const pool: Pool; pool.query("select 1");'],
  [
    'pg receiver alias',
    'declare const client: PoolClient; const first = client; const second = first; second.query("select 1");',
  ],
  [
    'pg destructured method alias',
    'declare const client: PoolClient; const { query: run } = client; run("select 1");',
  ],
  [
    'pg bound method',
    'declare const client: PoolClient; const run = client.query.bind(client); run("select 1");',
  ],
  ['pg computed member', 'declare const client: PoolClient; client["query"]("select 1");'],
  ['Transaction raw query', 'declare const trx: Transaction; trx.query("select 1");'],
  ['Transaction raw execute', 'declare const trx: Transaction; trx.execute({});'],
  [
    'Transaction destructured query',
    'declare const trx: Transaction; const { query: run } = trx; run("select 1");',
  ],
  [
    'Transaction receiver alias',
    'declare const trx: Transaction; const alias = trx; alias.execute({});',
  ],
];
for (const [name, source] of rawCases) {
  test(`workspace raw-query rule rejects ${name}`, async () => {
    const findings = await lint(imports + source, applicationPath, 'no-raw-query');
    assert.ok(
      findings.some((finding) => finding.ruleId === 'stynx/no-raw-query' && finding.severity === 2),
      name,
    );
  });
}

test('workspace raw-query rule follows indirect type imports', async () => {
  const source =
    'import type { IndirectTransaction, IndirectPg } from "./typed-query-barrel.js"; declare const transaction: IndirectTransaction; declare const client: IndirectPg; transaction.query("select 1"); client.query("select 2");';
  const findings = await lint(source, applicationPath, 'no-raw-query', {
    'packages/health/src/typed-query-barrel.ts': `export type { Transaction as IndirectTransaction } from ${JSON.stringify(transactionPath)}; export type { PoolClient as IndirectPg } from 'pg';`,
  });
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 2);
});

test('workspace raw-query rule permits unrelated query and execute methods', async () => {
  const source =
    'class Search { query(term: string) { return term; } execute() { return 42; } } const search = new Search(); search.query("hello"); search.execute(); const { query } = search; query("world");';
  assert.deepEqual(await lint(source, applicationPath, 'no-raw-query'), []);
});

test('only the single checked executor admits raw PostgreSQL calls', async () => {
  const source = imports + 'declare const client: PoolClient; client.query("select 1");';
  assert.deepEqual(await lint(source, 'packages/data/src/checked-executor.ts', 'no-raw-query'), []);
  for (const path of [
    'packages/data/src/other.ts',
    'packages/health/src/checked-executor.ts',
    'packages/data/src/internal/checked-executor.ts',
  ]) {
    const findings = await lint(source, path, 'no-raw-query');
    assert.ok(
      findings.some((finding) => finding.ruleId === 'stynx/no-raw-query'),
      path,
    );
  }
});

for (const [entry, admitted, rejected] of [
  [
    'executeRawScript',
    'packages/data/src/migration-runner.ts',
    'packages/data/src/ordinary-service.ts',
  ],
  [
    'executeLegacyArchive',
    'packages/data/src/query-helpers.ts',
    'packages/data/src/ordinary-service.ts',
  ],
]) {
  test(`${entry} admits its exact family and rejects aliased calls from ordinary application code`, async () => {
    const source = `import { ${entry} as run } from ${JSON.stringify(executorPath)}; run();`;
    assert.deepEqual(await lint(source, admitted, 'no-raw-query'), []);
    for (const path of [
      rejected,
      applicationPath,
      `packages/health/src/${admitted.split('/').at(-1)}`,
    ]) {
      const findings = await lint(source, path, 'no-raw-query');
      assert.ok(
        findings.some((finding) => finding.ruleId === 'stynx/no-raw-query'),
        path,
      );
    }
  });
}

const definition = `import { defineQuery as declareSql, sql } from ${JSON.stringify(typedQueryPath)}; import { z } from 'zod'; const statement = declareSql({ name: 'lint.probe', text: sql\`select 1 as count\`, params: z.tuple([]), row: z.object({ count: z.number() }), expects: 'one' });`;
for (const filename of ['probe.ts', 'probe.service.ts', 'probe.queries.ts']) {
  test(`query definitions reject ${filename} even through an import alias`, async () => {
    const findings = await lint(
      definition,
      `packages/health/src/${filename}`,
      'define-query-location',
    );
    assert.ok(
      findings.some(
        (finding) => finding.ruleId === 'stynx/define-query-location' && finding.severity === 2,
      ),
    );
  });
}

test('query definitions accept repository files and ignore unrelated local names', async () => {
  assert.deepEqual(
    await lint(definition, 'packages/health/src/probe.repository.ts', 'define-query-location'),
    [],
  );
  assert.deepEqual(
    await lint(
      'function defineQuery(value: string) { return value; } defineQuery("search");',
      applicationPath,
      'define-query-location',
    ),
    [],
  );
});
