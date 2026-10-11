import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  closeSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, types } from 'node:util';

// First finite local recipe. These identities grant no build/process custody.
// The supervisor must bind an actually created opaque handle to its live build.
const handles = new WeakMap();
// Failed creation returns no handle: retain unresolved launch custody explicitly.
const incompleteCleanups = new Set();
const digest = (value) => createHash('sha256').update(value).digest('hex');
const pgDirectory = '/Applications/Postgres.app/Contents/Versions/18/bin';
const tools = Object.freeze({
  postgres: [
    join(pgDirectory, 'postgres'),
    'e5ced2a1cf0375859196ccd15172bcbdf263c6b4fde5a83da93a92d67d63732c',
  ],
  initdb: [
    join(pgDirectory, 'initdb'),
    'd103626d91c90af601aa1e8356b383b983cbac000e3310d6c3e951db54e7337a',
  ],
  psql: [
    join(pgDirectory, 'psql'),
    '6118e2b9d262ea230c5401382a2ff795c65ae87e99d06418a9a979075cd41591',
  ],
  docker: [
    '/opt/homebrew/Cellar/docker/29.7.2/bin/docker',
    'adb33a6b552536d8219b2d8c32f3c44def98058e76e97c8031498471c8dfdac8',
  ],
});
const dockerEndpoint = 'unix:///var/run/docker.sock';
const dockerEndpointSha256 = '13c4025c96f36e94b3481db3214765a35981f4e484bc53b1524d51c1ecaad5c6';
const daemonIdentity = Object.freeze({
  ID: 'WDUG:XVLU:7HEV:M23I:EVTL:6E2V:ECP3:M42E:LQON:JDBJ:WYT7:EHYF',
  ServerVersion: '20.10.11',
  OSType: 'linux',
  Architecture: 'aarch64',
  DockerRootDir: '/var/lib/docker',
});
const redisImage = 'redis@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf';
const redisImageId = 'sha256:9a56851f1a97e0586f85f8d7f7652e65cb589b2409d965c5d6e275dfc2551907';
const rolesSqlPath = fileURLToPath(
  new URL('../../packages/data/migrations/platform/0001_roles.sql', import.meta.url),
);
const rolesSqlSha256 = '626a77418b483b87077fdfd4c24140c2f7018ad615acfa81100c468bfe7bd2c6';

function refuse(stage) {
  const error = new Error('Owned reference fixture did not complete its fixed lifecycle');
  error.code = `HTTP_REFERENCE_FIXTURE_${stage}`;
  throw error;
}

function verifyTool(name) {
  if (
    process.platform !== 'darwin' ||
    process.arch !== 'arm64' ||
    process.versions.node !== '24.20.0'
  )
    refuse('HOST');
  const [path, sha256] = tools[name];
  if (
    !lstatSync(path).isFile() ||
    realpathSync(path) !== path ||
    digest(readFileSync(path)) !== sha256
  )
    refuse('TOOL_IDENTITY');
}

function verifyTools() {
  for (const name of Object.keys(tools)) verifyTool(name);
  if (
    digest(dockerEndpoint) !== dockerEndpointSha256 ||
    !lstatSync(rolesSqlPath).isFile() ||
    realpathSync(rolesSqlPath) !== rolesSqlPath ||
    digest(readFileSync(rolesSqlPath)) !== rolesSqlSha256
  )
    refuse('RECIPE_IDENTITY');
}

function stateFor(handle) {
  const state = handles.get(handle);
  if (!state || state.closed || !state.ready) refuse('HANDLE');
  return state;
}

function commandEnvironment(state, password) {
  return {
    HOME: state.directory,
    TMPDIR: state.directory,
    PATH: pgDirectory,
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    ...(password === undefined ? {} : { PGPASSWORD: password }),
  };
}

// Internal fixed commands only; no exported arbitrary-command/callback seam.
function run(state, tool, args, input = '', password) {
  verifyTool(tool);
  const remaining =
    (state.cleanupDeadline ?? state.verificationDeadline ?? state.setupDeadline) - Date.now();
  if (remaining <= 0) refuse('DEADLINE');
  return new Promise((accept, reject) => {
    const child = spawn(tools[tool][0], args, {
      cwd: state.directory,
      env: commandEnvironment(state, password),
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const record = { child, exited: false, closed: false };
    child.once('exit', () => {
      record.exited = true;
    });
    state.pendingCommands.add(record);
    let size = 0,
      failed = false,
      settled = false,
      reapTimer;
    const output = [];
    const rejectFixed = () => {
      if (settled) return;
      settled = true;
      const error = new Error('Fixed fixture command refused');
      error.code = 'HTTP_REFERENCE_FIXTURE_COMMAND';
      reject(error);
    };
    const terminate = () => {
      failed = true;
      try {
        signalLiveChild(record, 'SIGKILL');
      } catch {
        /* retained for cleanup */
      }
      reapTimer ??= setTimeout(rejectFixed, 2000);
    };
    const timer = setTimeout(terminate, Math.min(30_000, remaining));
    child.stdout.on('data', (bytes) => {
      size += bytes.length;
      if (size > 1024 * 1024) terminate();
      else if (!settled) output.push(bytes);
    });
    child.stderr.on('data', (bytes) => {
      size += bytes.length;
      if (size > 1024 * 1024) terminate();
    });
    child.on('error', () => {
      failed = true;
    });
    child.stdin.on('error', () => {
      failed = true;
    });
    record.exit = new Promise((exited) =>
      child.on('close', (code, signal) => {
        record.exited = true;
        record.closed = true;
        clearTimeout(timer);
        clearTimeout(reapTimer);
        try {
          if (ownedGroupAbsent(record)) state.pendingCommands.delete(record);
          else failed = true;
        } catch {
          failed = true;
        }
        exited();
        if (settled) return;
        if (failed || code !== 0 || signal !== null) rejectFixed();
        else {
          settled = true;
          accept(Buffer.concat(output).toString('utf8').trim());
        }
      }),
    );
    child.stdin.end(input);
  });
}

// A numeric PGID is never sufficient authority to signal a process group.
// After leader exit only absence can discharge the retained launch obligation.
function ownedGroupAbsent(record) {
  if (!record.child.pid) return record.closed;
  try {
    process.kill(-record.child.pid, 0);
    return false;
  } catch (error) {
    if (error.code === 'ESRCH') return record.closed;
    throw error;
  }
}

function signalLiveChild(record, signal) {
  if (
    record.exited ||
    record.closed ||
    !record.child.pid ||
    record.child.exitCode !== null ||
    record.child.signalCode !== null
  )
    return false;
  // Use the retained native ChildProcess, never a bare PID/PGID signal.
  return record.child.kill(signal);
}

async function stopOwnedGroup(record, deadline) {
  if (ownedGroupAbsent(record)) return true;
  const wait = async (milliseconds) => {
    let timer;
    try {
      await Promise.race([
        record.exit,
        new Promise((accept) => {
          timer = setTimeout(accept, Math.max(0, Math.min(milliseconds, deadline - Date.now())));
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  signalLiveChild(record, 'SIGTERM');
  if (!record.closed) await wait(10_000);
  if (ownedGroupAbsent(record)) return true;
  signalLiveChild(record, 'SIGKILL');
  if (!record.closed) await wait(2000);
  for (let i = 0; i < 20 && Date.now() < deadline; i++) {
    if (ownedGroupAbsent(record)) return true;
    await new Promise((accept) => setTimeout(accept, 50));
  }
  return false;
}

const docker = (state, args, input) =>
  run(
    state,
    'docker',
    ['--host', dockerEndpoint, '--config', join(state.directory, 'docker-config'), ...args],
    input,
  );

function sql(state, login, text, database = state.database) {
  return run(
    state,
    'psql',
    [
      '-X',
      '-q',
      '-A',
      '-t',
      '--set',
      'ON_ERROR_STOP=1',
      '--host',
      '127.0.0.1',
      '--port',
      String(state.pgPort),
      '--username',
      login,
      '--dbname',
      database,
    ],
    text,
    state.passwords[login],
  );
}

async function availableLoopbackPort() {
  const server = createServer();
  return new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : accept(address.port)));
    });
  });
}

async function verifyDaemon(state) {
  const info = JSON.parse(await docker(state, ['info', '--format', '{{json .}}']));
  if (
    !isDeepStrictEqual(
      Object.fromEntries(Object.keys(daemonIdentity).map((key) => [key, info[key]])),
      daemonIdentity,
    )
  )
    refuse('DAEMON_IDENTITY');
}

async function verifyImage(state) {
  const rows = JSON.parse(await docker(state, ['image', 'inspect', redisImage]));
  if (
    rows.length !== 1 ||
    rows[0].Id !== redisImageId ||
    rows[0].Os !== 'linux' ||
    rows[0].Architecture !== 'arm64' ||
    !rows[0].RepoDigests?.includes(redisImage)
  )
    refuse('IMAGE_IDENTITY');
  const labels = rows[0].Config.Labels ?? {};
  if (
    typeof labels !== 'object' ||
    Array.isArray(labels) ||
    !Object.values(labels).every((value) => typeof value === 'string')
  )
    refuse('IMAGE_LABELS');
  const expected = { ...labels, ...state.redisLabels };
  if (state.containerLabels && !isDeepStrictEqual(state.containerLabels, expected))
    refuse('IMAGE_LABELS');
  state.containerLabels = expected;
  state.imageEnvironment ??= rows[0].Config.Env;
  if (!isDeepStrictEqual(state.imageEnvironment, rows[0].Config.Env)) refuse('IMAGE_ENVIRONMENT');
}

async function inspectRedis(state, running) {
  const rows = JSON.parse(await docker(state, ['container', 'inspect', state.redisId]));
  const row = rows[0];
  if (
    rows.length !== 1 ||
    row.Id !== state.redisId ||
    row.Image !== redisImageId ||
    row.Config.Image !== redisImage ||
    !isDeepStrictEqual(row.Config.Cmd, ['redis-server', '/usr/local/etc/redis/redis.conf']) ||
    !isDeepStrictEqual(row.Config.Labels, state.containerLabels) ||
    !isDeepStrictEqual(row.Config.Env, state.imageEnvironment) ||
    row.Config.User !== `${process.getuid()}:${process.getgid()}` ||
    row.HostConfig.NetworkMode !== 'bridge' ||
    row.HostConfig.ReadonlyRootfs !== true ||
    row.State.Running !== running ||
    !isDeepStrictEqual(row.HostConfig.Tmpfs, { '/data': state.redisTmpfs }) ||
    !Array.isArray(row.Mounts) ||
    row.Mounts.filter((mount) => mount.Type === 'bind').length !== 1 ||
    row.Mounts.some(
      (mount) =>
        mount.Type !== 'bind' &&
        !(mount.Type === 'tmpfs' && mount.Destination === '/data' && mount.RW === true),
    ) ||
    row.Mounts.filter((mount) => mount.Type === 'tmpfs').length > 1 ||
    row.Mounts.find((mount) => mount.Type === 'bind').Source !== state.redisConfig ||
    row.Mounts.find((mount) => mount.Type === 'bind').Destination !==
      '/usr/local/etc/redis/redis.conf' ||
    row.Mounts.find((mount) => mount.Type === 'bind').RW !== false
  )
    refuse('CONTAINER_IDENTITY');
  const ports = row.NetworkSettings.Ports?.['6379/tcp'];
  if (running) {
    if (
      !Array.isArray(ports) ||
      ports.length !== 1 ||
      ports[0].HostIp !== '127.0.0.1' ||
      !/^[1-9][0-9]*$/u.test(ports[0].HostPort) ||
      Number(ports[0].HostPort) > 65535
    )
      refuse('REDIS_PORT');
    if (state.redisPort && state.redisPort !== Number(ports[0].HostPort)) refuse('REDIS_PORT');
    state.redisPort = Number(ports[0].HostPort);
  }
}

async function verifyRedisConfiguration(state) {
  const file = lstatSync(state.redisConfig);
  if (
    !file.isFile() ||
    realpathSync(state.redisConfig) !== state.redisConfig ||
    (file.mode & 0o777) !== 0o600 ||
    file.uid !== process.getuid() ||
    file.gid !== process.getgid() ||
    file.dev !== state.redisConfigIdentity.device ||
    file.ino !== state.redisConfigIdentity.inode ||
    digest(readFileSync(state.redisConfig)) !== state.redisConfigIdentity.sha256
  )
    refuse('REDIS_CONFIG_IDENTITY');
  const status = await docker(state, ['exec', state.redisId, 'cat', '/proc/1/status']);
  for (const [name, expected] of [
    ['Uid', process.getuid()],
    ['Gid', process.getgid()],
  ]) {
    const values = new RegExp(`^${name}:\\s+([0-9]+)\\s+([0-9]+)\\s+([0-9]+)\\s+([0-9]+)$`, 'mu')
      .exec(status)
      ?.slice(1);
    if (!values || !values.every((value) => Number(value) === expected))
      refuse('REDIS_PROCESS_ACTOR');
  }
}

async function redisIdentity(state) {
  const result = await docker(
    state,
    ['exec', '--interactive', state.redisId, 'redis-cli', '--raw'],
    `AUTH ${state.redisPassword}\nINFO server\nQUIT\n`,
  );
  if (!result.startsWith('OK\n') && !result.startsWith('OK\r\n')) refuse('REDIS_AUTH');
  const version = /(?:^|\n)redis_version:(7\.[0-9]+\.[0-9]+)\r?$/mu.exec(result)?.[1];
  const runId = /(?:^|\n)run_id:([a-f0-9]{40})\r?$/mu.exec(result)?.[1];
  if (!version || !runId) refuse('REDIS_IDENTITY');
  return { version, runId };
}

async function postgresIdentity(state) {
  if (
    !state.postgres?.pid ||
    state.postgres.exitCode !== null ||
    state.postgres.signalCode !== null ||
    state.pgExited
  )
    refuse('POSTGRES_PROCESS');
  const pid = readFileSync(join(state.dataDirectory, 'postmaster.pid'), 'utf8').split('\n')[0];
  if (pid !== String(state.postgres.pid)) refuse('POSTGRES_PID');
  const identity = JSON.parse(
    await sql(
      state,
      'stynx_http_admin',
      `select json_build_object(
    'directory', current_setting('data_directory'), 'version', current_setting('server_version_num'),
    'versionString', current_setting('server_version'),
    'systemIdentifier', (select system_identifier::text from pg_control_system()));`,
      'postgres',
    ),
  );
  if (
    identity.directory !== state.dataDirectory ||
    identity.version !== '180002' ||
    !/^[0-9]+$/u.test(identity.systemIdentifier)
  )
    refuse('POSTGRES_IDENTITY');
  return identity;
}

async function roleIdentities(state) {
  const rows = [];
  for (const login of ['stynx_owner', 'stynx_app', 'stynx_reader']) {
    const row = JSON.parse(
      await sql(
        state,
        login,
        `select json_build_object(
      'currentUser', current_user, 'sessionUser', session_user, 'superuser', rolsuper,
      'inherit', rolinherit, 'bypassRls', rolbypassrls, 'login', rolcanlogin)
      from pg_catalog.pg_roles where rolname=current_user;`,
      ),
    );
    if (
      row.currentUser !== login ||
      row.sessionUser !== login ||
      row.superuser !== false ||
      row.inherit !== false ||
      row.login !== true ||
      row.bypassRls !== (login === 'stynx_owner')
    )
      refuse('ROLE_IDENTITY');
    rows.push(row);
  }
  return rows;
}

async function verifyResources(state) {
  if (state.closed) refuse('HANDLE');
  state.verificationDeadline = Date.now() + 30_000;
  verifyTools();
  const root = lstatSync(state.directory);
  if (
    !root.isDirectory() ||
    realpathSync(state.directory) !== state.directory ||
    root.dev !== state.rootDevice ||
    root.ino !== state.rootInode ||
    (root.mode & 0o777) !== 0o700
  )
    refuse('DIRECTORY_IDENTITY');
  await verifyDaemon(state);
  await verifyImage(state);
  await inspectRedis(state, true);
  await verifyRedisConfiguration(state);
  if (
    !isDeepStrictEqual(await redisIdentity(state), state.redisIdentity) ||
    !isDeepStrictEqual(await postgresIdentity(state), state.postgresIdentity) ||
    !isDeepStrictEqual(await roleIdentities(state), state.roles)
  )
    refuse('FINAL_RESOURCE_IDENTITY');
  if (state.closed) refuse('HANDLE');
}

async function cleanup(state) {
  if (state.closed) {
    if (!state.cleanup?.complete) refuse('CLEANUP');
    return structuredClone(state.cleanup);
  }
  state.closed = true;
  state.cleanupDeadline = Date.now() + 30_000;
  const failures = [];
  for (const record of [...state.pendingCommands]) {
    try {
      if (!(await stopOwnedGroup(record, state.cleanupDeadline))) failures.push('COMMAND_REAP');
      else state.pendingCommands.delete(record);
    } catch {
      failures.push('COMMAND_CLEANUP');
    }
  }
  if (state.postgres) {
    try {
      if (!(await stopOwnedGroup(state.pgRecord, state.cleanupDeadline)))
        failures.push('POSTGRES_EXIT');
    } catch {
      failures.push('POSTGRES_CLEANUP');
    }
  }
  if (state.redisPlanned) {
    try {
      await verifyDaemon(state);
      const ids = await docker(state, [
        'container',
        'ls',
        '--all',
        '--quiet',
        '--no-trunc',
        '--filter',
        `label=stynx.http.owner=${state.instance}`,
      ]);
      const actual = ids ? ids.split('\n') : [];
      if (
        actual.length > 1 ||
        actual.some((id) => !/^[a-f0-9]{64}$/u.test(id)) ||
        (state.redisId && !actual.includes(state.redisId))
      )
        refuse('CLEANUP_CONTAINER_POPULATION');
      if (actual.length === 1) {
        const rows = JSON.parse(await docker(state, ['container', 'inspect', actual[0]]));
        if (
          rows.length !== 1 ||
          rows[0].Id !== actual[0] ||
          rows[0].Image !== redisImageId ||
          rows[0].Name !== `/stynx-http-${state.instance}` ||
          !isDeepStrictEqual(rows[0].Config.Labels, state.containerLabels)
        )
          refuse('CLEANUP_CONTAINER_IDENTITY');
        // Recover the actual returned daemon identity if a create reply was lost.
        state.redisId = actual[0];
        await docker(state, ['container', 'rm', '--force', state.redisId]);
      }
      const remains = await docker(state, [
        'container',
        'ls',
        '--all',
        '--quiet',
        '--no-trunc',
        '--filter',
        `label=stynx.http.owner=${state.instance}`,
      ]);
      if (remains !== '') refuse('CLEANUP_CONTAINER_REMAINS');
    } catch {
      failures.push('REDIS_CLEANUP');
    }
  }
  try {
    const root = lstatSync(state.directory);
    if (
      realpathSync(state.directory) !== state.directory ||
      root.dev !== state.rootDevice ||
      root.ino !== state.rootInode
    )
      refuse('CLEANUP_DIRECTORY_IDENTITY');
    if (failures.length === 0) rmSync(state.directory, { recursive: true, force: false });
  } catch {
    failures.push('DIRECTORY_CLEANUP');
  }
  state.cleanup = { complete: failures.length === 0, failures, readinessPromoting: false };
  if (failures.length) {
    incompleteCleanups.add(state);
    const failure = new Error('Owned fixture cleanup is incomplete');
    failure.code = 'HTTP_REFERENCE_FIXTURE_CLEANUP';
    failure.cleanup = {
      ...structuredClone(state.cleanup),
      retainedDirectorySha256: digest(state.directory),
      retainedCommandGroups: state.pendingCommands.size,
    };
    throw failure;
  }
  incompleteCleanups.delete(state);
  state.passwords = {};
  state.redisPassword = '';
  state.environment = undefined;
  return structuredClone(state.cleanup);
}

/** Fixed internal resource producer; its handle alone does not admit a worker. */
export async function createOwnedReferenceFixture(identity) {
  if (
    arguments.length !== 1 ||
    !identity ||
    types.isProxy(identity) ||
    Object.getPrototypeOf(identity) !== Object.prototype ||
    Reflect.ownKeys(identity).some((key) => typeof key !== 'string') ||
    Reflect.ownKeys(identity).sort().join(',') !== 'candidateCommit,nonce,tree' ||
    ['candidateCommit', 'nonce', 'tree'].some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(identity, key);
      return (
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, 'value') ||
        typeof descriptor.value !== 'string'
      );
    }) ||
    !/^[a-f0-9]{40}$/u.test(identity.candidateCommit) ||
    !/^[a-f0-9]{40}$/u.test(identity.tree) ||
    !/^[a-f0-9-]{36}$/u.test(identity.nonce)
  )
    refuse('REQUEST');
  verifyTools();
  const allocatedDirectory = mkdtempSync(join(tmpdir(), 'stynx référence fixture '));
  let allocatedRoot, canonicalDirectory, state;
  try {
    // The allocated name is retained before every fallible initialization step.
    allocatedRoot = lstatSync(allocatedDirectory);
    if (!allocatedRoot.isDirectory() || allocatedRoot.isSymbolicLink()) refuse('ROOT_IDENTITY');
    canonicalDirectory = realpathSync(allocatedDirectory);
    const directory = canonicalDirectory;
    state = {
      directory,
      rootDevice: allocatedRoot.dev,
      rootInode: allocatedRoot.ino,
      pendingCommands: new Set(),
      setupDeadline: Date.now() + 120_000,
      ready: false,
      closed: false,
    };
    const instance = randomUUID();
    Object.assign(state, {
      identity: { ...identity },
      instance,
      database: `stynx_http_${randomBytes(8).toString('hex')}`,
      dataDirectory: join(directory, 'postgres'),
      socketDirectory: join(directory, 'socket'),
      passwords: Object.fromEntries(
        ['stynx_http_admin', 'stynx_owner', 'stynx_app', 'stynx_reader'].map((role) => [
          role,
          randomBytes(32).toString('hex'),
        ]),
      ),
      redisPassword: randomBytes(32).toString('hex'),
      redisTmpfs: `rw,nosuid,nodev,noexec,uid=${process.getuid()},gid=${process.getgid()},mode=0700`,
      redisConfig: join(directory, 'redis.conf'),
      redisLabels: {
        'stynx.http.owner': instance,
        'stynx.http.job': identity.nonce,
        'stynx.http.candidate': identity.candidateCommit,
        'stynx.http.tree': identity.tree,
      },
    });
    const handle = Object.freeze(Object.create(null));
    handles.set(handle, state);
    for (const name of ['socket', 'docker-config'])
      mkdirSync(join(directory, name), { mode: 0o700 });
    writeFileSync(join(directory, 'docker-config/config.json'), '{"auths":{}}\n', {
      mode: 0o600,
      flag: 'wx',
    });
    const passwordFile = join(directory, 'pg-password');
    writeFileSync(passwordFile, state.passwords.stynx_http_admin + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    await run(state, 'initdb', [
      '--pgdata',
      state.dataDirectory,
      '--username',
      'stynx_http_admin',
      '--pwfile',
      passwordFile,
      '--auth-local=scram-sha-256',
      '--auth-host=scram-sha-256',
      '--encoding=UTF8',
      '--no-locale',
      '--no-instructions',
    ]);
    state.pgPort = await availableLoopbackPort();
    const log = openSync(join(directory, 'postgres.log'), 'wx', 0o600);
    try {
      state.postgres = spawn(
        tools.postgres[0],
        [
          '-D',
          state.dataDirectory,
          '-h',
          '127.0.0.1',
          '-p',
          String(state.pgPort),
          '-k',
          state.socketDirectory,
          '-c',
          'unix_socket_permissions=0700',
        ],
        {
          cwd: directory,
          env: commandEnvironment(state),
          detached: true,
          stdio: ['ignore', log, log],
        },
      );
      state.pgRecord = { child: state.postgres, exited: false, closed: false };
      state.postgres.once('exit', () => {
        state.pgRecord.exited = true;
        state.pgExited = true;
      });
      state.pgExit = state.pgRecord.exit = new Promise((accept) => {
        state.postgres.once('error', () => {
          state.pgRecord.exited = true;
          state.pgExited = true;
        });
        state.postgres.once('close', () => {
          state.pgRecord.exited = true;
          state.pgRecord.closed = true;
          state.pgExited = true;
          accept();
        });
      });
    } finally {
      closeSync(log);
    }
    let identityObserved;
    for (let attempt = 0; attempt < 60 && Date.now() < state.setupDeadline; attempt++) {
      try {
        identityObserved = await postgresIdentity(state);
        break;
      } catch {
        if (state.pgExited) refuse('POSTGRES_START');
        await new Promise((accept) => setTimeout(accept, 100));
      }
    }
    if (!identityObserved) refuse('POSTGRES_START');
    state.postgresIdentity = identityObserved;
    await sql(
      state,
      'stynx_http_admin',
      `create database "${state.database}" template template0;`,
      'postgres',
    );
    await sql(state, 'stynx_http_admin', readFileSync(rolesSqlPath, 'utf8'));
    for (const role of ['stynx_owner', 'stynx_app', 'stynx_reader'])
      await sql(
        state,
        'stynx_http_admin',
        `alter role ${role} login password '${state.passwords[role]}';`,
      );
    await sql(
      state,
      'stynx_http_admin',
      `alter database "${state.database}" owner to stynx_owner;`,
    );
    state.roles = await roleIdentities(state);
    if (
      (await sql(
        state,
        'stynx_owner',
        `select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not like 'pg_%' and n.nspname <> 'information_schema';`,
      )) !== '0'
    )
      refuse('DATABASE_NOT_EMPTY');
    await verifyDaemon(state);
    await verifyImage(state);
    writeFileSync(
      state.redisConfig,
      `bind 0.0.0.0\nport 6379\nprotected-mode yes\nrequirepass ${state.redisPassword}\nsave ""\nappendonly no\ndir /data\nlogfile ""\n`,
      { mode: 0o600, flag: 'wx' },
    );
    const configStat = lstatSync(state.redisConfig);
    state.redisConfigIdentity = {
      device: configStat.dev,
      inode: configStat.ino,
      sha256: digest(readFileSync(state.redisConfig)),
    };
    state.redisPlanned = true;
    state.redisId = await docker(state, [
      'container',
      'create',
      '--pull=never',
      '--name',
      `stynx-http-${instance}`,
      ...Object.entries(state.redisLabels).flatMap(([name, value]) => [
        '--label',
        `${name}=${value}`,
      ]),
      '--publish',
      '127.0.0.1::6379',
      '--network',
      'bridge',
      '--user',
      `${process.getuid()}:${process.getgid()}`,
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--tmpfs',
      `/data:${state.redisTmpfs}`,
      '--mount',
      `type=bind,src=${state.redisConfig},dst=/usr/local/etc/redis/redis.conf,readonly`,
      redisImage,
      'redis-server',
      '/usr/local/etc/redis/redis.conf',
    ]);
    if (!/^[a-f0-9]{64}$/u.test(state.redisId)) refuse('CONTAINER_ID');
    await inspectRedis(state, false);
    await docker(state, ['container', 'start', state.redisId]);
    await inspectRedis(state, true);
    await verifyRedisConfiguration(state);
    let redisObserved;
    for (let attempt = 0; attempt < 60 && Date.now() < state.setupDeadline; attempt++) {
      try {
        redisObserved = await redisIdentity(state);
        break;
      } catch {
        await new Promise((accept) => setTimeout(accept, 100));
      }
    }
    if (!redisObserved) refuse('REDIS_START');
    state.redisIdentity = redisObserved;
    state.ready = true;
    await verifyResources(state);
    return handle;
  } catch (error) {
    if (state) await cleanup(state);
    else {
      let complete = false;
      try {
        const current = lstatSync(allocatedDirectory);
        if (
          !allocatedRoot?.isDirectory() ||
          allocatedRoot.isSymbolicLink() ||
          !current.isDirectory() ||
          current.isSymbolicLink() ||
          current.dev !== allocatedRoot.dev ||
          current.ino !== allocatedRoot.ino ||
          (canonicalDirectory !== undefined &&
            realpathSync(allocatedDirectory) !== canonicalDirectory)
        )
          refuse('INITIAL_ROOT_IDENTITY');
        rmSync(allocatedDirectory, { recursive: true, force: false });
        complete = true;
      } catch {
        // Unknown/substituted ownership retains the allocation, never deletes it.
      }
      if (!complete) {
        const failure = new Error('Initial fixture directory cleanup is incomplete');
        failure.code = 'HTTP_REFERENCE_FIXTURE_INITIAL_ROOT_CLEANUP';
        failure.cleanup = {
          complete: false,
          failures: ['INITIAL_ROOT_IDENTITY'],
          retainedDirectorySha256: digest(allocatedDirectory),
          readinessPromoting: false,
        };
        throw failure;
      }
    }
    throw error;
  }
}

/** Secret environment remains private to the actual supervisor, never evidence. */
export async function ownedReferenceFixtureEnvironment(handle) {
  if (arguments.length !== 1) refuse('HANDLE');
  const state = stateFor(handle);
  await verifyResources(state);
  const uri = (role) =>
    `postgresql://${role}:${state.passwords[role]}@127.0.0.1:${state.pgPort}/${state.database}`;
  for (const name of ['aws-config', 'aws-credentials']) {
    const path = join(state.directory, name);
    try {
      writeFileSync(path, '', { mode: 0o600, flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    if (!lstatSync(path).isFile() || realpathSync(path) !== path || readFileSync(path).length !== 0)
      refuse('AWS_FILES');
  }
  state.environment ??= {
    NODE_ENV: 'test',
    STYNX_ENVIRONMENT: 'http-fixture',
    STYNX_OWNER_DATABASE_URL: uri('stynx_owner'),
    STYNX_APP_DATABASE_URL: uri('stynx_app'),
    STYNX_READER_DATABASE_URL: uri('stynx_reader'),
    STYNX_REDIS_URL: `redis://:${state.redisPassword}@127.0.0.1:${state.redisPort}/0`,
    STYNX_TENANCY_PLATFORM_ADMIN: 'false',
    STYNX_PLATFORM_INFO_ENABLED: 'false',
    STYNX_STYNX_ISSUER: 'https://stynx-http-fixture.invalid',
    STYNX_COGNITO_ISSUER: 'https://cognito-http-fixture.invalid',
    STYNX_COGNITO_JWKS_URI: 'https://cognito-http-fixture.invalid/.well-known/jwks.json',
    STYNX_REFERENCE_WEB_ORIGINS: 'http://127.0.0.1:3100',
    STYNX_STORAGE_REGION: 'us-east-1',
    STYNX_STORAGE_BUCKET: `stynx-http-fixture-${state.instance}`,
    STYNX_KMS_ALIAS: 'alias/stynx-http-fixture',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'stynx-http-fixture',
    AWS_SECRET_ACCESS_KEY: randomBytes(32).toString('hex'),
    AWS_EC2_METADATA_DISABLED: 'true',
    AWS_SDK_LOAD_CONFIG: '0',
    AWS_CONFIG_FILE: join(state.directory, 'aws-config'),
    AWS_SHARED_CREDENTIALS_FILE: join(state.directory, 'aws-credentials'),
  };
  return { ...state.environment };
}

/** Public facts only; never a replacement for parent live-handle corroboration. */
export async function observeOwnedReferenceFixture(handle) {
  if (arguments.length !== 1) refuse('HANDLE');
  const state = stateFor(handle);
  await verifyResources(state);
  return structuredClone({
    schemaVersion: 1,
    scope: 'reference-owned-resources',
    identity: state.identity,
    instance: state.instance,
    hostToolSha256: Object.fromEntries(Object.entries(tools).map(([name, row]) => [name, row[1]])),
    dockerEndpointSha256,
    daemonIdentity,
    postgres: {
      pid: state.postgres.pid,
      port: state.pgPort,
      database: state.database,
      version: state.postgresIdentity.version,
      systemIdentifier: state.postgresIdentity.systemIdentifier,
      dataDirectorySha256: digest(state.dataDirectory),
      rolesSqlSha256,
      roles: state.roles,
    },
    redis: {
      containerId: state.redisId,
      image: redisImage,
      imageId: redisImageId,
      labels: state.redisLabels,
      port: state.redisPort,
      ...state.redisIdentity,
    },
    environment: state.environment
      ? Object.fromEntries(
          Object.entries(state.environment).map(([name, value]) => [name, digest(value)]),
        )
      : null,
    parentCorroborationRequired: true,
    hostDynamicDependencyAdmission: 'PENDING_INDEPENDENT_INSPECTOR',
    imageRegistryOriginAdmission: 'PENDING_INDEPENDENT_INSPECTOR',
    workerNetworkGuard: 'NOT_IMPLEMENTED_IN_RESOURCE_CONTROLLER',
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  });
}

/** The actual supervisor must call this on every normal and failed worker path. */
export async function closeOwnedReferenceFixture(handle) {
  if (arguments.length !== 1) refuse('HANDLE');
  const state = handles.get(handle);
  if (!state) refuse('HANDLE');
  return cleanup(state);
}
