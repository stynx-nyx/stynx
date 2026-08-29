#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MUTANT_STATUSES,
  canonicalize,
  discoverMutationRoster,
  sha256Hex,
} from './lib/mutation-roster.mjs';
import {
  FOCUSED_MUTATION_LIMITS,
  assertFocusedEvidenceSafe,
  assertFocusedMutationAttemptAvailable,
  assertFocusedMutationCandidate,
  assertFocusedMutationCensus,
  assertFocusedMutationProcessResult,
  captureFocusedMutationCandidate,
  encodeFocusedMutationJson,
  focusedMutationAttemptPaths,
  focusedMutationCensus,
  buildMutationEnvironment,
  classifyMutationOutcome,
  normalizeMutationReport,
  preflightFullMutationInfrastructure,
  projectFocusedMutationReport,
  publishFocusedMutationEvidence,
  withMutationReportCleanup,
} from './lib/mutation-evidence.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = '.devai/state/check-cache/v1/artifacts/mutation';
const finalDirectory = resolve(repoRoot, artifactRoot);
const stagingDirectory = resolve(dirname(finalDirectory), `.mutation-stage-${String(process.pid)}`);
const backupDirectory = resolve(dirname(finalDirectory), `.mutation-backup-${String(process.pid)}`);
const normalizeExisting = process.argv.includes('--normalize-existing');
const packageArgumentIndex = process.argv.indexOf('--package');
const diagnosticPackageName =
  packageArgumentIndex === -1 ? undefined : process.argv[packageArgumentIndex + 1];

process.on('uncaughtException', (error) => {
  const message = error instanceof Error ? error.message : '';
  const portableMessage =
    /^@stynx-nyx\/[a-z0-9-]+: mutation-(?:score|harness|portability)-failure/u.test(message)
      ? message
      : 'mutation evidence failed';
  process.stderr.write(`${JSON.stringify({ ok: false, error: portableMessage })}\n`);
  process.exitCode = 1;
});

if (
  packageArgumentIndex !== -1 &&
  (!diagnosticPackageName || diagnosticPackageName.startsWith('-'))
) {
  throw new Error('--package requires one exact package name');
}
if (normalizeExisting && diagnosticPackageName) {
  throw new Error('--normalize-existing cannot be combined with --package');
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
    throw new Error(`${label} is not a portable repository-relative path`);
  }
  return path;
}

function canonicalWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${canonicalize(value)}\n`, { flag: 'wx' });
}

function totals(report) {
  const result = Object.fromEntries(MUTANT_STATUSES.map((status) => [status, 0]));
  for (const [file, fileResult] of Object.entries(report.files ?? {})) {
    portablePath(file, 'mutation source path');
    if (!Array.isArray(fileResult.mutants)) throw new Error(`${file}: mutants must be an array`);
    for (const mutant of fileResult.mutants) {
      if (!MUTANT_STATUSES.includes(mutant.status)) {
        throw new Error(`${file}: unknown mutant status ${String(mutant.status)}`);
      }
      result[mutant.status] += 1;
    }
  }
  return result;
}

function score(statusTotals) {
  const detected = statusTotals.Killed + statusTotals.Timeout;
  const scored = detected + statusTotals.Survived + statusTotals.NoCoverage;
  return scored === 0 ? 100 : (detected / scored) * 100;
}

const D24_WORKLIST_UNSTAGED_PATHS = [
  'packages/worklist/test/unit/deadline.spec.ts',
  'packages/worklist/test/unit/strategies.spec.ts',
  'packages/worklist/test/unit/validation.spec.ts',
  'packages/worklist/test/unit/worklist-services-depth.spec.ts',
];
const D24_WORKLIST_DIFF_DIGEST = 'fa412ac92080b5ebd183c2cb05034a16ecce68880dee8b7770a5dedf216ba6f9';
const D24_WORKLIST_CENSUS = {
  targetFileCount: 10,
  total: 808,
  scored: 428,
  nonScored: 380,
};

function focusedTargetPaths(entry) {
  const config = readFileSync(resolve(repoRoot, entry.config), 'utf8');
  const block = /\bmutate\s*:\s*\[([\s\S]*?)\]/u.exec(config)?.[1];
  if (block === undefined)
    throw new Error(`${entry.packageName}: focused mutation targets missing`);
  const targets = [...block.matchAll(/['"]([^'"]+)['"]/gu)].map((match) => match[1]).sort();
  if (targets.length === 0 || new Set(targets).size !== targets.length) {
    throw new Error(`${entry.packageName}: focused mutation targets are invalid`);
  }
  for (const path of targets) {
    portablePath(path, 'focused mutation target');
    if (/[*?!{}[\]]/u.test(path) || !existsSync(resolve(repoRoot, entry.workspace, path))) {
      throw new Error(`${entry.packageName}: focused mutation target is not an exact source file`);
    }
  }
  return targets;
}

function readFocusedInputDigests(entry, targets) {
  const workspaceRoot = resolve(repoRoot, entry.workspace);
  const sources = targets.map((path) => {
    const absolute = resolve(workspaceRoot, path);
    const escaped = relative(workspaceRoot, absolute);
    if (escaped.startsWith('..') || escaped === '' || escaped.startsWith('/')) {
      throw new Error(`${entry.packageName}: focused mutation source escaped its workspace`);
    }
    const metadata = lstatSync(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error(`${entry.packageName}: focused mutation source missing`);
    return { path, digest: sha256Hex(readFileSync(absolute)) };
  });
  return {
    packageDigest: sha256Hex(readFileSync(resolve(workspaceRoot, 'package.json'))),
    configDigest: sha256Hex(readFileSync(resolve(repoRoot, entry.config))),
    sourceSetDigest: sha256Hex(canonicalize(sources)),
    targetSetDigest: sha256Hex(canonicalize(targets)),
  };
}

function focusedLifecyclePrefixes(entry) {
  return [
    `${entry.workspace}/.stryker-tmp`,
    `${entry.workspace}/coverage`,
    `${entry.workspace}/dist`,
    `${entry.workspace}/reports`,
  ];
}

function createFocusedContext(entry) {
  const targets = focusedTargetPaths(entry);
  const allowedUnstagedPaths =
    entry.packageName === '@stynx-nyx/worklist' ? D24_WORKLIST_UNSTAGED_PATHS : [];
  const readInputDigests = () => readFocusedInputDigests(entry, targets);
  const candidate = captureFocusedMutationCandidate({
    repoRoot,
    allowedUnstagedPaths,
    readInputDigests,
  });
  if (
    entry.packageName === '@stynx-nyx/worklist' &&
    candidate.diffDigest !== D24_WORKLIST_DIFF_DIGEST
  ) {
    throw new Error(`${entry.packageName}: focused mutation candidate has the wrong governed diff`);
  }
  const stem = entry.workspace.replaceAll('/', '-');
  const preflight = focusedMutationAttemptPaths({
    repoRoot,
    packageStem: stem,
    commit: candidate.commit,
    diffDigest: candidate.diffDigest,
    kind: 'success',
  });
  assertFocusedMutationAttemptAvailable(preflight);
  return {
    entry,
    targets,
    allowedUnstagedPaths,
    readInputDigests,
    candidate,
    stem,
    lifecyclePrefixes: focusedLifecyclePrefixes(entry),
  };
}

function validateFocusedContext(context, additions = []) {
  const current = captureFocusedMutationCandidate({
    repoRoot,
    allowedUnstagedPaths: context.allowedUnstagedPaths,
    readInputDigests: context.readInputDigests,
  });
  const additionPrefixes = additions.map((path) => relative(repoRoot, path).split('\\').join('/'));
  assertFocusedMutationCandidate(context.candidate, current, [
    ...context.lifecyclePrefixes,
    ...additionPrefixes,
  ]);
}

function focusedCandidateManifest(candidate) {
  return {
    commit: candidate.commit,
    tree: candidate.tree,
    diffDigest: candidate.diffDigest,
    cleanIndex: candidate.cleanIndex,
    allowedUnstaged: candidate.allowedUnstaged,
  };
}

function focusedFile(name, bytes) {
  return { name, bytes, digest: sha256Hex(bytes) };
}

function publishFocusedFailure({
  context,
  report,
  statusTotals,
  census,
  mutationScore,
  durationMs,
  processResult,
  outcome,
}) {
  const paths = focusedMutationAttemptPaths({
    repoRoot,
    packageStem: context.stem,
    commit: context.candidate.commit,
    diffDigest: context.candidate.diffDigest,
    kind: 'failure',
  });
  const manifest = {
    schemaVersion: '2.0.0',
    kind: 'mutation-focused-failure-v2',
    packageName: context.entry.packageName,
    workspace: context.entry.workspace,
    candidate: focusedCandidateManifest(context.candidate),
    inputDigests: context.candidate.inputDigests,
    process: processResult,
    durationMs,
    thresholds: context.entry.thresholds,
    score: mutationScore,
    statusTotals,
    census,
    classification: outcome.classification,
    reason: outcome.reason,
    paths: { manifest: paths.relative.manifest },
    normalizedReportByteCount: encodeFocusedMutationJson(
      projectFocusedMutationReport(report, repoRoot),
      FOCUSED_MUTATION_LIMITS.report,
      'focused mutation report',
    ).length,
  };
  assertFocusedEvidenceSafe(manifest, repoRoot);
  const manifestBytes = encodeFocusedMutationJson(
    manifest,
    FOCUSED_MUTATION_LIMITS.manifest,
    'focused mutation failure manifest',
  );
  publishFocusedMutationEvidence({
    paths,
    files: [focusedFile(paths.manifestName, manifestBytes)],
    byteSet: { manifestBytes },
    validateCandidate: (_phase, additions) => validateFocusedContext(context, additions),
  });
}

function publishFocusedSuccess({
  context,
  report,
  statusTotals,
  census,
  mutationScore,
  durationMs,
  processResult,
}) {
  const paths = focusedMutationAttemptPaths({
    repoRoot,
    packageStem: context.stem,
    commit: context.candidate.commit,
    diffDigest: context.candidate.diffDigest,
    kind: 'success',
  });
  const persistedReport = projectFocusedMutationReport(report, repoRoot);
  const reportBytes = encodeFocusedMutationJson(
    persistedReport,
    FOCUSED_MUTATION_LIMITS.report,
    'focused mutation report',
  );
  const reportDigest = sha256Hex(reportBytes);
  const result = {
    schemaVersion: '2.0.0',
    kind: 'mutation-focused-result-v2',
    packageName: context.entry.packageName,
    workspace: context.entry.workspace,
    passed: true,
    durationMs,
    toolVersions: { stryker: report.framework.version },
    thresholds: context.entry.thresholds,
    score: mutationScore,
    statusTotals,
    census,
    process: processResult,
    inputDigests: context.candidate.inputDigests,
    reportDigest,
    reportPath: paths.relative.report,
  };
  assertFocusedEvidenceSafe(result, repoRoot);
  const resultBytes = encodeFocusedMutationJson(
    result,
    FOCUSED_MUTATION_LIMITS.result,
    'focused mutation result',
  );
  const resultDigest = sha256Hex(resultBytes);
  const manifest = {
    schemaVersion: '2.0.0',
    kind: 'mutation-focused-evidence-v2',
    packageName: context.entry.packageName,
    workspace: context.entry.workspace,
    candidate: focusedCandidateManifest(context.candidate),
    inputDigests: context.candidate.inputDigests,
    process: processResult,
    durationMs,
    thresholds: context.entry.thresholds,
    score: mutationScore,
    statusTotals,
    census,
    reportDigest,
    resultDigest,
    paths: paths.relative,
  };
  assertFocusedEvidenceSafe(manifest, repoRoot);
  const manifestBytes = encodeFocusedMutationJson(
    manifest,
    FOCUSED_MUTATION_LIMITS.manifest,
    'focused mutation manifest',
  );
  publishFocusedMutationEvidence({
    paths,
    files: [
      focusedFile(paths.reportName, reportBytes),
      focusedFile(paths.resultName, resultBytes),
      focusedFile(paths.manifestName, manifestBytes),
    ],
    byteSet: { reportBytes, resultBytes, manifestBytes },
    validateCandidate: (_phase, additions) => validateFocusedContext(context, additions),
  });
  return paths.relative;
}

function buildMutationPackage(entry, environment) {
  const result = spawnSync('pnpm', ['--filter', `${entry.packageName}...`, 'run', 'build'], {
    cwd: repoRoot,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.error === undefined && result.signal === null && result.status === 0) return;
  const { reason } = classifyMutationOutcome({
    reportState: 'missing',
    subprocessResult: result,
    repoRoot,
  });
  throw new Error(`${entry.packageName}: mutation-harness-failure (build-precondition-${reason})`);
}

function runPackage(entry) {
  return withMutationReportCleanup(repoRoot, entry.workspace, (rawReportDirectory) => {
    const started = process.hrtime.bigint();
    let subprocessResult;
    if (!normalizeExisting) {
      const environment = buildMutationEnvironment(process.env);
      buildMutationPackage(entry, environment);
      subprocessResult = spawnSync('pnpm', ['--filter', entry.packageName, 'run', 'stryker'], {
        cwd: repoRoot,
        env: environment,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
    }
    const durationMs = normalizeExisting
      ? 0
      : Number((process.hrtime.bigint() - started) / BigInt(1_000_000));
    const rawReportPath = resolve(rawReportDirectory, 'mutation.json');
    if (!existsSync(rawReportPath)) {
      const { classification, reason } = classifyMutationOutcome({
        reportState: 'missing',
        subprocessResult,
        repoRoot,
      });
      throw new Error(`${entry.packageName}: ${classification} (${reason})`);
    }
    let report;
    try {
      report = normalizeMutationReport(
        JSON.parse(readFileSync(rawReportPath, 'utf8')),
        entry.thresholds,
        entry.workspace,
        repoRoot,
      );
    } catch (error) {
      const { classification, reason } = classifyMutationOutcome({
        reportState: 'unsafe',
        subprocessResult,
        reportFailureCode: error.code,
        repoRoot,
      });
      throw new Error(`${entry.packageName}: ${classification} (${reason})`, { cause: error });
    }
    const statusTotals = totals(report);
    const mutationScore = score(statusTotals);
    const outcome = classifyMutationOutcome({
      reportState: 'normalized',
      score: mutationScore,
      threshold: entry.thresholds.break,
      subprocessResult,
      repoRoot,
    });
    const passed = outcome.classification === 'mutation-pass';
    if (outcome.classification === 'mutation-score-failure') {
      throw new Error(
        `${entry.packageName}: mutation-score-failure ` +
          `(Killed=${statusTotals.Killed}, Timeout=${statusTotals.Timeout}, ` +
          `Survived=${statusTotals.Survived}, NoCoverage=${statusTotals.NoCoverage}, ` +
          `total=${statusTotals.Killed + statusTotals.Timeout + statusTotals.Survived + statusTotals.NoCoverage}, ` +
          `score=${mutationScore}, break=${entry.thresholds.break})`,
      );
    }
    if (outcome.classification === 'mutation-harness-failure') {
      throw new Error(
        `${entry.packageName}: mutation-harness-failure (${outcome.reason}; ` +
          `score=${mutationScore})`,
      );
    }
    const stem = entry.workspace.replaceAll('/', '-');
    const reportPath = `${artifactRoot}/${stem}.stryker.json`;
    const resultPath = `${artifactRoot}/${stem}.result.json`;
    const reportBytes = canonicalize(report);
    const result = {
      schemaVersion: '1.0.0',
      kind: 'mutation-package-result-v1',
      packageName: entry.packageName,
      workspace: entry.workspace,
      passed,
      durationMs,
      toolVersions: { stryker: report.framework.version },
      thresholds: entry.thresholds,
      score: mutationScore,
      statusTotals,
      reportDigest: sha256Hex(reportBytes),
    };
    const resultBytes = canonicalize(result);
    canonicalWrite(resolve(stagingDirectory, `${stem}.stryker.json`), report);
    canonicalWrite(resolve(stagingDirectory, `${stem}.result.json`), result);
    process.stdout.write(
      `${JSON.stringify({ packageName: entry.packageName, passed, score: mutationScore, durationMs })}\n`,
    );
    return {
      packageName: entry.packageName,
      workspace: entry.workspace,
      resultPath,
      reportPath,
      resultDigest: sha256Hex(resultBytes),
      reportDigest: sha256Hex(reportBytes),
      score: mutationScore,
      passed,
      durationMs,
      statusTotals,
    };
  });
}

function runFocusedPackage(entry, context) {
  return withMutationReportCleanup(repoRoot, entry.workspace, (rawReportDirectory) => {
    const started = process.hrtime.bigint();
    const environment = buildMutationEnvironment(process.env);
    validateFocusedContext(context);
    buildMutationPackage(entry, environment);
    validateFocusedContext(context);
    const subprocessResult = spawnSync('pnpm', ['--filter', entry.packageName, 'run', 'stryker'], {
      cwd: repoRoot,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    const durationMs = Number((process.hrtime.bigint() - started) / BigInt(1_000_000));
    const rawReportPath = resolve(rawReportDirectory, 'mutation.json');
    if (!existsSync(rawReportPath)) {
      const { classification, reason } = classifyMutationOutcome({
        reportState: 'missing',
        subprocessResult,
        repoRoot,
      });
      throw new Error(`${entry.packageName}: ${classification} (${reason})`);
    }
    let report;
    try {
      report = normalizeMutationReport(
        JSON.parse(readFileSync(rawReportPath, 'utf8')),
        entry.thresholds,
        entry.workspace,
        repoRoot,
      );
    } catch (error) {
      const { classification, reason } = classifyMutationOutcome({
        reportState: 'unsafe',
        subprocessResult,
        reportFailureCode: error.code,
        repoRoot,
      });
      throw new Error(`${entry.packageName}: ${classification} (${reason})`, { cause: error });
    }
    validateFocusedContext(context);
    const reportTargets = Object.keys(report.files ?? {}).sort();
    if (canonicalize(reportTargets) !== canonicalize(context.targets)) {
      throw new Error(`${entry.packageName}: focused mutation target set changed`);
    }
    const statusTotals = totals(report);
    const census = focusedMutationCensus(report, statusTotals);
    if (entry.packageName === '@stynx-nyx/worklist') {
      assertFocusedMutationCensus(census, D24_WORKLIST_CENSUS);
      if (statusTotals.Timeout !== 0 || statusTotals.NoCoverage !== 0) {
        throw new Error(`${entry.packageName}: mutation-harness-failure (governed-status-drift)`);
      }
    }
    const mutationScore = score(statusTotals);
    const processResult = {
      errorAbsent: subprocessResult.error === undefined,
      status: subprocessResult.status ?? null,
      signal: subprocessResult.signal ?? null,
    };
    const outcome = classifyMutationOutcome({
      reportState: 'normalized',
      score: mutationScore,
      threshold: entry.thresholds.break,
      subprocessResult,
      repoRoot,
    });
    if (outcome.classification === 'mutation-score-failure') {
      throw new Error(
        `${entry.packageName}: mutation-score-failure ` +
          `(Killed=${statusTotals.Killed}, Timeout=${statusTotals.Timeout}, ` +
          `Survived=${statusTotals.Survived}, NoCoverage=${statusTotals.NoCoverage}, ` +
          `total=${census.scored}, score=${mutationScore}, break=${entry.thresholds.break})`,
      );
    }
    validateFocusedContext(context);
    if (outcome.classification === 'mutation-harness-failure') {
      assertFocusedMutationProcessResult(processResult, 'failure');
      publishFocusedFailure({
        context,
        report,
        statusTotals,
        census,
        mutationScore,
        durationMs,
        processResult,
        outcome,
      });
      throw new Error(
        `${entry.packageName}: mutation-harness-failure (${outcome.reason}; ` +
          `score=${mutationScore})`,
      );
    }
    assertFocusedMutationProcessResult(processResult, 'success');
    const paths = publishFocusedSuccess({
      context,
      report,
      statusTotals,
      census,
      mutationScore,
      durationMs,
      processResult,
    });
    process.stdout.write(
      `${JSON.stringify({ packageName: entry.packageName, passed: true, score: mutationScore, durationMs })}\n`,
    );
    return {
      packageName: entry.packageName,
      score: mutationScore,
      statusTotals,
      manifestPath: paths.manifest,
    };
  });
}

const finalRelative = relative(repoRoot, finalDirectory).split('\\').join('/');
if (finalRelative !== artifactRoot) throw new Error('mutation artifact target escaped repository');
const { roster, failures } = discoverMutationRoster(repoRoot);
if (failures.length > 0) throw new Error(failures.join('\n'));
const selectedRoster = diagnosticPackageName
  ? roster.filter((entry) => entry.packageName === diagnosticPackageName)
  : roster;
if (diagnosticPackageName && selectedRoster.length !== 1) {
  throw new Error(`unknown mutation package: ${diagnosticPackageName}`);
}
if (diagnosticPackageName) {
  const [selected] = selectedRoster;
  const context = createFocusedContext(selected);
  const entry = runFocusedPackage(selected, context);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: 'diagnostic',
      packageName: entry.packageName,
      score: entry.score,
      statusTotals: entry.statusTotals,
      manifestPath: entry.manifestPath,
    })}\n`,
  );
  process.exit(0);
}

const preflight = preflightFullMutationInfrastructure();
if (preflight) {
  process.stderr.write(`${JSON.stringify(preflight)}\n`);
  process.exit(1);
}

rmSync(stagingDirectory, { recursive: true, force: true });
mkdirSync(stagingDirectory, { recursive: true });
try {
  const packages = selectedRoster.map(runPackage);
  const aggregateTotals = Object.fromEntries(MUTANT_STATUSES.map((status) => [status, 0]));
  let durationMs = 0;
  for (const entry of packages) {
    durationMs += entry.durationMs;
    for (const status of MUTANT_STATUSES) aggregateTotals[status] += entry.statusTotals[status];
  }
  const summary = {
    schemaVersion: '1.0.0',
    kind: 'mutation-report-set-v1',
    complete: true,
    passed: true,
    packages: packages.map(
      ({
        packageName,
        workspace,
        resultPath,
        reportPath,
        resultDigest,
        reportDigest,
        score: packageScore,
        passed,
      }) => ({
        packageName,
        workspace,
        resultPath,
        reportPath,
        resultDigest,
        reportDigest,
        score: packageScore,
        passed,
      }),
    ),
    aggregate: {
      packageCount: packages.length,
      durationMs,
      score: score(aggregateTotals),
      statusTotals: aggregateTotals,
    },
  };
  canonicalWrite(join(stagingDirectory, 'summary.json'), summary);
  rmSync(backupDirectory, { recursive: true, force: true });
  if (existsSync(finalDirectory)) renameSync(finalDirectory, backupDirectory);
  try {
    renameSync(stagingDirectory, finalDirectory);
  } catch (error) {
    if (existsSync(backupDirectory)) renameSync(backupDirectory, finalDirectory);
    throw error;
  }
  rmSync(backupDirectory, { recursive: true, force: true });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: normalizeExisting ? 'normalize-existing' : 'run',
      packageCount: packages.length,
      score: summary.aggregate.score,
      durationMs,
      summaryPath: `${artifactRoot}/summary.json`,
    })}\n`,
  );
} catch (error) {
  rmSync(stagingDirectory, { recursive: true, force: true });
  if (!existsSync(finalDirectory) && existsSync(backupDirectory)) {
    renameSync(backupDirectory, finalDirectory);
  }
  throw error;
}
