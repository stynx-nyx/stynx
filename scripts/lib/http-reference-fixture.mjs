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
import { Agent, get } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, types } from 'node:util';

// First finite local recipe. These identities grant no build/process custody.
// The supervisor must bind an actually created opaque handle to its live build.
const handles = new WeakMap();
// Failed creation returns no handle: retain unresolved launch custody explicitly.
const incompleteCleanups = new Set();
const digest = (value) => createHash('sha256').update(value).digest('hex');

function directoryChain(path) {
  const rows = [];
  for (let current = path; ; current = dirname(current)) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(current) !== current)
      refuse('FAILURE_EVIDENCE_IDENTITY');
    rows.push({
      path: current,
      dev: stat.dev,
      ino: stat.ino,
      mode: stat.mode,
      uid: stat.uid,
      gid: stat.gid,
    });
    if (dirname(current) === current) return rows;
  }
}

// Loaded only when actual fixture creation has failed; no success-path import.
function writeFailureEvidence(state, name, bytes) {
  return state.failureEvidence.api.writeFixtureFailureArchive(
    state.failureEvidence.handle,
    name,
    bytes,
  );
}
function verifyFailureEvidence(state) {
  state.failureEvidence.api.verifyFixtureFailureArchive(state.failureEvidence.handle);
}
function failureArchiveSnapshot(state) {
  if (!state.failureEvidence) return state.failureArchiveCreationFailure ?? null;
  return state.failureEvidence.api.snapshotFixtureFailureArchive(state.failureEvidence.handle);
}

async function retainCreationFailure(state) {
  if (state.failureEvidence?.captured) return;
  if (state.failureArchiveCreationFailure) refuse('FAILURE_EVIDENCE_STICKY');
  if (!state.failureEvidence) {
    const api = await import('./http-fixture-failure-archive.mjs');
    try {
      state.failureEvidence = { api, handle: api.createFixtureFailureArchive(), captured: false };
    } catch (error) {
      state.failureArchiveCreationFailure = error.failureArchive ?? null;
      throw error;
    }
  }
  const { readHttpQualificationArtifact } = await import('./http-qualification-artifacts.mjs');
  const log = join(state.directory, 'postgres.log');
  let postgresLog = null;
  const resourceChain = directoryChain(state.directory);
  try {
    const acquired = readHttpQualificationArtifact(state.directory, log);
    if (!isDeepStrictEqual(directoryChain(state.directory), resourceChain))
      refuse('FAILURE_EVIDENCE_IDENTITY');
    postgresLog = writeFailureEvidence(state, 'postgres.log', acquired.bytes);
  } catch (error) {
    if (error.code !== 'ENOENT' || state.postgres) throw error;
  }
  let objectWitness = null;
  if (state.objectWitnessFailure) {
    const { expectedBytes, receivedBytes, ...observation } = state.objectWitnessFailure;
    objectWitness = {
      observation,
      expected: writeFailureEvidence(state, 'object-expected.zip', expectedBytes),
      received: writeFailureEvidence(state, 'object-received.body', receivedBytes),
    };
  }
  const capture = {
    schemaVersion: 1,
    scope: 'owned-reference-fixture-creation-failure',
    identity: state.identity ?? null,
    instance: state.instance ?? null,
    refusalCode: state.creationFailureCode,
    postgresLog,
    objectWitness,
    cleanup: 'PENDING',
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
  writeFailureEvidence(state, 'capture.json', Buffer.from(JSON.stringify(capture)));
  state.failureEvidence.captured = true;
}

function creationFailureSnapshot(state) {
  const evidence = state.failureEvidence;
  const archive = failureArchiveSnapshot(state);
  let retainedResourceDirectory = null;
  let resourceDirectoryOutcome = state.resourceDirectoryRemoved === true ? 'ABSENT' : 'UNKNOWN';
  if (resourceDirectoryOutcome !== 'ABSENT') {
    try {
      const current = lstatSync(state.directory);
      if (
        current.isDirectory() &&
        !current.isSymbolicLink() &&
        current.dev === state.rootDevice &&
        current.ino === state.rootInode &&
        realpathSync(state.directory) === state.directory
      ) {
        retainedResourceDirectory = state.directory;
        resourceDirectoryOutcome = 'RETAINED';
      }
    } catch {
      // Partial deletion/identity drift is UNKNOWN, never asserted retained.
    }
  }
  return {
    directory: archive?.directory ?? null,
    files: structuredClone(archive?.files ?? []),
    archiveDirectoryOutcome: archive?.directoryOutcome ?? 'UNKNOWN',
    archivePartialFiles: structuredClone(archive?.partialFiles ?? []),
    archiveFailureCode: archive?.failureCode ?? null,
    captured: evidence?.captured ?? false,
    retainedResourceDirectory,
    resourceDirectoryOutcome,
    cleanupRecordComplete: evidence?.cleanupRecordComplete === true,
    readinessPromoting: false,
  };
}
const pgDirectory = '/Applications/Postgres.app/Contents/Versions/18/bin';
const tools = Object.freeze({
  postgres: [
    join(pgDirectory, 'postgres'),
    '9c5ba4d92f6392120d0334ae381c19716631bfd8c572d45548ab1b2762b67c8c',
  ],
  initdb: [
    join(pgDirectory, 'initdb'),
    '223cd2331ce34070ec87949c602e97f0cb73e384bac7b698bf6006c67e4e8089',
  ],
  psql: [
    join(pgDirectory, 'psql'),
    'f68592cfaff42309867e5368cff2454ad93cf9fc1e68beec06017e883f76b09e',
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
// Registry index, arm64 manifest and config correspondence were acquired
// independently of Docker's mutable tag. Layer/native admission remains held.
const objectImage =
  'localstack/localstack@sha256:b279c01f4cfb8f985a482e4014cabc1e2697b9d7a6c8c8db2e40f4d9f93687c7';
const objectImageId = 'sha256:5966ecddea63d941db8f5119aeb685b560368be970f225f3ce8f331d1373c835';
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

function environmentMap(values) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string'))
    refuse('OBJECT_ENVIRONMENT');
  const result = {};
  for (const value of values) {
    const separator = value.indexOf('=');
    if (separator < 1 || Object.hasOwn(result, value.slice(0, separator)))
      refuse('OBJECT_ENVIRONMENT');
    result[value.slice(0, separator)] = value.slice(separator + 1);
  }
  return result;
}

async function verifyObjectImage(state) {
  const rows = JSON.parse(await docker(state, ['image', 'inspect', objectImage]));
  const row = rows[0];
  if (
    rows.length !== 1 ||
    row.Id !== objectImageId ||
    row.Os !== 'linux' ||
    row.Architecture !== 'arm64' ||
    !row.RepoDigests?.includes(objectImage) ||
    !isDeepStrictEqual(row.Config.Entrypoint, ['docker-entrypoint.sh']) ||
    (row.Config.Cmd ?? null) !== null ||
    (row.Config.User ?? '') !== '' ||
    row.Config.WorkingDir !== '/opt/code/localstack/' ||
    !isDeepStrictEqual(row.Config.Volumes, { '/var/lib/localstack': {} })
  )
    refuse('OBJECT_IMAGE_IDENTITY');
  const labels = row.Config.Labels ?? {};
  if (
    !labels ||
    typeof labels !== 'object' ||
    Array.isArray(labels) ||
    Object.values(labels).some((value) => typeof value !== 'string')
  )
    refuse('OBJECT_IMAGE_LABELS');
  const actual = {
    labels: { ...labels, ...state.object.labels },
    environment: { ...environmentMap(row.Config.Env), ...state.object.environment },
    layers: row.RootFS?.Layers,
  };
  if (
    !Array.isArray(actual.layers) ||
    actual.layers.some((value) => !/^sha256:[a-f0-9]{64}$/u.test(value))
  )
    refuse('OBJECT_IMAGE_LAYERS');
  if (state.object.image && !isDeepStrictEqual(state.object.image, actual))
    refuse('OBJECT_IMAGE_CHANGED');
  state.object.image = actual;
}

async function inspectObjectContainer(state, running) {
  const object = state.object;
  const rows = JSON.parse(await docker(state, ['container', 'inspect', object.id]));
  const row = rows[0];
  if (
    rows.length !== 1 ||
    row.Id !== object.id ||
    row.Name !== `/stynx-http-s3-${state.instance}` ||
    row.Image !== objectImageId ||
    row.Config.Image !== objectImage ||
    !isDeepStrictEqual(row.Config.Entrypoint, ['docker-entrypoint.sh']) ||
    (row.Config.Cmd ?? null) !== null ||
    !isDeepStrictEqual(row.Config.Labels, object.image.labels) ||
    !isDeepStrictEqual(environmentMap(row.Config.Env), object.image.environment) ||
    row.Config.User !== '' ||
    row.HostConfig.NetworkMode !== 'bridge' ||
    row.HostConfig.Privileged !== false ||
    row.HostConfig.ReadonlyRootfs !== false ||
    !isDeepStrictEqual(row.HostConfig.CapDrop, ['ALL']) ||
    !isDeepStrictEqual(row.HostConfig.SecurityOpt, ['no-new-privileges']) ||
    !isDeepStrictEqual(row.HostConfig.Tmpfs, object.tmpfs) ||
    row.State.Running !== running ||
    !Array.isArray(row.Mounts) ||
    row.Mounts.some(
      (mount) =>
        mount.Type !== 'tmpfs' ||
        mount.RW !== true ||
        !Object.hasOwn(object.tmpfs, mount.Destination),
    ) ||
    row.Mounts.length > 2 ||
    !isDeepStrictEqual(Object.keys(row.HostConfig.PortBindings), ['4566/tcp'])
  )
    refuse('OBJECT_CONTAINER_IDENTITY');
  const bindings = row.HostConfig.PortBindings['4566/tcp'];
  if (bindings.length !== 1 || bindings[0].HostIp !== '127.0.0.1')
    refuse('OBJECT_CONTAINER_BINDING');
  if (running) {
    const ports = row.NetworkSettings.Ports?.['4566/tcp'];
    if (
      !Array.isArray(ports) ||
      ports.length !== 1 ||
      ports[0].HostIp !== '127.0.0.1' ||
      !/^[1-9][0-9]*$/u.test(ports[0].HostPort) ||
      Number(ports[0].HostPort) > 65535 ||
      [state.pgPort, state.redisPort].includes(Number(ports[0].HostPort)) ||
      (object.port !== undefined && object.port !== Number(ports[0].HostPort))
    )
      refuse('OBJECT_PORT');
    object.port = Number(ports[0].HostPort);
    object.endpoint = `http://127.0.0.1:${object.port}`;
    const network = row.NetworkSettings.Networks?.bridge;
    if (
      !network ||
      !/^[a-f0-9]{64}$/u.test(network.NetworkID) ||
      !/^[a-f0-9]{64}$/u.test(network.EndpointID)
    )
      refuse('OBJECT_NETWORK');
    const runtime = {
      startedAt: row.State.StartedAt,
      networkId: network.NetworkID,
      endpointId: network.EndpointID,
      address: network.IPAddress,
    };
    if (object.runtime && !isDeepStrictEqual(object.runtime, runtime)) refuse('OBJECT_RESTART');
    object.runtime = runtime;
  }
}

// This fixed supervisor-side SDK is only fixture administration. It cannot
// stand in for the separately observed fresh application's AWS transport.
function objectDriver(state) {
  const storageRequire = createRequire(
    new URL('../../packages/storage/package.json', import.meta.url),
  );
  const privacyRequire = createRequire(
    new URL('../../packages/privacy/package.json', import.meta.url),
  );
  const sdk = storageRequire('@aws-sdk/client-s3');
  const presigner = storageRequire('@aws-sdk/s3-request-presigner');
  const Zip = privacyRequire('jszip');
  const files = new Map();
  const visit = (module) => {
    if (!module || files.has(module.filename)) return;
    const path = realpathSync(module.filename);
    const bytes = readFileSync(path);
    files.set(module.filename, { module, path, sha256: digest(bytes), bytes: bytes.length });
    for (const child of module.children) visit(child);
  };
  for (const [loader, name] of [
    [storageRequire, '@aws-sdk/client-s3'],
    [storageRequire, '@aws-sdk/s3-request-presigner'],
    [privacyRequire, 'jszip'],
  ])
    visit(loader.cache[loader.resolve(name)]);
  const agent = new Agent({ keepAlive: false, maxSockets: 2 });
  const sockets = new Map();
  const originalCreateConnection = agent.createConnection;
  agent.createConnection = function (...args) {
    const options = args[0];
    if (
      options.host !== '127.0.0.1' ||
      Number(options.port) !== state.object.port ||
      options.path ||
      options.lookup ||
      options.localAddress ||
      options.socketPath
    )
      refuse('OBJECT_ADMIN_TRANSPORT');
    const socket = Reflect.apply(originalCreateConnection, this, args);
    const row = { closed: false };
    sockets.set(socket, row);
    socket.once('close', () => {
      row.closed = true;
    });
    return socket;
  };
  const client = new sdk.S3Client({
    region: 'us-east-1',
    endpoint: state.object.endpoint,
    forcePathStyle: true,
    credentials: state.object.credentials,
    maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { httpAgent: agent, connectionTimeout: 5_000, requestTimeout: 5_000 },
  });
  state.object.driver = {
    sdk,
    presigner,
    Zip,
    files,
    agent,
    sockets,
    client,
    destroy: client.destroy,
    createConnection: agent.createConnection,
    destroyed: false,
  };
}

function verifyObjectDriver(state) {
  const driver = state.object.driver;
  if (
    !driver ||
    driver.destroyed ||
    driver.client.destroy !== driver.destroy ||
    driver.agent.createConnection !== driver.createConnection ||
    Object.getPrototypeOf(driver.agent) !== Agent.prototype
  )
    refuse('OBJECT_DRIVER');
  for (const row of driver.files.values()) {
    const bytes = readFileSync(row.path);
    if (
      realpathSync(row.module.filename) !== row.path ||
      bytes.length !== row.bytes ||
      digest(bytes) !== row.sha256
    )
      refuse('OBJECT_DRIVER_SOURCE_CHANGED');
  }
}

function objectDownload(state, signed) {
  const url = new URL(signed);
  if (url.origin !== state.object.endpoint || url.username || url.password || url.hash)
    refuse('OBJECT_DOWNLOAD_DESTINATION');
  return new Promise((accept, reject) => {
    const request = get(
      {
        host: '127.0.0.1',
        port: state.object.port,
        method: 'GET',
        path: url.pathname + url.search,
        agent: false,
      },
      (response) => {
        const chunks = [];
        let length = 0;
        response.on('data', (bytes) => {
          length += bytes.length;
          if (length > 1_000_000)
            request.destroy(new Error('Object fixture response exceeded its finite bound'));
          else chunks.push(bytes);
        });
        response.once('error', reject);
        response.once('end', () =>
          accept({
            status: response.statusCode,
            contentType: response.headers['content-type'],
            bytes: Buffer.concat(chunks),
          }),
        );
      },
    );
    const row = { closed: false };
    state.object.downloads.add(row);
    row.request = request;
    request.once('socket', (socket) => {
      const socketRow = { closed: false };
      state.object.driver.sockets.set(socket, socketRow);
      socket.once('close', () => {
        socketRow.closed = true;
      });
    });
    request.once('close', () => {
      row.closed = true;
    });
    request.setTimeout(5_000, () =>
      request.destroy(new Error('Object fixture download deadline exceeded')),
    );
    request.once('error', reject);
  });
}

async function createObjectFixture(state) {
  const object = state.object;
  await verifyObjectImage(state);
  object.planned = true;
  object.id = await docker(state, [
    'container',
    'create',
    '--pull=never',
    '--name',
    `stynx-http-s3-${state.instance}`,
    ...Object.entries(object.labels).flatMap(([name, value]) => ['--label', `${name}=${value}`]),
    ...Object.entries(object.environment).flatMap(([name, value]) => ['--env', `${name}=${value}`]),
    '--publish',
    '127.0.0.1::4566',
    '--network',
    'bridge',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    ...Object.entries(object.tmpfs).flatMap(([path, value]) => ['--tmpfs', `${path}:${value}`]),
    objectImage,
  ]);
  if (!/^[a-f0-9]{64}$/u.test(object.id)) refuse('OBJECT_CONTAINER_ID');
  await inspectObjectContainer(state, false);
  await docker(state, ['container', 'start', object.id]);
  await inspectObjectContainer(state, true);
  objectDriver(state);
  const { sdk, presigner, Zip, client } = object.driver;
  for (const bucket of [object.storageBucket, object.privacyBucket]) {
    let created = false;
    for (let attempt = 0; attempt < 60 && Date.now() < state.setupDeadline; attempt++) {
      try {
        await client.send(new sdk.CreateBucketCommand({ Bucket: bucket }));
        created = true;
        break;
      } catch (error) {
        if (error.name !== 'Error' && !['ECONNREFUSED', 'ECONNRESET'].includes(error.code))
          throw error;
        await new Promise((accept) => setTimeout(accept, 100));
      }
    }
    if (!created) refuse('OBJECT_START');
  }
  object.witnesses = [];
  for (const tenantId of [
    '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
    '0197481e-6f84-77e4-8d6d-41f0b6fca9c2',
  ]) {
    const key = `exports/${tenantId}/${randomUUID()}.zip`;
    const manifest = { tenantId, format: 'json', fixture: state.identity.nonce };
    const subjects = [{ tenantId, name: 'João 日本語' }];
    const bytes = await new Zip()
      .file('manifest.json', JSON.stringify(manifest))
      .file('privacy.subjects.json', JSON.stringify(subjects))
      .generateAsync({ type: 'nodebuffer' });
    const expires = new Date(Math.floor(Date.now() / 1000) * 1000 + 3_600_000);
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: object.privacyBucket,
        Key: key,
        Body: bytes,
        ContentType: 'application/zip',
        Expires: expires,
      }),
    );
    const head = await client.send(
      new sdk.HeadObjectCommand({ Bucket: object.privacyBucket, Key: key }),
    );
    const signed = await presigner.getSignedUrl(
      client,
      new sdk.GetObjectCommand({ Bucket: object.privacyBucket, Key: key }),
      { expiresIn: 30 },
    );
    const url = new URL(signed);
    const downloaded = await objectDownload(state, signed);
    const witnessMatches = {
      origin: url.origin === object.endpoint,
      path: decodeURIComponent(url.pathname) === `/${object.privacyBucket}/${key}`,
      signedExpiry: url.searchParams.get('X-Amz-Expires') === '30',
      length: head.ContentLength === bytes.length,
      contentType: head.ContentType === 'application/zip',
      expiry: head.Expires?.getTime() === expires.getTime(),
      status: downloaded.status === 200,
      responseContentType: downloaded.contentType === 'application/zip',
      bytes: downloaded.bytes.equals(bytes),
    };
    if (Object.values(witnessMatches).some((matched) => !matched)) {
      // Fixed synthetic witness only. Never retain the signed URL, client
      // configuration, credentials, or arbitrary SDK response/error objects.
      state.objectWitnessFailure = {
        tenantId,
        key,
        matches: witnessMatches,
        expectedExpiresAt: expires.toISOString(),
        receivedExpiresAt: Number.isFinite(head.Expires?.getTime())
          ? head.Expires.toISOString()
          : null,
        receivedLength: head.ContentLength ?? null,
        receivedContentType: head.ContentType ?? null,
        receivedStatus: downloaded.status,
        responseContentType: downloaded.contentType ?? null,
        expectedBytes: bytes,
        receivedBytes: downloaded.bytes,
      };
      refuse('OBJECT_WITNESS');
    }
    const zip = await Zip.loadAsync(downloaded.bytes);
    if (
      !isDeepStrictEqual(Object.keys(zip.files).sort(), [
        'manifest.json',
        'privacy.subjects.json',
      ]) ||
      !isDeepStrictEqual(JSON.parse(await zip.file('manifest.json').async('string')), manifest) ||
      !isDeepStrictEqual(
        JSON.parse(await zip.file('privacy.subjects.json').async('string')),
        subjects,
      )
    )
      refuse('OBJECT_ZIP_WITNESS');
    object.witnesses.push({
      tenantId,
      key,
      sha256: digest(bytes),
      bytes: bytes.length,
      contentType: 'application/zip',
      expiresAt: expires.toISOString(),
      signedSeconds: 30,
      status: downloaded.status,
    });
  }
  const tampered = new URL(
    await presigner.getSignedUrl(
      client,
      new sdk.GetObjectCommand({ Bucket: object.privacyBucket, Key: object.witnesses[0].key }),
      { expiresIn: 30 },
    ),
  );
  tampered.pathname = `/${object.privacyBucket}/${object.witnesses[1].key}`;
  const refused = await objectDownload(state, tampered.href);
  if (refused.status !== 403 || !refused.bytes.toString().includes('SignatureDoesNotMatch'))
    refuse('OBJECT_SIGNATURE_WITNESS');
  const expiring = await presigner.getSignedUrl(
    client,
    new sdk.GetObjectCommand({ Bucket: object.privacyBucket, Key: object.witnesses[0].key }),
    { expiresIn: 3 },
  );
  if ((await objectDownload(state, expiring)).status !== 200) refuse('OBJECT_EXPIRY_START');
  await new Promise((accept) => setTimeout(accept, 4_100));
  const expired = await objectDownload(state, expiring);
  if (expired.status !== 403 || !/expired/iu.test(expired.bytes.toString()))
    refuse('OBJECT_EXPIRY_WITNESS');
  object.signatureTamperRefused = true;
  object.expiryRefused = true;
  verifyObjectDriver(state);
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
  if (state.object) {
    await verifyObjectImage(state);
    await inspectObjectContainer(state, true);
    verifyObjectDriver(state);
    const { sdk, client } = state.object.driver;
    for (const bucket of [state.object.storageBucket, state.object.privacyBucket])
      await client.send(new sdk.HeadBucketCommand({ Bucket: bucket }));
    for (const witness of state.object.witnesses) {
      const head = await client.send(
        new sdk.HeadObjectCommand({ Bucket: state.object.privacyBucket, Key: witness.key }),
      );
      if (
        head.ContentLength !== witness.bytes ||
        head.ContentType !== witness.contentType ||
        head.Expires?.toISOString() !== witness.expiresAt
      )
        refuse('OBJECT_WITNESS_CHANGED');
      const response = await client.send(
        new sdk.GetObjectCommand({ Bucket: state.object.privacyBucket, Key: witness.key }),
      );
      const bytes = Buffer.from(await response.Body.transformToByteArray());
      if (bytes.length !== witness.bytes || digest(bytes) !== witness.sha256)
        refuse('OBJECT_WITNESS_BYTES_CHANGED');
    }
  }
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
  if (state.object?.driver) {
    try {
      const driver = state.object.driver;
      if (!driver.destroyed) {
        verifyObjectDriver(state);
        Reflect.apply(driver.destroy, driver.client, []);
        driver.destroyed = true;
      }
      for (const row of state.object.downloads) if (!row.closed) row.request.destroy();
      while (
        Date.now() < state.cleanupDeadline &&
        ([...driver.sockets.values()].some((row) => !row.closed) ||
          [...state.object.downloads].some((row) => !row.closed))
      )
        await new Promise((accept) => setTimeout(accept, 10));
      if (
        [...driver.sockets.values()].some((row) => !row.closed) ||
        [...state.object.downloads].some((row) => !row.closed) ||
        Object.values(driver.agent.sockets).some((rows) => rows.length) ||
        Object.values(driver.agent.freeSockets).some((rows) => rows.length) ||
        Object.values(driver.agent.requests).some((rows) => rows.length)
      )
        refuse('OBJECT_ADMIN_DRAIN');
    } catch {
      failures.push('OBJECT_ADMIN_CLEANUP');
    }
  }
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
  if (state.object?.planned) {
    try {
      await verifyDaemon(state);
      const filter = `label=stynx.http.object-owner=${state.instance}`;
      const ids = await docker(state, [
        'container',
        'ls',
        '--all',
        '--quiet',
        '--no-trunc',
        '--filter',
        filter,
      ]);
      const actual = ids ? ids.split('\n') : [];
      if (
        actual.length > 1 ||
        actual.some((id) => !/^[a-f0-9]{64}$/u.test(id)) ||
        (state.object.id && !actual.includes(state.object.id))
      )
        refuse('OBJECT_CLEANUP_POPULATION');
      if (actual.length === 1) {
        state.object.id = actual[0];
        const rows = JSON.parse(await docker(state, ['container', 'inspect', state.object.id]));
        if (rows.length !== 1 || typeof rows[0].State.Running !== 'boolean')
          refuse('OBJECT_CLEANUP_IDENTITY');
        await inspectObjectContainer(state, rows[0].State.Running);
        await docker(state, ['container', 'rm', '--force', state.object.id]);
      }
      if (
        (await docker(state, [
          'container',
          'ls',
          '--all',
          '--quiet',
          '--no-trunc',
          '--filter',
          filter,
        ])) !== ''
      )
        refuse('OBJECT_CLEANUP_REMAINS');
    } catch {
      failures.push('OBJECT_CONTAINER_CLEANUP');
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
    if (failures.length === 0 && state.creationFailureCode) {
      try {
        await retainCreationFailure(state);
      } catch {
        failures.push('FAILURE_EVIDENCE_CAPTURE');
      }
    }
    if (failures.length === 0) {
      if (state.creationFailureCode) verifyFailureEvidence(state);
      rmSync(state.directory, { recursive: true, force: false });
      state.resourceDirectoryRemoved = true;
    }
  } catch {
    failures.push('DIRECTORY_CLEANUP');
  }
  state.cleanup = { complete: failures.length === 0, failures, readinessPromoting: false };
  if (state.failureEvidence?.captured) {
    try {
      writeFailureEvidence(
        state,
        'cleanup.json',
        Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            scope: 'owned-reference-fixture-creation-failure-cleanup',
            identity: state.identity ?? null,
            instance: state.instance ?? null,
            capture: failureArchiveSnapshot(state).files.find((row) => row.path === 'capture.json'),
            cleanup: state.cleanup,
            readinessPromoting: false,
          }),
        ),
      );
      verifyFailureEvidence(state);
      state.failureEvidence.cleanupRecordComplete = true;
    } catch {
      failures.push('FAILURE_EVIDENCE_CLEANUP_RECORD');
      state.cleanup.complete = false;
    }
  }
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
  if (state.object) state.object.credentials = undefined;
  state.environment = undefined;
  return structuredClone(state.cleanup);
}

/** Fixed internal resource producer; its handle alone does not admit a worker. */
export async function createOwnedReferenceFixture(identity) {
  if (arguments.length !== 1) refuse('REQUEST');
  return createFixedReferenceFixture(identity, false);
}

/** The privacy root selects this closed recipe; callers cannot supply S3 targets. */
export async function createOwnedPrivacyReferenceFixture(identity) {
  if (arguments.length !== 1) refuse('REQUEST');
  return createFixedReferenceFixture(identity, true);
}

/** Fixed original profiles reuse owned resources and existing Compose quotas. */
export async function createOwnedOriginalReferenceFixture(identity, selector) {
  if (arguments.length !== 2) refuse('REQUEST');
  const { httpOriginalScenarioProfile } = await import('./http-original-scenarios.mjs');
  const profile = httpOriginalScenarioProfile(selector);
  const { loadHttpOriginalQuotaRecipe } = await import('./http-original-quotas.mjs');
  const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
  const quotaRecipe = loadHttpOriginalQuotaRecipe(root);
  return createFixedReferenceFixture(identity, profile.scenarioId === 'upload', {
    profile,
    quotaRecipe,
  });
}

async function createFixedReferenceFixture(identity, privacy, originalScenario = null) {
  if (
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
      originalScenario,
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
      agentBindingKey: randomBytes(32).toString('hex'),
      redisTmpfs: `rw,nosuid,nodev,noexec,uid=${process.getuid()},gid=${process.getgid()},mode=0700`,
      redisConfig: join(directory, 'redis.conf'),
      redisLabels: {
        'stynx.http.owner': instance,
        'stynx.http.job': identity.nonce,
        'stynx.http.candidate': identity.candidateCommit,
        'stynx.http.tree': identity.tree,
      },
    });
    if (privacy)
      state.object = {
        labels: {
          'stynx.http.object-owner': instance,
          'stynx.http.job': identity.nonce,
          'stynx.http.candidate': identity.candidateCommit,
          'stynx.http.tree': identity.tree,
        },
        environment: {
          SERVICES: 's3',
          AWS_DEFAULT_REGION: 'us-east-1',
          S3_SKIP_SIGNATURE_VALIDATION: '0',
          DISABLE_EVENTS: '1',
        },
        tmpfs: {
          '/var/lib/localstack': 'rw,nosuid,nodev,mode=0700',
          '/tmp': 'rw,nosuid,nodev,mode=1777',
        },
        credentials: {
          accessKeyId: `stynx${randomBytes(8).toString('hex')}`,
          // The S3-only emulator has no IAM-issued key. Its signature verifier
          // requires the documented test secret for this synthetic access key.
          // Keep presigned signature and expiry validation enabled.
          secretAccessKey: 'test',
        },
        storageBucket: 'stynx-docs-http-fixture-us-east-1',
        privacyBucket: `stynx-privacy-${instance}`,
        downloads: new Set(),
      };
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
    if (state.object) await createObjectFixture(state);
    state.ready = true;
    await verifyResources(state);
    return handle;
  } catch (error) {
    if (state) {
      state.creationFailureCode =
        typeof error.code === 'string' && /^HTTP_REFERENCE_FIXTURE_[A-Z_]+$/u.test(error.code)
          ? error.code
          : 'HTTP_REFERENCE_FIXTURE_CREATION';
      try {
        error.cleanup = await cleanup(state);
      } catch (cleanupError) {
        error.cleanup = structuredClone(
          cleanupError.cleanup ?? {
            complete: false,
            failures: ['CLEANUP_UNOBSERVED'],
            readinessPromoting: false,
          },
        );
      }
      error.failureEvidence = creationFailureSnapshot(state);
    } else {
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
    STYNX_HTTP_FIXTURE_ID: state.instance,
    STYNX_HTTP_AGENT_BINDING_KEY: state.agentBindingKey,
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
    STYNX_STORAGE_BUCKET: state.object?.storageBucket ?? 'stynx-docs-http-fixture-us-east-1',
    ...(state.originalScenario?.quotaRecipe.environment ?? {}),
    ...(state.object
      ? {
          STYNX_STORAGE_ENDPOINT: state.object.endpoint,
          STYNX_STORAGE_FORCE_PATH_STYLE: 'true',
          STYNX_PRIVACY_BUCKET: state.object.privacyBucket,
        }
      : {}),
    STYNX_KMS_ALIAS: 'alias/stynx-http-fixture',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: state.object?.credentials.accessKeyId ?? 'stynx-http-fixture',
    AWS_SECRET_ACCESS_KEY:
      state.object?.credentials.secretAccessKey ?? randomBytes(32).toString('hex'),
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
    ...(state.originalScenario ? { originalScenario: state.originalScenario } : {}),
    referenceAgentBinding: {
      purpose: 'stynx-http-reference-offline-agent',
      schemaVersion: 1,
      fixtureId: state.instance,
      keySha256: digest(Buffer.from(state.agentBindingKey, 'hex')),
      candidateCommit: state.identity.candidateCommit,
      tree: state.identity.tree,
      jobNonce: state.identity.nonce,
      rawKeyRetainedInEvidence: false,
      productionProviderParity: false,
    },
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
    ...(state.object
      ? {
          objectStore: {
            kind: 'owned-local-s3-compatible-fixture',
            containerId: state.object.id,
            image: objectImage,
            imageId: objectImageId,
            labels: state.object.labels,
            port: state.object.port,
            endpoint: state.object.endpoint,
            storageBucket: state.object.storageBucket,
            privacyBucket: state.object.privacyBucket,
            runtime: state.object.runtime,
            witnesses: state.object.witnesses,
            signatureTamperRefused: state.object.signatureTamperRefused,
            expiryRefused: state.object.expiryRefused,
            supervisorSdkSourceClosure: [...state.object.driver.files.values()].map((row) => ({
              sourcePathSha256: digest(row.path),
              sha256: row.sha256,
              bytes: row.bytes,
            })),
            applicationSdkTransport: 'SEPARATE_INDEPENDENT_OBSERVATION_REQUIRED',
            supervisorSdkNativeAdmission: 'PENDING_INDEPENDENT_INSPECTOR',
            approvedExternalProvider: false,
          },
        }
      : {}),
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
