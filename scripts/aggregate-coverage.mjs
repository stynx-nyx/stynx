#!/usr/bin/env node
// Aggregates per-workspace jest coverage (unit + integration) into
// coverage/coverage-final.json for the F3xT2 sensor.
//
// Usage:
//   node scripts/aggregate-coverage.mjs [--packages=auth,sessions]
//                                       [--no-integration]
//                                       [--no-unit]
//
// Without --packages, runs every coverage-producing workspace under packages/*,
// packages-web/*, and reference/* that has a jest.config.cjs. Always also runs
// jest.integration.config.cjs when present, unless --no-integration is set.
// Coverage from both modes is merged per file via istanbul-lib-coverage so
// statement/branch/function counters add up properly when both runs share the
// same instrumentation.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import libCoverage from 'istanbul-lib-coverage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const coverageRootNames = ['packages', 'packages-web', 'reference'];
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

function listCoverageTargets() {
  const targets = [];
  for (const rootName of coverageRootNames) {
    const root = join(repoRoot, rootName);
    if (!existsSync(root)) continue;
    for (const child of readdirSync(root, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const dir = join(root, child.name);
      if (!existsSync(join(dir, 'jest.config.cjs'))) continue;
      targets.push({
        dir,
        displayName: readPackageName(dir) ?? `${rootName}/${child.name}`,
        filterNames: filterNamesForTarget(dir, rootName, child.name),
        scratchId: relative(repoRoot, dir).split(sep).join('__'),
      });
    }
  }
  return targets.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function readPackageName(dir) {
  const packagePath = join(dir, 'package.json');
  if (!existsSync(packagePath)) return null;
  try {
    return JSON.parse(readFileSync(packagePath, 'utf8')).name ?? null;
  } catch {
    return null;
  }
}

function filterNamesForTarget(dir, rootName, childName) {
  const pkgName = readPackageName(dir);
  const unscoped = pkgName?.startsWith('@') ? pkgName.split('/').at(-1) : pkgName;
  return new Set(
    [
      childName,
      `${rootName}/${childName}`,
      pkgName,
      unscoped,
      rootName === 'reference' ? `reference-${childName}` : null,
    ].filter(Boolean),
  );
}

function selectTargets() {
  const targets = listCoverageTargets();
  if (!packageFilter || packageFilter.length === 0) return targets;
  const requested = new Set(packageFilter);
  return targets.filter((target) => [...target.filterNames].some((name) => requested.has(name)));
}

function runJest(packageDir, configFile, outDir) {
  const configArgs = configFile ? ['--config', configFile] : [];
  const result = spawnSync(
    'node',
    [
      '--disable-warning=ExperimentalWarning',
      '--experimental-vm-modules',
      './node_modules/jest/bin/jest.js',
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

function aggregate(targets) {
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
  // For the targeted workspaces, drop their existing entries before re-merging
  // so the new run's counters replace (not add to) the prior aggregate.
  for (const target of targets) {
    const prefix = target.dir + '/';
    for (const file of merged.files()) {
      if (file.startsWith(prefix)) {
        delete merged.data[file];
      }
    }
  }
  let failureCount = 0;

  for (const target of targets) {
    if (!skipUnit && existsSync(join(target.dir, 'jest.config.cjs'))) {
      const out = join(scratchRoot, target.scratchId, 'unit');
      mkdirSync(out, { recursive: true });
      process.stdout.write(`[${target.displayName}] unit ... `);
      const ok = runJest(target.dir, null, out);
      process.stdout.write(ok ? 'ok\n' : 'failed\n');
      if (!ok) failureCount += 1;
      const map = loadCoverageMap(join(out, 'coverage-final.json'));
      if (map) merged.merge(map);
    }

    const intConfig = join(target.dir, 'jest.integration.config.cjs');
    if (!skipIntegration && existsSync(intConfig)) {
      const out = join(scratchRoot, target.scratchId, 'integration');
      mkdirSync(out, { recursive: true });
      process.stdout.write(`[${target.displayName}] int  ... `);
      const ok = runJest(target.dir, intConfig, out);
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

const targets = selectTargets();
if (targets.length === 0) {
  process.stderr.write(
    packageFilter?.length
      ? `No coverage targets matched: ${packageFilter.join(', ')}\n`
      : 'No coverage targets found.\n',
  );
  process.exit(1);
}
aggregate(targets);
