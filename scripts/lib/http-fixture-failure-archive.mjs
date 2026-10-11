import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  opendirSync,
  realpathSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual, types } from 'node:util';
import { readHttpQualificationArtifact } from './http-qualification-artifacts.mjs';

const archives = new WeakMap();
const names = Object.freeze([
  'postgres.log',
  'object-expected.zip',
  'object-received.body',
  'capture.json',
  'cleanup.json',
]);
const directoryKeys = ['dev', 'ino', 'mode', 'uid', 'gid'];
const fileKeys = [...directoryKeys, 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
const maximumBytes = 64 * 1024 * 1024;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function refusal(code) {
  const error = new Error('Owned fixture failure archive is incomplete or changed');
  error.code = `HTTP_FIXTURE_FAILURE_ARCHIVE_${code}`;
  return error;
}
function refuse(code) {
  throw refusal(code);
}
function same(left, right, keys) {
  return keys.every((key) => left[key] === right[key]);
}
function stateFor(handle) {
  const state = archives.get(handle);
  if (!state) refuse('HANDLE');
  return state;
}
function requireHealthy(state) {
  if (state.failureCode) refuse('STICKY_FAULT');
}
function markFault(state, error) {
  state.failureCode ??= /^HTTP_FIXTURE_FAILURE_ARCHIVE_[A-Z_]+$/.test(error?.code ?? '')
    ? error.code
    : 'HTTP_FIXTURE_FAILURE_ARCHIVE_IO';
  const failure = refusal('FAULT');
  failure.failureArchive = snapshot(state);
  return failure;
}
function chain(directory) {
  const rows = [];
  for (let path = directory; ; path = dirname(path)) {
    if (rows.length === 64) refuse('ANCESTOR_BOUND');
    const stat = lstatSync(path, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path)
      refuse('IDENTITY');
    rows.push({ path, ...Object.fromEntries(directoryKeys.map((key) => [key, stat[key]])) });
    if (dirname(path) === path) return rows;
  }
}
function checkRoot(state) {
  const current = chain(state.directory);
  const root = current[0];
  if (
    !isDeepStrictEqual(current, state.chain) ||
    root.uid !== BigInt(process.getuid()) ||
    (root.mode & 0o7777n) !== 0o700n
  )
    refuse('IDENTITY');
}
function checkDescriptors(state, descriptors) {
  checkRoot(state);
  if (descriptors.length !== state.chain.length) refuse('IDENTITY');
  for (let index = 0; index < descriptors.length; index++) {
    const stat = fstatSync(descriptors[index], { bigint: true });
    if (!stat.isDirectory() || !same(stat, state.chain[index], directoryKeys)) refuse('IDENTITY');
  }
}
function openAncestors(state, descriptors) {
  checkRoot(state);
  for (const row of state.chain) {
    const descriptor = openSync(row.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    descriptors.push(descriptor);
    const stat = fstatSync(descriptor, { bigint: true });
    if (!stat.isDirectory() || !same(stat, row, directoryKeys)) refuse('IDENTITY');
  }
  checkDescriptors(state, descriptors);
}
function checkRoster(state) {
  checkRoot(state);
  const actual = [];
  const directory = opendirSync(state.directory);
  try {
    for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
      if (actual.length === names.length || !entry.isFile() || !state.members.has(entry.name))
        refuse('ROSTER');
      actual.push(entry.name);
    }
  } finally {
    directory.closeSync();
  }
  if (!isDeepStrictEqual(actual.sort(), [...state.members.keys()].sort())) refuse('ROSTER');
  checkRoot(state);
}
function verifyMembers(state) {
  checkRoster(state);
  for (const [name, member] of state.members) {
    const path = join(state.directory, name);
    const before = lstatSync(path, { bigint: true });
    if (!same(before, member.identity, fileKeys)) refuse('IDENTITY');
    const acquired = readHttpQualificationArtifact(state.directory, path);
    const after = lstatSync(path, { bigint: true });
    if (!same(after, member.identity, fileKeys) || !isDeepStrictEqual(acquired.row, member.row))
      refuse('IDENTITY');
    checkRoot(state);
  }
  checkRoster(state);
}
// Always attempt durability and close every acquired descriptor, including when
// a publication failed. Partial bytes remain at their exclusive generated path.
function finishDescriptors(state, descriptor, ancestors) {
  let failure;
  const attempt = (operation) => {
    try {
      operation();
    } catch (error) {
      failure ??= error;
    }
  };
  if (descriptor !== undefined) {
    attempt(() => fsyncSync(descriptor));
    attempt(() => closeSync(descriptor));
  }
  for (let index = 0; index < Math.min(2, ancestors.length); index++) {
    attempt(() => {
      const stat = fstatSync(ancestors[index], { bigint: true });
      if (!stat.isDirectory() || !same(stat, state.chain[index], directoryKeys)) refuse('IDENTITY');
      fsyncSync(ancestors[index]);
    });
  }
  for (const fd of ancestors.reverse()) attempt(() => closeSync(fd));
  if (failure) throw failure;
}
function snapshot(state) {
  let directoryOutcome = 'UNKNOWN';
  try {
    checkRoot(state);
    directoryOutcome = 'RETAINED';
  } catch {
    // A saved generated path is retained as a locator, never adopted after drift.
  }
  return {
    directory: state.directory,
    directoryOutcome,
    files: [...state.members.values()].map(({ row }) => structuredClone(row)),
    partialFiles: [...state.partial],
    failureCode: state.failureCode,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}

/** Private failure retention only. No caller directory, backend or authority. */
export function createFixtureFailureArchive() {
  if (arguments.length !== 0) refuse('REQUEST');
  if (
    typeof process.getuid !== 'function' ||
    !Number.isInteger(constants.O_NOFOLLOW) ||
    !Number.isInteger(constants.O_NONBLOCK)
  )
    refuse('UNSUPPORTED');
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'stynx fixture failure '));
  const state = {
    directory,
    chain: null,
    members: new Map(),
    partial: new Set(),
    failureCode: null,
  };
  const handle = Object.freeze(Object.create(null));
  archives.set(handle, state);
  const ancestors = [];
  let failure;
  try {
    state.chain = chain(directory);
    openAncestors(state, ancestors);
    checkRoster(state);
  } catch (error) {
    failure = error;
  }
  try {
    finishDescriptors(state, undefined, ancestors);
  } catch (error) {
    failure ??= error;
  }
  if (!failure) {
    try {
      checkRoster(state);
    } catch (error) {
      failure = error;
    }
  }
  if (failure) throw markFault(state, failure);
  return handle;
}

/** Exclusive fixed-name publication, never overwrite, retry or directory adoption. */
export function writeFixtureFailureArchive(handle, name, bytes) {
  const state = stateFor(handle);
  requireHealthy(state);
  let descriptor;
  const ancestors = [];
  let failure;
  let identity;
  let row;
  try {
    if (
      arguments.length !== 3 ||
      !names.includes(name) ||
      !Buffer.isBuffer(bytes) ||
      types.isProxy(bytes) ||
      Object.getPrototypeOf(bytes) !== Buffer.prototype ||
      ['length', 'buffer', 'byteOffset', 'byteLength'].some((key) => Object.hasOwn(bytes, key)) ||
      types.isSharedArrayBuffer(bytes.buffer) ||
      bytes.length > maximumBytes ||
      state.members.has(name)
    )
      refuse('REQUEST');
    openAncestors(state, ancestors);
    verifyMembers(state);
    row = { path: name, sha256: digest(bytes), byteLength: bytes.length, permissions: 0o600 };
    const path = join(state.directory, name);
    descriptor = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    state.partial.add(name);
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink !== 1n ||
      opened.uid !== BigInt(process.getuid()) ||
      (opened.mode & 0o7777n) !== 0o600n
    )
      refuse('IDENTITY');
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (count <= 0) refuse('WRITE');
      offset += count;
    }
    fsyncSync(descriptor);
    identity = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (
      !same(identity, opened, [...directoryKeys, 'nlink']) ||
      !same(identity, current, fileKeys) ||
      identity.size !== BigInt(bytes.length) ||
      realpathSync(path) !== path
    )
      refuse('IDENTITY');
    checkDescriptors(state, ancestors);
  } catch (error) {
    failure = error;
  }
  try {
    finishDescriptors(state, descriptor, ancestors);
  } catch (error) {
    failure ??= error;
  }
  if (!failure) {
    try {
      checkRoot(state);
      const path = join(state.directory, name);
      const acquired = readHttpQualificationArtifact(state.directory, path);
      if (
        !isDeepStrictEqual(acquired.row, row) ||
        !same(lstatSync(path, { bigint: true }), identity, fileKeys)
      )
        refuse('IDENTITY');
      state.members.set(name, { identity, row });
      state.partial.delete(name);
      verifyMembers(state);
    } catch (error) {
      failure = error;
    }
  }
  if (failure) throw markFault(state, failure);
  return structuredClone(row);
}

/** Reacquire every complete member and the exact saved directory population. */
export function verifyFixtureFailureArchive(handle) {
  const state = stateFor(handle);
  requireHealthy(state);
  const ancestors = [];
  let failure;
  try {
    if (arguments.length !== 1) refuse('REQUEST');
    openAncestors(state, ancestors);
    verifyMembers(state);
    checkDescriptors(state, ancestors);
  } catch (error) {
    failure = error;
  }
  try {
    finishDescriptors(state, undefined, ancestors);
  } catch (error) {
    failure ??= error;
  }
  if (!failure) {
    try {
      verifyMembers(state);
    } catch (error) {
      failure = error;
    }
  }
  if (failure) throw markFault(state, failure);
}

/** Known paths/partial members remain observable after a sticky fault. */
export function snapshotFixtureFailureArchive(handle) {
  if (arguments.length !== 1) refuse('REQUEST');
  return snapshot(stateFor(handle));
}
