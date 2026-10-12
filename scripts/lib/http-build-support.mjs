import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  opendirSync,
  readlinkSync,
  readSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { types } from 'node:util';

const archives = new WeakMap();
const maximumFile = 64 * 1024 * 1024;
const interpreter = Object.freeze({
  role: 'toolchain-interpreter-body',
  maximumBytes: 128 * 1024 * 1024,
  byteLength: 121911744,
  sha256: '9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a',
});
const maximumTotal = 16 * 1024 * 1024 * 1024;
const maximumEntries = 250000;
const maximumPaths = 64 * 1024 * 1024;
const chunkSize = 8 * 1024 * 1024;
const fileKeys = ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
const directoryKeys = ['dev', 'ino', 'mode', 'uid', 'gid'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = (a, b, keys) => keys.every((key) => a[key] === b[key]);
const identity = (stat) => Object.fromEntries(fileKeys.map((key) => [key, String(stat[key])]));
const matchingInterpreterRuntime = () =>
  process.platform === 'darwin' && process.arch === 'arm64' && process.versions.node === '24.20.0';

function refuse(message, observed) {
  const error = new Error(message);
  error.code = 'HTTP_BUILD_SUPPORT_INVALID';
  if (observed) error.observedMember = observed;
  throw error;
}

function inside(root, path, allowRoot = false) {
  const name = relative(root, path);
  if ((!name && !allowRoot) || name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name))
    refuse('Build support member escapes its actual source root');
  return name.split(sep).join('/');
}

function holdChain(path) {
  const rows = [];
  try {
    for (let directory = path; ; directory = dirname(directory)) {
      if (rows.length === 64 || realpathSync(directory) !== directory)
        refuse('Build support ancestor is not canonical or exceeds the depth bound');
      const stat = lstatSync(directory, { bigint: true });
      if (!stat.isDirectory()) refuse('Build support ancestor is not a directory');
      const fd = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
      rows.push({ path: directory, stat, fd });
      if (!same(stat, fstatSync(fd, { bigint: true }), directoryKeys))
        refuse('Build support ancestor changed while opening');
      if (dirname(directory) === directory) break;
    }
    return rows;
  } catch (error) {
    for (const row of rows.reverse()) closeSync(row.fd);
    throw error;
  }
}

function checkChain(rows) {
  for (const row of rows)
    if (
      realpathSync(row.path) !== row.path ||
      !same(row.stat, lstatSync(row.path, { bigint: true }), directoryKeys) ||
      !same(row.stat, fstatSync(row.fd, { bigint: true }), directoryKeys)
    )
      refuse('Build support full ancestor identity changed');
}

function closeChain(rows) {
  let failure;
  for (const row of rows.reverse()) {
    try {
      closeSync(row.fd);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

function privateDirectory(path) {
  const stat = lstatSync(path, { bigint: true });
  if (
    realpathSync(path) !== path ||
    !stat.isDirectory() ||
    typeof process.getuid !== 'function' ||
    stat.uid !== BigInt(process.getuid()) ||
    (stat.mode & 0o7777n) !== 0o700n
  )
    refuse('Build support requires an actual private owned directory');
  return stat;
}

function stateFor(handle) {
  const state = archives.get(handle);
  if (!state || state.closed) refuse('Unknown or closed build support archive');
  return state;
}

function publish(state, name, bytes) {
  if (!/^(?:[0-9]{8}-[0-9]{8}\.part|page-[0-9]{8}\.json|index\.json|failure\.json)$/u.test(name))
    refuse('Build support publication name is outside the fixed layout');
  if (bytes.length > chunkSize) refuse('Build support publication exceeds its chunk bound');
  checkChain(state.chain);
  const path = resolve(state.root, name);
  const pending = resolve(state.root, `pending-${randomUUID()}`);
  const fd = openSync(
    pending,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let stat;
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count <= 0) refuse('Build support publication did not advance');
      offset += count;
    }
    fsyncSync(fd);
    stat = fstatSync(fd, { bigint: true });
    if (
      !stat.isFile() ||
      stat.size !== BigInt(bytes.length) ||
      stat.nlink !== 1n ||
      (stat.mode & 0o7777n) !== 0o600n ||
      stat.uid !== BigInt(process.getuid())
    )
      refuse('Build support publication identity is invalid');
    checkChain(state.chain);
    if (!same(stat, lstatSync(pending, { bigint: true }), fileKeys))
      refuse('Build support publication changed before directory durability');
    linkSync(pending, path);
    fsyncSync(state.chain[0].fd);
    checkChain(state.chain);
    unlinkSync(pending);
    fsyncSync(state.chain[0].fd);
    checkChain(state.chain);
    stat = fstatSync(fd, { bigint: true });
    if (stat.nlink !== 1n || !same(stat, lstatSync(path, { bigint: true }), fileKeys))
      refuse('Build support publication changed after directory durability');
  } finally {
    closeSync(fd);
  }
  const row = { name, byteLength: bytes.length, sha256: hash(bytes), identity: identity(stat) };
  state.published.push(row);
  return row;
}

function verifyPublished(state) {
  checkChain(state.chain);
  for (const row of state.published) {
    const path = resolve(state.root, row.name);
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = fstatSync(fd, { bigint: true });
      if (
        !stat.isFile() ||
        JSON.stringify(identity(stat)) !== JSON.stringify(row.identity) ||
        !same(stat, lstatSync(path, { bigint: true }), fileKeys)
      )
        refuse('Build support retained publication identity changed');
      const bytes = Buffer.alloc(row.byteLength);
      let offset = 0;
      while (offset < bytes.length) {
        const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (!count) refuse('Build support retained publication was truncated');
        offset += count;
      }
      if (
        readSync(fd, Buffer.alloc(1), 0, 1, offset) !== 0 ||
        hash(bytes) !== row.sha256 ||
        !same(stat, fstatSync(fd, { bigint: true }), fileKeys) ||
        !same(stat, lstatSync(path, { bigint: true }), fileKeys)
      )
        refuse('Build support retained publication bytes changed');
      checkChain(state.chain);
    } finally {
      closeSync(fd);
    }
  }
}

function boundedRows(root) {
  const rows = [];
  let pathBytes = 0;
  let totalBytes = 0;
  const visit = (path, depth) => {
    if (depth > 64) refuse('Build support source depth exceeds the fixed bound');
    const name = inside(root, path, true);
    if (rows.length === maximumEntries || (pathBytes += Buffer.byteLength(name)) > maximumPaths)
      refuse('Build support source population exceeds the fixed bound');
    const stat = lstatSync(path, { bigint: true });
    const row = { path: name, permissions: Number(stat.mode & 0o7777n), identity: identity(stat) };
    if (stat.isSymbolicLink()) {
      row.kind = 'link';
      row.target = new TextDecoder('utf-8', { fatal: true }).decode(
        readlinkSync(path, { encoding: 'buffer' }),
      );
      if (isAbsolute(row.target)) refuse('Build support link has an absolute target');
      row.canonicalTarget = inside(root, realpathSync(path), true);
      if (!same(stat, lstatSync(path, { bigint: true }), fileKeys))
        refuse('Build support link changed');
    } else if (stat.isDirectory()) {
      row.kind = 'directory';
      if (realpathSync(path) !== path) refuse('Build support directory has a linked ancestor');
    } else if (stat.isFile()) {
      row.kind = 'file';
      row.role =
        name === 'toolchain/bin/node' &&
        matchingInterpreterRuntime() &&
        stat.size === BigInt(interpreter.byteLength)
          ? interpreter.role
          : 'ordinary';
      const maximum = row.role === interpreter.role ? interpreter.maximumBytes : maximumFile;
      if (realpathSync(path) !== path || stat.size < 0n || stat.size > BigInt(maximum))
        refuse('Build support ordinary source file exceeds the admitted bound or is linked', row);
      totalBytes += Number(stat.size);
      if (totalBytes > maximumTotal)
        refuse('Build support aggregate bytes exceed the fixed bound', row);
    } else refuse('Build support source contains an unsupported member kind', row);
    rows.push(row);
    if (row.kind !== 'directory') return;
    const directory = opendirSync(path, { encoding: 'buffer' });
    const names = [];
    try {
      for (let entry; (entry = directory.readSync()) !== null;) {
        if (names.length + rows.length >= maximumEntries)
          refuse('Build support directory population exceeds the fixed bound');
        const child = new TextDecoder('utf-8', { fatal: true }).decode(entry.name);
        if (
          !child ||
          child === '.' ||
          child === '..' ||
          child.includes('/') ||
          child.includes('\0')
        )
          refuse('Build support source name is not a complete UTF-8 segment');
        names.push(child);
      }
    } finally {
      directory.closeSync();
    }
    names.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    for (const child of names) visit(resolve(path, child), depth + 1);
    if (!same(stat, lstatSync(path, { bigint: true }), fileKeys))
      refuse('Build support directory changed during traversal');
  };
  visit(root, 0);
  return { rows, pathBytes, totalBytes };
}

function ownExternal(rows) {
  if (
    !Array.isArray(rows) ||
    types.isProxy(rows) ||
    Object.getPrototypeOf(rows) !== Array.prototype ||
    rows.length > 10000 ||
    Reflect.ownKeys(rows).length !== rows.length + 1
  )
    refuse('Build support external roster is not bounded own data');
  const copied = [];
  for (let index = 0; index < rows.length; index++) {
    const item = Object.getOwnPropertyDescriptor(rows, String(index));
    if (!item || !('value' in item))
      refuse('Build support external roster has an accessor or hole');
    const row = item.value;
    if (
      !row ||
      typeof row !== 'object' ||
      types.isProxy(row) ||
      ![null, Object.prototype].includes(Object.getPrototypeOf(row))
    )
      refuse('Build support external member is not own data');
    const keys = Reflect.ownKeys(row);
    if (
      keys.length !== 5 ||
      !['path', 'canonical', 'sha256', 'byteLength', 'permissions'].every((key) =>
        keys.includes(key),
      )
    )
      refuse('Build support external member has unsupported fields');
    const copy = {};
    for (const key of keys) {
      const field = Object.getOwnPropertyDescriptor(row, key);
      if (!field.enumerable || !('value' in field))
        refuse('Build support external member has an accessor');
      copy[key] = field.value;
    }
    if (
      typeof copy.path !== 'string' ||
      typeof copy.canonical !== 'string' ||
      copy.path.length > 4096 ||
      copy.canonical.length > 4096 ||
      !isAbsolute(copy.path) ||
      !isAbsolute(copy.canonical) ||
      typeof copy.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(copy.sha256) ||
      !Number.isSafeInteger(copy.byteLength) ||
      copy.byteLength < 0 ||
      !Number.isInteger(copy.permissions) ||
      copy.permissions < 0 ||
      copy.permissions > 0o7777
    )
      refuse('Build support external member identity is invalid');
    copy.role =
      matchingInterpreterRuntime() &&
      copy.canonical === realpathSync(process.execPath) &&
      copy.byteLength === interpreter.byteLength &&
      copy.sha256 === interpreter.sha256
        ? interpreter.role
        : 'ordinary';
    if (copy.byteLength > (copy.role === interpreter.role ? interpreter.maximumBytes : maximumFile))
      refuse('Build support external ordinary file exceeds the admitted bound', copy);
    copied.push(copy);
  }
  copied.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  if (copied.some((row, index) => index && row.path === copied[index - 1].path))
    refuse('Build support external roster is ambiguous');
  return copied;
}

function captureFile(state, path, expected, ordinal, external) {
  const chain = holdChain(dirname(path));
  let fd;
  let failure;
  let result;
  try {
    checkChain(chain);
    const initial = lstatSync(path, { bigint: true });
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd, { bigint: true });
    if (
      !stat.isFile() ||
      realpathSync(path) !== path ||
      !same(initial, stat, fileKeys) ||
      stat.size < 0n ||
      stat.size >
        BigInt(expected.role === interpreter.role ? interpreter.maximumBytes : maximumFile)
    )
      refuse('Build support file is not a stable bounded regular file');
    if (!external && JSON.stringify(identity(stat)) !== JSON.stringify(expected.identity))
      refuse('Build support file differs from the initial complete roster');
    if (
      external &&
      (Number(stat.size) !== expected.byteLength ||
        Number(stat.mode & 0o7777n) !== expected.permissions)
    )
      refuse('Build support external file differs from the parent supplied identity');
    const digest = createHash('sha256');
    const chunks = [];
    let offset = 0;
    while (offset < Number(stat.size)) {
      const bytes = Buffer.alloc(Math.min(chunkSize, Number(stat.size) - offset));
      let filled = 0;
      while (filled < bytes.length) {
        const count = readSync(fd, bytes, filled, bytes.length - filled, offset + filled);
        if (!count) refuse('Build support file ended before the retained size');
        filled += count;
      }
      checkChain(chain);
      if (!same(stat, fstatSync(fd, { bigint: true }), fileKeys))
        refuse('Build support file changed during capture');
      digest.update(bytes);
      chunks.push(
        publish(
          state,
          `${String(ordinal).padStart(8, '0')}-${String(chunks.length).padStart(8, '0')}.part`,
          bytes,
        ),
      );
      offset += filled;
    }
    if (
      readSync(fd, Buffer.alloc(1), 0, 1, offset) !== 0 ||
      !same(stat, fstatSync(fd, { bigint: true }), fileKeys) ||
      !same(stat, lstatSync(path, { bigint: true }), fileKeys)
    )
      refuse('Build support file has no stable complete EOF');
    checkChain(chain);
    const sha256 = digest.digest('hex');
    if (expected.role === interpreter.role && sha256 !== interpreter.sha256)
      refuse('Build support interpreter body differs from the fixed actual body');
    if (external && sha256 !== expected.sha256)
      refuse('Build support external body hash differs from the parent identity');
    result = {
      ...expected,
      sourceIdentity: identity(stat),
      ...(external
        ? {
            sourceAncestors: chain.map((entry) => ({
              path: entry.path,
              identity: Object.fromEntries(
                directoryKeys.map((key) => [key, String(entry.stat[key])]),
              ),
            })),
          }
        : {}),
      sha256,
      byteLength: offset,
      chunks,
      completeDescriptorEof: true,
    };
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (fd !== undefined) closeSync(fd);
    } catch (error) {
      failure ??= error;
    }
    try {
      closeChain(chain);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
  return result;
}

/** Fixed private byte archive, not build/source/origin or cleanup authority. */
export function createHttpBuildSupportArchive(rawRoot) {
  if (
    arguments.length !== 1 ||
    typeof rawRoot !== 'string' ||
    rawRoot.length > 4096 ||
    !isAbsolute(rawRoot)
  )
    refuse('Build support allocation accepts one absolute raw root');
  privateDirectory(rawRoot);
  const parent = holdChain(rawRoot);
  let chain;
  let root, failure;
  try {
    checkChain(parent);
    root = resolve(rawRoot, 'build-support');
    mkdirSync(root, { mode: 0o700 });
    fsyncSync(parent[0].fd);
    checkChain(parent);
    chain = holdChain(root);
    privateDirectory(root);
  } catch (error) {
    failure = error;
  } finally {
    try {
      closeChain(parent);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) {
    if (chain) {
      try {
        closeChain(chain);
      } catch {
        /* The original allocation failure remains sticky. */
      }
    }
    throw failure;
  }
  const handle = Object.freeze(Object.create(null));
  archives.set(handle, {
    root,
    chain,
    published: [],
    started: false,
    closed: false,
    complete: false,
    failure: null,
  });
  return handle;
}

/** Structural paths/identities only. The real parent must bind the entire roster
 * to its own build and independently verify source/native origin afterwards.
 */
export function exportHttpBuildSupportArchive(handle, sourceRoot, externalMembers) {
  if (arguments.length !== 3)
    refuse('Build support export accepts one archive, source root and external roster');
  const state = stateFor(handle);
  if (state.started) refuse('Build support export cannot be replayed, replaced or adopted');
  state.started = true;
  let sourceChain;
  let failure;
  let result;
  try {
    if (typeof sourceRoot !== 'string' || sourceRoot.length > 4096 || !isAbsolute(sourceRoot))
      refuse('Build support source root must be absolute');
    privateDirectory(sourceRoot);
    const destination = relative(sourceRoot, state.root);
    if (
      !destination ||
      (destination !== '..' && !destination.startsWith(`..${sep}`) && !isAbsolute(destination))
    )
      refuse('Build support destination must be outside its source');
    const source = relative(state.root, sourceRoot);
    if (!source || (source !== '..' && !source.startsWith(`..${sep}`) && !isAbsolute(source)))
      refuse('Build support source must be outside its destination');
    sourceChain = holdChain(sourceRoot);
    const external = ownExternal(externalMembers);
    const initial = boundedRows(sourceRoot);
    if (
      initial.rows.length + external.length > maximumEntries ||
      initial.pathBytes +
        external.reduce(
          (bytes, _row, index) =>
            bytes + Buffer.byteLength(`external/${String(index).padStart(8, '0')}`),
          0,
        ) >
        maximumPaths
    )
      refuse('Build support combined physical and external census exceeds the fixed bound');
    const copiedInterpreter = initial.rows.find(
      (row) => row.path === 'toolchain/bin/node' && row.role === interpreter.role,
    );
    const processInterpreter = external.find((row) => row.role === interpreter.role);
    if (Boolean(copiedInterpreter) !== Boolean(processInterpreter))
      refuse(
        'Build support interpreter role requires both actual process and private copied bodies',
      );
    const records = [];
    let ordinal = 0;
    let totalBytes = initial.totalBytes;
    let retainedPathBytes = initial.pathBytes;
    for (const row of initial.rows) {
      records.push(
        row.kind === 'file'
          ? captureFile(state, resolve(sourceRoot, row.path), row, ordinal++, false)
          : row,
      );
    }
    for (const [externalIndex, row] of external.entries()) {
      const aliasChain = holdChain(dirname(row.path));
      try {
        checkChain(aliasChain);
        const alias = lstatSync(row.path, { bigint: true });
        if (
          realpathSync(row.path) !== row.canonical ||
          realpathSync(row.canonical) !== row.canonical
        )
          refuse('Build support external resolution changed');
        const aliasTarget = alias.isSymbolicLink()
          ? new TextDecoder('utf-8', { fatal: true }).decode(
              readlinkSync(row.path, { encoding: 'buffer' }),
            )
          : null;
        totalBytes += row.byteLength;
        if (totalBytes > maximumTotal)
          refuse('Build support aggregate external bytes exceed the fixed bound');
        const captured = captureFile(state, row.canonical, row, ordinal++, true);
        const aliasAncestors = aliasChain.map((entry) => ({
          path: entry.path,
          identity: Object.fromEntries(directoryKeys.map((key) => [key, String(entry.stat[key])])),
        }));
        retainedPathBytes +=
          Buffer.byteLength(row.path) +
          Buffer.byteLength(row.canonical) +
          [...aliasAncestors, ...captured.sourceAncestors].reduce(
            (bytes, entry) => bytes + Buffer.byteLength(entry.path),
            0,
          );
        if (retainedPathBytes > maximumPaths)
          refuse('Build support retained external path metadata exceeds the fixed bound');
        records.push({
          kind: 'external-file',
          logicalPath: `external/${String(externalIndex).padStart(8, '0')}`,
          aliasIdentity: identity(alias),
          aliasTarget,
          aliasAncestors,
          ...captured,
        });
        checkChain(aliasChain);
        if (
          realpathSync(row.path) !== row.canonical ||
          !same(alias, lstatSync(row.path, { bigint: true }), fileKeys)
        )
          refuse('Build support external alias changed after capture');
      } finally {
        closeChain(aliasChain);
      }
    }
    checkChain(sourceChain);
    const final = boundedRows(sourceRoot);
    if (JSON.stringify(initial) !== JSON.stringify(final))
      refuse('Build support whole source population changed during export');
    for (const row of records) {
      if (row.kind !== 'external-file') continue;
      const chain = holdChain(dirname(row.path));
      try {
        checkChain(chain);
        const current = chain.map((entry) => ({
          path: entry.path,
          identity: Object.fromEntries(directoryKeys.map((key) => [key, String(entry.stat[key])])),
        }));
        if (
          JSON.stringify(current) !== JSON.stringify(row.aliasAncestors) ||
          realpathSync(row.path) !== row.canonical ||
          JSON.stringify(identity(lstatSync(row.path, { bigint: true }))) !==
            JSON.stringify(row.aliasIdentity) ||
          JSON.stringify(identity(lstatSync(row.canonical, { bigint: true }))) !==
            JSON.stringify(row.sourceIdentity)
        )
          refuse('Build support external full identity changed before final publication');
      } finally {
        closeChain(chain);
      }
      const canonicalChain = holdChain(dirname(row.canonical));
      try {
        checkChain(canonicalChain);
        const current = canonicalChain.map((entry) => ({
          path: entry.path,
          identity: Object.fromEntries(directoryKeys.map((key) => [key, String(entry.stat[key])])),
        }));
        if (JSON.stringify(current) !== JSON.stringify(row.sourceAncestors))
          refuse('Build support canonical external ancestor identity changed');
      } finally {
        closeChain(canonicalChain);
      }
    }
    const pages = [];
    for (let start = 0; start < records.length; start += 256)
      pages.push(
        publish(
          state,
          `page-${String(pages.length).padStart(8, '0')}.json`,
          Buffer.from(JSON.stringify(records.slice(start, start + 256))),
        ),
      );
    verifyPublished(state);
    const index = {
      schemaVersion: '1.0.0',
      scope: 'complete-physical-build-support-byte-retention',
      sourceRoot,
      sourceEntries: initial.rows.length,
      externalEntries: external.length,
      totalBytes,
      pages,
      completeSourcePopulation: true,
      sourceOriginVerified: false,
      runtimeCustodyComplete: false,
      cleanupComplete: false,
      readinessPromoting: false,
    };
    const receipt = publish(state, 'index.json', Buffer.from(JSON.stringify(index)));
    checkChain(sourceChain);
    verifyPublished(state);
    state.complete = true;
    result = { ...index, root: state.root, receipt };
  } catch (error) {
    failure = error;
    state.failure = error;
    try {
      publish(
        state,
        'failure.json',
        Buffer.from(
          JSON.stringify({
            schemaVersion: '1.0.0',
            code: String(error.code ?? 'HTTP_BUILD_SUPPORT_FAILED'),
            observedMember: error.observedMember ?? null,
            publishedMembers: state.published.length,
            completeSourcePopulation: false,
            sourceOriginVerified: false,
            runtimeCustodyComplete: false,
            cleanupComplete: false,
            readinessPromoting: false,
          }),
        ),
      );
    } catch (archiveError) {
      failure = new AggregateError(
        [error, archiveError],
        'Build support failed; diagnostic publication also failed',
      );
      state.failure = failure;
    }
  } finally {
    for (const chain of [sourceChain, state.chain]) {
      if (!chain) continue;
      try {
        closeChain(chain);
      } catch (error) {
        failure ??= error;
        state.failure ??= error;
        state.complete = false;
      }
    }
    state.closed = true;
  }
  if (failure) throw failure;
  return result;
}

export function snapshotHttpBuildSupportArchive(handle) {
  if (arguments.length !== 1) refuse('Build support snapshot accepts one actual archive');
  const state = archives.get(handle);
  if (!state) refuse('Unknown build support archive');
  return structuredClone({
    root: state.root,
    published: state.published,
    completeSourcePopulation: state.complete,
    failure: state.failure ? String(state.failure.code ?? 'HTTP_BUILD_SUPPORT_FAILED') : null,
    sourceOriginVerified: false,
    runtimeCustodyComplete: false,
    cleanupComplete: false,
    readinessPromoting: false,
  });
}
