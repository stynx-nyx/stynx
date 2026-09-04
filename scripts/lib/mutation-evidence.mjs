import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { MUTANT_STATUSES, canonicalize, sha256Hex } from './mutation-roster.mjs';

const MUTATION_ENVIRONMENT_KEYS = [
  'CI',
  'COREPACK_HOME',
  'DATABASE_URL',
  'DOCKER_CONFIG',
  'DOCKER_HOST',
  'FORCE_COLOR',
  'HOME',
  'LANG',
  'LC_ALL',
  'LOGNAME',
  'NODE_OPTIONS',
  'NO_COLOR',
  'PATH',
  'PNPM_HOME',
  'SHELL',
  'STYNX_DATABASE_URL',
  'STYNX_TEST_PG_HOST',
  'STYNX_TEST_PG_PASSWORD',
  'STYNX_TEST_PG_PORT',
  'STYNX_TEST_PG_SOCKET_DIR',
  'STYNX_TEST_PG_TEMPLATE',
  'STYNX_TEST_PG_USER',
  'TEMP',
  'TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE',
  'TESTCONTAINERS_REUSE_ENABLE',
  'TMP',
  'TMPDIR',
  'TZ',
  'USER',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
];

const CREDENTIAL_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bnpm_[A-Za-z0-9]{20,}\b/u,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  /\b(?:https?|git|ssh):\/\/[^\s/:@]+:[^\s/@]+@/u,
];

const HOST_PATH_PATTERNS = [
  /\bfile:\/\//iu,
  /(?:^|[\s"'(=:])\/(?:Users|home|private|tmp|var\/folders)\//u,
  /(?:^|[\s"'(=:])[A-Za-z]:[\\/]/u,
  /(?:^|[\s"'(=:])\\\\[^\\\s]+\\/u,
];

const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 1_000_000;
const MAX_TEXT_BYTES = 16 * 1024 * 1024;
const FULL_MUTATION_POSTGRES_CONTROLS = [
  'STYNX_TEST_PG_HOST',
  'STYNX_TEST_PG_PORT',
  'STYNX_TEST_PG_USER',
  'STYNX_TEST_PG_TEMPLATE',
];

export const FULL_MUTATION_ARTIFACT_ROOT = '.devai/state/check-cache/v1/artifacts/mutation';
export const GOVERNED_MUTATION_DIFF_ARGUMENTS = Object.freeze([
  '-c',
  'core.abbrev=9',
  '-c',
  'color.ui=false',
  '-c',
  'diff.noprefix=false',
  '-c',
  'diff.mnemonicprefix=false',
  '-c',
  'diff.algorithm=myers',
  '-c',
  'diff.indentHeuristic=true',
  '-c',
  'core.autocrlf=false',
  'diff',
  '--no-ext-diff',
  '--no-textconv',
  '--binary',
  'HEAD',
  '--',
]);

function runInfrastructureCommand(command, arguments_, options) {
  return spawnSync(command, arguments_, {
    ...options,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

function infrastructureCommandPassed(result) {
  return result.error === undefined && result.signal === null && result.status === 0;
}

function fullMutationPreflightFailure(reason, docker, postgres) {
  return {
    ok: false,
    mode: 'full-roster',
    classification: 'mutation-harness-failure',
    reason,
    packagesStarted: 0,
    preflight: { docker, postgres },
  };
}

export function preflightFullMutationInfrastructure({
  environment = process.env,
  commandRun = runInfrastructureCommand,
} = {}) {
  const childEnvironment = buildMutationEnvironment(environment);
  const missingPostgresControls = FULL_MUTATION_POSTGRES_CONTROLS.some(
    (key) => typeof childEnvironment[key] !== 'string' || childEnvironment[key].length === 0,
  );
  const dockerReady = infrastructureCommandPassed(
    commandRun('docker', ['info'], { env: childEnvironment }),
  );
  if (missingPostgresControls) {
    return fullMutationPreflightFailure(
      'missing-postgres-controls',
      dockerReady ? 'ready' : 'unreachable',
      'missing-controls',
    );
  }
  if (!dockerReady) {
    return fullMutationPreflightFailure('docker-unreachable', 'unreachable', 'not-checked');
  }
  const postgresReady = infrastructureCommandPassed(
    commandRun(
      'pg_isready',
      [
        '-h',
        childEnvironment.STYNX_TEST_PG_HOST,
        '-p',
        childEnvironment.STYNX_TEST_PG_PORT,
        '-U',
        childEnvironment.STYNX_TEST_PG_USER,
        '-d',
        childEnvironment.STYNX_TEST_PG_TEMPLATE,
      ],
      { env: childEnvironment },
    ),
  );
  if (!postgresReady) {
    return fullMutationPreflightFailure('postgres-unreachable', 'ready', 'unreachable');
  }
  return undefined;
}

const SCORED_MUTANT_STATUSES = new Set(['Killed', 'NoCoverage', 'Survived', 'Timeout']);

class MutationEvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MutationEvidenceError';
    this.code = code;
  }
}

function unsafeCredential(value) {
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value));
}

function normalizeRepositoryPath(value, repoRoot) {
  const normalizedRoot = resolve(repoRoot).replaceAll('\\', '/').replace(/\/$/u, '');
  const normalizedValue = value.replaceAll('\\', '/');
  if (normalizedValue === normalizedRoot) return '.';
  if (normalizedValue.startsWith(`${normalizedRoot}/`)) {
    return `./${normalizedValue.slice(normalizedRoot.length + 1)}`;
  }
  return value;
}

function normalizeKnownPathInText(value, knownPath) {
  let result = '';
  let cursor = 0;
  while (cursor < value.length) {
    const rootIndex = value.indexOf(knownPath, cursor);
    if (rootIndex === -1) return result + value.slice(cursor);
    const following = value[rootIndex + knownPath.length];
    const isRepositoryPath =
      following === undefined || following === '/' || /[\s"'():,;]/u.test(following);
    result += value.slice(cursor, rootIndex);
    if (isRepositoryPath) {
      result += '.';
      cursor = rootIndex + knownPath.length;
    } else {
      result += knownPath;
      cursor = rootIndex + knownPath.length;
    }
  }
  return result;
}

function normalizeRepositoryPathsInText(value, repoRoot) {
  const normalizedRoot = resolve(repoRoot).replaceAll('\\', '/').replace(/\/$/u, '');
  const normalizedValue = value.replaceAll('\\', '/');
  const withoutRepositoryFileUrls = normalizeKnownPathInText(
    normalizedValue,
    `file://${normalizedRoot}`,
  );
  return normalizeKnownPathInText(withoutRepositoryFileUrls, normalizedRoot);
}

function sanitizeString(value, repoRoot) {
  if (Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) {
    throw new MutationEvidenceError(
      'MUTATION_REPORT_BOUNDS',
      'mutation report text exceeds the portable evidence bound',
    );
  }
  if (unsafeCredential(value)) {
    throw new MutationEvidenceError(
      'MUTATION_REPORT_CREDENTIAL_MATERIAL',
      'mutation report contains credential-shaped material',
    );
  }
  const normalized = normalizeRepositoryPath(value, repoRoot);
  if (HOST_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new MutationEvidenceError(
      'MUTATION_REPORT_HOST_PATH',
      'mutation report contains a workstation-specific path',
    );
  }
  return normalized;
}

function sanitizeJson(value, repoRoot, state, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
    throw new MutationEvidenceError(
      'MUTATION_REPORT_BOUNDS',
      'mutation report exceeds the portable evidence structure bound',
    );
  }
  if (typeof value === 'string') return sanitizeString(value, repoRoot);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJson(entry, repoRoot, state, depth + 1));
  }
  if (typeof value !== 'object') {
    throw new MutationEvidenceError(
      'MUTATION_REPORT_VALUE',
      'mutation report contains a non-JSON value',
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      sanitizeString(key, repoRoot),
      sanitizeJson(entry, repoRoot, state, depth + 1),
    ]),
  );
}

function assertNoCredentialMaterial(value, state, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
    throw new MutationEvidenceError(
      'MUTATION_REPORT_BOUNDS',
      'mutation report exceeds the portable evidence structure bound',
    );
  }
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) {
      throw new MutationEvidenceError(
        'MUTATION_REPORT_BOUNDS',
        'mutation report text exceeds the portable evidence bound',
      );
    }
    if (unsafeCredential(value)) {
      throw new MutationEvidenceError(
        'MUTATION_REPORT_CREDENTIAL_MATERIAL',
        'mutation report contains credential-shaped material',
      );
    }
    return;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return;
  if (Array.isArray(value)) {
    for (const entry of value) assertNoCredentialMaterial(entry, state, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    assertNoCredentialMaterial(key, state, depth + 1);
    assertNoCredentialMaterial(entry, state, depth + 1);
  }
}

function omitNonEvidentiaryMutationContent(report) {
  for (const fileResult of Object.values(report.files ?? {})) {
    if (fileResult && typeof fileResult === 'object' && !Array.isArray(fileResult)) {
      delete fileResult.source;
    }
    if (!Array.isArray(fileResult?.mutants)) continue;
    for (const mutant of fileResult.mutants) {
      if (mutant && typeof mutant === 'object' && !Array.isArray(mutant)) {
        delete mutant.replacement;
        delete mutant.statusReason;
      }
    }
  }
  for (const testFile of Object.values(report.testFiles ?? {})) {
    if (testFile && typeof testFile === 'object' && !Array.isArray(testFile)) {
      delete testFile.source;
    }
  }
}

function portablePath(path, label) {
  if (
    typeof path !== 'string' ||
    path === '' ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new MutationEvidenceError(
      'MUTATION_REPORT_PATH',
      `${label} is not a portable repository-relative path`,
    );
  }
  return path;
}

export function buildMutationEnvironment(parentEnvironment) {
  const environment = {};
  for (const key of MUTATION_ENVIRONMENT_KEYS) {
    const value = parentEnvironment[key];
    if (value !== undefined) environment[key] = value;
  }
  environment.STRYKER_INCREMENTAL = 'false';
  return environment;
}

export function normalizeMutationReport(raw, thresholds, workspace, repoRoot) {
  assertNoCredentialMaterial(raw, { nodes: 0 });
  const portableRaw = structuredClone(raw);
  omitNonEvidentiaryMutationContent(portableRaw);
  const report = sanitizeJson(portableRaw, repoRoot, { nodes: 0 });
  if (
    report.thresholds?.break !== thresholds.break ||
    report.thresholds?.high !== thresholds.high ||
    report.thresholds?.low !== thresholds.low
  ) {
    throw new MutationEvidenceError(
      'MUTATION_REPORT_THRESHOLDS',
      `${workspace}: Stryker report thresholds differ from the discovered contract`,
    );
  }
  report.projectRoot = '.';
  report.config = {};
  report.thresholds = { ...thresholds };
  for (const path of Object.keys(report.files ?? {})) portablePath(path, `${workspace} source`);
  for (const path of Object.keys(report.testFiles ?? {})) portablePath(path, `${workspace} test`);
  if (!report.framework || typeof report.framework !== 'object') {
    throw new MutationEvidenceError(
      'MUTATION_REPORT_FRAMEWORK',
      `${workspace}: Stryker framework metadata is missing`,
    );
  }
  if (typeof report.framework.version !== 'string' || report.framework.version === '') {
    throw new MutationEvidenceError(
      'MUTATION_REPORT_FRAMEWORK',
      `${workspace}: Stryker version is missing`,
    );
  }
  return report;
}


export function withMutationReportCleanup(repoRoot, workspace, callback) {
  portablePath(workspace, 'mutation workspace');
  const rawReportDirectory = resolve(repoRoot, workspace, 'reports/mutation');
  const escaped = relative(resolve(repoRoot), rawReportDirectory);
  if (escaped.startsWith('..') || isAbsolute(escaped)) {
    throw new MutationEvidenceError(
      'MUTATION_REPORT_PATH',
      'mutation report directory escaped the repository',
    );
  }
  try {
    return callback(rawReportDirectory);
  } finally {
    rmSync(rawReportDirectory, { recursive: true, force: true });
  }
}

export function sanitizeMutationDiagnostic(value) {
  const text = String(value ?? '').trim();
  if (text === '') return 'mutation subprocess failed without a diagnostic';
  if (unsafeCredential(text)) return 'mutation subprocess emitted rejected credential material';
  if (HOST_PATH_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'mutation subprocess emitted a rejected workstation path';
  }
  return text.slice(-4096);
}

export function classifyMutationSubprocess(result, repoRoot) {
  const rawDiagnostic = `${String(result.error?.message ?? '')}\n${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}`;
  if (result.error !== undefined) return 'spawn-error';
  if (result.signal !== null) return 'signal';
  if (unsafeCredential(rawDiagnostic)) return 'rejected-credential-material';
  if (result.status === 0) return undefined;
  const diagnostic = repoRoot
    ? normalizeRepositoryPathsInText(rawDiagnostic, repoRoot)
    : rawDiagnostic;
  if (HOST_PATH_PATTERNS.some((pattern) => pattern.test(diagnostic))) {
    return 'rejected-workstation-path';
  }
  return 'nonzero-exit';
}

export function classifyMutationOutcome({
  reportState,
  score,
  threshold,
  subprocessResult,
  reportFailureCode,
  repoRoot,
}) {
  const subprocessFailure = subprocessResult
    ? classifyMutationSubprocess(subprocessResult, repoRoot)
    : undefined;
  if (reportState === 'normalized') {
    if (score < threshold) return { classification: 'mutation-score-failure' };
    if (subprocessFailure) {
      return { classification: 'mutation-harness-failure', reason: subprocessFailure };
    }
    return { classification: 'mutation-pass' };
  }
  if (reportState === 'missing') {
    return {
      classification: 'mutation-harness-failure',
      reason: subprocessFailure ?? 'missing-report',
    };
  }
  const subprocessFailed =
    subprocessResult &&
    (subprocessResult.error !== undefined ||
      subprocessResult.signal !== null ||
      subprocessResult.status !== 0);
  return subprocessFailed
    ? {
        classification: 'mutation-harness-failure',
        reason: subprocessFailure ?? 'nonzero-exit',
      }
    : {
        classification: 'mutation-portability-failure',
        reason: reportFailureCode ?? 'unsafe-report',
      };
}
