import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  realpathSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { isDeepStrictEqual, types } from 'node:util';
import { readHttpQualificationArtifact } from './http-qualification-artifacts.mjs';
import { readHttpOriginalExecutable } from './http-original-artifacts.mjs';

/** @typedef {{directory: string, ancestry: ReturnType<typeof ancestry> | null, rows: Array<ReturnType<typeof write>>, identities: Map<string, import('node:fs').BigIntStats>, failed: boolean, observation?: unknown}} AcquisitionState */
/** @typedef {AcquisitionState & {ancestry: ReturnType<typeof ancestry>}} AncestryBoundState */
/** @type {WeakMap<object, AncestryBoundState>} */
const acquisitions = new WeakMap();
const nativeFetch = globalThis.fetch;
/** @type {unknown} */
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const nativeBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
/** @type {Array<keyof import('node:fs').BigIntStats>} */
const identityKeys = ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
/** @param {Buffer} bytes */
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const release = 'https://github.com/grafana/k6/releases/download/v0.49.0/';
const pins = Object.freeze({
  checksumName: 'k6-v0.49.0-checksums.txt',
  checksumBytes: 754,
  checksumSha256: '5e5366dde6cf239db55b51cb1e8178deb4676a0092bc0d2ac25004dec1ddc727',
  archiveName: 'k6-v0.49.0-macos-arm64.zip',
  archiveBytes: 24271694,
  archiveSha256: '4601d2e1af599324873dad7745cd46d7611ceb61892eb7f177981c73976fdea7',
  executableBytes: 54863762,
  executableSha256: '2122f2c450279d9f12424954e283d914c17e2cd31ec13ab8b6c83df847c2a80f',
});
/** @returns {never} */
function refuse() {
  const error = new Error('Fixed official original k6 acquisition refused');
  error.code = 'HTTP_ORIGINAL_OFFICIAL_K6_INVALID';
  throw error;
}

/** Exact pinned ZIP decoding only. This does not authenticate its supplied bytes
 * or execute/admit a native image; live transport custody is acquired separately.
 */
/** @param {unknown} input */
export function inspectHttpOriginalOfficialK6Archive(input) {
  if (
    arguments.length !== 1 ||
    !Buffer.isBuffer(input) ||
    types.isProxy(input) ||
    Object.getPrototypeOf(input) !== Buffer.prototype ||
    types.isSharedArrayBuffer(nativeBuffer.call(input)) ||
    nativeLength.call(input) !== pins.archiveBytes
  )
    refuse();
  const bytes = Buffer.alloc(pins.archiveBytes);
  Uint8Array.prototype.set.call(bytes, input);
  if (hash(bytes) !== pins.archiveSha256) refuse();
  // Full archive digest pins both complete entries/central directory/EOF. No
  // archive pathname is extracted; only this exact reviewed compressed member.
  if (
    bytes.readUInt32LE(0) !== 0x04034b50 ||
    bytes.readUInt32LE(81) !== 0x04034b50 ||
    bytes.readUInt16LE(89) !== 8 ||
    bytes.readUInt32LE(95) !== 0x8693f8c2 ||
    bytes.readUInt32LE(99) !== 24271320 ||
    bytes.readUInt32LE(103) !== pins.executableBytes ||
    bytes.subarray(111, 136).toString('ascii') !== 'k6-v0.49.0-macos-arm64/k6' ||
    bytes.readUInt32LE(bytes.length - 22) !== 0x06054b50 ||
    bytes.readUInt16LE(bytes.length - 12) !== 2 ||
    bytes.readUInt32LE(bytes.length - 6) !== 24271484
  )
    refuse();
  const executable = inflateRawSync(bytes.subarray(164, 24271484), {
    maxOutputLength: pins.executableBytes,
  });
  if (
    executable.length !== pins.executableBytes ||
    crc32(executable) !== 0x8693f8c2 ||
    hash(executable) !== pins.executableSha256
  )
    refuse();
  return executable;
}

/**
 * @param {AncestryBoundState} state
 * @param {string} name
 * @param {number} expectedBytes
 * @param {string} expectedSha256
 */
async function download(state, name, expectedBytes, expectedSha256) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let response, bytes, result, failure;
  /** @type {ReadableStreamDefaultReader<Uint8Array> | undefined} */
  let reader;
  let offset = 0;
  const hops = [];
  try {
    let url = new URL(`${release}${name}`);
    for (let index = 0; ; index++) {
      if (
        index > 3 ||
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        url.hash ||
        (index === 0
          ? url.href !== `${release}${name}`
          : !['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(
              url.hostname,
            ))
      )
        refuse();
      response = await nativeFetch(url, {
        redirect: 'manual',
        credentials: 'omit',
        headers: { Accept: 'application/octet-stream', 'Accept-Encoding': 'identity' },
        signal: controller.signal,
      });
      hops.push({ origin: url.origin, status: response.status });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      response = undefined;
      if (!location) refuse();
      url = new URL(location, url);
    }
    const length = response.headers.get('content-length');
    if (
      response.status !== 200 ||
      !response.body ||
      (length !== null && length !== String(expectedBytes)) ||
      ![null, 'identity'].includes(response.headers.get('content-encoding'))
    )
      refuse();
    reader = response.body.getReader();
    bytes = Buffer.alloc(expectedBytes);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || offset + value.byteLength > expectedBytes) refuse();
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    if (offset !== expectedBytes || hash(bytes) !== expectedSha256) refuse();
    result = { bytes, hops };
  } catch (error) {
    failure = error;
  }
  try {
    if (reader) {
      try {
        await reader.cancel();
      } finally {
        reader.releaseLock();
      }
    } else await response?.body?.cancel();
  } catch (error) {
    failure ??= error;
  }
  clearTimeout(timer);
  if (failure) {
    // This is explicitly a received prefix, not a complete archive. Retain it
    // even after cancellation/transport refusal; never log signed URLs/tokens.
    let prefix;
    try {
      prefix = write(
        state,
        `${name}.partial`,
        bytes ? bytes.subarray(0, offset) : Buffer.alloc(0),
        0o600,
      );
    } catch {
      state.failed = true;
    }
    try {
      write(
        state,
        `${name}.failure.json`,
        Buffer.from(
          JSON.stringify({
            hops,
            receivedPrefix: prefix ?? null,
            receivedPrefixBytes: offset,
            completeBody: false,
            readinessPromoting: false,
          }),
        ),
        0o600,
      );
    } catch {
      state.failed = true;
    }
    throw failure;
  }
  return result;
}

/** @param {string} directory */
function ancestry(directory) {
  const result = [];
  for (let path = directory; ; path = dirname(path)) {
    if (result.length === 64 || realpathSync(path) !== path) refuse();
    const stat = lstatSync(path, { bigint: true });
    if (!stat.isDirectory()) refuse();
    result.push({
      path,
      dev: stat.dev,
      ino: stat.ino,
      mode: stat.mode,
      uid: stat.uid,
      gid: stat.gid,
    });
    if (dirname(path) === path) return result;
  }
}
/**
 * @param {AncestryBoundState} state
 * @param {string} name
 * @param {Buffer} bytes
 * @param {number} mode
 */
function write(state, name, bytes, mode) {
  const path = join(state.directory, name);
  /** @type {number[]} */
  const descriptors = [];
  /** @type {number | undefined} */
  let file;
  let failure;
  const check = () => {
    if (!isDeepStrictEqual(ancestry(state.directory), state.ancestry)) refuse();
  };
  try {
    check();
    for (const row of state.ancestry) {
      const fd = openSync(row.path, constants.O_RDONLY | constants.O_NOFOLLOW);
      descriptors.push(fd);
      const stat = fstatSync(fd, { bigint: true });
      /** @type {Array<'dev' | 'ino' | 'mode' | 'uid' | 'gid'>} */
      const directoryKeys = ['dev', 'ino', 'mode', 'uid', 'gid'];
      if (directoryKeys.some((key) => row[key] !== stat[key])) refuse();
    }
    file = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      mode,
    );
    const opened = fstatSync(file, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || (opened.mode & 0o7777n) !== BigInt(mode))
      refuse();
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(file, bytes, offset, bytes.length - offset);
      if (!count) refuse();
      offset += count;
    }
    fsyncSync(file);
    const after = lstatSync(path, { bigint: true });
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== BigInt(bytes.length))
      refuse();
    check();
  } catch (error) {
    failure = error;
  } finally {
    /** @param {() => void} operation */
    const attempt = (operation) => {
      try {
        operation();
      } catch (error) {
        failure ??= error;
      }
    };
    if (file !== undefined) {
      const openFile = file;
      attempt(() => fsyncSync(openFile));
      attempt(() => closeSync(openFile));
    }
    for (const fd of descriptors.slice(0, 2)) attempt(() => fsyncSync(fd));
    for (const fd of descriptors.reverse()) attempt(() => closeSync(fd));
  }
  if (failure) throw failure;
  check();
  const actual =
    mode === 0o700
      ? readHttpOriginalExecutable(state.directory, path)
      : readHttpQualificationArtifact(state.directory, path);
  if (!actual.bytes.equals(bytes)) refuse();
  check();
  state.identities.set(name, lstatSync(path, { bigint: true }));
  return actual.row;
}

/** Source-fixed origin acquisition. No caller URL/path/cache/transport or
 * credentials. Returns an opaque owned acquisition, never native admission.
 */
export async function acquireHttpOriginalOfficialK6() {
  if (arguments.length !== 0 || process.platform !== 'darwin' || process.arch !== 'arm64') refuse();
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'stynx original official k6 '));
  /** @type {Array<ReturnType<typeof write>>} */
  const rows = [];
  /** @type {{directory: string, ancestry: ReturnType<typeof ancestry> | null, rows: Array<ReturnType<typeof write>>, identities: Map<string, import('node:fs').BigIntStats>, failed: boolean, observation?: unknown}} */
  const state = { directory, ancestry: null, rows, identities: new Map(), failed: false };
  try {
    const readyState = Object.assign(state, { ancestry: ancestry(directory) });
    const root = lstatSync(directory, { bigint: true });
    if ((root.mode & 0o7777n) !== 0o700n || root.uid !== BigInt(process.getuid())) refuse();
    const checksum = await download(
      readyState,
      pins.checksumName,
      pins.checksumBytes,
      pins.checksumSha256,
    );
    readyState.rows.push(write(readyState, pins.checksumName, checksum.bytes, 0o600));
    if (
      checksum.bytes
        .toString('utf8')
        .split('\n')
        .filter((line) => line === `${pins.archiveSha256}  ${pins.archiveName}`).length !== 1
    )
      refuse();
    const archive = await download(readyState, pins.archiveName, pins.archiveBytes, pins.archiveSha256);
    readyState.rows.push(write(readyState, pins.archiveName, archive.bytes, 0o600));
    readyState.rows.push(write(readyState, 'k6', inspectHttpOriginalOfficialK6Archive(archive.bytes), 0o700));
    readyState.observation = {
      pins,
      release,
      checksumHops: checksum.hops,
      archiveHops: archive.hops,
      directory,
      files: structuredClone(readyState.rows),
      nativeExecuted: false,
      nativeImageClosure: false,
      runtimeCustodyComplete: false,
      performanceQualified: false,
      readinessPromoting: false,
    };
    readyState.rows.push(
      write(readyState, 'acquisition.json', Buffer.from(JSON.stringify(readyState.observation)), 0o600),
    );
    // Native Object.create(null) produces a new object without a prototype.
    /** @type {{create(prototype: null): object}} */
    const nullPrototypeFactory = Object;
    const handle = Object.freeze(nullPrototypeFactory.create(null));
    acquisitions.set(handle, readyState);
    return handle;
  } catch (error) {
    state.failed = true;
    error.diagnosticDirectory = directory;
    throw error;
  }
}

/**
 * @overload
 * @param {ReturnType<typeof write>} row
 * @param {'path' | 'sha256'} key
 * @returns {string}
 */
/**
 * @overload
 * @param {ReturnType<typeof write>} row
 * @param {'byteLength'} key
 * @returns {number}
 */
/** @param {ReturnType<typeof write>} row @param {'path' | 'sha256' | 'byteLength'} key */
function rowField(row, key) {
  if (row === undefined) throw new TypeError(`Cannot read properties of undefined (reading '${key}')`);
  return row[key];
}

/** @param {unknown} value @returns {value is object} */
function isHandleCandidate(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

/** @param {unknown} handle */
export function observeHttpOriginalOfficialK6(handle) {
  if (arguments.length !== 1) refuse();
  const state = isHandleCandidate(handle) ? acquisitions.get(handle) : undefined;
  if (!state || state.failed) refuse();
  try {
    if (!isDeepStrictEqual(ancestry(state.directory), state.ancestry)) refuse();
    for (const row of state.rows) {
      const path = join(state.directory, rowField(row, 'path'));
      const identity = state.identities.get(rowField(row, 'path'));
      if (
        !identity ||
        identityKeys.some((key) => lstatSync(path, { bigint: true })[key] !== identity[key])
      )
        refuse();
      const actual =
        rowField(row, 'path') === 'k6'
          ? readHttpOriginalExecutable(state.directory, path)
          : readHttpQualificationArtifact(state.directory, path);
      if (
        rowField(actual.row, 'sha256') !== rowField(row, 'sha256') ||
        rowField(actual.row, 'byteLength') !== rowField(row, 'byteLength') ||
        identityKeys.some((key) => lstatSync(path, { bigint: true })[key] !== identity[key])
      )
        refuse();
    }
    if (!isDeepStrictEqual(ancestry(state.directory), state.ancestry)) refuse();
    /** @type {{assign(target: object, source: unknown): Record<string, unknown>}} */
    const objectAssign = Object;
    const observation = objectAssign.assign({}, state.observation);
    return structuredClone({
      ...observation,
      executable: join(state.directory, 'k6'),
      acquisitionReceipt: state.rows.at(-1),
    });
  } catch (error) {
    state.failed = true;
    throw error;
  }
}
