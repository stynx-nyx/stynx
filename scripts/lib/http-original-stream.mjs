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
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

// Fixed component limits, not a workload population or a truncation policy.
// Exceeding any limit refuses reconstruction; the original compressed file is
// never changed, consumed destructively, sampled or replaced with aggregates.
export const originalStreamLimits = Object.freeze({
  compressedBytes: 512 * 1024 * 1024,
  decodedBytes: 4 * 1024 * 1024 * 1024,
  recordBytes: 1024 * 1024,
  records: 10_000_000,
  deadlineMs: 120_000,
});
/** @type {Array<keyof import('node:fs').BigIntStats>} */
const identityFields = ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
/** @param {import('node:fs').BigIntStats} a @param {import('node:fs').BigIntStats} b */
const same = (a, b) => identityFields.every((field) => a[field] === b[field]);
/** @param {import('node:fs').BigIntStats} a @param {import('node:fs').BigIntStats} b */
const sameDirectory = (a, b) => {
  /** @type {Array<keyof import('node:fs').BigIntStats>} */
  const fields = ['dev', 'ino', 'mode', 'uid', 'gid'];
  return fields.every((field) => a[field] === b[field]);
};
/** @param {string} message @returns {never} */
function refuse(message) {
  throw new Error(`HTTP_ORIGINAL_STREAM_REFUSED: ${message}`);
}

// This async iterator yields actual complete NDJSON bodies. It is not an
// origin verifier; the parent must retain and corroborate the actual file.
// The return value is deliberately unavailable until gzip EOF/trailer,
// descriptor EOF and the entire saved path chain have all been checked.
/** @param {unknown} root @param {unknown} path */
export async function* readHttpOriginalMetricStream(root, path) {
  if (arguments.length !== 2 || typeof root !== 'string' || typeof path !== 'string')
    refuse('closed root/path arguments');
  if (!isAbsolute(root) || !isAbsolute(path) || !path.endsWith('.gz'))
    refuse('canonical gzip path');
  const name = relative(root, path);
  if (!name || name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name))
    refuse('containment');
  if (realpathSync(root) !== root || realpathSync(path) !== path) refuse('linked path');
  /** @type {{directory: string, stat: import('node:fs').BigIntStats}[]} */
  const chain = [];
  const parts = name.split(sep);
  let directory = root;
  for (let index = 0; index < parts.length; index += 1) {
    const stat = lstatSync(directory, { bigint: true });
    if (!stat.isDirectory()) refuse('directory type');
    chain.push({ directory, stat });
    directory = resolve(directory, parts[index]);
  }
  const recheck = () => {
    for (const entry of chain)
      if (
        !sameDirectory(entry.stat, lstatSync(entry.directory, { bigint: true })) ||
        realpathSync(entry.directory) !== entry.directory
      )
        refuse('directory identity changed');
  };
  const initial = lstatSync(path, { bigint: true });
  if (!Number.isInteger(constants.O_NOFOLLOW) || !Number.isInteger(constants.O_NONBLOCK))
    refuse('no safe open flags');
  let descriptor;
  let source;
  /** @type {import('node:zlib').Gunzip | undefined} */
  let gunzip;
  let pumping;
  let timeout;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      !same(initial, opened) ||
      opened.nlink !== 1n ||
      (opened.mode & 0o7777n) !== 0o600n ||
      typeof process.getuid !== 'function' ||
      opened.uid !== BigInt(process.getuid()) ||
      opened.size <= 0n ||
      opened.size > BigInt(originalStreamLimits.compressedBytes)
    )
      refuse('private finite regular file');
    recheck();
    const hash = createHash('sha256');
    let compressedBytes = 0;
    const deadline = performance.now() + originalStreamLimits.deadlineMs;
    source = Readable.from(
      (async function* () {
        while (compressedBytes < Number(opened.size)) {
          if (performance.now() >= deadline) refuse('deadline');
          const chunk = Buffer.alloc(Math.min(64 * 1024, Number(opened.size) - compressedBytes));
          const count = readSync(descriptor, chunk, 0, chunk.length, compressedBytes);
          if (count === 0) refuse('early descriptor EOF');
          compressedBytes += count;
          const bytes = chunk.subarray(0, count);
          hash.update(bytes);
          yield bytes;
        }
        if (readSync(descriptor, Buffer.alloc(1), 0, 1, compressedBytes) !== 0)
          refuse('descriptor grew');
      })(),
    );
    gunzip = createGunzip({ chunkSize: 64 * 1024 });
    const decoder = gunzip;
    // This private decoder has no encoding or object mode; Node emits Buffers.
    /** @type {AsyncIterable<Buffer>} */
    const decoded = decoder;
    pumping = pipeline(source, gunzip);
    // A consumer may stop early or throw; never leave a rejected pump unhandled.
    pumping.catch(() => {});
    timeout = setTimeout(
      () => decoder.destroy(new Error('HTTP_ORIGINAL_STREAM_REFUSED: deadline')),
      originalStreamLimits.deadlineMs,
    );
    let decodedBytes = 0;
    let recordCount = 0;
    /** @type {Buffer[]} */
    let fragments = [];
    let fragmentBytes = 0;
    for await (const chunk of decoded) {
      decodedBytes += chunk.length;
      if (decodedBytes > originalStreamLimits.decodedBytes || performance.now() >= deadline)
        refuse('decoded size/deadline');
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset);
        const end = newline < 0 ? chunk.length : newline;
        const length = end - offset;
        if (fragmentBytes + length > originalStreamLimits.recordBytes) refuse('record byte limit');
        if (length) fragments.push(chunk.subarray(offset, end));
        fragmentBytes += length;
        if (newline < 0) break;
        recordCount += 1;
        if (!fragmentBytes || recordCount > originalStreamLimits.records)
          refuse('record limit/empty record');
        yield Buffer.concat(fragments, fragmentBytes);
        fragments = [];
        fragmentBytes = 0;
        offset = newline + 1;
      }
    }
    await pumping;
    if (fragmentBytes || !recordCount || compressedBytes !== Number(opened.size))
      refuse('incomplete final record/stream');
    if (
      !same(opened, fstatSync(descriptor, { bigint: true })) ||
      !same(opened, lstatSync(path, { bigint: true })) ||
      realpathSync(path) !== path
    )
      refuse('file identity changed');
    recheck();
    return {
      path: name.split(sep).join('/'),
      sha256: hash.digest('hex'),
      byteLength: compressedBytes,
      permissions: 0o600,
      encoding: 'gzip',
      decodedBytes,
      recordCount,
      completeGzipAndDescriptorEof: true,
      originVerified: false,
      retainedInPlace: true,
    };
  } finally {
    clearTimeout(timeout);
    source?.destroy();
    gunzip?.destroy();
    if (pumping) await pumping.catch(() => {});
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
