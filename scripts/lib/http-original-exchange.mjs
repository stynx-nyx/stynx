import { isDeepStrictEqual, types } from 'node:util';
import { httpOriginalScenarioProfile } from './http-original-scenarios.mjs';
import { serializeHttpRuntimePlainJson } from './http-runtime-protocol.mjs';

// Worker-only, exact private IPC parent commands. No request/sample/callback
// payload is accepted; the parent retains actual generator/raw ownership.
const operations = new WeakMap();
let active;
const nativeOn = process.on;
const nativeRemove = process.removeListener;
const names = ['begin-measurement', 'finish-measurement'];
function fail() {
  const error = new Error('Closed original parent exchange refused');
  error.code = 'HTTP_ORIGINAL_EXCHANGE_INVALID';
  throw error;
}
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const natural = (value) => Number.isSafeInteger(value) && value >= 0;
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
  if (!body || Array.isArray(body) || !isDeepStrictEqual(Object.keys(body).sort(), keys.sort()))
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
    body.generatorOperationId !== begin?.generatorOperationId ||
    !hash(body.rawArtifactsSha256) ||
    !['COMPLETED', 'FAILED'].includes(body.outcome) ||
    !['nativeSummarySha256', 'nativeMetricsSha256'].every(
      (key) => hash(body[key]) || (body.outcome === 'FAILED' && body[key] === null),
    ) ||
    !['completedIterations', 'droppedIterations', 'interruptedIterations'].every(
      (key) => natural(body[key]) || (body.outcome === 'FAILED' && body[key] === null),
    )
  )
    fail();
}
export function openHttpOriginalParentExchange(job) {
  if (!job || typeof job !== 'object' || types.isProxy(job)) fail();
  const binding = {};
  for (const key of ['mode', 'parentPid', 'nonce', 'candidateCommit', 'tree', 'originalScenario']) {
    const descriptor = Object.getOwnPropertyDescriptor(job, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail();
    binding[key] = descriptor.value;
  }
  binding.originalScenario = JSON.parse(serializeHttpRuntimePlainJson(binding.originalScenario));
  job = binding;
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
    !isDeepStrictEqual(
      Object.keys(job.originalScenario).sort(),
      ['operationId', 'scenarioId', 'profileId', 'profileSha256', 'manifestSha256'].sort(),
    ) ||
    !uuid(job.originalScenario.operationId) ||
    !hash(job.originalScenario.profileSha256) ||
    !hash(job.originalScenario.manifestSha256) ||
    process.ppid !== job.parentPid ||
    !process.connected ||
    process.on !== nativeOn ||
    process.removeListener !== nativeRemove
  )
    fail();
  const nominal = httpOriginalScenarioProfile({
    scenarioId: job.originalScenario.scenarioId,
    profileId: job.originalScenario.profileId,
  }).nominalProfile;
  const handle = Object.freeze({});
  const state = { handle, job, received: [], waiting: null, failure: false, closed: false };
  state.disconnect = () => {
    state.failure = true;
    state.waiting?.reject(new Error('Original parent disconnected'));
    state.waiting = null;
  };
  state.listener = (input) => {
    try {
      const frame = JSON.parse(serializeHttpRuntimePlainJson(input));
      if (
        state.failure ||
        state.closed ||
        !state.waiting ||
        state.waiting.command !== frame.command ||
        state.received.length >= 2 ||
        !isDeepStrictEqual(
          Object.keys(frame).sort(),
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
        frame.schemaVersion !== 1 ||
        frame.mode !== job.mode ||
        frame.operationId !== job.originalScenario.operationId ||
        frame.nonce !== job.nonce ||
        frame.candidateCommit !== job.candidateCommit ||
        frame.tree !== job.tree ||
        frame.workerPid !== process.pid ||
        frame.scenarioId !== job.originalScenario.scenarioId ||
        frame.profileId !== job.originalScenario.profileId ||
        frame.command !== names[state.received.length]
      )
        fail();
      validateBody(
        frame.body,
        state.received.length,
        nominal,
        state.received[0]?.body,
        job.originalScenario.operationId,
      );
      state.received.push(frame);
      state.waiting?.accept(frame.body);
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
export function waitHttpOriginalParentCommand(handle, command) {
  const state = operations.get(handle);
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
export function closeHttpOriginalParentExchange(handle) {
  const state = operations.get(handle);
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
