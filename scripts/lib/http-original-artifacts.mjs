import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import { publishHttpQualificationBytes } from './http-qualification-store.mjs';

const limits = Object.freeze({
  metrics: 512 * 1024 * 1024,
  preparation: 64 * 1024,
  summary: 64 * 1024 * 1024,
  dashboard: 64 * 1024 * 1024,
  log: 64 * 1024 * 1024,
  body: 64 * 1024 * 1024,
  journal: 64 * 1024 * 1024,
  executable: 64 * 1024 * 1024,
});
/** @type {Array<keyof import('node:fs').BigIntStats>} */
const fileKeys = ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
/** @type {Array<keyof import('node:fs').BigIntStats>} */
const directoryKeys = ['dev', 'ino', 'mode', 'uid', 'gid'];
const chunkBytes = 8 * 1024 * 1024;
/** @param {import('node:fs').BigIntStats} left @param {import('node:fs').BigIntStats} right @param {Array<keyof import('node:fs').BigIntStats>} keys */
const same = (left, right, keys) => keys.every((key) => left[key] === right[key]);
/** @param {string} role @returns {role is keyof typeof limits} */
function hasRole(role) {
  return Object.hasOwn(limits, role);
}

/** @returns {never} */
function refuse() {
  const error = new Error('Original raw artifact is oversized, linked, changed or incomplete');
  error.code = 'HTTP_ORIGINAL_ARTIFACT_INVALID';
  throw error;
}
/**
 * @param {unknown} root
 * @param {unknown} path
 * @param {unknown} role
 * @param {(bytes: Buffer, index: number) => unknown} consume
 */
function acquire(root, path, role, consume) {
  if (
    typeof role !== 'string' ||
    !hasRole(role) ||
    typeof root !== 'string' ||
    typeof path !== 'string' ||
    !isAbsolute(root) ||
    !isAbsolute(path) ||
    realpathSync(root) !== root ||
    realpathSync(path) !== path ||
    typeof process.getuid !== 'function' ||
    !Number.isInteger(constants.O_NOFOLLOW) ||
    !Number.isInteger(constants.O_NONBLOCK)
  )
    refuse();
  const name = relative(root, path);
  if (!name || name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name)) refuse();
  const rootIdentity = lstatSync(root, { bigint: true });
  if (
    !rootIdentity.isDirectory() ||
    rootIdentity.uid !== BigInt(process.getuid()) ||
    (rootIdentity.mode & 0o7777n) !== 0o700n
  )
    refuse();
  /** @type {{path: string, identity: import('node:fs').BigIntStats, fd: number}[]} */
  const ancestors = [];
  let descriptor;
  let result;
  let failure;
  try {
    for (let directory = dirname(path); ; directory = dirname(directory)) {
      if (ancestors.length === 64 || realpathSync(directory) !== directory) refuse();
      const identity = lstatSync(directory, { bigint: true });
      if (!identity.isDirectory() || identity.isSymbolicLink()) refuse();
      const fd = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
      ancestors.push({ path: directory, identity, fd });
      if (!same(identity, fstatSync(fd, { bigint: true }), directoryKeys)) refuse();
      if (dirname(directory) === directory) break;
    }
    const recheck = () => {
      for (const row of ancestors)
        if (
          realpathSync(row.path) !== row.path ||
          !same(row.identity, lstatSync(row.path, { bigint: true }), directoryKeys) ||
          !same(row.identity, fstatSync(row.fd, { bigint: true }), directoryKeys)
        )
          refuse();
    };
    const initial = lstatSync(path, { bigint: true });
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      !same(initial, opened, fileKeys) ||
      opened.nlink !== 1n ||
      opened.uid !== BigInt(process.getuid()) ||
      (opened.mode & 0o7777n) !== (role === 'executable' ? 0o700n : 0o600n) ||
      opened.size < 0n ||
      opened.size > BigInt(limits[role])
    )
      refuse();
    const hash = createHash('sha256');
    let offset = 0;
    let index = 0;
    const chunks = [];
    recheck();
    while (offset < Number(opened.size)) {
      const bytes = Buffer.alloc(Math.min(chunkBytes, Number(opened.size) - offset));
      let filled = 0;
      while (filled < bytes.length) {
        const count = readSync(descriptor, bytes, filled, bytes.length - filled, offset + filled);
        if (!count) refuse();
        filled += count;
      }
      recheck();
      if (!same(opened, fstatSync(descriptor, { bigint: true }), fileKeys)) refuse();
      hash.update(bytes);
      const chunk = consume(bytes, index);
      if (chunk !== undefined) chunks.push(chunk);
      offset += filled;
      index++;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, offset) !== 0) refuse();
    if (
      !same(opened, fstatSync(descriptor, { bigint: true }), fileKeys) ||
      !same(opened, lstatSync(path, { bigint: true }), fileKeys) ||
      realpathSync(path) !== path
    )
      refuse();
    recheck();
    result = {
      path: name.split(sep).join('/'),
      sha256: hash.digest('hex'),
      byteLength: offset,
      permissions: Number(opened.mode & 0o7777n),
      chunkCount: index,
      chunks,
      completeDescriptorEof: true,
      runtimeCustodyComplete: false,
      performanceQualified: false,
      readinessPromoting: false,
    };
  } catch (error) {
    failure = error;
  } finally {
    for (const fd of [descriptor, ...ancestors.reverse().map((row) => row.fd)]) {
      if (fd === undefined) continue;
      try {
        closeSync(fd);
      } catch (error) {
        failure ??= error;
      }
    }
  }
  if (failure) throw failure;
  return result;
}

/** Byte retention only. Source/attempt/path authority stays in the actual parent.
 * Every ordered chunk is durably published before the full EOF/hash receipt.
 * Failure retains already-published chunks and the original sandbox unchanged.
 */
export function archiveHttpOriginalArtifact(store, root, path, prefix, role) {
  if (
    arguments.length !== 5 ||
    typeof prefix !== 'string' ||
    !/^[a-z0-9][a-z0-9/-]{0,200}$/u.test(prefix) ||
    prefix.split('/').some((part) => !part || part === '..')
  )
    refuse();
  const observation = acquire(root, path, role, (bytes, index) =>
    publishHttpQualificationBytes(store, `${prefix}/${String(index).padStart(8, '0')}.part`, bytes),
  );
  const receipt = publishHttpQualificationBytes(
    store,
    `${prefix}/index.json`,
    Buffer.from(JSON.stringify(observation)),
  );
  return { ...observation, receipt };
}

/** Fixed bounded executable acquisition only; no native execution admission. */
export function readHttpOriginalExecutable(root, path) {
  if (arguments.length !== 2) refuse();
  const chunks = [];
  const row = acquire(root, path, 'executable', (bytes) => {
    chunks.push(bytes);
  });
  return { row, bytes: Buffer.concat(chunks, row.byteLength) };
}
