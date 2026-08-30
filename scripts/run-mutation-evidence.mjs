#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
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
const compositionPolicyPath = resolve(repoRoot, 'law/policy/stynx-1.1.1-mutation-reuse.json');
const cheapGateMarkerPath = resolve(
  repoRoot,
  '.devai/state/check-cache/v1/artifacts/d24-32-cheap-gates.json',
);
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

function restoreOwnedStrykerSetup(workspace, remove = false) {
  const root = resolve(repoRoot, workspace);
  const names = readdirSync(root)
    .filter((name) => /^stryker-setup-\d+\.js$/u.test(name))
    .sort();
  if (!remove && names.length > 0) {
    throw new Error(`${workspace}: mutation setup residue exists before package start`);
  }
  for (const name of names) {
    const path = resolve(root, name);
    const metadata = lstatSync(path);
    const bytes = readFileSync(path);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      (metadata.mode & 0o777) !== 0o644 ||
      metadata.size !== 2411 ||
      sha256Hex(bytes) !== '11ea94ed9ba49a916fb0f6cbb365e896f4ce67958009f7a4320ceebaba14febb' ||
      !bytes.toString('utf8').endsWith('//# sourceMappingURL=stryker-setup.js.map')
    ) {
      throw new Error(`${workspace}: unexpected mutation setup residue`);
    }
    unlinkSync(path);
  }
  if (readdirSync(root).some((name) => /^stryker-setup-\d+\.js$/u.test(name))) {
    throw new Error(`${workspace}: mutation setup residue restoration failed`);
  }
}

function runPackage(entry) {
  restoreOwnedStrykerSetup(entry.workspace);
  try {
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
        process: normalizeExisting
          ? null
          : {
              errorAbsent: subprocessResult?.error === undefined,
              status: subprocessResult?.status ?? null,
              signal: subprocessResult?.signal ?? null,
            },
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
        process: result.process,
      };
    });
  } finally {
    restoreOwnedStrykerSetup(entry.workspace, true);
  }
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

const requiredCheapGates = [
  'four-package-coverage',
  'root-coverage',
  'script-tests',
  'trace',
  'secrets',
  'format',
  'diff-check',
  'typecheck',
  'build',
  'lint',
  'test-unit',
  'test-integration',
  'ci-stynx',
  'test-e2e',
];

const sharedMutationInputPaths = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'scripts/lib/mutation-evidence.mjs',
  'scripts/lib/mutation-roster.mjs',
  'tools/repo-config/test-policy.json',
  'tools/repo-config/test-thresholds.mjs',
  'tools/repo-config/vitest.base.mjs',
  'tools/stryker/base.mjs',
];

function gitText(arguments_) {
  const result = spawnSync('git', arguments_, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.error !== undefined || result.signal !== null || result.status !== 0) {
    throw new Error('mutation composition git preflight failed');
  }
  return result.stdout;
}

function readCompositionPolicy() {
  if (!existsSync(compositionPolicyPath)) return undefined;
  const policy = JSON.parse(readFileSync(compositionPolicyPath, 'utf8'));
  const fresh = policy.freshPackages;
  const reused = policy.reusedPackages;
  if (!Array.isArray(fresh) || !Array.isArray(reused)) {
    throw new Error('mutation composition policy is invalid');
  }
  const union = [...fresh, ...reused];
  if (
    policy.kind !== 'stynx-1.1.1-mutation-reuse-policy-v1' ||
    fresh.length !== policy.requiredFreshCount ||
    reused.length !== policy.requiredReusedCount ||
    union.length !== policy.requiredRosterCount ||
    new Set(union).size !== union.length ||
    policy.composedSummaryKind !== 'mutation-composed-report-set-v1' ||
    !Array.isArray(policy.allowedChangedPaths)
  ) {
    throw new Error('mutation composition policy is invalid');
  }
  return policy;
}

function currentCandidate(policy) {
  const commit = gitText(['rev-parse', 'HEAD']).trim();
  const tree = gitText(['rev-parse', 'HEAD^{tree}']).trim();
  const baselineTree = gitText(['rev-parse', `${policy.baseline.commit}^{tree}`]).trim();
  if (baselineTree !== policy.baseline.tree) throw new Error('mutation baseline tree drifted');
  gitText(['merge-base', '--is-ancestor', policy.baseline.commit, commit]);
  if (gitText(['status', '--porcelain=v1', '-z', '--untracked-files=all']) !== '') {
    throw new Error('mutation composition requires a clean candidate');
  }
  const changedPaths = gitText([
    'diff',
    '--name-only',
    '-z',
    `${policy.baseline.commit}..${commit}`,
    '--',
  ])
    .split('\0')
    .filter(Boolean)
    .sort();
  const allowed = new Set(policy.allowedChangedPaths);
  if (changedPaths.some((path) => !allowed.has(path))) {
    throw new Error('mutation composition candidate changed an unauthorized path');
  }
  return { commit, tree, changedPaths };
}

function treeEntries(commit) {
  const output = gitText(['ls-tree', '-r', '-z', commit, '--']);
  const entries = new Map();
  for (const record of output.split('\0').filter(Boolean)) {
    const match = /^(\d+) ([a-z]+) ([0-9a-f]+)\t(.+)$/u.exec(record);
    if (!match) throw new Error('mutation input tree entry is invalid');
    entries.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
  }
  return entries;
}

function workspaceCatalog() {
  const catalog = new Map();
  for (const root of ['packages', 'packages-web']) {
    const absoluteRoot = resolve(repoRoot, root);
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const workspace = `${root}/${entry.name}`;
      const manifestPath = resolve(repoRoot, workspace, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (typeof manifest.name !== 'string') continue;
      catalog.set(manifest.name, { workspace, manifest });
    }
  }
  return catalog;
}

function dependencySourceClosure(packageName, catalog) {
  const visited = new Set();
  const visit = (name) => {
    if (visited.has(name)) return;
    visited.add(name);
    const entry = catalog.get(name);
    if (!entry) return;
    const dependencyNames = [
      ...Object.keys(entry.manifest.dependencies ?? {}),
      ...Object.keys(entry.manifest.devDependencies ?? {}),
      ...Object.keys(entry.manifest.optionalDependencies ?? {}),
      ...Object.keys(entry.manifest.peerDependencies ?? {}),
    ];
    for (const dependency of dependencyNames) if (catalog.has(dependency)) visit(dependency);
  };
  visit(packageName);
  visited.delete(packageName);
  return [...visited].map((name) => catalog.get(name).workspace).sort();
}

function mutationInputProjection(entry, entries, catalog) {
  const dependencyWorkspaces = dependencySourceClosure(entry.packageName, catalog);
  const selected = [];
  for (const [path, metadata] of entries) {
    const own = path === entry.workspace || path.startsWith(`${entry.workspace}/`);
    const dependency = dependencyWorkspaces.some(
      (workspace) =>
        path === `${workspace}/package.json` ||
        path.startsWith(`${workspace}/src/`) ||
        (path.startsWith(`${workspace}/`) && /\/tsconfig[^/]*\.json$/u.test(path)),
    );
    const shared = sharedMutationInputPaths.includes(path) || path.startsWith('tools/tsconfig/');
    if (own || dependency || shared) selected.push({ path, ...metadata });
  }
  selected.sort((left, right) => left.path.localeCompare(right.path));
  return sha256Hex(canonicalize(selected));
}

function validateCheapGateMarker(candidate) {
  if (!existsSync(cheapGateMarkerPath)) {
    throw new Error('mutation composition cheap-gate marker is missing');
  }
  const marker = JSON.parse(readFileSync(cheapGateMarkerPath, 'utf8'));
  const gates = Array.isArray(marker.gates) ? marker.gates : [];
  if (
    marker.kind !== 'd24.32-cheap-gates-v1' ||
    marker.candidate !== candidate.commit ||
    marker.tree !== candidate.tree ||
    gates.length !== requiredCheapGates.length ||
    canonicalize(gates.map(({ name }) => name)) !== canonicalize(requiredCheapGates) ||
    gates.some(
      ({ passed, resultDigest }) => passed !== true || !/^[0-9a-f]{64}$/u.test(resultDigest ?? ''),
    )
  ) {
    throw new Error('mutation composition cheap-gate marker is invalid');
  }
}

function packageArtifact(directory, entry) {
  const reportName = entry.reportPath.split('/').at(-1);
  const resultName = entry.resultPath.split('/').at(-1);
  const stem = entry.workspace.replaceAll('/', '-');
  if (
    entry.reportPath !== `${artifactRoot}/${stem}.stryker.json` ||
    entry.resultPath !== `${artifactRoot}/${stem}.result.json` ||
    !reportName ||
    !resultName ||
    reportName.includes('..') ||
    resultName.includes('..')
  ) {
    throw new Error(`${entry.packageName}: mutation artifact path is invalid`);
  }
  const report = JSON.parse(readFileSync(resolve(directory, reportName), 'utf8'));
  const result = JSON.parse(readFileSync(resolve(directory, resultName), 'utf8'));
  const reportDigest = sha256Hex(canonicalize(report));
  const resultDigest = sha256Hex(canonicalize(result));
  const statusTotals = totals(report);
  const mutationScore = score(statusTotals);
  if (
    reportDigest !== entry.reportDigest ||
    resultDigest !== entry.resultDigest ||
    result.reportDigest !== reportDigest ||
    result.packageName !== entry.packageName ||
    result.workspace !== entry.workspace ||
    result.passed !== true ||
    canonicalize(result.statusTotals) !== canonicalize(statusTotals) ||
    result.score !== mutationScore ||
    entry.score !== result.score ||
    entry.passed !== true
  ) {
    throw new Error(`${entry.packageName}: mutation artifact binding failed`);
  }
  const targetCensus = {
    targetFileCount: Object.keys(report.files ?? {}).length,
    totalMutants: Object.values(statusTotals).reduce((sum, value) => sum + value, 0),
  };
  return { report, result, reportDigest, resultDigest, statusTotals, targetCensus };
}

function validateBaseline(policy, roster) {
  const summaryPath = resolve(finalDirectory, 'summary.json');
  const raw = readFileSync(summaryPath);
  if (
    raw.length !== policy.baseline.summaryBytes ||
    sha256Hex(raw) !== policy.baseline.summarySha256
  ) {
    throw new Error('mutation baseline summary identity failed');
  }
  const summary = JSON.parse(raw.toString('utf8'));
  const expectedNames = roster.map(({ packageName }) => packageName).sort();
  const observedNames = summary.packages?.map(({ packageName }) => packageName).sort() ?? [];
  if (
    summary.kind !== 'mutation-report-set-v1' ||
    summary.complete !== true ||
    summary.passed !== true ||
    summary.aggregate?.packageCount !== policy.requiredRosterCount ||
    canonicalize(observedNames) !== canonicalize(expectedNames)
  ) {
    throw new Error('mutation baseline summary is incomplete');
  }
  const packages = new Map();
  for (const entry of summary.packages) {
    const artifact = packageArtifact(finalDirectory, entry);
    const rosterEntry = roster.find(({ packageName }) => packageName === entry.packageName);
    if (
      !rosterEntry ||
      canonicalize(artifact.result.thresholds) !== canonicalize(rosterEntry.thresholds)
    ) {
      throw new Error(`${entry.packageName}: mutation baseline threshold drifted`);
    }
    packages.set(entry.packageName, { entry, artifact });
  }
  return { summary, packages };
}

function validateExistingComposition({ policy, candidate, roster, currentTree, catalog }) {
  const path = resolve(finalDirectory, 'summary.json');
  if (!existsSync(path)) return undefined;
  const summary = JSON.parse(readFileSync(path, 'utf8'));
  if (summary.kind !== policy.composedSummaryKind) return undefined;
  if (
    summary.complete !== true ||
    summary.passed !== true ||
    summary.candidate?.commit !== candidate.commit ||
    summary.candidate?.tree !== candidate.tree ||
    summary.baseline?.commit !== policy.baseline.commit ||
    summary.baseline?.tree !== policy.baseline.tree ||
    summary.baseline?.summarySha256 !== policy.baseline.summarySha256 ||
    summary.aggregate?.packageCount !== policy.requiredRosterCount ||
    summary.packages?.length !== policy.requiredRosterCount
  ) {
    throw new Error('existing mutation composition identity failed');
  }
  const fresh = new Set(policy.freshPackages);
  const reused = new Set(policy.reusedPackages);
  const observedNames = summary.packages.map(({ packageName }) => packageName).sort();
  const expectedNames = roster.map(({ packageName }) => packageName).sort();
  if (canonicalize(observedNames) !== canonicalize(expectedNames)) {
    throw new Error('existing mutation composition roster drifted');
  }
  for (const entry of summary.packages) {
    const rosterEntry = roster.find(({ packageName }) => packageName === entry.packageName);
    if (!rosterEntry) throw new Error('existing mutation composition roster drifted');
    const expectedProvenance = fresh.has(entry.packageName)
      ? 'fresh'
      : reused.has(entry.packageName)
        ? 'reused'
        : undefined;
    const projection = mutationInputProjection(rosterEntry, currentTree, catalog);
    const artifact = packageArtifact(finalDirectory, entry);
    if (
      entry.provenance !== expectedProvenance ||
      entry.inputProjectionDigest !== projection ||
      canonicalize(entry.thresholds) !== canonicalize(rosterEntry.thresholds) ||
      canonicalize(entry.statusTotals) !== canonicalize(artifact.statusTotals) ||
      entry.score !== artifact.result.score ||
      entry.passed !== true
    ) {
      throw new Error(`${entry.packageName}: existing mutation composition drifted`);
    }
    if (
      entry.provenance === 'fresh' &&
      (artifact.result.process?.errorAbsent !== true ||
        artifact.result.process?.status !== 0 ||
        artifact.result.process?.signal !== null ||
        artifact.statusTotals.NoCoverage !== 0)
    ) {
      throw new Error(`${entry.packageName}: existing fresh mutation process is invalid`);
    }
  }
  return summary;
}

function copyReusedPackage(entry) {
  const reportName = entry.reportPath.split('/').at(-1);
  const resultName = entry.resultPath.split('/').at(-1);
  copyFileSync(resolve(finalDirectory, reportName), resolve(stagingDirectory, reportName));
  copyFileSync(resolve(finalDirectory, resultName), resolve(stagingDirectory, resultName));
}

function publishComposedDirectory() {
  rmSync(backupDirectory, { recursive: true, force: true });
  if (existsSync(finalDirectory)) renameSync(finalDirectory, backupDirectory);
  try {
    renameSync(stagingDirectory, finalDirectory);
  } catch (error) {
    if (existsSync(backupDirectory)) renameSync(backupDirectory, finalDirectory);
    throw error;
  }
  rmSync(backupDirectory, { recursive: true, force: true });
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

const policy = readCompositionPolicy();
if (policy && normalizeExisting) {
  throw new Error('composition policy forbids normalize-existing mode');
}

if (policy) {
  const rosterNames = roster.map(({ packageName }) => packageName).sort();
  const policyNames = [...policy.freshPackages, ...policy.reusedPackages].sort();
  if (canonicalize(rosterNames) !== canonicalize(policyNames)) {
    throw new Error('mutation composition policy does not match the live roster');
  }
  const candidate = currentCandidate(policy);
  const baselineTree = treeEntries(policy.baseline.commit);
  const currentTree = treeEntries(candidate.commit);
  const catalog = workspaceCatalog();
  validateCheapGateMarker(candidate);

  const existing = validateExistingComposition({
    policy,
    candidate,
    roster,
    currentTree,
    catalog,
  });
  if (existing) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: 'validated-existing-composition',
        packageCount: existing.aggregate.packageCount,
        freshPackageCount: policy.requiredFreshCount,
        reusedPackageCount: policy.requiredReusedCount,
        score: existing.aggregate.score,
        durationMs: existing.aggregate.durationMs,
        summaryPath: `${artifactRoot}/summary.json`,
      })}\n`,
    );
    process.exit(0);
  }

  const baseline = validateBaseline(policy, roster);
  for (const packageName of policy.reusedPackages) {
    const rosterEntry = roster.find((entry) => entry.packageName === packageName);
    const baselineProjection = mutationInputProjection(rosterEntry, baselineTree, catalog);
    const currentProjection = mutationInputProjection(rosterEntry, currentTree, catalog);
    if (baselineProjection !== currentProjection) {
      throw new Error(`${packageName}: reused mutation input projection drifted`);
    }
  }

  const preflight = preflightFullMutationInfrastructure();
  if (preflight) {
    process.stderr.write(`${JSON.stringify(preflight)}\n`);
    process.exit(1);
  }

  rmSync(stagingDirectory, { recursive: true, force: true });
  mkdirSync(stagingDirectory, { recursive: true });
  try {
    for (const packageName of policy.reusedPackages) {
      copyReusedPackage(baseline.packages.get(packageName).entry);
    }
    const freshRoster = policy.freshPackages.map((packageName) =>
      roster.find((entry) => entry.packageName === packageName),
    );
    if (freshRoster.some((entry) => entry === undefined)) {
      throw new Error('mutation composition fresh roster is incomplete');
    }
    const freshPackages = freshRoster.map(runPackage);
    const freshByName = new Map(freshPackages.map((entry) => [entry.packageName, entry]));
    const freshSet = new Set(policy.freshPackages);
    const packages = roster.map((rosterEntry) => {
      const provenance = freshSet.has(rosterEntry.packageName) ? 'fresh' : 'reused';
      const rawEntry =
        provenance === 'fresh'
          ? freshByName.get(rosterEntry.packageName)
          : baseline.packages.get(rosterEntry.packageName).entry;
      const artifact = packageArtifact(stagingDirectory, rawEntry);
      const inputProjectionDigest = mutationInputProjection(rosterEntry, currentTree, catalog);
      if (
        canonicalize(artifact.result.thresholds) !== canonicalize(rosterEntry.thresholds) ||
        artifact.result.score < rosterEntry.thresholds.break ||
        (provenance === 'fresh' &&
          (artifact.result.process?.errorAbsent !== true ||
            artifact.result.process?.status !== 0 ||
            artifact.result.process?.signal !== null ||
            artifact.statusTotals.NoCoverage !== 0))
      ) {
        throw new Error(`${rosterEntry.packageName}: composed mutation package failed`);
      }
      return {
        packageName: rosterEntry.packageName,
        workspace: rosterEntry.workspace,
        provenance,
        baselineCommit: provenance === 'reused' ? policy.baseline.commit : null,
        baselineTree: provenance === 'reused' ? policy.baseline.tree : null,
        inputProjectionDigest,
        reportPath: rawEntry.reportPath,
        resultPath: rawEntry.resultPath,
        reportDigest: artifact.reportDigest,
        resultDigest: artifact.resultDigest,
        thresholds: rosterEntry.thresholds,
        targetCensus: artifact.targetCensus,
        statusTotals: artifact.statusTotals,
        score: artifact.result.score,
        passed: true,
        durationMs: artifact.result.durationMs,
        ...(provenance === 'fresh' ? { process: artifact.result.process } : {}),
      };
    });
    const aggregateTotals = Object.fromEntries(MUTANT_STATUSES.map((status) => [status, 0]));
    let durationMs = 0;
    let freshDurationMs = 0;
    for (const entry of packages) {
      durationMs += entry.durationMs;
      if (entry.provenance === 'fresh') freshDurationMs += entry.durationMs;
      for (const status of MUTANT_STATUSES) aggregateTotals[status] += entry.statusTotals[status];
    }
    const summary = {
      schemaVersion: '1.0.0',
      kind: 'mutation-composed-report-set-v1',
      complete: true,
      passed: true,
      candidate: { commit: candidate.commit, tree: candidate.tree },
      baseline: {
        commit: policy.baseline.commit,
        tree: policy.baseline.tree,
        summaryBytes: policy.baseline.summaryBytes,
        summarySha256: policy.baseline.summarySha256,
      },
      packages,
      aggregate: {
        packageCount: packages.length,
        freshPackageCount: policy.requiredFreshCount,
        reusedPackageCount: policy.requiredReusedCount,
        durationMs,
        freshDurationMs,
        score: score(aggregateTotals),
        statusTotals: aggregateTotals,
      },
    };
    canonicalWrite(resolve(stagingDirectory, 'summary.json'), summary);
    publishComposedDirectory();
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: 'composed',
        packageCount: packages.length,
        freshPackageCount: policy.requiredFreshCount,
        reusedPackageCount: policy.requiredReusedCount,
        score: summary.aggregate.score,
        durationMs,
        freshDurationMs,
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
  process.exit(0);
}

if (!normalizeExisting) {
  const preflight = preflightFullMutationInfrastructure();
  if (preflight) {
    process.stderr.write(`${JSON.stringify(preflight)}\n`);
    process.exit(1);
  }
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
