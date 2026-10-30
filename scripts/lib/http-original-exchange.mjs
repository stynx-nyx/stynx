import { isDeepStrictEqual, types } from 'node:util';
import { httpOriginalScenarioProfile } from './http-original-scenarios.mjs';
import { serializeHttpRuntimePlainJson } from './http-runtime-protocol.mjs';

// Worker-only, exact private IPC parent commands. No request/sample/callback
// payload is accepted; the parent retains actual generator/raw ownership.
/** @typedef {{handle: object, job: Record<string, unknown>, received: Array<Record<string, unknown>>, waiting: null | {accept: (value: unknown) => void, reject: (reason?: unknown) => void, command: unknown}, failure: boolean, closed: boolean, disconnect?: () => void, listener?: (input: unknown) => void}} ExchangeState */
/** @type {WeakMap<object, ExchangeState>} */
const operations = new WeakMap();
/** @type {ExchangeState | undefined} */
let active;
const nativeOn = process.on;
const nativeRemove = process.removeListener;
/** @type {readonly unknown[]} */
const names = ['begin-measurement', 'finish-measurement'];
/** @returns {never} */
function fail() {
  const error = new Error('Closed original parent exchange refused');
  error.code = 'HTTP_ORIGINAL_EXCHANGE_INVALID';
  throw error;
}
/** @param {unknown} value */
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
/** @param {unknown} value */
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
/** @param {unknown} value @returns {boolean} */
const natural = (value) => Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPropertyContainer(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

/** @param {unknown} value @param {string} key @returns {unknown} */
function optionalProperty(value, key) {
  return value == null ? undefined : Reflect.get(Object(value), key, value);
}

/** @param {unknown} value @param {string} key @returns {unknown} */
function readRequiredProperty(value, key) {
  if (value === null || value === undefined)
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`);
  /** @type {unknown} */
  const boxed = Object(value);
  if (!isPropertyContainer(boxed)) throw new TypeError('Object conversion did not produce an object');
  return Reflect.get(boxed, key, value);
}

/** @param {unknown} value */
function ownEnumerableKeys(value) {
  // Native Object.keys accepts every value and throws for null or undefined.
  /** @type {{keys(value: unknown): string[]}} */
  const objectKeys = Object;
  return objectKeys.keys(value);
}

/** @param {readonly unknown[]} values @param {unknown} value */
function includesUnknown(values, value) {
  return values.includes(value);
}

/**
 * @param {unknown} body
 * @param {number} index
 * @param {{durationSeconds: number, rate: number, preAllocatedVUs: number, maxVUs: number}} nominal
 * @param {unknown} begin
 * @param {string} operationId
 */
function validateBody(body, index, nominal, begin, operationId) {
  const keys =
    index === 0
      ? [
          'generatorOperationId',
          'generatorExecutableSha256',
          'generatorInputsSha256',
          'durationSeconds',
          'ratePerSecond',
          'preAllocatedVUs',
          'maxVUs',
        ]
      : [
          'generatorOperationId',
          'rawArtifactsSha256',
          'nativeSummarySha256',
          'nativeMetricsSha256',
          'completedIterations',
          'droppedIterations',
          'interruptedIterations',
          'outcome',
        ];
  if (!body || Array.isArray(body)) fail();
  if (!isDeepStrictEqual(ownEnumerableKeys(body).sort(), keys.sort()) || !isPropertyContainer(body))
    fail();
  if (index === 0) {
    if (
      !uuid(body.generatorOperationId) ||
      body.generatorOperationId === operationId ||
      !hash(body.generatorExecutableSha256) ||
      !hash(body.generatorInputsSha256) ||
      body.durationSeconds !== nominal.durationSeconds ||
      body.ratePerSecond !== nominal.rate ||
      body.preAllocatedVUs !== nominal.preAllocatedVUs ||
      body.maxVUs !== nominal.maxVUs
    )
      fail();
  } else if (
    body.generatorOperationId !== optionalProperty(begin, 'generatorOperationId') ||
    !hash(body.rawArtifactsSha256) ||
    !includesUnknown(['COMPLETED', 'FAILED'], body.outcome) ||
    !['nativeSummarySha256', 'nativeMetricsSha256'].every(
      (key) => hash(body[key]) || (body.outcome === 'FAILED' && body[key] === null),
    ) ||
    !['completedIterations', 'droppedIterations', 'interruptedIterations'].every(
      (key) => natural(body[key]) || (body.outcome === 'FAILED' && body[key] === null),
    )
  )
    fail();
}
/** @param {unknown} input */
export function openHttpOriginalParentExchange(input) {
  if (!input || typeof input !== 'object' || types.isProxy(input)) fail();
  /** @type {Record<string, unknown>} */
  const binding = {};
  for (const key of ['mode', 'parentPid', 'nonce', 'candidateCommit', 'tree', 'originalScenario']) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail();
    binding[key] = descriptor.value;
  }
  binding.originalScenario = JSON.parse(serializeHttpRuntimePlainJson(binding.originalScenario));
  const job = binding;
  if (
    arguments.length !== 1 ||
    active ||
    job.mode !== 'http-original-scenario' ||
    !uuid(job.nonce) ||
    typeof job.candidateCommit !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(job.candidateCommit) ||
    typeof job.tree !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(job.tree) ||
    !job.originalScenario ||
    !isPropertyContainer(job.originalScenario) ||
    !isDeepStrictEqual(
      Object.keys(job.originalScenario).sort(),
      ['operationId', 'scenarioId', 'profileId', 'profileSha256', 'manifestSha256'].sort(),
    ) ||
    !uuid(job.originalScenario.operationId) ||
    typeof job.originalScenario.operationId !== 'string' ||
    !hash(job.originalScenario.profileSha256) ||
    !hash(job.originalScenario.manifestSha256) ||
    process.ppid !== job.parentPid ||
    !process.connected ||
    process.on !== nativeOn ||
    process.removeListener !== nativeRemove
  )
    fail();
  const scenario = job.originalScenario;
  const operationId = job.originalScenario.operationId;
  const nominal = httpOriginalScenarioProfile({
    scenarioId: scenario.scenarioId,
    profileId: scenario.profileId,
  }).nominalProfile;
  const handle = Object.freeze({});
  /** @type {ExchangeState} */
  const state = { handle, job, received: [], waiting: null, failure: false, closed: false };
  state.disconnect = () => {
    state.failure = true;
    state.waiting?.reject(new Error('Original parent disconnected'));
    state.waiting = null;
  };
  state.listener = (input) => {
    try {
      /** @type {unknown} */
      const frame = JSON.parse(serializeHttpRuntimePlainJson(input));
      if (
        state.failure ||
        state.closed ||
        !state.waiting ||
        state.waiting.command !== readRequiredProperty(frame, 'command') ||
        state.received.length >= 2 ||
        !isDeepStrictEqual(
          ownEnumerableKeys(frame).sort(),
          [
            'schemaVersion',
            'mode',
            'operationId',
            'nonce',
            'candidateCommit',
            'tree',
            'workerPid',
            'scenarioId',
            'profileId',
            'command',
            'body',
          ].sort(),
        ) ||
        !isPropertyContainer(frame) ||
        frame.schemaVersion !== 1 ||
        frame.mode !== job.mode ||
        frame.operationId !== operationId ||
        frame.nonce !== job.nonce ||
        frame.candidateCommit !== job.candidateCommit ||
        frame.tree !== job.tree ||
        frame.workerPid !== process.pid ||
        frame.scenarioId !== scenario.scenarioId ||
        frame.profileId !== scenario.profileId ||
        frame.command !== names[state.received.length]
      )
        fail();
      validateBody(
        frame.body,
        state.received.length,
        nominal,
        state.received[0]?.body,
        operationId,
      );
      state.received.push(frame);
      state.waiting?.accept(structuredClone(frame.body));
      state.waiting = null;
    } catch {
      state.failure = true;
      state.waiting?.reject(new Error('Closed original parent command refused'));
      state.waiting = null;
    }
  };
  operations.set(handle, state);
  active = state;
  Reflect.apply(nativeOn, process, ['message', state.listener]);
  Reflect.apply(nativeOn, process, ['disconnect', state.disconnect]);
  return handle;
}
/** @param {unknown} handle @param {unknown} command */
export function waitHttpOriginalParentCommand(handle, command) {
  const state = isPropertyContainer(handle) ? operations.get(handle) : undefined;
  const index = names.indexOf(command);
  if (
    arguments.length !== 2 ||
    !state ||
    state !== active ||
    state.failure ||
    state.closed ||
    index < 0 ||
    state.waiting ||
    process.on !== nativeOn ||
    process.removeListener !== nativeRemove ||
    process.ppid !== state.job.parentPid ||
    !process.connected ||
    state.received.length > index + 1
  )
    fail();
  if (state.received[index]) return Promise.resolve(structuredClone(state.received[index].body));
  if (state.received.length !== index) fail();
  return new Promise((accept, reject) => {
    state.waiting = { accept, reject, command };
  });
}
/** @param {unknown} handle */
export function closeHttpOriginalParentExchange(handle) {
  const state = isPropertyContainer(handle) ? operations.get(handle) : undefined;
  if (
    arguments.length !== 1 ||
    !state ||
    state !== active ||
    state.closed ||
    process.removeListener !== nativeRemove
  )
    fail();
  Reflect.apply(nativeRemove, process, ['message', state.listener]);
  Reflect.apply(nativeRemove, process, ['disconnect', state.disconnect]);
  state.closed = true;
  active = undefined;
  if (state.waiting) {
    state.waiting.reject(new Error('Original exchange closed'));
    state.waiting = null;
  }
  return {
    commandCount: state.received.length,
    refused: state.failure,
    complete: !state.failure && state.received.length === 2,
    readinessPromoting: false,
  };
}
