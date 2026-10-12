import { isDeepStrictEqual } from 'node:util';
import { serializeHttpRuntimePlainJson } from './http-runtime-protocol.mjs';

// Worker-only, exact private IPC parent commands. No request/sample/callback
// payload is accepted; the parent retains actual generator/raw ownership.
const operations = new WeakMap();
let active;
const nativeOn = process.on;
const nativeRemove = process.removeListener;
const names = ['begin-measurement', 'finish-measurement'];
function fail() {
  const error = new Error('Closed qualification parent exchange refused');
  error.code = 'HTTP_QUALIFICATION_EXCHANGE_INVALID';
  throw error;
}
export function openHttpQualificationParentExchange(job) {
  if (
    arguments.length !== 1 ||
    active ||
    job.mode !== 'http-endpoint-qualification' ||
    process.ppid !== job.parentPid ||
    !process.connected ||
    process.on !== nativeOn ||
    process.removeListener !== nativeRemove
  )
    fail();
  const handle = Object.freeze({});
  const state = { handle, job, received: [], waiting: null, failure: false, closed: false };
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
            'caseId',
            'command',
            'body',
          ].sort(),
        ) ||
        frame.schemaVersion !== 1 ||
        frame.mode !== job.mode ||
        frame.operationId !== job.qualification.operationId ||
        frame.nonce !== job.nonce ||
        frame.candidateCommit !== job.candidateCommit ||
        frame.tree !== job.tree ||
        frame.workerPid !== process.pid ||
        frame.caseId !== job.qualification.caseId ||
        frame.command !== names[state.received.length]
      )
        fail();
      state.received.push(frame);
      state.waiting?.accept(frame.body);
      state.waiting = null;
    } catch {
      state.failure = true;
      state.waiting?.reject(new Error('Closed qualification parent command refused'));
      state.waiting = null;
    }
  };
  operations.set(handle, state);
  active = state;
  Reflect.apply(nativeOn, process, ['message', state.listener]);
  return handle;
}
export function waitHttpQualificationParentCommand(handle, command) {
  const state = operations.get(handle);
  const index = names.indexOf(command);
  if (
    arguments.length !== 2 ||
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
export function closeHttpQualificationParentExchange(handle) {
  const state = operations.get(handle);
  if (
    arguments.length !== 1 ||
    state !== active ||
    state.closed ||
    process.removeListener !== nativeRemove
  )
    fail();
  Reflect.apply(nativeRemove, process, ['message', state.listener]);
  state.closed = true;
  active = undefined;
  if (state.waiting) {
    state.waiting.reject(new Error('Qualification exchange closed'));
    state.waiting = null;
  }
  return {
    commandCount: state.received.length,
    refused: state.failure,
    complete: !state.failure && state.received.length === 2,
    readinessPromoting: false,
  };
}
