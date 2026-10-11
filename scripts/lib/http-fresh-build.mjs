import { httpComposition, isHttpComposition } from './http-composition-roster.mjs';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  statSync,
  writeFileSync,
  watch,
} from 'node:fs';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import YAML from 'yaml';
import {
  createHttpRuntimeProtocol,
  createHttpModuleSnapshotValidator,
  serializeHttpRuntimePlainJson,
} from './http-runtime-protocol.mjs';
import { createReferenceRuntimeProtocol } from './http-reference-loopback-protocol.mjs';
import {
  assertHttpBuildRosterUnchanged,
  snapshotHttpDependencyBytes,
  snapshotHttpTrackedInputs,
} from './http-build-roster.mjs';
import { deriveHttpCompilerPlan, reconcileHttpCompilerOutputs } from './http-compiler-plan.mjs';
import {
  deriveHttpWorkspaceGraph,
  reconcileHttpWorkspaceSelector,
} from './http-workspace-graph.mjs';

import {
  createOwnedReferenceFixture,
  createOwnedPrivacyReferenceFixture,
  ownedReferenceFixtureEnvironment,
  observeOwnedReferenceFixture,
  closeOwnedReferenceFixture,
} from './http-reference-fixture.mjs';
import { deriveReferenceRegistryPlan } from './http-reference-registry.mjs';
import {
  loadHttpQualificationCase,
  loadHttpQualificationRoster,
} from './http-qualification-manifest.mjs';
import { createHttpQualificationProtocol } from './http-qualification-protocol.mjs';
import { decodeHttpQualificationTargetCapture } from './http-qualification-raw.mjs';
import { decodeHttpQualificationNativeMetrics } from './http-qualification-metrics.mjs';
import {
  readHttpQualificationArtifact,
  readHttpQualificationDeclaration,
} from './http-qualification-artifacts.mjs';
import {
  createHttpQualificationStore,
  publishHttpQualificationBytes,
  snapshotHttpQualificationStore,
} from './http-qualification-store.mjs';
import { assertHttpQualificationWorkerBody } from './http-qualification-worker-body.mjs';
import { captureHttpQualificationGeneratorLogs } from './http-qualification-log-capture.mjs';
import {
  assertLivenessQualificationDeclaration,
  createLivenessQualificationAllocation,
  inspectLivenessQualificationOutcomes,
} from './http-qualification-liveness.mjs';
import {
  createOwnedHttpWorker,
  launchOwnedHttpWorker,
  observeOwnedHttpWorker,
  snapshotOwnedHttpWorker,
  waitOwnedHttpWorkerClose,
  sendOwnedHttpWorker,
  terminateOwnedHttpWorker,
  reapOwnedHttpWorker,
} from './http-owned-worker.mjs';

const handles = new WeakMap();
const failedBuilds = new WeakMap();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Published pnpm9.15.0 archive identity, verified against the registry and the
// Corepack locator. The cache's self-authored metadata is not sufficient proof.
const pnpmIntegrity =
  'duI3l2CkMo7EQVgVvNZije5yevN3mqpMkU45RBVsQpmSGon5djge4QfUHxLPpLZmgcqccY8GaPoIMe1MbYulbA==';
const pnpmUrl = 'https://registry.npmjs.org/pnpm/-/pnpm-9.15.0.tgz';
const typescriptIntegrity =
  'y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==';
// Independently reviewed builtin-only executable source closure. Candidate
// hashes cannot expand this allowlist. Architect/Auditor clarification is bound
// in the private review receipts, not inferred from the candidate's own files.
const reviewedHelpers = new Map([
  [
    'packages/core/scripts/emit-openapi.mjs',
    '2f727a25e7f490dd4fbc38b35e58925ef619923df65dd2050efb68ddc8618631',
  ],
  [
    'scripts/verify-reference-api-build-inputs.mjs',
    'b7a92608135e40b80bbcb35b1105e2ef86284764e76590f8f842f9c1c524e660',
  ],
]);
const reviewedHelperAuthority = {
  architect: 'bcad56663f9b66de266f3bfd5dc371dd35c636b79796f22f0632dcb0af5cb5fa',
  auditor: 'a3740f921bbbeddd0635fa39e6c793837856aeb88c0d494eb596426af8cf6eb7',
};

function refuse(message) {
  const error = new Error(message);
  error.code = 'HTTP_FRESH_BUILD_INVALID';
  throw error;
}

function owned(root, path) {
  const name = relative(root, path);
  if (name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name))
    refuse('Fresh build path escapes ownership');
  return name.split(sep).join('/');
}

function byteRow(root, path) {
  if (!lstatSync(path).isFile() || realpathSync(path) !== path)
    refuse('Fresh build requires an unlinked regular file');
  const bytes = readFileSync(path);
  return {
    path: owned(root, path),
    sha256: digest(bytes),
    byteLength: bytes.length,
    permissions: lstatSync(path).mode & 0o7777,
  };
}

function physicalFiles(root, directory) {
  const rows = [];
  const visit = (path) => {
    owned(root, path);
    if (realpathSync(path) !== path || lstatSync(path).isSymbolicLink())
      refuse('Linked fresh build member');
    const stat = lstatSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(resolve(path, name));
    } else if (stat.isFile()) rows.push(byteRow(root, path));
    else refuse('Unsupported fresh build member kind');
  };
  visit(directory);
  return rows;
}

function childEnvironment(state, build = false) {
  return {
    PATH: `${build ? `${resolve(state.sandbox, 'toolchain/build-bin')}:` : ''}${resolve(state.sandbox, 'toolchain/bin')}:/usr/bin:/bin`,
    HOME: resolve(state.sandbox, 'home'),
    TMPDIR: resolve(state.sandbox, 'tmp'),
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    CI: 'true',
    FORCE_COLOR: '0',
    NODE_DISABLE_COMPILE_CACHE: '1',
    DISABLE_V8_COMPILE_CACHE: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_NO_LAZY_FETCH: '1',
    ...(state.gitExecutionPath ? { GIT_EXEC_PATH: state.gitExecutionPath } : {}),
    npm_config_userconfig: resolve(state.sandbox, 'config/empty.npmrc'),
    npm_config_globalconfig: resolve(state.sandbox, 'config/empty.npmrc'),
    npm_config_store_dir: resolve(state.sandbox, 'store'),
    npm_config_virtual_store_dir: 'node_modules/.pnpm',
    npm_config_enable_pre_post_scripts: 'true',
    npm_config_script_shell: '/bin/sh',
    npm_config_manage_package_manager_versions: 'false',
    npm_config_update_notifier: 'false',
    npm_config_ignore_pnpmfile: 'true',
  };
}

function runtimeEnvironment(state) {
  const environment = childEnvironment(state);
  if (state.platform === 'darwin') {
    // CoreFoundation otherwise inserts this key after spawn. Preserve the
    // actual nonsecret host encoding explicitly, including its current UID,
    // rather than ignoring an unexpected key in the worker's exact check.
    const encoding = process.env.__CF_USER_TEXT_ENCODING;
    const uid = `0x${process.getuid().toString(16).toUpperCase()}`;
    if (
      typeof encoding !== 'string' ||
      !/^0x[0-9A-F]+:0x[0-9A-F]+:0x[0-9A-F]+$/iu.test(encoding) ||
      encoding.split(':')[0].toUpperCase() !== uid.toUpperCase()
    )
      refuse('Runtime host text encoding is absent or unbound');
    environment.__CF_USER_TEXT_ENCODING = encoding;
  }
  return environment;
}

async function run(state, label, executable, args, { cwd = state.checkout, credential } = {}) {
  if (state.systemTools?.has(executable))
    checkExecutableIdentity(state.systemTools.get(executable));
  else if (executable !== state.node) refuse('Unbound supervisor executable');
  const environment = childEnvironment(state, label === 'build');
  if (credential) environment.NODE_AUTH_TOKEN = credential;
  const logPrefix = resolve(state.sandbox, 'logs', `${state.commands.length}-${label}`);
  const stdout = [];
  const stderr = [];
  let length = 0;
  let failure;
  const child = spawn(executable, args, {
    cwd,
    env: environment,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const terminate = () => {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* owned group already exited */
    }
  };
  const timeoutMs = ['install', 'build'].includes(label) ? 900000 : 180000;
  const deadline = setTimeout(() => {
    failure ??= new Error('Fresh build child exceeded its wall-clock bound');
    terminate();
  }, timeoutMs);
  const collect = (chunks, chunk) => {
    length += chunk.length;
    if (length > 64 * 1024 * 1024) {
      failure ??= new Error('Fresh build child log exceeds the supported bound');
      terminate();
    } else chunks.push(chunk);
  };
  child.stdout.on('data', (chunk) => collect(stdout, chunk));
  child.stderr.on('data', (chunk) => collect(stderr, chunk));
  const result = await new Promise((accept) => {
    child.once('error', (error) => {
      failure = error;
    });
    child.once('close', (code, signal) => accept({ code, signal }));
  });
  clearTimeout(deadline);
  const sanitize = (chunks) => {
    let text = Buffer.concat(chunks).toString('utf8');
    if (credential)
      for (const secret of [credential, encodeURIComponent(credential)])
        text = text.split(secret).join('[REDACTED]');
    return text;
  };
  const text = sanitize(stdout);
  const outPath = `${logPrefix}.stdout.log`;
  const errPath = `${logPrefix}.stderr.log`;
  writeFileSync(outPath, text, { mode: 0o600 });
  writeFileSync(errPath, sanitize(stderr), { mode: 0o600 });
  state.commands.push({
    label,
    executable: state.systemTools?.has(executable) ? executable : owned(state.sandbox, executable),
    args: args.slice(),
    cwd: owned(state.sandbox, cwd),
    exitCode: result.code,
    signal: result.signal,
    timeoutMs,
    pid: child.pid ?? null,
    stdout: byteRow(state.sandbox, outPath),
    stderr: byteRow(state.sandbox, errPath),
  });
  if (state.systemTools?.has(executable))
    checkExecutableIdentity(state.systemTools.get(executable));
  if (failure || result.code !== 0 || result.signal)
    refuse(`Fresh build ${label} failed; preserved private logs ${logPrefix}`);
  return text;
}

function gitArgs(root, args) {
  return [
    '--no-pager',
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'core.autocrlf=false',
    '-C',
    root,
    ...args,
  ];
}

function parseRequest(request) {
  if (
    !request ||
    typeof request !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(request))
  )
    refuse('Fresh build request must be a plain record');
  const keys = Reflect.ownKeys(request);
  if (
    keys.length !== 3 ||
    !['sourceRepository', 'candidateCommit', 'rootId'].every((key) => keys.includes(key))
  )
    refuse('Unsupported fresh build request field');
  const values = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(request, key);
    if (!descriptor.enumerable || !('value' in descriptor) || typeof descriptor.value !== 'string')
      refuse('Fresh build request cannot contain accessors');
    values[key] = descriptor.value;
  }
  if (
    !isAbsolute(values.sourceRepository) ||
    !/^[a-f0-9]{40}$/u.test(values.candidateCommit) ||
    !isHttpComposition(values.rootId)
  )
    refuse('Unsupported fresh build candidate or root');
  values.sourceRepository = realpathSync(values.sourceRepository);
  return values;
}

async function prepareToolchain(state) {
  if (process.versions.node !== '24.20.0')
    refuse('Fresh build requires the pinned Node24.20.0 interpreter');
  const nodeSource = realpathSync(process.execPath);
  const bin = resolve(state.sandbox, 'toolchain/bin');
  mkdirSync(bin, { recursive: true });
  state.node = resolve(bin, 'node');
  copyFileSync(nodeSource, state.node);
  chmodSync(state.node, 0o755);
  if (digest(readFileSync(state.node)) !== digest(readFileSync(nodeSource)))
    refuse('Copied fresh build interpreter changed');
  // Apple platform executables are used at their canonical system locations;
  // copying them causes SIGKILL on the supported macOS platform. Every actual
  // executable and Git helper is bound before use and rechecked before admission.
  state.git = '/usr/bin/git';
  state.tar = '/usr/bin/tar';
  state.systemTools = new Map(
    ['/usr/bin/git', '/usr/bin/tar', '/usr/bin/xcrun'].map((path) => [
      path,
      executableIdentity(path),
    ]),
  );
  state.gitActual = (
    await run(state, 'git-location', '/usr/bin/xcrun', ['--find', 'git'], { cwd: state.sandbox })
  ).trim();
  if (!isAbsolute(state.gitActual) || !state.gitActual.endsWith('/usr/bin/git'))
    refuse('Unsupported system Git location');
  state.systemTools.set(state.gitActual, executableIdentity(state.gitActual));
  state.git = state.gitActual;
  state.gitExecutionPath = (
    await run(state, 'git-exec-path', state.gitActual, ['--exec-path'], { cwd: state.sandbox })
  ).trim();
  if (state.gitExecutionPath !== resolve(dirname(dirname(state.gitActual)), 'libexec/git-core'))
    refuse('Unsupported system Git helper location');
  state.gitHelpers = gitHelperFiles(state.gitExecutionPath, state.gitActual);
  const destination = await fetchPublishedPackage(state, 'pnpm', '9.15.0', pnpmUrl, pnpmIntegrity);
  state.typescriptPublished = await fetchPublishedPackage(
    state,
    'typescript',
    '6.0.3',
    'https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz',
    typescriptIntegrity,
  );
  const manifest = JSON.parse(readFileSync(resolve(destination, 'package.json'), 'utf8'));
  if (
    manifest.name !== 'pnpm' ||
    manifest.version !== '9.15.0' ||
    manifest.bin?.pnpm !== 'bin/pnpm.cjs'
  )
    refuse('Pinned package-manager archive manifest mismatch');
  state.pnpm = resolve(destination, 'bin/pnpm.cjs');
  try {
    const optionalCache = createRequire(state.pnpm).resolve('v8-compile-cache');
    owned(destination, realpathSync(optionalCache));
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
  const shim = resolve(bin, 'pnpm');
  writeFileSync(shim, '#!/usr/bin/env node\nrequire("../pnpm-published/bin/pnpm.cjs");\n', {
    mode: 0o755,
  });
  const version = await run(state, 'pnpm-version', state.node, [state.pnpm, '--version'], {
    cwd: state.sandbox,
  });
  if (version.trim() !== '9.15.0') refuse('Pinned package-manager executable version mismatch');
  state.toolchain = physicalFiles(state.sandbox, resolve(state.sandbox, 'toolchain'));
  state.toolchainFingerprint = digest(
    Buffer.from(
      state.toolchain.map((row) => `${row.path}\0${row.sha256}\0${row.permissions}\n`).join(''),
    ),
  );
}

async function fetchPublishedPackage(state, name, version, url, integrity) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60000) });
  if (!response.ok || response.url !== url)
    refuse('Pinned package-manager archive download failed');
  const reader = response.body?.getReader();
  if (!reader) refuse('Pinned package-manager archive has no readable body');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32 * 1024 * 1024) {
        await reader.cancel();
        refuse('Pinned package-manager archive exceeds the allocation bound');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  if (
    bytes.length > 32 * 1024 * 1024 ||
    createHash('sha512').update(bytes).digest('base64') !== integrity
  )
    refuse('Pinned package-manager archive integrity mismatch');
  const archive = resolve(state.sandbox, `${name}-${version}.tgz`);
  writeFileSync(archive, bytes, { mode: 0o600 });
  const tar = state.tar;
  const members = await run(state, `${name}-archive-list`, tar, ['-tzf', archive], {
    cwd: state.sandbox,
  });
  for (const member of members.trimEnd().split('\n')) {
    if (
      !member.startsWith('package/') ||
      member.split('/').some((part) => part === '..') ||
      member.includes('\\')
    )
      refuse('Unsafe pinned package-manager archive member');
  }
  const verbose = await run(state, `${name}-archive-kinds`, tar, ['-tvzf', archive], {
    cwd: state.sandbox,
  });
  if (
    verbose
      .trimEnd()
      .split('\n')
      .some((line) => !['-', 'd'].includes(line[0]))
  )
    refuse('Pinned package-manager archive contains a linked or special member');
  const destination = resolve(state.sandbox, `toolchain/${name}-published`);
  mkdirSync(destination);
  await run(
    state,
    `${name}-archive-extract`,
    tar,
    ['-xzf', archive, '--no-same-owner', '--strip-components=1', '-C', destination],
    { cwd: state.sandbox },
  );
  state.packageArchives ??= [];
  state.packageArchives.push({
    name,
    version,
    url,
    integrity: `sha512-${integrity}`,
    archive: byteRow(state.sandbox, archive),
  });
  return destination;
}

function externalFileIdentity(path) {
  const canonical = realpathSync(path);
  const stat = lstatSync(canonical);
  if (!stat.isFile()) refuse('Unsupported system toolchain member');
  const bytes = readFileSync(canonical);
  return {
    path,
    canonical,
    sha256: digest(bytes),
    byteLength: bytes.length,
    permissions: stat.mode & 0o7777,
  };
}

function executableIdentity(path) {
  const row = externalFileIdentity(path);
  if (!(row.permissions & 0o111)) refuse('Unsupported build executable');
  return row;
}

function checkExecutableIdentity(row) {
  const actual = executableIdentity(row.path);
  for (const key of ['canonical', 'sha256', 'byteLength', 'permissions'])
    if (row[key] !== actual[key]) refuse('Supervisor executable identity changed');
}

function gitHelperFiles(root, git) {
  const rows = [];
  const visit = (directory) => {
    if (realpathSync(directory) !== directory || !lstatSync(directory).isDirectory())
      refuse('Linked Git helper directory');
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) visit(path);
      else {
        const row = externalFileIdentity(path);
        const installedBins = ['git', 'git-shell', 'scalar'].map((name) =>
          resolve(dirname(git), name),
        );
        if (!installedBins.includes(row.canonical) && !row.canonical.startsWith(`${root}/`))
          refuse('Git helper link escapes its bound installation');
        rows.push(row);
      }
    }
  };
  visit(root);
  return rows;
}

function pathExecutable(value, name) {
  const directories = value.split(':');
  if (directories.some((directory) => !directory || !isAbsolute(directory)))
    refuse('Unsupported lifecycle PATH');
  for (const directory of directories) {
    const path = resolve(directory, name);
    if (!existsSync(path)) continue;
    const stat = lstatSync(realpathSync(path));
    if (stat.isFile() && stat.mode & 0o111) return path;
  }
  refuse('Required lifecycle executable is absent');
}

function flattenManifest(value, prefix = 'npm_package_', output = {}) {
  for (const [key, item] of Object.entries(value)) {
    if (key.startsWith('_') || key === 'readme') continue;
    const name = `${prefix}${key}`.replace(/[^a-zA-Z0-9_]/gu, '_');
    if (item && typeof item === 'object') flattenManifest(item, `${name}_`, output);
    else {
      let text = String(item);
      if (text.includes('\n')) text = JSON.stringify(text);
      if (Object.hasOwn(output, name)) refuse('Colliding lifecycle manifest projection');
      output[name] = text;
    }
  }
  return output;
}

function environmentChoices(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [value]]));
}

function compilerShim(shim, compilerRoot, checkout, command = 'tsc') {
  const nodePath = [
    resolve(compilerRoot, 'bin/node_modules'),
    resolve(compilerRoot, 'node_modules'),
    dirname(compilerRoot),
    resolve(checkout, 'node_modules/.pnpm/node_modules'),
  ].join(':');
  const target =
    shim === resolve(checkout, `node_modules/.bin/${command}`)
      ? `../typescript/bin/${command}`
      : relative(dirname(shim), resolve(compilerRoot, `bin/${command}`))
          .split(sep)
          .join('/');
  const body =
    '#!/bin/sh\n' +
    'basedir=$(dirname "$(echo "$0" | sed -e \'s,\\\\,/,g\')")\n\n' +
    'case `uname` in\n    *CYGWIN*) basedir=`cygpath -w "$basedir"`;;\nesac\n\n' +
    'if [ -z "$NODE_PATH" ]; then\n' +
    `  export NODE_PATH="${nodePath}"\n` +
    'else\n' +
    `  export NODE_PATH="${nodePath}:$NODE_PATH"\n` +
    'fi\nif [ -x "$basedir/node" ]; then\n' +
    `  exec "$basedir/node"  "$basedir/${target}" "$@"\n` +
    'else\n' +
    `  exec node  "$basedir/${target}" "$@"\n` +
    'fi\n';
  if (readFileSync(shim, 'utf8') !== body || existsSync(resolve(dirname(shim), 'node')))
    refuse('Unreviewed installed compiler shim');
  if (realpathSync(resolve(dirname(shim), target)) !== resolve(compilerRoot, `bin/${command}`))
    refuse('Compiler shim targets another package');
  return {
    ...executableIdentity(shim),
    target,
    compiler: resolve(compilerRoot, `bin/${command}`),
    argvPath: resolve(dirname(shim), target),
    nodePath,
  };
}

function verifyReviewedBuildSources(state) {
  for (const [name, sha256] of reviewedHelpers) {
    const path = resolve(state.checkout, name);
    const row = byteRow(state.checkout, path);
    if (
      row.sha256 !== sha256 ||
      !state.inputs.files.some((entry) => entry.path === name && entry.sha256 === sha256)
    )
      refuse('Executable build helper lacks independent source review');
  }
  const lexicalPresence = (path) => {
    try {
      lstatSync(path);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  };
  for (const member of ['', ...state.graph.workspaces.map((row) => row.root)]) {
    const root = resolve(state.checkout, member);
    const modules = resolve(root, 'node_modules');
    if (lexicalPresence(resolve(root, '.hooks')) || lexicalPresence(resolve(modules, '.hooks')))
      refuse('Unreviewed workspace lifecycle hook');
    if (lexicalPresence(modules)) {
      const actual = realpathSync(modules);
      owned(state.checkout, actual);
      if (lexicalPresence(resolve(actual, '.hooks'))) refuse('Unreviewed installed lifecycle hook');
    }
  }
}

function verifyPublishedCompiler(state) {
  const entry = realpathSync(
    createRequire(resolve(state.checkout, 'package.json')).resolve('typescript'),
  );
  const root = dirname(dirname(entry));
  owned(resolve(state.checkout, 'node_modules'), root);
  if (entry !== resolve(root, 'lib/typescript.js')) refuse('Unsupported actual compiler entry');
  const published = new Map(
    physicalFiles(state.typescriptPublished, state.typescriptPublished).map((row) => [
      row.path,
      row,
    ]),
  );
  const actual = physicalFiles(root, root);
  const extraShims = [];
  for (const row of actual) {
    const expected = published.get(row.path);
    if (expected) {
      for (const key of ['sha256', 'byteLength', 'permissions'])
        if (expected[key] !== row[key])
          refuse('Installed compiler differs from the pinned published package');
      published.delete(row.path);
    } else if (['node_modules/.bin/tsc', 'node_modules/.bin/tsserver'].includes(row.path)) {
      extraShims.push(
        compilerShim(
          resolve(root, row.path),
          root,
          state.checkout,
          row.path.endsWith('/tsserver') ? 'tsserver' : 'tsc',
        ),
      );
    } else refuse('Unexpected compiler package member');
  }
  if (published.size) refuse('Installed compiler package is incomplete');
  state.compilerPackage = {
    root,
    published: state.packageArchives.find((row) => row.name === 'typescript'),
    files: actual,
    generatedShims: extraShims,
  };
}

function prepareBuildObserver(state) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64')
    refuse('Unreviewed build launcher platform');
  const bin = resolve(state.sandbox, 'toolchain/build-bin');
  mkdirSync(bin);
  const observer = resolve(state.sandbox, 'toolchain/build-observer.cjs');
  copyFileSync(fileURLToPath(new URL('./http-build-observer.cjs', import.meta.url)), observer);
  chmodSync(observer, 0o600);
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const launcher = resolve(bin, 'node');
  writeFileSync(
    launcher,
    `#!/bin/sh\nexec ${quote(state.node)} --require ${quote(observer)} "$@"\n`,
    { mode: 0o755 },
  );
  const environment = childEnvironment(state, true);
  const pnpmRoot = dirname(dirname(state.pnpm));
  const gyp = resolve(pnpmRoot, 'dist/node-gyp-bin');
  const rootBin = resolve(state.checkout, 'node_modules/.bin');
  const compilerRoot = dirname(
    dirname(
      realpathSync(createRequire(resolve(state.checkout, 'package.json')).resolve('typescript')),
    ),
  );
  const compilerEntry = resolve(compilerRoot, 'bin/tsc');
  const compilerFiles = physicalFiles(state.checkout, compilerRoot);
  const nodeGyp = resolve(pnpmRoot, 'dist/node_modules/node-gyp/bin/node-gyp.js');
  const lifecycles = [];
  const startups = [
    {
      id: 'pnpm-root',
      cwd: state.checkout,
      argv: [state.pnpm, '--filter', '@stynx-nyx/reference-api...', 'build'],
      environment: environmentChoices(environment),
    },
  ];
  const helpers = new Map([
    ['/bin/sh', executableIdentity('/bin/sh')],
    ['/usr/bin/env', executableIdentity('/usr/bin/env')],
  ]);
  const configurations = Object.fromEntries(
    Object.entries(environment)
      .filter(([key]) => key.startsWith('npm_config_'))
      .map(([key, value]) => [key, value === 'false' ? '' : value]),
  );
  Object.assign(configurations, {
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_user_agent: `pnpm/9.15.0 npm/? node/v24.20.0 ${process.platform} ${process.arch}`,
    npm_config_recursive: 'true',
    npm_config_frozen_lockfile: '',
    npm_config_node_gyp: nodeGyp,
  });
  // Pnpm consumes the bound scoped registry configuration but does not project
  // those two scoped keys into its lifecycle environment.
  const nonNpm = Object.fromEntries(
    Object.entries(environment).filter(([key]) => !key.startsWith('npm_')),
  );
  for (const member of state.graph.selected) {
    const cwd = resolve(state.checkout, member.root);
    const manifest = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
    const lifecyclePath = [resolve(cwd, 'node_modules/.bin'), gyp, rootBin, environment.PATH].join(
      ':',
    );
    const expectedTools = {
      node: launcher,
      pnpm: resolve(state.sandbox, 'toolchain/bin/pnpm'),
      rm: '/bin/rm',
      dirname: '/usr/bin/dirname',
      sed: '/usr/bin/sed',
      uname: '/usr/bin/uname',
      env: '/usr/bin/env',
    };
    for (const [name, expected] of Object.entries(expectedTools)) {
      const path = pathExecutable(lifecyclePath, name);
      if (path !== expected) refuse('Lifecycle PATH shadows a reviewed executable');
      helpers.set(path, executableIdentity(path));
    }
    const shim = compilerShim(pathExecutable(lifecyclePath, 'tsc'), compilerRoot, state.checkout);
    const values = {
      ...nonNpm,
      ...flattenManifest(manifest),
      ...configurations,
      PATH: lifecyclePath,
      npm_lifecycle_event: 'build',
      npm_lifecycle_script: member.buildScript,
      NODE: state.node,
      npm_node_execpath: state.node,
      npm_execpath: state.pnpm,
      INIT_CWD: state.checkout,
      npm_command: 'run-script',
      PNPM_SCRIPT_SRC_DIR: cwd,
    };
    lifecycles.push({
      id: `${member.root}:build`,
      parent: 'pnpm-root',
      cwd,
      script: member.buildScript,
      environment: environmentChoices(values),
      compilerShim: shim,
    });
    const startupEnvironment = environmentChoices({
      ...values,
      NODE_PATH: shim.nodePath,
      PWD: cwd,
      SHLVL: '1',
    });
    startupEnvironment._ = [
      launcher,
      resolve(state.sandbox, 'toolchain/bin/pnpm'),
      state.node,
      null,
    ];
    startups.push({
      id: `${member.root}:tsc`,
      cwd,
      argv: [shim.argvPath, '-p', member.compilerConfig],
      environment: startupEnvironment,
    });
    if (member.root === 'reference/api') {
      const entry = resolve(state.checkout, 'scripts/verify-reference-api-build-inputs.mjs');
      const verifierEnvironment = { ...startupEnvironment };
      delete verifierEnvironment.NODE_PATH;
      startups.push({
        id: 'reference-verifier',
        cwd,
        argv: [entry],
        environment: verifierEnvironment,
      });
    }
    if (member.root === 'packages/core') {
      const nestedEnvironment = { ...startupEnvironment };
      delete nestedEnvironment.NODE_PATH;
      const nestedShim = resolve(state.sandbox, 'toolchain/bin/pnpm');
      startups.push({
        id: 'pnpm-core',
        cwd,
        argv: [nestedShim, 'run', '@stynx:emit-openapi'],
        environment: nestedEnvironment,
      });
      const script = member.nestedScripts['@stynx:emit-openapi'];
      const nestedPath = [resolve(cwd, 'node_modules/.bin'), gyp, rootBin, lifecyclePath].join(':');
      const nestedValues = {
        ...values,
        PATH: nestedPath,
        PWD: cwd,
        SHLVL: '1',
        npm_lifecycle_event: '@stynx:emit-openapi',
        npm_lifecycle_script: script,
        npm_execpath: nestedShim,
        INIT_CWD: cwd,
      };
      const nestedChoices = environmentChoices(nestedValues);
      // Pnpm's second config parse drops these two empty boolean projections;
      // their absence is exact, rather than optional on arbitrary environments.
      delete nestedChoices.npm_config_manage_package_manager_versions;
      delete nestedChoices.npm_config_update_notifier;
      nestedChoices._ = [launcher, nestedShim, state.node, null];
      lifecycles.push({
        id: `${member.root}:generator`,
        parent: 'pnpm-core',
        cwd,
        script,
        environment: nestedChoices,
      });
      const generated = { ...nestedChoices, SHLVL: ['2'] };
      startups.push({
        id: 'core-generator',
        cwd,
        argv: [resolve(cwd, 'scripts/emit-openapi.mjs')],
        environment: generated,
      });
    }
  }
  const logDirectory = resolve(state.sandbox, 'logs/lifecycle');
  mkdirSync(logDirectory);
  const descriptor = { run: randomUUID(), logDirectory, node: state.node, startups, lifecycles };
  const descriptorPath = resolve(state.sandbox, 'toolchain/build-descriptor.json');
  writeFileSync(descriptorPath, JSON.stringify(descriptor), { mode: 0o600 });
  state.observer = observer;
  state.buildDescriptor = descriptor;
  state.launcherClosure = {
    helpers: [...helpers.values()],
    compilerFiles,
    compilerEntry,
    descriptor: byteRow(state.sandbox, descriptorPath),
    observer: byteRow(state.sandbox, observer),
    launcher: byteRow(state.sandbox, launcher),
  };
  state.toolchain = physicalFiles(state.sandbox, resolve(state.sandbox, 'toolchain'));
  state.toolchainFingerprint = digest(
    Buffer.from(
      state.toolchain.map((row) => `${row.path}\0${row.sha256}\0${row.permissions}\n`).join(''),
    ),
  );
}

function reconcileBuildObservation(state) {
  const descriptor = state.buildDescriptor;
  const files = readdirSync(descriptor.logDirectory).sort();
  if (files.length !== descriptor.startups.length) refuse('Missing or extra actual build startup');
  const seenStartups = new Set();
  const seenLifecycles = new Set();
  const processes = [];
  let totalBytes = 0;
  for (const name of files) {
    if (!/^[1-9][0-9]*-[a-f0-9-]{36}[.]jsonl$/u.test(name)) refuse('Unknown observer log');
    const file = resolve(descriptor.logDirectory, name);
    totalBytes += lstatSync(file).size;
    if (realpathSync(file) !== file || !lstatSync(file).isFile() || totalBytes > 64 * 1024 * 1024)
      refuse('Invalid or oversized build observation');
    const bytes = readFileSync(file);
    if (bytes.length > 64 * 1024 * 1024 || bytes[bytes.length - 1] !== 10)
      refuse('Truncated build observation');
    const events = bytes
      .toString('utf8')
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));
    if (events.length < 2 || events[0].type !== 'startup' || events.at(-1).type !== 'finished')
      refuse('Incomplete build observation');
    const startup = events[0];
    if (
      !descriptor.startups.some((entry) => entry.id === startup.id) ||
      seenStartups.has(startup.id) ||
      events.at(-1).code !== 0 ||
      events.at(-1).refused !== false
    )
      refuse('Refused or duplicate actual startup');
    seenStartups.add(startup.id);
    const children = new Map();
    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      if (
        event.run !== descriptor.run ||
        event.session !== startup.session ||
        event.pid !== startup.pid ||
        event.sequence !== index
      )
        refuse('Forked build observation session');
      if (event.type === 'spawn-start') {
        if (
          children.has(event.id) ||
          seenLifecycles.has(event.lifecycle) ||
          !descriptor.lifecycles.some(
            (entry) => entry.id === event.lifecycle && entry.parent === startup.id,
          )
        )
          refuse('Duplicate or extra lifecycle');
        children.set(event.id, { created: false, spawned: false, exit: false, close: false });
        seenLifecycles.add(event.lifecycle);
      } else if (
        ['spawn-created', 'child-spawn', 'child-exit', 'child-close'].includes(event.type)
      ) {
        const child = children.get(event.id);
        if (!child) refuse('Unmatched child event');
        const kind =
          event.type === 'spawn-created'
            ? 'created'
            : event.type === 'child-spawn'
              ? 'spawned'
              : event.type === 'child-exit'
                ? 'exit'
                : 'close';
        if (
          child[kind] ||
          (['exit', 'close'].includes(kind) && (event.code !== 0 || event.signal !== null)) ||
          (kind === 'spawned' && (!Number.isSafeInteger(event.childPid) || event.childPid < 1))
        )
          refuse('Failed or duplicate child event');
        child[kind] = true;
      } else if (
        !['startup', 'finished'].includes(event.type) ||
        (event.type === 'startup' && index !== 0) ||
        (event.type === 'finished' && index !== events.length - 1)
      )
        refuse('Unknown build observer event');
    }
    if (
      [...children.values()].some(
        (child) => !child.created || !child.spawned || !child.exit || !child.close,
      )
    )
      refuse('Actual lifecycle did not complete');
    processes.push({ file: byteRow(state.sandbox, file), events });
  }
  if (
    seenStartups.size !== descriptor.startups.length ||
    seenLifecycles.size !== descriptor.lifecycles.length
  )
    refuse('Actual lifecycle population differs');
  const shellChildren = new Map();
  for (const entry of processes) {
    const starts = new Map(
      entry.events
        .filter((event) => event.type === 'spawn-start')
        .map((event) => [event.id, event.lifecycle]),
    );
    for (const event of entry.events)
      if (event.type === 'child-spawn') shellChildren.set(starts.get(event.id), event.childPid);
  }
  for (const entry of processes) {
    const startup = entry.events[0];
    const expected = descriptor.startups.find((row) => row.id === startup.id);
    if (
      startup.cwd !== expected.cwd ||
      startup.argv.length !== expected.argv.length + 1 ||
      startup.argv[0] !== state.node ||
      expected.argv.some((value, index) => value !== startup.argv[index + 1])
    )
      refuse('Actual startup arguments differ');
    if (startup.id === 'pnpm-root') {
      if (startup.pid !== state.commands.findLast((command) => command.label === 'build')?.pid)
        refuse('Root build process identity differs');
    } else {
      const lifecycle =
        startup.id === 'core-generator'
          ? 'packages/core:generator'
          : startup.id === 'pnpm-core'
            ? 'packages/core:build'
            : startup.id === 'reference-verifier'
              ? 'reference/api:build'
              : `${startup.id.slice(0, -4)}:build`;
      const childPid = shellChildren.get(lifecycle);
      if (startup.pid !== childPid && startup.ppid !== childPid)
        refuse('Startup is unrelated to its actual shell child');
    }
  }
  state.buildObservation = {
    run: descriptor.run,
    processes,
    directlyObserved: 'Node startup and public async child_process shell lifecycle',
    derived: 'Closed shell/shim helper and compiler input-byte identities',
    runtimeCustodyComplete: false,
    readinessPromoting: false,
  };
}

function noPriorOutputs(state) {
  for (const member of state.graph.selected)
    if (existsSync(resolve(state.checkout, member.root, 'dist')))
      refuse('Fresh checkout already contains selected build output');
  const inspect = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      if (entry.name.endsWith('.tsbuildinfo')) refuse('Fresh checkout contains a compiler cache');
      if (entry.isDirectory()) inspect(resolve(directory, entry.name));
    }
  };
  inspect(state.checkout);
}

function admitInstallConfiguration(state) {
  const configuration = resolve(state.checkout, '.npmrc');
  const allowed = new Set([
    '@stynx-nyx:registry=https://npm.pkg.github.com',
    '@aarusso-nyx:registry=https://npm.pkg.github.com',
    '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}',
  ]);
  if (existsSync(configuration)) {
    const lines = readFileSync(configuration, 'utf8').trimEnd().split('\n');
    if (lines.length !== allowed.size || lines.some((line) => !allowed.delete(line)))
      refuse('Unreviewed install configuration');
  }
  const workspace = YAML.parseDocument(
    readFileSync(resolve(state.checkout, 'pnpm-workspace.yaml'), 'utf8'),
    { uniqueKeys: true },
  );
  if (
    workspace.errors.length ||
    Object.keys(workspace.toJS() ?? {}).some((key) => key !== 'packages')
  )
    refuse('Unreviewed workspace install configuration');
  for (const member of ['', ...state.graph.workspaces.map((row) => row.root)]) {
    if (member && existsSync(resolve(state.checkout, member, '.npmrc')))
      refuse('Unreviewed workspace npm configuration');
    for (const hook of ['.pnpmfile.cjs', '.pnpmfile.js'])
      if (existsSync(resolve(state.checkout, member, hook)))
        refuse('Fresh install contains an unreviewed pnpmfile hook');
    const manifest = JSON.parse(
      readFileSync(resolve(state.checkout, member, 'package.json'), 'utf8'),
    );
    if (manifest.packageManager !== undefined && manifest.packageManager !== 'pnpm@9.15.0')
      refuse('Unreviewed workspace package-manager launcher');
    if (manifest.pnpm && Object.keys(manifest.pnpm).some((key) => key !== 'overrides'))
      refuse('Unreviewed manifest install configuration');
    for (const version of Object.values(manifest.pnpm?.overrides ?? {})) {
      if (typeof version !== 'string') refuse('Malformed install override');
      if (version.startsWith('link:')) {
        const root = owned(state.checkout, resolve(state.checkout, member, version.slice(5)));
        if (!state.graph.workspaces.some((row) => row.root === root))
          refuse('Install override links outside a declared workspace');
      } else if (/[\\/:]/u.test(version))
        refuse('Unreviewed install override protocol or directory');
    }
  }
}

function preflightCompilers(state) {
  const require = createRequire(resolve(state.checkout, 'package.json'));
  const compilerPath = realpathSync(require.resolve('typescript'));
  owned(resolve(state.checkout, 'node_modules'), compilerPath);
  const ts = require('typescript');
  if (ts.version !== '6.0.3') refuse('Fresh build requires installed TypeScript6.0.3');
  for (const member of state.graph.selected) {
    const path = resolve(state.checkout, member.root, member.compilerConfig);
    const parsed = ts.getParsedCommandLineOfConfigFile(
      path,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic() {
          refuse('Invalid compiler configuration');
        },
      },
    );
    const options = parsed?.options;
    if (
      !options ||
      parsed.errors.length ||
      options.incremental ||
      options.composite ||
      options.tsBuildInfoFile ||
      options.noEmit ||
      options.noCheck ||
      options.emitDeclarationOnly ||
      options.outFile ||
      options.inlineSourceMap ||
      options.inlineSources ||
      options.allowJs ||
      options.plugins?.length ||
      parsed.projectReferences?.length ||
      options.sourceMap !== true ||
      options.declaration !== true ||
      options.declarationMap !== true ||
      options.outDir !== resolve(state.checkout, member.root, 'dist') ||
      options.module !== ts.ModuleKind.NodeNext ||
      options.moduleResolution !== ts.ModuleResolutionKind.NodeNext
    )
      refuse('Unsupported effective fresh build compiler configuration');
  }
}

function compareRows(before, after) {
  if (before.length !== after.length) refuse('Fresh build file roster changed');
  for (let index = 0; index < before.length; index++) {
    for (const key of ['path', 'sha256', 'byteLength', 'permissions'])
      if (before[index][key] !== after[index][key])
        refuse('Fresh build file bytes or permissions changed');
  }
}

function inspectCheckout(state) {
  const tracked = new Set(state.inputs.files.map((row) => row.path));
  const parents = new Set();
  for (const name of tracked) {
    const parts = name.split('/');
    for (let length = 1; length < parts.length; length++)
      parents.add(parts.slice(0, length).join('/'));
  }
  const installations = new Set([
    'node_modules',
    ...state.graph.workspaces.map((row) => `${row.root}/node_modules`),
  ]);
  const outputs = new Set(state.graph.selected.map((row) => `${row.root}/dist`));
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const name = owned(state.checkout, path);
      if (name === '.git') {
        if (
          !entry.isDirectory() ||
          entry.isSymbolicLink() ||
          existsSync(resolve(path, 'objects/info/alternates')) ||
          existsSync(resolve(path, 'info/grafts'))
        )
          refuse('Fresh checkout Git storage has unsupported indirection');
        continue;
      }
      if (installations.has(name) || outputs.has(name)) continue;
      if (entry.isDirectory() && parents.has(name)) visit(path);
      else if (!entry.isFile() || !tracked.has(name))
        refuse('Unexpected fresh checkout input or directory');
    }
  };
  visit(state.checkout);
}

async function verifyHistory(state) {
  const path = resolve(state.checkout, 'law/policy/http-api-compositions.json');
  if (!existsSync(path)) refuse('Fresh reference build lacks its historical composition policy');
  const policy = JSON.parse(readFileSync(path, 'utf8'));
  const baseline = policy.compatibilityBaseline;
  if (
    baseline?.commit !== '03f9a6ae8938dfaa64a33870d60f9f8b448efe10' ||
    !Array.isArray(policy.operationIdCompatibility)
  )
    refuse('Unreviewed fresh build compatibility baseline');
  const expected = new Map([[baseline.path, baseline.sha256]]);
  for (const entry of policy.operationIdCompatibility) {
    if (expected.has(entry.source) && expected.get(entry.source) !== entry.baselineSourceSha256)
      refuse('Conflicting historical source digest');
    expected.set(entry.source, entry.baselineSourceSha256);
  }
  state.history = [];
  for (const [name, sha256] of expected) {
    if (
      typeof name !== 'string' ||
      isAbsolute(name) ||
      /[\\:\n\r]/u.test(name) ||
      !/^[a-f0-9]{64}$/u.test(sha256 ?? '')
    )
      refuse('Invalid historical source binding');
    owned(state.checkout, resolve(state.checkout, name));
    const body = await run(
      state,
      `history-${state.history.length}`,
      state.git,
      gitArgs(state.checkout, ['show', `${baseline.commit}:${name}`]),
    );
    if (digest(Buffer.from(body)) !== sha256) refuse('Fresh build historical Git object differs');
    state.history.push({ path: name, commit: baseline.commit, sha256 });
  }
}

async function verifyResolutions(state) {
  const outputRows = new Map(
    state.compilers.flatMap((entry) => entry.outputs.outputs).map((row) => [row.path, row]),
  );
  const code =
    'import {createRequire} from "node:module"; import {resolve} from "node:path"; const name=process.argv[1]; console.log(JSON.stringify({require:createRequire(resolve(process.cwd(),"package.json")).resolve(name),import:import.meta.resolve(name)}));';
  state.resolutions = [];
  for (const member of state.graph.selected) {
    if (member.root === 'reference/api') {
      const manifest = JSON.parse(
        readFileSync(resolve(state.checkout, member.root, 'package.json'), 'utf8'),
      );
      const entry = 'reference/api/dist/reference/api/src/main.js';
      if (
        manifest.scripts?.start !== 'node dist/reference/api/src/main.js' ||
        !outputRows.has(entry)
      )
        refuse('Reference startup entry bypasses the reviewed fresh output');
      state.resolutions.push({
        name: member.name,
        root: member.root,
        start: {
          command: manifest.scripts.start,
          path: entry,
          sha256: outputRows.get(entry).sha256,
        },
      });
      continue;
    }
    const text = await run(
      state,
      `resolution-${state.resolutions.length}`,
      state.node,
      ['--input-type=module', '--eval', code, member.name],
      { cwd: resolve(state.checkout, member.root) },
    );
    const result = JSON.parse(text);
    const row = { name: member.name, root: member.root };
    for (const kind of ['require', 'import']) {
      const path = realpathSync(kind === 'import' ? new URL(result[kind]) : result[kind]);
      const name = owned(state.checkout, path);
      if (!name.startsWith(`${member.root}/dist/`) || !outputRows.has(name))
        refuse('Actual package resolution bypasses its verified fresh output');
      row[kind] = { path: name, sha256: outputRows.get(name).sha256 };
    }
    state.resolutions.push(row);
  }
}

function stateFor(handle) {
  const state = handles.get(handle);
  if (!state || state.closed || state.refusal)
    refuse('Unknown, closed, or refused fresh build handle');
  return state;
}

function recheck(state) {
  try {
    for (const row of state.systemTools.values()) checkExecutableIdentity(row);
    const located = execFileSync('/usr/bin/xcrun', ['--find', 'git'], {
      env: childEnvironment(state),
      encoding: 'utf8',
    }).trim();
    if (located !== state.gitActual) refuse('System Git selection changed');
    const helpers = gitHelperFiles(state.gitExecutionPath, state.gitActual);
    compareRows(state.gitHelpers, helpers);
    for (let index = 0; index < helpers.length; index++)
      if (helpers[index].canonical !== state.gitHelpers[index].canonical)
        refuse('Git helper resolution changed');
    assertHttpBuildRosterUnchanged(
      state.inputs,
      snapshotHttpTrackedInputs(state.checkout, state.candidateCommit),
    );
    assertHttpBuildRosterUnchanged(state.dependencies, snapshotHttpDependencyBytes(state.checkout));
    verifyReviewedBuildSources(state);
    inspectCheckout(state);
    const tools = physicalFiles(state.sandbox, resolve(state.sandbox, 'toolchain'));
    if (
      digest(
        Buffer.from(
          tools.map((row) => `${row.path}\0${row.sha256}\0${row.permissions}\n`).join(''),
        ),
      ) !== state.toolchainFingerprint
    )
      refuse('Fresh build toolchain changed');
    for (const row of state.launcherClosure.helpers) {
      const actual = executableIdentity(row.path);
      for (const key of ['canonical', 'sha256', 'byteLength', 'permissions'])
        if (row[key] !== actual[key]) refuse('Build helper identity changed');
    }
    const actualLogs = readdirSync(state.buildDescriptor.logDirectory).sort();
    const admittedLogs = state.buildObservation.processes
      .map((row) => row.file.path.split('/').at(-1))
      .sort();
    if (
      actualLogs.length !== admittedLogs.length ||
      actualLogs.some((name, index) => name !== admittedLogs[index])
    )
      refuse('Build observer log population changed');
    for (const row of state.buildObservation.processes)
      compareRows([row.file], [byteRow(state.sandbox, resolve(state.sandbox, row.file.path))]);
    for (const entry of state.compilers) {
      // The handle privately owns the initial full compiler reconciliation.
      // All compiler/config/source/dependency/toolchain bytes were rechecked
      // above. Re-read every physical output instead of rebuilding TS Programs;
      // exact map/output bytes preserve the already verified relations.
      compareRows(
        entry.byteRows,
        physicalFiles(state.checkout, resolve(state.checkout, entry.plan.outputRoot)).sort((a, b) =>
          a.path.localeCompare(b.path),
        ),
      );
    }
  } catch (error) {
    state.refusal = String(error.code ?? 'HTTP_FRESH_BUILD_INVALID');
    throw error;
  }
}

/** Own the actual isolated install/build. No caller command or receipt is accepted. */
export async function prepareFreshHttpBuild(request) {
  const options = parseRequest(request);
  if (process.platform !== 'darwin' || process.arch !== 'arm64')
    refuse('Unreviewed build launcher platform');
  const sandbox = realpathSync(mkdtempSync(resolve(tmpdir(), 'stynx HTTP fraîs ')));
  const state = {
    ...options,
    sandbox,
    checkout: resolve(sandbox, 'checkout'),
    commands: [],
    closed: false,
    refusal: null,
    platform: process.platform,
    arch: process.arch,
    cleanupComplete: false,
  };
  for (const name of ['home', 'tmp', 'config', 'logs', 'store', 'template'])
    mkdirSync(resolve(sandbox, name));
  writeFileSync(resolve(sandbox, 'config/empty.npmrc'), '', { mode: 0o600 });
  try {
    await prepareToolchain(state);
    await run(
      state,
      'clone',
      state.git,
      [
        '-c',
        'core.autocrlf=false',
        '-c',
        'core.hooksPath=/dev/null',
        'clone',
        '--no-local',
        '--no-hardlinks',
        '--no-checkout',
        '--no-tags',
        '--no-recurse-submodules',
        `--template=${resolve(sandbox, 'template')}`,
        '--',
        state.sourceRepository,
        state.checkout,
      ],
      { cwd: sandbox },
    );
    await run(
      state,
      'detach',
      state.git,
      gitArgs(state.checkout, ['checkout', '--detach', '--force', state.candidateCommit]),
    );
    state.inputs = snapshotHttpTrackedInputs(state.checkout, state.candidateCommit);
    state.graph = deriveHttpWorkspaceGraph(state.checkout);
    verifyReviewedBuildSources(state);
    admitInstallConfiguration(state);
    inspectCheckout(state);
    await verifyHistory(state);
    noPriorOutputs(state);
    await run(
      state,
      'install',
      state.node,
      [state.pnpm, 'install', '--frozen-lockfile', '--ignore-scripts'],
      { credential: process.env.NODE_AUTH_TOKEN },
    );
    assertHttpBuildRosterUnchanged(
      state.inputs,
      snapshotHttpTrackedInputs(state.checkout, state.candidateCommit),
    );
    const selector = await run(state, 'selector', state.node, [
      state.pnpm,
      '--filter',
      '@stynx-nyx/reference-api...',
      'list',
      '--depth',
      '-1',
      '--json',
    ]);
    state.graph = reconcileHttpWorkspaceSelector(state.checkout, selector);
    state.dependencies = snapshotHttpDependencyBytes(state.checkout);
    inspectCheckout(state);
    for (const row of state.dependencies.files) {
      if (/(?:^|\/)node_modules\/\.bin\/(?:node|pnpm|rm)$/u.test(row.path))
        refuse('Private package shim overrides the reviewed build toolchain');
    }
    noPriorOutputs(state);
    verifyReviewedBuildSources(state);
    verifyPublishedCompiler(state);
    preflightCompilers(state);
    prepareBuildObserver(state);
    const outputRoots = state.graph.selected.map((row) => `${row.root}/dist`);
    let changedInput;
    const watcher = watch(state.checkout, { recursive: true }, (_event, filename) => {
      const name = filename?.split(sep).join('/');
      if (!name || !outputRoots.some((root) => name === root || name.startsWith(`${root}/`)))
        changedInput ??= name ?? 'unknown';
    });
    watcher.on('error', () => {
      changedInput ??= 'watcher-error';
    });
    try {
      await run(state, 'build', state.node, [
        '--require',
        state.observer,
        state.pnpm,
        '--filter',
        '@stynx-nyx/reference-api...',
        'build',
      ]);
      await new Promise((accept) => setTimeout(accept, 100));
      if (changedInput) refuse('Fresh build mutated an input or custody observer failed');
      reconcileBuildObservation(state);
    } finally {
      watcher.close();
    }
    assertHttpBuildRosterUnchanged(
      state.inputs,
      snapshotHttpTrackedInputs(state.checkout, state.candidateCommit),
    );
    assertHttpBuildRosterUnchanged(state.dependencies, snapshotHttpDependencyBytes(state.checkout));
    state.compilers = state.graph.selected.map((member) => {
      const before = physicalFiles(
        state.checkout,
        resolve(state.checkout, member.root, 'dist'),
      ).sort((a, b) => a.path.localeCompare(b.path));
      const plan = deriveHttpCompilerPlan({
        checkoutRoot: state.checkout,
        packageRoot: member.root,
        configPath: member.compilerConfig,
      });
      const outputs = reconcileHttpCompilerOutputs({ checkoutRoot: state.checkout, plan });
      const after = physicalFiles(state.checkout, resolve(state.checkout, plan.outputRoot)).sort(
        (a, b) => a.path.localeCompare(b.path),
      );
      compareRows(before, after);
      if (
        outputs.outputs.length !== after.length ||
        outputs.outputs.some((row, index) =>
          ['path', 'sha256', 'byteLength'].some((key) => row[key] !== after[index][key]),
        )
      )
        refuse('Compiler reconciliation differs from the physical output snapshot');
      for (const link of outputs.mapLinks) {
        const row = after.find((entry) => entry.path === link.path);
        if (!row || row.sha256 !== link.sha256)
          refuse('Compiler map relation differs from its physical output');
      }
      return {
        plan,
        outputs,
        byteRows: Object.freeze(after.map((row) => Object.freeze({ ...row }))),
      };
    });
    await verifyResolutions(state);
    state.environment = childEnvironment(state);
    const handle = Object.freeze(Object.create(null));
    handles.set(handle, state);
    recheck(state);
    return handle;
  } catch (error) {
    // Failed preparation grants no reusable handle. Preserve the complete
    // private sandbox: metadata and command-close receipts cannot prove full
    // raw custody or descendant absence, and must not authorize pruning it.
    failedBuilds.set(error, state);
    writeFileSync(
      resolve(sandbox, 'failure.json'),
      JSON.stringify(
        {
          candidateCommit: state.candidateCommit,
          rootId: state.rootId,
          commands: state.commands,
          refusalCode: String(error.code ?? 'HTTP_FRESH_BUILD_INVALID'),
          readinessPromoting: false,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    error.diagnosticDirectory = sandbox;
    throw error;
  }
}

export function snapshotFreshHttpBuild(handle) {
  const state = stateFor(handle);
  recheck(state);
  return structuredClone({
    schemaVersion: 1,
    candidateCommit: state.candidateCommit,
    tree: state.inputs.tree,
    rootId: state.rootId,
    platform: state.platform,
    arch: state.arch,
    checkoutRoot: state.checkout,
    toolchain: state.toolchain,
    environment: state.environment,
    commands: state.commands,
    graph: state.graph,
    inputs: state.inputs,
    dependencies: state.dependencies,
    compilers: state.compilers,
    history: state.history,
    resolutions: state.resolutions,
    launcherClosure: state.launcherClosure,
    systemTools: [...state.systemTools.values()],
    gitHelpers: state.gitHelpers,
    compilerPackage: state.compilerPackage,
    packageArchives: state.packageArchives,
    reviewedHelperAuthority,
    buildObservation: state.buildObservation,
    readinessPromoting: false,
    runtimeCustodyComplete: false,
  });
}

/** Declaration selection from the actual retained private build. This does not
 * allocate a fixture, admit a runtime, or accept caller-authored manifest data.
 */
export function snapshotFreshHttpQualificationCase(handle, caseId) {
  if (arguments.length !== 2) refuse('Qualification selection accepts one handle and case ID');
  const state = stateFor(handle);
  recheck(state);
  const declaration = loadHttpQualificationCase(state.checkout, caseId);
  if (declaration.binding.case.compositionId !== state.rootId)
    refuse('Qualification case belongs to a different actual composition');
  for (const row of declaration.files) {
    const tracked = state.inputs.files.find((file) => file.path === row.path);
    if (!tracked || tracked.sha256 !== row.sha256 || tracked.byteLength !== row.byteLength)
      refuse('Qualification member is outside the retained tracked build roster');
  }
  recheck(state);
  return structuredClone({
    ...declaration,
    candidateCommit: state.candidateCommit,
    tree: state.inputs.tree,
    actualPrivateBuildSelection: true,
    runtimeAdmission: false,
    performanceQualified: false,
    readinessPromoting: false,
  });
}

/** Select the complete declaration roster only through the retained actual
 * build. Cross-composition rows remain declarations, never mounted evidence.
 */
export function snapshotFreshHttpQualificationRoster(handle) {
  if (arguments.length !== 1) refuse('Qualification roster accepts one actual build handle');
  const state = stateFor(handle);
  recheck(state);
  const roster = loadHttpQualificationRoster(state.checkout);
  if (!roster.compositionOrder.includes(state.rootId))
    refuse('Qualification roster omits the actual build composition');
  for (const row of roster.files) {
    const tracked = state.inputs.files.find((file) => file.path === row.path);
    if (!tracked || tracked.sha256 !== row.sha256 || tracked.byteLength !== row.byteLength)
      refuse('Qualification roster member is outside the retained tracked build roster');
  }
  recheck(state);
  return structuredClone({
    ...roster,
    candidateCommit: state.candidateCommit,
    tree: state.inputs.tree,
    buildCompositionId: state.rootId,
    actualPrivateBuildSelection: true,
    runtimeAdmission: false,
    performanceQualified: false,
    readinessPromoting: false,
  });
}

function moduleKind(path, root) {
  const extension = extname(path);
  if (extension === '.json') return 'json';
  if (extension === '.mjs') return 'module';
  if (extension === '.cjs') return 'commonjs';
  let parent = dirname(path);
  while (true) {
    owned(root, parent);
    const manifest = resolve(parent, 'package.json');
    if (existsSync(manifest)) {
      const type = JSON.parse(readFileSync(manifest, 'utf8')).type;
      if (type !== undefined && !['module', 'commonjs'].includes(type))
        refuse('Unsupported actual package module type');
      return type === 'module' ? 'module' : 'commonjs';
    }
    if (parent === root) return 'commonjs';
    parent = dirname(parent);
  }
}

export function workerModuleReceiptFromFreshBuild(handle) {
  const state = stateFor(handle);
  try {
    recheck(state);
    const files = new Map();
    const add = (row) => {
      if (!['.js', '.mjs', '.cjs', '.json'].includes(extname(row.path))) return;
      const path = realpathSync(resolve(state.checkout, row.path));
      const url = pathToFileURL(path).href;
      const value = { url, sha256: row.sha256, moduleKind: moduleKind(path, state.checkout) };
      const previous = files.get(url);
      if (previous && previous.sha256 !== value.sha256)
        refuse('Conflicting fresh build module identity');
      files.set(url, value);
    };
    for (const row of state.dependencies.files) if (row.kind === 'file') add(row);
    for (const entry of state.compilers) for (const row of entry.outputs.outputs) add(row);
    return {
      schemaVersion: 1,
      nodeVersion: '24.20.0',
      nodeSha256: digest(readFileSync(state.node)),
      files: [...files.values()],
      readinessPromoting: false,
      runtimeCustodyComplete: false,
    };
  } catch (error) {
    state.refusal = String(error.code ?? 'HTTP_FRESH_BUILD_INVALID');
    throw error;
  }
}

// Deliberately closed control-source population. These are source observers,
// never compiler output. Independent acceptance must review these exact bytes
// before a candidate using this diagnostic is admitted to a release task.
const runtimeControlClosure = new Map([
  ['scripts/lib/http-composition-roster.mjs', null],
  [
    'scripts/lib/http-runtime-worker.mjs',
    '64be2695835677d86a8f0cf825e150feba706ad7c0871f8da94106d55e8717cd',
  ],
  [
    'scripts/lib/http-module-custody.mjs',
    '2ca9a044eb2395e2daca2191d6c44387362e55580481de761d05a3e57c0b8948',
  ],
  [
    'scripts/lib/http-runtime-census.mjs',
    '19b1823a2ac6953ed4bb73584e12d2414f88f27b59416b6b63fbf0502418c0d7',
  ],
  [
    'scripts/lib/http-runtime-bindings.mjs',
    '414634bc35fd61cef89bca9cf960643e559b1a1eb329e0216e8eb614d8c1e253',
  ],
]);

function runtimeControls(state) {
  return [...runtimeControlClosure].map(([path, sha256]) => {
    const tracked = state.inputs.files.find((row) => row.path === path);
    const row = byteRow(state.checkout, resolve(state.checkout, path));
    if (!tracked || tracked.sha256 !== sha256 || row.sha256 !== sha256)
      refuse('Runtime observer is missing, changed, or outside the closed source population');
    compareRows([tracked], [row]);
    return { ...row, blob: tracked.blob, classification: 'observer-source' };
  });
}

function supervisorProtocolControl(state) {
  const path = 'scripts/lib/http-runtime-protocol.mjs';
  const sha256 = '27d4ebf8a62a6faa0181f647f790bfe224c8b8a8309184b7658b4d79149e57d3';
  const tracked = state.inputs.files.find((row) => row.path === path);
  const fresh = byteRow(state.checkout, resolve(state.checkout, path));
  const supervisorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const actual = byteRow(supervisorRoot, resolve(supervisorRoot, path));
  if (!tracked || tracked.sha256 !== sha256 || fresh.sha256 !== sha256 || actual.sha256 !== sha256)
    refuse('Supervisor protocol component differs from its closed reviewed source');
  compareRows([tracked], [fresh]);
  compareRows([fresh], [actual]);
  return { ...fresh, blob: tracked.blob, classification: 'supervisor-source' };
}

function referenceBootstrapBinding(state) {
  const composition = httpComposition(state.rootId);
  const sourcePath = composition.source;
  const outputPath = composition.emitted;
  const compiler = state.compilers.find((entry) => entry.plan.packageRoot === 'reference/api');
  const planned = compiler?.plan.expectedOutputs.find((row) => row.path === outputPath);
  const map = compiler?.outputs.mapLinks.find((row) => row.emittedPath === outputPath);
  if (
    !planned ||
    planned.source !== sourcePath ||
    map?.sources.length !== 1 ||
    map.sources[0].path !== sourcePath
  )
    refuse('Reference bootstrap is not bound to the private compiler plan');
  const source = state.inputs.files.find((row) => row.path === sourcePath);
  const emitted = compiler.byteRows.find((row) => row.path === outputPath);
  const mapRow = compiler.byteRows.find((row) => row.path === `${outputPath}.map`);
  if (
    !source ||
    !emitted ||
    !mapRow ||
    mapRow.sha256 !== map.sha256 ||
    source.sha256 !== map.sources[0].sha256
  )
    refuse('Reference bootstrap source/output/map relation is incomplete');
  return structuredClone({ source, emitted, map: mapRow });
}

// Finite POSIX Node24.20 startup rule, corroborated independently against the
// actual child's public resolve.paths. Never borrow supervisor ambient globals.
function runtimeGlobalSearchPaths(state, job, environment) {
  if (
    !['darwin', 'linux'].includes(job.platform) ||
    job.platform !== process.platform ||
    job.receipt.nodeVersion !== '24.20.0' ||
    state.node !== job.nodePath ||
    realpathSync(state.node) !== state.node ||
    digest(readFileSync(state.node)) !== job.nodeSha256 ||
    typeof environment.HOME !== 'string' ||
    !environment.HOME ||
    !isAbsolute(environment.HOME) ||
    (environment.NODE_PATH !== undefined && environment.NODE_PATH !== '') ||
    environment.NODE_OPTIONS
  )
    refuse('Runtime protocol has unsupported native global search startup');
  return [
    resolve(environment.HOME, '.node_modules'),
    resolve(environment.HOME, '.node_libraries'),
    resolve(job.nodePath, '..', '..', 'lib', 'node'),
  ];
}

// Resolution origins are tracked manifests, not evaluated modules. Only the
// reviewed mode-specific createRequire caller relations authorize them.
function runtimeResolutionAnchors(state, controls, nonce, mode) {
  if (
    !['bootstrap-module-only', 'reference-owned-loopback', 'http-endpoint-qualification'].includes(
      mode,
    )
  )
    refuse('Unsupported runtime resolution anchor mode');
  const rules = [
    [
      'reference/api/package.json',
      '04da6430b3b10b7c2e39b3cff45214fd199fa30ced6087e2ce3cd0b53bdf803c',
      '57a59bdfe390a0481368cd3bb3d2ac3975a16d9e',
      2112,
      'scripts/lib/http-module-custody.mjs',
      "createRequire(new URL('../../reference/api/package.json', import.meta.url))('reflect-metadata')",
      ['reflect-metadata'],
    ],
    [
      'packages/flow/package.json',
      '7a9bc69161ab7e2a2c2f1a61e6dd94ee558f1c76b25c3aa48fd564f0e633bbb1',
      'db4b602b7b72ecc2c1ac4ba549b2f28793c74da5',
      1827,
      'scripts/lib/http-runtime-census.mjs',
      "createRequire(new URL('../../packages/flow/package.json', import.meta.url))",
      [
        '@nestjs/core',
        '@nestjs/core/router/router-explorer',
        '@nestjs/core/adapters/http-adapter',
        '@nestjs/common',
        '@nestjs/common/constants',
        '@stynx-nyx/auth',
        '@nestjs/platform-express',
      ],
    ],
  ];
  if (['reference-owned-loopback', 'http-endpoint-qualification'].includes(mode))
    rules.push([
      'packages/flow/package.json',
      '7a9bc69161ab7e2a2c2f1a61e6dd94ee558f1c76b25c3aa48fd564f0e633bbb1',
      'db4b602b7b72ecc2c1ac4ba549b2f28793c74da5',
      1827,
      'scripts/lib/http-reference-nest-guard.mjs',
      "createRequire(new URL('../../packages/flow/package.json', import.meta.url))",
      [
        '@nestjs/core/nest-factory',
        '@nestjs/core/nest-application',
        '@nestjs/platform-express/adapters/express-adapter',
        '@nestjs/core/package.json',
        '@nestjs/platform-express/package.json',
      ],
    ]);
  const physical = (path) => {
    const tracked = state.inputs.files.find((row) => row.path === path);
    const actualPath = resolve(state.checkout, path),
      stat = lstatSync(actualPath);
    const bytes = readFileSync(actualPath);
    if (
      !tracked ||
      tracked.mode !== '100644' ||
      !stat.isFile() ||
      realpathSync(actualPath) !== actualPath ||
      digest(bytes) !== tracked.sha256 ||
      createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !==
        tracked.blob
    )
      refuse('Runtime resolution anchor source identity differs');
    return {
      path,
      url: pathToFileURL(actualPath).href,
      sha256: digest(bytes),
      byteLength: bytes.length,
      permissions: stat.mode & 0o7777,
      device: stat.dev,
      inode: stat.ino,
      blob: tracked.blob,
      mode: tracked.mode,
    };
  };
  const anchors = rules.map(([path, sha256, blob, byteLength, callerPath, literal, requests]) => {
    const manifest = physical(path),
      caller = physical(callerPath);
    const control = controls.find((row) => row.path === callerPath);
    const text = readFileSync(resolve(state.checkout, callerPath), 'utf8');
    const start = text.indexOf(literal);
    if (
      manifest.sha256 !== sha256 ||
      manifest.blob !== blob ||
      manifest.byteLength !== byteLength ||
      !control ||
      caller.sha256 !== control.sha256 ||
      caller.blob !== control.blob ||
      caller.byteLength !== control.byteLength ||
      caller.permissions !== control.permissions ||
      start < 0 ||
      text.indexOf(literal, start + 1) !== -1
    )
      refuse('Runtime resolution anchor reviewed relation differs');
    return {
      classification: 'NON_EVALUATED_RESOLUTION_ANCHOR',
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      nonce,
      manifest,
      caller: {
        ...caller,
        callsite: {
          kind: 'DECLARED_REVIEWED_CALLSITE',
          start,
          end: start + literal.length,
          literal,
        },
      },
      requests,
      conditions: ['require', 'node', 'node-addons', 'module-sync'],
    };
  });
  if (
    ['reference-owned-loopback', 'http-endpoint-qualification'].includes(mode) &&
    !isDeepStrictEqual(anchors[1].manifest, anchors[2].manifest)
  )
    refuse('Shared physical flow resolution anchor differs between caller relations');
  return anchors;
}

// Pure protocol expectations are derived here only after the private live-handle
// checks. They describe actual job/launch facts, never grant custody to JSON.
function runtimeProtocolBindings(state, job, descriptorBody, launchEnvironment) {
  const rows = new Map();
  const add = (row) => {
    const url = pathToFileURL(resolve(state.checkout, row.path)).href;
    const previous = rows.get(url);
    if (previous && (previous.sha256 !== row.sha256 || previous.byteLength !== row.byteLength))
      refuse('Runtime protocol source population is ambiguous');
    rows.set(url, row);
  };
  for (const row of state.dependencies.files) if (row.kind === 'file') add(row);
  for (const compiler of state.compilers) for (const row of compiler.outputs.outputs) add(row);
  for (const row of job.controls) add(row);
  const roster = job.receipt.files.map((member) => {
    const row = rows.get(member.url);
    if (
      !row ||
      row.sha256 !== member.sha256 ||
      !Number.isSafeInteger(row.byteLength) ||
      row.byteLength < 0
    )
      refuse('Runtime protocol member has no private fresh byte binding');
    return {
      url: member.url,
      sha256: member.sha256,
      moduleKind: member.moduleKind,
      byteLength: row.byteLength,
    };
  });
  const provenance = (path, sha256, kind) => {
    const bytes = readFileSync(path),
      stat = lstatSync(path),
      url = pathToFileURL(path).href;
    const member = roster.find((entry) => entry.url === url);
    if (
      !stat.isFile() ||
      realpathSync(path) !== path ||
      digest(bytes) !== sha256 ||
      !member ||
      member.sha256 !== sha256 ||
      member.moduleKind !== kind ||
      member.byteLength !== bytes.length
    )
      refuse('Runtime protocol provenance differs from the private fresh member');
    return {
      path,
      url,
      sha256,
      permissions: stat.mode & 0o7777,
      byteLength: bytes.length,
      device: stat.dev,
      inode: stat.ino,
    };
  };
  const parentHash = '86968141beeaa93daea62a4ec4e1f36bd31f88eb5f0b3a0d2b2d28aefe5406c2';
  const matches = roster.filter((member) => member.sha256 === parentHash);
  if (matches.length !== 1) refuse('Runtime protocol Nest parent origin is ambiguous');
  const parentPath = fileURLToPath(matches[0].url),
    packageRoot = dirname(parentPath);
  if (
    realpathSync(
      createRequire(resolve(state.checkout, 'packages/flow/package.json')).resolve(
        '@nestjs/core/nest-application.js',
      ),
    ) !== parentPath ||
    basename(parentPath) !== 'nest-application.js' ||
    basename(packageRoot) !== 'core' ||
    basename(dirname(packageRoot)) !== '@nestjs'
  )
    refuse('Runtime protocol Nest origin is not the actual owned installation');
  const parent = provenance(parentPath, parentHash, 'commonjs');
  const helper = provenance(
    resolve(packageRoot, 'helpers/optional-require.js'),
    'c8a109dab1b2461e866fe04b8be5988ccc199a2239c730abc05fc28c0f85d7f2',
    'commonjs',
  );
  const manifest = provenance(
    resolve(packageRoot, 'package.json'),
    '8335e997f7dbe8e797298caa94291dead8503bbf34e546d591581109284ca429',
    'json',
  );
  const declared = JSON.parse(readFileSync(manifest.path, 'utf8'));
  if (declared.name !== '@nestjs/core' || declared.version !== '11.2.3')
    refuse('Runtime protocol Nest declaration differs');
  const localPaths = [];
  for (let path = packageRoot; ; path = dirname(path)) {
    if (basename(path) !== 'node_modules') localPaths.push(resolve(path, 'node_modules'));
    if (dirname(path) === path) break;
  }
  const globalFallbackPaths = runtimeGlobalSearchPaths(state, job, launchEnvironment);
  const scopes = [...localPaths, ...globalFallbackPaths];
  if (new Set(scopes).size !== scopes.length)
    refuse('Runtime protocol search population is ambiguous');
  const absentPackage = (scope, packageName) => {
    const packageRoot = resolve(scope, packageName),
      root = parse(packageRoot).root;
    const components = packageRoot.slice(root.length).split(sep),
      chain = [];
    let path = root;
    for (let i = -1; i < components.length; i++) {
      if (i >= 0) path = resolve(path, components[i]);
      let stat;
      try {
        stat = lstatSync(path);
      } catch (error) {
        if (error.code !== 'ENOENT' || chain.length === 0)
          refuse('Runtime protocol absence is not genuine ENOENT');
        return {
          scope,
          packageRoot,
          outcome: 'ENOENT',
          firstMissingPath: path,
          missingComponentChain: components.slice(i),
          nearestExistingAncestor: chain.at(-1),
          chain,
        };
      }
      // A present/partial/dangling root is ineligible, not a negative witness.
      if (path === packageRoot) return null;
      const link = stat.isSymbolicLink();
      if (!link && !stat.isDirectory())
        refuse('Runtime protocol absence ancestor is not a directory');
      let canonicalPath,
        linkTarget = null;
      try {
        canonicalPath = realpathSync(path);
        if (link) {
          linkTarget = readlinkSync(path);
          if (!statSync(path).isDirectory())
            refuse('Runtime protocol absence link is not a directory');
        }
      } catch {
        refuse('Runtime protocol absence ancestor is unresolved');
      }
      chain.push({
        path,
        canonicalPath,
        kind: link ? 'symbolic-link' : 'directory',
        permissions: stat.mode & 0o7777,
        device: stat.dev,
        inode: stat.ino,
        linkTarget,
      });
    }
    refuse('Runtime protocol absence was not established');
  };
  const parentText = readFileSync(parent.path, 'utf8');
  const optionalProbes = [];
  for (const rule of [
    {
      ruleId: 'NEST1123_OPTIONAL_WEBSOCKETS',
      specifier: '@nestjs/websockets/socket-module',
      packageName: '@nestjs/websockets',
      start: 1159,
      end: 1208,
      binding: 'SocketModule',
    },
    {
      ruleId: 'NEST1123_OPTIONAL_MICROSERVICES',
      specifier: '@nestjs/microservices/microservices-module',
      packageName: '@nestjs/microservices',
      start: 1329,
      end: 1388,
      binding: 'MicroservicesModule',
    },
  ]) {
    const callback = `() => require('${rule.specifier}')`;
    const statement = `const { ${rule.binding} } = (0, optional_require_1.optionalRequire)('${rule.specifier}', ${callback});`;
    if (
      parentText.slice(rule.start, rule.end) !== callback ||
      parentText.split(callback).length !== 2 ||
      parentText.split(statement).length !== 2 ||
      declared.peerDependenciesMeta?.[rule.packageName]?.optional !== true ||
      declared.peerDependencies?.[rule.packageName] !== '^11.0.0'
    )
      refuse('Runtime protocol optional declaration differs');
    const absence = scopes.map((scope) => absentPackage(scope, rule.packageName));
    if (absence.some((entry) => entry === null)) continue;
    optionalProbes.push({
      ruleId: rule.ruleId,
      declaredCallsite: {
        kind: 'DECLARED_UNIQUE_LITERAL_CALLBACK',
        start: rule.start,
        end: rule.end,
        callbackSha256: digest(callback),
        statementSha256: digest(statement),
      },
      provenance: { parent, helper, manifest },
      search: { scopes, localPaths, globalFallbackPaths },
      absence,
    });
  }
  const ts = createRequire(resolve(state.checkout, 'package.json'))('typescript');
  const declaration = (row, kind) => {
    const bytes = readFileSync(resolve(state.checkout, row.path));
    if (digest(bytes) !== row.sha256) refuse('Runtime protocol bootstrap bytes changed');
    const source = ts.createSourceFile(
      row.path,
      bytes.toString('utf8'),
      ts.ScriptTarget.Latest,
      true,
      kind,
    );
    const named = source.statements.filter(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'createReferenceApplication',
    );
    if (source.parseDiagnostics.length || named.length !== 1)
      refuse('Runtime protocol bootstrap declaration is ambiguous');
    return { start: named[0].getStart(source), end: named[0].end };
  };
  const moduleURL = pathToFileURL(resolve(state.checkout, job.bootstrap.emitted.path)).href;
  const observation = {
    schemaVersion: 1,
    // This is the initial, actually observed factory-export witness before the
    // real factory is invoked, also in the disjoint owned-loopback worker.
    scope: 'bootstrap-module-only',
    compositionId: state.rootId,
    bootstrap: structuredClone(job.bootstrap),
    namedExport: 'createReferenceApplication',
    evaluatedModuleURL: moduleURL,
    actualNamedExportObserved: true,
    sourceDeclaration: declaration(job.bootstrap.source, ts.ScriptKind.TS),
    emittedDeclaration: declaration(job.bootstrap.emitted, ts.ScriptKind.JS),
    factoryInvoked: false,
    constructorProvenance: 'UNVERIFIED',
    sourceMapFunctionCorrespondence: 'UNVERIFIED',
    applicationRoot: 'UNVERIFIED',
    middleware: 'UNVERIFIED',
    reachability: 'UNVERIFIED',
    blockedOn: [
      'privately-owned-admitted-runtime-fixture',
      'complete-constructor-registry',
      'complete-middleware-observation',
    ],
    runtimeCustodyComplete: false,
    readinessPromoting: false,
  };
  return {
    tree: state.inputs.tree,
    parentPid: process.pid,
    descriptorSha256: digest(descriptorBody),
    nodePath: job.nodePath,
    nodeSha256: job.nodeSha256,
    cwd: state.checkout,
    environment: Object.fromEntries(
      Object.keys(launchEnvironment)
        .sort()
        .map((name) => [name, digest(launchEnvironment[name])]),
    ),
    roster,
    resolutionAnchors: structuredClone(job.resolutionAnchors),
    observation,
    trustedBootstrap: job.controls.filter((row) =>
      [
        'scripts/lib/http-composition-roster.mjs',
        'scripts/lib/http-runtime-worker.mjs',
        'scripts/lib/http-module-custody.mjs',
      ].includes(row.path),
    ),
    optionalProbes,
    requiredEvaluationURLs: [
      'scripts/lib/http-runtime-census.mjs',
      'scripts/lib/http-runtime-bindings.mjs',
      job.bootstrap.emitted.path,
    ].map((path) => pathToFileURL(resolve(state.checkout, path)).href),
  };
}

// This is a source-bound admission floor, never caller data or a Boolean waiver.
// Pending independent bindings refuse before any resource is created. Rebinding
// requires acceptance of the exact controller/native/image/observer bytes.
const referenceFactoryAdmission = Object.freeze({
  nativeDependencyClosure: null,
  officialRedisImageOrigin: null,
  controllerInspector: null,
  transportInspector: null,
  registryInspector: null,
  scopedLifecycleInspector: null,
});
const privacyObjectStoreAdmission = Object.freeze({
  officialObjectStoreImageOrigin: null,
  supervisorObjectStoreSdk: null,
  applicationObjectStoreTransport: null,
});
const referenceFixtureSourceSha256 =
  'e713ef211e22459b8e866b80ce1ee3bef71da0f2dafdd2d18a1d4ab186c4cdf6';

function requireReferenceFactoryAdmission(state) {
  if (!isHttpComposition(state.rootId)) refuse('Unsupported real reference composition');
  for (const [name, sha256] of Object.entries(referenceFactoryAdmission))
    if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(sha256))
      refuse(`Real reference admission is not independently bound: ${name}`);
  if (state.rootId === 'privacy')
    for (const [name, sha256] of Object.entries(privacyObjectStoreAdmission))
      if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(sha256))
        refuse(`Privacy object-store admission is not independently bound: ${name}`);
  const path = 'scripts/lib/http-reference-fixture.mjs';
  const supervisorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  for (const root of [state.checkout, supervisorRoot])
    if (byteRow(root, resolve(root, path)).sha256 !== referenceFixtureSourceSha256)
      refuse('Owned reference controller differs from its accepted exact source');
  // The full connected control graph must be accepted before the earlier
  // prepare step can allocate any resource, not merely before child spawn.
  referenceRuntimeControls(state);
  referenceSupervisorControls(state);
}

/** Fixed real fixture producer tied only to the actual live private build. */
export async function prepareFreshHttpReferenceFixture(handle) {
  if (arguments.length !== 1) refuse('Reference fixture accepts one actual private build handle');
  const state = stateFor(handle);
  if (
    state.runtimeActive ||
    state.fixturePreparing ||
    state.fixtureChecking ||
    state.referenceFixture
  )
    refuse('A reference fixture or runtime already owns this build');
  state.fixturePreparing = true;
  let fixture;
  try {
    recheck(state);
    requireReferenceFactoryAdmission(state);
    const nonce = randomUUID();
    const registry = deriveReferenceRegistryPlan({
      checkoutRoot: state.checkout,
      inputs: state.inputs,
      compilers: state.compilers,
    });
    // Allocation cannot occur above the independent source admission floor.
    const createFixture =
      state.rootId === 'privacy' ? createOwnedPrivacyReferenceFixture : createOwnedReferenceFixture;
    fixture = await createFixture({
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      nonce,
    });
    state.referenceFixture = {
      handle: fixture,
      nonce,
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      ready: false,
    };
    const environment = await ownedReferenceFixtureEnvironment(fixture);
    const observed = await observeOwnedReferenceFixture(fixture);
    if (
      observed.identity.candidateCommit !== state.candidateCommit ||
      observed.identity.tree !== state.inputs.tree ||
      observed.identity.nonce !== nonce
    )
      refuse('Actual fixture identity differs from the live build');
    const binding = {
      handle: fixture,
      nonce,
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      observed,
      environment,
      registry,
      environmentDigests: Object.fromEntries(
        Object.entries(environment).map(([name, value]) => [name, digest(value)]),
      ),
      sourceSha256: referenceFixtureSourceSha256,
      admission: referenceFactoryAdmission,
      ready: true,
    };
    state.referenceFixture = binding;
    recheck(state);
    return structuredClone({
      schemaVersion: 1,
      scope: 'reference-private-build-fixture-binding',
      candidateCommit: binding.candidateCommit,
      tree: binding.tree,
      nonce,
      resources: binding.observed,
      environment: binding.environmentDigests,
      controllerSourceSha256: binding.sourceSha256,
      fixtureStoredInActualParentBuild: true,
      parentCorroborationRequired: true,
      workerLaunched: false,
      runtimeCustodyComplete: false,
      performanceQualified: false,
      readinessPromoting: false,
    });
  } catch (error) {
    if (fixture) {
      await closeOwnedReferenceFixture(fixture);
      state.referenceFixture = undefined;
    }
    throw error;
  } finally {
    state.fixturePreparing = false;
  }
}

/** Re-observe the same retained resource handles; a receipt cannot replace them. */
export async function observeFreshHttpReferenceFixture(handle) {
  if (arguments.length !== 1) refuse('Reference fixture observation accepts one private handle');
  const state = stateFor(handle);
  const binding = state.referenceFixture;
  if (
    !binding ||
    !binding.ready ||
    state.fixturePreparing ||
    state.fixtureChecking ||
    state.runtimeActive ||
    binding.candidateCommit !== state.candidateCommit ||
    binding.tree !== state.inputs.tree ||
    binding.sourceSha256 !== referenceFixtureSourceSha256 ||
    binding.admission !== referenceFactoryAdmission
  )
    refuse('Reference fixture is absent, stale, or not privately owned');
  state.fixtureChecking = true;
  try {
    recheck(state);
    requireReferenceFactoryAdmission(state);
    const observed = await observeOwnedReferenceFixture(binding.handle);
    const environment = await ownedReferenceFixtureEnvironment(binding.handle);
    if (
      !isDeepStrictEqual(observed, binding.observed) ||
      !isDeepStrictEqual(environment, binding.environment) ||
      !isDeepStrictEqual(
        binding.registry,
        deriveReferenceRegistryPlan({
          checkoutRoot: state.checkout,
          inputs: state.inputs,
          compilers: state.compilers,
        }),
      )
    )
      refuse('Reference fixture or source/compiler/environment binding changed');
    return structuredClone({
      schemaVersion: 1,
      scope: 'reference-private-build-fixture-binding',
      candidateCommit: binding.candidateCommit,
      tree: binding.tree,
      nonce: binding.nonce,
      resources: observed,
      environment: binding.environmentDigests,
      controllerSourceSha256: binding.sourceSha256,
      fixtureStoredInActualParentBuild: true,
      parentCorroborationRequired: true,
      workerLaunched: false,
      runtimeCustodyComplete: false,
      performanceQualified: false,
      readinessPromoting: false,
    });
  } finally {
    state.fixtureChecking = false;
  }
}

/**
 * Launch the only currently supported, secret-free runtime diagnostic.
 * It observes the real bootstrap module export without invoking AppModule.
 * There is no caller configuration, target URL, factory, receipt or fixture.
 */
export async function observeFreshHttpReferenceBootstrap(handle) {
  if (arguments.length !== 1) refuse('Runtime diagnostic accepts exactly one private handle');
  const state = stateFor(handle);
  if (state.runtimeActive || state.fixturePreparing || state.fixtureChecking)
    refuse('A runtime or fixture operation already owns this build');
  state.runtimeActive = true;
  let child;
  let deadline;
  const terminate = () => {
    if (!child?.pid) return;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* owned group exited */
    }
  };
  try {
    recheck(state);
    if (!isHttpComposition(state.rootId)) refuse('Unsupported runtime composition');
    const controls = runtimeControls(state);
    const supervisorControls = [supervisorProtocolControl(state)];
    const receipt = workerModuleReceiptFromFreshBuild(handle);
    const urls = new Set(receipt.files.map((row) => row.url));
    for (const row of controls) {
      const url = pathToFileURL(resolve(state.checkout, row.path)).href;
      if (urls.has(url)) refuse('Runtime source observer collides with a build module');
      urls.add(url);
      receipt.files.push({
        url,
        sha256: row.sha256,
        moduleKind: 'module',
        classification: 'observer-source',
      });
    }
    const environment = runtimeEnvironment(state);
    const nonce = randomUUID();
    const directory = resolve(state.sandbox, 'runtime-jobs');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const descriptorPath = resolve(directory, `${nonce}.json`);
    const entry = resolve(state.checkout, 'scripts/lib/http-runtime-worker.mjs');
    const job = {
      schemaVersion: 1,
      mode: 'bootstrap-module-only',
      compositionId: state.rootId,
      nonce,
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      parentPid: process.pid,
      checkoutRoot: state.checkout,
      descriptorPath,
      nodePath: realpathSync(state.node),
      nodeSha256: digest(readFileSync(state.node)),
      platform: state.platform,
      arch: state.arch,
      environment: Object.fromEntries(
        Object.entries(environment).map(([name, value]) => [name, digest(value)]),
      ),
      controls,
      resolutionAnchors: runtimeResolutionAnchors(state, controls, nonce, 'bootstrap-module-only'),
      receipt,
      bootstrap: referenceBootstrapBinding(state),
    };
    const body = Buffer.from(JSON.stringify(job));
    if (body.length > 64 * 1024 * 1024) refuse('Runtime job exceeds supported bound');
    writeFileSync(descriptorPath, body, { mode: 0o600, flag: 'wx' });
    environment.STYNX_HTTP_JOB_SHA256 = digest(body);
    const protocolBindings = runtimeProtocolBindings(state, job, body, environment);
    const stdout = [];
    const stderr = [];
    let logLength = 0;
    let failure;
    let terminal;
    const startedAt = new Date().toISOString();
    child = spawn(state.node, [entry, descriptorPath], {
      cwd: state.checkout,
      env: environment,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      serialization: 'json',
    });
    if (!child.pid) {
      await new Promise((accept) => child.once('error', accept));
      refuse('Runtime worker process could not start');
    }
    const protocol = createHttpRuntimeProtocol({
      nonce,
      candidateCommit: state.candidateCommit,
      pid: child.pid,
      mode: job.mode,
      bindings: protocolBindings,
    });
    const reject = () => {
      failure ??= 'HTTP_RUNTIME_WORKER_INVALID';
      terminate();
    };
    const collect = (chunks, chunk) => {
      logLength += chunk.length;
      if (logLength > 64 * 1024 * 1024) reject();
      else chunks.push(chunk);
    };
    child.stdout.on('data', (chunk) => collect(stdout, chunk));
    child.stderr.on('data', (chunk) => collect(stderr, chunk));
    child.on('message', (frame) => {
      if (!protocol.receive(frame)) reject();
    });
    deadline = setTimeout(reject, 180000);
    const exited = await new Promise((accept) => {
      child.once('error', reject);
      child.once('close', (code, signal) => accept({ code, signal }));
    });
    clearTimeout(deadline);
    const artifacts = [];
    for (const [name, chunks] of [
      ['stdout', stdout],
      ['stderr', stderr],
    ]) {
      const path = resolve(directory, `${nonce}.${name}.log`);
      writeFileSync(path, Buffer.concat(chunks), { mode: 0o600, flag: 'wx' });
      artifacts.push(byteRow(state.sandbox, path));
    }
    try {
      terminal = protocol.finish(exited);
    } catch {
      failure ??= 'HTTP_RUNTIME_WORKER_INVALID';
    }
    const parsedFramesPath = resolve(directory, `${nonce}.parsed-ipc.json`);
    const capture = protocol.captureArtifact(failure ?? null);
    if (capture.overflowed) failure ??= 'HTTP_RUNTIME_CAPTURE_INVALID';
    writeFileSync(parsedFramesPath, capture.body, { mode: 0o600, flag: 'wx' });
    artifacts.push(byteRow(state.sandbox, parsedFramesPath));
    if (failure)
      refuse('Runtime bootstrap observation did not complete its closed diagnostic protocol');
    recheck(state);
    compareRows(controls, runtimeControls(state));
    compareRows(supervisorControls, [supervisorProtocolControl(state)]);
    compareRows(
      [byteRow(state.sandbox, descriptorPath)],
      [
        {
          path: owned(state.sandbox, descriptorPath),
          sha256: digest(body),
          byteLength: body.length,
          permissions: 0o600,
        },
      ],
    );
    if (
      !isDeepStrictEqual(protocolBindings, runtimeProtocolBindings(state, job, body, environment))
    )
      refuse('Runtime protocol parent bindings changed before admission');
    if (
      !isDeepStrictEqual(
        job.resolutionAnchors,
        runtimeResolutionAnchors(state, controls, nonce, 'bootstrap-module-only'),
      )
    )
      refuse('Runtime resolution anchors changed before final admission');
    // The parser has first closed these rows against the private roster. Recheck
    // their actual raw-path relationship without discarding valid native aliases.
    for (const row of [
      ...terminal.modules.resolutions.filter((entry) => entry.builtin === false),
      ...terminal.modules.evaluations,
    ]) {
      let canonicalURL;
      try {
        canonicalURL = pathToFileURL(realpathSync(fileURLToPath(row.url))).href;
      } catch {
        refuse('Runtime protocol raw module path is unresolved');
      }
      if (canonicalURL !== row.canonicalURL)
        refuse('Runtime protocol raw module path differs from its private canonical member');
    }
    const report = {
      schemaVersion: 1,
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      scope: job.mode,
      compositionId: state.rootId,
      nonce,
      child: {
        pid: child.pid,
        nodePath: job.nodePath,
        nodeSha256: job.nodeSha256,
        argv: [entry, descriptorPath],
        cwd: state.checkout,
        startedAt,
        finishedAt: new Date().toISOString(),
        ...exited,
      },
      environment: job.environment,
      controls,
      supervisorControls,
      descriptor: byteRow(state.sandbox, descriptorPath),
      artifacts,
      result: terminal,
      runtimeCustodyComplete: false,
      readinessPromoting: false,
      runtimeSecretsConsumed: false,
      fixtureAdmission: 'NOT_IMPLEMENTED',
      processSandbox: false,
      observerIndependentAcceptance: 'REQUIRED',
    };
    const reportPath = resolve(directory, `${nonce}.observation.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
    return structuredClone({ ...report, reportArtifact: byteRow(state.sandbox, reportPath) });
  } catch (error) {
    terminate();
    state.refusal = String(error.code ?? 'HTTP_RUNTIME_WORKER_INVALID');
    throw error;
  } finally {
    clearTimeout(deadline);
    state.runtimeActive = false;
  }
}

// Successor controls are deliberately unbound until the complete connected
// worker/parent source has independent acceptance. Old module-only pins above
// remain historical; neither caller data nor a partial component receipt can
// enable this disjoint resource-consuming mode.
const referenceRuntimeControlClosure = new Map([
  ['scripts/lib/http-composition-roster.mjs', null],
  ['scripts/lib/http-runtime-worker.mjs', null],
  ['scripts/lib/http-module-custody.mjs', null],
  ['scripts/lib/http-runtime-census.mjs', null],
  ['scripts/lib/http-runtime-bindings.mjs', null],
  ['scripts/lib/http-runtime-protocol.mjs', null],
  ['scripts/lib/http-reference-loopback-protocol.mjs', null],
  ['scripts/lib/http-reference-network.mjs', null],
  ['scripts/lib/http-reference-registry.mjs', null],
  ['scripts/lib/http-reference-lifecycle.mjs', null],
  ['scripts/lib/http-reference-nest-guard.mjs', null],
]);

// Parent-only helper: never pretend it was evaluated in the child. Its exact
// bytes still require an independent control pin before resource allocation.
const referenceSupervisorControlClosure = new Map([['scripts/lib/http-owned-worker.mjs', null]]);

function referenceNestPreparationBindings(state) {
  const originURL = pathToFileURL(
    resolve(state.checkout, 'scripts/lib/http-reference-nest-guard.mjs'),
  ).href;
  const anchorPath = resolve(state.checkout, 'packages/flow/package.json');
  const require = createRequire(pathToFileURL(anchorPath));
  const definitions = [
    ['@nestjs/core/nest-factory', 'NestFactory'],
    ['@nestjs/core/nest-application', 'NestApplication'],
    ['@nestjs/platform-express/adapters/express-adapter', 'ExpressAdapter'],
  ];
  const paths = definitions.map(([specifier]) => require.resolve(specifier));
  const manifests = ['@nestjs/core/package.json', '@nestjs/platform-express/package.json'].map(
    (specifier) => require.resolve(specifier),
  );
  for (const path of [...paths, ...manifests, anchorPath])
    if (realpathSync(path) !== path || !lstatSync(path).isFile())
      refuse('Parent Nest preparation path differs from its bound physical source');
  return {
    originURL,
    resolutionOriginURL: pathToFileURL(anchorPath).href,
    provenance: 'FIRST_ORIGINAL_REQUIRE_COMPLETION',
    cacheAbsentBeforeRequire: true,
    files: [...paths, ...manifests, anchorPath].map((path) => ({
      url: pathToFileURL(path).href,
      sha256: digest(readFileSync(path)),
    })),
    modules: definitions.map(([, exportName], index) => ({
      url: pathToFileURL(paths[index]).href,
      exportName,
      loaded: true,
    })),
    complete: false,
    readinessPromoting: false,
  };
}

function assertReferenceNestPreparationOrder(modules, preparation, checkout) {
  const first = (url) =>
    modules.evaluations
      .filter((row) => row.canonicalURL === url)
      .sort((a, b) => a.sequence - b.sequence)[0];
  const guard = first(
    pathToFileURL(resolve(checkout, 'scripts/lib/http-reference-nest-guard.mjs')).href,
  );
  const census = first(
    pathToFileURL(resolve(checkout, 'scripts/lib/http-runtime-census.mjs')).href,
  );
  if (!guard || !census) refuse('Parent Nest preparation controls lack actual load evidence');
  for (const module of preparation.modules) {
    const row = first(module.url);
    const file = preparation.files.find((entry) => entry.url === module.url);
    if (
      !row ||
      row.sha256 !== file?.sha256 ||
      row.sequence <= guard.sequence ||
      row.sequence >= census.sequence
    )
      refuse('Parent Nest preparation source/load order differs');
  }
}

function currentReferenceWorkerCleanup(state, handle) {
  if (!handle) return undefined;
  const operationId = snapshotOwnedHttpWorker(handle).operationId;
  const receipt = state.referenceRuntimeWorkerCleanup;
  return receipt?.complete === true &&
    receipt.operationId === operationId &&
    operationId === state.referenceRuntimeWorkerOperationId
    ? receipt
    : undefined;
}

function referenceRuntimeControls(state) {
  return referenceControlRows(state, referenceRuntimeControlClosure);
}

function referenceSupervisorControls(state) {
  return referenceControlRows(state, referenceSupervisorControlClosure);
}

function referenceControlRows(state, closure) {
  const supervisorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  return [...closure].map(([path, sha256]) => {
    if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(sha256))
      refuse('Connected reference runtime control has no independent source binding');
    const tracked = state.inputs.files.find((row) => row.path === path);
    const fresh = byteRow(state.checkout, resolve(state.checkout, path));
    const actual = byteRow(supervisorRoot, resolve(supervisorRoot, path));
    if (
      !tracked ||
      tracked.sha256 !== sha256 ||
      fresh.sha256 !== sha256 ||
      actual.sha256 !== sha256
    )
      refuse('Connected reference runtime control differs from accepted bytes');
    compareRows([tracked], [fresh]);
    compareRows([fresh], [actual]);
    return { ...fresh, blob: tracked.blob, classification: 'observer-source' };
  });
}

async function reapReferenceWorker(state) {
  const handle = state.referenceRuntimeWorker;
  if (!handle) return state.referenceRuntimeWorkerCleanup;
  let receipt;
  try {
    receipt = await reapOwnedHttpWorker(handle);
  } catch (error) {
    state.cleanupComplete = false;
    throw error;
  }
  if (
    receipt.complete !== true ||
    receipt.operationId !== snapshotOwnedHttpWorker(handle).operationId ||
    receipt.operationId !== state.referenceRuntimeWorkerOperationId
  ) {
    state.cleanupComplete = false;
    refuse('Owned reference child cleanup remains incomplete');
  }
  state.referenceRuntimeWorkerCleanup = receipt;
  state.referenceRuntimeWorker = undefined;
  return receipt;
}

/**
 * Fixed owned-resource reference factory diagnostic. No caller target, receipt,
 * factory, environment or process handle is accepted. This remains below the
 * six-composition HTTP/performance acceptance profile.
 */
export async function observeFreshHttpReferenceLoopback(handle) {
  if (arguments.length !== 1) refuse('Owned reference runtime accepts one private build handle');
  const state = stateFor(handle);
  const fixture = state.referenceFixture;
  if (
    state.runtimeActive ||
    state.referenceRuntimeWorker ||
    state.fixturePreparing ||
    state.fixtureChecking ||
    !fixture?.ready ||
    fixture.candidateCommit !== state.candidateCommit ||
    fixture.tree !== state.inputs.tree ||
    fixture.admission !== referenceFactoryAdmission ||
    fixture.sourceSha256 !== referenceFixtureSourceSha256
  )
    refuse('Owned reference fixture is absent, stale, or already in use');
  state.runtimeActive = true;
  let deadline, protocol, directory, nonce, descriptorPath, body, workerHandle, workerSnapshot;
  let failure, exited, fixtureCleanup, workerGroupAbsent;
  const terminate = () => {
    if (workerHandle) terminateOwnedHttpWorker(workerHandle);
  };
  const artifacts = [];
  try {
    recheck(state);
    requireReferenceFactoryAdmission(state);
    const controls = referenceRuntimeControls(state);
    const supervisorControls = referenceSupervisorControls(state);
    const nestPreparationBindings = referenceNestPreparationBindings(state);
    const observedFixture = await observeOwnedReferenceFixture(fixture.handle);
    const fixtureEnvironment = await ownedReferenceFixtureEnvironment(fixture.handle);
    const registry = deriveReferenceRegistryPlan({
      checkoutRoot: state.checkout,
      inputs: state.inputs,
      compilers: state.compilers,
    });
    if (
      !isDeepStrictEqual(observedFixture, fixture.observed) ||
      !isDeepStrictEqual(fixtureEnvironment, fixture.environment) ||
      !isDeepStrictEqual(registry, fixture.registry)
    )
      refuse('Owned reference fixture or compiler registry changed before launch');
    const receipt = workerModuleReceiptFromFreshBuild(handle);
    const urls = new Set(receipt.files.map((row) => row.url));
    for (const row of controls) {
      const url = pathToFileURL(resolve(state.checkout, row.path)).href;
      if (urls.has(url)) refuse('Connected reference observer collides with a build module');
      urls.add(url);
      receipt.files.push({
        url,
        sha256: row.sha256,
        moduleKind: 'module',
        classification: 'observer-source',
      });
    }
    const environment = runtimeEnvironment(state);
    for (const [name, value] of Object.entries(fixtureEnvironment)) {
      if (Object.hasOwn(environment, name) && environment[name] !== value)
        refuse('Owned fixture environment collides with the reviewed runtime environment');
      environment[name] = value;
    }
    nonce = fixture.nonce;
    directory = resolve(state.sandbox, 'runtime-jobs');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    descriptorPath = resolve(directory, `${nonce}.json`);
    const observationArtifactPath = resolve(directory, `${nonce}.reference-body.json`);
    const entry = resolve(state.checkout, 'scripts/lib/http-runtime-worker.mjs');
    const job = {
      schemaVersion: 1,
      mode: 'reference-owned-loopback',
      compositionId: state.rootId,
      nonce,
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      parentPid: process.pid,
      checkoutRoot: state.checkout,
      descriptorPath,
      nodePath: realpathSync(state.node),
      nodeSha256: digest(readFileSync(state.node)),
      platform: state.platform,
      arch: state.arch,
      environment: Object.fromEntries(
        Object.entries(environment).map(([name, value]) => [name, digest(value)]),
      ),
      controls,
      resolutionAnchors: runtimeResolutionAnchors(
        state,
        controls,
        nonce,
        'reference-owned-loopback',
      ),
      receipt,
      bootstrap: referenceBootstrapBinding(state),
      referenceFixture: observedFixture,
      referenceRegistry: registry,
      observationArtifactPath,
    };
    body = Buffer.from(serializeHttpRuntimePlainJson(job));
    if (body.length > 64 * 1024 * 1024) refuse('Owned reference job exceeds its bound');
    writeFileSync(descriptorPath, body, { mode: 0o600, flag: 'wx' });
    environment.STYNX_HTTP_JOB_SHA256 = digest(body);
    const bindings = runtimeProtocolBindings(state, job, body, environment);
    const stdout = [],
      stderr = [];
    let logLength = 0;
    const startedAt = new Date().toISOString();
    // Store the opaque operation before native spawn; all child/events/cleanup
    // remain owned by the same production component used in Inspector cases.
    workerHandle = createOwnedHttpWorker();
    // Rotate current evidence before acquisition. Completed receipts remain
    // historical; their ABSENT meaning cannot qualify this new operation.
    if (state.referenceRuntimeWorkerCleanup) {
      state.referenceRuntimeWorkerCleanupHistory ??= [];
      state.referenceRuntimeWorkerCleanupHistory.push(state.referenceRuntimeWorkerCleanup);
    }
    state.referenceRuntimeWorkerCleanup = undefined;
    state.referenceRuntimeWorkerOperationId = snapshotOwnedHttpWorker(workerHandle).operationId;
    state.referenceRuntimeWorker = workerHandle;
    state.cleanupComplete = false;
    workerSnapshot = launchOwnedHttpWorker(workerHandle, {
      executable: state.node,
      argv: [entry, descriptorPath],
      cwd: state.checkout,
      environment,
    });
    const closePromise = waitOwnedHttpWorkerClose(workerHandle);
    if (!workerSnapshot.pid) {
      await closePromise;
      refuse('Owned reference worker could not start');
    }
    protocol = createReferenceRuntimeProtocol({
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      nonce,
      workerPid: workerSnapshot.pid,
      fixtureSha256: digest(serializeHttpRuntimePlainJson(observedFixture)),
      controlClosureSha256: digest(serializeHttpRuntimePlainJson(controls)),
      moduleContext: {
        mode: 'reference-owned-loopback',
        candidateCommit: state.candidateCommit,
        nonce,
        pid: workerSnapshot.pid,
        bindings,
      },
      observationArtifactPath,
    });
    const reject = () => {
      failure ??= 'HTTP_REFERENCE_WORKER_INVALID';
      terminate();
    };
    const collect = (chunks, chunk) => {
      logLength += chunk.length;
      if (logLength > 64 * 1024 * 1024) reject();
      else chunks.push(chunk);
    };
    observeOwnedHttpWorker(workerHandle, {
      stdout: (chunk) => collect(stdout, chunk),
      stderr: (chunk) => collect(stderr, chunk),
      message(frame) {
        if (!protocol.receive(frame)) reject();
      },
      error() {
        failure ??= 'HTTP_REFERENCE_WORKER_SPAWN';
        terminate();
      },
    });
    deadline = setTimeout(reject, 180_000);
    exited = await closePromise;
    workerSnapshot = snapshotOwnedHttpWorker(workerHandle);
    if (workerSnapshot.subscriberFailureCount || workerSnapshot.bufferingFailure)
      failure ??= 'HTTP_REFERENCE_WORKER_OBSERVER';
    clearTimeout(deadline);
    for (const [name, chunks] of [
      ['stdout', stdout],
      ['stderr', stderr],
    ]) {
      const path = resolve(directory, `${nonce}.${name}.log`);
      writeFileSync(path, Buffer.concat(chunks), { mode: 0o600, flag: 'wx' });
      artifacts.push(byteRow(state.sandbox, path));
    }
    const capturePath = resolve(directory, `${nonce}.parsed-ipc.json`);
    const capture = protocol.captureArtifact();
    if (capture.overflowed || !capture.captureComplete)
      failure ??= 'HTTP_REFERENCE_CAPTURE_INVALID';
    writeFileSync(capturePath, serializeHttpRuntimePlainJson(capture), {
      mode: 0o600,
      flag: 'wx',
    });
    artifacts.push(byteRow(state.sandbox, capturePath));
    if (failure) refuse('Owned reference worker did not complete its closed live protocol');
    const wire = protocol.finish(exited);
    const workerCleanup = await reapReferenceWorker(state);
    workerGroupAbsent = workerCleanup.groupOutcome === 'ABSENT';
    if (!workerGroupAbsent) refuse('Owned reference worker group remains present or unobservable');
    const artifact = wire.terminal.observationArtifact;
    const actualArtifact = byteRow(state.sandbox, observationArtifactPath);
    if (
      actualArtifact.sha256 !== artifact.sha256 ||
      actualArtifact.byteLength !== artifact.byteLength ||
      actualArtifact.permissions !== artifact.permissions ||
      actualArtifact.byteLength > 64 * 1024 * 1024 ||
      realpathSync(observationArtifactPath) !== observationArtifactPath
    )
      refuse('Owned reference body differs from its actual private artifact');
    const raw = JSON.parse(readFileSync(observationArtifactPath, 'utf8'));
    serializeHttpRuntimePlainJson(raw); // validated plain-data boundary, no source evaluation
    if (
      !isDeepStrictEqual(
        Object.keys(raw).sort(),
        [
          'schemaVersion',
          'scope',
          'candidateCommit',
          'tree',
          'nonce',
          'workerPid',
          'referenceObservation',
          'networkClosure',
          'parentCorroborationRequired',
          'complete',
          'runtimeCustodyComplete',
          'performanceQualified',
          'readinessPromoting',
        ].sort(),
      ) ||
      raw.schemaVersion !== 1 ||
      raw.scope !== job.mode ||
      raw.candidateCommit !== state.candidateCommit ||
      raw.tree !== state.inputs.tree ||
      raw.nonce !== nonce ||
      raw.workerPid !== workerSnapshot.pid ||
      raw.parentCorroborationRequired !== true ||
      raw.complete !== false ||
      raw.runtimeCustodyComplete !== false ||
      raw.performanceQualified !== false ||
      raw.readinessPromoting !== false ||
      !isDeepStrictEqual(raw.networkClosure, {
        closed: true,
        parentCorroborationRequired: true,
        readinessPromoting: false,
      }) ||
      !isDeepStrictEqual(raw.referenceObservation?.phases, wire.phases) ||
      !isDeepStrictEqual(raw.referenceObservation?.bootstrap, bindings.observation) ||
      raw.referenceObservation?.scope !== job.mode ||
      raw.referenceObservation?.complete !== false ||
      raw.referenceObservation?.runtimeCustodyComplete !== false ||
      raw.referenceObservation?.performanceQualified !== false ||
      raw.referenceObservation?.readinessPromoting !== false
    )
      refuse('Owned reference body contradicts the admitted live phase projection');
    if (
      !isDeepStrictEqual(
        raw.referenceObservation?.nestAppLink?.preparation,
        nestPreparationBindings,
      )
    )
      refuse('Parent Nest preparation source/cache projection differs from bound files');
    assertReferenceNestPreparationOrder(
      wire.terminal.modules,
      nestPreparationBindings,
      state.checkout,
    );
    const finalPhase = wire.phases.at(-1);
    const observed = raw.referenceObservation;
    if (
      digest(serializeHttpRuntimePlainJson(observed.registry)) !== finalPhase.registrySha256 ||
      digest(
        serializeHttpRuntimePlainJson({
          layers: observed.layers,
          instances: observed.middlewareInstances,
          callbacks: observed.callbacks,
        }),
      ) !== finalPhase.middlewareSha256 ||
      digest(serializeHttpRuntimePlainJson(observed.network)) !== finalPhase.networkSha256
    )
      refuse('Owned reference component bytes differ from their final phase digests');
    recheck(state);
    compareRows(controls, referenceRuntimeControls(state));
    compareRows(supervisorControls, referenceSupervisorControls(state));
    if (!isDeepStrictEqual(nestPreparationBindings, referenceNestPreparationBindings(state)))
      refuse('Parent Nest preparation source identities changed during observation');
    if (
      !isDeepStrictEqual(bindings, runtimeProtocolBindings(state, job, body, environment)) ||
      !isDeepStrictEqual(
        job.resolutionAnchors,
        runtimeResolutionAnchors(state, controls, nonce, 'reference-owned-loopback'),
      ) ||
      !isDeepStrictEqual(await observeOwnedReferenceFixture(fixture.handle), observedFixture) ||
      !isDeepStrictEqual(
        await ownedReferenceFixtureEnvironment(fixture.handle),
        fixtureEnvironment,
      ) ||
      !isDeepStrictEqual(
        deriveReferenceRegistryPlan({
          checkoutRoot: state.checkout,
          inputs: state.inputs,
          compilers: state.compilers,
        }),
        registry,
      )
    )
      refuse('Actual owned reference parent bindings changed during the worker');
    compareRows(
      [byteRow(state.sandbox, descriptorPath)],
      [
        {
          path: owned(state.sandbox, descriptorPath),
          sha256: digest(body),
          byteLength: body.length,
          permissions: 0o600,
        },
      ],
    );
    for (const row of [
      ...wire.terminal.modules.resolutions.filter((entry) => entry.builtin === false),
      ...wire.terminal.modules.evaluations,
    ])
      if (pathToFileURL(realpathSync(fileURLToPath(row.url))).href !== row.canonicalURL)
        refuse('Owned reference module raw path differs from its canonical custody member');
    fixtureCleanup = await closeOwnedReferenceFixture(fixture.handle);
    if (fixtureCleanup?.complete !== true) refuse('Owned reference fixture cleanup is incomplete');
    state.referenceFixture = undefined;
    artifacts.push(actualArtifact);
    const report = {
      schemaVersion: 1,
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      scope: job.mode,
      compositionId: state.rootId,
      nonce,
      child: {
        pid: workerSnapshot.pid,
        nodePath: job.nodePath,
        nodeSha256: job.nodeSha256,
        argv: [entry, descriptorPath],
        cwd: state.checkout,
        startedAt,
        finishedAt: new Date().toISOString(),
        ...exited,
        groupAbsenceObserved: workerGroupAbsent,
      },
      environment: job.environment,
      controls,
      supervisorControls,
      workerCleanup,
      descriptor: byteRow(state.sandbox, descriptorPath),
      artifacts,
      resourcesBeforeLaunch: observedFixture,
      fixtureCleanup,
      result: wire,
      rawSensorBodyAdmission: 'DIGEST_BOUND_DIAGNOSTIC_NOT_QUALIFIED',
      runtimeSecretsConsumed: true,
      parentCorroborationRequired: true,
      processSandbox: false,
      complete: false,
      runtimeCustodyComplete: false,
      performanceQualified: false,
      readinessPromoting: false,
    };
    const reportPath = resolve(directory, `${nonce}.reference-observation.json`);
    writeFileSync(reportPath, serializeHttpRuntimePlainJson(report), { mode: 0o600, flag: 'wx' });
    return structuredClone({ ...report, reportArtifact: byteRow(state.sandbox, reportPath) });
  } catch (error) {
    failure ??= 'HTTP_REFERENCE_WORKER_INVALID';
    state.refusal = failure;
    throw error;
  } finally {
    clearTimeout(deadline);
    try {
      await reapReferenceWorker(state);
    } catch {
      state.refusal ??= 'HTTP_REFERENCE_CHILD_CLEANUP_INCOMPLETE';
    }
    // The retained actual resource handle stays in state on failed cleanup so
    // closeFreshHttpBuild can retry the controller's own resumable teardown.
    if (!state.referenceRuntimeWorker && state.referenceFixture === fixture) {
      try {
        fixtureCleanup = await closeOwnedReferenceFixture(fixture.handle);
        if (fixtureCleanup?.complete === true) state.referenceFixture = undefined;
        else state.refusal ??= 'HTTP_REFERENCE_FIXTURE_CLEANUP_INCOMPLETE';
      } catch {
        state.refusal ??= 'HTTP_REFERENCE_FIXTURE_CLEANUP_INCOMPLETE';
      }
    }
    state.runtimeActive = false;
    if (directory && nonce && protocol) {
      try {
        const path = resolve(directory, `${nonce}.final-ipc.json`);
        writeFileSync(path, serializeHttpRuntimePlainJson(protocol.captureArtifact()), {
          mode: 0o600,
          flag: 'wx',
        });
        const cleanupPath = resolve(directory, `${nonce}.reference-cleanup.json`);
        writeFileSync(
          cleanupPath,
          serializeHttpRuntimePlainJson({
            schemaVersion: 1,
            scope: 'reference-owned-loopback-cleanup',
            nonce,
            childPid: workerHandle ? snapshotOwnedHttpWorker(workerHandle).pid : null,
            exit: exited ?? null,
            childCloseObserved: workerHandle
              ? snapshotOwnedHttpWorker(workerHandle).closeObserved
              : false,
            groupAbsenceObserved:
              currentReferenceWorkerCleanup(state, workerHandle)?.groupOutcome === 'ABSENT',
            workerCleanup: currentReferenceWorkerCleanup(state, workerHandle) ?? null,
            historicalWorkerCleanup: state.referenceRuntimeWorkerCleanupHistory ?? [],
            workerObligation: workerHandle ? snapshotOwnedHttpWorker(workerHandle) : null,
            fixtureCleanup: fixtureCleanup ?? null,
            refusal: state.refusal ?? null,
            complete: false,
            runtimeCustodyComplete: false,
            performanceQualified: false,
            readinessPromoting: false,
          }),
          { mode: 0o600, flag: 'wx' },
        );
      } catch {
        state.refusal ??= 'HTTP_REFERENCE_CAPTURE_INCOMPLETE';
      }
    }
    if (!failure && state.refusal)
      refuse('Owned reference final capture or cleanup could not be independently retained');
  }
}

// Prospective independent bindings; NULL is a hard refusal before acquisition.
// The native executable is provisioned only into this private build's fixed
// toolchain path by a separately reviewed official acquisition producer.
const qualificationAdmission = Object.freeze({
  officialGeneratorOrigin: null,
  generatorExecutableSha256: null,
  actualGoBuildInfo: null,
  matchingGoSource: null,
  generatorNativeClosure: null,
  noRetryWireNegativeControls: null,
  calibration: null,
  effectiveQuotaAndEffectVerification: null,
});
const qualificationRuntimeControlClosure = new Map([
  ...referenceRuntimeControlClosure,
  ['scripts/lib/http-qualification-protocol.mjs', null],
  ['scripts/lib/http-qualification-liveness.mjs', null],
  ['scripts/lib/http-qualification-exchange.mjs', null],
  ['scripts/lib/k6-baseline-json.mjs', null],
]);
const qualificationSupervisorControlClosure = new Map([
  ...referenceSupervisorControlClosure,
  ['scripts/lib/http-qualification-manifest.mjs', null],
  ['scripts/lib/http-qualification-protocol.mjs', null],
  ['scripts/lib/http-qualification-raw.mjs', null],
  ['scripts/lib/http-qualification-metrics.mjs', null],
  ['scripts/lib/http-qualification-artifacts.mjs', null],
  ['scripts/lib/http-qualification-worker-body.mjs', null],
  ['scripts/lib/http-qualification-log-capture.mjs', null],
  ['scripts/lib/http-qualification-liveness.mjs', null],
  ['scripts/lib/k6-baseline-json.mjs', null],
  ['scripts/performance/http-qualification.k6.mjs', null],
]);
function qualificationControls(state) {
  return referenceControlRows(state, qualificationRuntimeControlClosure);
}
function qualificationSupervisorControls(state) {
  return referenceControlRows(state, qualificationSupervisorControlClosure);
}
function qualificationExecutable(state) {
  for (const [name, identity] of Object.entries(qualificationAdmission))
    if (typeof identity !== 'string' || !/^[a-f0-9]{64}$/u.test(identity))
      refuse(`Qualification admission is not independently bound: ${name}`);
  const executable = resolve(state.sandbox, 'toolchain/k6/k6');
  const row = byteRow(state.sandbox, executable);
  if (
    realpathSync(executable) !== executable ||
    !lstatSync(executable).isFile() ||
    row.sha256 !== qualificationAdmission.generatorExecutableSha256 ||
    (row.permissions & 0o111) === 0
  )
    refuse('Actual private generator differs from the independently accepted official binary');
  return { executable, row };
}

async function reapQualificationGenerator(state) {
  const handle = state.qualificationGeneratorWorker;
  if (!handle) return state.qualificationGeneratorCleanup;
  const receipt = await reapOwnedHttpWorker(handle);
  if (
    !receipt.complete ||
    receipt.operationId !== snapshotOwnedHttpWorker(handle).operationId ||
    receipt.operationId !== state.qualificationGeneratorOperationId
  ) {
    state.cleanupComplete = false;
    refuse('Actual qualification generator cleanup is incomplete');
  }
  state.qualificationGeneratorCleanup = receipt;
  state.qualificationGeneratorWorker = undefined;
  return receipt;
}

async function runOwnedQualificationGenerator(state, declaration, allocation, directory, native) {
  const prefix = resolve(directory, allocation.generatorOperationId);
  const inputPath = `${prefix}.input.json`;
  const rawPath = `${prefix}.targets.jsonl`;
  const metricsPath = `${prefix}.metrics.jsonl`;
  const configPath = `${prefix}.config.json`;
  const inputBytes = Buffer.from(serializeHttpRuntimePlainJson(allocation));
  writeFileSync(inputPath, inputBytes, { mode: 0o600, flag: 'wx' });
  retainQualificationArtifact(state, 'allocation', inputPath);
  writeFileSync(configPath, '{}\n', { mode: 0o600, flag: 'wx' });
  for (const path of [rawPath, metricsPath]) writeFileSync(path, '', { mode: 0o600, flag: 'wx' });
  retainQualificationArtifact(state, 'target-raw', rawPath);
  retainQualificationArtifact(state, 'native-metrics', metricsPath);
  const scriptPath = resolve(state.checkout, 'scripts/performance/http-qualification.k6.mjs');
  const script = byteRow(state.checkout, scriptPath);
  const environment = {
    HOME: state.environment.HOME,
    PATH: state.environment.PATH,
    TZ: 'UTC',
    STYNX_HTTP_QUALIFICATION_INPUT: inputPath,
    STYNX_HTTP_QUALIFICATION_INPUT_SHA256: digest(inputBytes),
  };
  const argv = [
    '--quiet',
    '--log-format=raw',
    `--config=${configPath}`,
    'run',
    '--address=',
    '--no-usage-report',
    `--console-output=${rawPath}`,
    `--out=json=${metricsPath}`,
    scriptPath,
  ];
  const handle = createOwnedHttpWorker();
  state.qualificationGeneratorCleanup = undefined;
  state.qualificationGeneratorWorker = handle;
  state.qualificationGeneratorOperationId = snapshotOwnedHttpWorker(handle).operationId;
  state.cleanupComplete = false;
  const stdout = [],
    stderr = [];
  let logBytes = 0,
    failure,
    operationError,
    finalizationError,
    result,
    timer,
    watcher;
  const reject = () => {
    failure ??= 'HTTP_QUALIFICATION_GENERATOR_INVALID';
    terminateOwnedHttpWorker(handle);
  };
  try {
    const launch = launchOwnedHttpWorker(handle, {
      executable: native.executable,
      argv,
      cwd: state.checkout,
      environment,
    });
    observeOwnedHttpWorker(handle, {
      stdout(chunk) {
        logBytes += chunk.length;
        if (logBytes > 64 * 1024 * 1024) reject();
        else stdout.push(chunk);
      },
      stderr(chunk) {
        logBytes += chunk.length;
        if (logBytes > 64 * 1024 * 1024) reject();
        else stderr.push(chunk);
      },
      message() {
        reject();
      },
      error() {
        reject();
      },
    });
    watcher = watch(directory, () => {
      try {
        for (const path of [rawPath, metricsPath])
          if (lstatSync(path).size > 64 * 1024 * 1024) reject();
      } catch {
        reject();
      }
    });
    watcher.on('error', reject);
    timer = setTimeout(reject, 330_000);
    const exit = await waitOwnedHttpWorkerClose(handle);
    clearTimeout(timer);
    watcher.close();
    watcher = undefined;
    const observed = snapshotOwnedHttpWorker(handle);
    const cleanup = await reapQualificationGenerator(state);
    if (
      failure ||
      exit.code !== 0 ||
      exit.signal !== null ||
      !launch.pid ||
      observed.subscriberFailureCount ||
      observed.bufferingFailure ||
      cleanup.groupOutcome !== 'ABSENT'
    )
      refuse('Actual native generator failed or lacks owned close/group absence');
    compareRows([native.row], [byteRow(state.sandbox, native.executable)]);
    compareRows([script], [byteRow(state.checkout, scriptPath)]);
    if (
      !readHttpQualificationArtifact(state.sandbox, inputPath).bytes.equals(inputBytes) ||
      readHttpQualificationArtifact(state.sandbox, configPath).bytes.toString('utf8') !== '{}\n'
    )
      refuse('Actual sealed generator allocation/config changed');
    const rawCapture = readHttpQualificationArtifact(state.sandbox, rawPath);
    const metricCapture = readHttpQualificationArtifact(state.sandbox, metricsPath);
    const raw = rawCapture.row,
      metrics = metricCapture.row;
    const decoded = decodeHttpQualificationTargetCapture(rawCapture.bytes, allocation);
    const counters = decodeHttpQualificationNativeMetrics(metricCapture.bytes, allocation.caseId);
    const outcomes = inspectLivenessQualificationOutcomes(declaration, decoded);
    result = {
      generatorOperationId: allocation.generatorOperationId,
      ownedNativeOperationId: observed.operationId,
      launch: {
        pid: launch.pid,
        executable: native.row,
        argv,
        cwd: state.checkout,
        environment: Object.fromEntries(
          Object.entries(environment).map(([key, value]) => [key, digest(value)]),
        ),
      },
      cleanup,
      raw,
      metrics,
      decoded,
      counters,
      outcomes,
      complete: false,
      runtimeCustodyComplete: false,
      performanceQualified: false,
      readinessPromoting: false,
    };
  } catch (error) {
    operationError = error;
  } finally {
    clearTimeout(timer);
    watcher?.close();
    let cleanupError, captureError;
    try {
      await reapQualificationGenerator(state);
    } catch (error) {
      cleanupError = error;
      state.refusal ??= 'HTTP_QUALIFICATION_GENERATOR_CLEANUP_INCOMPLETE';
    } finally {
      // Always capture both real bounded streams, including when reap refuses.
      for (const stream of ['stdout', 'stderr'])
        retainQualificationArtifact(
          state,
          `generator-${stream}`,
          resolve(directory, `${allocation.generatorOperationId}.${stream}.log`),
        );
      try {
        captureHttpQualificationGeneratorLogs(
          directory,
          allocation.generatorOperationId,
          stdout,
          stderr,
        );
      } catch (error) {
        captureError = error;
        state.refusal ??= 'HTTP_QUALIFICATION_GENERATOR_CAPTURE_INCOMPLETE';
      }
    }
    finalizationError = captureError ?? cleanupError;
  }
  if (operationError) throw operationError;
  if (finalizationError) throw finalizationError;
  return result;
}

/** Persistent owned worker + native generator operation. Only exact caseId is
 * caller data; all declarations, recipes, resources and child handles are private.
 * Source completion never promotes the still-unverified full application profile.
 */
export async function qualifyFreshHttpEndpoint(handle, request) {
  if (arguments.length !== 2) refuse('Qualification requires one actual build and exact caseId');
  // Serialize first: proxies/getters/symbols and undeclared fields cannot execute
  // or broaden a native operation through an apparently small options object.
  const options = JSON.parse(serializeHttpRuntimePlainJson(request));
  if (Object.keys(options).join(',') !== 'caseId' || typeof options.caseId !== 'string')
    refuse('Qualification accepts only one exact case ID');
  const state = stateFor(handle);
  if (
    state.runtimeActive ||
    state.referenceRuntimeWorker ||
    state.qualificationGeneratorWorker ||
    state.fixturePreparing ||
    state.fixtureChecking
  )
    refuse('Actual build already owns a runtime operation');
  const declaration = snapshotFreshHttpQualificationCase(handle, options.caseId);
  if (
    !state.qualificationAttempt ||
    state.qualificationAttempt.sealed ||
    state.qualificationAttempt.case.caseId !== options.caseId ||
    state.qualificationAttempt.case.caseSha256 !== declaration.caseSha256
  )
    refuse('Qualification requires its actual private journaled attempt before effects');
  assertLivenessQualificationDeclaration(declaration); // Every unimplemented recipe refuses before effects.
  requireReferenceFactoryAdmission(state);
  const controls = qualificationControls(state);
  const supervisorControls = qualificationSupervisorControls(state);
  const native = qualificationExecutable(state); // NULL floors refuse before native/resource acquisition.
  const fixture = state.referenceFixture;
  if (
    !fixture?.ready ||
    fixture.candidateCommit !== state.candidateCommit ||
    fixture.tree !== state.inputs.tree ||
    fixture.admission !== referenceFactoryAdmission ||
    fixture.sourceSha256 !== referenceFixtureSourceSha256
  )
    refuse('Qualification requires the actual retained admitted reference fixture');
  state.runtimeActive = true;
  let workerHandle,
    protocol,
    deadline,
    directory,
    job,
    descriptorPath,
    descriptorBytes,
    environment,
    generator,
    exited,
    finalDeadline;
  let failure, fixtureCleanup, bindings;
  const waiters = new Map(),
    received = new Map();
  const reject = () => {
    failure ??= 'HTTP_QUALIFICATION_OPERATION_INVALID';
    if (workerHandle) terminateOwnedHttpWorker(workerHandle);
    if (state.qualificationGeneratorWorker)
      terminateOwnedHttpWorker(state.qualificationGeneratorWorker);
    for (const waiter of waiters.values())
      waiter.reject(new Error('Actual qualification operation refused'));
    waiters.clear();
  };
  const waitPhase = (name) => {
    if (failure) return Promise.reject(new Error('Qualification operation already refused'));
    return received.has(name)
      ? Promise.resolve(received.get(name))
      : new Promise((accept, reject) => waiters.set(name, { accept, reject }));
  };
  const waitPhaseWithin = async (name, milliseconds) => {
    let timer;
    try {
      return await Promise.race([
        waitPhase(name),
        new Promise((_, rejectWait) => {
          timer = setTimeout(() => {
            reject();
            rejectWait(new Error('Qualification phase deadline expired'));
          }, milliseconds);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const artifacts = [],
    stdout = [],
    stderr = [];
  let logBytes = 0;
  deadline = setTimeout(reject, 600_000);
  try {
    recheck(state);
    const observedFixture = await observeOwnedReferenceFixture(fixture.handle);
    const fixtureEnvironment = await ownedReferenceFixtureEnvironment(fixture.handle);
    const registry = deriveReferenceRegistryPlan({
      checkoutRoot: state.checkout,
      inputs: state.inputs,
      compilers: state.compilers,
    });
    if (
      !isDeepStrictEqual(observedFixture, fixture.observed) ||
      !isDeepStrictEqual(fixtureEnvironment, fixture.environment) ||
      !isDeepStrictEqual(registry, fixture.registry)
    )
      refuse('Actual qualification fixture drifted');
    const receipt = workerModuleReceiptFromFreshBuild(handle);
    const urls = new Set(receipt.files.map((row) => row.url));
    for (const row of controls) {
      const url = pathToFileURL(resolve(state.checkout, row.path)).href;
      if (urls.has(url)) refuse('Qualification control collides with an application module');
      urls.add(url);
      receipt.files.push({
        url,
        sha256: row.sha256,
        moduleKind: 'module',
        classification: 'observer-source',
      });
    }
    environment = runtimeEnvironment(state);
    for (const [key, value] of Object.entries(fixtureEnvironment)) {
      if (Object.hasOwn(environment, key) && environment[key] !== value)
        refuse('Qualification environment collision');
      environment[key] = value;
    }
    directory = resolve(state.sandbox, 'qualification-jobs', randomUUID());
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    descriptorPath = resolve(directory, `${fixture.nonce}.json`);
    workerHandle = createOwnedHttpWorker();
    const operationId = snapshotOwnedHttpWorker(workerHandle).operationId;
    if (state.referenceRuntimeWorkerCleanup) {
      state.referenceRuntimeWorkerCleanupHistory ??= [];
      state.referenceRuntimeWorkerCleanupHistory.push(state.referenceRuntimeWorkerCleanup);
    }
    state.referenceRuntimeWorkerCleanup = undefined;
    state.referenceRuntimeWorkerOperationId = operationId;
    state.referenceRuntimeWorker = workerHandle;
    state.cleanupComplete = false;
    job = {
      schemaVersion: 1,
      mode: 'http-endpoint-qualification',
      compositionId: state.rootId,
      nonce: fixture.nonce,
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      parentPid: process.pid,
      checkoutRoot: state.checkout,
      descriptorPath,
      nodePath: realpathSync(state.node),
      nodeSha256: digest(readFileSync(state.node)),
      platform: state.platform,
      arch: state.arch,
      environment: Object.fromEntries(
        Object.entries(environment).map(([key, value]) => [key, digest(value)]),
      ),
      controls,
      resolutionAnchors: runtimeResolutionAnchors(
        state,
        controls,
        fixture.nonce,
        'http-endpoint-qualification',
      ),
      receipt,
      bootstrap: referenceBootstrapBinding(state),
      referenceFixture: observedFixture,
      referenceRegistry: registry,
      observationArtifactPath: resolve(directory, `${fixture.nonce}.qualification-body.json`),
      qualification: {
        operationId,
        caseId: options.caseId,
        caseSha256: declaration.caseSha256,
        manifestSha256: declaration.manifestSha256,
      },
    };
    descriptorBytes = Buffer.from(serializeHttpRuntimePlainJson(job));
    writeFileSync(descriptorPath, descriptorBytes, { mode: 0o600, flag: 'wx' });
    retainQualificationArtifact(state, 'descriptor', descriptorPath);
    retainQualificationArtifact(state, 'worker-body', job.observationArtifactPath);
    environment.STYNX_HTTP_JOB_SHA256 = digest(descriptorBytes);
    bindings = runtimeProtocolBindings(state, job, descriptorBytes, environment);
    const worker = launchOwnedHttpWorker(workerHandle, {
      executable: state.node,
      argv: [resolve(state.checkout, 'scripts/lib/http-runtime-worker.mjs'), descriptorPath],
      cwd: state.checkout,
      environment,
    });
    if (!worker.pid) {
      await waitOwnedHttpWorkerClose(workerHandle);
      refuse('Actual qualification worker could not start');
    }
    protocol = createHttpQualificationProtocol({
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      nonce: fixture.nonce,
      operationId,
      workerPid: worker.pid,
      compositionId: state.rootId,
      caseId: options.caseId,
      caseSha256: declaration.caseSha256,
      manifestSha256: declaration.manifestSha256,
      fixtureSha256: digest(serializeHttpRuntimePlainJson(observedFixture)),
      controlClosureSha256: digest(serializeHttpRuntimePlainJson(controls)),
    });
    observeOwnedHttpWorker(workerHandle, {
      stdout(chunk) {
        logBytes += chunk.length;
        if (logBytes > 64 * 1024 * 1024) reject();
        else stdout.push(chunk);
      },
      stderr(chunk) {
        logBytes += chunk.length;
        if (logBytes > 64 * 1024 * 1024) reject();
        else stderr.push(chunk);
      },
      message(frame) {
        if (!protocol.receive(frame)) {
          reject();
          return;
        }
        received.set(frame.phase, frame.body);
        const waiter = waiters.get(frame.phase);
        if (waiter) {
          waiters.delete(frame.phase);
          waiter.accept(frame.body);
        }
      },
      error() {
        reject();
      },
      close() {
        if (!received.has('terminal')) reject();
      },
    });
    await waitPhaseWithin('listen', 30_000);
    const ready = await waitPhaseWithin('ready', 180_000);
    const generatorOperationId = randomUUID();
    const allocation = createLivenessQualificationAllocation(
      declaration,
      {
        candidateCommit: state.candidateCommit,
        tree: state.inputs.tree,
        operationId,
        generatorOperationId,
      },
      ready,
    );
    const generatorInputsSha256 = digest(serializeHttpRuntimePlainJson(allocation));
    const command = (name, body) =>
      sendOwnedHttpWorker(workerHandle, {
        schemaVersion: 1,
        mode: job.mode,
        operationId,
        nonce: fixture.nonce,
        candidateCommit: state.candidateCommit,
        tree: state.inputs.tree,
        workerPid: worker.pid,
        caseId: options.caseId,
        command: name,
        body,
      });
    command('begin-measurement', {
      generatorOperationId,
      generatorExecutableSha256: native.row.sha256,
      generatorInputsSha256,
      durationSeconds: 300,
      ratePerSecond: 2,
      scheduledTargetCount: 600,
    });
    await waitPhaseWithin('measurement-start', 30_000);
    generator = await runOwnedQualificationGenerator(
      state,
      declaration,
      allocation,
      directory,
      native,
    );
    const measurementCompletion = {
      generatorOperationId,
      rawArtifactsSha256: digest(serializeHttpRuntimePlainJson([generator.raw, generator.metrics])),
      rawOutcomeCount: generator.decoded.targetCount,
      startedTargetCount: generator.counters.startedTargetCount,
      completedTargetCount: generator.counters.completedTargetCount,
      droppedTargetCount: generator.counters.droppedTargetCount,
      unexpectedOutcomeCount: generator.outcomes.unexpectedOutcomeCount,
      effectEvidenceSha256: digest(serializeHttpRuntimePlainJson(generator.outcomes)),
    };
    command('finish-measurement', measurementCompletion);
    await waitPhaseWithin('close', 30_000);
    await waitPhaseWithin('terminal', 30_000);
    finalDeadline = setTimeout(reject, 30_000);
    exited = await waitOwnedHttpWorkerClose(workerHandle);
    const snapshot = snapshotOwnedHttpWorker(workerHandle);
    const wire = protocol.finish({
      workerPid: worker.pid,
      code: exited.code,
      signal: exited.signal,
      operationId,
    });
    if (failure || snapshot.subscriberFailureCount || snapshot.bufferingFailure)
      refuse('Qualification worker custody refused');
    const workerCleanup = await reapReferenceWorker(state);
    if (workerCleanup.groupOutcome !== 'ABSENT')
      refuse('Qualification worker group remains present');
    const observedCapture = readHttpQualificationArtifact(
      state.sandbox,
      job.observationArtifactPath,
    );
    const observedArtifact = observedCapture.row;
    if (
      observedArtifact.sha256 !== received.get('terminal').resultArtifactSha256 ||
      observedArtifact.permissions !== 0o600 ||
      realpathSync(job.observationArtifactPath) !== job.observationArtifactPath
    )
      refuse('Qualification worker result bytes differ');
    const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(observedCapture.bytes));
    serializeHttpRuntimePlainJson(raw);
    const validator = createHttpModuleSnapshotValidator({
      bindings,
      candidateCommit: state.candidateCommit,
      mode: job.mode,
      nonce: fixture.nonce,
      pid: worker.pid,
    });
    assertHttpQualificationWorkerBody(raw, {
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      workerPid: worker.pid,
      nonce: fixture.nonce,
      trustedBootstrap: bindings.trustedBootstrap,
    });
    if (!validator.accepts(raw.modules))
      refuse('Actual qualification body or module custody differs');
    const observed = raw.referenceObservation;
    const preparation = observed.preparation;
    const phaseProjection = protocol
      .captured()
      .frames.filter((frame) => !['start', 'terminal'].includes(frame.phase))
      .map((frame) => ({ phase: frame.phase, ...frame.body }));
    const finalBody = received.get('final');
    const beforeFinal = { ...observed, phases: observed.phases?.slice(0, -1) };
    if (
      !isDeepStrictEqual(observed.phases, phaseProjection) ||
      !isDeepStrictEqual(observed.bootstrap, bindings.observation) ||
      !isDeepStrictEqual(observed.measurement, measurementCompletion) ||
      !isDeepStrictEqual(received.get('measurement-complete'), measurementCompletion) ||
      digest(serializeHttpRuntimePlainJson(preparation)) !==
        received.get('preparation-complete').evidenceSha256 ||
      digest(serializeHttpRuntimePlainJson(preparation.session)) !==
        received.get('ready').sessionEvidenceSha256 ||
      digest(serializeHttpRuntimePlainJson(observed.initialObjectSnapshot)) !==
        received.get('init').runtimeObjectSnapshotSha256 ||
      digest(serializeHttpRuntimePlainJson(beforeFinal)) !== finalBody.runtimeEvidenceSha256 ||
      digest(serializeHttpRuntimePlainJson(controls)) !== finalBody.sourceEvidenceSha256 ||
      digest(
        serializeHttpRuntimePlainJson({
          scope: 'worker-network-subset',
          network: observed.network,
          actualParentFixtureFinalVerification: 'REQUIRED',
        }),
      ) !== finalBody.fixtureFinalEvidenceSha256 ||
      !isDeepStrictEqual(raw.networkClosure, {
        closed: true,
        parentCorroborationRequired: true,
        readinessPromoting: false,
      })
    )
      refuse('Actual qualification phase/body evidence contradicts its exact raw bytes');
    if (
      !isDeepStrictEqual(observed.nestAppLink?.preparation, referenceNestPreparationBindings(state))
    )
      refuse('Qualification actual Nest preparation differs from parent source bindings');
    for (const row of [
      ...raw.modules.resolutions.filter((entry) => entry.builtin === false),
      ...raw.modules.evaluations,
    ])
      if (pathToFileURL(realpathSync(fileURLToPath(row.url))).href !== row.canonicalURL)
        refuse('Qualification module raw path differs from actual canonical source');
    compareRows(
      [generator.raw, generator.metrics],
      [
        readHttpQualificationArtifact(state.sandbox, resolve(state.sandbox, generator.raw.path))
          .row,
        readHttpQualificationArtifact(state.sandbox, resolve(state.sandbox, generator.metrics.path))
          .row,
      ],
    );
    assertReferenceNestPreparationOrder(
      raw.modules,
      referenceNestPreparationBindings(state),
      state.checkout,
    );
    recheck(state);
    compareRows(controls, qualificationControls(state));
    compareRows(supervisorControls, qualificationSupervisorControls(state));
    if (
      !readFileSync(descriptorPath).equals(descriptorBytes) ||
      !isDeepStrictEqual(declaration, snapshotFreshHttpQualificationCase(handle, options.caseId)) ||
      !isDeepStrictEqual(observedFixture, await observeOwnedReferenceFixture(fixture.handle))
    )
      refuse('Qualification final source/fixture drift');
    fixtureCleanup = await closeOwnedReferenceFixture(fixture.handle);
    if (failure || !fixtureCleanup?.complete)
      refuse('Qualification actual fixture cleanup or final deadline is incomplete');
    state.referenceFixture = undefined;
    artifacts.push(observedArtifact, generator.raw, generator.metrics);
    const report = {
      schemaVersion: 1,
      scope: job.mode,
      candidateCommit: state.candidateCommit,
      tree: state.inputs.tree,
      caseId: options.caseId,
      caseSha256: declaration.caseSha256,
      manifestSha256: declaration.manifestSha256,
      operationId,
      wire,
      workerCleanup,
      fixtureCleanup,
      artifacts,
      generator,
      actualPersistentOperationExecuted: true,
      blockedOn: [
        'independent-full-visibility-business-effects',
        'quota-timebase-and-population-proof',
        'listener-route-roster-reconciliation',
        'all-semantic-cases',
        'independent-exact-source-native-acceptance',
        'full-application-performance-profile',
      ],
      complete: false,
      runtimeCustodyComplete: false,
      performanceQualified: false,
      readinessPromoting: false,
    };
    const reportPath = resolve(directory, 'qualification-observation.json');
    const reportBytes = Buffer.from(serializeHttpRuntimePlainJson(report));
    if (reportBytes.length > 64 * 1024 * 1024)
      refuse('Qualification report exceeds retained private bound');
    writeFileSync(reportPath, reportBytes, { mode: 0o600, flag: 'wx' });
    retainQualificationArtifact(state, 'parent-report', reportPath);
    return structuredClone({ ...report, reportArtifact: byteRow(state.sandbox, reportPath) });
  } catch (error) {
    failure ??= 'HTTP_QUALIFICATION_OPERATION_INVALID';
    state.refusal = failure;
    reject();
    throw error;
  } finally {
    clearTimeout(deadline);
    clearTimeout(finalDeadline);
    try {
      await reapQualificationGenerator(state);
    } catch {
      state.refusal ??= 'HTTP_QUALIFICATION_GENERATOR_CLEANUP_INCOMPLETE';
    }
    try {
      await reapReferenceWorker(state);
    } catch {
      state.refusal ??= 'HTTP_QUALIFICATION_WORKER_CLEANUP_INCOMPLETE';
    }
    if (
      !state.referenceRuntimeWorker &&
      !state.qualificationGeneratorWorker &&
      state.referenceFixture === fixture
    ) {
      try {
        fixtureCleanup = await closeOwnedReferenceFixture(fixture.handle);
        if (fixtureCleanup?.complete) state.referenceFixture = undefined;
      } catch {
        state.refusal ??= 'HTTP_QUALIFICATION_FIXTURE_CLEANUP_INCOMPLETE';
      }
    }
    if (directory) {
      for (const [name, value] of [
        ['stdout.log', Buffer.concat(stdout)],
        ['stderr.log', Buffer.concat(stderr)],
        ['ipc.json', Buffer.from(serializeHttpRuntimePlainJson(protocol?.captured() ?? {}))],
        [
          'cleanup.json',
          Buffer.from(
            serializeHttpRuntimePlainJson({
              failure: failure ?? null,
              worker: state.referenceRuntimeWorker
                ? snapshotOwnedHttpWorker(state.referenceRuntimeWorker)
                : null,
              workerCleanup: state.referenceRuntimeWorkerCleanup ?? null,
              generator: state.qualificationGeneratorWorker
                ? snapshotOwnedHttpWorker(state.qualificationGeneratorWorker)
                : null,
              generatorCleanup: state.qualificationGeneratorCleanup ?? null,
              fixtureCleanup: fixtureCleanup ?? null,
              complete: false,
              readinessPromoting: false,
            }),
          ),
        ],
      ]) {
        try {
          writeFileSync(resolve(directory, name), value, { mode: 0o600, flag: 'wx' });
          const role = {
            'stdout.log': 'worker-stdout',
            'stderr.log': 'worker-stderr',
            'ipc.json': 'worker-ipc',
            'cleanup.json': 'cleanup',
          }[name];
          if (role === 'cleanup' && state.qualificationAttempt)
            state.qualificationAttempt.workerCleanupPath = resolve(directory, name);
          else if (role) retainQualificationArtifact(state, role, resolve(directory, name));
        } catch {
          state.refusal ??= 'HTTP_QUALIFICATION_CAPTURE_INCOMPLETE';
        }
      }
    }
    state.runtimeActive = false;
    if (!failure && state.refusal) refuse('Qualification cleanup/capture remains incomplete');
  }
}

function retainQualificationArtifact(state, role, path) {
  const attempt = state.qualificationAttempt;
  if (!attempt || attempt.sealed) return;
  owned(state.sandbox, path);
  const prior = attempt.paths.get(role);
  if (prior && prior !== path) refuse('Actual attempt role has contradictory artifact paths');
  attempt.paths.set(role, path);
}

function retainQualificationJson(state, role, value) {
  const attempt = state.qualificationAttempt;
  const path = resolve(attempt.directory, `${role}.json`);
  const bytes = Buffer.from(serializeHttpRuntimePlainJson(value));
  if (bytes.length > 64 * 1024 * 1024) refuse('Actual attempt diagnostic exceeds private bound');
  writeFileSync(path, bytes, { mode: 0o600, flag: 'wx', flush: true });
  retainQualificationArtifact(state, role, path);
}

async function cleanupQualificationAttempt(state) {
  const failures = [];
  for (const cleanup of [reapQualificationGenerator, reapReferenceWorker]) {
    try {
      await cleanup(state);
    } catch (error) {
      failures.push(error.code ?? 'HTTP_QUALIFICATION_CLEANUP_UNKNOWN');
    }
  }
  let fixtureCleanup = state.qualificationFixtureCleanup ?? null;
  if (state.referenceFixture) {
    try {
      fixtureCleanup = await closeOwnedReferenceFixture(state.referenceFixture.handle);
      state.qualificationFixtureCleanup = fixtureCleanup;
      if (fixtureCleanup?.complete === true) state.referenceFixture = undefined;
      else failures.push('HTTP_QUALIFICATION_FIXTURE_CLEANUP_UNKNOWN');
    } catch (error) {
      failures.push(error.code ?? 'HTTP_QUALIFICATION_FIXTURE_CLEANUP_UNKNOWN');
    }
  }
  const absent =
    failures.length === 0 &&
    !state.referenceRuntimeWorker &&
    !state.qualificationGeneratorWorker &&
    !state.referenceFixture &&
    !state.runtimeActive &&
    !state.fixturePreparing &&
    !state.fixtureChecking;
  return {
    worker: state.referenceRuntimeWorkerCleanup ?? null,
    generator: state.qualificationGeneratorCleanup ?? null,
    fixture: fixtureCleanup,
    failures,
    ownedResources: absent ? 'ABSENT' : 'UNKNOWN',
    readinessPromoting: false,
  };
}

function retainActualCleanupObservation(state, cleanup) {
  const attempt = state.qualificationAttempt ?? state.batchBuildRetention;
  const prefix = state.qualificationAttempt
    ? `attempts/${attempt.attemptId}`
    : `roots/${state.rootId}`;
  const observations = (attempt.cleanupObservations ??= []);
  const semanticSha256 = digest(serializeHttpRuntimePlainJson(cleanup));
  if (observations.at(-1)?.semanticSha256 !== semanticSha256) {
    const prior = observations.at(-1);
    const workerCapture =
      !prior && attempt.workerCleanupPath
        ? readHttpQualificationArtifact(state.sandbox, attempt.workerCleanupPath)
        : null;
    const bytes = Buffer.from(
      serializeHttpRuntimePlainJson({
        schemaVersion: 1,
        scope: 'actual-parent-owned-cleanup-observation',
        sequence: observations.length,
        previousObservationSha256: prior ? digest(prior.bytes) : null,
        cleanup,
        priorWorkerCapture: workerCapture
          ? { ...workerCapture.row, bytesBase64: workerCapture.bytes.toString('base64') }
          : null,
        readinessPromoting: false,
      }),
    );
    observations.push({ semanticSha256, bytes, ownedResources: cleanup.ownedResources });
  }
  // Retain every UNKNOWN body. Later actual absence appends a linked successor;
  // it never rewrites the archive's earlier cleanup observation or grants credit.
  for (const [sequence, observation] of observations.entries())
    observation.row = publishHttpQualificationBytes(
      attempt.store,
      `${prefix}/cleanup/${String(sequence).padStart(10, '0')}.json`,
      observation.bytes,
    );
  return observations.at(-1);
}

function retainActualBuildSupport(state) {
  const attempt = state.qualificationAttempt;
  const commandArtifacts = [];
  for (const [index, command] of state.commands.entries()) {
    for (const stream of ['stdout', 'stderr']) {
      const expected = command[stream];
      const acquired = readHttpQualificationArtifact(
        state.sandbox,
        resolve(state.sandbox, expected.path),
      );
      if (
        acquired.row.sha256 !== expected.sha256 ||
        acquired.row.byteLength !== expected.byteLength
      )
        refuse('Actual build command support differs from its retained producer identity');
      const row = publishHttpQualificationBytes(
        attempt.store,
        `attempts/${attempt.attemptId}/build-support/commands/${index}-${stream}`,
        acquired.bytes,
      );
      commandArtifacts.push({ commandIndex: index, stream, ...row });
    }
  }
  let snapshot = null;
  const snapshotPath = attempt.paths.get('build-custody');
  if (snapshotPath) {
    const acquired = readHttpQualificationArtifact(state.sandbox, snapshotPath);
    snapshot = publishHttpQualificationBytes(
      attempt.store,
      `attempts/${attempt.attemptId}/build-support/snapshot.json`,
      acquired.bytes,
    );
  }
  const row = publishHttpQualificationBytes(
    attempt.store,
    `attempts/${attempt.attemptId}/build-support/index.json`,
    Buffer.from(
      serializeHttpRuntimePlainJson({
        schemaVersion: 1,
        scope: 'actual-parent-owned-build-support',
        candidateCommit: state.candidateCommit,
        tree: state.inputs.tree,
        snapshot,
        commandArtifacts,
        remainingRawSupport: 'retained-private-sandbox-not-copied',
        retainedSandbox: state.sandbox,
        fullRawClosureCopied: false,
        readinessPromoting: false,
      }),
    ),
  );
  // Installed dependencies, toolchain and all raw compiler/source bodies remain
  // available in this private sandbox. No metadata hash authorizes its deletion.
  attempt.supportClosureComplete = false;
  return row;
}

/** Archive evidence from the actual private parent, including refused handles.
 * There are no caller rows, destinations, cleanup claims or acceptance fields.
 * Successful durable publication alone clears the private deletion interlock.
 */
export async function archiveFreshHttpQualificationAttempt(handle) {
  if (arguments.length !== 1) refuse('Attempt archival accepts one actual private build handle');
  const state = handles.get(handle);
  const attempt = state?.qualificationAttempt;
  if (!state || !attempt) refuse('No actual parent-owned attempt exists');
  if (state.runtimeActive || state.fixturePreparing || state.fixtureChecking)
    refuse('Attempt archival cannot race an active operation');
  if (attempt.archiving || state.cleanupPending)
    refuse('Attempt archival or cleanup is already active');
  attempt.archiving = true;
  try {
    const cleanup = await cleanupQualificationAttempt(state);
    retainActualCleanupObservation(state, cleanup);
    const buildSupport = retainActualBuildSupport(state);
    if (!attempt.paths.has('parent-report'))
      retainQualificationJson(state, 'parent-report', {
        candidateCommit: state.candidateCommit,
        tree: state.inputs.tree,
        case: attempt.case,
        refusal: attempt.failure ?? state.refusal ?? null,
        fullAcceptanceAvailable: false,
        readinessPromoting: false,
      });
    const artifacts = [];
    const sourcePaths = new Set();
    for (const role of attempt.roles) {
      if (role === 'cleanup') {
        artifacts.push({ role, ...attempt.cleanupObservations[0].row });
        continue;
      }
      if (role === 'build-custody') {
        artifacts.push({ role, ...buildSupport });
        continue;
      }
      const path = attempt.paths.get(role);
      if (!path) continue;
      if (sourcePaths.has(path)) refuse('Attempt artifact paths are duplicated');
      sourcePaths.add(path);
      // A missing body on an interrupted path is absent evidence, not an empty file.
      try {
        lstatSync(path);
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const acquired = readHttpQualificationArtifact(state.sandbox, path);
      const row = publishHttpQualificationBytes(
        attempt.store,
        `attempts/${attempt.attemptId}/artifacts/${role}`,
        acquired.bytes,
      );
      artifacts.push({ role, ...row });
    }
    const terminal =
      attempt.cleanupObservations[0].ownedResources !== 'ABSENT'
        ? 'CLEANUP_UNKNOWN'
        : attempt.failure
          ? 'FAILED'
          : 'BLOCKED';
    // No full trusted case verifier is installed. Component flags cannot mint
    // QUALIFIED, even if the measured worker happened to return successfully.
    const archive = {
      schemaVersion: '1.0.0',
      kind: 'http-qualification-attempt-archive',
      batchId: attempt.batchId,
      attemptId: attempt.attemptId,
      binding: attempt.binding,
      case: attempt.case,
      state: terminal,
      artifacts,
      cleanupState: attempt.cleanupObservations[0].ownedResources,
      acceptance: null,
      readinessPromoting: false,
    };
    const row = publishHttpQualificationBytes(
      attempt.store,
      `attempts/${attempt.attemptId}/archive.json`,
      Buffer.from(serializeHttpRuntimePlainJson(archive)),
    );
    attempt.archive = {
      ...archive,
      archiveSha256: row.sha256,
      latestActualCleanupArtifact: attempt.cleanupObservations.at(-1).row,
    };
    attempt.sealed = true;
    return structuredClone(attempt.archive);
  } finally {
    attempt.archiving = false;
  }
}

async function runParentQualificationAttempt(handle, context, caseRow, attemptId) {
  const state = stateFor(handle);
  if (state.qualificationAttempt && !state.qualificationAttempt.sealed)
    refuse('Prior actual attempt remains unsealed');
  // Set the interlock BEFORE directory/fixture/runtime effects. Only the parent
  // archive operation above can clear it; no caller acknowledgment exists.
  state.qualificationAttempt = {
    ...context,
    attemptId,
    case: {
      caseId: caseRow.caseId,
      caseSha256: caseRow.caseSha256,
      compositionId: caseRow.compositionId,
    },
    directory: resolve(state.sandbox, 'qualification-attempts', attemptId),
    paths: new Map(),
    sealed: false,
  };
  try {
    mkdirSync(state.qualificationAttempt.directory, { recursive: true, mode: 0o700 });
    retainQualificationJson(state, 'build-custody', snapshotFreshHttpBuild(handle));
    // All admission/control checks precede the fresh fixture's first effect.
    const declaration = snapshotFreshHttpQualificationCase(handle, caseRow.caseId);
    assertLivenessQualificationDeclaration(declaration);
    qualificationExecutable(state);
    qualificationControls(state);
    qualificationSupervisorControls(state);
    retainQualificationJson(state, 'fixture', await prepareFreshHttpReferenceFixture(handle));
    await qualifyFreshHttpEndpoint(handle, { caseId: caseRow.caseId });
  } catch (error) {
    state.qualificationAttempt.failure = error.code ?? 'HTTP_QUALIFICATION_ATTEMPT_FAILED';
  }
  return archiveFreshHttpQualificationAttempt(handle);
}

/** Fixed production batch entry. No caller roster, receipt, environment, output
 * directory, saved PID or resume ledger is accepted as authority.
 */
export async function runFreshHttpQualificationBatch() {
  if (arguments.length !== 0) refuse('HTTP batch entry accepts no caller configuration');
  const sourceRepository = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
  const git = (...args) =>
    execFileSync('/usr/bin/git', ['--no-pager', '-C', sourceRepository, ...args], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: '/var/empty',
        LANG: 'C',
        LC_ALL: 'C',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_TERMINAL_PROMPT: '0',
      },
    }).trim();
  const candidateCommit = git('rev-parse', '--verify', 'HEAD');
  const tree = git('rev-parse', '--verify', 'HEAD^{tree}');
  if (!/^[a-f0-9]{40}$/u.test(candidateCommit) || !/^[a-f0-9]{40}$/u.test(tree))
    refuse('Actual batch candidate identity is invalid');
  if (git('status', '--porcelain', '--untracked-files=no'))
    refuse('Batch candidate has tracked checkout changes');
  const acquireDeclaration = (path, expected) => {
    const acquired = readHttpQualificationDeclaration(
      sourceRepository,
      resolve(sourceRepository, path),
    );
    if (expected && acquired.row.sha256 !== expected) refuse(`Batch declaration differs: ${path}`);
    return acquired;
  };
  const policyBytes = acquireDeclaration(
    'law/policy/http-qualification-batch.json',
    'fbdce4f9f1ff3e206158f7a2d2c8ce9059ccfb95262fe54c26839ea8f11e0c65',
  );
  const policy = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(policyBytes.bytes));
  const manifest = acquireDeclaration(policy.manifest.path, policy.manifest.sha256);
  const schema = acquireDeclaration(policy.evidenceSchema.path, policy.evidenceSchema.sha256);
  // Observe the complete tracked producer subtree, not a caller-selected subset.
  // This binds bytes; it does not imply independent admission of those bytes.
  const producerRows = git('ls-files', '-z', '--', 'scripts')
    .split('\0')
    .filter(Boolean)
    .map((path) => {
      const bytes = execFileSync(
        '/usr/bin/git',
        ['--no-pager', '-C', sourceRepository, 'show', `${candidateCommit}:${path}`],
        {
          maxBuffer: 1024 * 1024,
          env: {
            PATH: '/usr/bin:/bin',
            HOME: '/var/empty',
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_NO_REPLACE_OBJECTS: '1',
          },
        },
      );
      return { path, sha256: digest(bytes), byteLength: bytes.length };
    });
  if (
    git('rev-parse', '--verify', 'HEAD') !== candidateCommit ||
    git('status', '--porcelain', '--untracked-files=no')
  )
    refuse('Batch candidate changed while binding producer bytes');
  const binding = {
    candidateCommit,
    tree,
    manifestSha256: manifest.row.sha256,
    batchPolicySha256: policyBytes.row.sha256,
    evidenceSchemaSha256: schema.row.sha256,
    producerClosureSha256: digest(serializeHttpRuntimePlainJson(producerRows)),
  };
  const store = createHttpQualificationStore();
  const batchId = randomUUID();
  let sequence = 0,
    journalHeadSha256 = null;
  const publishJson = (path, value) =>
    publishHttpQualificationBytes(store, path, Buffer.from(serializeHttpRuntimePlainJson(value)));
  const journal = (event, selectors = {}) => {
    const body = {
      schemaVersion: '1.0.0',
      kind: 'http-qualification-journal-event',
      batchId,
      sequence,
      previousSha256: journalHeadSha256,
      bindingSha256: digest(serializeHttpRuntimePlainJson(binding)),
      event,
      compositionId: null,
      caseId: null,
      attemptId: null,
      archiveSha256: null,
      state: null,
      ...selectors,
      timestampUtc: new Date().toISOString(),
      readinessPromoting: false,
    };
    const row = publishJson(`journal/${String(sequence).padStart(10, '0')}.json`, body);
    journalHeadSha256 = row.sha256;
    sequence++;
  };
  // The first durable event precedes any fresh build or fixture operation.
  journal('BEGIN', { state: 'RUNNING' });
  publishHttpQualificationBytes(store, 'declarations/manifest.json', manifest.bytes);
  publishHttpQualificationBytes(store, 'declarations/batch-policy.json', policyBytes.bytes);
  publishHttpQualificationBytes(store, 'declarations/evidence-schema.json', schema.bytes);
  publishJson('producer-closure.json', producerRows);
  let roster;
  const attempts = [];
  const originalProfiles = policy.originalProfiles.scenarios.map((scenario) => ({
    scenario,
    state: 'PENDING',
    evidenceSha256: null,
  }));
  const index = (phase, verdict) => {
    if (!roster) return null; // Never fabricate a planned population after validation refuses.
    return publishJson('index.json', {
      schemaVersion: '1.0.0',
      kind: 'http-qualification-batch-index',
      batchId,
      binding,
      phase,
      plannedCases: roster.cases.map(({ caseId, caseSha256, compositionId }) => ({
        caseId,
        caseSha256,
        compositionId,
      })),
      attempts,
      originalProfiles,
      journalHeadSha256,
      overallVerdict: verdict,
      complete: false,
      readinessPromoting: false,
    });
  };
  let activeHandle;
  let buildStarted = false;
  try {
    roster = loadHttpQualificationRoster(sourceRepository);
    // Closed source admission is checked before even the composition build. The
    // build's own retained roster/control checks repeat after acquisition.
    const unfilled = Object.entries(qualificationAdmission)
      .filter(([, value]) => typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value))
      .map(([name]) => name);
    if (unfilled.length) {
      const error = new Error('HTTP qualification admission floors remain unfilled');
      error.code = 'HTTP_QUALIFICATION_ADMISSION_UNBOUND';
      error.unfilled = unfilled;
      throw error;
    }
    const context = { store, batchId, binding, roles: policy.archives.roles };
    for (const compositionId of roster.compositionOrder) {
      journal('ROOT_BEGIN', { compositionId, state: 'RUNNING' });
      buildStarted = true;
      activeHandle = await prepareFreshHttpBuild({
        sourceRepository,
        candidateCommit,
        rootId: compositionId,
      });
      // Build-level custody exists before roster selection or case allocation.
      // A later pre-case refusal must not prune uncopied build diagnostics.
      handles.get(activeHandle).batchBuildRetention = { store, batchId, binding };
      const retained = snapshotFreshHttpQualificationRoster(activeHandle);
      if (
        retained.candidateCommit !== candidateCommit ||
        retained.tree !== tree ||
        !isDeepStrictEqual(retained.cases, roster.cases) ||
        !isDeepStrictEqual(retained.files, roster.files)
      )
        refuse('Actual private build roster differs from complete batch selection');
      for (const caseRow of roster.cases.filter((row) => row.compositionId === compositionId)) {
        const attemptId = randomUUID();
        journal('CASE_BEGIN', {
          compositionId,
          caseId: caseRow.caseId,
          attemptId,
          state: 'RUNNING',
        });
        const retainedAttempt = {
          attemptId,
          case: {
            caseId: caseRow.caseId,
            caseSha256: caseRow.caseSha256,
            compositionId: caseRow.compositionId,
          },
          state: 'RUNNING',
          archiveSha256: null,
          acceptance: null,
        };
        // Retain the attempt before effects, including an archive refusal that
        // never reaches CASE_SEALED. A failed publication cannot erase its ID.
        attempts.push(retainedAttempt);
        const archive = await runParentQualificationAttempt(
          activeHandle,
          context,
          caseRow,
          attemptId,
        );
        Object.assign(retainedAttempt, {
          state: archive.state,
          archiveSha256: archive.archiveSha256,
          acceptance: archive.acceptance,
        });
        journal('CASE_SEALED', {
          compositionId,
          caseId: caseRow.caseId,
          attemptId,
          archiveSha256: archive.archiveSha256,
          state: archive.state,
        });
        // No component-only result or historical success can bypass this stop.
        if (archive.state !== 'QUALIFIED') {
          const error = new Error('Actual case lacks full independently admitted acceptance');
          error.code = archive.state;
          throw error;
        }
      }
      await closeFreshHttpBuild(activeHandle);
      activeHandle = undefined;
      const cleanup = publishJson(`roots/${compositionId}/cleanup.json`, {
        compositionId,
        ownedResources: 'ABSENT',
        readinessPromoting: false,
      });
      journal('ROOT_CLOSED', { compositionId, archiveSha256: cleanup.sha256, state: 'QUALIFIED' });
    }
    // The four original workloads require their separate fresh owned launcher;
    // the ambient helper's exit code cannot supply any of these gate results.
    for (const profile of originalProfiles) profile.state = 'BLOCKED';
    const error = new Error(
      'Original fresh owned-stack profile launcher is not independently admitted',
    );
    error.code = 'HTTP_ORIGINAL_PROFILE_LAUNCHER_UNBOUND';
    throw error;
  } catch (error) {
    let cleanupUnknown = false;
    const failedBuild = failedBuilds.get(error);
    if (failedBuild) {
      // Only this producer's privately retained failed state supplies paths.
      // Public error.diagnosticDirectory is never a file-selection capability.
      const bodies = [resolve(failedBuild.sandbox, 'failure.json')];
      for (const command of failedBuild.commands)
        for (const stream of ['stdout', 'stderr'])
          bodies.push(resolve(failedBuild.sandbox, command[stream].path));
      for (const path of bodies) {
        const acquired = readHttpQualificationArtifact(failedBuild.sandbox, path);
        publishHttpQualificationBytes(store, `failed-build/${acquired.row.path}`, acquired.bytes);
      }
      // Old build-command close receipts alone do not prove descendant absence.
      cleanupUnknown = true;
    }
    if (activeHandle) {
      try {
        await closeFreshHttpBuild(activeHandle);
      } catch (cleanupError) {
        const state = handles.get(activeHandle);
        // A sealed archive failure retains sandbox bytes even after actual
        // resources are absent; this is distinct from unknown process cleanup.
        cleanupUnknown = Boolean(
          state?.referenceRuntimeWorker ||
          state?.qualificationGeneratorWorker ||
          state?.referenceFixture,
        );
        publishJson('cleanup-refusal.json', {
          code: cleanupError.code ?? 'HTTP_CLEANUP_REFUSED',
          sandboxRetained: true,
          ownedResources: cleanupUnknown ? 'UNKNOWN' : 'ABSENT',
          readinessPromoting: false,
        });
      }
    }
    const diagnostic = publishJson('failure.json', {
      code: error.code ?? 'HTTP_QUALIFICATION_BATCH_FAILED',
      unfilled: error.unfilled ?? [],
      admittedRosterAvailable: Boolean(roster),
      buildStarted,
      retainedBuildSandbox: failedBuild?.sandbox ?? handles.get(activeHandle)?.sandbox ?? null,
      rawBuildSupportFullyCopied: false,
      trustedRestartCreditAvailable: false,
      readinessPromoting: false,
    });
    for (const attempt of attempts)
      if (attempt.state === 'RUNNING')
        attempt.state = cleanupUnknown ? 'CLEANUP_UNKNOWN' : 'BLOCKED';
    journal('STOP', { state: cleanupUnknown ? 'CLEANUP_UNKNOWN' : 'BLOCKED' });
    const finalIndex = index('BLOCKED', 'BLOCKED');
    return {
      schemaVersion: 1,
      scope: 'private-serial-http-qualification-batch',
      batchId,
      binding,
      archiveDirectory: snapshotHttpQualificationStore(store).root,
      diagnosticSha256: diagnostic.sha256,
      indexSha256: finalIndex?.sha256 ?? null,
      admittedRosterAvailable: Boolean(roster),
      attemptedCases: attempts.length,
      overallVerdict: 'BLOCKED',
      complete: false,
      readinessPromoting: false,
    };
  }
}

export async function closeFreshHttpBuild(handle) {
  const state = handles.get(handle);
  if (!state) refuse('Unknown fresh build handle');
  if (
    state.runtimeActive ||
    state.fixturePreparing ||
    state.fixtureChecking ||
    state.qualificationAttempt?.archiving
  )
    refuse('Cannot close a build while its runtime or fixture operation is active');
  if (state.cleanupComplete) return;
  if (state.cleanupPending) return state.cleanupPending;
  state.closed = true;
  state.cleanupComplete = false;
  const pending = (async () => {
    // This check precedes every fixture/sandbox deletion and is resumable even
    // for a closed/refused build. Unknown child/group state preserves evidence.
    const cleanup = await cleanupQualificationAttempt(state);
    if (state.qualificationAttempt || state.batchBuildRetention)
      retainActualCleanupObservation(state, cleanup);
    if (cleanup.ownedResources !== 'ABSENT') refuse('Actual owned build cleanup remains unknown');
    if (state.qualificationAttempt && !state.qualificationAttempt.sealed)
      refuse('Actual attempt archive remains unsealed; owned cleanup ran but sandbox is retained');
    if (state.qualificationAttempt && state.qualificationAttempt.supportClosureComplete !== true)
      refuse('Complete raw build support was not copied; the actual private sandbox is retained');
    if (state.batchBuildRetention)
      refuse('Batch build raw custody remains in the retained private sandbox');
    await rm(state.sandbox, { recursive: true, force: true });
    state.cleanupComplete = true;
  })();
  state.cleanupPending = pending;
  try {
    await pending;
  } finally {
    if (state.cleanupPending === pending) state.cleanupPending = undefined;
  }
}
