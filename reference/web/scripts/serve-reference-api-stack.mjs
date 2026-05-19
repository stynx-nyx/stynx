import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '..', '..', '..');
const composeFile = resolve(workspaceRoot, 'reference/api/docker-compose.yml');
const referenceApiMain = resolve(workspaceRoot, 'reference/api/dist/reference/api/src/main.js');
const scriptPath = fileURLToPath(import.meta.url);

let shuttingDown = false;
let composeDownComplete = false;
let composeDownProcess;
let apiProcess;

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

function runCompose(args) {
  return run('docker', ['compose', '-f', composeFile, ...args]);
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
  composeDownComplete = true;
}

async function runChecked(command, args) {
  const child = run(command, args);
  const result = await waitForExit(child);
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.code ?? result.signal}`);
  }
}

await runChecked('docker', ['compose', '-f', composeFile, 'up', '--wait', 'postgres', 'redis']);
await runChecked('pnpm', ['--filter', '@stynx/reference-api', 'build']);

apiProcess = run('node', [referenceApiMain], {
  env: {
    ...process.env,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
    AWS_EC2_METADATA_DISABLED: process.env.AWS_EC2_METADATA_DISABLED ?? 'true',
    NODE_ENV: 'development',
    PORT: '3000',
    STYNX_ENVIRONMENT: 'local',
    STYNX_OWNER_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
    STYNX_APP_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
    STYNX_READER_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
    STYNX_REDIS_URL: 'redis://127.0.0.1:6379',
    STYNX_STORAGE_ENDPOINT: process.env.STYNX_STORAGE_ENDPOINT ?? 'http://127.0.0.1:4566',
    STYNX_STORAGE_FORCE_PATH_STYLE: process.env.STYNX_STORAGE_FORCE_PATH_STYLE ?? 'true',
    STYNX_STORAGE_BUCKET: process.env.STYNX_STORAGE_BUCKET ?? 'stynx-docs-local-us-east-1',
    STYNX_STORAGE_REGION: process.env.STYNX_STORAGE_REGION ?? 'us-east-1',
    STYNX_KMS_ALIAS: process.env.STYNX_KMS_ALIAS ?? 'stynx-local',
    STYNX_STYNX_ISSUER: process.env.STYNX_STYNX_ISSUER ?? 'https://reference-api.e2e.test',
    STYNX_COGNITO_ISSUER: process.env.STYNX_COGNITO_ISSUER ?? 'https://cognito.local',
  },
});
startCleanupWatchdog();

apiProcess.once('exit', (code, signal) => {
  if (shuttingDown) {
    return;
  }
  void shutdown('SIGTERM', typeof code === 'number' ? code : signal ? 1 : 0);
});

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
