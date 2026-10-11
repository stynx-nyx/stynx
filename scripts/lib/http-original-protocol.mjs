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
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const commit = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const natural = (value) => Number.isSafeInteger(value) && value >= 0;
const positive = (value) => natural(value) && value > 0;
const digest = (value) =>
  createHash('sha256').update(serializeHttpRuntimePlainJson(value)).digest('hex');
const nanos = (value) => typeof value === 'string' && /^(0|[1-9][0-9]{0,14})$/u.test(value);
const seconds = (value) => BigInt(value) * 1_000_000_000n;

function refuse() {
  const error = new Error('Closed original HTTP scenario component wire refused');
  error.code = 'HTTP_ORIGINAL_PROTOCOL_INVALID';
  throw error;
}
function exact(value, keys) {
  return (
    !!value &&
    !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
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
function copy(value) {
  return JSON.parse(serializeHttpRuntimePlainJson(value));
}
function validContext(value) {
  return (
    exact(value, contextKeys) &&
    commit(value.candidateCommit) &&
    commit(value.tree) &&
    uuid(value.nonce) &&
    uuid(value.operationId) &&
    positive(value.workerPid) &&
    value.compositionId === 'reference' &&
    ['auth', 'crud', 'upload', 'cascade-delete'].includes(value.scenarioId) &&
    ['local', 'hardening'].includes(value.profileId) &&
    ['profileSha256', 'manifestSha256', 'fixtureSha256', 'controlClosureSha256'].every((key) =>
      hash(value[key]),
    )
  );
}

/** Validate a closed received transcript, never caller samples or measurement authority. */
export function createHttpOriginalProtocol(expected) {
  if (arguments.length !== 1 || !validContext(expected)) refuse();
  const context = copy(expected);
  const profile = httpOriginalScenarioProfile({
    scenarioId: context.scenarioId,
    profileId: context.profileId,
  });
  const nominal = profile.nominalProfile;
  const captured = [];
  const admitted = [];
  const times = new Map();
  let failed = false;
  let finished = false;
  let captureComplete = true;
  let bytes = 0;
  let listener;
  let preparationSha256;
  let generatorOperationId;
  let measurement;
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
          ['fixtureSha256', 'controlClosureSha256', 'profileSha256', 'manifestSha256'].every(
            (key) => body[key] === context[key],
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
          ['layerCount', 'controllerCount', 'routeCount'].every((key) => positive(body[key])) &&
          hash(body.runtimeObjectSnapshotSha256)
        );
      case 'listen':
        if (
          !exact(body, ['host', 'port']) ||
          body.host !== '127.0.0.1' ||
          !positive(body.port) ||
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
          body.profileSha256 !== context.profileSha256 ||
          !hash(body.evidenceSha256) ||
          !['trafficCount', 'sqlEffectCount', 'objectEffectCount'].every((key) =>
            natural(body[key]),
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
          body.host === listener.host &&
          body.port === listener.port &&
          body.profileSha256 === context.profileSha256 &&
          body.manifestSha256 === context.manifestSha256 &&
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
          !uuid(body.generatorOperationId) ||
          body.generatorOperationId === context.operationId ||
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
          body.generatorOperationId !== generatorOperationId ||
          !hash(body.rawArtifactsSha256) ||
          !['COMPLETED', 'FAILED'].includes(body.outcome) ||
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
  function receive(input) {
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
      frame = JSON.parse(serialized);
      captured.push(frame); // Preserve bounded rejected frames before admission.
      if (
        failed ||
        finished ||
        admitted.length >= phases.length ||
        !exact(frame, frameKeys) ||
        frame.schemaVersion !== 1 ||
        frame.mode !== mode ||
        frame.sequence !== admitted.length + 1 ||
        frame.phase !== phases[admitted.length] ||
        !nanos(frame.elapsedNs) ||
        [
          'candidateCommit',
          'tree',
          'nonce',
          'operationId',
          'workerPid',
          'compositionId',
          'scenarioId',
          'profileId',
        ].some((key) => frame[key] !== context[key])
      )
        refuse();
      const time = BigInt(frame.elapsedNs);
      const previous = admitted.at(-1);
      if (
        time > seconds(profile.workerDeadlineSeconds) ||
        (previous && time < BigInt(previous.elapsedNs)) ||
        (!previous && time !== 0n) ||
        !validBody(frame.phase, frame.body)
      )
        refuse();
      times.set(frame.phase, time);
      if (['factory', 'init', 'listen'].includes(frame.phase) && time > seconds(30)) refuse();
      if (
        ['preparation-complete', 'ready'].includes(frame.phase) &&
        time - times.get('listen') > seconds(180)
      )
        refuse();
      if (
        frame.phase === 'measurement-complete' &&
        ((measurement.outcome === 'COMPLETED' &&
          time - times.get('measurement-start') < seconds(nominal.durationSeconds)) ||
          time - times.get('measurement-start') > seconds(nominal.durationSeconds + 60))
      )
        refuse();
      if (frame.phase === 'close' && time - times.get('measurement-complete') > seconds(30))
        refuse();
      if (['final', 'terminal'].includes(frame.phase) && time - times.get('close') > seconds(30))
        refuse();
      admitted.push(frame);
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
    finish(exit) {
      try {
        if (
          arguments.length !== 1 ||
          failed ||
          finished ||
          admitted.length !== phases.length ||
          !captureComplete ||
          !exact(exit, ['workerPid', 'code', 'signal', 'operationId']) ||
          exit.workerPid !== context.workerPid ||
          exit.code !== 0 ||
          exit.signal !== null ||
          exit.operationId !== context.operationId
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

const channels = new WeakMap();
let activeChannel;
const nativeMonotonic = process.hrtime.bigint;
const nativeHrtime = process.hrtime;
function channelFor(handle) {
  const state = channels.get(handle);
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
async function sendLive(state, phase, body) {
  channelFor(state.handle);
  const frame = copy({
    schemaVersion: 1,
    mode,
    sequence: state.frames.length + 1,
    phase,
    candidateCommit: state.context.candidateCommit,
    tree: state.context.tree,
    nonce: state.context.nonce,
    operationId: state.context.operationId,
    workerPid: process.pid,
    compositionId: state.context.compositionId,
    scenarioId: state.context.scenarioId,
    profileId: state.context.profileId,
    elapsedNs: phase === 'start' ? '0' : (nativeMonotonic() - state.startedAt).toString(),
    body,
  });
  if (!state.protocol.receive(frame)) {
    state.failed = true;
    refuse();
  }
  state.sending = true;
  try {
    await new Promise((resolve, reject) => {
      Reflect.apply(state.send, process, [frame, (error) => (error ? reject(error) : resolve())]);
    });
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

/** Actual IPC channel; immutable job/manifest/build custody remains the parent's obligation. */
export async function openHttpOriginalChannel(job) {
  if (
    arguments.length !== 1 ||
    activeChannel ||
    job?.mode !== mode ||
    typeof process.send !== 'function' ||
    !process.connected ||
    !exact(job.originalScenario, [
      'operationId',
      'scenarioId',
      'profileId',
      'profileSha256',
      'manifestSha256',
    ]) ||
    !job.referenceFixture ||
    !Array.isArray(job.controls)
  )
    refuse();
  const context = {
    candidateCommit: job.candidateCommit,
    tree: job.tree,
    nonce: job.nonce,
    operationId: job.originalScenario.operationId,
    workerPid: process.pid,
    compositionId: job.compositionId,
    scenarioId: job.originalScenario.scenarioId,
    profileId: job.originalScenario.profileId,
    profileSha256: job.originalScenario.profileSha256,
    manifestSha256: job.originalScenario.manifestSha256,
    fixtureSha256: digest(job.referenceFixture),
    controlClosureSha256: digest(job.controls),
  };
  if (
    !validContext(context) ||
    job.referenceFixture.identity?.candidateCommit !== context.candidateCommit ||
    job.referenceFixture.identity?.tree !== context.tree ||
    job.referenceFixture.identity?.nonce !== context.nonce
  )
    refuse();
  const handle = Object.freeze(Object.create(null));
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

/** Internal actual worker binding, never a serialized caller capability. */
export function assertHttpOriginalChannel(handle, job) {
  const state = channelFor(handle);
  if (
    arguments.length !== 2 ||
    job.mode !== mode ||
    state.context.operationId !== job.originalScenario.operationId ||
    state.context.scenarioId !== job.originalScenario.scenarioId ||
    state.context.profileId !== job.originalScenario.profileId ||
    state.context.profileSha256 !== job.originalScenario.profileSha256 ||
    state.context.manifestSha256 !== job.originalScenario.manifestSha256 ||
    state.context.candidateCommit !== job.candidateCommit ||
    state.context.tree !== job.tree ||
    state.context.nonce !== job.nonce ||
    state.context.compositionId !== job.compositionId
  )
    refuse();
}

/** Fixed worker emits each phase immediately after the real owned operation. */
export async function emitHttpOriginalPhase(handle, phase, body) {
  const state = channelFor(handle);
  if (arguments.length !== 3 || !phases.includes(phase) || ['start', 'terminal'].includes(phase)) {
    state.failed = true;
    refuse();
  }
  await sendLive(state, phase, body);
}

/** Terminal names actual private result bytes; it grants no standalone qualification. */
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
