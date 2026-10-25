import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { workspaceQueryDeclarationCensus } from '../query-rules.mjs';

const workspace = resolve(import.meta.dirname, '../../..');
const key = ({ file, scope, member }) => `${file}:${scope}:${member}`;

function declarations(file, source) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found = new Map();
  // Named/indexed/typeof callable aliases must receive review too. Their
  // declaration can move to another module without retaining a `query` name.
  const potentiallyCallable = (type) => type && (
    ts.isFunctionTypeNode(type) || ts.isTypeReferenceNode(type) ||
    ts.isIndexedAccessTypeNode(type) || ts.isTypeQueryNode(type) ||
    (ts.isParenthesizedTypeNode(type) && potentiallyCallable(type.type)) ||
    ((ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) && type.types.some(potentiallyCallable))
  );
  function visit(node) {
    const name = node.name && ts.isComputedPropertyName(node.name) ? node.name.expression : node.name;
    const member = name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;
    const callableProperty =
      (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) &&
      (potentiallyCallable(node.type) ||
        (node.initializer &&
          (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))));
    if (
      ['query', 'execute'].includes(member) &&
      (ts.isMethodSignature(node) || ts.isMethodDeclaration(node) || callableProperty)
    ) {
      const names = [];
      for (let parent = node.parent; parent && !ts.isSourceFile(parent); parent = parent.parent) {
        if (parent.name && ts.isIdentifier(parent.name)) names.push(parent.name.text);
      }
      const declaration = { file, scope: names.join('/'), member };
      found.set(key(declaration), declaration); // overloads describe one reviewed receiver
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return [...found.values()];
}

function authoredFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      return ['node_modules', 'dist', 'test', 'tests', '__tests__'].includes(entry.name)
        ? []
        : authoredFiles(path);
    const file = relative(workspace, path).replaceAll('\\', '/');
    return /\/src\/.*\.(?:ts|tsx)$/u.test(file) && !/\.(?:spec|test)\.[cm]?tsx?$/u.test(file)
      ? [file]
      : [];
  });
}

function unresolved(found) {
  const reviewed = new Set(workspaceQueryDeclarationCensus.map(key));
  return found
    .map(key)
    .filter((entry) => !reviewed.has(entry))
    .sort();
}

test('every authored callable query/execute declaration has an explicit reviewed classification', () => {
  assert.ok(Object.isFrozen(workspaceQueryDeclarationCensus));
  const censusKeys = workspaceQueryDeclarationCensus.map(key);
  assert.equal(new Set(censusKeys).size, censusKeys.length, 'classifications must be unique');
  for (const entry of workspaceQueryDeclarationCensus) {
    assert.ok(Object.isFrozen(entry));
    assert.ok(['raw-sql', 'non-sql', 'checked-archive'].includes(entry.classification));
  }
  const files = [...['packages', 'packages-web', 'domain', 'reference'].flatMap((root) => authoredFiles(join(workspace, root))),
    ...authoredFiles(join(workspace, 'tools/database-tooling')),
    'scripts/lib/demo-bookmark-storage.mjs',
    'scripts/lib/demo-bookmark-storage.d.mts',
    'scripts/offline-storage-catalog-generate.mjs',
    'scripts/outbox-storage-catalog-generate.mjs',
    'scripts/ci-local/prepare-int-template.mjs',
  ];
  assert.equal(new Set(files).size, files.length, 'exact tooling population must not duplicate existing authored sources');
  const actual = files.flatMap((file) => declarations(file, readFileSync(join(workspace, file), 'utf8')));
  assert.deepEqual(
    unresolved(actual),
    [],
    'new/renamed SQL ports require an explicit provenance review',
  );
  const actualKeys = new Set(actual.map(key));
  assert.deepEqual(
    censusKeys.filter((entry) => !actualKeys.has(entry)).sort(),
    [],
    'removed receivers must not leave stale admissions',
  );
});

test('the census catches added and renamed SQL receivers without treating data query fields as calls', () => {
  const file = 'packages/data/src/checked-executor.ts';
  const original = declarations(
    file,
    'export interface CheckedQueryClient { query(text: string): Promise<unknown>; }',
  );
  assert.deepEqual(unresolved(original), []);
  const renamed = declarations(
    file,
    'export interface RenamedSqlClient { query(text: string): Promise<unknown>; }',
  );
  assert.deepEqual(unresolved(renamed), [`${file}:RenamedSqlClient:query`]);
  const added = declarations(
    file,
    'export type NewSqlClient = { query: (text: string) => Promise<unknown> };',
  );
  assert.deepEqual(unresolved([...original, ...added]), [`${file}:NewSqlClient:query`]);
  assert.deepEqual(
    declarations(file, 'interface SearchInput { query: string; execute: boolean }'),
    [],
  );
});


test('callable aliases and computed literal member declarations cannot escape census review', () => {
  const file = 'packages/health/src/new-sql-port.ts';
  const found = declarations(file, `
import type { ImportedCallable } from './external.js';
interface ImportedPort { query: ImportedCallable }
interface IndexedPort { query: ImportedPort['query'] }
declare const call: (text: string) => Promise<unknown>;
interface TypeofPort { execute: typeof call }
interface ComputedPort { ['query'](text: string): Promise<unknown> }
`);
  assert.deepEqual(unresolved(found), [
    `${file}:ComputedPort:query`, `${file}:ImportedPort:query`,
    `${file}:IndexedPort:query`, `${file}:TypeofPort:execute`,
  ]);
});
