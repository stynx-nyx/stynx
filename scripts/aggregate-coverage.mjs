#!/usr/bin/env node
// Aggregates per-package jest coverage (unit + integration) into
// coverage/coverage-final.json for the F3×T2 sensor.
//
// Usage:
//   node scripts/aggregate-coverage.mjs [--packages=auth,sessions]
//                                       [--no-integration]
//                                       [--no-unit]
//
// Without --packages, runs every workspace package under packages/* that has a
// jest.config.cjs. Always also runs jest.integration.config.cjs when present,
// unless --no-integration is set. Coverage from both modes is merged per file
// via istanbul-lib-coverage so statement/branch/function counters add up
// properly when both runs share the same instrumentation.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import libCoverage from 'istanbul-lib-coverage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const packagesRoot = join(repoRoot, 'packages');
const aggregateOut = join(repoRoot, 'coverage', 'coverage-final.json');
const scratchRoot = join(repoRoot, 'coverage', '.aggregate-scratch');

const args = process.argv.slice(2);
const packageFilter = args
  .find((a) => a.startsWith('--packages='))
  ?.slice('--packages='.length)
  ?.split(',')
  .filter(Boolean);
const skipIntegration = args.includes('--no-integration');
const skipUnit = args.includes('--no-unit');

function listPackages() {
  return readdirSync(packagesRoot)
    .filter((name) => existsSync(join(packagesRoot, name, 'jest.config.cjs')))
    .sort();
}

function runJest(packageDir, configFile, outDir) {
  const configArgs = configFile ? ['--config', configFile] : [];
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'jest',
      ...configArgs,
      '--coverage',
      '--coverageReporters=json',
      `--coverageDirectory=${outDir}`,
      '--silent',
    ],
    { cwd: packageDir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  );
  // Jest exits 1 when coverage thresholds aren't met, but coverage JSON is
  // still emitted. We only care about whether tests passed — surface stderr
  // on hard failures.
  const stderr = result.stderr ?? '';
  const stdout = result.stdout ?? '';
  const testsFailed = /Tests:\s+\d+\s+failed/.test(stderr + stdout);
  if (testsFailed) {
    process.stderr.write(stderr);
    return false;
  }
  return true;
}

function loadCoverageMap(jsonPath) {
  if (!existsSync(jsonPath)) return null;
  const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
  return libCoverage.createCoverageMap(data);
}

function aggregate(packages) {
  rmSync(scratchRoot, { recursive: true, force: true });
  mkdirSync(scratchRoot, { recursive: true });

  // Seed with existing aggregate so a --packages=auth,sessions invocation
  // only refreshes those entries and leaves every other package's coverage
  // intact. A full-workspace invocation (no filter) starts from existing too
  // — istanbul-lib-coverage.merge is union-with-counter-summing per file, so
  // re-running the same package is idempotent (counters reset because we
  // pass a fresh scratch dir each time and load only what jest just wrote).
  const merged = existsSync(aggregateOut)
    ? libCoverage.createCoverageMap(JSON.parse(readFileSync(aggregateOut, 'utf8')))
    : libCoverage.createCoverageMap({});
  // For the targeted packages, drop their existing entries before re-merging
  // so the new run's counters replace (not add to) the prior aggregate.
  for (const pkg of packages) {
    const prefix = join(packagesRoot, pkg) + '/';
    for (const file of merged.files()) {
      if (file.startsWith(prefix)) {
        delete merged.data[file];
      }
    }
  }
  let failureCount = 0;

  for (const pkg of packages) {
    const pkgDir = join(packagesRoot, pkg);
    if (!skipUnit && existsSync(join(pkgDir, 'jest.config.cjs'))) {
      const out = join(scratchRoot, pkg, 'unit');
      mkdirSync(out, { recursive: true });
      process.stdout.write(`[${pkg}] unit ... `);
      const ok = runJest(pkgDir, null, out);
      process.stdout.write(ok ? 'ok\n' : 'failed\n');
      if (!ok) failureCount += 1;
      const map = loadCoverageMap(join(out, 'coverage-final.json'));
      if (map) merged.merge(map);
    }

    const intConfig = join(pkgDir, 'jest.integration.config.cjs');
    if (!skipIntegration && existsSync(intConfig)) {
      const out = join(scratchRoot, pkg, 'integration');
      mkdirSync(out, { recursive: true });
      process.stdout.write(`[${pkg}] int  ... `);
      const ok = runJest(pkgDir, intConfig, out);
      process.stdout.write(ok ? 'ok\n' : 'failed\n');
      if (!ok) failureCount += 1;
      const map = loadCoverageMap(join(out, 'coverage-final.json'));
      if (map) merged.merge(map);
    }
  }

  mkdirSync(dirname(aggregateOut), { recursive: true });
  writeFileSync(aggregateOut, JSON.stringify(merged.toJSON()), 'utf8');

  let lines = 0;
  let covered = 0;
  for (const file of merged.files()) {
    const summary = merged.fileCoverageFor(file).toSummary();
    lines += summary.lines.total;
    covered += summary.lines.covered;
  }
  const pct = lines === 0 ? 0 : (covered / lines) * 100;
  process.stdout.write(
    `\nWrote ${aggregateOut}\n` +
      `  files: ${merged.files().length}\n` +
      `  lines: ${covered}/${lines}  (${pct.toFixed(2)}%)\n`,
  );

  if (failureCount > 0) {
    process.stderr.write(`\n${failureCount} jest invocation(s) had failing tests\n`);
    process.exit(1);
  }
}

const targets = packageFilter && packageFilter.length > 0 ? packageFilter : listPackages();
aggregate(targets);
