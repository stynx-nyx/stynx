import { httpComposition, isHttpComposition } from './http-composition-roster.mjs';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import * as ts from 'typescript';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function refuse(message) {
  const error = new Error(message);
  error.code = 'HTTP_RUNTIME_BINDING_INVALID';
  throw error;
}

function readBound(root, row) {
  const path = resolve(root, row.path);
  const stat = lstatSync(path);
  const bytes = readFileSync(path);
  if (
    !stat.isFile() ||
    realpathSync(path) !== path ||
    (stat.mode & 0o7777) !== row.permissions ||
    bytes.length !== row.byteLength ||
    digest(bytes) !== row.sha256
  )
    refuse('Runtime binding bytes differ from the private build');
  return bytes;
}

/** Private worker entry point; never accepts an application factory or URL. */
export async function observeReferenceBootstrapModule(job) {
  const binding = job.bootstrap;
  const composition = httpComposition(job.compositionId);
  if (
    !isHttpComposition(job.compositionId) ||
    binding.source.path !== composition.source ||
    (job.compositionId === 'reference' &&
      binding.source.sha256 !==
        'ae8bb32ba4e6598b72488ee65a64046db2535db486588b775deb69deac7c7553') ||
    binding.emitted.path !== composition.emitted ||
    binding.map.path !== `${binding.emitted.path}.map`
  )
    refuse('Unknown runtime bootstrap binding');
  const sourceBytes = readBound(job.checkoutRoot, binding.source);
  const emittedBytes = readBound(job.checkoutRoot, binding.emitted);
  const mapBytes = readBound(job.checkoutRoot, binding.map);
  const source = ts.createSourceFile(
    binding.source.path,
    sourceBytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const emitted = ts.createSourceFile(
    binding.emitted.path,
    emittedBytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (source.parseDiagnostics.length || emitted.parseDiagnostics.length)
    refuse('Runtime bootstrap has malformed source or output');
  const named = (file) =>
    file.statements.filter(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'createReferenceApplication',
    );
  const originals = named(source);
  const outputs = named(emitted);
  if (
    originals.length !== 1 ||
    outputs.length !== 1 ||
    !originals[0].modifiers?.some((node) => node.kind === ts.SyntaxKind.ExportKeyword) ||
    !originals[0].modifiers?.some((node) => node.kind === ts.SyntaxKind.AsyncKeyword) ||
    !outputs[0].modifiers?.some((node) => node.kind === ts.SyntaxKind.AsyncKeyword)
  )
    refuse('Unsupported reference factory declaration');
  const assignments = emitted.statements.filter((node) => {
    if (!ts.isExpressionStatement(node) || !ts.isBinaryExpression(node.expression)) return false;
    const expression = node.expression;
    return (
      expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(expression.left) &&
      ts.isIdentifier(expression.left.expression) &&
      expression.left.expression.text === 'exports' &&
      expression.left.name.text === 'createReferenceApplication' &&
      ts.isIdentifier(expression.right) &&
      expression.right.text === 'createReferenceApplication'
    );
  });
  if (assignments.length !== 1) refuse('Unsupported emitted reference factory export');
  const map = JSON.parse(mapBytes.toString('utf8'));
  if (
    map.version !== 3 ||
    map.file !== composition.emitted.split('/').at(-1) ||
    map.sourceRoot ||
    map.sources?.length !== 1 ||
    resolve(dirname(resolve(job.checkoutRoot, binding.map.path)), map.sources[0]) !==
      resolve(job.checkoutRoot, binding.source.path) ||
    typeof map.mappings !== 'string' ||
    !map.mappings
  )
    refuse('Reference factory map differs from the private compiler relation');
  const moduleURL = pathToFileURL(resolve(job.checkoutRoot, binding.emitted.path)).href;
  const namespace = await import(moduleURL);
  const descriptor = Object.getOwnPropertyDescriptor(namespace, 'createReferenceApplication');
  if (!descriptor || typeof descriptor.value !== 'function')
    refuse('Reference factory is not an actual named function export');
  const factory = descriptor.value;
  if (namespace.default?.createReferenceApplication !== factory)
    refuse('Reference CJS export differs from its actual named export');
  const before = Object.getOwnPropertyDescriptors(factory);
  const after = Object.getOwnPropertyDescriptor(namespace, 'createReferenceApplication');
  if (
    after?.value !== factory ||
    !isDeepStrictEqual(before, Object.getOwnPropertyDescriptors(factory))
  )
    refuse('Reference factory export identity changed');
  for (const row of [binding.source, binding.emitted, binding.map])
    readBound(job.checkoutRoot, row);
  return {
    schemaVersion: 1,
    scope: 'bootstrap-module-only',
    compositionId: job.compositionId,
    bootstrap: structuredClone(binding),
    namedExport: 'createReferenceApplication',
    evaluatedModuleURL: moduleURL,
    actualNamedExportObserved: true,
    sourceDeclaration: { start: originals[0].getStart(source), end: originals[0].end },
    emittedDeclaration: { start: outputs[0].getStart(emitted), end: outputs[0].end },
    factoryInvoked: false,
    constructorProvenance: 'UNVERIFIED',
    sourceMapFunctionCorrespondence: 'UNVERIFIED',
    applicationRoot: 'UNVERIFIED',
    middleware: 'UNVERIFIED',
    reachability: 'UNVERIFIED',
    blockedOn: [
      'privately-owned-admitted-runtime-fixture',
      'complete-constructor-registry',
      'complete-middleware-observation',
    ],
    runtimeCustodyComplete: false,
    readinessPromoting: false,
  };
}
