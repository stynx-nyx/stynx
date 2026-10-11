import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { types } from 'node:util';

// Own native acquisition as well as cleanup. A report/PID/ChildProcess supplied
// by a caller can never mint a resource obligation in this component.
const operations = new WeakMap();
const nativeSpawn = spawn;
const nativeGroupProbe = process.kill;
const bufferLimit = 64 * 1024 * 1024;
const cleanupWaitMs = 5000;
const observerNames = ['stdout', 'stderr', 'message', 'error', 'exit', 'close'];
const nativeCodes = new Set(['ENOENT', 'EACCES', 'EPERM', 'ESRCH', 'ENOTDIR', 'EMFILE', 'ENFILE']);

function fixedCode(error) {
  return nativeCodes.has(error?.code) ? error.code : 'OTHER';
}

function fail(code = 'HTTP_OWNED_WORKER_INVALID') {
  const error = new Error('Owned HTTP worker operation refused');
  error.code = code;
  throw error;
}

function stateFor(handle) {
  const state = operations.get(handle);
  if (!state) fail();
  return state;
}

function dataObject(value) {
  return (
    value &&
    !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).every(
      (key) =>
        typeof key === 'string' &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value') &&
        Object.getOwnPropertyDescriptor(value, key).enumerable === true,
    )
  );
}

function immutable(value) {
  const copy = structuredClone(value);
  const pending = [copy];
  const seen = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const value of Object.values(current)) pending.push(value);
    Object.freeze(current);
  }
  return copy;
}

function journal(state, kind, details = {}) {
  state.events.push(Object.freeze({ sequence: state.events.length + 1, kind, ...details }));
}

function projection(state) {
  return {
    schemaVersion: 1,
    scope: 'owned-http-worker-component',
    ...(state.nativeGenerator ? { nativeGenerator: true, privateIpc: false } : {}),
    operationId: state.operationId,
    status: state.status,
    pid: state.pid,
    launchAttempted: state.launchAttempted,
    launchIdentitySha256: state.launchIdentitySha256 ?? null,
    nativeChildAcquired: !!state.child,
    spawnObserved: state.spawnObserved,
    spawnErrorObserved: state.spawnErrorObserved,
    errorCount: state.errorCount,
    exitObserved: state.exitObserved,
    closeObserved: state.closeObserved,
    disconnectObserved: state.disconnectObserved === true,
    exit: state.exit ?? null,
    close: state.close ?? null,
    groupOutcome: state.groupOutcome,
    groupNativeCode: state.groupNativeCode,
    absenceBasis: state.absenceBasis ?? null,
    subscriberFailureCount: state.subscriberFailureCount,
    bufferingFailure: state.bufferingFailure,
    events: state.events,
    complete: !!state.receipt,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}

function delivered(state, kind, payload) {
  const callback = state.observers?.[kind];
  if (!callback) return;
  try {
    const copy = Buffer.isBuffer(payload) ? Buffer.from(payload) : immutable(payload);
    const returned = Reflect.apply(callback, undefined, [copy]);
    if (returned !== undefined) {
      // Observers are synchronous parsers/subscribers, not an asynchronous
      // ownership continuation. Never let their result settle a native fact.
      if (types.isPromise(returned)) returned.catch(() => {});
      state.subscriberFailureCount++;
      journal(state, 'SUBSCRIBER_RESULT', { eventKind: kind });
    }
  } catch {
    state.subscriberFailureCount++;
    journal(state, 'SUBSCRIBER_THROW', { eventKind: kind });
  }
}

function forward(state, kind, payload) {
  if (state.observers) return delivered(state, kind, payload);
  // Native streams always drain even if no parser has attached yet. Bound the
  // pending data; an overflow stays visible without losing native close state.
  let byteLength;
  try {
    byteLength = Buffer.isBuffer(payload)
      ? payload.length
      : Buffer.byteLength(JSON.stringify(payload));
  } catch {
    state.bufferingFailure = true;
    journal(state, 'BUFFER_INVALID', { eventKind: kind });
    return;
  }
  state.bufferedBytes += byteLength;
  if (state.bufferedBytes > bufferLimit || state.buffered.length >= 1024) {
    if (!state.bufferingFailure) journal(state, 'BUFFER_BOUND', { eventKind: kind });
    state.bufferingFailure = true;
    return;
  }
  try {
    state.buffered.push({
      kind,
      payload: Buffer.isBuffer(payload) ? Buffer.from(payload) : immutable(payload),
    });
  } catch {
    state.bufferingFailure = true;
    journal(state, 'BUFFER_INVALID', { eventKind: kind });
  }
}

/** Allocate before launch; the parent stores this opaque key before effects. */
export function createOwnedHttpWorker() {
  if (arguments.length !== 0) fail();
  const handle = Object.freeze({});
  let resolveClose;
  const closePromise = new Promise((accept) => {
    resolveClose = accept;
  });
  const state = {
    operationId: randomUUID(),
    status: 'NEVER_LAUNCHED',
    pid: null,
    launchAttempted: false,
    spawnObserved: false,
    spawnErrorObserved: false,
    errorCount: 0,
    exitObserved: false,
    closeObserved: false,
    groupOutcome: 'UNOBSERVED',
    groupNativeCode: null,
    events: [],
    buffered: [],
    bufferedBytes: 0,
    bufferingFailure: false,
    subscriberFailureCount: 0,
    closePromise,
    resolveClose,
  };
  operations.set(handle, state);
  return handle;
}

/** No caller process/native functions/options may be adopted. */
export function launchOwnedHttpWorker(handle, request) {
  if (arguments.length !== 2) fail();
  return launchOwned(handle, request, true);
}

/** Native generators do not inherit Node IPC descriptors or Node channel env.
 * This acquires process custody only; it does not admit executable/workload data.
 */
export function launchOwnedHttpNativeGenerator(handle, request) {
  if (arguments.length !== 2) fail();
  return launchOwned(handle, request, false);
}

function launchOwned(handle, request, ipc) {
  const state = stateFor(handle);
  if (
    state.launchAttempted ||
    state.receipt ||
    !dataObject(request) ||
    Object.keys(request).sort().join(',') !== 'argv,cwd,environment,executable' ||
    typeof request.executable !== 'string' ||
    !isAbsolute(request.executable) ||
    request.executable.includes('\0') ||
    typeof request.cwd !== 'string' ||
    !isAbsolute(request.cwd) ||
    request.cwd.includes('\0') ||
    !Array.isArray(request.argv) ||
    types.isProxy(request.argv) ||
    Object.getPrototypeOf(request.argv) !== Array.prototype ||
    Reflect.ownKeys(request.argv).length !== request.argv.length + 1 ||
    !Array.from({ length: request.argv.length }, (_, index) =>
      Object.getOwnPropertyDescriptor(request.argv, String(index)),
    ).every(
      (row) =>
        row &&
        Object.hasOwn(row, 'value') &&
        typeof row.value === 'string' &&
        !row.value.includes('\0'),
    ) ||
    !dataObject(request.environment) ||
    Object.entries(request.environment).some(
      ([key, value]) =>
        !key ||
        key.includes('=') ||
        key.includes('\0') ||
        typeof value !== 'string' ||
        value.includes('\0'),
    )
  )
    fail();
  const launch = immutable(request);
  state.nativeGenerator = !ipc;
  state.privateIpc = ipc;
  state.launchAttempted = true;
  state.status = 'LAUNCH_ATTEMPTED';
  state.launchIdentitySha256 = createHash('sha256').update(JSON.stringify(launch)).digest('hex');
  journal(state, 'LAUNCH_ATTEMPTED');
  let child;
  try {
    child = nativeSpawn(launch.executable, launch.argv, {
      cwd: launch.cwd,
      env: launch.environment,
      detached: true,
      shell: false,
      stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
      ...(ipc ? { serialization: 'json' } : {}),
    });
    // Retain before parser/callback setup or any other fallible operation.
    state.child = child;
    state.pid = Number.isSafeInteger(child.pid) && child.pid > 0 ? child.pid : null;
    state.kill = child.kill;
    state.send = child.send;
    state.status = 'CHILD_LIVE';
    journal(state, 'NATIVE_CHILD_ACQUIRED', { pid: state.pid });
    child.once('spawn', () => {
      state.spawnObserved = true;
      journal(state, 'SPAWN', { pid: state.pid });
    });
    child.on('error', (error) => {
      state.errorCount++;
      const code = fixedCode(error);
      if (!state.spawnObserved && state.pid === null) {
        state.spawnErrorObserved = true;
        state.status = 'FAILED_NATIVE_SPAWN';
      }
      journal(state, 'ERROR', { code, failedNativeSpawn: state.spawnErrorObserved });
      forward(state, 'error', { code, failedNativeSpawn: state.spawnErrorObserved });
    });
    child.once('exit', (code, signal) => {
      state.exitObserved = true;
      state.exit = Object.freeze({ code, signal });
      journal(state, 'EXIT', state.exit);
      forward(state, 'exit', state.exit);
    });
    child.once('close', (code, signal) => {
      state.closeObserved = true;
      state.close = Object.freeze({ code, signal });
      journal(state, 'CLOSE', state.close);
      state.resolveClose(immutable(state.close));
      forward(state, 'close', state.close);
    });
    child.once('disconnect', () => {
      state.disconnectObserved = true;
      journal(state, 'DISCONNECT');
    });
    child.on('message', (message) => forward(state, 'message', message));
    for (const [name, stream] of [
      ['stdout', child.stdout],
      ['stderr', child.stderr],
    ]) {
      stream.on('data', (chunk) => forward(state, name, chunk));
      stream.on('error', () => {
        state.bufferingFailure = true;
        journal(state, 'STREAM_ERROR', { eventKind: name });
      });
    }
  } catch {
    state.status = 'UNKNOWN';
    journal(state, child ? 'NATIVE_TRACKING_FAILED' : 'SPAWN_SYNCHRONOUS_THROW');
    fail('HTTP_OWNED_WORKER_LAUNCH_FAILED');
  }
  return snapshotOwnedHttpWorker(handle);
}

/** Only copied data and controlled native event facts cross this boundary. */
export function observeOwnedHttpWorker(handle, observers) {
  const state = stateFor(handle);
  if (
    arguments.length !== 2 ||
    !state.child ||
    state.observers ||
    !dataObject(observers) ||
    Object.keys(observers).length === 0 ||
    Object.entries(observers).some(
      ([name, callback]) =>
        !observerNames.includes(name) ||
        typeof callback !== 'function' ||
        types.isProxy(callback) ||
        types.isAsyncFunction(callback) ||
        types.isGeneratorFunction(callback),
    )
  )
    fail();
  state.observers = Object.freeze({ ...observers });
  const buffered = state.buffered;
  state.buffered = [];
  for (const row of buffered) delivered(state, row.kind, row.payload);
}

export function snapshotOwnedHttpWorker(handle) {
  if (arguments.length !== 1) fail();
  const state = stateFor(handle);
  return immutable(state.receipt ?? projection(state));
}

export function waitOwnedHttpWorkerClose(handle) {
  if (arguments.length !== 1) fail();
  const state = stateFor(handle);
  if (!state.launchAttempted || !state.child) fail();
  return state.closePromise;
}

/** Plain JSON IPC only; no server/sendHandle or supplied callback capability. */
export function sendOwnedHttpWorker(handle, frame) {
  if (arguments.length !== 2 || !dataObject(frame)) fail();
  const state = stateFor(handle);
  if (
    !state.privateIpc ||
    !state.child ||
    state.closeObserved ||
    state.receipt ||
    !state.child.connected
  )
    fail();
  const pending = [frame];
  let population = 0;
  while (pending.length) {
    const value = pending.pop();
    if (++population > 100_000) fail();
    if (
      value === null ||
      ['boolean', 'string'].includes(typeof value) ||
      (typeof value === 'number' && Number.isFinite(value))
    )
      continue;
    if (!value || typeof value !== 'object' || types.isProxy(value)) fail();
    if (Array.isArray(value)) {
      if (
        Object.getPrototypeOf(value) !== Array.prototype ||
        Reflect.ownKeys(value).length !== value.length + 1
      )
        fail();
      for (let index = 0; index < value.length; index++) {
        const row = Object.getOwnPropertyDescriptor(value, String(index));
        if (!row || !Object.hasOwn(row, 'value')) fail();
        pending.push(row.value);
      }
    } else {
      if (!dataObject(value)) fail();
      for (const entry of Object.values(value)) pending.push(entry);
    }
  }
  const copy = structuredClone(frame);
  if (Buffer.byteLength(JSON.stringify(copy)) > 32 * 1024 * 1024) fail();
  try {
    return Reflect.apply(state.send, state.child, [
      copy,
      (error) => {
        if (error) journal(state, 'SEND_ERROR', { code: fixedCode(error) });
      },
    ]);
  } catch {
    journal(state, 'SEND_THROW');
    fail('HTTP_OWNED_WORKER_SEND_FAILED');
  }
}

export function terminateOwnedHttpWorker(handle) {
  if (arguments.length !== 1) fail();
  const state = stateFor(handle);
  if (state.receipt) return immutable({ attempted: false, reason: 'COMPLETE' });
  const child = state.child;
  if (
    !child ||
    state.pid === null ||
    state.exitObserved ||
    state.closeObserved ||
    child.exitCode !== null ||
    child.signalCode !== null
  )
    return immutable({ attempted: false, reason: 'NOT_LIVE' });
  let outcome;
  try {
    outcome = Reflect.apply(state.kill, child, ['SIGKILL']);
    journal(state, 'DIRECT_KILL', { returned: outcome === true });
  } catch {
    journal(state, 'DIRECT_KILL_THROW');
    return immutable({ attempted: true, returned: false, threw: true });
  }
  return immutable({ attempted: true, returned: outcome === true, threw: false });
}

function groupAbsent(state) {
  if (!state.closeObserved) return false;
  if (state.pid === null) {
    if (state.spawnErrorObserved && !state.spawnObserved) {
      state.absenceBasis = 'NATIVE_SPAWN_ERROR_AND_CLOSE_NO_GROUP';
      return true;
    }
    return false;
  }
  if (process.platform === 'win32') {
    state.groupOutcome = 'UNKNOWN';
    state.groupNativeCode = 'UNSUPPORTED_HOST';
    journal(state, 'GROUP_PROBE', { outcome: 'UNKNOWN', code: 'UNSUPPORTED_HOST' });
    return false;
  }
  try {
    Reflect.apply(nativeGroupProbe, process, [-state.pid, 0]);
    state.groupOutcome = 'PRESENT';
    state.groupNativeCode = null;
  } catch (error) {
    state.groupNativeCode = fixedCode(error);
    state.groupOutcome = state.groupNativeCode === 'ESRCH' ? 'ABSENT' : 'UNKNOWN';
  }
  journal(state, 'GROUP_PROBE', { outcome: state.groupOutcome, code: state.groupNativeCode });
  if (state.groupOutcome === 'ABSENT') state.absenceBasis = 'NATIVE_CLOSE_AND_GROUP_ESRCH';
  return state.groupOutcome === 'ABSENT';
}

function complete(state) {
  state.status = 'COMPLETE';
  // The terminal meaning and journal are immutable, never reprobed against a
  // later process that happens to reuse this numeric PID/group.
  state.receipt = immutable({ ...projection(state), complete: true });
  return state.receipt;
}

/** Shared pending cleanup; unresolved facts remain owned and can be retried. */
export function reapOwnedHttpWorker(handle) {
  if (arguments.length !== 1) fail();
  const state = stateFor(handle);
  if (state.receipt) return Promise.resolve(state.receipt);
  if (state.pending) return state.pending;
  const pending = Promise.resolve().then(async () => {
    state.status = 'REAP_PENDING';
    if (!state.launchAttempted) {
      state.absenceBasis = 'NO_LAUNCH_ATTEMPT';
      return complete(state);
    }
    if (!state.child) {
      state.status = 'INCOMPLETE';
      fail('HTTP_REFERENCE_CHILD_CLEANUP_INCOMPLETE');
    }
    terminateOwnedHttpWorker(handle);
    if (!state.closeObserved) {
      let deadline;
      try {
        await Promise.race([
          state.closePromise,
          new Promise((accept) => {
            deadline = setTimeout(accept, cleanupWaitMs);
          }),
        ]);
      } finally {
        clearTimeout(deadline);
      }
    }
    if (!state.closeObserved || !groupAbsent(state)) {
      state.status = 'INCOMPLETE';
      fail('HTTP_REFERENCE_CHILD_CLEANUP_INCOMPLETE');
    }
    return complete(state);
  });
  state.pending = pending;
  const release = () => {
    if (state.pending === pending) state.pending = undefined;
  };
  pending.then(release, release);
  return pending;
}
