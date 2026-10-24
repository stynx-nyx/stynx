import assert from 'node:assert/strict';
import { resolve, relative } from 'node:path';
import ts from 'typescript';
import { createSelectorCertificateProof } from '../../query-selector-certificates.mjs';

// Virtual source overlays use the actual compiler and actual data definitions.
// No copied defineQuery signature or type-only trust shortcut is admitted.
export function selectorProgram(workspace, sources, entry) {
  const overlay = new Map(Object.entries(sources).map(([path, text]) => [resolve(workspace, path), text]));
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, skipLibCheck: true,
    noEmit: true, paths: { '@stynx-nyx/data': [resolve(workspace, 'packages/data/src/index.ts')] } };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  const directory = host.directoryExists.bind(host);
  const source = host.getSourceFile.bind(host);
  host.readFile = (path) => overlay.get(resolve(path)) ?? read(path);
  host.fileExists = (path) => overlay.has(resolve(path)) || exists(path);
  host.directoryExists = (path) => [...overlay.keys()].some((file) => file.startsWith(`${resolve(path)}/`)) || directory(path);
  host.getSourceFile = (path, language, ...rest) => overlay.has(resolve(path))
    ? ts.createSourceFile(path, overlay.get(resolve(path)), language, true) : source(path, language, ...rest);
  const program = ts.createProgram([...overlay.keys()], options, host);
  const checker = program.getTypeChecker();
  const parsed = program.getSourceFile(resolve(workspace, entry));
  assert.ok(parsed, 'actual probe source must enter Program');
  const calls = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text.startsWith('probe')) {
      assert.ok(node.initializer && ts.isCallExpression(node.initializer), 'probe must be a direct actual selector call');
      const symbol = checker.getSymbolAtLocation(node.initializer.expression);
      const target = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      assert.ok(target?.declarations?.length, 'actual selector import/binding must resolve');
      assert.equal(checker.getTypeAtLocation(node.initializer.expression).flags & ts.TypeFlags.Any, 0,
        'selector must not silently become any');
      calls.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(calls.length, 'at least one actual selector call is required');
  const pathOf = (path) => relative(workspace, path).replaceAll('\\', '/');
  const evaluate = createSelectorCertificateProof({ checker, program, pathOf },
    (origin, module) => module === 'typed-query' && origin.file === 'packages/data/src/typed-query.ts');
  return { program, checker, calls, evaluate };
}

export function certificateMetrics(result) {
  if (!result) return { recognized: false };
  const { program: _program, dependencies, ...cost } = result.certificate ?? {};
  return { ok: result.ok, reason: result.reason, ...cost, dependencyCount: dependencies?.length };
}
