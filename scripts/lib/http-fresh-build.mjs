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
import { createHttpRuntimeProtocol } from './http-runtime-protocol.mjs';
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

const handles = new WeakMap();
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
    values.rootId !== 'reference'
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
    // Failed local preparation owns no reusable handle. Keep only sanitized
    // diagnostics outside the checkout; never clean a caller's source tree.
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
    await rm(state.checkout, { recursive: true, force: true });
    await rm(resolve(sandbox, 'store'), { recursive: true, force: true });
    await rm(resolve(sandbox, 'toolchain'), { recursive: true, force: true });
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
  [
    'scripts/lib/http-runtime-worker.mjs',
    '765cef732599229b8b9aa95a9faa4534c89b81b367aa52e44219286a5c6092c9',
  ],
  [
    'scripts/lib/http-module-custody.mjs',
    'ed2db24cbf2b24dcfec82a311aa046e86b2109bab855c75e582f13de9a8358f0',
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
  const sha256 = 'a873fe3dffb385c88393c735679a6372e6070471c2a560631beeffaaa835c0c4';
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
  const sourcePath = 'reference/api/src/bootstrap.ts';
  const outputPath = 'reference/api/dist/reference/api/src/bootstrap.js';
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
    scope: job.mode,
    compositionId: 'reference',
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
    observation,
    trustedBootstrap: job.controls.filter((row) =>
      ['scripts/lib/http-runtime-worker.mjs', 'scripts/lib/http-module-custody.mjs'].includes(
        row.path,
      ),
    ),
    optionalProbes,
    requiredEvaluationURLs: [
      'scripts/lib/http-runtime-census.mjs',
      'scripts/lib/http-runtime-bindings.mjs',
      job.bootstrap.emitted.path,
    ].map((path) => pathToFileURL(resolve(state.checkout, path)).href),
  };
}

/**
 * Launch the only currently supported, secret-free runtime diagnostic.
 * It observes the real bootstrap module export without invoking AppModule.
 * There is no caller configuration, target URL, factory, receipt or fixture.
 */
export async function observeFreshHttpReferenceBootstrap(handle) {
  if (arguments.length !== 1) refuse('Runtime diagnostic accepts exactly one private handle');
  const state = stateFor(handle);
  if (state.runtimeActive) refuse('A runtime observation already owns this build');
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
    if (state.rootId !== 'reference') refuse('Unsupported runtime composition');
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
      compositionId: 'reference',
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
      compositionId: 'reference',
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

export async function closeFreshHttpBuild(handle) {
  const state = handles.get(handle);
  if (!state) refuse('Unknown fresh build handle');
  if (state.runtimeActive) refuse('Cannot close a build while its runtime worker is active');
  if (state.cleanupComplete) return;
  state.closed = true;
  await rm(state.sandbox, { recursive: true, force: true });
  state.cleanupComplete = true;
}
