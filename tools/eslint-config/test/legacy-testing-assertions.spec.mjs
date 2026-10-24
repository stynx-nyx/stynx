import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { createLibConfig } from '../index.mjs';
import {
  legacyTestingAssertionCensus,
  withLegacyTestingAssertions,
} from '../legacy-testing-assertions.mjs';

const root = resolve(import.meta.dirname, '../../..');
const path = resolve(root, 'packages/testing/src/fake-transaction.ts');
const original = readFileSync(path, 'utf8');
const ruleId = '@typescript-eslint/no-unsafe-type-assertion';
const installed = tsPlugin.rules['no-unsafe-type-assertion'];

// Exercise the actual installed rule and original helper against real project
// declarations. Mutations exist only in a compiler host; production is untouched.
async function findings(source = original, filename = path, wrapped = true) {
  const configPath = resolve(root, 'packages/testing/tsconfig.json');
  const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      assert.fail(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    },
  });
  assert.ok(config, 'real testing configuration must resolve');
  const host = ts.createCompilerHost(config.options);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  const getSource = host.getSourceFile.bind(host);
  host.readFile = (file) => resolve(file) === filename ? source : read(file);
  host.fileExists = (file) => resolve(file) === filename || exists(file);
  host.getSourceFile = (file, languageVersion, ...rest) => resolve(file) === filename
    ? ts.createSourceFile(file, source, languageVersion, true)
    : getSource(file, languageVersion, ...rest);
  const program = ts.createProgram([...new Set([...config.fileNames, filename])], config.options, host);
  const actual = program.getSourceFile(filename);
  assert.ok(actual, 'the real or virtual helper must enter the program');
  const firstImport = actual.statements.find(ts.isImportDeclaration);
  assert.ok(firstImport?.importClause?.namedBindings && ts.isNamedImports(firstImport.importClause.namedBindings));
  const checker = program.getTypeChecker();
  for (const entry of firstImport.importClause.namedBindings.elements) {
    const symbol = checker.getSymbolAtLocation(entry.name);
    const declaration = symbol && checker.getAliasedSymbol(symbol);
    assert.ok(declaration?.declarations?.length, 'real data declaration must resolve');
    const importedType = entry.isTypeOnly || firstImport.importClause.isTypeOnly
      ? checker.getDeclaredTypeOfSymbol(declaration)
      : checker.getTypeAtLocation(entry.name);
    assert.equal(importedType.flags & ts.TypeFlags.Any, 0, 'critical helper imports cannot silently become any');
  }
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    ignore: false,
    overrideConfig: [{
      files: ['**/*.ts'],
      languageOptions: { parser: tsParser, parserOptions: { programs: [program] } },
      plugins: { '@typescript-eslint': { ...tsPlugin, rules: {
        ...tsPlugin.rules,
        'no-unsafe-type-assertion': wrapped ? withLegacyTestingAssertions(installed, root) : installed,
      } } },
      rules: { [ruleId]: 'error' },
    }],
  });
  const [result] = await eslint.lintText(source, { filePath: filename });
  assert.deepEqual(result.messages.filter((message) => message.fatal), [], 'mutations must exercise semantic diagnostics, not parser failure');
  return result.messages;
}

const change = (before, after) => {
  assert.equal(original.split(before).length, 2, 'mutation must target exactly one real source fragment');
  return original.replace(before, after);
};

const nativeClientDiagnostic = {
  ruleId, severity: 2,
  message: "Unsafe type assertion: type 'PoolClient' is more narrow than the original type.",
  line: 77, column: 18, messageId: 'unsafeTypeAssertion', endLine: 77, endColumn: 77,
};

function withoutAdmittedClient(messages, source) {
  const line = source.split('\n').findIndex((text) => text.includes('const client = { query } as unknown as')) + 1;
  return messages.filter((message) => !(message.messageId === 'unsafeTypeAssertion' && message.line === line));
}

test('F2 binds two original syntax sites and the exact native client diagnostic', async () => {
  const before = await findings(original, path, false);
  assert.deepEqual(before, [nativeClientDiagnostic]);
  const parsed = ts.createSourceFile(path, original, ts.ScriptTarget.Latest, true);
  const sites = [];
  function visit(node) {
    if (ts.isAsExpression(node) &&
      (node.type.getText(parsed) === "Awaited<ReturnType<Transaction['query']>>" ||
       node.type.getText(parsed) === 'Parameters<typeof createDrizzle>[0]')) sites.push(node);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(sites.length, 2);
  assert.deepEqual(sites.map((node) => node.getText(parsed).replace(/\s/gu, '')),
    legacyTestingAssertionCensus.sites.map((site) => site.expression));
  assert.ok(ts.isReturnStatement(sites[0].parent));
  assert.ok(ts.isVariableDeclaration(sites[1].parent));
  assert.equal(sites[1].parent.name.getText(parsed), 'client');
  assert.deepEqual(await findings(), []);
  assert.equal(legacyTestingAssertionCensus.sites.length, 2);
  assert.ok(Object.isFrozen(legacyTestingAssertionCensus));
  assert.ok(Object.isFrozen(legacyTestingAssertionCensus.sites));
});

test('F2 delegates the exact native diagnostics in another file in the same package', async () => {
  const other = resolve(root, 'packages/testing/src/fake-transaction-copy.ts');
  const raw = await findings(original, other, false);
  assert.deepEqual(raw, [nativeClientDiagnostic]);
  assert.deepEqual(await findings(original, other), raw);
});

for (const [name, source] of [
  ['changed envelope literal', change("command: 'SELECT',", "command: 'UPDATE',")],
  ['renamed factory', change('export function createFakeTransaction(', 'export function createOtherTransaction(')],
  ['non-exported factory', change('export function createFakeTransaction(', 'function createFakeTransaction(')],
  ['nested factory', original.replace('export function createFakeTransaction(', 'function createFakeTransaction(').replace('function createFakeTransaction(', 'export function wrapper() {\nfunction createFakeTransaction(') + '\n}\n'],
  ['moved client binding', change('  const client = { query } as unknown as Parameters<typeof createDrizzle>[0];', '  let client;\n  { client = { query } as unknown as Parameters<typeof createDrizzle>[0]; }')],
  ['duplicate factory', original + '\n' + original.slice(original.indexOf('export function createFakeTransaction('))],
  ['missing client projection', change('{ query } as unknown as Parameters<typeof createDrizzle>[0]', '{ query }')],
]) {
  test(`F2 census fails closed for ${name}`, async () => {
    const messages = await findings(source);
    assert.ok(messages.some((message) => message.messageId === 'legacyTestingAssertionCensus'));
    assert.ok(messages.every((message) => message.severity === 2));
  });
}

test('F2 does not hide an additional unsafe assertion beside the admitted sites', async () => {
  const source = change('  const pending = [...script];', '  const forbidden = {} as Transaction;\n  const pending = [...script];');
  const messages = await findings(source);
  assert.equal(messages.filter((message) => message.messageId === 'unsafeTypeAssertion').length, 1);
  assert.equal(messages.filter((message) => message.messageId === 'legacyTestingAssertionCensus').length, 0);
});

test('F2 configuration changes only the workspace rule implementation, retaining error severity and every other installed rule', () => {
  const options = { rootDir: resolve(root, 'packages/testing'), strict: true };
  const published = createLibConfig(options).find((config) => config.plugins?.['@typescript-eslint']);
  const workspace = createLibConfig({ ...options, workspaceQuery: { rootDir: root, packageRoots: [] } }).find((config) => config.plugins?.['@typescript-eslint']);
  assert.equal(published.plugins['@typescript-eslint'], tsPlugin);
  assert.equal(published.plugins['@typescript-eslint'].rules['no-unsafe-type-assertion'], installed);
  assert.notEqual(workspace.plugins['@typescript-eslint'].rules['no-unsafe-type-assertion'], installed);
  assert.equal(workspace.rules[ruleId], 'error');
  assert.equal(published.rules[ruleId], 'error');
  for (const [name, rule] of Object.entries(tsPlugin.rules)) {
    if (name !== 'no-unsafe-type-assertion') assert.equal(workspace.plugins['@typescript-eslint'].rules[name], rule, name);
  }
  for (const [name, severity] of Object.entries(published.rules)) {
    if (name.startsWith('@typescript-eslint/no-unsafe')) assert.deepEqual(workspace.rules[name], severity, name);
  }
  assert.deepEqual(createLibConfig(options)[0].ignores, createLibConfig({ ...options, workspaceQuery: { rootDir: root, packageRoots: [] } })[0].ignores);
});

test('F2 does not admit the original envelope in a nested query callback', async () => {
  const source = change('    return {\n      command:', '    return (() => { return {\n      command:').replace("    } as Awaited<ReturnType<Transaction['query']>>;", "    } as Awaited<ReturnType<Transaction['query']>>; })();");
  const messages = await findings(source);
  assert.ok(messages.some((message) => message.messageId === 'legacyTestingAssertionCensus'));
  const raw = await findings(source, path, false);
  assert.deepEqual(messages.filter((message) => message.messageId !== 'legacyTestingAssertionCensus'), withoutAdmittedClient(raw, source));
});

test('F2 rejects a genuinely unsafe changed envelope and retains native diagnostics', async () => {
  const source = change('      rows,', '      rows: 1,');
  const raw = await findings(source, path, false);
  const messages = await findings(source);
  const envelope = withoutAdmittedClient(raw, source);
  assert.equal(envelope.length, 1);
  assert.equal(envelope[0].messageId, 'unsafeTypeAssertion');
  assert.ok(messages.some((message) => message.messageId === 'legacyTestingAssertionCensus'));
  assert.deepEqual(messages.filter((message) => message.messageId !== 'legacyTestingAssertionCensus'), envelope);
});

test('F2 delegates a distinct installed-rule diagnostic without reclassifying it', async () => {
  const source = change('  const pending = [...script];', '  const untrusted = JSON.parse("{}");\n  const extra = untrusted as Transaction;\n  const pending = [...script];');
  const raw = await findings(source, path, false);
  const wrapped = await findings(source);
  assert.equal(raw.length, (await findings(original, path, false)).length + 1, JSON.stringify(raw));
  assert.equal(wrapped.length, 1);
  const extraLine = source.split('\n').findIndex((line) => line.includes('const extra =')) + 1;
  assert.deepEqual(wrapped[0], raw.find((message) => message.line === extraLine));
});
