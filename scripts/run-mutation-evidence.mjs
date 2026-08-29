#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
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
  buildMutationEnvironment,
  classifyMutationOutcome,
  normalizeMutationReport,
  withMutationReportCleanup,
} from './lib/mutation-evidence.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = '.devai/state/check-cache/v1/artifacts/mutation';
const finalDirectory = resolve(repoRoot, artifactRoot);
const stagingDirectory = resolve(dirname(finalDirectory), `.mutation-stage-${String(process.pid)}`);
const backupDirectory = resolve(dirname(finalDirectory), `.mutation-backup-${String(process.pid)}`);
const focusedManifestMaxBytes = 64 * 1024;
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

function canonicalWrite(path, value, mode) {
  mkdirSync(dirname(path), { recursive: true });
  const options = mode === undefined ? { flag: 'wx' } : { flag: 'wx', mode };
  writeFileSync(path, `${canonicalize(value)}\n`, options);
  if (mode !== undefined) chmodSync(path, mode);
}

function gitOutput(arguments_, label) {
  const result = spawnSync('git', arguments_, {
    cwd: repoRoot,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.error !== undefined || result.signal !== null || result.status !== 0) {
    throw new Error(`focused mutation evidence could not bind ${label}`);
  }
  return result.stdout;
}

function focusedCandidateIdentity() {
  const commit = gitOutput(['rev-parse', 'HEAD^{commit}'], 'candidate commit')
    .toString('utf8')
    .trim();
  const tree = gitOutput(['rev-parse', 'HEAD^{tree}'], 'candidate tree').toString('utf8').trim();
  if (!/^[0-9a-f]{40}$/u.test(commit) || !/^[0-9a-f]{40}$/u.test(tree)) {
    throw new Error('focused mutation evidence received an invalid candidate identity');
  }
  const diff = gitOutput(
    ['diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--'],
    'candidate diff',
  );
  return { commit, tree, diffDigest: sha256Hex(diff) };
}

function assertFocusedCandidate(expected) {
  const actual = focusedCandidateIdentity();
  if (canonicalize(actual) !== canonicalize(expected)) {
    throw new Error('focused mutation candidate changed during execution');
  }
}

function confinedWorkspaceFile(entry, path, label) {
  portablePath(path, label);
  const workspaceRoot = resolve(repoRoot, entry.workspace);
  const absolute = resolve(workspaceRoot, path);
  const escaped = relative(workspaceRoot, absolute);
  if (escaped.startsWith('..') || escaped === '' || escaped.startsWith('/')) {
    throw new Error(`${label} escaped the mutation workspace`);
  }
  return absolute;
}

function focusedInputDigests(entry, report) {
  const packageDigest = sha256Hex(readFileSync(resolve(repoRoot, entry.workspace, 'package.json')));
  const configDigest = sha256Hex(readFileSync(resolve(repoRoot, entry.config)));
  const sources = Object.keys(report.files ?? {})
    .sort()
    .map((path) => ({
      path,
      digest: sha256Hex(readFileSync(confinedWorkspaceFile(entry, path, 'mutation source path'))),
    }));
  const targets = Object.entries(report.files ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([path, fileResult]) =>
      fileResult.mutants.map((mutant) => ({
        path,
        identity: String(mutant.id ?? ''),
        location: mutant.location,
        mutator: mutant.mutatorName,
      })),
    );
  return {
    packageDigest,
    configDigest,
    sourceDigest: sha256Hex(canonicalize(sources)),
    targetDigest: sha256Hex(canonicalize(targets)),
  };
}

function focusedPersistenceReport(report) {
  const persisted = structuredClone(report);
  delete persisted.testFiles;
  for (const fileResult of Object.values(persisted.files ?? {})) {
    for (const mutant of fileResult.mutants ?? []) {
      delete mutant.coveredBy;
      delete mutant.killedBy;
    }
  }
  return persisted;
}

function focusedArtifactDirectory(stem) {
  portablePath(stem, 'focused mutation artifact stem');
  return resolve(finalDirectory, 'focused', stem);
}

function publishFocusedArtifacts(stem) {
  const focusedDirectory = focusedArtifactDirectory(stem);
  const focusedRoot = dirname(focusedDirectory);
  const focusedBackup = resolve(focusedRoot, `.${stem}-backup-${String(process.pid)}`);
  mkdirSync(focusedRoot, { recursive: true });
  rmSync(focusedBackup, { recursive: true, force: true });
  if (existsSync(focusedDirectory)) renameSync(focusedDirectory, focusedBackup);
  let published = false;
  try {
    renameSync(stagingDirectory, focusedDirectory);
    published = true;
    rmSync(focusedBackup, { recursive: true, force: true });
  } catch (error) {
    if (existsSync(focusedBackup)) {
      if (published) rmSync(focusedDirectory, { recursive: true, force: true });
      renameSync(focusedBackup, focusedDirectory);
    }
    throw error;
  }
}

function writeFocusedManifest(stem, manifest) {
  const bytes = Buffer.from(`${canonicalize(manifest)}\n`, 'utf8');
  if (bytes.length > focusedManifestMaxBytes) {
    throw new Error('focused mutation manifest exceeds the bounded evidence limit');
  }
  canonicalWrite(resolve(stagingDirectory, `${stem}.manifest.json`), manifest, 0o600);
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

function runPackage(entry, candidate) {
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
      const rawReport = JSON.parse(readFileSync(rawReportPath, 'utf8'));
      report = normalizeMutationReport(rawReport, entry.thresholds, entry.workspace, repoRoot);
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
    const processResult = {
      status: subprocessResult?.status ?? null,
      signal: subprocessResult?.signal ?? null,
    };
    const inputDigests = diagnosticPackageName ? focusedInputDigests(entry, report) : undefined;
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
      if (diagnosticPackageName) {
        assertFocusedCandidate(candidate);
        const stem = entry.workspace.replaceAll('/', '-');
        writeFocusedManifest(stem, {
          schemaVersion: '1.0.0',
          kind: 'mutation-focused-failure-v1',
          candidate,
          packageName: entry.packageName,
          inputDigests,
          process: processResult,
          score: mutationScore,
          thresholds: entry.thresholds,
          statusTotals,
          classification: outcome.classification,
          reason: outcome.reason,
        });
        publishFocusedArtifacts(stem);
      }
      throw new Error(
        `${entry.packageName}: mutation-harness-failure (${outcome.reason}; ` +
          `score=${mutationScore})`,
      );
    }
    const stem = entry.workspace.replaceAll('/', '-');
    const focusedRoot = `${artifactRoot}/focused/${stem}`;
    const reportPath = diagnosticPackageName
      ? `${focusedRoot}/${stem}.stryker.json`
      : `${artifactRoot}/${stem}.stryker.json`;
    const resultPath = diagnosticPackageName
      ? `${focusedRoot}/${stem}.result.json`
      : `${artifactRoot}/${stem}.result.json`;
    const persistedReport = diagnosticPackageName ? focusedPersistenceReport(report) : report;
    const reportBytes = canonicalize(persistedReport);
    const reportDigest = sha256Hex(diagnosticPackageName ? `${reportBytes}\n` : reportBytes);
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
      reportDigest,
      ...(diagnosticPackageName ? { process: processResult } : {}),
    };
    const resultBytes = canonicalize(result);
    const resultDigest = sha256Hex(diagnosticPackageName ? `${resultBytes}\n` : resultBytes);
    canonicalWrite(
      resolve(stagingDirectory, `${stem}.stryker.json`),
      persistedReport,
      diagnosticPackageName ? 0o600 : undefined,
    );
    canonicalWrite(
      resolve(stagingDirectory, `${stem}.result.json`),
      result,
      diagnosticPackageName ? 0o600 : undefined,
    );
    process.stdout.write(
      `${JSON.stringify({ packageName: entry.packageName, passed, score: mutationScore, durationMs })}\n`,
    );
    return {
      packageName: entry.packageName,
      workspace: entry.workspace,
      resultPath,
      reportPath,
      resultDigest,
      reportDigest,
      score: mutationScore,
      passed,
      durationMs,
      statusTotals,
      process: processResult,
      inputDigests,
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
const candidate = diagnosticPackageName ? focusedCandidateIdentity() : undefined;

rmSync(stagingDirectory, { recursive: true, force: true });
mkdirSync(stagingDirectory, { recursive: true });
try {
  const packages = selectedRoster.map((entry) => runPackage(entry, candidate));
  if (diagnosticPackageName) {
    const [entry] = packages;
    assertFocusedCandidate(candidate);
    const stem = entry.workspace.replaceAll('/', '-');
    writeFocusedManifest(stem, {
      schemaVersion: '1.0.0',
      kind: 'mutation-focused-evidence-v1',
      candidate,
      packageName: entry.packageName,
      inputDigests: entry.inputDigests,
      process: entry.process,
      score: entry.score,
      thresholds: selectedRoster[0].thresholds,
      statusTotals: entry.statusTotals,
      reportDigest: entry.reportDigest,
      resultDigest: entry.resultDigest,
    });
    publishFocusedArtifacts(stem);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: 'diagnostic',
        packageName: entry.packageName,
        score: entry.score,
        statusTotals: entry.statusTotals,
        manifestPath: `${artifactRoot}/focused/${stem}/${stem}.manifest.json`,
      })}\n`,
    );
    process.exit(0);
  }
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
