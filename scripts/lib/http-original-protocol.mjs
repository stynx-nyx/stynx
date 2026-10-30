import { createHash } from 'node:crypto';
import { isDeepStrictEqual, types } from 'node:util';
import { httpOriginalScenarioProfile } from './http-original-scenarios.mjs';
import { serializeHttpRuntimePlainJson } from './http-runtime-protocol.mjs';

// A disjoint component wire. Only the actual fresh-build parent can corroborate
// its worker, generator, manifest, raw artifacts and resources. No wire PASS.
// Original native populations remain separate from the supplemental 600.
const mode = 'http-original-scenario';
const phases = Object.freeze([
  'start',
  'factory',
  'init',
  'listen',
  'preparation-complete',
  'ready',
  'measurement-start',
  'measurement-complete',
  'close',
  'final',
  'terminal',
]);
const contextKeys = [
  'candidateCommit',
  'tree',
  'nonce',
  'operationId',
  'workerPid',
  'compositionId',
  'scenarioId',
  'profileId',
  'profileSha256',
  'manifestSha256',
  'fixtureSha256',
  'controlClosureSha256',
];
const frameKeys = [
  'schemaVersion',
  'mode',
  'sequence',
  'phase',
  'candidateCommit',
  'tree',
  'nonce',
  'operationId',
  'workerPid',
  'compositionId',
  'scenarioId',
  'profileId',
  'elapsedNs',
  'body',
];
/** @param {unknown} value */
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
/** @param {unknown} value */
const commit = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
/** @param {unknown} value */
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
/** @param {unknown} value @returns {boolean} */
const natural = (value) => Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
/** @param {unknown} value @returns {boolean} */
const positive = (value) => natural(value) && typeof value === 'number' && value > 0;
/** @param {unknown} value */
const digest = (value) =>
  createHash('sha256').update(serializeHttpRuntimePlainJson(value)).digest('hex');
/** @param {unknown} value */
const nanos = (value) => typeof value === 'string' && /^(0|[1-9][0-9]{0,14})$/u.test(value);
/** @param {number} value */
const seconds = (value) => BigInt(value) * 1_000_000_000n;

/** @returns {never} */
function refuse() {
  const error = new Error('Closed original HTTP scenario component wire refused');
  error.code = 'HTTP_ORIGINAL_PROTOCOL_INVALID';
  throw error;
}
/**
 * @param {unknown} value
 * @param {string[]} keys
 * @returns {boolean}
 */
function exact(value, keys) {
  return (
    !!value &&
    !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    (typeof value === 'object' || typeof value === 'function') &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)) &&
    Reflect.ownKeys(value).every(
      (key) =>
        typeof key === 'string' &&
        keys.includes(key) &&
        Object.getOwnPropertyDescriptor(value, key).enumerable &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'),
    )
  );
}
/** @param {unknown} value @returns {unknown} */
function copy(value) {
  return JSON.parse(serializeHttpRuntimePlainJson(value));
}
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPropertyContainer(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
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

/** @param {unknown} value @param {string} key @returns {unknown} */
function optionalProperty(value, key) {
  return value == null ? undefined : readRequiredProperty(value, key);
}

/** @param {readonly unknown[]} values @param {unknown} value */
function includesUnknown(values, value) {
  return values.includes(value);
}

/** @param {unknown} value @returns {boolean} */
function validContext(value) {
  return (
    exact(value, contextKeys) &&
    isPropertyContainer(value) &&
    commit(value.candidateCommit) &&
    commit(value.tree) &&
    uuid(value.nonce) &&
    uuid(value.operationId) &&
    positive(value.workerPid) &&
    value.compositionId === 'reference' &&
    includesUnknown(['auth', 'crud', 'upload', 'cascade-delete'], value.scenarioId) &&
    includesUnknown(['local', 'hardening'], value.profileId) &&
    ['profileSha256', 'manifestSha256', 'fixtureSha256', 'controlClosureSha256'].every((key) =>
      hash(value[key]),
    )
  );
}

/** Validate a closed received transcript, never caller samples or measurement authority.
 * @param {unknown} expected
 */
export function createHttpOriginalProtocol(expected) {
  if (arguments.length !== 1 || !validContext(expected)) refuse();
  /** @type {unknown} */
  const context = copy(expected);
  const profile = httpOriginalScenarioProfile({
    scenarioId: readRequiredProperty(context, 'scenarioId'),
    profileId: readRequiredProperty(context, 'profileId'),
  });
  const nominal = profile.nominalProfile;
  /** @type {unknown[]} */
  const captured = [];
  /** @type {Array<Record<string, unknown>>} */
  const admitted = [];
  const times = new Map();
  let failed = false;
  let finished = false;
  let captureComplete = true;
  let bytes = 0;
  /** @type {unknown} */
  let listener;
  /** @type {unknown} */
  let preparationSha256;
  /** @type {unknown} */
  let generatorOperationId;
  /** @type {unknown} */
  let measurement;
  /** @param {unknown} phase @param {unknown} body */
  const validBody = (phase, body) => {
    switch (phase) {
      case 'start':
        return (
          exact(body, [
            'fixtureSha256',
            'controlClosureSha256',
            'profileSha256',
            'manifestSha256',
            'parentCorroborationRequired',
          ]) &&
          isPropertyContainer(body) &&
          ['fixtureSha256', 'controlClosureSha256', 'profileSha256', 'manifestSha256'].every(
            (key) => body[key] === readRequiredProperty(context, key),
          ) &&
          body.parentCorroborationRequired === true
        );
      case 'factory':
        return (
          exact(body, [
            'actualFactoryInvoked',
            'actualAdapterCount',
            'appRetainedBeforeFactoryReturn',
          ]) &&
          isPropertyContainer(body) &&
          body.actualFactoryInvoked === true &&
          body.actualAdapterCount === 1 &&
          body.appRetainedBeforeFactoryReturn === true
        );
      case 'init':
        return (
          exact(body, [
            'layerCount',
            'controllerCount',
            'routeCount',
            'runtimeObjectSnapshotSha256',
          ]) &&
          isPropertyContainer(body) &&
          ['layerCount', 'controllerCount', 'routeCount'].every((key) => positive(body[key])) &&
          hash(body.runtimeObjectSnapshotSha256)
        );
      case 'listen':
        if (
          !exact(body, ['host', 'port']) ||
          !isPropertyContainer(body) ||
          body.host !== '127.0.0.1' ||
          !positive(body.port) ||
          typeof body.port !== 'number' ||
          body.port > 65535
        )
          return false;
        listener = copy(body);
        return true;
      case 'preparation-complete':
        if (
          !exact(body, [
            'profileSha256',
            'evidenceSha256',
            'trafficCount',
            'sqlEffectCount',
            'objectEffectCount',
          ]) ||
          !isPropertyContainer(body) ||
          body.profileSha256 !== readRequiredProperty(context, 'profileSha256') ||
          !hash(body.evidenceSha256) ||
          !natural(body.trafficCount) ||
          // Null retains UNVERIFIED effects; it never represents zero effects.
          // Transport invocations cannot prove committed business mutations.
          !['sqlEffectCount', 'objectEffectCount'].every(
            (key) => body[key] === null || natural(body[key]),
          )
        )
          return false;
        preparationSha256 = body.evidenceSha256;
        return true;
      case 'ready':
        return (
          exact(body, [
            'host',
            'port',
            'profileSha256',
            'manifestSha256',
            'preparationEvidenceSha256',
            'sessionEvidenceSha256',
          ]) &&
          isPropertyContainer(body) &&
          body.host === readRequiredProperty(listener, 'host') &&
          body.port === readRequiredProperty(listener, 'port') &&
          body.profileSha256 === readRequiredProperty(context, 'profileSha256') &&
          body.manifestSha256 === readRequiredProperty(context, 'manifestSha256') &&
          body.preparationEvidenceSha256 === preparationSha256 &&
          hash(body.sessionEvidenceSha256)
        );
      case 'measurement-start':
        if (
          !exact(body, [
            'generatorOperationId',
            'generatorExecutableSha256',
            'generatorInputsSha256',
            'durationSeconds',
            'ratePerSecond',
            'preAllocatedVUs',
            'maxVUs',
          ]) ||
          !isPropertyContainer(body) ||
          !uuid(body.generatorOperationId) ||
          body.generatorOperationId === readRequiredProperty(context, 'operationId') ||
          !hash(body.generatorExecutableSha256) ||
          !hash(body.generatorInputsSha256) ||
          body.durationSeconds !== nominal.durationSeconds ||
          body.ratePerSecond !== nominal.rate ||
          body.preAllocatedVUs !== nominal.preAllocatedVUs ||
          body.maxVUs !== nominal.maxVUs
        )
          return false;
        generatorOperationId = body.generatorOperationId;
        return true;
      case 'measurement-complete':
        if (
          !exact(body, [
            'generatorOperationId',
            'rawArtifactsSha256',
            'nativeSummarySha256',
            'nativeMetricsSha256',
            'completedIterations',
            'droppedIterations',
            'interruptedIterations',
            'outcome',
          ]) ||
          !isPropertyContainer(body) ||
          body.generatorOperationId !== generatorOperationId ||
          !hash(body.rawArtifactsSha256) ||
          !includesUnknown(['COMPLETED', 'FAILED'], body.outcome) ||
          !['nativeSummarySha256', 'nativeMetricsSha256'].every(
            (key) => hash(body[key]) || (body.outcome === 'FAILED' && body[key] === null),
          ) ||
          !['completedIterations', 'droppedIterations', 'interruptedIterations'].every(
            (key) => natural(body[key]) || (body.outcome === 'FAILED' && body[key] === null),
          )
        )
          return false;
        // Preserve every official native iteration/drop, including boundary extras
        // and failed executions. Only the actual parent can assess whole-window
        // population, native checks/thresholds, raw provenance and baseline.
        measurement = copy(body);
        return true;
      case 'close':
        return (
          exact(body, [
            'actualAppCloseResolved',
            'ownedSocketCloseEventsComplete',
            'listenerClosed',
            'openSocketCount',
            'clientDisposalEvidenceSha256',
          ]) &&
          isPropertyContainer(body) &&
          body.actualAppCloseResolved === true &&
          body.ownedSocketCloseEventsComplete === true &&
          body.listenerClosed === true &&
          body.openSocketCount === 0 &&
          hash(body.clientDisposalEvidenceSha256)
        );
      case 'final':
        return (
          exact(body, [
            'runtimeEvidenceSha256',
            'sourceEvidenceSha256',
            'fixtureFinalEvidenceSha256',
            'parentFixtureCleanupRequired',
          ]) &&
          isPropertyContainer(body) &&
          ['runtimeEvidenceSha256', 'sourceEvidenceSha256', 'fixtureFinalEvidenceSha256'].every(
            (key) => hash(body[key]),
          ) &&
          body.parentFixtureCleanupRequired === true
        );
      case 'terminal':
        return (
          exact(body, [
            'phaseCount',
            'phaseSha256',
            'resultArtifactSha256',
            'parentCorroborationRequired',
            'runtimeCustodyComplete',
            'performanceQualified',
            'readinessPromoting',
          ]) &&
          isPropertyContainer(body) &&
          body.phaseCount === phases.length - 1 &&
          body.phaseSha256 === digest(admitted) &&
          hash(body.resultArtifactSha256) &&
          body.parentCorroborationRequired === true &&
          body.runtimeCustodyComplete === false &&
          body.performanceQualified === false &&
          body.readinessPromoting === false
        );
      default:
        return false;
    }
  };
  /** @param {unknown} input */
  function receive(input) {
    /** @type {unknown} */
    let frame;
    try {
      const serialized = serializeHttpRuntimePlainJson(input);
      bytes += Buffer.byteLength(serialized);
      if (
        Buffer.byteLength(serialized) > 32 * 1024 * 1024 ||
        bytes > 64 * 1024 * 1024 ||
        captured.length >= 1024
      ) {
        captureComplete = false;
        refuse();
      }
      /** @type {unknown} */
      const parsed = JSON.parse(serialized);
      frame = parsed;
      captured.push(parsed); // Preserve bounded rejected frames before admission.
      if (
        failed ||
        finished ||
        admitted.length >= phases.length ||
        !exact(parsed, frameKeys) ||
        !isPropertyContainer(parsed) ||
        parsed.schemaVersion !== 1 ||
        parsed.mode !== mode ||
        parsed.sequence !== admitted.length + 1 ||
        parsed.phase !== phases[admitted.length] ||
        !nanos(parsed.elapsedNs) ||
        typeof parsed.elapsedNs !== 'string' ||
        [
          'candidateCommit',
          'tree',
          'nonce',
          'operationId',
          'workerPid',
          'compositionId',
          'scenarioId',
          'profileId',
        ].some((key) => parsed[key] !== readRequiredProperty(context, key))
      )
        refuse();
      const time = BigInt(parsed.elapsedNs);
      const previous = admitted.at(-1);
      if (
        time > seconds(profile.workerDeadlineSeconds) ||
        (previous && (typeof previous.elapsedNs !== 'string' || time < BigInt(previous.elapsedNs))) ||
        (!previous && time !== 0n) ||
        !validBody(parsed.phase, parsed.body)
      )
        refuse();
      times.set(parsed.phase, time);
      if (includesUnknown(['factory', 'init', 'listen'], parsed.phase) && time > seconds(30)) refuse();
      if (
        includesUnknown(['preparation-complete', 'ready'], parsed.phase) &&
        time - times.get('listen') > seconds(180)
      )
        refuse();
      if (
        parsed.phase === 'measurement-complete' &&
        ((readRequiredProperty(measurement, 'outcome') === 'COMPLETED' &&
          time - times.get('measurement-start') < seconds(nominal.durationSeconds)) ||
          time - times.get('measurement-start') > seconds(nominal.durationSeconds + 60))
      )
        refuse();
      if (parsed.phase === 'close' && time - times.get('measurement-complete') > seconds(30))
        refuse();
      if (includesUnknown(['final', 'terminal'], parsed.phase) && time - times.get('close') > seconds(30))
        refuse();
      admitted.push(parsed);
      return true;
    } catch {
      failed = true;
      if (!frame) captureComplete = false;
      return false;
    }
  }
  return Object.freeze({
    receive,
    captured() {
      return copy({
        frames: captured,
        bytes,
        captureComplete,
        refused: failed,
        parentCorroborationRequired: true,
        runtimeCustodyComplete: false,
        performanceQualified: false,
        readinessPromoting: false,
      });
    },
    /** @param {unknown} exit */
    finish(exit) {
      try {
        if (
          arguments.length !== 1 ||
          failed ||
          finished ||
          admitted.length !== phases.length ||
          !captureComplete ||
          !exact(exit, ['workerPid', 'code', 'signal', 'operationId']) ||
          !isPropertyContainer(exit) ||
          exit.workerPid !== readRequiredProperty(context, 'workerPid') ||
          exit.code !== 0 ||
          exit.signal !== null ||
          exit.operationId !== readRequiredProperty(context, 'operationId')
        )
          refuse();
        finished = true;
        return copy({
          componentWireComplete: true,
          frameCount: admitted.length,
          transcriptSha256: digest(admitted),
          listener,
          generatorOperationId,
          measurement,
          parentCorroborationRequired: true,
          actualParentCleanupAndRawCustody: 'PENDING_INDEPENDENT_ACTUAL_PARENT_BINDING',
          complete: false,
          runtimeCustodyComplete: false,
          performanceQualified: false,
          readinessPromoting: false,
        });
      } catch {
        failed = true;
        refuse();
      }
    },
  });
}

/** @typedef {{handle: object, context: unknown, protocol: ReturnType<typeof createHttpOriginalProtocol>, send: unknown, sendDescriptor: PropertyDescriptor | undefined, startedAt: bigint, frames: unknown[], failed: boolean, closed: boolean, sending: boolean}} ChannelState */
/** @type {WeakMap<object, ChannelState>} */
const channels = new WeakMap();
/** @type {ChannelState | undefined} */
let activeChannel;
const nativeMonotonic = process.hrtime.bigint;
const nativeHrtime = process.hrtime;
/** @param {unknown} handle */
function channelFor(handle) {
  const state = isPropertyContainer(handle) ? channels.get(handle) : undefined;
  if (
    !state ||
    state !== activeChannel ||
    state.failed ||
    state.closed ||
    state.sending ||
    process.hrtime !== nativeHrtime ||
    process.hrtime.bigint !== nativeMonotonic ||
    process.send !== state.send ||
    !process.connected ||
    !isDeepStrictEqual(Object.getOwnPropertyDescriptor(process, 'send'), state.sendDescriptor)
  )
    refuse();
  return state;
}
/** @param {ChannelState} state @param {unknown} phase @param {unknown} body */
async function sendLive(state, phase, body) {
  channelFor(state.handle);
  /** @type {unknown} */
  const frame = copy({
    schemaVersion: 1,
    mode,
    sequence: state.frames.length + 1,
    phase,
    candidateCommit: readRequiredProperty(state.context, 'candidateCommit'),
    tree: readRequiredProperty(state.context, 'tree'),
    nonce: readRequiredProperty(state.context, 'nonce'),
    operationId: readRequiredProperty(state.context, 'operationId'),
    workerPid: process.pid,
    compositionId: readRequiredProperty(state.context, 'compositionId'),
    scenarioId: readRequiredProperty(state.context, 'scenarioId'),
    profileId: readRequiredProperty(state.context, 'profileId'),
    elapsedNs: phase === 'start' ? '0' : (nativeMonotonic() - state.startedAt).toString(),
    body,
  });
  if (!state.protocol.receive(frame)) {
    state.failed = true;
    refuse();
  }
  state.sending = true;
  try {
    /** @type {Promise<void>} */
    const sendCompletion = new Promise((resolve, reject) => {
      /** @type {{apply(target: unknown, receiver: unknown, args: unknown[]): unknown}} */
      const nativeReflect = Reflect;
      /** @param {unknown} error */
      const onSent = (error) => (error ? reject(error) : resolve());
      nativeReflect.apply(state.send, process, [frame, onSent]);
    });
    await sendCompletion;
    if (
      !process.connected ||
      process.send !== state.send ||
      !isDeepStrictEqual(Object.getOwnPropertyDescriptor(process, 'send'), state.sendDescriptor) ||
      process.hrtime !== nativeHrtime ||
      process.hrtime.bigint !== nativeMonotonic
    )
      refuse();
    state.frames.push(frame);
  } catch (error) {
    state.failed = true;
    throw error;
  } finally {
    state.sending = false;
  }
}

/** Actual IPC channel; immutable job/manifest/build custody remains the parent's obligation.
 * @param {unknown} job
 */
export async function openHttpOriginalChannel(job) {
  if (
    arguments.length !== 1 ||
    activeChannel ||
    optionalProperty(job, 'mode') !== mode ||
    typeof process.send !== 'function' ||
    !process.connected ||
    !exact(readRequiredProperty(job, 'originalScenario'), [
      'operationId',
      'scenarioId',
      'profileId',
      'profileSha256',
      'manifestSha256',
    ]) ||
    !readRequiredProperty(job, 'referenceFixture') ||
    !Array.isArray(readRequiredProperty(job, 'controls'))
  )
    refuse();
  /** @type {Record<string, unknown>} */
  const context = {
    candidateCommit: readRequiredProperty(job, 'candidateCommit'),
    tree: readRequiredProperty(job, 'tree'),
    nonce: readRequiredProperty(job, 'nonce'),
    operationId: readRequiredProperty(readRequiredProperty(job, 'originalScenario'), 'operationId'),
    workerPid: process.pid,
    compositionId: readRequiredProperty(job, 'compositionId'),
    scenarioId: readRequiredProperty(readRequiredProperty(job, 'originalScenario'), 'scenarioId'),
    profileId: readRequiredProperty(readRequiredProperty(job, 'originalScenario'), 'profileId'),
    profileSha256: readRequiredProperty(readRequiredProperty(job, 'originalScenario'), 'profileSha256'),
    manifestSha256: readRequiredProperty(readRequiredProperty(job, 'originalScenario'), 'manifestSha256'),
    fixtureSha256: digest(readRequiredProperty(job, 'referenceFixture')),
    controlClosureSha256: digest(readRequiredProperty(job, 'controls')),
  };
  if (
    !validContext(context) ||
    optionalProperty(readRequiredProperty(readRequiredProperty(job, 'referenceFixture'), 'identity'), 'candidateCommit') !== context.candidateCommit ||
    optionalProperty(readRequiredProperty(readRequiredProperty(job, 'referenceFixture'), 'identity'), 'tree') !== context.tree ||
    optionalProperty(readRequiredProperty(readRequiredProperty(job, 'referenceFixture'), 'identity'), 'nonce') !== context.nonce
  )
    refuse();
  /** @type {{create(prototype: null): object}} */
  const nullPrototypeFactory = Object;
  const handle = Object.freeze(nullPrototypeFactory.create(null));
  /** @type {ChannelState} */
  const state = {
    handle,
    context: copy(context),
    protocol: createHttpOriginalProtocol(context),
    send: process.send,
    sendDescriptor: Object.getOwnPropertyDescriptor(process, 'send'),
    startedAt: nativeMonotonic(),
    frames: [],
    failed: false,
    closed: false,
    sending: false,
  };
  channels.set(handle, state);
  activeChannel = state;
  await sendLive(state, 'start', {
    fixtureSha256: context.fixtureSha256,
    controlClosureSha256: context.controlClosureSha256,
    profileSha256: context.profileSha256,
    manifestSha256: context.manifestSha256,
    parentCorroborationRequired: true,
  });
  return handle;
}

/** Internal actual worker binding, never a serialized caller capability.
 * @param {unknown} handle @param {unknown} job
 */
export function assertHttpOriginalChannel(handle, job) {
  const state = channelFor(handle);
  if (
    arguments.length !== 2 ||
    readRequiredProperty(job, 'mode') !== mode ||
    readRequiredProperty(state.context, 'operationId') !== readRequiredProperty(readRequiredProperty(job, 'originalScenario'), 'operationId') ||
    readRequiredProperty(state.context, 'scenarioId') !== readRequiredProperty(readRequiredProperty(job, 'originalScenario'), 'scenarioId') ||
    readRequiredProperty(state.context, 'profileId') !== readRequiredProperty(readRequiredProperty(job, 'originalScenario'), 'profileId') ||
    readRequiredProperty(state.context, 'profileSha256') !== readRequiredProperty(readRequiredProperty(job, 'originalScenario'), 'profileSha256') ||
    readRequiredProperty(state.context, 'manifestSha256') !== readRequiredProperty(readRequiredProperty(job, 'originalScenario'), 'manifestSha256') ||
    readRequiredProperty(state.context, 'candidateCommit') !== readRequiredProperty(job, 'candidateCommit') ||
    readRequiredProperty(state.context, 'tree') !== readRequiredProperty(job, 'tree') ||
    readRequiredProperty(state.context, 'nonce') !== readRequiredProperty(job, 'nonce') ||
    readRequiredProperty(state.context, 'compositionId') !== readRequiredProperty(job, 'compositionId')
  )
    refuse();
}

/** Fixed worker emits each phase immediately after the real owned operation.
 * @param {unknown} handle @param {unknown} phase @param {unknown} body
 */
export async function emitHttpOriginalPhase(handle, phase, body) {
  const state = channelFor(handle);
  if (arguments.length !== 3 || !includesUnknown(phases, phase) || includesUnknown(['start', 'terminal'], phase)) {
    state.failed = true;
    refuse();
  }
  await sendLive(state, phase, body);
}

/** Terminal names actual private result bytes; it grants no standalone qualification.
 * @param {unknown} handle @param {unknown} resultArtifactSha256
 */
export async function finishHttpOriginalChannel(handle, resultArtifactSha256) {
  const state = channelFor(handle);
  if (
    arguments.length !== 2 ||
    !hash(resultArtifactSha256) ||
    state.frames.length !== phases.length - 1
  ) {
    state.failed = true;
    refuse();
  }
  await sendLive(state, 'terminal', {
    phaseCount: state.frames.length,
    phaseSha256: digest(state.frames),
    resultArtifactSha256,
    parentCorroborationRequired: true,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  });
  state.closed = true;
  activeChannel = undefined;
  return {
    closed: true,
    frameCount: state.frames.length,
    parentCorroborationRequired: true,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}
