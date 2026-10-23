import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
async function lint(source, relativePath, rule, extraSources = {}, packagePaths = {}) {
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
  options.paths = { pg: [pg.resolvedFileName], ...packagePaths };
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile.bind(host);
  const originalExists = host.fileExists.bind(host);
  const originalSource = host.getSourceFile.bind(host);
  host.readFile = (file) => sources.get(resolve(file)) ?? originalRead(file);
  host.fileExists = (file) => sources.has(resolve(file)) || originalExists(file);
  const originalDirectoryExists = host.directoryExists.bind(host);
  host.directoryExists = (directory) =>
    [...sources.keys()].some((file) => file.startsWith(`${resolve(directory)}/`)) ||
    originalDirectoryExists(directory);
  host.getSourceFile = (file, languageVersion, ...rest) =>
    sources.has(resolve(file))
      ? ts.createSourceFile(file, sources.get(resolve(file)), languageVersion, true)
      : originalSource(file, languageVersion, ...rest);
  const program = ts.createProgram([...sources.keys()], options, host);
  const checker = program.getTypeChecker();
  for (const file of sources.keys()) {
    if (file.endsWith('.d.ts')) continue;
    const parsed = program.getSourceFile(file);
    assert.ok(parsed, `virtual fixture must enter the TypeScript program: ${file}`);
    for (const statement of parsed.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
      const specifier = statement.moduleSpecifier.text;
      if (specifier === 'zod') continue; // Probe argument validity is deliberately outside this guard.
      const bindings = statement.importClause.namedBindings;
      const names =
        bindings && ts.isNamedImports(bindings)
          ? bindings.elements.map((element) => element.name)
          : bindings
            ? [bindings.name]
            : [];
      for (const name of names) {
        const symbol = checker.getSymbolAtLocation(name);
        const declaration =
          symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        assert.ok(
          declaration?.declarations?.length,
          `unresolved critical fixture import: ${specifier} / ${name.text}`,
        );
        assert.equal(
          checker.getTypeAtLocation(name).flags & ts.TypeFlags.Any,
          0,
          `critical fixture import must not silently become any: ${specifier} / ${name.text}`,
        );
      }
    }
  }
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
    const args =
      entry === 'executeLegacyArchive'
        ? '{} as never, "select", "select 1", [], (row: unknown) => row'
        : '{} as never, "select 1"';
    const source = `import { ${entry} as run } from ${JSON.stringify(executorPath)}; run(${args});`;
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

test('package imports retain raw-query provenance at the actual emitted declaration layout', async () => {
  const manifest = JSON.parse(readFileSync(join(workspace, 'packages/data/package.json'), 'utf8'));
  const entry = join('packages/data', manifest.exports['.'].types);
  assert.equal(entry, 'packages/data/dist/data/src/index.d.ts');
  // Emit the actual class declaration in memory, without a workspace build.
  // Resolve the public package name through its declared types export, exactly
  // where pnpm realpath resolution lands after a build.
  const declaration = ts.transpileDeclaration(readFileSync(transactionPath, 'utf8'), {
    fileName: transactionPath,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  assert.match(declaration, /export declare class Transaction/u);
  const findings = await lint(
    'import type { Transaction } from "@stynx-nyx/data"; declare const trx: Transaction; trx.query("select 1"); trx.execute({});',
    applicationPath,
    'no-raw-query',
    {
      [entry]: 'export { Transaction } from "./transaction.js";',
      'packages/data/dist/data/src/transaction.d.ts': declaration,
    },
    { '@stynx-nyx/data': [join(workspace, entry)] },
  );
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 2);
});

test('same-named unrelated emitted declarations remain unrelated', async () => {
  const unrelated = 'packages/health/dist/health/src/transaction.d.ts';
  assert.deepEqual(
    await lint(
      `import type { Transaction } from ${JSON.stringify(join(workspace, unrelated))}; declare const trx: Transaction; trx.query("search"); trx.execute();`,
      applicationPath,
      'no-raw-query',
      {
        [unrelated]:
          'export declare class Transaction { query(value: string): string; execute(): number; }',
      },
    ),
    [],
  );
});

for (const [name, expression] of [
  ['Pick Transaction', 'declare const trx: Pick<Transaction, "query">; trx.query("select 1");'],
  [
    'bound Transaction',
    'declare const trx: Transaction; const run = trx.query.bind(trx); run("select 1");',
  ],
]) {
  test(`workspace raw-query rule rejects ${name}`, async () => {
    const findings = await lint(imports + expression, applicationPath, 'no-raw-query');
    assert.ok(findings.some((finding) => finding.ruleId === 'stynx/no-raw-query'));
  });
}

test('query definitions follow namespace and indirect barrel imports', async () => {
  for (const source of [
    `import * as definitions from ${JSON.stringify(typedQueryPath)}; definitions.defineQuery({});`,
    'import { declareSql } from "./query-definitions.js"; declareSql({});',
  ]) {
    const findings = await lint(source, applicationPath, 'define-query-location', {
      'packages/health/src/query-definitions.ts': `export { defineQuery as declareSql } from ${JSON.stringify(typedQueryPath)};`,
    });
    assert.equal(
      findings.filter((finding) => finding.ruleId === 'stynx/define-query-location').length,
      1,
    );
  }
});

test('executor-looking local functions have no checked-executor provenance', async () => {
  assert.deepEqual(
    await lint(
      'function executeRawScript() { return 1; } function executeLegacyArchive() { return 2; } executeRawScript(); executeLegacyArchive();',
      applicationPath,
      'no-raw-query',
    ),
    [],
  );
});

for (const [name, modulePath] of [
  ['CheckedQueryClient', 'packages/data/src/checked-executor.ts'],
  ['StorageVerifierTransaction', 'packages/data/src/storage-contract.ts'],
  ['IdempotencySqlExecutor', 'packages/idempotency/src/types.ts'],
  ['IdempotencySqlExecutor', 'packages/backend/src/idempotency/types.ts'],
]) {
  test(`raw-query provenance includes the exact ${modulePath} port`, async () => {
    const source = `import type { ${name} as Port } from ${JSON.stringify(join(workspace, modulePath))}; declare const port: Port; port.query("select 1"); const alias = port; alias.query("select 2"); const { query: run } = port; run("select 3");`;
    const findings = await lint(source, applicationPath, 'no-raw-query');
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 3);
  });
}

test('structural port names alone do not classify unrelated query operations as PostgreSQL', async () => {
  for (const name of [
    'CheckedQueryClient',
    'StorageVerifierTransaction',
    'IdempotencySqlExecutor',
  ]) {
    assert.deepEqual(
      await lint(
        `interface ${name} { query(value: string): Promise<string>; } declare const port: ${name}; port.query("search");`,
        applicationPath,
        'no-raw-query',
      ),
      [],
    );
  }
});

for (const [label, expression] of [
  [
    'dynamic text',
    'declare const dynamicText: ReturnType<typeof literalSql>; declareSql({ text: dynamicText });',
  ],
  ['plain text bypass', 'declareSql({ text: "select 1" });'],
  [
    'computed text override',
    'const key = "text"; declareSql({ text: literalSql`select 1`, [key]: "dynamic" });',
  ],
  [
    'borrowed tag type',
    'const fake: typeof literalSql = (() => "dynamic") as typeof literalSql; declareSql({ text: fake`select 1` });',
  ],
  ['mutable tag alias', 'let tag = literalSql; declareSql({ text: tag`select 1` });'],
  [
    'dynamic options',
    'declare const options: Parameters<typeof declareSql>[0]; declareSql(options);',
  ],
  [
    'spread options',
    'declare const options: Parameters<typeof declareSql>[0]; declareSql({ ...options });',
  ],
  [
    'spread overriding explicit text',
    'declare const options: Parameters<typeof declareSql>[0]; declareSql({ text: literalSql`select 1`, ...options });',
  ],
  ['direct sql call', 'declare const strings: TemplateStringsArray; literalSql(strings);'],
  [
    'tag interpolation',
    'declare const value: string; declareSql({ text: literalSql`select ${value}` });',
  ],
  [
    'untrusted tag',
    'declare function untrusted(strings: TemplateStringsArray): string; declareSql({ text: untrusted`select 1` });',
  ],
]) {
  test(`repository query definitions reject ${label}`, async () => {
    const source = `import { defineQuery as declareSql, sql as literalSql } from ${JSON.stringify(typedQueryPath)}; ${expression}`;
    const findings = await lint(
      source,
      'packages/health/src/probe.repository.ts',
      'define-query-location',
    );
    assert.ok(
      findings.some(
        (finding) => finding.ruleId === 'stynx/define-query-location' && finding.severity === 2,
      ),
    );
  });
}

test('repository literal enforcement accepts trusted zero-hole namespace tags and unrelated local names', async () => {
  assert.deepEqual(
    await lint(
      `import * as definitions from ${JSON.stringify(typedQueryPath)}; definitions.defineQuery({ text: definitions.sql\`select 1\` });`,
      'packages/health/src/probe.repository.ts',
      'define-query-location',
    ),
    [],
  );
  assert.deepEqual(
    await lint(
      'function sql(value: string) { return value; } function defineQuery(value: string) { return value; } defineQuery(sql("search"));',
      'packages/health/src/probe.repository.ts',
      'define-query-location',
    ),
    [],
  );
});

test('repository literal enforcement follows immutable trusted tag aliases', async () => {
  assert.deepEqual(
    await lint(
      `import { defineQuery, sql } from ${JSON.stringify(typedQueryPath)}; const first = sql; const second = first; defineQuery({ text: second\`select 1\` });`,
      'packages/health/src/probe.repository.ts',
      'define-query-location',
    ),
    [],
  );
});

for (const caller of [
  'packages/idempotency/src/pg-idempotency.store.ts',
  'packages/backend/src/idempotency/pg-idempotency.store.ts',
]) {
  test(`configured operations bind exact IDs to ${caller}`, async () => {
    const prefix = `import * as executor from ${JSON.stringify(executorPath)};`;
    const args = '{} as never, "idempotency.lookup", {} as never, [] as never';
    const source = `${prefix} executor.executeConfiguredQuery(${args}); const alias = executor.executeConfiguredQuery; alias(${args}); const { executeConfiguredQuery: run } = executor; run(${args});`;
    assert.deepEqual(await lint(source, caller, 'no-raw-query'), []);
    const findings = await lint(source, applicationPath, 'no-raw-query');
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 3);
    for (const operation of ['"unknown.operation"', '"__proto__"', 'dynamic']) {
      const rejected = `${prefix} declare const dynamic: Parameters<typeof executor.executeConfiguredQuery>[1]; executor.executeConfiguredQuery({} as never, ${operation}, {} as never, [] as never);`;
      const errors = await lint(rejected, caller, 'no-raw-query');
      assert.equal(errors.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
    }
  });
}

test('configured operation entry follows indirect barrel imports', async () => {
  const source =
    'import { run } from "./configured-entry.js"; run({} as never, "idempotency.lookup", {} as never, [] as never);';
  const findings = await lint(source, applicationPath, 'no-raw-query', {
    'packages/health/src/configured-entry.ts': `export { executeConfiguredQuery as run } from ${JSON.stringify(executorPath)};`,
  });
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
});

for (const [path, admitted, rejected] of [
  [
    'reference/api/src/app.module.ts',
    'async function runReferenceApiMigrations() { await run({} as never, "select 1"); }',
    'async function ordinaryRequest() { await run({} as never, "select 1"); }',
  ],
  [
    'reference/api/src/performance/offline-storage.ts',
    'class OfflinePerformanceStorageInstaller { async onApplicationBootstrap() { await run({} as never, "select 1"); } }',
    'class OfflinePerformanceStorageInstaller { async requestHandler() { await run({} as never, "select 1"); } }',
  ],
]) {
  test(`reference script admission is bounded to its existing installer scope: ${path}`, async () => {
    const prefix = `import { executeRawScript as run } from ${JSON.stringify(executorPath)};`;
    assert.deepEqual(await lint(prefix + admitted, path, 'no-raw-query'), []);
    const findings = await lint(prefix + rejected, path, 'no-raw-query');
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
  });
}

for (const [path, operations] of [
  ['packages/data/src/query-helpers.ts', ['select']],
  ['packages/data/src/transaction.ts', ['hard-delete-live', 'hard-delete-archive']],
  [
    'packages/data/src/internal/archive-restore.ts',
    ['restore-insert', 'restore-delete-archive', 'restore-children'],
  ],
  [
    'packages/data/src/internal/archive-relations.ts',
    [
      'list-child-ids',
      'count-blocking-children',
      'sample-blocking-children',
      'load-archived-row',
      'live-parent-exists',
      'archived-parent-exists',
      'restore-conflict',
    ],
  ],
  ['packages/data/src/internal/soft-delete-cascade.ts', ['soft-delete-insert', 'soft-delete-live']],
]) {
  test(`archive bridge binds its established operation IDs to ${path}`, async () => {
    const prefix = `import { executeLegacyArchive as run } from ${JSON.stringify(executorPath)};`;
    const calls = operations
      .map((operation) => `run({} as never, ${JSON.stringify(operation)}, "select 1", []);`)
      .join('\n');
    assert.deepEqual(await lint(prefix + calls, path, 'no-raw-query'), []);
    const otherFamily = operations.includes('select') ? 'restore-insert' : 'select';
    const rejected = `${prefix} declare const dynamic: Parameters<typeof run>[1]; run({} as never, ${JSON.stringify(otherFamily)}, "select 1", []); run({} as never, dynamic, "select 1", []);`;
    const findings = await lint(rejected, path, 'no-raw-query');
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 2);
  });
}
