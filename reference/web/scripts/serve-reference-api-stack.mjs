import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { get } from 'node:http';
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
const ownedRouteOutputPrefix = '[reference-api-owned-route]';
const governedStderrWrite = process.stderr.write.bind(process.stderr);
const suppressProcessOutput = () => true;
process.stdout.write = suppressProcessOutput;
process.stderr.write = suppressProcessOutput;
const helperSuccessStates = [
  'helper-entered',
  'compose-ready',
  'redis-mapping-resolved',
  'build-inputs-verified',
  'child-spawned',
];
const startupSuccessStates = ['bootstrap-entered', 'nest-created', 'listening'];
const runtimeRouteTableStates = [
  'runtime-route-table-present',
  'runtime-route-table-absent',
  'runtime-route-table-indeterminate',
];
const composeUpTerminalCodes = [
  'compose-up-spawn-failed',
  'compose-up-exit-nonzero',
  'compose-up-signaled',
];
const ownedRouteClassifierArgument = '--d17-owned-route-classifier';
const defaultEndpointClassifierArgument = '--d19-default-endpoint-classifier';
const helperArguments = process.argv.slice(2);
const ownedRouteClassifierEnabled =
  helperArguments.length === 1 && helperArguments[0] === ownedRouteClassifierArgument;
const defaultEndpointClassifierEnabled =
  helperArguments.length === 1 && helperArguments[0] === defaultEndpointClassifierArgument;
const normalHelperMode = helperArguments.length === 0;
if (!normalHelperMode && !ownedRouteClassifierEnabled && !defaultEndpointClassifierEnabled) {
  process.exit(1);
}
const ownedRouteHost = '127.0.0.1';
const ownedRoutePort = 33117;
const ownedRouteSlots = [
  { name: 'health', requestPath: '/healthz' },
  { name: 'readiness', requestPath: '/readyz' },
  { name: 'api-local', requestPath: '/_reference/demo-tenants' },
  { name: 'sentinel', requestPath: '/_reference/__d17-owned-route-classifier-absent__' },
];
const ownedRouteClassifications = {
  health: {
    success: 'owned-healthz-2xx',
    missing: 'owned-healthz-404',
    other: 'owned-healthz-other',
    connectFailed: 'owned-healthz-connect-failed',
  },
  readiness: {
    success: 'owned-readyz-2xx',
    missing: 'owned-readyz-404',
    unavailable: 'owned-readyz-503',
    other: 'owned-readyz-other',
    connectFailed: 'owned-readyz-connect-failed',
  },
  'api-local': {
    success: 'owned-api-local-2xx',
    missing: 'owned-api-local-404',
    other: 'owned-api-local-other',
    connectFailed: 'owned-api-local-connect-failed',
  },
  sentinel: {
    missing: 'owned-sentinel-404',
    other: 'owned-sentinel-other',
    connectFailed: 'owned-sentinel-connect-failed',
  },
};
const defaultEndpointOutputPrefix = '[reference-api-default-endpoint]';
const defaultEndpointPort = 3000;
const defaultEndpointSlots = [
  { name: 'healthz', requestPath: '/healthz' },
  { name: 'readyz', requestPath: '/readyz' },
];
const defaultEndpointClassifications = {
  healthz: {
    success: 'default-healthz-2xx',
    missing: 'default-healthz-404',
    other: 'default-healthz-other',
    connectFailed: 'default-healthz-connect-failed',
  },
  readyz: {
    success: 'default-readyz-2xx',
    missing: 'default-readyz-404',
    unavailable: 'default-readyz-503',
    other: 'default-readyz-other',
    connectFailed: 'default-readyz-connect-failed',
  },
};
const readinessIndicatorNames = ['postgres', 'redis', 'jwks', 's3'];
const defaultReadinessIndicatorCodes = {
  postgres: {
    pass: 'default-readyz-postgres-pass',
    fail: 'default-readyz-postgres-fail',
  },
  redis: { pass: 'default-readyz-redis-pass', fail: 'default-readyz-redis-fail' },
  jwks: { pass: 'default-readyz-jwks-pass', fail: 'default-readyz-jwks-fail' },
  s3: { pass: 'default-readyz-s3-pass', fail: 'default-readyz-s3-fail' },
};
const defaultEndpointFinalCodes = {
  ready: 'default-endpoint-ready',
  unavailable: 'default-endpoint-unavailable',
  indeterminate: 'default-endpoint-indeterminate',
};
const visibleStartupSuccessCodes = [...helperSuccessStates, ...startupSuccessStates];
const startupFailureReasons = ['nest-initialization', 'pre-listen-configuration', 'listen'];
const visibleStartupFailureCodes = new Set([
  ...startupFailureReasons.map((reason) => `bootstrap-failed:${reason}`),
  ...composeUpTerminalCodes,
  'child-error',
  'child-disconnect',
  'child-exit',
]);
const scriptPath = fileURLToPath(import.meta.url);
const postgresPort = process.env.STYNX_POSTGRES_PORT ?? '55432';
const redisPublish = process.env.TESTCONTAINERS_HOST_OVERRIDE ? '0.0.0.0::6379' : '127.0.0.1::6379';
let composeTempDir;
let composeFile;
try {
  composeTempDir =
    process.env.STYNX_REFERENCE_API_STACK_COMPOSE_DIR ??
    (await mkdtemp(resolve(tmpdir(), 'stynx-reference-api-stack-')));
  composeFile = resolve(composeTempDir, 'compose.yml');

  if (!process.env.STYNX_REFERENCE_API_STACK_COMPOSE_DIR) {
    await writeFile(
      composeFile,
      `services:\n  postgres:\n    image: postgres:16-alpine\n    environment:\n      GLOG_minloglevel: '2'\n      POSTGRES_DB: postgres\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: postgres\n    healthcheck:\n      test: ['CMD-SHELL', 'pg_isready -U postgres -d postgres']\n      interval: 5s\n      timeout: 5s\n      retries: 20\n    ports:\n      - '${postgresPort}:5432'\n  redis:\n    image: redis:7-alpine\n    environment:\n      GLOG_minloglevel: '2'\n    healthcheck:\n      test: ['CMD', 'redis-cli', 'ping']\n      interval: 5s\n      timeout: 5s\n      retries: 20\n    ports:\n      - '${redisPublish}'\n`,
      'utf8',
    );
  }
} catch {
  if (composeTempDir) {
    await rm(composeTempDir, { recursive: true, force: true }).catch(() => undefined);
  }
  process.exit(1);
}

let shuttingDown = false;
let composeDownComplete = false;
let suppressExitCleanupRetry = false;
let composeDownProcess;
let apiProcess;
let startupStateIndex = 0;
let visibleStartupStateIndex = 0;
let startupTerminal = false;
let startupFailureStarted = false;
let apiListening = false;
let runtimeRouteTableAccepted = false;
let ownedRouteClassifierComplete = false;
let defaultEndpointClassifierComplete = false;
const recordedStartupCodes = new Set();
const recordedOwnedRouteCodes = new Set();
const recordedDefaultEndpointCodes = new Set();

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

  try {
    spawnSync('docker', ['compose', '-f', composeFile, 'down', '-v'], {
      cwd: workspaceRoot,
      stdio: 'ignore',
    });
    rmSync(composeTempDir, { recursive: true, force: true });
  } catch {
    process.exit(1);
  }
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

  let watchdog;
  try {
    watchdog = spawn(process.execPath, [scriptPath], {
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
  } catch {
    stopApiProcess();
    try {
      rmSync(composeTempDir, { recursive: true, force: true });
    } catch {
      // The owned temporary directory remains the only cleanup target.
    }
    process.exit(1);
  }
  watchdog.once('error', () => {
    stopApiProcess();
    process.exit(1);
  });
  watchdog.unref();
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }

  return new Promise((resolveExit) => {
    child.once('error', () => {
      resolveExit({ code: null, signal: null, failed: true });
    });
    child.once('exit', (code, signal) => {
      resolveExit({ code, signal, failed: false });
    });
  });
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  try {
    stopApiProcess(signal);
  } catch {
    // Continue into the existing confined owned-stack cleanup.
  }
  let boundedExitCode = exitCode;
  try {
    await composeDown();
  } catch {
    boundedExitCode = 1;
  }
  process.exit(boundedExitCode);
}

function stopApiProcess(signal = 'SIGTERM') {
  if (!apiProcess || apiProcess.exitCode !== null || apiProcess.signalCode !== null) {
    return;
  }

  apiProcess.kill(signal);
}

function recordStartupCode(code) {
  const isStartupSuccess = visibleStartupSuccessCodes[visibleStartupStateIndex] === code;
  const isRuntimeRouteTableState =
    visibleStartupStateIndex === visibleStartupSuccessCodes.length &&
    runtimeRouteTableStates.includes(code);
  const isSuccess = isStartupSuccess || isRuntimeRouteTableState;
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
  const suppressedStderrWrite = process.stderr.write;
  process.stderr.write = governedStderrWrite;
  try {
    console.error(`${startupOutputPrefix} ${code}`);
  } finally {
    process.stderr.write = suppressedStderrWrite;
  }
  return true;
}

function recordAcceptedStartupState(record) {
  recordStartupCode(record.state);
}

function recordOwnedRouteCode(code) {
  if (recordedOwnedRouteCodes.has(code)) {
    return false;
  }
  recordedOwnedRouteCodes.add(code);
  const suppressedStderrWrite = process.stderr.write;
  process.stderr.write = governedStderrWrite;
  try {
    console.error(`${ownedRouteOutputPrefix} ${code}`);
  } finally {
    process.stderr.write = suppressedStderrWrite;
  }
  return true;
}

function recordDefaultEndpointCode(code) {
  if (recordedDefaultEndpointCodes.has(code)) {
    return false;
  }
  recordedDefaultEndpointCodes.add(code);
  const suppressedStderrWrite = process.stderr.write;
  process.stderr.write = governedStderrWrite;
  try {
    console.error(`${defaultEndpointOutputPrefix} ${code}`);
  } finally {
    process.stderr.write = suppressedStderrWrite;
  }
  return true;
}

function parseUniqueJson(text) {
  let index = 0;
  const skipWhitespace = () => {
    while (/\s/u.test(text[index] ?? '')) {
      index += 1;
    }
  };
  const stringToken = () => {
    if (text[index] !== '"') {
      throw new Error('invalid-default-readiness-body');
    }
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
        continue;
      }
      if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      index += 1;
    }
    throw new Error('invalid-default-readiness-body');
  };
  const value = () => {
    skipWhitespace();
    if (text[index] === '{') {
      object();
      return;
    }
    if (text[index] === '[') {
      index += 1;
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      while (true) {
        value();
        skipWhitespace();
        if (text[index] === ']') {
          index += 1;
          return;
        }
        if (text[index] !== ',') {
          throw new Error('invalid-default-readiness-body');
        }
        index += 1;
      }
    }
    if (text[index] === '"') {
      stringToken();
      return;
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(
      text.slice(index),
    );
    if (!match) {
      throw new Error('invalid-default-readiness-body');
    }
    index += match[0].length;
  };
  const object = () => {
    const keys = new Set();
    index += 1;
    skipWhitespace();
    if (text[index] === '}') {
      index += 1;
      return;
    }
    while (true) {
      skipWhitespace();
      const key = stringToken();
      if (keys.has(key)) {
        throw new Error('invalid-default-readiness-body');
      }
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ':') {
        throw new Error('invalid-default-readiness-body');
      }
      index += 1;
      value();
      skipWhitespace();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      if (text[index] !== ',') {
        throw new Error('invalid-default-readiness-body');
      }
      index += 1;
    }
  };

  value();
  skipWhitespace();
  if (index !== text.length) {
    throw new Error('invalid-default-readiness-body');
  }
  return JSON.parse(text);
}

function validateDefaultReadinessBody(body) {
  if (typeof body !== 'string' || Buffer.byteLength(body) > 16_384) {
    return undefined;
  }
  let parsed;
  try {
    parsed = parseUniqueJson(body);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  if (Object.keys(parsed).sort().join(',') !== 'details,error,info,status') {
    return undefined;
  }
  if (parsed.status !== 'error') {
    return undefined;
  }
  for (const projection of [parsed.info, parsed.details]) {
    if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
      return undefined;
    }
    if (
      Object.keys(projection).sort().join(',') !== readinessIndicatorNames.slice().sort().join(',')
    ) {
      return undefined;
    }
  }

  const indicators = [];
  for (const name of readinessIndicatorNames) {
    const info = parsed.info[name];
    const details = parsed.details[name];
    if (
      !info ||
      typeof info !== 'object' ||
      Array.isArray(info) ||
      !Object.hasOwn(info, 'status') ||
      !details ||
      typeof details !== 'object' ||
      Array.isArray(details) ||
      !Object.hasOwn(details, 'status') ||
      !['up', 'down'].includes(info.status) ||
      details.status !== info.status
    ) {
      return undefined;
    }
    indicators.push({ name, passing: info.status === 'up' });
  }
  const downIndicators = indicators.filter(({ passing }) => !passing).map(({ name }) => name);
  if (downIndicators.length === 0) {
    return undefined;
  }
  if (!parsed.error || typeof parsed.error !== 'object' || Array.isArray(parsed.error)) {
    return undefined;
  }
  if (Object.keys(parsed.error).sort().join(',') !== downIndicators.slice().sort().join(',')) {
    return undefined;
  }
  return indicators;
}

function classifyOwnedRouteStatus(slot, status) {
  const classifications = ownedRouteClassifications[slot];
  if (status >= 200 && status < 300 && classifications.success) {
    return classifications.success;
  }
  if (status === 404) {
    return classifications.missing;
  }
  if (slot === 'readiness' && status === 503) {
    return classifications.unavailable;
  }
  return classifications.other;
}

function requestOwnedRoute(slot) {
  return new Promise((resolveClassification) => {
    let settled = false;
    const settle = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolveClassification(code);
    };
    try {
      const request = get(
        {
          host: ownedRouteHost,
          port: ownedRoutePort,
          path: slot.requestPath,
          method: 'GET',
        },
        (response) => {
          const code = classifyOwnedRouteStatus(slot.name, response.statusCode);
          response.resume();
          settle(code);
        },
      );
      request.once('error', () => {
        settle(ownedRouteClassifications[slot.name].connectFailed);
      });
    } catch {
      settle(ownedRouteClassifications[slot.name].connectFailed);
    }
  });
}

async function runOwnedRouteClassifier() {
  const slotCodes = [];
  for (const slot of ownedRouteSlots) {
    const code = await requestOwnedRoute(slot);
    if (startupFailureStarted || shuttingDown) {
      return;
    }
    slotCodes.push(code);
    if (!recordOwnedRouteCode(code)) {
      failStartup('duplicate-owned-route-code');
      return;
    }
  }

  const finalCode =
    slotCodes[0] === 'owned-healthz-2xx' &&
    ['owned-readyz-2xx', 'owned-readyz-503'].includes(slotCodes[1]) &&
    slotCodes[2] === 'owned-api-local-2xx' &&
    slotCodes[3] === 'owned-sentinel-404'
      ? 'owned-full-table-present'
      : slotCodes.every((code) =>
            [
              'owned-healthz-404',
              'owned-readyz-404',
              'owned-api-local-404',
              'owned-sentinel-404',
            ].includes(code),
          )
        ? 'owned-full-table-absent'
        : 'owned-full-table-indeterminate';
  if (!recordOwnedRouteCode(finalCode)) {
    failStartup('duplicate-owned-route-code');
    return;
  }
  ownedRouteClassifierComplete = true;
  suppressExitCleanupRetry = true;
  await shutdown('SIGTERM', 0);
}

function classifyDefaultEndpointStatus(slot, status) {
  const classifications = defaultEndpointClassifications[slot];
  if (status >= 200 && status < 300) {
    return classifications.success;
  }
  if (status === 404) {
    return classifications.missing;
  }
  if (slot === 'readyz' && status === 503) {
    return classifications.unavailable;
  }
  return classifications.other;
}

function requestDefaultEndpoint(slot) {
  return new Promise((resolveClassification, rejectClassification) => {
    let settled = false;
    let awaitingReadinessBody = false;
    const settle = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolveClassification(result);
    };
    const reject = () => {
      if (settled) {
        return;
      }
      settled = true;
      rejectClassification(new Error('default-endpoint-classifier-failed'));
    };
    try {
      const request = get(
        {
          host: ownedRouteHost,
          port: defaultEndpointPort,
          path: slot.requestPath,
          method: 'GET',
        },
        (response) => {
          const status = response.statusCode;
          if (!Number.isSafeInteger(status) || status < 100 || status > 599) {
            response.resume();
            reject();
            return;
          }
          if (slot.name !== 'readyz' || status !== 503) {
            response.once('error', () => undefined);
            response.resume();
            settle({ code: classifyDefaultEndpointStatus(slot.name, status) });
            return;
          }

          awaitingReadinessBody = true;
          const chunks = [];
          let byteLength = 0;
          response.on('data', (chunk) => {
            if (settled) {
              return;
            }
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            byteLength += bytes.length;
            if (byteLength > 16_384) {
              chunks.length = 0;
              response.destroy();
              reject();
              return;
            }
            chunks.push(bytes);
          });
          response.once('aborted', reject);
          response.once('error', reject);
          response.once('close', () => {
            if (!response.complete) {
              reject();
            }
          });
          response.once('end', () => {
            if (settled || !response.complete) {
              reject();
              return;
            }
            let body;
            try {
              body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
                Buffer.concat(chunks, byteLength),
              );
            } catch {
              chunks.length = 0;
              reject();
              return;
            }
            chunks.length = 0;
            const indicators = validateDefaultReadinessBody(body);
            if (!indicators) {
              reject();
              return;
            }
            settle({ code: defaultEndpointClassifications.readyz.unavailable, indicators });
          });
        },
      );
      request.once('error', () => {
        if (awaitingReadinessBody) {
          reject();
        } else {
          settle({ code: defaultEndpointClassifications[slot.name].connectFailed });
        }
      });
    } catch {
      settle({ code: defaultEndpointClassifications[slot.name].connectFailed });
    }
  });
}

async function runDefaultEndpointClassifier() {
  const health = await requestDefaultEndpoint(defaultEndpointSlots[0]);
  if (startupFailureStarted || shuttingDown || !recordDefaultEndpointCode(health.code)) {
    throw new Error('default-endpoint-classifier-failed');
  }

  const readiness = await requestDefaultEndpoint(defaultEndpointSlots[1]);
  if (startupFailureStarted || shuttingDown || !recordDefaultEndpointCode(readiness.code)) {
    throw new Error('default-endpoint-classifier-failed');
  }
  if (readiness.indicators) {
    for (const { name, passing } of readiness.indicators) {
      const code = defaultReadinessIndicatorCodes[name][passing ? 'pass' : 'fail'];
      if (!recordDefaultEndpointCode(code)) {
        throw new Error('default-endpoint-classifier-failed');
      }
    }
  }

  const finalCode =
    health.code === defaultEndpointClassifications.healthz.success &&
    readiness.code === defaultEndpointClassifications.readyz.success
      ? defaultEndpointFinalCodes.ready
      : health.code === defaultEndpointClassifications.healthz.success &&
          readiness.code === defaultEndpointClassifications.readyz.unavailable
        ? defaultEndpointFinalCodes.unavailable
        : defaultEndpointFinalCodes.indeterminate;
  if (!recordDefaultEndpointCode(finalCode)) {
    throw new Error('default-endpoint-classifier-failed');
  }
  defaultEndpointClassifierComplete = true;
  suppressExitCleanupRetry = true;
  await shutdown('SIGTERM', 0);
}

function failStartup(code) {
  if (startupFailureStarted) {
    return;
  }
  startupFailureStarted = true;
  if (defaultEndpointClassifierEnabled) {
    suppressExitCleanupRetry = true;
  }
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
  if (runtimeRouteTableStates.includes(record.state)) {
    if (keys !== 'protocol,state') {
      failStartup('unbounded-record');
      return;
    }
    if (
      !apiListening ||
      startupStateIndex !== startupSuccessStates.length ||
      runtimeRouteTableAccepted
    ) {
      failStartup('out-of-order-record');
      return;
    }
    runtimeRouteTableAccepted = true;
    recordAcceptedStartupState(record);
    startupTerminal = true;
    if (ownedRouteClassifierEnabled) {
      if (record.state !== 'runtime-route-table-present') {
        failStartup('owned-route-table-not-present');
        return;
      }
      void runOwnedRouteClassifier().catch(() => {
        failStartup('owned-route-classifier-failed');
      });
    }
    if (defaultEndpointClassifierEnabled) {
      if (record.state !== 'runtime-route-table-present') {
        failStartup('default-endpoint-route-table-not-present');
        return;
      }
      void runDefaultEndpointClassifier().catch(() => {
        failStartup('default-endpoint-classifier-failed');
      });
    }
    return;
  }
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
  if (composeDownComplete || suppressExitCleanupRetry) {
    return;
  }

  if (apiProcess && apiProcess.exitCode === null && apiProcess.signalCode === null) {
    apiProcess.kill('SIGTERM');
  }

  try {
    spawnSync('docker', ['compose', '-f', composeFile, 'down', '-v'], {
      cwd: workspaceRoot,
      stdio: 'ignore',
    });
    rmSync(composeTempDir, { recursive: true, force: true });
  } catch {
    // Exit cleanup is best-effort and must never expose host diagnostics.
  }
  composeDownComplete = true;
}

async function runChecked(command, args, terminalCodes) {
  const child = run(command, args, { stdio: 'ignore' });
  const result = await waitForExit(child);
  if (terminalCodes) {
    let classification;
    if (result.failed) {
      classification = terminalCodes[0];
    } else if (result.signal !== null) {
      classification = terminalCodes[2];
    } else if (Number.isInteger(result.code) && result.code !== 0) {
      classification = terminalCodes[1];
    } else if (result.code === 0) {
      return;
    }
    if (classification) {
      recordStartupCode(classification);
    }
    throw new Error('compose-up-failed');
  }
  if (result.failed || result.code !== 0) {
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
  await rm(composeTempDir, { recursive: true, force: true }).catch(() => undefined);
  process.exit(1);
}
let redisPort;
try {
  recordStartupCode('helper-entered');
  await runChecked(
    'docker',
    ['compose', '-f', composeFile, 'up', '--wait', 'postgres', 'redis'],
    composeUpTerminalCodes,
  );
  recordStartupCode('compose-ready');
  redisPort = discoverOwnedRedisPort();
  recordStartupCode('redis-mapping-resolved');
  await runChecked('node', [verifyReferenceApiBuildInputs]);
  recordStartupCode('build-inputs-verified');
} catch {
  try {
    await composeDown();
  } finally {
    process.exit(1);
  }
}

const childEnvironment = { ...process.env };
delete childEnvironment.STYNX_REFERENCE_API_HELPER_MANAGED;
delete childEnvironment.STYNX_REFERENCE_API_OWNED_DIAGNOSTIC;
childEnvironment.STYNX_REFERENCE_API_HELPER_MANAGED = '1';
if (ownedRouteClassifierEnabled) {
  childEnvironment.STYNX_REFERENCE_API_OWNED_DIAGNOSTIC = '1';
}

apiProcess = run('node', [referenceApiMain], {
  stdio: ['inherit', 'ignore', 'ignore', 'ipc'],
  env: {
    ...childEnvironment,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
    AWS_EC2_METADATA_DISABLED: process.env.AWS_EC2_METADATA_DISABLED ?? 'true',
    NODE_ENV: 'development',
    PORT: ownedRouteClassifierEnabled ? String(ownedRoutePort) : '3000',
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
  if (
    !runtimeRouteTableAccepted ||
    (ownedRouteClassifierEnabled && !ownedRouteClassifierComplete) ||
    (defaultEndpointClassifierEnabled && !defaultEndpointClassifierComplete)
  ) {
    failStartup('child-error');
  }
});
apiProcess.once('disconnect', () => {
  if (
    !runtimeRouteTableAccepted ||
    (ownedRouteClassifierEnabled && !ownedRouteClassifierComplete) ||
    (defaultEndpointClassifierEnabled && !defaultEndpointClassifierComplete)
  ) {
    failStartup('child-disconnect');
  }
});
apiProcess.once('exit', (code, signal) => {
  if (shuttingDown || startupFailureStarted) {
    return;
  }
  if (
    !runtimeRouteTableAccepted ||
    (ownedRouteClassifierEnabled && !ownedRouteClassifierComplete) ||
    (defaultEndpointClassifierEnabled && !defaultEndpointClassifierComplete)
  ) {
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
