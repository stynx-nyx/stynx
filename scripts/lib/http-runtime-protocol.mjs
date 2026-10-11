import { Buffer } from 'node:buffer';
import { types } from 'node:util';

const frameLimit = 32 * 1024 * 1024;
const captureLimit = 64 * 1024 * 1024;

function plainJson(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || types.isProxy(value) || seen.has(value)) return false;
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) return false;
  seen.add(value);
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (array && key === 'length') continue;
    if (
      array &&
      (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)
    )
      return false;
    if (
      typeof key !== 'string' ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, 'value') ||
      !plainJson(descriptor.value, seen)
    )
      return false;
  }
  if (array && keys.length !== value.length + 1) return false;
  seen.delete(value);
  return true;
}

function invalid() {
  const error = new Error('Runtime worker did not complete its closed diagnostic protocol');
  error.code = 'HTTP_RUNTIME_PROTOCOL_INVALID';
  throw error;
}

function safePlainJson(value) {
  try {
    return plainJson(value);
  } catch {
    return false;
  }
}

// JSON.stringify consults inherited toJSON hooks before its replacer. Build a
// descriptor-only data copy with no object OR array prototype first. Callers
// below have already validated the complete input as plain JSON data.
function stringifyPlainJson(value) {
  const copy = (item) => {
    if (item === null || typeof item !== 'object') return item;
    const result = Array.isArray(item) ? [] : Object.create(null);
    if (Array.isArray(item)) Object.setPrototypeOf(result, null);
    for (const key of Object.keys(item))
      result[key] = copy(Object.getOwnPropertyDescriptor(item, key).value);
    return result;
  };
  return JSON.stringify(copy(value));
}

function ownFields(value, names) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    names.every((name) => Object.hasOwn(value, name))
  );
}

/**
 * The actual supervisor uses this component for parsed IPC frame admission.
 * Context supplied to this lower-level component never proves process custody.
 */
export function createHttpRuntimeProtocol(context) {
  if (
    arguments.length !== 1 ||
    !context ||
    !safePlainJson(context) ||
    Array.isArray(context) ||
    Object.keys(context).sort().join(',') !== 'candidateCommit,mode,nonce,pid' ||
    typeof context.candidateCommit !== 'string' ||
    typeof context.nonce !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(context.candidateCommit) ||
    !/^[a-f0-9-]{36}$/u.test(context.nonce) ||
    !Number.isSafeInteger(context.pid) ||
    context.pid <= 0 ||
    context.mode !== 'bootstrap-module-only'
  )
    invalid();
  const expected = { ...context };
  let started = false;
  let terminalSeen = false;
  let terminal;
  let refused = false;
  let finished = false;
  let observedFrames = 0;
  let observedBytes = 0;
  let captureComplete = true;
  const frames = [];
  const reject = () => {
    refused = true;
    return false;
  };

  function receive(value) {
    observedFrames++;
    let serialized;
    try {
      if (!safePlainJson(value)) {
        captureComplete = false;
        return reject();
      }
      serialized = stringifyPlainJson(value);
      if (typeof serialized !== 'string') {
        captureComplete = false;
        return reject();
      }
    } catch {
      captureComplete = false;
      return reject();
    }
    const bytes = Buffer.byteLength(serialized);
    observedBytes += bytes;
    if (bytes > frameLimit || observedBytes > captureLimit || observedFrames > 1024) {
      captureComplete = false;
      return reject();
    }
    // Preserve the actual parsed message, before validation. This is an exact
    // JSON reserialization, not Node's already-consumed transport wire bytes.
    frames.push(serialized);
    if (refused || finished) return reject();
    const frame = JSON.parse(serialized);
    if (
      !frame ||
      typeof frame !== 'object' ||
      Array.isArray(frame) ||
      Object.keys(frame).sort().join(',') !==
        'candidateCommit,kind,nonce,pid,result,schemaVersion' ||
      frame.schemaVersion !== 1 ||
      frame.nonce !== expected.nonce ||
      frame.candidateCommit !== expected.candidateCommit ||
      frame.pid !== expected.pid
    )
      return reject();
    if (frame.kind === 'start') {
      if (
        started ||
        terminalSeen ||
        !frame.result ||
        typeof frame.result !== 'object' ||
        Array.isArray(frame.result) ||
        Object.keys(frame.result).join(',') !== 'mode' ||
        frame.result.mode !== expected.mode
      )
        return reject();
      started = true;
      return true;
    }
    if (frame.kind !== 'terminal' || terminalSeen) return reject();
    // A malformed/falsy first terminal is still a terminal attempt. Refusal is
    // sticky; a later plausible terminal cannot repair its history.
    terminalSeen = true;
    if (
      !started ||
      !frame.result ||
      typeof frame.result !== 'object' ||
      Array.isArray(frame.result) ||
      Object.keys(frame.result).sort().join(',') !==
        'modules,observation,readinessPromoting,runtimeCustodyComplete,trustedBootstrap' ||
      frame.result.runtimeCustodyComplete !== false ||
      frame.result.readinessPromoting !== false ||
      !ownFields(frame.result.observation, [
        'scope',
        'factoryInvoked',
        'actualNamedExportObserved',
      ]) ||
      !ownFields(frame.result.modules, [
        'complete',
        'readinessPromoting',
        'resolutions',
        'evaluations',
      ]) ||
      frame.result.observation?.scope !== expected.mode ||
      frame.result.observation?.factoryInvoked !== false ||
      frame.result.observation?.actualNamedExportObserved !== true ||
      frame.result.modules?.complete !== false ||
      frame.result.modules?.readinessPromoting !== false ||
      !Array.isArray(frame.result.modules.resolutions) ||
      !Array.isArray(frame.result.modules.evaluations) ||
      !Array.isArray(frame.result.trustedBootstrap)
    )
      return reject();
    terminal = frame.result;
    return true;
  }

  function finish(exit) {
    if (finished) {
      reject();
      invalid();
    }
    finished = true;
    if (
      refused ||
      !captureComplete ||
      !started ||
      !terminalSeen ||
      !terminal ||
      !exit ||
      !safePlainJson(exit) ||
      Array.isArray(exit) ||
      Object.keys(exit).sort().join(',') !== 'code,signal' ||
      exit.code !== 0 ||
      exit.signal !== null
    ) {
      reject();
      invalid();
    }
    return structuredClone(terminal);
  }

  function snapshot() {
    return {
      schemaVersion: 1,
      expected: { ...expected },
      representation: 'Node IPC parsed JSON reserialization; not transport wire bytes',
      observedFrames,
      observedBytes,
      captureComplete,
      frames: frames.map((serialized) => JSON.parse(serialized)),
      started,
      terminalSeen,
      refused,
      finished,
      processCustodyQualified: false,
      readinessPromoting: false,
    };
  }

  function captureArtifact(supervisorFailure) {
    if (
      arguments.length !== 1 ||
      ![null, 'HTTP_RUNTIME_WORKER_INVALID', 'HTTP_RUNTIME_CAPTURE_INVALID'].includes(
        supervisorFailure,
      )
    )
      invalid();
    const capture = { ...snapshot(), supervisorFailure };
    let body = stringifyPlainJson(capture);
    let overflowed = false;
    if (Buffer.byteLength(body) > captureLimit) {
      overflowed = true;
      refused = true;
      captureComplete = false;
      body = stringifyPlainJson({
        schemaVersion: 1,
        expected: { ...expected },
        representation: capture.representation,
        observedFrames,
        observedBytes,
        captureComplete: false,
        captureOmittedReason: 'ARTIFACT_BYTE_LIMIT',
        supervisorFailure: 'HTTP_RUNTIME_CAPTURE_INVALID',
        refused: true,
        processCustodyQualified: false,
        readinessPromoting: false,
      });
    }
    return { body, byteLength: Buffer.byteLength(body), overflowed };
  }
  return Object.freeze({ receive, finish, snapshot, captureArtifact });
}
