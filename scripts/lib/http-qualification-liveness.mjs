import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseBaselineJson } from './k6-baseline-json.mjs';

// One exact source-owned recipe. This component grants no manifest/runtime
// authority and deliberately refuses every other declaration or semantic case.
const declarationId =
  'packages/health/src/health.controller.ts:StynxHealthController.liveness:GET:/healthz';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
};
function refuse() {
  const error = new Error('Exact liveness qualification recipe refused');
  error.code = 'HTTP_QUALIFICATION_LIVENESS_INVALID';
  throw error;
}
export function assertLivenessQualificationDeclaration(declaration) {
  const binding = declaration?.binding;
  if (
    binding?.operation?.declarationId !== declarationId ||
    binding.operation.fixtureRecipeId !== declarationId ||
    binding.operation.file !== 'packages/health/src/health.controller.ts' ||
    binding.operation.controller !== 'StynxHealthController' ||
    binding.operation.handler !== 'liveness' ||
    binding.operation.method !== 'GET' ||
    binding.operation.path !== '/healthz' ||
    binding.case.semanticCaseId !== 'nominal' ||
    binding.case.effect !== 'read' ||
    binding.case.expectedStatus !== 200 ||
    binding.case.scheduledTargets !== 600 ||
    binding.semanticCase.expectedBusinessEffect !== 'no-business-mutation' ||
    canonical(binding.semanticCase.query) !== '{}' ||
    binding.fixtureContract.id !== 'health-real-dependencies' ||
    declaration.caseSha256 !== digest(canonical(binding))
  )
    refuse();
}

/** Worker reconstructs its own selected declaration from the fixed tracked file.
 * The actual parent additionally enforces the Architect's exact manifest pin.
 */
export function readWorkerLivenessQualificationDeclaration(job) {
  const bytes = readFileSync(
    resolve(job.checkoutRoot, 'law/policy/http-qualification-manifest.json'),
  );
  if (digest(bytes) !== job.qualification.manifestSha256) refuse();
  const manifest = JSON.parse(JSON.stringify(parseBaselineJson(bytes)));
  const cases = manifest.cases.filter((row) => row.caseId === job.qualification.caseId);
  if (cases.length !== 1) refuse();
  const row = cases[0];
  const operation = manifest.operations.find((entry) => entry.originId === row.originId);
  const semanticCase = operation?.semanticCases.find((entry) => entry.id === row.semanticCaseId);
  const fixtureContract = manifest.fixtureContracts.find(
    (entry) => entry.id === operation?.fixtureContract,
  );
  const composition = manifest.compositions.find((entry) => entry.id === row.compositionId);
  if (
    !operation ||
    !semanticCase ||
    !fixtureContract ||
    !composition ||
    row.compositionId !== job.compositionId
  )
    refuse();
  const binding = {
    case: {
      caseId: row.caseId,
      compositionId: row.compositionId,
      originId: row.originId,
      semanticCaseId: row.semanticCaseId,
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
  const declaration = { binding, caseSha256: row.caseSha256, manifestSha256: digest(bytes) };
  if (
    row.caseSha256 !== job.qualification.caseSha256 ||
    digest(readFileSync(resolve(job.checkoutRoot, operation.file))) !== operation.sourceSha256
  )
    refuse();
  assertLivenessQualificationDeclaration(declaration);
  return declaration;
}

/** Called only after the actual parent has bound the live worker READY frame. */
export function createLivenessQualificationAllocation(declaration, identity, listener) {
  assertLivenessQualificationDeclaration(declaration);
  if (
    listener.host !== '127.0.0.1' ||
    !Number.isInteger(listener.port) ||
    listener.port < 1 ||
    listener.port > 65535
  )
    refuse();
  return {
    schemaVersion: 1,
    candidateCommit: identity.candidateCommit,
    tree: identity.tree,
    operationId: identity.operationId,
    generatorOperationId: identity.generatorOperationId,
    caseId: declaration.binding.case.caseId,
    manifestSha256: declaration.manifestSha256,
    caseSha256: declaration.caseSha256,
    baseUrl: `http://127.0.0.1:${listener.port}`,
    targets: Array.from({ length: 600 }, (_, sequence) => ({
      sequence,
      method: 'GET',
      path: '/healthz',
      headers: { Accept: 'application/json' },
      body: null,
      expectedOutcomeId: 'stynx-health-liveness-exact-status-ok',
    })),
  };
}

/** Exact response contract only; no SQL/object/global-effect or SLO promotion. */
export function inspectLivenessQualificationOutcomes(declaration, decoded) {
  assertLivenessQualificationDeclaration(declaration);
  if (decoded.targetCount !== 600 || decoded.targets.length !== 600) refuse();
  const unexpected = decoded.targets
    .filter((target) => {
      if (
        target.transport !== 'http-response' ||
        target.status !== 200 ||
        target.bodyBase64 === null
      )
        return true;
      const headers = new Map(
        Object.entries(target.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
      );
      return (
        Buffer.from(target.bodyBase64, 'base64').toString('utf8') !== '{"status":"ok"}' ||
        !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(headers.get('content-type') ?? '') ||
        headers.get('x-content-type-options') !== 'nosniff' ||
        headers.get('x-frame-options') !== 'DENY' ||
        headers.get('referrer-policy') !== 'no-referrer'
      );
    })
    .map((target) => target.sequence);
  return {
    declarationId,
    caseSha256: declaration.caseSha256,
    responseCount: decoded.targetCount,
    unexpectedOutcomeCount: unexpected.length,
    unexpectedSequences: unexpected,
    exactResponseContractObserved: unexpected.length === 0,
    businessEffectVerification: 'PENDING_INDEPENDENT_FULL_VISIBILITY_FIXTURE_RECONCILIATION',
    complete: false,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}
