import { isDeepStrictEqual } from 'node:util';
import { serializeHttpRuntimePlainJson } from './http-runtime-protocol.mjs';

const bodyKeys = [
  'candidateCommit',
  'complete',
  'modules',
  'networkClosure',
  'nonce',
  'parentCorroborationRequired',
  'performanceQualified',
  'readinessPromoting',
  'referenceObservation',
  'runtimeCustodyComplete',
  'schemaVersion',
  'scope',
  'tree',
  'trustedBootstrap',
  'workerPid',
];

function refuse() {
  const error = new Error('Closed qualification worker body or bootstrap differs');
  error.code = 'HTTP_QUALIFICATION_WORKER_BODY_INVALID';
  throw error;
}

// Pure structural correspondence only. Expected identities are retained by the
// actual parent; calling this component supplies no private runtime authority.
export function assertHttpQualificationWorkerBody(body, expected) {
  if (arguments.length !== 2) refuse();
  serializeHttpRuntimePlainJson(body);
  serializeHttpRuntimePlainJson(expected);
  if (
    body === null ||
    expected === null ||
    !isDeepStrictEqual(Object.keys(expected).sort(), [
      'candidateCommit',
      'nonce',
      'tree',
      'trustedBootstrap',
      'workerPid',
    ]) ||
    !isDeepStrictEqual(Object.keys(body).sort(), bodyKeys) ||
    body.schemaVersion !== 1 ||
    body.parentCorroborationRequired !== true ||
    body.complete !== false ||
    body.runtimeCustodyComplete !== false ||
    body.performanceQualified !== false ||
    body.readinessPromoting !== false ||
    !isDeepStrictEqual(body.trustedBootstrap, expected.trustedBootstrap) ||
    body.scope !== 'http-endpoint-qualification' ||
    body.candidateCommit !== expected.candidateCommit ||
    body.tree !== expected.tree ||
    body.workerPid !== expected.workerPid ||
    body.nonce !== expected.nonce ||
    body.referenceObservation?.scope !== 'http-endpoint-qualification' ||
    body.referenceObservation?.performanceQualified !== false
  )
    refuse();
  return {
    scope: 'qualification-worker-body-structural-correspondence-component',
    structuralCorrespondence: true,
    complete: false,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}
