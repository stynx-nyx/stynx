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

export const FOCUSED_MUTATION_ARTIFACT_ROOT =
  '.devai/state/check-cache/v1/artifacts/mutation-focused';
export const FULL_MUTATION_ARTIFACT_ROOT = '.devai/state/check-cache/v1/artifacts/mutation';
export const FOCUSED_MUTATION_LIMITS = Object.freeze({
  report: 67_108_864,
  result: 65_536,
  manifest: 65_536,
  aggregate: 67_239_936,
  syntheticReportHeadroom: 50_331_648,
});
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
  const missingPostgresControls = FULL_MUTATION_POSTGRES_CONTROLS.some(
    (key) => typeof environment[key] !== 'string' || environment[key].length === 0,
  );
  const dockerReady = infrastructureCommandPassed(
    commandRun('docker', ['info'], { env: environment }),
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
        environment.STYNX_TEST_PG_HOST,
        '-p',
        environment.STYNX_TEST_PG_PORT,
        '-U',
        environment.STYNX_TEST_PG_USER,
        '-d',
        environment.STYNX_TEST_PG_TEMPLATE,
      ],
      { env: environment },
    ),
  );
  if (!postgresReady) {
    return fullMutationPreflightFailure('postgres-unreachable', 'ready', 'unreachable');
  }
  return undefined;
}

const FOCUSED_FORBIDDEN_KEYS = new Set([
  'coveredBy',
  'killedBy',
  'replacement',
  'source',
  'statusReason',
  'testFiles',
]);
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

export function projectFocusedMutationReport(report, repoRoot) {
  const persisted = structuredClone(report);
  delete persisted.testFiles;
  for (const fileResult of Object.values(persisted.files ?? {})) {
    delete fileResult.source;
    for (const mutant of fileResult.mutants ?? []) {
      delete mutant.coveredBy;
      delete mutant.killedBy;
      delete mutant.replacement;
      delete mutant.statusReason;
    }
  }
  assertFocusedEvidenceSafe(persisted, repoRoot);
  return persisted;
}

export function assertFocusedEvidenceSafe(value, repoRoot) {
  function inspect(entry, depth = 0) {
    if (depth > MAX_JSON_DEPTH) {
      throw new MutationEvidenceError(
        'MUTATION_FOCUSED_BOUNDS',
        'focused mutation evidence exceeds the structure bound',
      );
    }
    if (Array.isArray(entry)) {
      for (const item of entry) inspect(item, depth + 1);
      return;
    }
    if (!entry || typeof entry !== 'object') return;
    for (const [key, item] of Object.entries(entry)) {
      if (FOCUSED_FORBIDDEN_KEYS.has(key)) {
        throw new MutationEvidenceError(
          'MUTATION_FOCUSED_FORBIDDEN_FIELD',
          'focused mutation evidence contains a forbidden field',
        );
      }
      inspect(item, depth + 1);
    }
  }
  inspect(value);
  const sanitized = sanitizeJson(structuredClone(value), repoRoot, { nodes: 0 });
  if (canonicalize(sanitized) !== canonicalize(value)) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_PORTABILITY',
      'focused mutation evidence is not already portable',
    );
  }
  return true;
}

export function focusedMutationCensus(report, statusTotals) {
  const targetFileCount = Object.keys(report.files ?? {}).length;
  const reportTotal = Object.values(report.files ?? {}).reduce(
    (total, fileResult) =>
      total + (Array.isArray(fileResult.mutants) ? fileResult.mutants.length : 0),
    0,
  );
  const total = MUTANT_STATUSES.reduce((sum, status) => sum + (statusTotals[status] ?? 0), 0);
  const scored = MUTANT_STATUSES.filter((status) => SCORED_MUTANT_STATUSES.has(status)).reduce(
    (sum, status) => sum + (statusTotals[status] ?? 0),
    0,
  );
  const nonScored = total - scored;
  if (
    Object.keys(statusTotals).sort().join('\0') !== [...MUTANT_STATUSES].sort().join('\0') ||
    !MUTANT_STATUSES.every(
      (status) => Number.isInteger(statusTotals[status]) && statusTotals[status] >= 0,
    ) ||
    reportTotal !== total
  ) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_ACCOUNTING',
      'focused mutation evidence has incomplete status accounting',
    );
  }
  return { targetFileCount, total, scored, nonScored };
}

export function assertFocusedMutationCensus(actual, expected) {
  if (canonicalize(actual) !== canonicalize(expected)) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_CENSUS',
      'focused mutation evidence differs from the governed census',
    );
  }
  return true;
}

export function assertFocusedMutationProcessResult(processResult, kind) {
  if (
    !processResult ||
    typeof processResult !== 'object' ||
    Array.isArray(processResult) ||
    Object.keys(processResult).sort().join('\0') !== 'errorAbsent\0signal\0status' ||
    typeof processResult.errorAbsent !== 'boolean' ||
    !(processResult.status === null || Number.isInteger(processResult.status)) ||
    !(
      processResult.signal === null ||
      (typeof processResult.signal === 'string' && /^SIG[A-Z0-9]+$/u.test(processResult.signal))
    ) ||
    !['failure', 'success'].includes(kind)
  ) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_PROCESS',
      'focused mutation evidence has an invalid process result',
    );
  }
  if (
    kind === 'success' &&
    (!processResult.errorAbsent || processResult.status !== 0 || processResult.signal !== null)
  ) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_PROCESS',
      'focused mutation success requires a clean process result',
    );
  }
  return true;
}

export function encodeFocusedMutationJson(value, limit, label) {
  const bytes = Buffer.from(`${canonicalize(value)}\n`, 'utf8');
  if (!Number.isInteger(limit) || limit < 1 || bytes.length > limit) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_BOUNDS',
      `${label} exceeds the focused mutation evidence bound`,
    );
  }
  return bytes;
}

export function assertFocusedMutationByteBounds({ reportBytes, resultBytes, manifestBytes, kind }) {
  const entries =
    kind === 'success'
      ? [
          ['report', reportBytes, FOCUSED_MUTATION_LIMITS.report],
          ['result', resultBytes, FOCUSED_MUTATION_LIMITS.result],
          ['manifest', manifestBytes, FOCUSED_MUTATION_LIMITS.manifest],
        ]
      : [['manifest', manifestBytes, FOCUSED_MUTATION_LIMITS.manifest]];
  for (const [label, bytes, limit] of entries) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > limit) {
      throw new MutationEvidenceError(
        'MUTATION_FOCUSED_BOUNDS',
        `${label} exceeds the focused mutation evidence bound`,
      );
    }
  }
  const aggregate = entries.reduce((total, [, bytes]) => total + bytes.length, 0);
  if (aggregate > FOCUSED_MUTATION_LIMITS.aggregate) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_BOUNDS',
      'focused mutation evidence exceeds the aggregate bound',
    );
  }
  return aggregate;
}

function defaultFocusedGitRun(repoRoot, arguments_) {
  return spawnSync('git', arguments_, {
    cwd: repoRoot,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
}

function checkedFocusedGitOutput(repoRoot, arguments_, label, gitRun) {
  const result = (gitRun ?? defaultFocusedGitRun)(repoRoot, arguments_);
  if (result.error !== undefined || result.signal !== null || result.status !== 0) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_GIT',
      `focused mutation evidence could not bind ${label}`,
    );
  }
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '', 'utf8');
}

function parseFocusedPorcelain(bytes) {
  const entries = bytes
    .toString('utf8')
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => {
      if (entry.length < 4 || entry[2] !== ' ') {
        throw new MutationEvidenceError(
          'MUTATION_FOCUSED_STATUS',
          'focused mutation evidence received malformed porcelain status',
        );
      }
      return { status: entry.slice(0, 2), path: entry.slice(3) };
    });
  return entries.sort((left, right) =>
    `${left.status}\0${left.path}`.localeCompare(`${right.status}\0${right.path}`),
  );
}

function validateInputDigests(inputDigests) {
  const keys = ['configDigest', 'packageDigest', 'sourceSetDigest', 'targetSetDigest'];
  if (
    Object.keys(inputDigests).sort().join('\0') !== keys.sort().join('\0') ||
    !keys.every((key) => /^[0-9a-f]{64}$/u.test(inputDigests[key] ?? ''))
  ) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_INPUT',
      'focused mutation input digests are incomplete',
    );
  }
}

export function captureFocusedMutationCandidate({
  repoRoot,
  allowedUnstagedPaths,
  readInputDigests,
  gitRun,
  fileSystem = FOCUSED_MUTATION_FILE_SYSTEM,
}) {
  const commit = checkedFocusedGitOutput(repoRoot, ['rev-parse', 'HEAD^{commit}'], 'commit', gitRun)
    .toString('utf8')
    .trim();
  const tree = checkedFocusedGitOutput(repoRoot, ['rev-parse', 'HEAD^{tree}'], 'tree', gitRun)
    .toString('utf8')
    .trim();
  if (!/^[0-9a-f]{40}$/u.test(commit) || !/^[0-9a-f]{40}$/u.test(tree)) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_IDENTITY',
      'focused mutation evidence received an invalid commit or tree',
    );
  }
  const index = (gitRun ?? defaultFocusedGitRun)(repoRoot, [
    'diff',
    '--cached',
    '--quiet',
    '--exit-code',
    '--',
  ]);
  if (index.error !== undefined || index.signal !== null || index.status !== 0) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_INDEX',
      'focused mutation evidence requires a clean index',
    );
  }
  const status = parseFocusedPorcelain(
    checkedFocusedGitOutput(
      repoRoot,
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      'porcelain status',
      gitRun,
    ),
  );
  const expectedPaths = [...allowedUnstagedPaths].sort();
  const expectedStatus = expectedPaths.map((path) => ({ status: ' M', path }));
  if (canonicalize(status) !== canonicalize(expectedStatus)) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_STATUS',
      'focused mutation evidence differs from the allowed unstaged population',
    );
  }
  const allowedUnstaged = expectedPaths.map((path) => {
    portablePath(path, 'focused mutation unstaged path');
    const absolute = resolve(repoRoot, path);
    const escaped = relative(resolve(repoRoot), absolute);
    if (escaped.startsWith('..') || isAbsolute(escaped)) {
      throw new MutationEvidenceError(
        'MUTATION_FOCUSED_PATH',
        'focused mutation unstaged path escaped the repository',
      );
    }
    const metadata = fileSystem.lstatSync(absolute);
    const mode = metadata.mode & 0o777;
    if (!metadata.isFile() || metadata.isSymbolicLink() || mode !== 0o644) {
      throw new MutationEvidenceError(
        'MUTATION_FOCUSED_MODE',
        'focused mutation unstaged path has the wrong mode',
      );
    }
    return { path, mode, digest: sha256Hex(fileSystem.readFileSync(absolute)) };
  });
  const ignored = parseFocusedPorcelain(
    checkedFocusedGitOutput(
      repoRoot,
      ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching'],
      'ignored status',
      gitRun,
    ),
  )
    .filter((entry) => entry.status === '!!')
    .map((entry) => entry.path.replace(/\/$/u, ''));
  const diffBytes = checkedFocusedGitOutput(
    repoRoot,
    GOVERNED_MUTATION_DIFF_ARGUMENTS,
    'governed diff',
    gitRun,
  );
  const inputDigests = readInputDigests();
  validateInputDigests(inputDigests);
  return {
    commit,
    tree,
    diffDigest: sha256Hex(diffBytes),
    cleanIndex: true,
    allowedUnstaged,
    ignored,
    inputDigests,
  };
}

function ignoredPathAllowed(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function assertFocusedMutationCandidate(expected, actual, allowedIgnoredPrefixes = []) {
  const { ignored: expectedIgnored, ...fixedExpected } = expected;
  const { ignored: actualIgnored, ...fixedActual } = actual;
  if (canonicalize(fixedExpected) !== canonicalize(fixedActual)) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_DRIFT',
      'focused mutation candidate changed during execution',
    );
  }
  const before = new Set(expectedIgnored);
  const after = new Set(actualIgnored);
  for (const path of new Set([...before, ...after])) {
    if (before.has(path) !== after.has(path) && !ignoredPathAllowed(path, allowedIgnoredPrefixes)) {
      throw new MutationEvidenceError(
        'MUTATION_FOCUSED_IGNORED_DRIFT',
        'focused mutation candidate has unexpected ignored-output drift',
      );
    }
  }
  return true;
}

function containedRelative(root, path, label) {
  const escaped = relative(resolve(root), resolve(path));
  if (escaped === '' || escaped.startsWith('..') || isAbsolute(escaped)) {
    throw new MutationEvidenceError('MUTATION_FOCUSED_PATH', `${label} escaped its governed root`);
  }
  return escaped.split(sep).join('/');
}

export function focusedMutationAttemptPaths({
  repoRoot,
  packageStem,
  commit,
  diffDigest,
  kind,
  pid = process.pid,
  artifactRoot = FOCUSED_MUTATION_ARTIFACT_ROOT,
}) {
  if (
    !/^[a-z0-9-]+$/u.test(packageStem) ||
    !/^[0-9a-f]{40}$/u.test(commit) ||
    !/^[0-9a-f]{64}$/u.test(diffDigest) ||
    !['failure', 'success'].includes(kind) ||
    !Number.isInteger(pid) ||
    pid < 1
  ) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_IDENTITY',
      'focused mutation attempt identity is invalid',
    );
  }
  if (artifactRoot !== FOCUSED_MUTATION_ARTIFACT_ROOT) {
    portablePath(artifactRoot, 'focused mutation artifact root');
  }
  const focusedRoot = resolve(repoRoot, artifactRoot);
  const fullRoot = resolve(repoRoot, FULL_MUTATION_ARTIFACT_ROOT);
  containedRelative(repoRoot, focusedRoot, 'focused mutation root');
  if (
    focusedRoot === fullRoot ||
    relative(fullRoot, focusedRoot) === '' ||
    (!relative(fullRoot, focusedRoot).startsWith('..') &&
      !isAbsolute(relative(fullRoot, focusedRoot)))
  ) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_PATH',
      'focused mutation root overlaps the full-roster root',
    );
  }
  const attemptRoot = join(focusedRoot, packageStem, commit, diffDigest);
  const successDirectory = join(attemptRoot, 'success');
  const failureDirectory = join(attemptRoot, 'failure');
  const finalDirectory = kind === 'success' ? successDirectory : failureDirectory;
  const stageDirectory = join(
    focusedRoot,
    `.stage-${packageStem}-${commit}-${diffDigest}-${kind}-${String(pid)}`,
  );
  for (const [label, path] of [
    ['attempt', attemptRoot],
    ['success', successDirectory],
    ['failure', failureDirectory],
    ['stage', stageDirectory],
  ]) {
    containedRelative(focusedRoot, path, `focused mutation ${label} path`);
  }
  const reportName = `${packageStem}.stryker.json`;
  const resultName = `${packageStem}.result.json`;
  const manifestName = `${packageStem}.manifest.json`;
  return {
    repoRoot: resolve(repoRoot),
    artifactRoot,
    focusedRoot,
    attemptRoot,
    successDirectory,
    failureDirectory,
    finalDirectory,
    stageDirectory,
    kind,
    reportName,
    resultName,
    manifestName,
    relative: {
      report:
        kind === 'success'
          ? `${artifactRoot}/${packageStem}/${commit}/${diffDigest}/success/${reportName}`
          : undefined,
      result:
        kind === 'success'
          ? `${artifactRoot}/${packageStem}/${commit}/${diffDigest}/success/${resultName}`
          : undefined,
      manifest: `${artifactRoot}/${packageStem}/${commit}/${diffDigest}/${kind}/${manifestName}`,
    },
  };
}

export const FOCUSED_MUTATION_FILE_SYSTEM = Object.freeze({
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
});

function assertNoFocusedSymlink(path, stop, fileSystem) {
  let cursor = resolve(path);
  const boundary = resolve(stop);
  while (cursor !== boundary) {
    if (fileSystem.existsSync(cursor) && fileSystem.lstatSync(cursor).isSymbolicLink()) {
      throw new MutationEvidenceError(
        'MUTATION_FOCUSED_SYMLINK',
        'focused mutation evidence path contains a symlink',
      );
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new MutationEvidenceError(
        'MUTATION_FOCUSED_PATH',
        'focused mutation evidence path escaped its boundary',
      );
    }
    cursor = parent;
  }
}

export function assertFocusedMutationAttemptAvailable(
  paths,
  fileSystem = FOCUSED_MUTATION_FILE_SYSTEM,
) {
  assertNoFocusedSymlink(paths.focusedRoot, paths.repoRoot, fileSystem);
  for (const path of [paths.successDirectory, paths.failureDirectory, paths.stageDirectory]) {
    if (fileSystem.existsSync(path)) {
      throw new MutationEvidenceError(
        'MUTATION_FOCUSED_COLLISION',
        'focused mutation evidence attempt already exists',
      );
    }
  }
  return true;
}

function assertFocusedMutationFinalsAbsent(paths, fileSystem) {
  for (const path of [paths.successDirectory, paths.failureDirectory]) {
    if (fileSystem.existsSync(path)) {
      throw new MutationEvidenceError(
        'MUTATION_FOCUSED_COLLISION',
        'focused mutation evidence attempt already exists',
      );
    }
  }
}

function expectedFocusedFiles(paths, files) {
  const names = files.map((entry) => entry.name).sort();
  const expected =
    paths.kind === 'success'
      ? [paths.manifestName, paths.reportName, paths.resultName].sort()
      : [paths.manifestName];
  if (canonicalize(names) !== canonicalize(expected)) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_FILES',
      'focused mutation evidence file population is invalid',
    );
  }
}

function validateFocusedDirectory(directory, files, fileSystem) {
  const directoryMetadata = fileSystem.lstatSync(directory);
  if (
    !directoryMetadata.isDirectory() ||
    directoryMetadata.isSymbolicLink() ||
    (directoryMetadata.mode & 0o777) !== 0o700
  ) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_MODE',
      'focused mutation evidence directory is not a mode-0700 regular directory',
    );
  }
  const names = fileSystem.readdirSync(directory).sort();
  if (canonicalize(names) !== canonicalize(files.map((entry) => entry.name).sort())) {
    throw new MutationEvidenceError(
      'MUTATION_FOCUSED_FILES',
      'focused mutation evidence contains missing or extra files',
    );
  }
  for (const entry of files) {
    const path = join(directory, entry.name);
    const metadata = fileSystem.lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
      throw new MutationEvidenceError(
        'MUTATION_FOCUSED_MODE',
        'focused mutation evidence is not a mode-0600 regular file',
      );
    }
    const actual = fileSystem.readFileSync(path);
    if (!actual.equals(entry.bytes) || sha256Hex(actual) !== entry.digest) {
      throw new MutationEvidenceError(
        'MUTATION_FOCUSED_DIGEST',
        'focused mutation evidence bytes or digest differ',
      );
    }
  }
}

function writeFocusedFile(path, bytes, fileSystem) {
  let descriptor;
  let closed = false;
  try {
    descriptor = fileSystem.openSync(path, 'wx', 0o600);
    fileSystem.writeFileSync(descriptor, bytes);
    fileSystem.fsyncSync(descriptor);
    fileSystem.closeSync(descriptor);
    closed = true;
    fileSystem.chmodSync(path, 0o600);
  } finally {
    if (descriptor !== undefined && !closed) {
      try {
        fileSystem.closeSync(descriptor);
      } catch {
        // The original write/close failure remains authoritative.
      }
    }
  }
}

export function publishFocusedMutationEvidence({
  paths,
  files,
  byteSet,
  validateCandidate,
  fileSystem = FOCUSED_MUTATION_FILE_SYSTEM,
}) {
  expectedFocusedFiles(paths, files);
  assertFocusedMutationByteBounds({ ...byteSet, kind: paths.kind });
  assertFocusedMutationAttemptAvailable(paths, fileSystem);
  validateCandidate('before-write', [paths.stageDirectory]);
  let published = false;
  try {
    fileSystem.mkdirSync(paths.focusedRoot, { recursive: true, mode: 0o700 });
    assertNoFocusedSymlink(paths.focusedRoot, paths.repoRoot, fileSystem);
    fileSystem.mkdirSync(paths.stageDirectory, { recursive: false, mode: 0o700 });
    fileSystem.chmodSync(paths.stageDirectory, 0o700);
    for (const entry of files) {
      writeFocusedFile(join(paths.stageDirectory, entry.name), entry.bytes, fileSystem);
    }
    validateFocusedDirectory(paths.stageDirectory, files, fileSystem);
    assertFocusedMutationByteBounds({ ...byteSet, kind: paths.kind });
    validateCandidate('before-publication', [paths.stageDirectory]);
    fileSystem.mkdirSync(paths.attemptRoot, { recursive: true, mode: 0o700 });
    assertNoFocusedSymlink(paths.attemptRoot, paths.repoRoot, fileSystem);
    assertFocusedMutationFinalsAbsent(paths, fileSystem);
    fileSystem.renameSync(paths.stageDirectory, paths.finalDirectory);
    published = true;
    validateFocusedDirectory(paths.finalDirectory, files, fileSystem);
    validateCandidate('after-publication', [paths.finalDirectory]);
    return paths.relative;
  } catch (error) {
    if (!published && fileSystem.existsSync(paths.stageDirectory)) {
      fileSystem.rmSync(paths.stageDirectory, { recursive: true, force: true });
    }
    throw error;
  }
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
