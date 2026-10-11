/* global __ENV, open */
import http from 'k6/http';
import execution from 'k6/execution';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { Counter } from 'k6/metrics';

// Additive supplemental producer. Existing four k6 profiles remain separate.
// The actual parent owns this file, official executable/native closure, private
// sealed allocation, argv/environment and every raw byte. Input is no authority.
const inputPath = __ENV.STYNX_HTTP_QUALIFICATION_INPUT;
const expectedInputSha256 = __ENV.STYNX_HTTP_QUALIFICATION_INPUT_SHA256;
const hash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const uuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const commit = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
function exact(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}
function refuse() {
  throw new Error('Closed supplemental HTTP generator input refused');
}
if (typeof inputPath !== 'string' || inputPath[0] !== '/' || !hash(expectedInputSha256)) refuse();
const inputBytes = open(inputPath);
if (
  inputBytes.length > 16 * 1024 * 1024 ||
  crypto.sha256(inputBytes, 'hex') !== expectedInputSha256
)
  refuse();
const input = JSON.parse(inputBytes);
if (
  !exact(input, [
    'schemaVersion',
    'candidateCommit',
    'tree',
    'operationId',
    'generatorOperationId',
    'caseId',
    'manifestSha256',
    'caseSha256',
    'baseUrl',
    'targets',
  ]) ||
  input.schemaVersion !== 1 ||
  !commit(input.candidateCommit) ||
  !commit(input.tree) ||
  !uuid(input.operationId) ||
  !uuid(input.generatorOperationId) ||
  input.operationId === input.generatorOperationId ||
  typeof input.caseId !== 'string' ||
  !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(input.caseId) ||
  !hash(input.manifestSha256) ||
  !hash(input.caseSha256) ||
  typeof input.baseUrl !== 'string' ||
  !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(input.baseUrl) ||
  Number(input.baseUrl.split(':')[2]) > 65535 ||
  !Array.isArray(input.targets) ||
  input.targets.length !== 600
)
  refuse();
for (let sequence = 0; sequence < 600; sequence++) {
  const target = input.targets[sequence];
  if (
    !exact(target, ['sequence', 'method', 'path', 'headers', 'body', 'expectedOutcomeId']) ||
    target.sequence !== sequence ||
    !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(target.method) ||
    typeof target.path !== 'string' ||
    target.path[0] !== '/' ||
    target.path.startsWith('//') ||
    /[\r\n#]/.test(target.path) ||
    !target.headers ||
    Object.getPrototypeOf(target.headers) !== Object.prototype ||
    Object.keys(target.headers).some(
      (key) =>
        !/^[A-Za-z0-9-]+$/.test(key) ||
        typeof target.headers[key] !== 'string' ||
        /[\r\n]/.test(target.headers[key]),
    ) ||
    new Set(Object.keys(target.headers).map((key) => key.toLowerCase())).size !==
      Object.keys(target.headers).length ||
    Object.keys(target.headers).some((key) =>
      ['host', 'connection', 'proxy-authorization', 'proxy-connection'].includes(key.toLowerCase()),
    ) ||
    (target.body !== null && typeof target.body !== 'string') ||
    typeof target.expectedOutcomeId !== 'string' ||
    !target.expectedOutcomeId
  )
    refuse();
}

export const options = {
  scenarios: {
    supplemental_endpoint: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1s',
      duration: '300s',
      preAllocatedVUs: 2,
      maxVUs: 10,
      gracefulStop: '30s',
    },
  },
  maxRedirects: 0,
  discardResponseBodies: false,
};
const started = new Counter('supplemental_target_started');
const completed = new Counter('supplemental_target_completed');
const digest = (value) => crypto.sha256(value, 'hex');
function headerIdentity(headers) {
  if (headers === null || headers === undefined) return null;
  return Object.keys(headers)
    .sort()
    .map((key) => [key, headers[key]]);
}
function emit(record) {
  console.log(JSON.stringify(record));
}

export default function () {
  if (execution.scenario.name !== 'supplemental_endpoint') refuse();
  const sequence = execution.scenario.iterationInTest;
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= 600) refuse();
  const target = input.targets[sequence];
  const url = input.baseUrl + target.path;
  const requestSha256 = digest(
    JSON.stringify([target.method, url, headerIdentity(target.headers), target.body]),
  );
  const identity = {
    schemaVersion: 1,
    kind: 'supplemental-http-target',
    candidateCommit: input.candidateCommit,
    tree: input.tree,
    operationId: input.operationId,
    generatorOperationId: input.generatorOperationId,
    caseId: input.caseId,
    caseSha256: input.caseSha256,
    manifestSha256: input.manifestSha256,
    sequence,
    expectedOutcomeId: target.expectedOutcomeId,
    allocationRequestSha256: requestSha256,
  };
  started.add(1);
  const targetStartedAtUnixMs = Date.now();
  let response;
  try {
    response = http.request(target.method, url, target.body, {
      headers: target.headers,
      timeout: '30s',
      redirects: 0,
      responseType: 'binary',
      tags: { case_id: input.caseId, target_sequence: String(sequence) },
    });
  } catch {
    // No invented duration or substitute/retry on an unmeasured native throw.
    completed.add(1);
    emit({
      ...identity,
      transport: 'native-request-threw',
      targetStartedAtUnixMs,
      targetCompletedAtUnixMs: Date.now(),
      durationMs: null,
      fullHttpMs: null,
      timings: null,
      actualRequestSha256: null,
      request: null,
      status: null,
      bodySha256: null,
      bodyBase64: null,
      headersSha256: null,
      headers: null,
      errorCode: null,
    });
    return;
  }
  completed.add(1);
  emit({
    ...identity,
    transport: response.status === 0 ? 'native-transport-failure' : 'http-response',
    targetStartedAtUnixMs,
    targetCompletedAtUnixMs: Date.now(),
    durationMs: response.timings.duration,
    fullHttpMs: response.timings.blocked + response.timings.duration,
    timings: response.timings,
    actualRequestSha256: response.request
      ? digest(
          JSON.stringify([
            response.request.method,
            response.request.url,
            headerIdentity(response.request.headers),
            response.request.body,
          ]),
        )
      : null,
    request: response.request ?? null,
    status: response.status,
    bodySha256: response.body === null ? null : digest(response.body),
    // Private raw custody only. Publication must use the reviewed normalization.
    bodyBase64: response.body === null ? null : encoding.b64encode(response.body, 'std'),
    headers: response.headers,
    headersSha256: response.headers
      ? digest(JSON.stringify(headerIdentity(response.headers)))
      : null,
    errorCode: typeof response.error_code === 'number' ? response.error_code : null,
  });
}
