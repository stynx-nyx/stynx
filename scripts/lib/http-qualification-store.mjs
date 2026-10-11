import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { types } from 'node:util';
import { readHttpQualificationArtifact } from './http-qualification-artifacts.mjs';

const stores = new WeakMap();
const maximumBytes = 64 * 1024 * 1024;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const nativeBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function refuse(message, directoryCustody = false) {
  const error = new Error(message);
  error.code = 'HTTP_QUALIFICATION_STORE_INVALID';
  if (directoryCustody) error.directoryCustody = true;
  throw error;
}
function directoryIdentity(path) {
  const row = lstatSync(path, { bigint: true });
  if (
    !row.isDirectory() ||
    realpathSync(path) !== path ||
    (row.mode & 0o7777n) !== 0o700n ||
    typeof process.getuid !== 'function' ||
    row.uid !== BigInt(process.getuid())
  )
    refuse('Archive directory is not an actual private owned directory', true);
  return row;
}
function checkDirectory(path, previous) {
  const current = directoryIdentity(path);
  if (['dev', 'ino', 'mode', 'uid', 'gid'].some((key) => current[key] !== previous[key]))
    refuse('Archive directory identity changed', true);
}
function checkSavedDirectories(state) {
  if (state.refusal) refuse('Archive directory custody was previously refused');
  try {
    checkDirectory(state.root, state.identity);
    for (const [path, identity] of state.directories) checkDirectory(path, identity);
  } catch (error) {
    state.refusal = true;
    throw error;
  }
}
function stateFor(handle) {
  const state = stores.get(handle);
  if (!state) refuse('Unknown private archive store');
  checkSavedDirectories(state);
  return state;
}
function member(state, name) {
  if (
    typeof name !== 'string' ||
    name.length > 512 ||
    name.split('/').length > 8 ||
    !name.split('/').every((part) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(part))
  )
    refuse('Archive name is not a bounded portable relative member');
  const parts = name.split('/');
  let path = state.root;
  for (const part of parts.slice(0, -1)) {
    path = resolve(path, part);
    const identity = state.directories.get(path);
    if (identity) checkDirectory(path, identity);
    else {
      mkdirSync(path, { mode: 0o700 });
      state.directories.set(path, directoryIdentity(path));
      checkSavedDirectories(state);
      syncDirectory(dirname(path), state.directories.get(dirname(path)) ?? state.identity);
      checkSavedDirectories(state);
    }
  }
  return resolve(state.root, name);
}
function syncDirectory(path, identity, parent = false) {
  if (!identity.isDirectory() || realpathSync(path) !== path)
    refuse('Archive durability parent is not an actual directory');
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (opened.dev !== identity.dev || opened.ino !== identity.ino)
      refuse('Archive directory changed before durability barrier', true);
    fsyncSync(fd);
    if (!parent) checkDirectory(path, identity);
  } finally {
    closeSync(fd);
  }
}

/** Byte custody only. An opaque store never supplies execution/acceptance credit.
 * Destinations are internally allocated outside disposable build sandboxes.
 */
export function createHttpQualificationStore() {
  if (arguments.length !== 0) refuse('Archive destinations cannot be caller selected');
  const root = realpathSync(mkdtempSync(resolve(realpathSync('/tmp'), 'stynx-http-batch-')));
  const handle = Object.freeze(Object.create(null));
  const identity = directoryIdentity(root);
  stores.set(handle, { root, identity, directories: new Map(), publications: new Map() });
  syncDirectory(root, identity);
  syncDirectory(dirname(root), lstatSync(dirname(root), { bigint: true }), true);
  return handle;
}

function checkFileIdentity(path, identity, settled = false) {
  const current = lstatSync(path, { bigint: true });
  const fields = ['dev', 'ino', 'mode', 'uid', 'gid', 'size', 'mtimeNs', 'birthtimeNs'];
  if (settled) fields.push('ctimeNs', 'nlink');
  if (
    !current.isFile() ||
    realpathSync(path) !== path ||
    fields.some((key) => current[key] !== identity[key])
  )
    refuse('Previously published archive member identity changed');
  return current;
}

function finishPublication(state, publication, snapshot) {
  checkSavedDirectories(state);
  checkFileIdentity(publication.path, publication.identity, publication.settled);
  if (publication.pending) {
    try {
      checkFileIdentity(publication.pending, publication.identity);
      unlinkSync(publication.pending);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    publication.pending = undefined;
  }
  checkSavedDirectories(state);
  const fd = openSync(
    publication.path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (opened.dev !== publication.identity.dev || opened.ino !== publication.identity.ino)
      refuse('Archive member changed before repeat durability barrier');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  checkSavedDirectories(state);
  syncDirectory(state.root, state.identity);
  for (const [path, identity] of state.directories) {
    checkSavedDirectories(state);
    syncDirectory(path, identity);
  }
  checkSavedDirectories(state);
  const acquired = readHttpQualificationArtifact(state.root, publication.path);
  const finalIdentity = checkFileIdentity(
    publication.path,
    publication.identity,
    publication.settled,
  );
  checkSavedDirectories(state);
  if (!acquired.bytes.equals(snapshot) || acquired.row.sha256 !== publication.sha256)
    refuse('Published archive snapshot differs from retained exact bytes');
  publication.identity = finalIdentity;
  publication.settled = true;
  publication.snapshot = undefined;
  return acquired.row;
}

/** Publish one bounded immutable snapshot without replacing an existing name.
 * The source-owned parent calls this only with its internally derived roster.
 */
export function publishHttpQualificationBytes(handle, name, bytes) {
  if (
    arguments.length !== 3 ||
    types.isProxy(bytes) ||
    !Buffer.isBuffer(bytes) ||
    Object.getPrototypeOf(bytes) !== Buffer.prototype ||
    types.isSharedArrayBuffer(nativeBuffer.call(bytes)) ||
    nativeLength.call(bytes) > maximumBytes
  )
    refuse('Archive publication requires one bounded byte snapshot');
  const snapshot = Buffer.alloc(nativeLength.call(bytes));
  Uint8Array.prototype.set.call(snapshot, bytes, 0);
  const state = stateFor(handle);
  try {
    return publish(state, name, snapshot);
  } catch (error) {
    if (error.directoryCustody) state.refusal = true;
    throw error;
  }
}

function publish(state, name, snapshot) {
  const path = member(state, name);
  let publication = state.publications.get(name);
  const sha256 = hash(snapshot);
  if (publication) {
    if (publication.sha256 !== sha256 || publication.byteLength !== snapshot.length)
      refuse('Archive retry differs from the privately retained exact member');
    if (publication.snapshot && !publication.snapshot.equals(snapshot))
      refuse('Archive retry differs from retained partial publication bytes');
    if (publication.linked) return finishPublication(state, publication, snapshot);
  } else {
    publication = { path, sha256, byteLength: snapshot.length, snapshot, linked: false };
    state.publications.set(name, publication);
  }
  // An existing destination is retryable only after this exact private store
  // actually linked it. Identical caller-precreated bytes are never adopted.
  try {
    lstatSync(path);
    refuse('Archive destination already exists without private publication custody');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  checkSavedDirectories(state);
  const pending = resolve(dirname(path), `pending-${randomUUID()}`);
  const fd = openSync(pending, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    let offset = 0;
    while (offset < snapshot.length) {
      const count = writeSync(fd, snapshot, offset, snapshot.length - offset, offset);
      if (count <= 0) refuse('Archive write did not advance');
      offset += count;
    }
    fsyncSync(fd);
    publication.identity = fstatSync(fd, { bigint: true });
    checkSavedDirectories(state);
    // Atomic no-replace publication; rename would silently overwrite evidence.
    linkSync(pending, path);
    publication.linked = true;
    publication.pending = pending;
  } finally {
    closeSync(fd);
    // Failed pending bodies remain private diagnostics, never overwritten.
  }
  return finishPublication(state, publication, snapshot);
}

export function snapshotHttpQualificationStore(handle) {
  if (arguments.length !== 1) refuse('Archive snapshot accepts one private store');
  const state = stateFor(handle);
  return Object.freeze({ root: state.root, readinessPromoting: false });
}
