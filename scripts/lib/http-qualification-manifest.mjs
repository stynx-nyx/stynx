import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, resolve } from 'node:path';
import ts from 'typescript';
import { parseBaselineJson } from './k6-baseline-json.mjs';
import {
  readHttpQualificationDeclaration,
  readHttpQualificationOpenApi,
} from './http-qualification-artifacts.mjs';

// Exact Architect declaration, not a runtime admission receipt. The private
// fresh-build parent separately checks its tracked roster and all live floors.
const manifestPath = 'law/policy/http-qualification-manifest.json';
const schemaPath = 'law/schemas/http-qualification-manifest.schema.json';
const manifestSha256 = '8227b805976e5a99d2f39a4b8f2d1012bbf66f75f8b7a9231b0718fbede11891';
const schemaSha256 = '5ad6409d91dbfedf57b6e8bd2f0b55ea31b857ea248932cdd187c5c4bbd587f0';
const require = createRequire(import.meta.url);
// Use the exact adopted package's declared validator dependency, never an
// ambient executable, sibling checkout, downloaded tool or undeclared resolver.
const devaiRequire = createRequire(require.resolve('@aarusso-nyx/devai/package.json'));
const Ajv = devaiRequire('ajv/dist/2020.js');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
// The duplicate-key/UTF-8 parser intentionally produces null-prototype maps.
// Ajv's declared deep-equality dependency expects ordinary JSON objects; convert
// only after the byte parser has rejected ambiguous input.
const parseJson = (bytes) => JSON.parse(JSON.stringify(parseBaselineJson(bytes)));
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
};
function refuse(message) {
  const error = new Error(message);
  error.code = 'HTTP_QUALIFICATION_MANIFEST_INVALID';
  throw error;
}
function demand(condition, message) {
  if (!condition) refuse(message);
}
function unique(rows, key, label) {
  const map = new Map();
  for (const row of rows) {
    demand(!map.has(row[key]), `Duplicate ${label}`);
    map.set(row[key], row);
  }
  return map;
}

function assertCheckoutRoot(checkoutRoot) {
  demand(
    typeof checkoutRoot === 'string' &&
      isAbsolute(checkoutRoot) &&
      realpathSync(checkoutRoot) === checkoutRoot &&
      lstatSync(checkoutRoot).isDirectory(),
    'Manifest checkout is not an actual canonical directory',
  );
}

// Both projections consume this same complete schema/source/cross-product check.
// No caller-authored roster or independently permissive parser is accepted.
function readHttpQualificationManifest(checkoutRoot) {
  const files = new Map();
  const read = (path, expected) => {
    demand(
      typeof path === 'string' &&
        !isAbsolute(path) &&
        !path.includes('\\') &&
        path.split('/').every((part) => part && part !== '.' && part !== '..'),
      'Manifest member is not a portable relative path',
    );
    const physical = resolve(checkoutRoot, path);
    demand(
      lstatSync(physical).isFile() && realpathSync(physical) === physical,
      'Manifest member is not an unlinked owned regular file',
    );
    const readDeclaration = [
      'docs/framework/contracts/openapi.json',
      'docs/framework/api/openapi.json',
      'docs/framework/contracts/openapi-compositions/offline-ctg9.json',
      'docs/framework/contracts/openapi-compositions/offline-e6.json',
    ].includes(path)
      ? readHttpQualificationOpenApi
      : readHttpQualificationDeclaration;
    const { bytes } = readDeclaration(checkoutRoot, physical);
    const sha256 = digest(bytes);
    demand(expected === undefined || sha256 === expected, `Manifest member differs: ${path}`);
    const previous = files.get(path);
    demand(!previous || previous.sha256 === sha256, 'Manifest member changed during collection');
    files.set(path, { path, sha256, byteLength: bytes.length });
    return bytes;
  };
  const manifest = parseJson(read(manifestPath, manifestSha256));
  const schema = parseJson(read(schemaPath, schemaSha256));
  const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);
  demand(validate(manifest), 'Manifest violates the exact closed schema');
  read(manifest.compositionPolicy.path, manifest.compositionPolicy.sha256);
  for (const path of manifest.authoritySources) read(path);
  const all = [...manifest.operations, ...manifest.publicExclusions];
  unique(all, 'declarationId', 'declaration identity');
  unique(all, 'originId', 'declaration short identity');
  const operations = unique(manifest.operations, 'originId', 'required origin');
  const compositions = unique(manifest.compositions, 'id', 'composition');
  const fixtures = unique(manifest.fixtureContracts, 'id', 'fixture contract');
  const cases = unique(manifest.cases, 'caseId', 'case identity');
  const parsed = new Map();
  for (const operation of all) {
    demand(
      digest(operation.declarationId).slice(0, 16) === operation.originId,
      'Manifest origin digest differs',
    );
    const bytes = read(operation.file, operation.sourceSha256);
    let source = parsed.get(operation.file);
    if (!source) {
      source = ts.createSourceFile(
        operation.file,
        bytes.toString('utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      demand(source.parseDiagnostics.length === 0, 'Manifest controller cannot be parsed');
      parsed.set(operation.file, source);
    }
    const controllers = source.statements.filter(
      (node) => ts.isClassDeclaration(node) && node.name?.text === operation.controller,
    );
    demand(controllers.length === 1, 'Manifest controller is missing or ambiguous');
    const methods = controllers[0].members.filter(
      (node) => ts.isMethodDeclaration(node) && node.name.getText(source) === operation.handler,
    );
    demand(
      methods.length === 1 && digest(methods[0].getText(source)) === operation.methodSha256,
      'Manifest handler bytes differ',
    );
    for (const reference of operation.openapiOperations) {
      let value = parseBaselineJson(read(reference.artifact, reference.artifactSha256));
      demand(reference.operationPointer.startsWith('/'), 'Invalid OpenAPI pointer');
      for (const key of reference.operationPointer
        .slice(1)
        .split('/')
        .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
        demand(
          value !== null && typeof value === 'object' && Object.hasOwn(value, key),
          'Missing OpenAPI member',
        );
        value = value[key];
      }
      demand(
        value.operationId === reference.operationId &&
          value['x-stynx-source'] === operation.file &&
          value['x-stynx-handler'] === operation.handler,
        'OpenAPI origin differs',
      );
    }
  }
  for (const composition of compositions.values()) {
    read(composition.factorySource, composition.factorySourceSha256);
    read(composition.rootModule, composition.rootModuleSha256);
  }
  const expanded = new Map();
  for (const operation of operations.values()) {
    unique(operation.semanticCases, 'id', 'operation semantic identity');
    demand(
      new Set(operation.compositionIds).size === operation.compositionIds.length,
      'Duplicate operation composition',
    );
    const fixtureContract = fixtures.get(operation.fixtureContract);
    demand(fixtureContract, 'Missing fixture contract');
    for (const compositionId of operation.compositionIds) {
      const composition = compositions.get(compositionId);
      demand(composition, 'Missing operation composition');
      for (const semanticCase of operation.semanticCases) {
        const id = `${compositionId}.${operation.originId}.${semanticCase.id}`;
        const row = cases.get(id);
        demand(
          row &&
            row.compositionId === compositionId &&
            row.originId === operation.originId &&
            row.semanticCaseId === semanticCase.id &&
            !expanded.has(id),
          'Manifest case cross-product differs',
        );
        const binding = {
          case: {
            caseId: id,
            compositionId,
            originId: operation.originId,
            semanticCaseId: semanticCase.id,
            fixtureRecipeId: operation.fixtureRecipeId,
            fixtureContract: operation.fixtureContract,
            effect: semanticCase.effect,
            expectedStatus: semanticCase.expectedStatus,
            preparationDeadlineSeconds: 180,
            scheduledTargets: 600,
            sourceSha256: operation.sourceSha256,
            methodSha256: operation.methodSha256,
          },
          operation,
          semanticCase,
          fixtureContract,
          composition,
          qualificationProfile: manifest.qualificationProfile,
          compositionPolicy: manifest.compositionPolicy,
        };
        demand(
          digest(canonical(binding)) === row.caseSha256,
          'Manifest expanded case digest differs',
        );
        expanded.set(id, binding);
      }
    }
  }
  demand(expanded.size === cases.size, 'Manifest contains an unexpanded case');
  return {
    manifest,
    cases,
    expanded,
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}

/** Read-only declaration component. It cannot allocate, execute, calibrate,
 * admit a task or turn supplied paths into a live fresh-build capability.
 */
export function loadHttpQualificationCase(checkoutRoot, caseId) {
  demand(arguments.length === 2, 'Manifest component requires exactly a root and case ID');
  assertCheckoutRoot(checkoutRoot);
  demand(typeof caseId === 'string' && caseId.length > 0, 'Missing exact manifest case ID');
  const { cases, expanded, files } = readHttpQualificationManifest(checkoutRoot);
  demand(expanded.has(caseId), 'Case is absent from the exact manifest');
  return structuredClone({
    schemaVersion: 1,
    scope: 'source-bound-http-qualification-declaration-component',
    manifestSha256,
    schemaSha256,
    caseSha256: cases.get(caseId).caseSha256,
    binding: expanded.get(caseId),
    files,
    requiredCases: expanded.size,
    runtimeAdmission: false,
    performanceQualified: false,
    readinessPromoting: false,
  });
}

/** Complete source-bound roster in declared composition order, then each
 * composition's manifest case order. Selection never removes a required case.
 * This projection supplies no runtime, fixture, resume or admission authority.
 */
export function loadHttpQualificationRoster(checkoutRoot) {
  demand(arguments.length === 1, 'Manifest roster requires exactly one checkout root');
  assertCheckoutRoot(checkoutRoot);
  const { manifest, cases, expanded, files } = readHttpQualificationManifest(checkoutRoot);
  const compositionOrder = manifest.compositions.map((row) => row.id);
  const orderedCases = compositionOrder.flatMap((compositionId) =>
    manifest.cases.filter((row) => row.compositionId === compositionId),
  );
  demand(orderedCases.length === cases.size, 'Manifest order lost a required case');
  demand(
    new Set(orderedCases.map((row) => row.caseId)).size === expanded.size,
    'Manifest order duplicated a required case',
  );
  return structuredClone({
    schemaVersion: 1,
    scope: 'source-bound-http-qualification-roster-component',
    manifestSha256,
    schemaSha256,
    compositionOrder,
    cases: orderedCases,
    files,
    requiredCases: expanded.size,
    qualificationProfile: manifest.qualificationProfile,
    runtimeAdmission: false,
    performanceQualified: false,
    readinessPromoting: false,
  });
}

/** The eight unchanged original workload/profile cells, derived through the
 * same complete manifest validation as the supplemental roster. This read-only
 * projection cannot select a binary, admit a task, acquire a fixture or launch.
 */
export function loadHttpOriginalScenarioRoster(checkoutRoot) {
  demand(arguments.length === 1, 'Original scenario roster requires exactly one checkout root');
  assertCheckoutRoot(checkoutRoot);
  const { manifest, files } = readHttpQualificationManifest(checkoutRoot);
  const scenarios = ['auth', 'crud', 'upload', 'cascade-delete'];
  const supportPaths = [
    'test/perf/k6/lib/config.js',
    'test/perf/k6/lib/stynx.js',
    'test/perf/k6/check-summary.mjs',
    'test/perf/k6/baseline-reference.json',
  ];
  const sourcePaths = [...scenarios.map((id) => `test/perf/k6/${id}.js`), ...supportPaths];
  const captures = new Map(
    sourcePaths.map((path) => [
      path,
      readHttpQualificationDeclaration(checkoutRoot, resolve(checkoutRoot, path)).row,
    ]),
  );
  const profiles = scenarios.flatMap((scenarioId) =>
    ['local', 'hardening'].map((profileId) => {
      const binding = {
        scenarioId,
        profileId,
        nominalProfile: manifest.existingProfiles[scenarioId][profileId],
        generator: 'official-k6-0.49.0',
        derivativeSelectionAllowed: false,
        script: captures.get(`test/perf/k6/${scenarioId}.js`),
        supportFiles: supportPaths.map((path) => captures.get(path)),
      };
      return { scenarioId, profileId, profileSha256: digest(canonical(binding)), binding };
    }),
  );
  for (const [path, row] of captures) {
    const current = readHttpQualificationDeclaration(checkoutRoot, resolve(checkoutRoot, path)).row;
    demand(
      canonical(current) === canonical(row),
      'Original scenario source changed during collection',
    );
  }
  return structuredClone({
    schemaVersion: 1,
    scope: 'source-bound-http-original-scenario-roster-component',
    manifestSha256,
    schemaSha256,
    profiles,
    files: [...files, ...captures.values()].sort((a, b) => a.path.localeCompare(b.path)),
    runtimeAdmission: false,
    performanceQualified: false,
    readinessPromoting: false,
  });
}
