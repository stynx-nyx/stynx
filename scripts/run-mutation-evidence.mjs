#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

rmSync(stagingDirectory, { recursive: true, force: true });
mkdirSync(stagingDirectory, { recursive: true });
try {
  const packages = selectedRoster.map(runPackage);
  if (diagnosticPackageName) {
    const [entry] = packages;
    rmSync(stagingDirectory, { recursive: true, force: true });
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: 'diagnostic',
        packageName: entry.packageName,
        score: entry.score,
        statusTotals: entry.statusTotals,
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
