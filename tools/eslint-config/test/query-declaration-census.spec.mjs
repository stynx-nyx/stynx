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
  function visit(node) {
    const member =
      node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
        ? node.name.text
        : undefined;
    const callableProperty =
      (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) &&
      ((node.type && ts.isFunctionTypeNode(node.type)) ||
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
  const actual = ['packages', 'packages-web', 'domain', 'reference'].flatMap((root) =>
    authoredFiles(join(workspace, root)).flatMap((file) =>
      declarations(file, readFileSync(join(workspace, file), 'utf8')),
    ),
  );
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
