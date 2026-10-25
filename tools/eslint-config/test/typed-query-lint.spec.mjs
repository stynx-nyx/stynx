import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { stynxPlugin } from '../plugin.mjs';
import { selectorProgram, certificateMetrics } from './fixtures/query-selector-program.mjs';

const workspace = resolve(import.meta.dirname, '../../..');
const transactionPath = join(workspace, 'packages/data/src/transaction.ts');
const typedQueryPath = join(workspace, 'packages/data/src/typed-query.ts');
const executorPath = join(workspace, 'packages/data/src/checked-executor.ts');
const auditPormOperations = Array.from({ length: 32 }, (_, mask) => `audit.read-porm.mask.${mask}`);
const imports = `import type { PoolClient, Client, Pool } from 'pg';\nimport type { Transaction } from ${JSON.stringify(transactionPath)};\n`;

test('audit32 configured operation census is exact in registry, caller and admissions', () => {
  const paths = [
    'packages/data/src/configured-query.repository.ts',
    'packages/audit/src/sql-adapter.ts',
    'tools/eslint-config/query-rules.mjs',
  ];
  for (const path of paths) {
    const operations = [...readFileSync(join(workspace, path), 'utf8').matchAll(/['"](audit\.read-porm\.mask\.\d+)['"]/g)].map((match) => match[1]);
    assert.deepEqual(operations, auditPormOperations, path);
  }
});

test('audit32 actual configured entries admit all direct, aliased and destructured exact IDs', async () => {
  const calls = auditPormOperations.map((operation) => {
    const args = `{} as never, ${JSON.stringify(operation)}, {} as never, [] as never`;
    return `executor.executeConfiguredQuery(${args}); alias(${args}); run(${args});`;
  }).join('\n');
  const source = `import * as executor from ${JSON.stringify(executorPath)}; const alias = executor.executeConfiguredQuery; const { executeConfiguredQuery: run } = executor; ${calls}`;
  assert.deepEqual(await lint(source, 'packages/audit/src/sql-adapter.ts', 'no-raw-query'), []);
});

test('audit32 wrong caller refuses every exact operation and callable spelling', async () => {
  const calls = auditPormOperations.map((operation) => {
    const args = `{} as never, ${JSON.stringify(operation)}, {} as never, [] as never`;
    return `executor.executeConfiguredQuery(${args}); alias(${args}); run(${args});`;
  }).join('\n');
  const source = `import * as executor from ${JSON.stringify(executorPath)}; const alias = executor.executeConfiguredQuery; const { executeConfiguredQuery: run } = executor; ${calls}`;
  const errors = await lint(source, 'packages/health/src/probe.ts', 'no-raw-query');
  assert.equal(errors.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 96);
});

test('audit32 invalid and dynamic operation values remain refused at the genuine caller', async () => {
  const source = `import { executeConfiguredQuery } from ${JSON.stringify(executorPath)};
    declare const dynamic: Parameters<typeof executeConfiguredQuery>[1];
    executeConfiguredQuery({} as never, dynamic, {} as never, [] as never);
    executeConfiguredQuery({} as never, 'audit.read-porm.mask.32', {} as never, [] as never);
    executeConfiguredQuery({} as never, 'audit.read-porm.mask.-1', {} as never, [] as never);
    executeConfiguredQuery({} as never, '__proto__', {} as never, [] as never);`;
  const errors = await lint(source, 'packages/audit/src/sql-adapter.ts', 'no-raw-query');
  assert.equal(errors.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 4);
});

test('audit32 barrel origins preserve exact caller ownership for all operation IDs', async () => {
  const calls = auditPormOperations.map((operation) => `run({} as never, ${JSON.stringify(operation)}, {} as never, [] as never);`).join('\n');
  const source = `import { run } from './audit-entry.js'; ${calls}`;
  const entry = `export { executeConfiguredQuery as run } from ${JSON.stringify(executorPath)};`;
  assert.deepEqual(await lint(source, 'packages/audit/src/sql-adapter.ts', 'no-raw-query', { 'packages/audit/src/audit-entry.ts': entry }), []);
  const errors = await lint(source, 'packages/health/src/probe.ts', 'no-raw-query', { 'packages/health/src/audit-entry.ts': entry });
  assert.equal(errors.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 32);
});

const auditRemainingOperations = ['log', 'events'].flatMap((family) =>
  Array.from({ length: 128 }, (_, mask) => `audit.read-${family}.mask.${mask}`),
);

test('audit512 configured census is exact in registry, caller and admissions', () => {
  for (const path of ['packages/data/src/configured-query.repository.ts', 'packages/audit/src/sql-adapter.ts', 'tools/eslint-config/query-rules.mjs']) {
    const operations = [...readFileSync(join(workspace, path), 'utf8').matchAll(/['"](audit\.read-(?:log|events)\.mask\.\d+)['"]/g)].map((match) => match[1]);
    assert.deepEqual(operations, auditRemainingOperations, path);
  }
});

test('audit512 actual configured entries admit all direct aliased and destructured IDs', async () => {
  const calls = auditRemainingOperations.map((operation) => {
    const args = `{} as never, ${JSON.stringify(operation)}, {} as never, [] as never`;
    return `executor.executeConfiguredQuery(${args}); alias(${args}); run(${args});`;
  }).join('\n');
  const source = `import * as executor from ${JSON.stringify(executorPath)}; const alias = executor.executeConfiguredQuery; const { executeConfiguredQuery: run } = executor; ${calls}`;
  assert.deepEqual(await lint(source, 'packages/audit/src/sql-adapter.ts', 'no-raw-query'), []);
});

test('audit512 wrong caller refuses every operation and callable spelling', async () => {
  const calls = auditRemainingOperations.map((operation) => {
    const args = `{} as never, ${JSON.stringify(operation)}, {} as never, [] as never`;
    return `executor.executeConfiguredQuery(${args}); alias(${args}); run(${args});`;
  }).join('\n');
  const source = `import * as executor from ${JSON.stringify(executorPath)}; const alias = executor.executeConfiguredQuery; const { executeConfiguredQuery: run } = executor; ${calls}`;
  const errors = await lint(source, 'packages/health/src/probe.ts', 'no-raw-query');
  assert.equal(errors.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 768);
});

test('audit512 invalid and dynamic values remain refused at the genuine caller', async () => {
  const source = `import { executeConfiguredQuery } from ${JSON.stringify(executorPath)};
    declare const dynamic: Parameters<typeof executeConfiguredQuery>[1];
    executeConfiguredQuery({} as never, dynamic, {} as never, [] as never);
    executeConfiguredQuery({} as never, 'audit.read-log.mask.128', {} as never, [] as never);
    executeConfiguredQuery({} as never, 'audit.read-events.mask.-1', {} as never, [] as never);
    executeConfiguredQuery({} as never, '__proto__', {} as never, [] as never);`;
  const errors = await lint(source, 'packages/audit/src/sql-adapter.ts', 'no-raw-query');
  assert.equal(errors.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 4);
});

test('audit512 service has exactly 256 eager zero-hole definitions and direct selector calls', () => {
  const path = 'packages/audit/src/audit-log-read.repository.ts';
  const source = readFileSync(join(workspace, path), 'utf8');
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const definitions = [];
  for (const statement of parsed.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    assert.ok(statement.declarationList.flags & ts.NodeFlags.Const);
    for (const declaration of statement.declarationList.declarations) {
      const call = declaration.initializer;
      if (!call || !ts.isCallExpression(call) || call.expression.getText(parsed) !== 'defineQuery') continue;
      assert.equal(call.arguments.length, 1);
      const properties = call.arguments[0].properties;
      const name = properties.find((property) => property.name?.getText(parsed) === 'name').initializer;
      const text = properties.find((property) => property.name?.getText(parsed) === 'text').initializer;
      assert.ok(ts.isStringLiteral(name));
      assert.ok(ts.isTaggedTemplateExpression(text));
      assert.equal(text.tag.getText(parsed), 'sql');
      assert.ok(ts.isNoSubstitutionTemplateLiteral(text.template));
      definitions.push(name.text);
    }
  }
  assert.deepEqual(definitions, Array.from({ length: 256 }, (_, mask) => `audit.listLog.mask.${mask}`));
  const calls = [...readFileSync(join(workspace, 'packages/audit/src/audit.service.ts'), 'utf8').matchAll(/trx\.run\(auditLogReads\.auditLogRead(\d+),/g)].map((match) => Number(match[1]));
  assert.deepEqual(calls, Array.from({ length: 256 }, (_, mask) => mask));
});

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
        const typeOnly = statement.importClause.isTypeOnly ||
          (ts.isImportSpecifier(name.parent) && name.parent.isTypeOnly);
        const importedType = typeOnly
          ? checker.getDeclaredTypeOfSymbol(declaration)
          : checker.getTypeAtLocation(name);
        assert.equal(
          importedType.flags & ts.TypeFlags.Any,
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
  ['ContextualQueryExecutor', 'packages/data/src/checked-executor.ts'],
  ['ConfiguredSqlExecutor', 'packages/data/src/checked-executor.ts'],
  ['StorageVerifierTransaction', 'packages/data/src/storage-contract.ts'],
  ['IdempotencySqlExecutor', 'packages/idempotency/src/types.ts'],
  ['IdempotencySqlExecutor', 'packages/backend/src/idempotency/types.ts'],
]) {
  test(`raw-query provenance includes the exact ${modulePath} ${name} port`, async () => {
    const source = `import type { ${name} as Port } from ${JSON.stringify(join(workspace, modulePath))}; declare const port: Port; port.query("select 1"); const alias = port; alias.query("select 2"); const { query: run } = port; run("select 3");`;
    const findings = await lint(source, applicationPath, 'no-raw-query');
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 3);
  });
}

test('structural port names alone do not classify unrelated query operations as PostgreSQL', async () => {
  for (const name of [
    'CheckedQueryClient',
    'ContextualQueryExecutor',
    'ConfiguredSqlExecutor',
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

test('testing count operations remain confined to the actual matcher caller', async () => {
  const prefix = `import { executeConfiguredQuery as run } from ${JSON.stringify(executorPath)};`;
  const calls = ['testing.archive-count', 'testing.live-count'].map((operation) =>
    `run({} as never, ${JSON.stringify(operation)}, { schema: 'sample', table: 'entry' }, ['11111111-1111-1111-1111-111111111111']);`).join('\n');
  assert.deepEqual(await lint(prefix + calls, 'packages/testing/src/matchers.ts', 'no-raw-query'), []);
  for (const path of [applicationPath, 'packages/idempotency/src/pg-idempotency.store.ts', 'packages/testing/src/ordinary.ts']) {
    const findings = await lint(prefix + calls, path, 'no-raw-query');
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 2);
  }
  const denied = `${prefix} declare const operation: Parameters<typeof run>[1]; run({} as never, operation, {} as never, [] as never); run({} as never, 'idempotency.lookup', {} as never, [] as never);`;
  const findings = await lint(denied, 'packages/testing/src/matchers.ts', 'no-raw-query');
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 2);
});

for (const [caller, operation] of [
  ['packages/offline-sync/src/storage.ts', 'catalog.foreign-key-orphans'],
  ['packages/outbox/src/storage.ts', 'catalog.foreign-key-orphans'],
  ['packages/offline-sync/src/import-state.ts', 'offline.import-tenant-present'],
  ['packages/offline-sync/src/import-preflight.ts', 'offline.import-foreign-key-orphans'],
]) {
  test(`configured storage operation ${operation} is bound to ${caller}`, async () => {
    const prefix = `import * as executor from ${JSON.stringify(executorPath)}; const { executeConfiguredQuery: run } = executor;`;
    const call = `run({} as never, ${JSON.stringify(operation)}, {} as never, [] as never);`;
    assert.deepEqual(await lint(prefix + call, caller, 'no-raw-query'), []);
    const foreign = await lint(prefix + call, applicationPath, 'no-raw-query');
    assert.equal(foreign.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
    const invalid = `${prefix} declare const dynamic: Parameters<typeof run>[1]; run({} as never, dynamic, {} as never, [] as never); run({} as never, 'idempotency.lookup', {} as never, [] as never);`;
    const findings = await lint(invalid, caller, 'no-raw-query');
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 2);
  });
}

test('context binding does not grant callers permission to execute raw SQL', async () => {
  const source = `import { bindQueryContext, type ContextualQueryExecutor } from ${JSON.stringify(executorPath)}; declare const original: ContextualQueryExecutor; const bound = bindQueryContext(original, { tenantId: 'tenant' }); bound.query('select 1'); const alias = bound; alias.query('select 2'); const { query: run } = bound; run('select 3');`;
  const findings = await lint(source, applicationPath, 'no-raw-query');
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 3);
});

test('scoped query adapters retain raw-call provenance for ordinary callers', async () => {
  const source = `import { createScopedQueryExecutor, type CheckedQueryScope } from ${JSON.stringify(executorPath)}; declare const scope: CheckedQueryScope; const executor = createScopedQueryExecutor(scope); executor.query('select 1'); const { query: run } = executor; run('select 2');`;
  const findings = await lint(source, applicationPath, 'no-raw-query');
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 2);
});

// Static-definition provenance is separate from the raw-receiver gate. These
// fixtures use real definition/executor symbols; annotations alone prove nothing.
const provenanceRepositoryPath = 'packages/health/src/provenance.repository.ts';
const provenanceRepository = `
import { defineQuery, sql } from ${JSON.stringify(typedQueryPath)};
import { z } from 'zod';
export const safe = defineQuery({ name: 'probe.safe', text: sql\`select 1 as id\`, params: z.tuple([]), row: z.object({ id: z.number() }), expects: 'many' });
export const alternate = defineQuery({ name: 'probe.alternate', text: sql\`select 2 as id\`, params: z.tuple([]), row: z.object({ id: z.number() }), expects: 'many' });
export const command = defineQuery({ name: 'probe.command', text: sql\`delete from sample.record\`, params: z.tuple([]), row: z.object({}), expects: 'none' });
`;
const provenanceImports = `
import { executeTypedQuery, executeTypedQueryResult, executeTypedCommand, executeGuardedQueryRows } from ${JSON.stringify(executorPath)};
import type { Transaction } from ${JSON.stringify(transactionPath)};
import { safe, alternate, command } from './provenance.repository.js';
declare const client: never; declare const trx: Transaction; declare const condition: boolean;
const guard = (value: unknown): value is { id: number } => typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'number';
`;
const provenanceSources = { [provenanceRepositoryPath]: provenanceRepository };
const entryCalls = [
  ['executeTypedQuery', (query) => `executeTypedQuery(client, ${query}, []);`],
  ['executeTypedQueryResult', (query) => `executeTypedQueryResult(client, ${query}, []);`],
  ['executeTypedCommand', (query) => `executeTypedCommand(client, ${query}, []);`],
  ['executeGuardedQueryRows', (query) => `executeGuardedQueryRows(client, ${query}, [], guard);`],
  ['Transaction.run', (query) => `trx.run(${query}, []);`],
  ['Transaction.runGuarded', (query) => `trx.runGuarded(${query}, [], guard);`],
];

for (const [name, call] of entryCalls) {
  test(`typed query provenance admits an actual repository leaf at ${name}`, async () => {
    assert.deepEqual(await lint(provenanceImports + call(name === 'executeTypedCommand' ? 'command' : 'safe'), applicationPath, 'no-raw-query', provenanceSources), []);
  });
  test(`typed query provenance rejects a forged structural definition at ${name}`, async () => {
    const source = provenanceImports + 'const forged = { ...safe, text: "select unreviewed" };' + call('forged');
    const findings = await lint(source, applicationPath, 'no-raw-query', provenanceSources);
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
  });
}

for (const [label, setup, expression, extra] of [
  ['immutable local alias', 'const first = safe; const second = first;', 'second', {}],
  ['finite conditional', '', 'condition ? safe : alternate', {}],
  ['namespace import', 'import * as definitions from "./provenance.repository.js";', 'definitions.safe', {}],
  ['namespace destructuring', 'import * as definitions from "./provenance.repository.js"; const { safe: selected } = definitions;', 'selected', {}],
  ['actual re-export barrel', 'import { selected } from "./provenance-barrel.js";', 'selected', { 'packages/health/src/provenance-barrel.ts': 'export { safe as selected } from "./provenance.repository.js";' }],
]) {
  test(`typed query provenance follows ${label}`, async () => {
    assert.deepEqual(await lint(provenanceImports + setup + `trx.run(${expression}, []);`, applicationPath, 'no-raw-query', { ...provenanceSources, ...extra }), []);
  });
}

for (const [label, setup, expression] of [
  ['borrowed query type', 'declare const forged: typeof safe;', 'forged'],
  ['asserted query type', 'const forged = { text: "select runtime" } as typeof safe;', 'forged'],
  ['constant assertion', 'const forged = { ...safe, text: "select runtime" } as const;', 'forged'],
  ['mutable alias', 'let selected = safe; selected = alternate;', 'selected'],
  ['dynamic factory', 'declare function produce(): typeof safe;', 'produce()'],
  ['parameter claim', 'declare const supplied: typeof safe;', 'supplied'],
  ['forged conditional branch', 'declare const supplied: typeof safe;', 'condition ? safe : supplied'],
  ['cyclic aliases', 'const first = second; const second = first;', 'first'],
  ['getter projection', 'const definitions = { get selected() { return safe; } };', 'definitions.selected'],
  ['spread override', 'const definitions = { ...safe, text: "select runtime" };', 'definitions'],
  ['array mutation', 'const definitions = [safe]; const alias = definitions; alias.splice(0, 1, alternate);', 'definitions[0]'],
  ['map mutation', 'const definitions = new Map([[0, safe]]); const alias = definitions; alias.set(0, alternate);', 'definitions.get(0)'],
  ['map delete', 'const definitions = new Map([[0, safe]]); definitions.delete(0);', 'definitions.get(0)'],
  ['map clear', 'const definitions = new Map([[0, safe]]); definitions.clear();', 'definitions.get(0)'],
  ['computed assignment', 'const definitions = { selected: safe }; const key = "selected"; definitions[key] = alternate;', 'definitions.selected'],
  ['defineProperty write', 'const definitions = { selected: safe }; Object.defineProperty(definitions, "selected", { value: alternate });', 'definitions.selected'],
  ['Object.assign write', 'const definitions = { selected: safe }; Object.assign(definitions, { selected: alternate });', 'definitions.selected'],
  ['unknown-call escape', 'const definitions = { selected: safe }; declare function escape(value: unknown): void; escape(definitions);', 'definitions.selected'],
  ['closure escape', 'const definitions = { selected: safe }; declare function save(fn: () => unknown): void; save(() => definitions);', 'definitions.selected'],
  ['shadowed Map constructor', 'const Map = class { constructor(_entries: unknown) {} get(_key: number) { return safe; } }; const definitions = new Map([[0, safe]]);', 'definitions.get(0)'],
  ['readonly annotation', 'declare const definitions: ReadonlyMap<number, typeof safe>;', 'definitions.get(0)'],
]) {
  test(`typed query provenance rejects ${label}`, async () => {
    const findings = await lint(provenanceImports + setup + `trx.run(${expression}, []);`, applicationPath, 'no-raw-query', provenanceSources);
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
  });
}

for (const [label, source] of [
  ['borrowed callable typeof', 'declare const borrowed: typeof executeTypedQuery; borrowed(client, safe, []);'],
  ['asserted callable typeof', 'const borrowed = ((...args: unknown[]) => args) as typeof executeTypedQuery; borrowed(client, safe, []);'],
  ['call receiver offset', 'executeTypedQuery.call(undefined, client, safe, []);'],
  ['apply dynamic argument array', 'declare const args: Parameters<typeof executeTypedQuery>; executeTypedQuery.apply(undefined, args);'],
  ['bind partial arguments', 'const run = executeTypedQuery.bind(undefined, client); run(safe, []);'],
  ['spread argument array', 'declare const args: Parameters<typeof executeTypedQuery>; executeTypedQuery(...args);'],
]) {
  test(`typed query provenance refuses unproved invocation ${label}`, async () => {
    const findings = await lint(provenanceImports + source, applicationPath, 'no-raw-query', provenanceSources);
    assert.ok(findings.some((finding) => finding.ruleId === 'stynx/no-raw-query'), label);
  });
}

for (const [label, setup, call] of [
  ['direct alias', 'const run = executeTypedQuery;', 'run(client, safe, []);'],
  ['executor namespace destructuring', `import * as executor from ${JSON.stringify(executorPath)}; const { executeTypedQuery: run } = executor;`, 'run(client, safe, []);'],
  ['transaction method destructuring', 'const { run } = trx;', 'run(safe, []);'],
]) {
  test(`typed query provenance preserves genuine ${label}`, async () => {
    assert.deepEqual(await lint(provenanceImports + setup + call, applicationPath, 'no-raw-query', provenanceSources), []);
  });
}

test('typed query provenance refuses emitted declarations whose actual source initializer is unavailable', async () => {
  const sources = {
    ...provenanceSources,
    'packages/health/dist/unavailable.repository.d.ts': `import type { TypedQuery } from ${JSON.stringify(typedQueryPath)}; export declare const selected: TypedQuery;`,
  };
  const source = provenanceImports + 'import { selected } from "../dist/unavailable.repository.js"; trx.run(selected, []);';
  const findings = await lint(source, applicationPath, 'no-raw-query', sources);
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
});

test('provenance exhaustion cannot poison a later direct use of the same trusted leaf', async () => {
  const aliases = Array.from({ length: 80 }, (_, i) => `const alias${i} = ${i === 0 ? 'safe' : `alias${i - 1}`};`).join('\n');
  const source = provenanceImports + aliases + '\ntrx.run(alias79, []);\ntrx.run(safe, []);';
  const findings = await lint(source, applicationPath, 'no-raw-query', provenanceSources);
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
  assert.equal(findings[0].line, source.split('\n').length - 1);
});

// These five real selector families are acceptance obligations, not exemptions
// or skipped cases. The initial fail-closed implementation deliberately cannot
// yet prove them. Keep their positive expectations visible until source proof or
// a semantics-preserving finite-selector refactor satisfies the contract.
for (const [family, repositoryExtra, application] of [
  ['Flow analytics finite switch selector', 'export const definitions = (mask: number) => { switch (mask) { case 0: return safe; case 1: return alternate; default: throw new Error("Unknown Flow analytics filter mask"); } };', 'trx.run(definitions(condition ? 0 : 1), []);'],
  ['Flow node bounded composition', 'const chunk0 = (mask: number) => { switch(mask) { case 0: return safe; default: throw new Error("missing"); } }; const chunk1 = (mask: number) => { switch(mask) { case 1: return alternate; default: throw new Error("missing"); } }; export const definitions = (mask: number) => { if(mask < 1) return chunk0(mask); if(mask < 2) return chunk1(mask); throw new Error("missing"); };', 'trx.run(definitions(1), []);'],
  ['Worklist finite switch selector', 'export const definitions = (mask: number) => { switch (mask) { case 0: return safe; case 1: return alternate; default: throw new TypeError("Unknown worklist query mask"); } };', 'trx.run(definitions(0), []);'],
  ['storage catalog for-of destructuring', 'export const definitions = Object.freeze([Object.freeze({ kind: "first", query: safe }), Object.freeze({ kind: "second", query: alternate })]);', 'for (const { kind, query } of definitions) { void kind; trx.run(query, []); }'],
  ['offline import mixed metadata projections', 'export const definitions = Object.freeze({ item: Object.freeze({ table: "item", existing: safe, insert: alternate }) });', 'const operation = definitions.item; trx.run(operation.existing, []); trx.run(operation.insert, []);'],
]) {
  test(`typed query provenance must support the reviewed ${family} family`, async () => {
    const source = provenanceImports + 'import { definitions } from "./provenance.repository.js";' + application;
    assert.deepEqual(await lint(source, applicationPath, 'no-raw-query', { [provenanceRepositoryPath]: provenanceRepository + repositoryExtra }), []);
  });
}

for (const order of ['trusted-first', 'untrusted-first']) {
  test(`selector proof cache distinguishes argument environments: ${order}`, async () => {
    const source = provenanceImports + 'declare const forged: typeof safe; function selected<Q>(query: Q): Q { return query; }\n' +
      (order === 'trusted-first' ? 'trx.run(selected(safe), []);\ntrx.run(selected(forged), []);' : 'trx.run(selected(forged), []);\ntrx.run(selected(safe), []);');
    const findings = await lint(source, applicationPath, 'no-raw-query', provenanceSources);
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1, JSON.stringify(findings));
    assert.equal(findings[0].line, source.split('\n').length - (order === 'trusted-first' ? 0 : 1));
  });
}

for (const [label, setup, expression] of [
  ['generic declaration', 'function selected<Q>(query: Q): Q { return query; }', 'selected(safe)'],
  ['const arrow', 'const selected = <Q>(query: Q): Q => query;', 'selected(safe)'],
  ['const function expression', 'const selected = function<Q>(query: Q): Q { return query; };', 'selected(safe)'],
  ['immutable alias chain', 'function selected<Q>(query: Q): Q { return query; } const first = selected; const second = first;', 'second(safe)'],
  ['parenthesized argument', 'function selected<Q>(query: Q): Q { return (query); }', 'selected((safe))'],
]) {
  test(`local identity forwarder admits ${label}`, async () => {
    assert.deepEqual(await lint(provenanceImports + setup + `trx.run(${expression}, []);`, applicationPath, 'no-raw-query', provenanceSources), []);
  });
}

for (const [label, setup, expression] of [
  ['forged actual argument', 'function selected<Q>(query: Q): Q { return query; } declare const forged: typeof safe;', 'selected(forged)'],
  ['mutable arrow binding', 'let selected = <Q>(query: Q): Q => query;', 'selected(safe)'],
  ['declaration reassignment before call', 'function selected<Q>(query: Q): Q { return query; } selected = <Q>(query: Q): Q => query;', 'selected(safe)'],
  ['alias created before declaration reassignment', 'function selected<Q>(query: Q): Q { return query; } const alias = selected; selected = <Q>(query: Q): Q => query;', 'alias(safe)'],
  ['unknown-call escape', 'function selected<Q>(query: Q): Q { return query; } declare function retain(value: unknown): void; retain(selected);', 'selected(safe)'],
  ['shorthand object escape', 'function selected<Q>(query: Q): Q { return query; } const stored = { selected };', 'selected(safe)'],
  ['exported declaration', 'export function selected<Q>(query: Q): Q { return query; }', 'selected(safe)'],
  ['exported alias', 'function selected<Q>(query: Q): Q { return query; } const alias = selected; export { alias };', 'selected(safe)'],
  ['destructuring write target', 'function selected<Q>(query: Q): Q { return query; } [selected] = [selected];', 'selected(safe)'],
  ['for-of write target', 'function selected<Q>(query: Q): Q { return query; } for (selected of [selected]) {}', 'selected(safe)'],
  ['extra statement', 'function selected<Q>(query: Q): Q { void 0; return query; }', 'selected(safe)'],
  ['parameter reassignment', 'function selected<Q>(query: Q): Q { query = query; return query; }', 'selected(safe)'],
  ['default parameter', 'function selected(query = safe) { return query; }', 'selected(safe)'],
  ['rest parameter', 'function selected(...query: unknown[]) { return query; }', 'selected(safe)'],
  ['async function', 'async function selected<Q>(query: Q): Promise<Q> { return query; }', 'selected(safe)'],
  ['extra actual argument', 'function selected<Q>(query: Q): Q { return query; }', 'selected(safe, alternate)'],
  ['spread actual argument', 'function selected<Q>(query: Q): Q { return query; }', 'selected(...[safe])'],
]) {
  test(`local identity forwarder rejects ${label}`, async () => {
    const findings = await lint(provenanceImports + setup + `trx.run(${expression}, []);`, applicationPath, 'no-raw-query', provenanceSources);
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1, JSON.stringify(findings));
  });
}

test('local identity forwarder closure rejects a later alias escape before trusting an earlier call', async () => {
  const source = provenanceImports + 'function selected<Q>(query: Q): Q { return query; } const alias = selected;\ntrx.run(alias(safe), []);\ndeclare function retain(value: unknown): void; retain(alias);';
  const findings = await lint(source, applicationPath, 'no-raw-query', provenanceSources);
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1, JSON.stringify(findings));
  assert.equal(findings[0].line, source.split('\n').length - 1);
});

for (const method of ['run', 'runGuarded']) {
  test(`only exact Transaction.${method} may forward its query parameter internally`, async () => {
    const entry = method === 'run' ? 'executeTypedQuery' : 'executeGuardedQueryRows';
    const source = `import { ${entry} } from ${JSON.stringify(executorPath)}; import type { TypedQuery } from ${JSON.stringify(typedQueryPath)}; export class Transaction { private client: never; private ensureActive() {} ${method}(query: TypedQuery, params: never${method === 'runGuarded' ? ', guard: never' : ''}) { this.ensureActive(); return ${entry}(this.client, query, params${method === 'runGuarded' ? ', guard' : ''}); } }`;
    assert.deepEqual(await lint(source, 'packages/data/src/transaction.ts', 'no-raw-query'), []);
    for (const path of [applicationPath, 'packages/data/src/transaction-copy.ts']) {
      const findings = await lint(source, path, 'no-raw-query');
      assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
    }
    const reassigned = source.replace(`return ${entry}`, `query = { ...query, text: "select runtime" }; return ${entry}`);
    const findings = await lint(reassigned, 'packages/data/src/transaction.ts', 'no-raw-query');
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
  });
}

for (const [label, repositoryExtra, setup, expression] of [
  ['prototype key', 'export const definitions = Object.freeze({ selected: safe });', '', 'definitions["toString"]'],
  ['unknown literal key', 'export const definitions = Object.freeze({ selected: safe });', '', 'definitions["missing"]'],
  ['shallow-only freeze', 'export const definitions = Object.freeze({ selected: { query: safe } });', 'definitions.selected.query = alternate;', 'definitions.selected.query'],
  ['shadowed freeze', 'const Object = { freeze: <T>(value: T): T => value }; export const definitions = Object.freeze({ selected: safe });', '', 'definitions.selected'],
  ['borrowed freeze type', 'declare const freeze: typeof Object.freeze; export const definitions = freeze({ selected: safe });', '', 'definitions.selected'],
  ['frozen getter', 'export const definitions = Object.freeze({ get selected() { return safe; } });', '', 'definitions.selected'],
  ['frozen Map', 'export const definitions = Object.freeze(new Map([[0, safe]]));', 'definitions.set(0, alternate);', 'definitions.get(0)'],
  ['bare hasOwn coercive object', 'export const definitions = Object.freeze({ selected: safe });', 'let calls = 0; const key = { [Symbol.toPrimitive]() { return calls++ === 0 ? "selected" : "toString"; } }; if (!Object.hasOwn(definitions, key)) throw new Error("missing");', 'definitions[key]'],
  ['bare hasOwn asserted string', 'export const definitions = Object.freeze({ selected: safe });', 'const key = ({ [Symbol.toPrimitive]() { return "selected"; } } as unknown as string); if (!Object.hasOwn(definitions, key)) throw new Error("missing");', 'definitions[key]'],
  ['bare annotation without runtime guard', 'export const definitions = Object.freeze({ selected: safe });', 'declare const key: "selected";', 'definitions[key]'],
]) {
  test(`frozen query container proof rejects ${label}`, async () => {
    const source = provenanceImports + 'import { definitions } from "./provenance.repository.js";' + setup + `trx.run(${expression}, []);`;
    const findings = await lint(source, applicationPath, 'no-raw-query', { [provenanceRepositoryPath]: provenanceRepository + repositoryExtra });
    assert.ok(findings.some((finding) => finding.ruleId === 'stynx/no-raw-query'), label);
  });
}

test('frozen query object accepts a captured string only after runtime string and own-key admission', async () => {
  const repository = provenanceRepository + 'export const definitions = Object.freeze({ selected: safe, alternate });';
  const source = provenanceImports + 'import { definitions } from "./provenance.repository.js"; declare function input(): unknown; const key = input(); if (typeof key !== "string" || !Object.hasOwn(definitions, key)) throw new Error("missing"); trx.run(definitions[key], []);';
  assert.deepEqual(await lint(source, applicationPath, 'no-raw-query', { [provenanceRepositoryPath]: repository }), []);
});

test('exported container mutation through another importer cannot retain a trusted query proof', async () => {
  const repository = provenanceRepository + 'export const definitions = { selected: safe };';
  const sources = {
    [provenanceRepositoryPath]: repository,
    'packages/health/src/provenance-mutator.ts': 'import { definitions } from "./provenance.repository.js"; definitions.selected = { ...definitions.selected, text: "select runtime" };',
  };
  const source = provenanceImports + 'import "./provenance-mutator.js"; import { definitions } from "./provenance.repository.js"; trx.run(definitions.selected, []);';
  const findings = await lint(source, applicationPath, 'no-raw-query', sources);
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
});

test('an unrelated method named runGuarded is not a SQL receiver', async () => {
  assert.deepEqual(await lint('class Search { runGuarded(value: string) { return value; } } new Search().runGuarded("plain text");', applicationPath, 'no-raw-query'), []);
});

for (const [label, definition] of [
  ['mutable function binding', 'export let select = (mask: number) => { switch(mask) { case 0: return safe; default: throw new TypeError("unknown"); } };'],
  ['fallthrough case', 'export const select = (mask: number) => { switch(mask) { case 0: case 1: return safe; default: throw new TypeError("unknown"); } };'],
  ['side-effect statement', 'export const select = (mask: number) => { console.log(mask); switch(mask) { case 0: return safe; default: throw new TypeError("unknown"); } };'],
  ['duplicate case', 'export const select = (mask: number) => { switch(mask) { case 0: return safe; case 0: return alternate; default: throw new TypeError("unknown"); } };'],
  ['computed case', 'export const select = (mask: number) => { switch(mask) { case 1 - 1: return safe; default: throw new TypeError("unknown"); } };'],
  ['default value return', 'export const select = (mask: number) => { switch(mask) { case 0: return safe; default: return alternate; } };'],
  ['async selector', 'export const select = async (mask: number) => { switch(mask) { case 0: return safe; default: throw new TypeError("unknown"); } };'],
  ['default parameter', 'export const select = (mask: number = 0) => { switch(mask) { case 0: return safe; default: throw new TypeError("unknown"); } };'],
  ['rest parameter', 'export const select = (...mask: number[]) => { switch(mask[0]) { case 0: return safe; default: throw new TypeError("unknown"); } };'],
  ['forged return branch', 'export const select = (mask: number) => { switch(mask) { case 0: return { ...safe, text: "select runtime" }; default: throw new TypeError("unknown"); } };'],
  ['unproved original Map selector', 'export const definitions = new Map([[0, safe]]); export const select = (mask: number) => { const query = definitions.get(mask); if (!query) throw new TypeError("unknown"); return query; };'],
]) {
  test(`finite switch query selector refuses ${label}`, async () => {
    const source = provenanceImports + 'import { select } from "./provenance.repository.js"; trx.run(select(0), []);';
    const findings = await lint(source, applicationPath, 'no-raw-query', { [provenanceRepositoryPath]: provenanceRepository + definition });
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
  });
}

test('unrelated legitimate reflection does not invalidate an actual static query definition', async () => {
  const source = provenanceImports + 'const payload = { tag: "opaque" }; const prototype = Object.getPrototypeOf(payload); const keys = Reflect.ownKeys(payload); void prototype; void keys; trx.run(safe, []);';
  assert.deepEqual(await lint(source, applicationPath, 'no-raw-query', provenanceSources), []);
});


// Built-in reflective invocation must not erase the actual SQL callable origin.
// These cases are authored before the narrow reflective-call implementation;
// execution remains deferred while the S7 signed RC owns the host window.
for (const [label, setup, invocation] of [
  ['typed rows', '', 'Reflect.apply(executeTypedQuery, undefined, [client, forged, []]);'],
  ['typed result metadata', '', 'Reflect.apply(executeTypedQueryResult, undefined, [client, forged, []]);'],
  ['typed command', '', 'Reflect.apply(executeTypedCommand, undefined, [client, forged, []]);'],
  ['guarded original rows', '', 'Reflect.apply(executeGuardedQueryRows, undefined, [client, forged, [], guard]);'],
  ['Transaction.run', '', 'Reflect.apply(trx.run, trx, [forged, []]);'],
  ['Transaction.runGuarded', '', 'Reflect.apply(trx.runGuarded, trx, [forged, [], guard]);'],
  ['raw PostgreSQL query', 'import type { PoolClient } from "pg"; declare const pgClient: PoolClient;', 'Reflect.apply(pgClient.query, pgClient, ["select runtime"]);'],
  ['raw Transaction query', '', 'Reflect.apply(trx.query, trx, ["select runtime"]);'],
  ['immutable built-in apply alias', 'const invoke = Reflect.apply;', 'invoke(executeTypedQuery, undefined, [client, forged, []]);'],
  ['destructured built-in apply alias', 'const { apply: invoke } = Reflect;', 'invoke(trx.runGuarded, trx, [forged, [], guard]);'],
  ['aliased SQL callable', 'const execute = executeTypedQuery;', 'Reflect.apply(execute, undefined, [client, forged, []]);'],
  ['global built-in access', '', 'globalThis.Reflect.apply(executeTypedQuery, undefined, [client, forged, []]);'],

  ['bound built-in apply', 'const invoke = Reflect.apply.bind(Reflect, executeTypedQuery, undefined);', 'invoke([client, forged, []]);'],
  ['intrinsic apply via call', '', 'Function.prototype.apply.call(executeTypedQuery, undefined, [client, forged, []]);'],
  ['intrinsic call via call', '', 'Function.prototype.call.call(executeTypedQuery, undefined, client, forged, []);'],
  ['configured operation caller boundary', `import { executeConfiguredQuery } from ${JSON.stringify(executorPath)};`, 'Reflect.apply(executeConfiguredQuery, undefined, [client, "idempotency.lookup", {}, []]);'],
  ['archive operation caller boundary', `import { executeLegacyArchive } from ${JSON.stringify(executorPath)};`, 'Reflect.apply(executeLegacyArchive, undefined, [client, "invented.operation", {}, []]);'],

]) {
  test(`SQL callable provenance rejects built-in Reflect.apply for ${label}`, async () => {
    const source = provenanceImports + 'const forged = { ...safe, text: "select unreviewed" };\n' + setup + invocation;
    const findings = await lint(source, applicationPath, 'no-raw-query', provenanceSources);
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query' && finding.severity === 2).length, 1, label);
  });
}

for (const [label, source] of [
  ['unrelated callable', 'const identity = (value: string) => value; Reflect.apply(identity, undefined, ["opaque"]); trx.run(safe, []);'],
  ['unrelated ownKeys', 'const keys = Reflect.ownKeys({ opaque: true }); void keys; trx.run(safe, []);'],

  ['unrelated intrinsic apply.call', 'const identity = (value: string) => value; Function.prototype.apply.call(identity, undefined, ["opaque"]);'],
  ['unrelated intrinsic call.call', 'const identity = (value: string) => value; Function.prototype.call.call(identity, undefined, "opaque");'],
  ['unrelated bound Reflect.apply', 'const identity = (value: string) => value; const invoke = Reflect.apply.bind(Reflect, identity, undefined); invoke(["opaque"]);'],
  ['lexically shadowed Function object', 'const Function = { prototype: { apply: { call: (...values: unknown[]) => values } } }; Function.prototype.apply.call(executeTypedQuery, undefined, [client, safe, []]);'],

  ['lexically shadowed Reflect object', 'const Reflect = { apply: (...values: unknown[]) => values }; Reflect.apply(executeTypedQuery, undefined, [client, safe, []]);'],
  ['custom apply alias', 'const custom = { apply: (...values: unknown[]) => values }; const invoke = custom.apply; invoke(executeTypedQuery, undefined, [client, safe, []]);'],
]) {
  test(`SQL reflective-call enforcement preserves ${label}`, async () => {
    assert.deepEqual(await lint(provenanceImports + source, applicationPath, 'no-raw-query', provenanceSources), []);
  });
}

// Additional real intrinsic spellings retain the same SQL boundary, while local
// objects with similarly named members remain ordinary JavaScript callables.
for (const [label, setup, invocation] of [
  ['computed Reflect member', '', 'Reflect["apply"](executeTypedQuery, undefined, [client, forged, []]);'],
  ['computed global Reflect member', '', 'globalThis.Reflect["apply"](trx.runGuarded, trx, [forged, [], guard]);'],
  ['computed Function prototype members', '', 'Function["prototype"]["apply"].call(executeTypedQuery, undefined, [client, forged, []]);'],
  ['const Reflect object alias', 'const reflection = Reflect;', 'reflection.apply(executeTypedQuery, undefined, [client, forged, []]);'],
  ['mutable intrinsic alias initialized to apply', 'let invoke = Reflect.apply;', 'invoke(executeTypedQuery, undefined, [client, forged, []]);'],
  ['computed raw query invocation', 'import type { PoolClient } from "pg"; declare const pgClient: PoolClient;', 'Reflect["apply"](pgClient.query, pgClient, ["select runtime"]);'],
]) {
  test(`SQL reflective spelling rejects ${label}`, async () => {
    const source = provenanceImports + 'const forged = { ...safe, text: "select unreviewed" };\n' + setup + invocation;
    const findings = await lint(source, applicationPath, 'no-raw-query', provenanceSources);
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query' && finding.severity === 2).length, 1, label);
  });
}

for (const [label, source] of [
  ['computed unrelated intrinsic target', 'const identity = (value: string) => value; Reflect["apply"](identity, undefined, ["opaque"]);'],
  ['computed shadowed Reflect', 'const Reflect = { apply: (...values: unknown[]) => values }; Reflect["apply"](executeTypedQuery, undefined, [client, safe, []]);'],
  ['custom object alias', 'const custom = { apply: (...values: unknown[]) => values }; const reflection = custom; reflection.apply(executeTypedQuery, undefined, [client, safe, []]);'],
  ['mutable custom callable alias', 'const custom = { apply: (...values: unknown[]) => values }; let invoke = custom.apply; invoke(executeTypedQuery, undefined, [client, safe, []]);'],
]) {
  test(`SQL reflective spelling preserves ${label}`, async () => {
    assert.deepEqual(await lint(provenanceImports + source, applicationPath, 'no-raw-query', provenanceSources), []);
  });
}

for (const [label, declaration] of [
  ['mutable shorthand leaf', 'let selected = safe; export const definitions = Object.freeze({ selected });'],
  ['annotation-only shorthand leaf', 'const selected: typeof safe = { ...safe, text: "select unreviewed" }; export const definitions = Object.freeze({ selected });'],
  ['asserted shorthand leaf', 'const selected = {} as typeof safe; export const definitions = Object.freeze({ selected });'],
]) {
  test(`frozen shorthand proof rejects ${label}`, async () => {
    const source = provenanceImports + 'import { definitions } from "./provenance.repository.js"; trx.run(definitions.selected, []);';
    const findings = await lint(source, applicationPath, 'no-raw-query', {
      [provenanceRepositoryPath]: provenanceRepository + declaration,
    });
    assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query' && finding.severity === 2).length, 1, label);
  });
}

// Exercise the actual generated 64/8-way selectors, not only a two-leaf model.
for (const selector of ['selectOpenTaskQuery', 'selectOpenTaskCountQuery', 'selectRunsSummaryQuery', 'selectRunsSummaryCountQuery', 'selectDashboardOpenTaskQuery', 'selectDashboardCycleTimeQuery', 'selectDashboardCompletionQuery', 'selectDashboardSlaBreachQuery']) {
  test(`actual Flow analytics selector provenance: ${selector}`, async () => {
    const actual = readFileSync(join(workspace, 'packages/flow/src/analytics.repository.ts'), 'utf8');
    const source = provenanceImports + `import { ${selector} } from "./analytics.repository.js"; trx.run(${selector}(condition ? 0 : 1), []);`;
    assert.deepEqual(await lint(source, applicationPath, 'no-raw-query', { ...provenanceSources, 'packages/health/src/analytics.repository.ts': actual }, { '@stynx-nyx/data': [join(workspace, 'packages/data/src/index.ts')] }), []);
  });
}

test('superseded Flow analytics Map helper remains unproved rather than becoming an exception', async () => {
  const extra = 'export const definitions = new Map([[0, safe], [1, alternate]]);';
  const source = provenanceImports + 'import { definitions } from "./provenance.repository.js"; function selected<Q>(definitions: ReadonlyMap<number, Q>, mask: number): Q { const query = definitions.get(mask); if (query === undefined) throw new Error("missing"); return query; } trx.run(selected(definitions, 0), []);';
  const findings = await lint(source, applicationPath, 'no-raw-query', { [provenanceRepositoryPath]: provenanceRepository + extra });
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
});


const selectorFixturePath = 'packages/health/src/composed.repository.ts';
function composedFixture({ children = 3, cases = 2, rootEdit = (value) => value, childEdit = (value) => value, leafEdit = (value) => value } = {}) {
  let declarations = provenanceRepository;
  for (let child = 0; child < children; child++) {
    for (let index = 0; index < cases; index++) {
      declarations += leafEdit(`const leaf${child}_${index} = defineQuery({ name: 'probe.${child}.${index}', text: sql\`select ${child * cases + index} as id\`, params: z.tuple([]), row: z.object({ id: z.number() }), expects: 'many' });\n`, child, index).replaceAll('\\`', '`').replaceAll('\\n', '\n');
    }
    const branches = Array.from({ length: cases }, (_, index) => `case ${child * cases + index}: return leaf${child}_${index};`).join(' ');
    declarations += childEdit(`const child${child} = (mask: number) => { switch(mask) { ${branches} default: throw new Error('missing'); } };\n`, child).replaceAll('\\n', '\n');
  }
  const edges = Array.from({ length: children }, (_, child) => `if (mask < ${(child + 1) * cases}) return child${child}(mask);`).join(' ');
  declarations += rootEdit(`export const dispatch = (mask: number) => { ${edges} throw new Error('missing'); };`);
  return declarations;
}
function composedProbe(text, calls = 'const probeFirst = dispatch(0);') {
  return selectorProgram(workspace, { [selectorFixturePath]: text + '\n' + calls }, selectorFixturePath);
}

for (const [label, mutate] of [
  ['forged first leaf', (source) => source.replace('const leaf0_0 = defineQuery', 'let leaf0_0 = defineQuery')],
  ['forged middle leaf', (source) => source.replace('const leaf1_0 = defineQuery', 'let leaf1_0 = defineQuery')],
  ['forged last leaf', (source) => source.replace('const leaf2_1 = defineQuery', 'let leaf2_1 = defineQuery')],
  ['asserted leaf', (source) => source.replace('return leaf1_0;', 'return leaf1_0 as typeof safe;')],
  ['unknown leaf factory', (source) => source.replace('const leaf1_0 = defineQuery', 'const leaf1_0 = unknownFactory') + '\ndeclare function unknownFactory(value: unknown): typeof safe;'],
  ['dynamic SQL leaf', (source) => source.replace("name: 'probe.1.0', text: sql`select 2 as id`", "name: 'probe.1.0', text: sql`select ${condition} as id`")],
  ['mutable selector', (source) => source.replace('const child1 =', 'let child1 =')],
  ['child extra effect', (source) => source.replace('switch(mask)', 'sideEffect(); switch(mask)')],
  ['child fallthrough', (source) => source.replace('case 0: return leaf0_0;', 'case 0: case 9: return leaf0_0;')],
  ['child duplicate case', (source) => source.replace('case 1:', 'case 0:')],
  ['child computed case', (source) => source.replace('case 1:', 'case (0 + 1):')],
  ['child default return', (source) => source.replace("default: throw new Error('missing');", 'default: return safe;')],
  ['child parameter reassignment', (source) => source.replace('switch(mask)', 'mask = 0; switch(mask)')],
  ['child default parameter', (source) => source.replace('const child0 = (mask: number)', 'const child0 = (mask: number = 0)')],
  ['child rest parameter', (source) => source.replace('const child0 = (mask: number)', 'const child0 = (...mask: number[])')],
  ['child async function', (source) => source.replace('const child0 = (mask: number)', 'const child0 = async (mask: number)')],
  ['root effect', (source) => source.replace('if (mask < 4)', 'sideEffect(); if (mask < 4)')],
  ['root parameter reassignment', (source) => source.replace('if (mask < 4)', 'mask = 0; if (mask < 4)')],
  ['root wrong forwarded parameter', (source) => source.replace('return child1(mask)', 'return child1(0)')],
  ['root conditional return', (source) => source.replace('return child1(mask)', 'return condition ? child1(mask) : safe')],
  ['root else branch', (source) => source.replace('return child0(mask);', 'return child0(mask); else return safe;')],
  ['root nonmonotonic bound', (source) => source.replace('mask < 4', 'mask < 2')],
  ['root computed bound', (source) => source.replace('mask < 4', 'mask < (2 + 2)')],
  ['root default return', (source) => source.replace("return child2(mask); throw new Error('missing');", 'return child2(mask); return safe;')],
  ['root default parameter', (source) => source.replace('const dispatch = (mask: number)', 'const dispatch = (mask: number = 0)')],
  ['root rest parameter', (source) => source.replace('const dispatch = (mask: number)', 'const dispatch = (...mask: number[])')],
  ['root async function', (source) => source.replace('const dispatch = (mask: number)', 'const dispatch = async (mask: number)')],
  ['root cycle', (source) => source.replace('return child1(mask)', 'return dispatch(mask)')],
  ['missing child', (source) => source.replace('return child1(mask)', 'return absent(mask)')],
]) {
  test(`closed composition refuses ${label} even for constant first mask`, () => {
    const original = composedFixture();
    const mutated = mutate(original);
    assert.notEqual(mutated, original, 'mutation must alter the actual fixture');
    const fixture = composedProbe(mutated);
    const result = fixture.evaluate(fixture.calls[0]);
    assert.equal(result?.ok, false, label);
  });
}

test('closed composition proves the complete small graph and charges repeated evaluations identically', () => {
  const fixture = composedProbe(composedFixture(), 'const probeFirst = dispatch(0); const probeLast = dispatch(5);');
  const first = fixture.evaluate(fixture.calls[0]);
  const last = fixture.evaluate(fixture.calls[1]);
  const warm = fixture.evaluate(fixture.calls[0]);
  assert.equal(first?.ok, true);
  assert.deepEqual(certificateMetrics(first), certificateMetrics(last));
  assert.deepEqual(certificateMetrics(first), certificateMetrics(warm));
  assert.equal(first.certificate.units, 4);
  assert.equal(first.certificate.edges, 3);
  assert.equal(first.certificate.cases, 6);
  assert.ok(first.certificate.dependencies.every((declaration) => fixture.program.getSourceFile(declaration.getSourceFile().fileName) === declaration.getSourceFile()));
});

for (const [label, options] of [['129 cases', { cases: 129, children: 1 }], ['33 edges', { children: 33, cases: 1 }]]) {
  test(`closed composition rejects oversized ${label} without a warmed acceptance`, () => {
    const fixture = composedProbe(composedFixture(options));
    const cold = fixture.evaluate(fixture.calls[0]);
    assert.equal(cold?.ok, false);
    assert.deepEqual(certificateMetrics(fixture.evaluate(fixture.calls[0])), certificateMetrics(cold));
  });
}

test('repeated child edges pay every case occurrence instead of receiving a free cache hit', () => {
  const source = composedFixture({ children: 1, cases: 2 }).replace(
    "if (mask < 2) return child0(mask); throw new Error('missing');",
    Array.from({ length: 32 }, (_, index) => `if (mask < ${index + 1}) return child0(mask);`).join(' ') + " throw new Error('missing');",
  );
  const fixture = composedProbe(source);
  const result = fixture.evaluate(fixture.calls[0]);
  assert.equal(result?.ok, true);
  assert.equal(result.certificate.units, 33);
  assert.equal(result.certificate.edges, 32);
  assert.equal(result.certificate.cases, 64);
  assert.ok(result.certificate.steps > 32 * 2);
});

for (const order of ['valid-first', 'invalid-first']) {
  test(`composition proof stays independent across Programs and call order: ${order}`, () => {
    const valid = composedFixture();
    const invalid = valid.replace('const leaf2_1 = defineQuery', 'let leaf2_1 = defineQuery');
    const programs = (order === 'valid-first' ? [valid, invalid] : [invalid, valid]).map((source) => composedProbe(source));
    const results = programs.map((fixture) => fixture.evaluate(fixture.calls[0]));
    assert.deepEqual(results.map((result) => result?.ok), order === 'valid-first' ? [true, false] : [false, true]);
    for (let index = 0; index < programs.length; index++) {
      assert.deepEqual(certificateMetrics(programs[index].evaluate(programs[index].calls[0])), certificateMetrics(results[index]));
    }
  });
}

for (const [operation, selector, expectedCases] of [['insert', 'selectNodeInsertQuery', 4096], ['update', 'selectNodeUpdateQuery', 4095]]) {
  test(`actual node composition complete certificate: ${operation}`, (context) => {
    const entry = 'packages/health/src/node-composition-probe.ts';
    const aggregate = join(workspace, `packages/flow/src/internal/design/generated/nodes-${operation}.repository.ts`);
    const fixture = selectorProgram(workspace, { [entry]: `import { ${selector} } from ${JSON.stringify(aggregate)}; const probeFirst = ${selector}(1); const probeLast = ${selector}(4095);` }, entry);
    const started = performance.now();
    const cold = fixture.evaluate(fixture.calls[0]);
    const warm = fixture.evaluate(fixture.calls[0]);
    const last = fixture.evaluate(fixture.calls[1]);
    context.diagnostic(JSON.stringify({ operation, cold: certificateMetrics(cold), warm: certificateMetrics(warm), last: certificateMetrics(last), elapsedMs: performance.now() - started, maxRss: process.resourceUsage().maxRSS }));
    assert.equal(cold?.ok, true, cold?.reason);
    assert.deepEqual(certificateMetrics(warm), certificateMetrics(cold));
    assert.deepEqual(certificateMetrics(last), certificateMetrics(cold));
    assert.equal(cold.certificate.units, 33);
    assert.equal(cold.certificate.edges, 32);
    assert.equal(cold.certificate.cases, expectedCases);
    assert.ok(cold.certificate.maxLocalSteps <= 2048);
    assert.ok(cold.certificate.maxLocalDepth <= 64);
    assert.ok(cold.certificate.steps <= 65536);
  });
}


for (const retained of ['child0', 'leaf0_0']) {
  test(`composition retains proof after harmless immutable-reference escape: ${retained}`, () => {
    const fixture = composedProbe(composedFixture() + `\ndeclare function retain(value: unknown): void; retain(${retained});`);
    assert.equal(fixture.evaluate(fixture.calls[0])?.ok, true);
  });
}
for (const [label, extra, target] of [
  ['unknown returned selector', 'declare function unknownFn(value: unknown): typeof child0; const replacement = unknownFn(child0);', 'replacement'],
  ['mutable selector alias', 'let replacement = child0;', 'replacement'],
  ['mutable property selection', 'const holder = { child: child0 };', 'holder.child'],
  ['Map selected function', 'const holder = new Map([[0, child0]]);', 'holder.get(0)!'],
  ['asserted callee', '', '(child0 as typeof child0)'],
]) {
  test(`composition refuses ${label} while keeping immutable original escapes legal`, () => {
    const source = composedFixture().replace('export const dispatch', extra + '\nexport const dispatch').replace('return child0(mask)', `return ${target}(mask)`);
    const fixture = composedProbe(source);
    assert.equal(fixture.evaluate(fixture.calls[0])?.ok, false);
  });
}

test('composition local-depth refusal cannot poison a later direct root, regardless of order', () => {
  const aliases = Array.from({ length: 66 }, (_, index) => `const alias${index} = ${index === 0 ? 'dispatch' : `alias${index - 1}`};`).join('\n');
  for (const reverse of [false, true]) {
    const calls = reverse ? 'const probeDirect = dispatch(0); const probeDeep = alias65(0);' : 'const probeDeep = alias65(0); const probeDirect = dispatch(0);';
    const fixture = composedProbe(composedFixture() + '\n' + aliases, calls);
    const results = fixture.calls.map((call) => fixture.evaluate(call));
    assert.deepEqual(results.map((result) => result?.ok), reverse ? [true, false] : [false, true]);
    assert.deepEqual(results.map((result) => certificateMetrics(result)), fixture.calls.map((call) => certificateMetrics(fixture.evaluate(call))));
  }
});

for (const operation of ['insert', 'update']) {
  for (const chunk of ['00', '16', '31']) {
    test(`actual node composition refuses unreachable-at-this-mask forged leaf: ${operation}/${chunk}`, () => {
      const entry = 'packages/health/src/node-composition-corruption.ts';
      const aggregate = join(workspace, `packages/flow/src/internal/design/generated/nodes-${operation}.repository.ts`);
      const child = join(workspace, `packages/flow/src/internal/design/generated/nodes-${operation}-${chunk}.repository.ts`);
      const original = readFileSync(child, 'utf8');
      const mutated = original.replace(/text: sql`/, 'text: String.raw`');
      assert.notEqual(mutated, original);
      const selector = operation === 'insert' ? 'selectNodeInsertQuery' : 'selectNodeUpdateQuery';
      const fixture = selectorProgram(workspace, { [entry]: `import { ${selector} } from ${JSON.stringify(aggregate)}; const probe = ${selector}(1);`, [child]: mutated }, entry);
      assert.equal(fixture.evaluate(fixture.calls[0])?.ok, false);
    });
  }
}

for (const [label, children, extraCases, expected] of [
  ['local just below', 1, 123, true],
  ['local exact ceiling', 1, 124, true],
  ['local over ceiling', 1, 125, false],
  ['complete graph below ceiling', 32, 122, true],
  ['complete graph over ceiling', 32, 124, false],
]) {
  test(`closed composition accounting boundary: ${label}`, (context) => {
    // Extra inert option fields exercise inspected-property cost without adding
    // query leaves or changing the query text. This is a budget probe, not an
    // assertion that extra options are accepted by the separate TypeScript gate.
    const source = composedFixture({ children, cases: 128,
      leafEdit: (leaf, _child, index) => leaf.replace("expects: 'many'", `costA: 0, costB: 0, ${index < extraCases ? 'costC: 0, ' : ''}expects: 'many'`),
    });
    const fixture = composedProbe(source);
    const cold = fixture.evaluate(fixture.calls[0]);
    const warm = fixture.evaluate(fixture.calls[0]);
    context.diagnostic(JSON.stringify({ label, cold: certificateMetrics(cold), warm: certificateMetrics(warm) }));
    assert.equal(cold?.ok, expected, cold?.reason);
    assert.deepEqual(certificateMetrics(warm), certificateMetrics(cold));
    if (label === 'local exact ceiling') assert.equal(cold.certificate.maxLocalSteps, 2048);
    if (label === 'local over ceiling') assert.equal(cold.certificate.maxLocalSteps, 2049);
    if (label === 'complete graph over ceiling') {
      assert.equal(cold.certificate.steps, 65537);
      assert.ok(cold.certificate.maxLocalSteps <= 2048);
    }
  });
}


test('superseded Flow node Map aggregation remains explicitly unproved', async () => {
  const repository = provenanceRepository + 'const chunk0 = new Map([[0, safe]]); const chunk1 = new Map([[1, alternate]]); export const definitions = new Map([...chunk0, ...chunk1]);';
  const source = provenanceImports + 'import { definitions } from "./provenance.repository.js"; function nodeMutationQuery(mask: number) { const query = definitions.get(mask); if (!query) throw new Error("missing"); return query; } trx.run(nodeMutationQuery(1), []);';
  const findings = await lint(source, applicationPath, 'no-raw-query', { [provenanceRepositoryPath]: repository });
  assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query').length, 1);
});

for (const [operation, selector] of [['insert', 'selectNodeInsertQuery'], ['update', 'selectNodeUpdateQuery']]) {
  test(`actual composed node root passes the ordinary SQL provenance gate: ${operation}`, async () => {
    const aggregate = join(workspace, `packages/flow/src/internal/design/generated/nodes-${operation}.repository.ts`);
    const source = provenanceImports + `import { ${selector} } from ${JSON.stringify(aggregate)}; trx.run(${selector}(condition ? 1 : 4095), []);`;
    assert.deepEqual(await lint(source, applicationPath, 'no-raw-query', provenanceSources, { '@stynx-nyx/data': [join(workspace, 'packages/data/src/index.ts')] }), []);
  });
}

for (const operation of ['insert', 'update']) {
  test(`actual node certificate is stable across fresh Programs and reversed mask order: ${operation}`, (context) => {
    const selector = operation === 'insert' ? 'selectNodeInsertQuery' : 'selectNodeUpdateQuery';
    const aggregate = join(workspace, `packages/flow/src/internal/design/generated/nodes-${operation}.repository.ts`);
    const entry = 'packages/health/src/reversed-node-certificate.ts';
    const observations = [];
    for (const masks of [[1, 4095], [4095, 1]]) {
      const fixture = selectorProgram(workspace, { [entry]: `import { ${selector} } from ${JSON.stringify(aggregate)}; const probeA = ${selector}(${masks[0]}); const probeB = ${selector}(${masks[1]});` }, entry);
      for (const call of fixture.calls) {
        const result = fixture.evaluate(call);
        assert.equal(result?.ok, true, result?.reason);
        observations.push(certificateMetrics(result));
      }
    }
    for (const observation of observations) assert.deepEqual(observation, observations[0]);
    context.diagnostic(JSON.stringify({ operation, observations }));
  });
}

test('a certificate cannot be reused for an AST owned by a different Program', () => {
  const first = composedProbe(composedFixture());
  const second = composedProbe(composedFixture());
  assert.equal(first.evaluate(first.calls[0])?.ok, true);
  assert.equal(second.evaluate(second.calls[0])?.ok, true);
  assert.notEqual(first.evaluate(second.calls[0])?.ok, true);
  assert.notEqual(second.evaluate(first.calls[0])?.ok, true);
});


// Ambient declarations cannot change the native callable, unlike a local value
// facade. In particular an added apply overload must not hide a SQL invocation.
for (const [label, setup, augmentation, expected] of [
  ['ambient non-callable namespace member', '', 'export {}; declare global { namespace Reflect { const inspectorMarker: unique symbol; } }', 1],
  ['ambient apply overload', '', 'export {}; declare global { namespace Reflect { function apply(target: unknown, receiver: unknown, args: unknown[]): unknown; } }', 1],
  ['runtime namespace facade', 'namespace Reflect { export function apply(...values: unknown[]) { return values; } }', '', 0],
  ['class and namespace facade', 'class Reflect { static apply(...values: unknown[]) { return values; } } namespace Reflect { export const marker = true; }', '', 0],
]) {
  for (const alias of [false, true]) {
    test(`Reflect declaration merge preserves ${label} via ${alias ? 'destructured alias' : 'direct call'}`, async () => {
      if (augmentation) {
        const emitted = ts.transpileModule(augmentation, { compilerOptions: { module: ts.ModuleKind.ESNext }, fileName: 'augmentation.ts' }).outputText.trim();
        assert.equal(emitted, 'export {};', 'ambient overload emits no native property replacement');
      }
      const invocation = alias
        ? 'const { apply: invoke } = Reflect; invoke(executeTypedQuery, undefined, [client, forged, []]);'
        : 'Reflect.apply(executeTypedQuery, undefined, [client, forged, []]);';
      const source = provenanceImports + 'const forged = { ...safe, text: "select unreviewed" };' + setup + invocation;
      const extra = augmentation ? { 'packages/health/src/reflect-inspector-augmentation.d.ts': augmentation } : {};
      const findings = await lint(source, applicationPath, 'no-raw-query', { ...provenanceSources, ...extra });
      assert.equal(findings.filter((finding) => finding.ruleId === 'stynx/no-raw-query' && finding.severity === 2).length, expected);
    });
  }
}
