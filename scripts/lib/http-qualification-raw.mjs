import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { parseBaselineJson } from './k6-baseline-json.mjs';

// Byte/identity reconstruction component only. The actual parent must own these
// bytes, input file, process, native metrics and complete semantic/effect checks.
const keys = [
  'schemaVersion',
  'kind',
  'candidateCommit',
  'tree',
  'operationId',
  'generatorOperationId',
  'caseId',
  'caseSha256',
  'manifestSha256',
  'sequence',
  'expectedOutcomeId',
  'allocationRequestSha256',
  'transport',
  'targetStartedAtUnixMs',
  'targetCompletedAtUnixMs',
  'durationMs',
  'fullHttpMs',
  'timings',
  'actualRequestSha256',
  'request',
  'status',
  'bodySha256',
  'bodyBase64',
  'headers',
  'headersSha256',
  'errorCode',
];
const allocationKeys = [
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
];
const identityKeys = [
  'candidateCommit',
  'tree',
  'operationId',
  'generatorOperationId',
  'caseId',
  'caseSha256',
  'manifestSha256',
];
const timingKeys = [
  'duration',
  'blocked',
  'looking_up',
  'connecting',
  'tls_handshaking',
  'sending',
  'waiting',
  'receiving',
];
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const backingBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const hash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const commit = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);
const uuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const natural = (value) => Number.isSafeInteger(value) && value >= 0;
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function exact(value, fields) {
  return (
    !!value &&
    !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === fields.length &&
    fields.every((key) => Object.hasOwn(value, key)) &&
    Reflect.ownKeys(value).every(
      (key) =>
        typeof key === 'string' &&
        fields.includes(key) &&
        Object.getOwnPropertyDescriptor(value, key).enumerable &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'),
    )
  );
}
function plain(value) {
  return (
    !!value &&
    !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    })
  );
}
function closedArray(value, length) {
  return (
    !types.isProxy(value) &&
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    value.length === length &&
    Reflect.ownKeys(value).length === length + 1 &&
    Array.from({ length }, (_, index) => String(index)).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    })
  );
}
function allocationTarget(value, sequence) {
  if (!exact(value, ['sequence', 'method', 'path', 'headers', 'body', 'expectedOutcomeId']))
    return false;
  if (!plain(value.headers)) return false;
  const names = Object.keys(value.headers);
  return (
    value.sequence === sequence &&
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(value.method) &&
    typeof value.path === 'string' &&
    value.path.startsWith('/') &&
    !value.path.startsWith('//') &&
    !/[\r\n#]/u.test(value.path) &&
    new Set(names.map((key) => key.toLowerCase())).size === names.length &&
    names.every(
      (key) =>
        /^[A-Za-z0-9-]+$/u.test(key) &&
        !['host', 'connection', 'proxy-authorization', 'proxy-connection'].includes(
          key.toLowerCase(),
        ) &&
        typeof value.headers[key] === 'string' &&
        !/[\r\n]/u.test(value.headers[key]),
    ) &&
    (value.body === null || typeof value.body === 'string') &&
    typeof value.expectedOutcomeId === 'string' &&
    value.expectedOutcomeId.length > 0
  );
}
function headerIdentity(value) {
  return value === null
    ? null
    : Object.keys(value)
        .sort()
        .map((key) => [key, value[key]]);
}
function fail(code) {
  const error = new Error('Private HTTP target capture reconstruction refused');
  error.code = `HTTP_QUALIFICATION_RAW_${code}`;
  throw error;
}
function bytes(input) {
  if (
    types.isProxy(input) ||
    !Buffer.isBuffer(input) ||
    Object.getPrototypeOf(input) !== Buffer.prototype ||
    types.isSharedArrayBuffer(backingBuffer.call(input))
  )
    fail('BYTES');
  const length = bufferLength.call(input);
  if (length < 1 || length > 64 * 1024 * 1024) fail('SIZE');
  const copy = Buffer.allocUnsafe(length);
  Uint8Array.prototype.set.call(copy, input);
  return copy;
}
function responseHeaders(value) {
  return (
    value === null ||
    (!!value &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every((entry) => typeof entry === 'string'))
  );
}
function requestValue(value) {
  return (
    exact(value, ['method', 'url', 'headers', 'body', 'cookies']) &&
    typeof value.method === 'string' &&
    typeof value.url === 'string' &&
    typeof value.body === 'string' &&
    value.headers &&
    Object.getPrototypeOf(value.headers) === Object.prototype &&
    Object.values(value.headers).every(
      (entry) => Array.isArray(entry) && entry.every((item) => typeof item === 'string'),
    ) &&
    (value.cookies === null || Object.getPrototypeOf(value.cookies) === Object.prototype)
  );
}

/** Never authenticates supplied buffers/allocations or produces a measurement verdict. */
export function decodeHttpQualificationTargetCapture(input, allocation) {
  if (
    arguments.length !== 2 ||
    !exact(allocation, allocationKeys) ||
    allocation.schemaVersion !== 1 ||
    !commit(allocation.candidateCommit) ||
    !commit(allocation.tree) ||
    !uuid(allocation.operationId) ||
    !uuid(allocation.generatorOperationId) ||
    allocation.operationId === allocation.generatorOperationId ||
    typeof allocation.caseId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(allocation.caseId) ||
    !hash(allocation.manifestSha256) ||
    !hash(allocation.caseSha256) ||
    typeof allocation.baseUrl !== 'string' ||
    !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(allocation.baseUrl) ||
    Number(allocation.baseUrl.split(':')[2]) > 65535 ||
    !closedArray(allocation.targets, 600) ||
    !allocation.targets.every(allocationTarget)
  )
    fail('ALLOCATION');
  const raw = bytes(input);
  const captureSha256 = digest(raw);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
  } catch {
    fail('UTF8');
  }
  if (!text.endsWith('\n')) fail('TRUNCATED');
  const lines = text.slice(0, -1).split('\n');
  if (lines.length !== 600) fail('POPULATION');
  const targets = new Map();
  let transportFailures = 0;
  let missingDurations = 0;
  let clockReversals = 0;
  for (const [line, value] of lines.entries()) {
    let record;
    try {
      record = parseBaselineJson(Buffer.from(value, 'utf8'));
    } catch {
      fail(`JSON_LINE_${line + 1}`);
    }
    if (
      !exact(record, keys) ||
      record.schemaVersion !== 1 ||
      record.kind !== 'supplemental-http-target' ||
      identityKeys.some((key) => record[key] !== allocation[key]) ||
      !natural(record.sequence) ||
      record.sequence >= 600 ||
      targets.has(record.sequence) ||
      !natural(record.targetStartedAtUnixMs) ||
      !natural(record.targetCompletedAtUnixMs)
    )
      fail('TARGET_IDENTITY');
    const target = allocation.targets[record.sequence];
    if (
      !exact(target, ['sequence', 'method', 'path', 'headers', 'body', 'expectedOutcomeId']) ||
      target.sequence !== record.sequence ||
      target.expectedOutcomeId !== record.expectedOutcomeId ||
      record.allocationRequestSha256 !==
        digest(
          JSON.stringify([
            target.method,
            allocation.baseUrl + target.path,
            headerIdentity(target.headers),
            target.body,
          ]),
        )
    )
      fail('TARGET_ALLOCATION');
    if (record.targetCompletedAtUnixMs < record.targetStartedAtUnixMs) clockReversals++;
    if (
      !['http-response', 'native-transport-failure', 'native-request-threw'].includes(
        record.transport,
      )
    )
      fail('TRANSPORT');
    if (record.transport === 'native-request-threw') {
      if (
        ![
          'durationMs',
          'fullHttpMs',
          'timings',
          'actualRequestSha256',
          'request',
          'status',
          'bodySha256',
          'bodyBase64',
          'headers',
          'headersSha256',
          'errorCode',
        ].every((key) => record[key] === null)
      )
        fail('THROWN_SAMPLE');
      transportFailures++;
      missingDurations++;
    } else {
      if (
        !exact(record.timings, timingKeys) ||
        !timingKeys.every((key) => finite(record.timings[key])) ||
        record.durationMs !== record.timings.duration ||
        record.fullHttpMs !== record.timings.blocked + record.timings.duration ||
        !natural(record.status) ||
        record.status > 599 ||
        !responseHeaders(record.headers) ||
        !requestValue(record.request) ||
        !hash(record.actualRequestSha256) ||
        record.actualRequestSha256 !==
          digest(
            JSON.stringify([
              record.request.method,
              record.request.url,
              headerIdentity(record.request.headers),
              record.request.body,
            ]),
          ) ||
        record.request.method !== target.method ||
        record.request.url !== allocation.baseUrl + target.path ||
        record.request.body !== (target.body ?? '') ||
        (record.errorCode !== null && !natural(record.errorCode))
      )
        fail('NATIVE_RESPONSE');
      const actualHeaders = new Map(
        Object.entries(record.request.headers).map(([key, values]) => [key.toLowerCase(), values]),
      );
      if (
        actualHeaders.size !== Object.keys(record.request.headers).length ||
        Object.entries(target.headers).some(([key, expected]) => {
          const actual = actualHeaders.get(key.toLowerCase());
          return !actual || actual.length !== 1 || actual[0] !== expected;
        })
      )
        fail('ACTUAL_REQUEST_HEADERS');
      if (
        record.headersSha256 !==
        (record.headers === null ? null : digest(JSON.stringify(headerIdentity(record.headers))))
      )
        fail('RESPONSE_HEADERS_DIGEST');
      if (record.bodyBase64 === null) {
        if (record.bodySha256 !== null) fail('RESPONSE_BODY_DIGEST');
      } else {
        if (typeof record.bodyBase64 !== 'string' || !hash(record.bodySha256))
          fail('RESPONSE_BODY');
        const body = Buffer.from(record.bodyBase64, 'base64');
        if (body.toString('base64') !== record.bodyBase64 || digest(body) !== record.bodySha256)
          fail('RESPONSE_BODY_DIGEST');
      }
      if (record.transport === 'native-transport-failure') {
        if (record.status !== 0) fail('FAILURE_STATUS');
        transportFailures++;
      } else if (record.status < 100) fail('RESPONSE_STATUS');
    }
    targets.set(record.sequence, record);
  }
  if (targets.size !== 600) fail('MISSING_TARGETS');
  return {
    schemaVersion: 1,
    scope: 'private-http-target-byte-reconstruction-component',
    captureSha256,
    captureBytes: raw.length,
    targetCount: targets.size,
    transportFailures,
    missingDurations,
    clockReversals,
    targets: [...targets.values()].sort((left, right) => left.sequence - right.sequence),
    nativeCountersAndTimingAssumptions: 'PENDING_ACTUAL_PARENT_CORROBORATION',
    semanticAndEffectChecks: 'PENDING_IMMUTABLE_CASE_MANIFEST',
    complete: false,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}
