import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '..', '..', '..');
const referenceApiMain = resolve(workspaceRoot, 'reference/api/dist/reference/api/src/main.js');
const verifyReferenceApiBuildInputs = resolve(
  workspaceRoot,
  'scripts/verify-reference-api-build-inputs.mjs',
);
const startupProtocol = 'stynx-reference-api-startup-v1';
const startupOutputPrefix = '[reference-api-startup]';
const helperSuccessStates = [
  'helper-entered',
  'compose-ready',
  'redis-mapping-resolved',
  'build-inputs-verified',
  'child-spawned',
];
const startupSuccessStates = ['bootstrap-entered', 'nest-created', 'listening'];
const visibleStartupSuccessCodes = [...helperSuccessStates, ...startupSuccessStates];
const startupFailureReasons = ['nest-initialization', 'pre-listen-configuration', 'listen'];
const visibleStartupFailureCodes = new Set([
  ...startupFailureReasons.map((reason) => `bootstrap-failed:${reason}`),
  'child-error',
  'child-disconnect',
  'child-exit',
]);
const scriptPath = fileURLToPath(import.meta.url);
const postgresPort = process.env.STYNX_POSTGRES_PORT ?? '55432';
const redisPublish = process.env.TESTCONTAINERS_HOST_OVERRIDE ? '0.0.0.0::6379' : '127.0.0.1::6379';
const composeTempDir =
  process.env.STYNX_REFERENCE_API_STACK_COMPOSE_DIR ??
  (await mkdtemp(resolve(tmpdir(), 'stynx-reference-api-stack-')));
const composeFile = resolve(composeTempDir, 'compose.yml');

if (!process.env.STYNX_REFERENCE_API_STACK_COMPOSE_DIR) {
  await writeFile(
    composeFile,
    `services:\n  postgres:\n    image: postgres:16-alpine\n    environment:\n      GLOG_minloglevel: '2'\n      POSTGRES_DB: postgres\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: postgres\n    healthcheck:\n      test: ['CMD-SHELL', 'pg_isready -U postgres -d postgres']\n      interval: 5s\n      timeout: 5s\n      retries: 20\n    ports:\n      - '${postgresPort}:5432'\n  redis:\n    image: redis:7-alpine\n    environment:\n      GLOG_minloglevel: '2'\n    healthcheck:\n      test: ['CMD', 'redis-cli', 'ping']\n      interval: 5s\n      timeout: 5s\n      retries: 20\n    ports:\n      - '${redisPublish}'\n`,
    'utf8',
  );
}

let shuttingDown = false;
let composeDownComplete = false;
let composeDownProcess;
let apiProcess;
let startupStateIndex = 0;
let visibleStartupStateIndex = 0;
let startupTerminal = false;
let startupFailureStarted = false;
let apiListening = false;
const recordedStartupCodes = new Set();

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killPid(pid, signal = 'SIGTERM') {
  try {
    process.kill(pid, signal);
  } catch {
    // The target may already be gone; cleanup should remain idempotent.
  }
}

async function runWatchdog() {
  const parentPid = Number.parseInt(process.env.STYNX_REFERENCE_API_STACK_PARENT_PID ?? '', 10);
  const apiPid = Number.parseInt(process.env.STYNX_REFERENCE_API_STACK_API_PID ?? '', 10);

  if (!Number.isInteger(parentPid)) {
    process.exit(1);
  }

  while (isProcessAlive(parentPid)) {
    await sleep(250);
  }

  if (Number.isInteger(apiPid)) {
    killPid(apiPid);
  }

  spawnSync('docker', ['compose', '-f', composeFile, 'down', '-v'], {
    cwd: workspaceRoot,
    stdio: 'ignore',
  });
  rmSync(composeTempDir, { recursive: true, force: true });
  process.exit(0);
}

if (process.env.STYNX_REFERENCE_API_STACK_WATCHDOG === '1') {
  await runWatchdog();
}

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    ...options,
  });
}

function startCleanupWatchdog() {
  if (!apiProcess?.pid) {
    return;
  }

  const watchdog = spawn(process.execPath, [scriptPath], {
    cwd: workspaceRoot,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      STYNX_REFERENCE_API_STACK_WATCHDOG: '1',
      STYNX_REFERENCE_API_STACK_PARENT_PID: String(process.pid),
      STYNX_REFERENCE_API_STACK_API_PID: String(apiProcess.pid),
      STYNX_REFERENCE_API_STACK_COMPOSE_DIR: composeTempDir,
    },
  });
  watchdog.unref();
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }

  return new Promise((resolveExit) => {
    child.once('exit', (code, signal) => {
      resolveExit({ code, signal });
    });
  });
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  stopApiProcess(signal);
  await composeDown();
  process.exit(exitCode);
}

function stopApiProcess(signal = 'SIGTERM') {
  if (!apiProcess || apiProcess.exitCode !== null || apiProcess.signalCode !== null) {
    return;
  }

  apiProcess.kill(signal);
}

function recordStartupCode(code) {
  const isSuccess = visibleStartupSuccessCodes[visibleStartupStateIndex] === code;
  const isTerminal = visibleStartupFailureCodes.has(code);
  if (startupTerminal || recordedStartupCodes.has(code) || (!isSuccess && !isTerminal)) {
    return false;
  }
  recordedStartupCodes.add(code);
  if (isSuccess) {
    visibleStartupStateIndex += 1;
  } else {
    startupTerminal = true;
  }
  console.error(`${startupOutputPrefix} ${code}`);
  return true;
}

function recordAcceptedStartupState(record) {
  recordStartupCode(record.state);
}

function failStartup(code) {
  if (startupFailureStarted) {
    return;
  }
  startupFailureStarted = true;
  recordStartupCode(code);
  startupTerminal = true;
  void shutdown('SIGTERM', 1);
}

function handleStartupMessage(record) {
  if (startupTerminal) {
    failStartup('terminal-record');
    return;
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    failStartup('malformed-record');
    return;
  }
  if (record.protocol !== startupProtocol || typeof record.state !== 'string') {
    failStartup('malformed-record');
    return;
  }

  const keys = Object.keys(record).sort().join(',');
  if (record.state === 'bootstrap-failed') {
    if (!startupFailureReasons.includes(record.reason)) {
      failStartup('invalid-failure-reason');
      return;
    }
    if (keys !== 'protocol,reason,state') {
      failStartup('unbounded-record');
      return;
    }
    const permittedAtPhase =
      (startupStateIndex === 1 && record.reason === 'nest-initialization') ||
      (startupStateIndex === 2 && ['pre-listen-configuration', 'listen'].includes(record.reason));
    if (!permittedAtPhase) {
      failStartup('out-of-order-record');
      return;
    }
    failStartup(`bootstrap-failed:${record.reason}`);
    return;
  }

  if (keys !== 'protocol,state') {
    failStartup('unbounded-record');
    return;
  }
  if (record.state !== startupSuccessStates[startupStateIndex]) {
    failStartup('out-of-order-record');
    return;
  }
  startupStateIndex += 1;
  recordAcceptedStartupState(record);
  if (record.state === 'listening') {
    apiListening = true;
    startupTerminal = true;
  }
}

async function composeDown() {
  if (composeDownComplete) {
    return;
  }

  composeDownProcess ??= spawn('docker', ['compose', '-f', composeFile, 'down', '-v'], {
    cwd: workspaceRoot,
    detached: true,
    stdio: 'ignore',
  });
  await waitForExit(composeDownProcess);
  await rm(composeTempDir, { recursive: true, force: true });
  composeDownComplete = true;
}

function composeDownSync() {
  if (composeDownComplete) {
    return;
  }

  if (apiProcess && apiProcess.exitCode === null && apiProcess.signalCode === null) {
    apiProcess.kill('SIGTERM');
  }

  spawnSync('docker', ['compose', '-f', composeFile, 'down', '-v'], {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });
  rmSync(composeTempDir, { recursive: true, force: true });
  composeDownComplete = true;
}

async function runChecked(command, args) {
  const child = run(command, args);
  const result = await waitForExit(child);
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.code ?? result.signal}`);
  }
}

function discoverOwnedRedisPort() {
  const result = spawnSync('docker', ['compose', '-f', composeFile, 'port', 'redis', '6379'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0 || result.signal !== null) {
    throw new Error('Failed to resolve the owned Compose Redis port');
  }

  const mappings = result.stdout
    .split(/\r?\n/u)
    .map((mapping) => mapping.trim())
    .filter(Boolean);
  if (mappings.length === 0) {
    throw new Error('The owned Compose Redis port mapping is absent');
  }

  const ports = mappings.map((mapping) => {
    const match = /^(\[[^\]]+\]|[^:\s]+):(\d+)$/u.exec(mapping);
    const address = match?.[1].replace(/^\[|\]$/gu, '');
    if (!match || !address || isIP(address) === 0) {
      throw new Error('The owned Compose Redis port mapping is malformed');
    }
    const port = Number(match[2]);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      throw new Error('The owned Compose Redis port mapping is out of range');
    }
    return port;
  });
  if (new Set(ports).size !== 1) {
    throw new Error('The owned Compose Redis port mappings conflict');
  }
  return ports[0];
}

const redisHost = process.env.TESTCONTAINERS_HOST_OVERRIDE ?? '127.0.0.1';
if (redisHost.length === 0) {
  throw new Error('The Redis host override is empty');
}
recordStartupCode('helper-entered');
await runChecked('docker', ['compose', '-f', composeFile, 'up', '--wait', 'postgres', 'redis']);
recordStartupCode('compose-ready');
let redisPort;
try {
  redisPort = discoverOwnedRedisPort();
  recordStartupCode('redis-mapping-resolved');
} catch (error) {
  await composeDown();
  throw error;
}
await runChecked('node', [verifyReferenceApiBuildInputs]);
recordStartupCode('build-inputs-verified');

apiProcess = run('node', [referenceApiMain], {
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  env: {
    ...process.env,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
    AWS_EC2_METADATA_DISABLED: process.env.AWS_EC2_METADATA_DISABLED ?? 'true',
    NODE_ENV: 'development',
    PORT: '3000',
    STYNX_ENVIRONMENT: 'local',
    STYNX_OWNER_DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${postgresPort}/postgres`,
    STYNX_APP_DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${postgresPort}/postgres`,
    STYNX_READER_DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${postgresPort}/postgres`,
    STYNX_REDIS_URL: `redis://${redisHost}:${redisPort}`,
    STYNX_STORAGE_ENDPOINT: process.env.STYNX_STORAGE_ENDPOINT ?? 'http://127.0.0.1:4566',
    STYNX_STORAGE_FORCE_PATH_STYLE: process.env.STYNX_STORAGE_FORCE_PATH_STYLE ?? 'true',
    STYNX_STORAGE_BUCKET: process.env.STYNX_STORAGE_BUCKET ?? 'stynx-docs-local-us-east-1',
    STYNX_STORAGE_REGION: process.env.STYNX_STORAGE_REGION ?? 'us-east-1',
    STYNX_KMS_ALIAS: process.env.STYNX_KMS_ALIAS ?? 'stynx-local',
    STYNX_STYNX_ISSUER: process.env.STYNX_STYNX_ISSUER ?? 'https://reference-api.e2e.test',
    STYNX_COGNITO_ISSUER: process.env.STYNX_COGNITO_ISSUER ?? 'https://cognito.local',
  },
});

apiProcess.once('spawn', () => {
  recordStartupCode('child-spawned');
});
apiProcess.on('message', (record) => {
  handleStartupMessage(record);
});
apiProcess.once('error', () => {
  if (!apiListening) {
    failStartup('child-error');
  }
});
apiProcess.once('disconnect', () => {
  if (!apiListening) {
    failStartup('child-disconnect');
  }
});
apiProcess.once('exit', (code, signal) => {
  if (shuttingDown || startupFailureStarted) {
    return;
  }
  if (!apiListening) {
    failStartup('child-exit');
    return;
  }
  void shutdown('SIGTERM', typeof code === 'number' ? code : signal ? 1 : 0);
});
startCleanupWatchdog();

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.once('SIGHUP', () => {
  void shutdown('SIGHUP');
});
process.once('beforeExit', () => {
  void shutdown('SIGTERM');
});
process.once('exit', () => {
  composeDownSync();
});
