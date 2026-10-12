import { isHttpComposition } from './http-composition-roster.mjs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  serializeHttpRuntimePlainJson,
  createHttpModuleSnapshotValidator,
} from './http-runtime-protocol.mjs';

// Disjoint lifecycle component wire. It cannot admit the module-only terminal
// or replace the separately required full worker module/startup custody proof.
const mode = 'reference-owned-loopback';
const phaseNames = ['factory', 'init', 'listen', 'healthz', 'profile', 'close', 'final'];
const frameLimit = 32 * 1024 * 1024;
const captureLimit = 64 * 1024 * 1024;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const commit = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const natural = (value) => Number.isSafeInteger(value) && value >= 0;
const positive = (value) => natural(value) && value > 0;
const exact = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const contextKeys = [
  'candidateCommit',
  'tree',
  'nonce',
  'workerPid',
  'fixtureSha256',
  'controlClosureSha256',
];
const frameKeys = [
  'schemaVersion',
  'mode',
  'sequence',
  'kind',
  'candidateCommit',
  'tree',
  'nonce',
  'workerPid',
  'body',
];

function invalid() {
  const error = new Error('Owned reference lifecycle component wire refused');
  error.code = 'HTTP_REFERENCE_LOOPBACK_PROTOCOL_INVALID';
  throw error;
}

function copy(value) {
  try {
    return JSON.parse(serializeHttpRuntimePlainJson(value));
  } catch {
    invalid();
  }
}

function validContext(context) {
  return (
    exact(context, contextKeys) &&
    commit(context.candidateCommit) &&
    commit(context.tree) &&
    uuid(context.nonce) &&
    positive(context.workerPid) &&
    hash(context.fixtureSha256) &&
    hash(context.controlClosureSha256)
  );
}

function validPhase(body, index) {
  if (body.phase !== phaseNames[index]) return false;
  switch (body.phase) {
    case 'factory':
      return (
        exact(body, [
          'phase',
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
        exact(body, ['phase', 'layerCount', 'controllerCount', 'routeCount']) &&
        positive(body.layerCount) &&
        positive(body.controllerCount) &&
        positive(body.routeCount)
      );
    case 'listen':
      return (
        exact(body, ['phase', 'host', 'port']) &&
        body.host === '127.0.0.1' &&
        positive(body.port) &&
        body.port <= 65535
      );
    case 'healthz':
    case 'profile':
      return (
        exact(body, [
          'phase',
          'path',
          'status',
          'byteLength',
          'bodySha256',
          'headersSha256',
          'securityHeadersObserved',
          'principalInjected',
        ]) &&
        body.path === (body.phase === 'healthz' ? '/healthz' : '/profile') &&
        body.status === (body.phase === 'healthz' ? 200 : 401) &&
        natural(body.byteLength) &&
        body.byteLength <= 64 * 1024 &&
        hash(body.bodySha256) &&
        hash(body.headersSha256) &&
        body.securityHeadersObserved === true &&
        body.principalInjected === false
      );
    case 'close':
      return (
        exact(body, ['phase', 'actualAppCloseResolved', 'ownedSocketCloseEventsComplete']) &&
        body.actualAppCloseResolved === true &&
        body.ownedSocketCloseEventsComplete === true
      );
    case 'final':
      return (
        exact(body, [
          'phase',
          'descriptorsRestored',
          'registrySha256',
          'middlewareSha256',
          'networkSha256',
        ]) &&
        body.descriptorsRestored === true &&
        hash(body.registrySha256) &&
        hash(body.middlewareSha256) &&
        hash(body.networkSha256)
      );
    default:
      return false;
  }
}

/** Pure validator: context data is never a substitute for a private parent handle. */
export function createReferenceLoopbackProtocol(expected) {
  if (arguments.length !== 1) invalid();
  const context = copy(expected);
  if (!validContext(context)) invalid();
  let sequence = 0,
    phase = 0,
    bytes = 0,
    started = false,
    terminal = false,
    failed = false;
  const phases = [];
  const admit = (input) => {
    if (failed) invalid();
    try {
      const frame = copy(input);
      const length = Buffer.byteLength(serializeHttpRuntimePlainJson(frame));
      bytes += length;
      if (
        length > frameLimit ||
        bytes > captureLimit ||
        terminal ||
        !exact(frame, frameKeys) ||
        frame.schemaVersion !== 1 ||
        frame.mode !== mode ||
        frame.sequence !== sequence + 1 ||
        frame.candidateCommit !== context.candidateCommit ||
        frame.tree !== context.tree ||
        frame.nonce !== context.nonce ||
        frame.workerPid !== context.workerPid
      )
        invalid();
      if (!started) {
        if (
          frame.kind !== 'start' ||
          !exact(frame.body, [
            'fixtureSha256',
            'controlClosureSha256',
            'parentCorroborationRequired',
            'componentOnly',
          ]) ||
          frame.body.fixtureSha256 !== context.fixtureSha256 ||
          frame.body.controlClosureSha256 !== context.controlClosureSha256 ||
          frame.body.parentCorroborationRequired !== true ||
          frame.body.componentOnly !== true
        )
          invalid();
        started = true;
      } else if (phase < phaseNames.length) {
        if (frame.kind !== 'phase' || !validPhase(frame.body, phase)) invalid();
        phases.push(frame.body);
        phase++;
      } else {
        if (
          frame.kind !== 'terminal' ||
          !exact(frame.body, [
            'phaseCount',
            'phaseSha256',
            'resultSha256',
            'complete',
            'moduleCustody',
            'runtimeCustodyComplete',
            'performanceQualified',
            'readinessPromoting',
            'parentCorroborationRequired',
          ]) ||
          frame.body.phaseCount !== phaseNames.length ||
          frame.body.phaseSha256 !== digest(serializeHttpRuntimePlainJson(phases)) ||
          !hash(frame.body.resultSha256) ||
          frame.body.complete !== false ||
          frame.body.moduleCustody !== 'PENDING_DISJOINT_WORKER_BINDING' ||
          frame.body.runtimeCustodyComplete !== false ||
          frame.body.performanceQualified !== false ||
          frame.body.readinessPromoting !== false ||
          frame.body.parentCorroborationRequired !== true
        )
          invalid();
        terminal = true;
      }
      sequence++;
      return true;
    } catch {
      failed = true;
      invalid();
    }
  };
  return Object.freeze({
    accept: admit,
    finish(exit) {
      if (failed) invalid();
      try {
        const observed = copy(exit);
        if (
          arguments.length !== 1 ||
          !exact(observed, ['code', 'signal', 'workerPid', 'parentCleanupVerified']) ||
          observed.code !== 0 ||
          observed.signal !== null ||
          observed.workerPid !== context.workerPid ||
          observed.parentCleanupVerified !== true ||
          !terminal ||
          phase !== phaseNames.length ||
          sequence !== 9
        )
          invalid();
        return {
          componentWireComplete: true,
          frameCount: sequence,
          phaseCount: phase,
          moduleCustody: 'PENDING_DISJOINT_WORKER_BINDING',
          parentCorroborationRequired: true,
          complete: false,
          runtimeCustodyComplete: false,
          performanceQualified: false,
          readinessPromoting: false,
        };
      } catch {
        failed = true;
        invalid();
      }
    },
  });
}

/** Fixed producer projection. It emits no new measurement and launches nothing. */
export function encodeOwnedReferenceLifecycleFrames(job, observation) {
  if (
    arguments.length !== 2 ||
    job?.mode !== mode ||
    observation?.scope !== mode ||
    observation.complete !== false ||
    observation.runtimeCustodyComplete !== false ||
    observation.performanceQualified !== false ||
    observation.readinessPromoting !== false ||
    !Array.isArray(observation.phases) ||
    observation.phases.length !== phaseNames.length
  )
    invalid();
  const context = {
    candidateCommit: job.candidateCommit,
    tree: job.tree,
    nonce: job.nonce,
    workerPid: process.pid,
    fixtureSha256: digest(serializeHttpRuntimePlainJson(job.referenceFixture)),
    controlClosureSha256: digest(serializeHttpRuntimePlainJson(job.controls)),
  };
  const protocol = createReferenceLoopbackProtocol(context);
  const frames = [];
  const append = (kind, body) => {
    const frame = {
      schemaVersion: 1,
      mode,
      sequence: frames.length + 1,
      kind,
      candidateCommit: context.candidateCommit,
      tree: context.tree,
      nonce: context.nonce,
      workerPid: context.workerPid,
      body,
    };
    protocol.accept(frame);
    frames.push(copy(frame));
  };
  append('start', {
    fixtureSha256: context.fixtureSha256,
    controlClosureSha256: context.controlClosureSha256,
    parentCorroborationRequired: true,
    componentOnly: true,
  });
  for (const phase of observation.phases) append('phase', phase);
  append('terminal', {
    phaseCount: phaseNames.length,
    phaseSha256: digest(serializeHttpRuntimePlainJson(observation.phases)),
    resultSha256: digest(serializeHttpRuntimePlainJson(observation)),
    complete: false,
    moduleCustody: 'PENDING_DISJOINT_WORKER_BINDING',
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
    parentCorroborationRequired: true,
  });
  if (
    !isDeepStrictEqual(
      frames.slice(1, -1).map((row) => row.body),
      observation.phases,
    )
  )
    invalid();
  return { context, frames };
}

const factoryEvaluationPaths = [
  'scripts/lib/http-reference-loopback-protocol.mjs',
  'scripts/lib/http-reference-network.mjs',
  'scripts/lib/http-reference-registry.mjs',
  'scripts/lib/http-reference-lifecycle.mjs',
  'scripts/lib/http-reference-nest-guard.mjs',
  'scripts/lib/http-runtime-protocol.mjs',
];
const fullContextKeys = [...contextKeys, 'moduleContext', 'observationArtifactPath'];
const fullTerminalKeys = [
  'phaseCount',
  'phaseSha256',
  'observationArtifact',
  'modules',
  'trustedBootstrap',
  'complete',
  'runtimeCustodyComplete',
  'performanceQualified',
  'readinessPromoting',
  'parentCorroborationRequired',
];

function validArtifact(value, expectedPath) {
  return (
    exact(value, ['path', 'sha256', 'byteLength', 'permissions']) &&
    value.path === expectedPath &&
    hash(value.sha256) &&
    positive(value.byteLength) &&
    value.byteLength <= captureLimit &&
    value.permissions === 0o600
  );
}

/** Full disjoint wire: actual parent process/resource corroboration stays required. */
export function createReferenceRuntimeProtocol(expected) {
  if (arguments.length !== 1) invalid();
  const context = copy(expected);
  if (
    !exact(context, fullContextKeys) ||
    !validContext(Object.fromEntries(contextKeys.map((key) => [key, context[key]]))) ||
    !isAbsolute(context.observationArtifactPath) ||
    context.moduleContext?.mode !== mode ||
    context.moduleContext?.candidateCommit !== context.candidateCommit ||
    context.moduleContext?.nonce !== context.nonce ||
    context.moduleContext?.pid !== context.workerPid ||
    context.moduleContext?.bindings?.tree !== context.tree
  )
    invalid();
  const modules = createHttpModuleSnapshotValidator(context.moduleContext);
  const required = factoryEvaluationPaths.map(
    (path) => pathToFileURL(`${context.moduleContext.bindings.cwd}/${path}`).href,
  );
  if (
    !required.every((url) =>
      context.moduleContext.bindings.roster.some(
        (row) => row.url === url && row.moduleKind === 'module',
      ),
    )
  )
    invalid();
  let failed = false,
    started = false,
    finished = false,
    observedBytes = 0,
    observedFrames = 0,
    captureComplete = true,
    terminal;
  const frames = [],
    phases = [];
  function receive(input) {
    observedFrames++;
    let frame, serialized;
    try {
      serialized = serializeHttpRuntimePlainJson(input);
      frame = JSON.parse(serialized);
    } catch {
      failed = true;
      captureComplete = false;
      return false;
    }
    const size = Buffer.byteLength(serialized);
    observedBytes += size;
    if (size > frameLimit || observedBytes > captureLimit || observedFrames > 1024) {
      failed = true;
      captureComplete = false;
      return false;
    }
    // Preserve every bounded parsed frame before semantic admission, including
    // refusals. A captured frame is never an admitted observation by itself.
    frames.push(frame);
    if (failed || finished || terminal) {
      failed = true;
      return false;
    }
    try {
      if (
        !exact(frame, frameKeys) ||
        frame.schemaVersion !== 1 ||
        frame.mode !== mode ||
        frame.sequence !== observedFrames ||
        frame.candidateCommit !== context.candidateCommit ||
        frame.tree !== context.tree ||
        frame.nonce !== context.nonce ||
        frame.workerPid !== context.workerPid
      )
        invalid();
      if (!started) {
        if (
          frame.kind !== 'start' ||
          !exact(frame.body, [
            'fixtureSha256',
            'controlClosureSha256',
            'parentCorroborationRequired',
            'componentOnly',
          ]) ||
          frame.body.fixtureSha256 !== context.fixtureSha256 ||
          frame.body.controlClosureSha256 !== context.controlClosureSha256 ||
          frame.body.parentCorroborationRequired !== true ||
          frame.body.componentOnly !== false
        )
          invalid();
        started = true;
      } else if (phases.length < phaseNames.length) {
        if (frame.kind !== 'phase' || !validPhase(frame.body, phases.length)) invalid();
        phases.push(frame.body);
      } else {
        const body = frame.body;
        if (
          frame.kind !== 'terminal' ||
          !exact(body, fullTerminalKeys) ||
          body.phaseCount !== phaseNames.length ||
          body.phaseSha256 !== digest(serializeHttpRuntimePlainJson(phases)) ||
          !validArtifact(body.observationArtifact, context.observationArtifactPath) ||
          !modules.accepts(body.modules) ||
          !required.every((url) =>
            body.modules.evaluations.some((row) => row.canonicalURL === url),
          ) ||
          !isDeepStrictEqual(
            body.trustedBootstrap,
            context.moduleContext.bindings.trustedBootstrap,
          ) ||
          body.complete !== false ||
          body.runtimeCustodyComplete !== false ||
          body.performanceQualified !== false ||
          body.readinessPromoting !== false ||
          body.parentCorroborationRequired !== true
        )
          invalid();
        terminal = body;
      }
      return true;
    } catch {
      failed = true;
      return false;
    }
  }
  return Object.freeze({
    receive,
    finish(exit) {
      let observed;
      try {
        observed = copy(exit);
      } catch {
        failed = true;
        invalid();
      }
      if (
        arguments.length !== 1 ||
        failed ||
        finished ||
        !terminal ||
        observedFrames !== 9 ||
        !exact(observed, ['code', 'signal']) ||
        observed.code !== 0 ||
        observed.signal !== null
      ) {
        failed = true;
        invalid();
      }
      finished = true;
      return copy({
        terminal,
        phases,
        parentCorroborationRequired: true,
        complete: false,
        runtimeCustodyComplete: false,
        performanceQualified: false,
        readinessPromoting: false,
      });
    },
    captureArtifact() {
      const artifact = {
        schemaVersion: 1,
        mode,
        expected: context,
        frames,
        observedFrames,
        observedBytes,
        captureComplete,
        refused: failed,
        terminalSeen: !!terminal,
        finished,
        overflowed: false,
        readinessPromoting: false,
      };
      if (Buffer.byteLength(serializeHttpRuntimePlainJson(artifact)) > captureLimit) {
        failed = true;
        captureComplete = false;
        return {
          schemaVersion: 1,
          mode,
          expectedSha256: digest(serializeHttpRuntimePlainJson(context)),
          observedFrames,
          observedBytes,
          captureComplete: false,
          refused: true,
          overflowed: true,
          captureOmittedReason: 'ARTIFACT_BYTE_LIMIT',
          readinessPromoting: false,
        };
      }
      return copy(artifact);
    },
  });
}

const channels = new WeakMap();
let activeChannel;

function channelFor(handle) {
  const state = channels.get(handle);
  if (
    !state ||
    state !== activeChannel ||
    state.closed ||
    state.failed ||
    process.pid !== state.context.workerPid ||
    !process.connected ||
    !isDeepStrictEqual(Object.getOwnPropertyDescriptor(process, 'send'), state.sendDescriptor) ||
    process.send !== state.send
  ) {
    if (state) state.failed = true;
    invalid();
  }
  return state;
}

async function sendLive(state, kind, body) {
  if (state.sending || state.failed || state.closed) invalid();
  state.sending = true;
  try {
    const frame = {
      schemaVersion: 1,
      mode,
      sequence: state.sequence + 1,
      kind,
      candidateCommit: state.context.candidateCommit,
      tree: state.context.tree,
      nonce: state.context.nonce,
      workerPid: state.context.workerPid,
      body: copy(body),
    };
    if (Buffer.byteLength(serializeHttpRuntimePlainJson(frame)) > frameLimit) invalid();
    await new Promise((accept, reject) => {
      Reflect.apply(state.send, process, [frame, (error) => (error ? reject(error) : accept())]);
    });
    channelFor(state.handle);
    state.sequence++;
  } catch (error) {
    state.failed = true;
    throw error;
  } finally {
    state.sending = false;
  }
}

/** Fixed actual IPC boundary; the returned handle cannot authenticate parent custody. */
export async function openReferenceLifecycleChannel(job) {
  if (
    arguments.length !== 1 ||
    activeChannel ||
    job?.mode !== mode ||
    !isHttpComposition(job.compositionId) ||
    typeof process.send !== 'function' ||
    !process.connected
  )
    invalid();
  const context = {
    candidateCommit: job.candidateCommit,
    tree: job.tree,
    nonce: job.nonce,
    workerPid: process.pid,
    fixtureSha256: digest(serializeHttpRuntimePlainJson(job.referenceFixture)),
    controlClosureSha256: digest(serializeHttpRuntimePlainJson(job.controls)),
  };
  if (!validContext(context)) invalid();
  const handle = Object.freeze({});
  const state = {
    handle,
    context,
    send: process.send,
    sendDescriptor: Object.getOwnPropertyDescriptor(process, 'send'),
    sequence: 0,
    phases: [],
    sending: false,
    failed: false,
    closed: false,
  };
  channels.set(handle, state);
  activeChannel = state;
  await sendLive(state, 'start', {
    fixtureSha256: context.fixtureSha256,
    controlClosureSha256: context.controlClosureSha256,
    parentCorroborationRequired: true,
    componentOnly: false,
  });
  return handle;
}

/** Validate the fixed live channel before any product factory effect. */
export function assertReferenceLifecycleChannel(handle, job) {
  const state = channelFor(handle);
  if (
    arguments.length !== 2 ||
    state.sequence !== 1 ||
    state.phases.length !== 0 ||
    job?.mode !== mode ||
    job.candidateCommit !== state.context.candidateCommit ||
    job.tree !== state.context.tree ||
    job.nonce !== state.context.nonce ||
    digest(serializeHttpRuntimePlainJson(job.referenceFixture)) !== state.context.fixtureSha256 ||
    digest(serializeHttpRuntimePlainJson(job.controls)) !== state.context.controlClosureSha256
  ) {
    state.failed = true;
    invalid();
  }
}

/** Called by the fixed lifecycle at the actual completed phase, not after replay. */
export async function emitReferenceLifecyclePhase(handle, input) {
  const state = channelFor(handle);
  try {
    const body = copy(input);
    if (arguments.length !== 2 || !validPhase(body, state.phases.length)) invalid();
    await sendLive(state, 'phase', body);
    state.phases.push(body);
  } catch (error) {
    state.failed = true;
    throw error;
  }
}

export async function finishReferenceLifecycleChannel(handle, input) {
  const state = channelFor(handle);
  let body;
  try {
    body = copy(input);
  } catch (error) {
    state.failed = true;
    throw error;
  }
  if (
    arguments.length !== 2 ||
    state.phases.length !== phaseNames.length ||
    !exact(body, ['observationArtifact', 'modules', 'trustedBootstrap'])
  ) {
    state.failed = true;
    invalid();
  }
  await sendLive(state, 'terminal', {
    phaseCount: phaseNames.length,
    phaseSha256: digest(serializeHttpRuntimePlainJson(state.phases)),
    ...body,
    complete: false,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
    parentCorroborationRequired: true,
  });
  // Irreversible; no subsequent send can reuse the channel, even after failure.
  state.closed = true;
}
