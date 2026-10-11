import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { isHttpComposition } from './http-composition-roster.mjs';
import { serializeHttpRuntimePlainJson } from './http-runtime-protocol.mjs';

// A disjoint component wire. Only the actual fresh-build parent can corroborate
// its worker, generator, manifest, raw artifacts and resources. No wire PASS.
const mode = 'http-endpoint-qualification';
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
  'caseId',
  'caseSha256',
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
  'caseId',
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
  const error = new Error('Closed HTTP qualification component wire refused');
  error.code = 'HTTP_QUALIFICATION_PROTOCOL_INVALID';
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
    isHttpComposition(value.compositionId) &&
    typeof value.caseId === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value.caseId) &&
    ['caseSha256', 'manifestSha256', 'fixtureSha256', 'controlClosureSha256'].every((key) =>
      hash(value[key]),
    )
  );
}

/** Validate a closed received transcript, never caller samples or measurement authority. */
export function createHttpQualificationProtocol(expected) {
  if (arguments.length !== 1 || !validContext(expected)) refuse();
  const context = copy(expected);
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
            'caseSha256',
            'manifestSha256',
            'parentCorroborationRequired',
          ]) &&
          ['fixtureSha256', 'controlClosureSha256', 'caseSha256', 'manifestSha256'].every(
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
            'caseSha256',
            'evidenceSha256',
            'trafficCount',
            'sqlEffectCount',
            'objectEffectCount',
          ]) ||
          body.caseSha256 !== context.caseSha256 ||
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
            'caseSha256',
            'manifestSha256',
            'preparationEvidenceSha256',
            'sessionEvidenceSha256',
          ]) &&
          body.host === listener.host &&
          body.port === listener.port &&
          body.caseSha256 === context.caseSha256 &&
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
            'scheduledTargetCount',
          ]) ||
          !uuid(body.generatorOperationId) ||
          body.generatorOperationId === context.operationId ||
          !hash(body.generatorExecutableSha256) ||
          !hash(body.generatorInputsSha256) ||
          body.durationSeconds !== 300 ||
          body.ratePerSecond !== 2 ||
          body.scheduledTargetCount !== 600
        )
          return false;
        generatorOperationId = body.generatorOperationId;
        return true;
      case 'measurement-complete':
        if (
          !exact(body, [
            'generatorOperationId',
            'rawArtifactsSha256',
            'rawOutcomeCount',
            'startedTargetCount',
            'completedTargetCount',
            'droppedTargetCount',
            'unexpectedOutcomeCount',
            'effectEvidenceSha256',
          ]) ||
          body.generatorOperationId !== generatorOperationId ||
          !hash(body.rawArtifactsSha256) ||
          !hash(body.effectEvidenceSha256) ||
          body.rawOutcomeCount !== 600 ||
          body.startedTargetCount !== 600 ||
          body.completedTargetCount !== 600 ||
          body.droppedTargetCount !== 0 ||
          !natural(body.unexpectedOutcomeCount) ||
          body.unexpectedOutcomeCount > 600
        )
          return false;
        // Unexpected outcomes remain captured; wire completion is no SLO or semantic PASS.
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
          'caseId',
        ].some((key) => frame[key] !== context[key])
      )
        refuse();
      const time = BigInt(frame.elapsedNs);
      const previous = admitted.at(-1);
      if (
        time > seconds(600) ||
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
        (time - times.get('measurement-start') < seconds(300) ||
          time - times.get('measurement-start') > seconds(330))
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
