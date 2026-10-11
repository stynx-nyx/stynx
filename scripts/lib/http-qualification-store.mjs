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
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { types } from 'node:util';
import { readHttpQualificationArtifact } from './http-qualification-artifacts.mjs';

const stores = new WeakMap();
const maximumBytes = 64 * 1024 * 1024;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const nativeBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function refuse(message) {
  const error = new Error(message);
  error.code = 'HTTP_QUALIFICATION_STORE_INVALID';
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
    refuse('Archive directory is not an actual private owned directory');
  return row;
}
function checkDirectory(path, previous) {
  const current = directoryIdentity(path);
  if (current.dev !== previous.dev || current.ino !== previous.ino)
    refuse('Archive directory identity changed');
}
function stateFor(handle) {
  const state = stores.get(handle);
  if (!state) refuse('Unknown private archive store');
  checkDirectory(state.root, state.identity);
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
      syncDirectory(dirname(path));
    }
  }
  return resolve(state.root, name);
}
function syncDirectory(path, parent = false) {
  const identity = parent ? lstatSync(path, { bigint: true }) : directoryIdentity(path);
  if (!identity.isDirectory() || realpathSync(path) !== path)
    refuse('Archive durability parent is not an actual directory');
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (opened.dev !== identity.dev || opened.ino !== identity.ino)
      refuse('Archive directory changed before durability barrier');
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
  const root = realpathSync(mkdtempSync(resolve(realpathSync(tmpdir()), 'stynx-http-batch-')));
  const handle = Object.freeze(Object.create(null));
  stores.set(handle, { root, identity: directoryIdentity(root), directories: new Map() });
  syncDirectory(root);
  syncDirectory(dirname(root), true);
  return handle;
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
  const path = member(state, name);
  const pending = resolve(dirname(path), `pending-${randomUUID()}`);
  const fd = openSync(pending, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  let linked = false;
  try {
    let offset = 0;
    while (offset < snapshot.length) {
      const count = writeSync(fd, snapshot, offset, snapshot.length - offset, offset);
      if (count <= 0) refuse('Archive write did not advance');
      offset += count;
    }
    fsyncSync(fd);
    checkDirectory(state.root, state.identity);
    // Atomic no-replace publication; rename would silently overwrite evidence.
    linkSync(pending, path);
    linked = true;
  } finally {
    closeSync(fd);
    // Never remove a partially written diagnostic on failure.
    if (linked) unlinkSync(pending);
  }
  syncDirectory(dirname(path));
  const acquired = readHttpQualificationArtifact(state.root, path);
  if (!acquired.bytes.equals(snapshot) || acquired.row.sha256 !== hash(snapshot))
    refuse('Published archive snapshot differs from acquired bytes');
  return acquired.row;
}

export function snapshotHttpQualificationStore(handle) {
  if (arguments.length !== 1) refuse('Archive snapshot accepts one private store');
  const state = stateFor(handle);
  return Object.freeze({ root: state.root, readinessPromoting: false });
}
