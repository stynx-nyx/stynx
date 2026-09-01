#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
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
import { fileURLToPath, pathToFileURL } from 'node:url';
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
const isDirectInvocation =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

function reportFatal(error) {
  const message = error instanceof Error ? error.message : '';
  const portableMessage =
    /^@stynx-nyx\/[a-z0-9-]+: mutation-(?:score|harness|portability)-failure/u.test(message)
      ? message
      : 'mutation evidence failed';
  process.stderr.write(`${JSON.stringify({ ok: false, error: portableMessage })}\n`);
  process.exitCode = 1;
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

function gitText(arguments_, repositoryRoot = repoRoot) {
  const result = spawnSync('git', arguments_, {
    cwd: repositoryRoot,
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

function gitBytes(arguments_, repositoryRoot = repoRoot) {
  const result = spawnSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.error !== undefined || result.signal !== null || result.status !== 0) {
    throw new Error('mutation composition git preflight failed');
  }
  return result.stdout;
}

function gitBlobOid(bytes) {
  return createHash('sha1')
    .update(`blob ${String(bytes.length)}\0`)
    .update(bytes)
    .digest('hex');
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
  const comparisonBase = policy.candidateRebind?.sourceCandidate?.commit ?? policy.baseline.commit;
  const changedPaths = gitText(['diff', '--name-only', '-z', `${comparisonBase}..${commit}`, '--'])
    .split('\0')
    .filter(Boolean)
    .sort();
  const allowed = new Set(policy.allowedChangedPaths);
  if (!policy.candidateRebind && changedPaths.some((path) => !allowed.has(path))) {
    throw new Error('mutation composition candidate changed an unauthorized path');
  }
  return { commit, tree, changedPaths };
}

function treeEntries(commit, repositoryRoot = repoRoot) {
  const output = gitText(['ls-tree', '-r', '-z', commit, '--'], repositoryRoot);
  const entries = new Map();
  for (const record of output.split('\0').filter(Boolean)) {
    const match = /^(\d+) ([a-z]+) ([0-9a-f]+)\t(.+)$/u.exec(record);
    if (!match) throw new Error('mutation input tree entry is invalid');
    entries.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
  }
  return entries;
}

function workspaceCatalog(repositoryRoot = repoRoot) {
  const catalog = new Map();
  for (const root of ['packages', 'packages-web']) {
    const absoluteRoot = resolve(repositoryRoot, root);
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const workspace = `${root}/${entry.name}`;
      const manifestPath = resolve(repositoryRoot, workspace, 'package.json');
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

function mutationInputEntries(entry, entries, catalog) {
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
  return selected;
}

function mutationInputProjection(entry, entries, catalog) {
  return sha256Hex(canonicalize(mutationInputEntries(entry, entries, catalog)));
}

export function selectCandidateRefreshPackages({ packageInputs, nonBehavioralPaths }) {
  if (
    !Array.isArray(packageInputs) ||
    !Array.isArray(nonBehavioralPaths) ||
    new Set(nonBehavioralPaths).size !== nonBehavioralPaths.length
  ) {
    throw new Error('non-behavioral mutation path population is invalid');
  }
  if (
    nonBehavioralPaths.some(
      (path) =>
        typeof path !== 'string' ||
        !/^(?:packages|packages-web)\/[a-z0-9-]+\/README\.md$/u.test(path),
    )
  ) {
    throw new Error('non-behavioral mutation path is invalid');
  }
  const packageNames = packageInputs.map(({ packageName }) => packageName);
  if (
    packageNames.some((packageName) => typeof packageName !== 'string' || packageName === '') ||
    new Set(packageNames).size !== packageNames.length ||
    packageInputs.some(
      ({ sourceEntries, candidateEntries }) =>
        !Array.isArray(sourceEntries) || !Array.isArray(candidateEntries),
    )
  ) {
    throw new Error('candidate refresh package input population is invalid');
  }

  const excluded = new Set(nonBehavioralPaths);
  const behavioral = (entries) => entries.filter(({ path }) => !excluded.has(path));
  return packageInputs
    .filter(
      ({ sourceEntries, candidateEntries }) =>
        canonicalize(behavioral(sourceEntries)) !== canonicalize(behavioral(candidateEntries)),
    )
    .map(({ packageName }) => packageName)
    .sort();
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
  const rebound = summary.semanticRebindComparison !== undefined;
  const existingCandidateRebind = policy['candidateRebind'];
  if (
    rebound &&
    canonicalize(summary.semanticRebindComparison) !==
      canonicalize(existingCandidateRebind?.semanticRebindComparison)
  ) {
    throw new Error('existing mutation composition semantic rebind drifted');
  }
  const projectionTree = rebound
    ? treeEntries(existingCandidateRebind.sourceCandidate.commit)
    : currentTree;
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
    const projection = mutationInputProjection(rosterEntry, projectionTree, catalog);
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

function publishComposedDirectory({
  staged = stagingDirectory,
  final = finalDirectory,
  backup = backupDirectory,
  onPublicationPhase,
} = {}) {
  let finalMoved = false;
  let stagingMoved = false;
  try {
    renameSync(final, backup);
    finalMoved = true;
    onPublicationPhase?.('after-final-to-backup');
    renameSync(staged, final);
    stagingMoved = true;
    onPublicationPhase?.('after-staging-to-final');
    rmSync(backup, { recursive: true, force: false });
  } catch (error) {
    let rollbackError;
    try {
      if (finalMoved) {
        if (stagingMoved && existsSync(final)) {
          rmSync(final, { recursive: true, force: false });
        }
        if (existsSync(backup)) renameSync(backup, final);
      }
    } catch (caught) {
      rollbackError = caught;
    }
    rmSync(staged, { recursive: true, force: true });
    if (!rollbackError) rmSync(backup, { recursive: true, force: true });
    if (rollbackError) Object.defineProperty(error, 'rollbackError', { value: rollbackError });
    throw error;
  }
}

let candidateSourceMaterializationAttempt = 0;

function materializationGit(arguments_, repositoryRoot, label, encoding = 'utf8') {
  const result = spawnSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.error !== undefined || result.signal !== null || result.status !== 0) {
    throw new Error(`candidate rebind ${label} git operation failed`);
  }
  return result.stdout;
}

function assertMaterializationIdentity(label, bytes, identity, includeBlob = false) {
  if (
    !identity ||
    bytes.length !== identity.bytes ||
    sha256Hex(bytes) !== identity.sha256 ||
    (includeBlob && gitBlobOid(bytes) !== identity.gitBlobOid)
  ) {
    throw new Error(`candidate rebind ${label} identity drifted`);
  }
}

function materializationArtifactNames(directory) {
  const names = readdirSync(directory).sort();
  for (const name of names) {
    portablePath(name, 'candidate rebind artifact path');
    if (name.includes('/') || name.includes('\\')) {
      throw new Error('candidate rebind artifact path is not a direct child');
    }
    const metadata = lstatSync(resolve(directory, name));
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error('candidate rebind artifact population is invalid');
    }
  }
  return names;
}

const HISTORICAL_REPORT_SAFETY_KEYS = new Set([
  'coveredBy',
  'killedBy',
  'replacement',
  'source',
  'statusReason',
  'testFiles',
]);

function historicalReportSafetyProjection(value) {
  if (Array.isArray(value)) return value.map((entry) => historicalReportSafetyProjection(entry));
  if (!value || typeof value !== 'object') return value;
  const projected = {};
  for (const [key, entry] of Object.entries(value)) {
    const projectedKey = HISTORICAL_REPORT_SAFETY_KEYS.has(key)
      ? `protectedHistorical${key[0].toUpperCase()}${key.slice(1)}`
      : key;
    if (Object.prototype.hasOwnProperty.call(projected, projectedKey)) {
      throw new Error('candidate rebind historical report safety projection collided');
    }
    projected[projectedKey] = historicalReportSafetyProjection(entry);
  }
  return projected;
}

function validateMaterializedDirectory({
  directory,
  expectedNames,
  artifactIdentities,
  summaryIdentity,
  repositoryRoot,
  requireProtectedDigests,
}) {
  const names = materializationArtifactNames(directory);
  if (canonicalize(names) !== canonicalize(expectedNames)) {
    throw new Error('candidate rebind artifact population drifted');
  }
  for (const name of names) {
    const bytes = readFileSync(resolve(directory, name));
    if (name === 'summary.json') {
      assertMaterializationIdentity('final summary', bytes, summaryIdentity);
    } else if (requireProtectedDigests && sha256Hex(bytes) !== artifactIdentities.get(name)) {
      throw new Error('candidate rebind protected artifact digest drifted');
    }
    let value;
    try {
      value = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new Error('candidate rebind protected artifact JSON is invalid');
    }
    const safetyValue = name.endsWith('.stryker.json')
      ? historicalReportSafetyProjection(value)
      : value;
    assertFocusedEvidenceSafe(safetyValue, repositoryRoot);
  }
}

export async function materializeCandidateRebindSource({
  repositoryRoot,
  policy,
  finalDirectory: materializedFinalDirectory,
  stagingDirectory: requestedStagingDirectory,
  onPackageStart,
  onPublicationPhase,
}) {
  const candidateRebind = policy?.candidateRebind;
  const sourceSummary = candidateRebind?.sourceSummary;
  const contract = candidateRebind?.sourceMaterialization;
  const protectedSource = contract?.protectedSource;
  const steps = contract?.steps;
  if (
    contract?.kind !== 'protected-tag-chained-zero-execution-rebind-v1' ||
    contract.checkout !== 'local-shared-clone-exact-detached-commit' ||
    contract.publication !== 'same-filesystem-atomic-rename' ||
    contract.existingDestination !== 'accept-only-exact-complete-source' ||
    contract.interruptedStaging !== 'reject-without-reuse' ||
    contract.credentialInputs !== 0 ||
    contract.mismatchDisposition !== 'fail-before-destination-publication'
  ) {
    throw new Error('candidate rebind source materialization contract is invalid');
  }
  if (contract.mutationSubprocesses !== 0) {
    throw new Error('candidate rebind mutation subprocess count is invalid');
  }
  if (contract.packageStarts !== 0) {
    throw new Error('candidate rebind package start count is invalid');
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('candidate rebind materialization step chain is missing');
  }
  portablePath(contract.destination, 'candidate rebind destination');
  if (
    !sourceSummary ||
    dirname(sourceSummary.path).split('\\').join('/') !== contract.destination ||
    steps.at(-1)?.outputSummary?.bytes !== sourceSummary.bytes ||
    steps.at(-1)?.outputSummary?.sha256 !== sourceSummary.sha256
  ) {
    throw new Error('candidate rebind final source summary identity is invalid');
  }

  portablePath(protectedSource?.tag, 'candidate rebind protected tag ref');
  portablePath(protectedSource?.manifest?.path, 'candidate rebind manifest path');
  portablePath(protectedSource?.artifactPrefix, 'candidate rebind artifact prefix');
  if (!protectedSource.artifactPrefix.endsWith('/')) {
    throw new Error('candidate rebind artifact prefix is invalid');
  }
  const tagType = materializationGit(
    ['cat-file', '-t', protectedSource.tag],
    repositoryRoot,
    'protected tag ref',
  ).trim();
  const tagObject = materializationGit(
    ['rev-parse', protectedSource.tag],
    repositoryRoot,
    'protected tag ref',
  ).trim();
  if (tagType !== 'tag' || tagObject !== protectedSource.tagObject) {
    throw new Error('candidate rebind protected tag object identity drifted');
  }
  const evidenceCommit = materializationGit(
    ['rev-parse', `${protectedSource.tag}^{commit}`],
    repositoryRoot,
    'protected evidence commit',
  ).trim();
  const evidenceTree = materializationGit(
    ['rev-parse', `${protectedSource.tag}^{tree}`],
    repositoryRoot,
    'protected evidence tree',
  ).trim();
  if (evidenceCommit !== protectedSource.evidenceCommit) {
    throw new Error('candidate rebind protected evidence commit identity drifted');
  }
  if (evidenceTree !== protectedSource.evidenceTree) {
    throw new Error('candidate rebind protected evidence tree identity drifted');
  }

  const manifestBytes = materializationGit(
    ['cat-file', 'blob', `${protectedSource.tag}:${protectedSource.manifest.path}`],
    repositoryRoot,
    'protected manifest',
    null,
  );
  if (manifestBytes.length !== protectedSource.manifest.bytes) {
    throw new Error('candidate rebind protected manifest size drifted');
  }
  if (sha256Hex(manifestBytes) !== protectedSource.manifest.sha256) {
    throw new Error('candidate rebind protected manifest digest drifted');
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    throw new Error('candidate rebind protected manifest JSON is invalid');
  }
  assertFocusedEvidenceSafe(manifest, repositoryRoot);
  if (
    manifest.repositoryId !== protectedSource.repositoryId ||
    manifest.profile !== protectedSource.profile ||
    manifest.signerId !== protectedSource.signerId ||
    !Array.isArray(manifest.artifacts)
  ) {
    throw new Error('candidate rebind protected manifest authority drifted');
  }

  const treeText = materializationGit(
    ['ls-tree', '-r', '-z', `${protectedSource.tag}^{tree}`, '--', protectedSource.artifactPrefix],
    repositoryRoot,
    'protected artifact population',
  );
  const protectedEntries = treeText
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const match = /^(\d+) ([a-z]+) ([0-9a-f]+)\t(.+)$/u.exec(record);
      if (!match || match[1] !== '100644' || match[2] !== 'blob') {
        throw new Error('candidate rebind protected artifact population is invalid');
      }
      const path = match[4];
      if (!path.startsWith(protectedSource.artifactPrefix)) {
        throw new Error('candidate rebind protected artifact prefix drifted');
      }
      const name = path.slice(protectedSource.artifactPrefix.length);
      portablePath(name, 'candidate rebind protected artifact path');
      if (name.includes('/')) {
        throw new Error('candidate rebind protected artifact path is not a direct child');
      }
      return { name, oid: match[3], path };
    });
  const reportCount = protectedEntries.filter(({ name }) => name.endsWith('.stryker.json')).length;
  const resultCount = protectedEntries.filter(({ name }) => name.endsWith('.result.json')).length;
  if (
    protectedEntries.length !== protectedSource.artifactCount ||
    reportCount !== protectedSource.reportCount ||
    resultCount !== protectedSource.resultCount ||
    protectedEntries.filter(({ name }) => name === 'summary.json').length !== 1
  ) {
    throw new Error('candidate rebind protected artifact population count drifted');
  }
  const manifestArtifacts = new Map();
  for (const entry of manifest.artifacts) {
    if (typeof entry?.path !== 'string' || !entry.path.startsWith(contract.destination)) continue;
    const name = entry.path.slice(contract.destination.length).replace(/^\//u, '');
    if (!name || name.includes('/')) continue;
    if (manifestArtifacts.has(name) || !/^[0-9a-f]{64}$/u.test(entry.sha256 ?? '')) {
      throw new Error('candidate rebind protected manifest artifact population is invalid');
    }
    manifestArtifacts.set(name, entry.sha256);
  }
  const expectedNames = protectedEntries.map(({ name }) => name).sort();
  if (canonicalize([...manifestArtifacts.keys()].sort()) !== canonicalize(expectedNames)) {
    throw new Error('candidate rebind protected manifest artifact population drifted');
  }

  const protectedBytes = new Map();
  for (const entry of protectedEntries) {
    const bytes = materializationGit(
      ['cat-file', 'blob', entry.oid],
      repositoryRoot,
      'protected artifact',
      null,
    );
    if (gitBlobOid(bytes) !== entry.oid || sha256Hex(bytes) !== manifestArtifacts.get(entry.name)) {
      throw new Error('candidate rebind protected artifact digest drifted');
    }
    protectedBytes.set(entry.name, bytes);
  }
  assertMaterializationIdentity(
    'protected source summary',
    protectedBytes.get('summary.json'),
    protectedSource.summary,
  );

  let priorSummaryIdentity = protectedSource.summary;
  for (const [index, step] of steps.entries()) {
    if (
      step?.inputSummary?.bytes !== priorSummaryIdentity.bytes ||
      step.inputSummary.sha256 !== priorSummaryIdentity.sha256
    ) {
      throw new Error(`candidate rebind step ${String(index + 1)} input summary identity drifted`);
    }
    if (
      !/^[0-9a-f]{40}$/u.test(step?.candidate?.commit ?? '') ||
      !/^[0-9a-f]{40}$/u.test(step?.candidate?.tree ?? '') ||
      !step.policy ||
      !step.runner ||
      !step.outputSummary
    ) {
      throw new Error(`candidate rebind step ${String(index + 1)} identity is invalid`);
    }
    portablePath(step.policy.path, 'candidate rebind historical policy path');
    portablePath(step.runner.path, 'candidate rebind historical runner path');
    const chainedOutputIdentity = steps[index + 1]?.inputSummary ?? sourceSummary;
    if (
      step.outputSummary.bytes !== chainedOutputIdentity.bytes ||
      step.outputSummary.sha256 !== chainedOutputIdentity.sha256
    ) {
      throw new Error(`candidate rebind step ${String(index + 1)} output summary chain drifted`);
    }
    priorSummaryIdentity = step.outputSummary;
  }

  if (existsSync(materializedFinalDirectory)) {
    const metadata = lstatSync(materializedFinalDirectory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('candidate rebind existing destination is invalid');
    }
    validateMaterializedDirectory({
      directory: materializedFinalDirectory,
      expectedNames,
      artifactIdentities: manifestArtifacts,
      summaryIdentity: sourceSummary,
      repositoryRoot,
      requireProtectedDigests: false,
    });
    return { ok: true, mode: 'validated-existing-source', packageStarts: 0 };
  }

  const attempt = (candidateSourceMaterializationAttempt += 1);
  const materializationStagingDirectory = requestedStagingDirectory
    ? resolve(requestedStagingDirectory)
    : resolve(
        dirname(materializedFinalDirectory),
        `.mutation-source-materialize-${String(process.pid)}-${String(attempt)}`,
      );
  if (existsSync(materializationStagingDirectory)) {
    throw new Error('candidate rebind materialization staging residue exists');
  }
  mkdirSync(materializationStagingDirectory, { recursive: false });
  let published = false;
  try {
    const protectedDirectory = resolve(materializationStagingDirectory, 'protected-source');
    mkdirSync(protectedDirectory, { recursive: false });
    for (const [name, bytes] of protectedBytes) {
      const path = resolve(protectedDirectory, name);
      writeFileSync(path, bytes, { flag: 'wx', mode: 0o644 });
      chmodSync(path, 0o644);
    }
    validateMaterializedDirectory({
      directory: protectedDirectory,
      expectedNames,
      artifactIdentities: manifestArtifacts,
      summaryIdentity: protectedSource.summary,
      repositoryRoot,
      requireProtectedDigests: true,
    });

    let sourceDirectory = protectedDirectory;
    for (const [index, step] of steps.entries()) {
      const stepNumber = String(index + 1);
      const inputBytes = readFileSync(resolve(sourceDirectory, 'summary.json'));
      assertMaterializationIdentity(
        `step ${stepNumber} input summary`,
        inputBytes,
        step.inputSummary,
      );
      const checkoutRoot = resolve(materializationStagingDirectory, `step-${stepNumber}-checkout`);
      // git clone --shared supplies a local object-only checkout with no network or credential input.
      materializationGit(
        ['clone', '--shared', '--no-checkout', repositoryRoot, checkoutRoot],
        repositoryRoot,
        `step ${stepNumber} local clone`,
      );
      materializationGit(
        ['checkout', '--detach', step.candidate.commit],
        checkoutRoot,
        `step ${stepNumber} detached checkout`,
      );
      const checkoutCommit = materializationGit(
        ['rev-parse', 'HEAD'],
        checkoutRoot,
        `step ${stepNumber} commit`,
      ).trim();
      const checkoutTree = materializationGit(
        ['rev-parse', 'HEAD^{tree}'],
        checkoutRoot,
        `step ${stepNumber} tree`,
      ).trim();
      if (checkoutCommit !== step.candidate.commit) {
        throw new Error(`candidate rebind step ${stepNumber} commit identity drifted`);
      }
      if (checkoutTree !== step.candidate.tree) {
        throw new Error(`candidate rebind step ${stepNumber} tree identity drifted`);
      }
      const policyBytes = readFileSync(resolve(checkoutRoot, step.policy.path));
      const runnerBytes = readFileSync(resolve(checkoutRoot, step.runner.path));
      assertMaterializationIdentity(`step ${stepNumber} policy`, policyBytes, step.policy, true);
      assertMaterializationIdentity(`step ${stepNumber} runner`, runnerBytes, step.runner, true);
      const historicalPolicy = JSON.parse(policyBytes.toString('utf8'));
      const historicalRunner = await import(
        `${pathToFileURL(resolve(checkoutRoot, step.runner.path)).href}?materialization=${String(attempt)}-${stepNumber}`
      );
      if (typeof historicalRunner.rebindCandidateComposition !== 'function') {
        throw new Error(`candidate rebind step ${stepNumber} runner export is invalid`);
      }
      const stepFinalDirectory = resolve(
        materializationStagingDirectory,
        `step-${stepNumber}-output`,
      );
      mkdirSync(stepFinalDirectory, { recursive: false });
      const inputSummary = JSON.parse(inputBytes.toString('utf8'));
      const comparisonBase =
        historicalPolicy.candidateRebind?.sourceCandidate?.commit ?? inputSummary.candidate?.commit;
      if (!/^[0-9a-f]{40}$/u.test(comparisonBase ?? '')) {
        throw new Error(`candidate rebind step ${stepNumber} input source candidate is invalid`);
      }
      const changedPaths = materializationGit(
        ['diff', '--name-only', '-z', `${comparisonBase}..${step.candidate.commit}`, '--'],
        checkoutRoot,
        `step ${stepNumber} changed paths`,
      )
        .split('\0')
        .filter(Boolean)
        .sort();
      let packageStarts = 0;
      const packageStartSentinel = () => {
        packageStarts += 1;
        onPackageStart?.();
        throw new Error('candidate rebind package start is forbidden');
      };
      await historicalRunner.rebindCandidateComposition({
        repositoryRoot: checkoutRoot,
        policy: historicalPolicy,
        sourceDirectory,
        finalDirectory: stepFinalDirectory,
        candidate: {
          commit: step.candidate.commit,
          tree: step.candidate.tree,
          clean: true,
          changedPaths,
        },
        onPackageStart: packageStartSentinel,
      });
      if (packageStarts !== 0) {
        throw new Error('candidate rebind package start is forbidden');
      }
      validateMaterializedDirectory({
        directory: stepFinalDirectory,
        expectedNames,
        artifactIdentities: manifestArtifacts,
        summaryIdentity: step.outputSummary,
        repositoryRoot,
        requireProtectedDigests: false,
      });
      for (const name of expectedNames) {
        if (name === 'summary.json') continue;
        const before = resolve(sourceDirectory, name);
        const after = resolve(stepFinalDirectory, name);
        if (
          !readFileSync(before).equals(readFileSync(after)) ||
          (lstatSync(before).mode & 0o777) !== (lstatSync(after).mode & 0o777)
        ) {
          throw new Error(`candidate rebind step ${stepNumber} artifact copy drifted`);
        }
      }
      sourceDirectory = stepFinalDirectory;
    }
    validateMaterializedDirectory({
      directory: sourceDirectory,
      expectedNames,
      artifactIdentities: manifestArtifacts,
      summaryIdentity: sourceSummary,
      repositoryRoot,
      requireProtectedDigests: false,
    });
    onPublicationPhase?.('before-final-rename');
    renameSync(sourceDirectory, materializedFinalDirectory);
    published = true;
    onPublicationPhase?.('after-final-rename');
    rmSync(materializationStagingDirectory, { recursive: true, force: false });
    return { ok: true, mode: 'materialized-protected-source', packageStarts: 0 };
  } catch (error) {
    if (published && existsSync(materializedFinalDirectory)) {
      rmSync(materializedFinalDirectory, { recursive: true, force: false });
    }
    if (existsSync(materializationStagingDirectory)) {
      rmSync(materializationStagingDirectory, { recursive: true, force: true });
    }
    throw error;
  }
}

let candidateRebindAttempt = 0;

export async function rebindCandidateComposition({
  repositoryRoot,
  policy,
  sourceDirectory,
  finalDirectory: reboundFinalDirectory,
  candidate,
  onPackageStart,
  onPublicationPhase,
  refreshPackages = [],
  nonBehavioralPaths = [],
  validationOnly = false,
}) {
  void onPackageStart;
  const candidateRebind = policy?.candidateRebind;
  const sourceCandidate = candidateRebind?.sourceCandidate;
  const historicalInputCandidate = candidateRebind?.historicalInputCandidate;
  const sourceSummary = candidateRebind?.sourceSummary;
  const sourceInputProjection = candidateRebind?.sourceInputProjection;
  const semanticRebindComparison = candidateRebind?.semanticRebindComparison;
  const devai145Adoption = policy?.devai145Adoption;
  const devaiTransition = devai145Adoption?.semanticMutationInputTransition;
  const currentRootManifestBytes = readFileSync(resolve(repositoryRoot, 'package.json'));
  const identityMatches = (bytes, identity) =>
    bytes.length === identity?.bytes &&
    sha256Hex(bytes) === identity.sha256 &&
    gitBlobOid(bytes) === identity.gitBlobOid;
  const versionTargetIdentity = devaiTransition?.versionRebaselineTarget?.targetRootManifest;
  const sourceAlreadyAtVersionTarget =
    semanticRebindComparison?.sourceRootManifest?.bytes === versionTargetIdentity?.bytes &&
    semanticRebindComparison?.sourceRootManifest?.sha256 === versionTargetIdentity?.sha256 &&
    semanticRebindComparison?.sourceRootManifest?.gitBlobOid === versionTargetIdentity?.gitBlobOid;
  const versionRebaseline =
    identityMatches(currentRootManifestBytes, versionTargetIdentity) &&
    !sourceAlreadyAtVersionTarget;
  const catalog = workspaceCatalog(repositoryRoot);
  const versionPathContract = devaiTransition?.versionRebaselineTarget?.changedPathContract;
  const versionChangedPaths = new Set();
  if (versionRebaseline) {
    if (
      catalog.size !== versionPathContract?.workspaceCount ||
      canonicalize(versionPathContract.perWorkspacePaths) !==
        canonicalize(['CHANGELOG.md', 'package.json']) ||
      !Array.isArray(versionPathContract.additionalPaths)
    ) {
      throw new Error('candidate rebind version path contract drifted');
    }
    for (const { workspace } of catalog.values()) {
      for (const path of versionPathContract.perWorkspacePaths) {
        versionChangedPaths.add(`${workspace}/${path}`);
      }
    }
    for (const path of versionPathContract.additionalPaths) versionChangedPaths.add(path);
    if (versionChangedPaths.size !== versionPathContract.exactPathCount) {
      throw new Error('candidate rebind version path census drifted');
    }
  }
  const selectiveRefresh = candidateRebind?.kind === 'protected-source-selective-refresh-v1';
  if (
    (!selectiveRefresh && candidateRebind?.kind !== 'zero-mutation-candidate-rebind-v2') ||
    candidateRebind.mismatchDisposition !== 'fail-before-package-start' ||
    (!selectiveRefresh &&
      (candidateRebind.mutationSubprocesses !== 0 || candidateRebind.packageStarts !== 0))
  ) {
    throw new Error('candidate rebind policy is invalid');
  }
  if (
    selectiveRefresh &&
    (canonicalize([...refreshPackages].sort()) !==
      canonicalize([...(candidateRebind.refreshPackages ?? [])].sort()) ||
      canonicalize([...nonBehavioralPaths].sort()) !==
        canonicalize([...(candidateRebind.nonBehavioralPaths ?? [])].sort()))
  ) {
    throw new Error('candidate refresh selection policy drifted');
  }
  if (
    !sourceCandidate ||
    !historicalInputCandidate ||
    !sourceSummary ||
    sourceSummary.packageCount !== policy.requiredRosterCount ||
    sourceSummary.artifactBindingCount !== policy.requiredRosterCount * 2
  ) {
    throw new Error('candidate rebind roster or artifact binding count is invalid');
  }
  if (
    devai145Adoption?.kind !== 'non-product-devai-provider-and-verifier-rollover-v1' ||
    devai145Adoption.mutationSubprocesses !== 0 ||
    devai145Adoption.packageStarts !== 0 ||
    devai145Adoption.mismatchDisposition !== 'fail-before-package-start' ||
    devai145Adoption.mutationInputProjection?.rosterCount !== policy.requiredRosterCount ||
    devai145Adoption.mutationInputProjection?.artifactBindingCount !==
      policy.requiredRosterCount * 2 ||
    devai145Adoption.mutationInputProjection?.productPackageSelectionCount !== 0
  ) {
    throw new Error('candidate rebind DEVAI adoption policy is invalid');
  }
  if (
    candidate?.clean !== true ||
    !/^[0-9a-f]{40}$/u.test(candidate.commit ?? '') ||
    !/^[0-9a-f]{40}$/u.test(candidate.tree ?? '')
  ) {
    throw new Error('candidate rebind requires a clean exact candidate');
  }
  if (
    !Array.isArray(candidate.changedPaths) ||
    new Set(candidate.changedPaths).size !== candidate.changedPaths.length
  ) {
    throw new Error('candidate rebind changed path population is invalid');
  }
  const allowedChangedPaths = new Set(policy.allowedChangedPaths);
  if (
    candidate.changedPaths.some(
      (path) => !allowedChangedPaths.has(path) && !versionChangedPaths.has(path),
    ) ||
    (versionRebaseline &&
      [...versionChangedPaths].some((path) => !candidate.changedPaths.includes(path)))
  ) {
    throw new Error('candidate rebind changed an unauthorized path');
  }
  if (gitText(['rev-parse', 'HEAD'], repositoryRoot).trim() !== candidate.commit) {
    throw new Error('candidate rebind commit drifted');
  }
  let observedTree;
  try {
    observedTree = gitText(['rev-parse', `${candidate.commit}^{tree}`], repositoryRoot).trim();
  } catch {
    throw new Error('candidate rebind tree drifted');
  }
  if (observedTree !== candidate.tree) throw new Error('candidate rebind tree drifted');
  let sourceTreeIdentity;
  try {
    sourceTreeIdentity = gitText(
      ['rev-parse', `${sourceCandidate.commit}^{tree}`],
      repositoryRoot,
    ).trim();
  } catch {
    throw new Error('candidate rebind source tree drifted');
  }
  if (sourceTreeIdentity !== sourceCandidate.tree) {
    throw new Error('candidate rebind source tree drifted');
  }
  let historicalInputTreeIdentity;
  try {
    historicalInputTreeIdentity = gitText(
      ['rev-parse', `${historicalInputCandidate.commit}^{tree}`],
      repositoryRoot,
    ).trim();
  } catch {
    throw new Error('candidate rebind historical input tree drifted');
  }
  if (historicalInputTreeIdentity !== historicalInputCandidate.tree) {
    throw new Error('candidate rebind historical input tree drifted');
  }
  gitText(
    ['merge-base', '--is-ancestor', sourceCandidate.commit, candidate.commit],
    repositoryRoot,
  );
  const observedChangedPaths = gitText(
    ['diff', '--name-only', '-z', `${sourceCandidate.commit}..${candidate.commit}`, '--'],
    repositoryRoot,
  )
    .split('\0')
    .filter(Boolean)
    .sort();
  if (canonicalize(observedChangedPaths) !== canonicalize([...candidate.changedPaths].sort())) {
    throw new Error('candidate rebind changed path census drifted');
  }

  const sourceSummaryPath = resolve(sourceDirectory, 'summary.json');
  const sourceSummaryBytes = readFileSync(sourceSummaryPath);
  if (sourceSummaryBytes.length !== sourceSummary.bytes) {
    throw new Error('candidate rebind source summary size drifted');
  }
  if (sha256Hex(sourceSummaryBytes) !== sourceSummary.sha256) {
    throw new Error('candidate rebind source summary digest drifted');
  }
  const summary = JSON.parse(sourceSummaryBytes.toString('utf8'));
  const sourceProvenance = sourceSummary.provenance;
  const chainedProtectedSource = sourceProvenance?.kind === 'protected-evidence-tag-rebound-v1';
  if (chainedProtectedSource) {
    const tagReference = `refs/tags/${sourceProvenance.tag}`;
    const observedTagObject = gitText(['rev-parse', tagReference], repositoryRoot).trim();
    const observedEvidenceCommit = gitText(
      ['rev-parse', `${tagReference}^{}`],
      repositoryRoot,
    ).trim();
    const observedEvidenceTree = gitText(
      ['rev-parse', `${observedEvidenceCommit}^{tree}`],
      repositoryRoot,
    ).trim();
    const evidenceManifestBytes = gitBytes(
      ['show', `${observedEvidenceCommit}:manifest.json`],
      repositoryRoot,
    );
    if (
      observedTagObject !== sourceProvenance.tagObject ||
      observedEvidenceCommit !== sourceProvenance.evidenceCommit ||
      observedEvidenceTree !== sourceProvenance.evidenceTree ||
      evidenceManifestBytes.length !== sourceProvenance.manifestBytes ||
      sha256Hex(evidenceManifestBytes) !== sourceProvenance.manifestSha256 ||
      canonicalize(summary.semanticRebindComparison) !==
        canonicalize(sourceSummary.priorSemanticRebindComparison)
    ) {
      throw new Error('candidate rebind protected source provenance drifted');
    }
  }
  if (
    summary.kind !== policy.composedSummaryKind ||
    summary.complete !== true ||
    summary.passed !== true ||
    canonicalize(summary.candidate) !== canonicalize(sourceCandidate) ||
    canonicalize(summary.baseline) !==
      canonicalize({
        commit: policy.baseline.commit,
        tree: policy.baseline.tree,
        summaryBytes: policy.baseline.summaryBytes,
        summarySha256: policy.baseline.summarySha256,
      })
  ) {
    throw new Error('candidate rebind source summary baseline or candidate identity drifted');
  }

  const { roster, failures } = discoverMutationRoster(repositoryRoot);
  if (
    failures.length > 0 ||
    roster.length !== policy.requiredRosterCount ||
    summary.packages?.length !== sourceSummary.packageCount
  ) {
    throw new Error('candidate rebind roster or package count drifted');
  }
  const rosterNames = roster.map(({ packageName }) => packageName).sort();
  const policyNames = [...policy.freshPackages, ...policy.reusedPackages].sort();
  const summaryNames = summary.packages.map(({ packageName }) => packageName).sort();
  if (
    canonicalize(rosterNames) !== canonicalize(policyNames) ||
    canonicalize(summaryNames) !== canonicalize(rosterNames)
  ) {
    throw new Error('candidate rebind roster drifted');
  }

  const sourceTree = treeEntries(sourceCandidate.commit, repositoryRoot);
  const historicalMutationInputTreeEntries = treeEntries(
    historicalInputCandidate.commit,
    repositoryRoot,
  );
  const currentTree = treeEntries(candidate.commit, repositoryRoot);
  const historicalProjection = [...summary.packages]
    .sort((left, right) => left.packageName.localeCompare(right.packageName))
    .map(({ packageName, inputProjectionDigest }) => ({ packageName, inputProjectionDigest }));
  const historicalProjectionBytes = Buffer.from(JSON.stringify(historicalProjection));
  if (
    sourceInputProjection?.kind !== 'sorted-package-input-projection-digest-map-v1' ||
    historicalProjectionBytes.length !== sourceInputProjection.bytes ||
    sha256Hex(historicalProjectionBytes) !== sourceInputProjection.sha256
  ) {
    throw new Error('candidate rebind historical input projection identity drifted');
  }

  const artifactNames = new Set(['summary.json']);
  const aggregateTotals = Object.fromEntries(MUTANT_STATUSES.map((status) => [status, 0]));
  let durationMs = 0;
  let freshDurationMs = 0;
  const observedRefreshPackages = [];
  for (const entry of summary.packages) {
    const rosterEntry = roster.find(({ packageName }) => packageName === entry.packageName);
    if (!rosterEntry) throw new Error('candidate rebind roster drifted');
    const expectedProvenance = entry.provenance;
    if (expectedProvenance !== 'fresh' && expectedProvenance !== 'reused') {
      throw new Error(`${entry.packageName}: candidate rebind provenance drifted`);
    }
    const expectedBaseline =
      expectedProvenance === 'reused'
        ? { commit: policy.baseline.commit, tree: policy.baseline.tree }
        : { commit: null, tree: null };
    if (
      entry.baselineCommit !== expectedBaseline.commit ||
      entry.baselineTree !== expectedBaseline.tree
    ) {
      throw new Error(`${entry.packageName}: candidate rebind baseline drifted`);
    }
    const reportName = entry.reportPath.split('/').at(-1);
    const resultName = entry.resultPath.split('/').at(-1);
    if (
      !reportName ||
      !resultName ||
      artifactNames.has(reportName) ||
      artifactNames.has(resultName)
    ) {
      throw new Error(`${entry.packageName}: candidate rebind artifact binding drifted`);
    }
    artifactNames.add(reportName);
    artifactNames.add(resultName);
    const boundResult = JSON.parse(readFileSync(resolve(sourceDirectory, resultName), 'utf8'));
    if (entry.score !== boundResult.score) {
      throw new Error(`${entry.packageName}: candidate rebind score drifted`);
    }
    const artifact = packageArtifact(sourceDirectory, entry);
    for (const name of [reportName, resultName]) {
      const metadata = lstatSync(resolve(sourceDirectory, name));
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(`${entry.packageName}: candidate rebind artifact type drifted`);
      }
      if ((metadata.mode & 0o777) !== 0o644) {
        throw new Error(`${entry.packageName}: candidate rebind artifact mode drifted`);
      }
    }
    if (
      entry.reportDigest !== artifact.reportDigest ||
      entry.resultDigest !== artifact.resultDigest
    ) {
      throw new Error(`${entry.packageName}: candidate rebind artifact digest drifted`);
    }
    if (canonicalize(entry.thresholds) !== canonicalize(rosterEntry.thresholds)) {
      throw new Error(`${entry.packageName}: candidate rebind threshold drifted`);
    }
    if (canonicalize(entry.targetCensus) !== canonicalize(artifact.targetCensus)) {
      throw new Error(`${entry.packageName}: candidate rebind target census drifted`);
    }
    if (canonicalize(entry.statusTotals) !== canonicalize(artifact.statusTotals)) {
      throw new Error(`${entry.packageName}: candidate rebind status totals drifted`);
    }
    if (
      entry.score !== artifact.result.score ||
      entry.score < rosterEntry.thresholds.break ||
      entry.durationMs !== artifact.result.durationMs ||
      entry.passed !== true
    ) {
      throw new Error(`${entry.packageName}: candidate rebind score drifted`);
    }
    if (
      entry.inputProjectionDigest !==
      mutationInputProjection(rosterEntry, historicalMutationInputTreeEntries, catalog)
    ) {
      throw new Error(`${entry.packageName}: candidate rebind historical projection drifted`);
    }
    if (
      expectedProvenance === 'fresh' &&
      (entry.process?.errorAbsent !== true ||
        entry.process?.status !== 0 ||
        entry.process?.signal !== null ||
        canonicalize(entry.process) !== canonicalize(artifact.result.process))
    ) {
      throw new Error(`${entry.packageName}: candidate rebind provenance process drifted`);
    }
    durationMs += entry.durationMs;
    if (expectedProvenance === 'fresh') freshDurationMs += entry.durationMs;
    for (const status of MUTANT_STATUSES) aggregateTotals[status] += entry.statusTotals[status];

    const historicalInputs = mutationInputEntries(
      rosterEntry,
      historicalMutationInputTreeEntries,
      catalog,
    ).filter(({ path }) => path !== 'package.json');
    const historicalSourceInputs = mutationInputEntries(rosterEntry, sourceTree, catalog).filter(
      ({ path }) => path !== 'package.json',
    );
    const semanticTransitionPaths = new Set(
      selectiveRefresh
        ? []
        : [
            'package.json',
            'pnpm-lock.yaml',
            devai145Adoption.governanceRunnerTransition?.path,
            ...(versionRebaseline ? versionChangedPaths : []),
          ],
    );
    const sourceInputs = mutationInputEntries(rosterEntry, sourceTree, catalog).filter(
      ({ path }) => !semanticTransitionPaths.has(path),
    );
    const currentInputs = mutationInputEntries(rosterEntry, currentTree, catalog).filter(
      ({ path }) => !semanticTransitionPaths.has(path),
    );
    const sourceBehavioralInputs = sourceInputs.filter(
      ({ path }) => !nonBehavioralPaths.includes(path),
    );
    const currentBehavioralInputs = currentInputs.filter(
      ({ path }) => !nonBehavioralPaths.includes(path),
    );
    if (
      !chainedProtectedSource &&
      canonicalize(historicalInputs) !== canonicalize(historicalSourceInputs)
    ) {
      throw new Error(
        `${entry.packageName}: otherMutationInputTreeEntries mode type oid identity drifted`,
      );
    }
    if (canonicalize(sourceBehavioralInputs) !== canonicalize(currentBehavioralInputs)) {
      observedRefreshPackages.push(entry.packageName);
    }
  }
  if (canonicalize(observedRefreshPackages.sort()) !== canonicalize([...refreshPackages].sort())) {
    throw new Error('candidate refresh package selection drifted');
  }
  if (artifactNames.size !== sourceSummary.artifactBindingCount + 1) {
    throw new Error('candidate rebind artifact binding count drifted');
  }
  const observedFiles = readdirSync(sourceDirectory).sort();
  if (canonicalize(observedFiles) !== canonicalize([...artifactNames].sort())) {
    throw new Error('candidate rebind artifact population drifted');
  }
  const sourceFreshCount = summary.packages.filter(
    ({ provenance }) => provenance === 'fresh',
  ).length;
  const expectedAggregate = {
    packageCount: policy.requiredRosterCount,
    freshPackageCount: sourceFreshCount,
    reusedPackageCount: policy.requiredRosterCount - sourceFreshCount,
    durationMs,
    freshDurationMs,
    score: score(aggregateTotals),
    statusTotals: aggregateTotals,
  };
  if (canonicalize(summary.aggregate) !== canonicalize(expectedAggregate)) {
    throw new Error('candidate rebind aggregate score or status drifted');
  }

  const semanticContract = canonicalize({
    kind: semanticRebindComparison?.kind,
    source: semanticRebindComparison?.sourceRootManifest,
    target: semanticRebindComparison?.targetRootManifest,
    transitions: semanticRebindComparison?.allowedScriptTransitions,
    comparison: semanticRebindComparison?.comparison,
  });
  if (
    semanticRebindComparison?.kind !== 'root-manifest-unchanged-with-historical-input-v1' ||
    Buffer.byteLength(semanticContract) !== semanticRebindComparison.canonicalContractBytes ||
    sha256Hex(semanticContract) !== semanticRebindComparison.canonicalContractSha256 ||
    semanticRebindComparison.comparison?.rootManifest !== 'source-and-target-identical' ||
    semanticRebindComparison.comparison?.historicalMutationInputTreeEntries !==
      'match-explicit-historical-candidate-mode-type-oid' ||
    semanticRebindComparison.comparison?.otherMutationInputTreeEntries !== 'identical-mode-type-oid'
  ) {
    throw new Error('candidate rebind semantic comparison identity drifted');
  }
  const sourceManifestBytes = gitBytes(
    ['show', `${sourceCandidate.commit}:package.json`],
    repositoryRoot,
  );
  const targetManifestBytes = gitBytes(
    ['show', `${sourceCandidate.commit}:package.json`],
    repositoryRoot,
  );
  for (const [label, bytes, identity] of [
    ['source', sourceManifestBytes, semanticRebindComparison.sourceRootManifest],
    ['target', targetManifestBytes, semanticRebindComparison.targetRootManifest],
  ]) {
    if (
      bytes.length !== identity.bytes ||
      sha256Hex(bytes) !== identity.sha256 ||
      gitBlobOid(bytes) !== identity.gitBlobOid
    ) {
      throw new Error(`candidate rebind ${label} root manifest identity drifted`);
    }
  }
  let projectedManifest = sourceManifestBytes.toString('utf8');
  for (const transition of semanticRebindComparison.allowedScriptTransitions) {
    const script = transition.field.replace(/^scripts\./u, '');
    const from = `${JSON.stringify(script)}: ${JSON.stringify(transition.from)}`;
    const to = `${JSON.stringify(script)}: ${JSON.stringify(transition.to)}`;
    if (projectedManifest.split(from).length !== 2) {
      throw new Error('candidate rebind semantic manifest transition drifted');
    }
    projectedManifest = projectedManifest.replace(from, to);
  }
  if (!Buffer.from(projectedManifest).equals(targetManifestBytes)) {
    throw new Error('candidate rebind semantic manifest comparison drifted');
  }
  const sourceManifest = JSON.parse(sourceManifestBytes.toString('utf8'));
  const targetManifest = JSON.parse(targetManifestBytes.toString('utf8'));
  for (const transition of semanticRebindComparison.allowedScriptTransitions) {
    const script = transition.field.replace(/^scripts\./u, '');
    if (
      sourceManifest.scripts?.[script] !== transition.from ||
      targetManifest.scripts?.[script] !== transition.to
    ) {
      throw new Error('candidate rebind semantic manifest script drifted');
    }
  }
  const normalizedTargetManifest = structuredClone(targetManifest);
  for (const transition of semanticRebindComparison.allowedScriptTransitions) {
    normalizedTargetManifest.scripts[transition.field.replace(/^scripts\./u, '')] = transition.from;
  }
  if (canonicalize(normalizedTargetManifest) !== canonicalize(sourceManifest)) {
    throw new Error('candidate rebind root manifest field drifted');
  }

  if (
    devaiTransition?.kind !== 'exact-devai-provider-input-transition-v1' ||
    devaiTransition.manifestTransition?.field !== 'devDependencies.@aarusso-nyx/devai' ||
    devaiTransition.manifestTransition.from !==
      (chainedProtectedSource
        ? devai145Adoption.provider.targetVersion
        : devai145Adoption.provider.sourceVersion) ||
    devaiTransition.manifestTransition.to !== devai145Adoption.provider.targetVersion ||
    devaiTransition.versionRebaselineTarget?.manifestTransition?.field !== 'version' ||
    devaiTransition.versionRebaselineTarget.manifestTransition.from !== '1.0.0' ||
    devaiTransition.versionRebaselineTarget.manifestTransition.to !== '1.1.1' ||
    !Array.isArray(devaiTransition.lockfileTransitions) ||
    devaiTransition.lockfileTransitions.length !== devaiTransition.lockfileTransitionCount ||
    devaiTransition.otherMutationInputTreeEntries !== 'identical-mode-type-oid'
  ) {
    throw new Error('candidate rebind DEVAI semantic transition is invalid');
  }
  if (
    chainedProtectedSource &&
    (devaiTransition.sourceDisposition !==
      'provider-transition-already-validated-in-protected-source' ||
      canonicalize(devaiTransition.sourceRootManifest) !==
        canonicalize(devaiTransition.targetRootManifest) ||
      canonicalize(devaiTransition.sourceLockfile) !==
        canonicalize(devaiTransition.targetLockfile) ||
      devaiTransition.lockfileTransitionCount !== 0)
  ) {
    throw new Error('candidate rebind protected DEVAI source transition is invalid');
  }
  const validateIdentity = (label, bytes, identity) => {
    if (
      bytes.length !== identity?.bytes ||
      sha256Hex(bytes) !== identity.sha256 ||
      gitBlobOid(bytes) !== identity.gitBlobOid
    ) {
      throw new Error(`candidate rebind ${label} identity drifted`);
    }
  };
  const currentManifestBytes = currentRootManifestBytes;
  const governedSourceRootIdentity = sourceAlreadyAtVersionTarget
    ? versionTargetIdentity
    : devaiTransition.sourceRootManifest;
  const governedTargetRootIdentity = sourceAlreadyAtVersionTarget
    ? versionTargetIdentity
    : devaiTransition.targetRootManifest;
  validateIdentity('DEVAI source root manifest', sourceManifestBytes, governedSourceRootIdentity);
  if (!versionRebaseline && !selectiveRefresh) {
    validateIdentity(
      'DEVAI target root manifest',
      currentManifestBytes,
      governedTargetRootIdentity,
    );
  }
  const sourceDevaiManifest = JSON.parse(sourceManifestBytes.toString('utf8'));
  const currentDevaiManifest = JSON.parse(currentManifestBytes.toString('utf8'));
  if (
    sourceDevaiManifest.devDependencies?.['@aarusso-nyx/devai'] !==
      devaiTransition.manifestTransition.from ||
    currentDevaiManifest.devDependencies?.['@aarusso-nyx/devai'] !==
      devaiTransition.manifestTransition.to
  ) {
    throw new Error('candidate rebind DEVAI manifest transition drifted');
  }
  const normalizedCurrentManifest = structuredClone(currentDevaiManifest);
  normalizedCurrentManifest.devDependencies['@aarusso-nyx/devai'] =
    devaiTransition.manifestTransition.from;
  if (versionRebaseline) {
    const versionTransition = devaiTransition.versionRebaselineTarget.manifestTransition;
    if (
      sourceDevaiManifest.version !== versionTransition.from ||
      currentDevaiManifest.version !== versionTransition.to
    ) {
      throw new Error('candidate rebind version manifest transition drifted');
    }
    normalizedCurrentManifest.version = versionTransition.from;
  }
  if (
    !selectiveRefresh &&
    canonicalize(normalizedCurrentManifest) !== canonicalize(sourceDevaiManifest)
  ) {
    throw new Error('candidate rebind DEVAI manifest field drifted');
  }

  if (versionRebaseline) {
    const sourceWorkspaceManifests = new Map();
    for (const [packageName, { workspace }] of catalog) {
      sourceWorkspaceManifests.set(
        packageName,
        JSON.parse(
          gitBytes(
            ['show', `${sourceCandidate.commit}:${workspace}/package.json`],
            repositoryRoot,
          ).toString('utf8'),
        ),
      );
    }
    for (const [packageName, { manifest: targetWorkspaceManifest }] of catalog) {
      const sourceWorkspaceManifest = sourceWorkspaceManifests.get(packageName);
      if (targetWorkspaceManifest.version !== '1.1.1') {
        throw new Error(`${packageName}: candidate rebind version drifted`);
      }
      const normalizedWorkspaceManifest = structuredClone(targetWorkspaceManifest);
      normalizedWorkspaceManifest.version = sourceWorkspaceManifest.version;
      for (const field of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ]) {
        for (const [dependencyName, sourceRange] of Object.entries(
          sourceWorkspaceManifest[field] ?? {},
        )) {
          const targetRange = targetWorkspaceManifest[field]?.[dependencyName];
          if (targetRange === sourceRange) continue;
          const dependencySourceVersion = sourceWorkspaceManifests.get(dependencyName)?.version;
          if (
            !dependencySourceVersion ||
            sourceRange !== `^${dependencySourceVersion}` ||
            targetRange !== '^1.1.1'
          ) {
            throw new Error(`${packageName}: candidate rebind dependency version drifted`);
          }
          normalizedWorkspaceManifest[field][dependencyName] = sourceRange;
        }
      }
      if (canonicalize(normalizedWorkspaceManifest) !== canonicalize(sourceWorkspaceManifest)) {
        throw new Error(`${packageName}: candidate rebind package manifest field drifted`);
      }
    }
  }

  const sourceLockfileBytes = gitBytes(
    ['show', `${sourceCandidate.commit}:pnpm-lock.yaml`],
    repositoryRoot,
  );
  const currentLockfileBytes = readFileSync(resolve(repositoryRoot, 'pnpm-lock.yaml'));
  validateIdentity('DEVAI source lockfile', sourceLockfileBytes, devaiTransition.sourceLockfile);
  validateIdentity('DEVAI target lockfile', currentLockfileBytes, devaiTransition.targetLockfile);
  let projectedLockfile = sourceLockfileBytes.toString('utf8');
  for (const transition of devaiTransition.lockfileTransitions) {
    if (
      typeof transition?.from !== 'string' ||
      typeof transition.to !== 'string' ||
      transition.from === transition.to ||
      projectedLockfile.split(transition.from).length !== 2
    ) {
      throw new Error('candidate rebind DEVAI lockfile transition drifted');
    }
    projectedLockfile = projectedLockfile.replace(transition.from, transition.to);
  }
  if (!Buffer.from(projectedLockfile).equals(currentLockfileBytes)) {
    throw new Error('candidate rebind DEVAI lockfile comparison drifted');
  }

  const runnerTransition = devai145Adoption.governanceRunnerTransition;
  const expectedRunnerScope = selectiveRefresh
    ? 'protected-source-selective-refresh-validation-and-execution'
    : 'zero-execution-candidate-rebind-validation-only';
  if (
    runnerTransition?.path !== 'scripts/run-mutation-evidence.mjs' ||
    runnerTransition.scope !== expectedRunnerScope ||
    runnerTransition.packageExecutionPathChanged !== selectiveRefresh ||
    runnerTransition.requiredDirectInvocationSentinel !==
      'candidate rebind package start is forbidden'
  ) {
    throw new Error('candidate rebind governance runner transition is invalid');
  }
  const sourceRunnerBytes = gitBytes(
    ['show', `${sourceCandidate.commit}:${runnerTransition.path}`],
    repositoryRoot,
  );
  const currentRunnerBytes = readFileSync(resolve(repositoryRoot, runnerTransition.path));
  validateIdentity('source governance runner', sourceRunnerBytes, runnerTransition.source);
  validateIdentity('target governance runner', currentRunnerBytes, runnerTransition.target);

  const promotionVerifier = candidateRebind.promotionVerifier;
  const verifierPath = resolve(repositoryRoot, promotionVerifier?.path ?? '');
  const verifierMetadata = lstatSync(verifierPath);
  const verifierBytes = readFileSync(verifierPath);
  if (
    promotionVerifier?.requiredBefore !== 'release:publish:ci' ||
    !verifierMetadata.isFile() ||
    verifierMetadata.isSymbolicLink() ||
    (verifierMetadata.mode & 0o777).toString(8).padStart(4, '0') !== promotionVerifier.mode ||
    verifierBytes.length !== promotionVerifier.bytes ||
    sha256Hex(verifierBytes) !== promotionVerifier.sha256
  ) {
    throw new Error('candidate rebind promotion verifier drifted');
  }

  if (validationOnly) {
    return {
      ok: true,
      mode: 'validated-protected-source-for-selective-refresh',
      packageStarts: 0,
      summary,
      observedFiles,
    };
  }

  const attempt = (candidateRebindAttempt += 1);
  const parent = dirname(reboundFinalDirectory);
  const reboundStagingDirectory = resolve(
    parent,
    `.mutation-rebind-stage-${process.pid}-${attempt}`,
  );
  const reboundBackupDirectory = resolve(
    parent,
    `.mutation-rebind-backup-${process.pid}-${attempt}`,
  );
  const finalMetadata = lstatSync(reboundFinalDirectory);
  if (!finalMetadata.isDirectory() || finalMetadata.isSymbolicLink()) {
    throw new Error('candidate rebind final evidence directory is invalid');
  }
  if (existsSync(reboundStagingDirectory) || existsSync(reboundBackupDirectory)) {
    throw new Error('candidate rebind staging identity already exists');
  }
  mkdirSync(reboundStagingDirectory, { recursive: false });
  try {
    for (const name of observedFiles) {
      if (name === 'summary.json') continue;
      const sourcePath = resolve(sourceDirectory, name);
      const targetPath = resolve(reboundStagingDirectory, name);
      copyFileSync(sourcePath, targetPath);
      chmodSync(targetPath, lstatSync(sourcePath).mode & 0o777);
      if (
        !readFileSync(targetPath).equals(readFileSync(sourcePath)) ||
        (lstatSync(targetPath).mode & 0o777) !== (lstatSync(sourcePath).mode & 0o777)
      ) {
        throw new Error('candidate rebind artifact copy drifted');
      }
    }
    const reboundSummary = structuredClone(summary);
    reboundSummary.candidate = { commit: candidate.commit, tree: candidate.tree };
    reboundSummary.semanticRebindComparison = semanticRebindComparison;
    canonicalWrite(resolve(reboundStagingDirectory, 'summary.json'), reboundSummary);
    chmodSync(
      resolve(reboundStagingDirectory, 'summary.json'),
      lstatSync(sourceSummaryPath).mode & 0o777,
    );
    publishComposedDirectory({
      staged: reboundStagingDirectory,
      final: reboundFinalDirectory,
      backup: reboundBackupDirectory,
      onPublicationPhase,
    });
    return {
      ok: true,
      mode: 'candidate-rebound-composition',
      packageCount: summary.aggregate.packageCount,
      score: summary.aggregate.score,
      durationMs: summary.aggregate.durationMs,
      summaryPath: `${artifactRoot}/summary.json`,
    };
  } catch (error) {
    rmSync(reboundStagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

if (isDirectInvocation) {
  process.on('uncaughtException', reportFatal);
  if (
    packageArgumentIndex !== -1 &&
    (!diagnosticPackageName || diagnosticPackageName.startsWith('-'))
  ) {
    throw new Error('--package requires one exact package name');
  }
  if (normalizeExisting && diagnosticPackageName) {
    throw new Error('--normalize-existing cannot be combined with --package');
  }

  const finalRelative = relative(repoRoot, finalDirectory).split('\\').join('/');
  if (finalRelative !== artifactRoot)
    throw new Error('mutation artifact target escaped repository');
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
    if (policy.candidateRebind) {
      const sourceSummaryPath = resolve(repoRoot, policy.candidateRebind.sourceSummary.path);
      await materializeCandidateRebindSource({
        repositoryRoot: repoRoot,
        policy,
        finalDirectory: dirname(sourceSummaryPath),
        onPackageStart: () => {
          throw new Error('candidate rebind package start is forbidden');
        },
      });
      if (!existsSync(sourceSummaryPath))
        throw new Error('candidate rebind source summary is missing');
      const sourceBytes = readFileSync(sourceSummaryPath);
      if (sourceBytes.length !== policy.candidateRebind.sourceSummary.bytes) {
        throw new Error('candidate rebind source summary size drifted');
      }
      if (sha256Hex(sourceBytes) !== policy.candidateRebind.sourceSummary.sha256) {
        throw new Error('candidate rebind source summary digest drifted');
      }
      const rebindChangedPaths = gitText([
        'diff',
        '--name-only',
        '-z',
        `${policy.candidateRebind.sourceCandidate.commit}..${candidate.commit}`,
        '--',
      ])
        .split('\0')
        .filter(Boolean)
        .sort();
      const nonBehavioralPaths = policy.candidateRebind.nonBehavioralPaths ?? [];
      const packageInputs = roster.map((entry) => ({
        packageName: entry.packageName,
        sourceEntries: mutationInputEntries(
          entry,
          treeEntries(policy.candidateRebind.sourceCandidate.commit),
          catalog,
        ),
        candidateEntries: mutationInputEntries(entry, currentTree, catalog),
      }));
      const refreshPackages = selectCandidateRefreshPackages({
        packageInputs,
        nonBehavioralPaths,
      });
      if (
        policy.candidateRebind.kind === 'protected-source-selective-refresh-v1' &&
        (canonicalize(refreshPackages) !==
          canonicalize([...(policy.candidateRebind.refreshPackages ?? [])].sort()) ||
          canonicalize(refreshPackages) !== canonicalize([...policy.freshPackages].sort()))
      ) {
        throw new Error('candidate refresh package selection drifted');
      }
      const rebound = await rebindCandidateComposition({
        repositoryRoot: repoRoot,
        policy,
        sourceDirectory: dirname(sourceSummaryPath),
        finalDirectory,
        candidate: { ...candidate, clean: true, changedPaths: rebindChangedPaths },
        onPackageStart: () => {
          throw new Error('candidate rebind package start is forbidden');
        },
        refreshPackages,
        nonBehavioralPaths,
        validationOnly: policy.candidateRebind.kind === 'protected-source-selective-refresh-v1',
      });
      if (policy.candidateRebind.kind === 'protected-source-selective-refresh-v1') {
        const preflight = preflightFullMutationInfrastructure();
        if (preflight) {
          process.stderr.write(`${JSON.stringify(preflight)}\n`);
          process.exit(1);
        }

        rmSync(stagingDirectory, { recursive: true, force: true });
        mkdirSync(stagingDirectory, { recursive: true });
        try {
          const sourceByName = new Map(
            rebound.summary.packages.map((entry) => [entry.packageName, entry]),
          );
          for (const packageName of policy.reusedPackages) {
            const sourceEntry = sourceByName.get(packageName);
            if (!sourceEntry) throw new Error('candidate refresh protected roster is incomplete');
            copyReusedPackage(sourceEntry);
          }
          const freshRoster = policy.freshPackages.map((packageName) =>
            roster.find((entry) => entry.packageName === packageName),
          );
          if (freshRoster.some((entry) => entry === undefined)) {
            throw new Error('candidate refresh fresh roster is incomplete');
          }
          const freshPackages = freshRoster.map(runPackage);
          const freshByName = new Map(freshPackages.map((entry) => [entry.packageName, entry]));
          const freshSet = new Set(policy.freshPackages);
          const packages = roster.map((rosterEntry) => {
            const provenance = freshSet.has(rosterEntry.packageName) ? 'fresh' : 'reused';
            const rawEntry =
              provenance === 'fresh'
                ? freshByName.get(rosterEntry.packageName)
                : sourceByName.get(rosterEntry.packageName);
            if (!rawEntry) throw new Error('candidate refresh package binding is incomplete');
            const artifact = packageArtifact(stagingDirectory, rawEntry);
            if (
              canonicalize(artifact.result.thresholds) !== canonicalize(rosterEntry.thresholds) ||
              artifact.result.score < rosterEntry.thresholds.break ||
              (provenance === 'fresh' &&
                (artifact.result.process?.errorAbsent !== true ||
                  artifact.result.process?.status !== 0 ||
                  artifact.result.process?.signal !== null ||
                  artifact.statusTotals.NoCoverage !== 0))
            ) {
              throw new Error(`${rosterEntry.packageName}: refreshed mutation package failed`);
            }
            return {
              packageName: rosterEntry.packageName,
              workspace: rosterEntry.workspace,
              provenance,
              baselineCommit:
                provenance === 'reused' ? policy.candidateRebind.sourceCandidate.commit : null,
              baselineTree:
                provenance === 'reused' ? policy.candidateRebind.sourceCandidate.tree : null,
              inputProjectionDigest: mutationInputProjection(rosterEntry, currentTree, catalog),
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
            for (const status of MUTANT_STATUSES) {
              aggregateTotals[status] += entry.statusTotals[status];
            }
          }
          const summary = {
            schemaVersion: '1.0.0',
            kind: policy.composedSummaryKind,
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
              mode: 'protected-source-selective-refresh',
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
      process.stdout.write(`${JSON.stringify(rebound)}\n`);
      process.exit(0);
    }
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
}
