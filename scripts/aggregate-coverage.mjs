#!/usr/bin/env node
// Aggregates per-workspace Vitest coverage (unit + integration) into
// coverage/coverage-final.json for the F3xT2 sensor.
//
// Usage:
//   node scripts/aggregate-coverage.mjs [--packages=auth,sessions]
//                                       [--no-integration]
//                                       [--no-unit]
//
// Without --packages, runs every coverage-producing workspace under packages/*,
// packages-web/* that has a vitest.config.ts/mjs. Always also
// runs vitest.int.config.ts/mjs when present, unless --no-integration is set.
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
const coverageRootNames = ['packages', 'packages-web'];
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
      const unitConfig = findExistingFile(dir, ['vitest.config.ts', 'vitest.config.mjs']);
      if (!unitConfig) continue;
      targets.push({
        dir,
        unitConfig,
        integrationConfig: findExistingFile(dir, ['vitest.int.config.ts', 'vitest.int.config.mjs']),
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
    ].filter(Boolean),
  );
}

function findExistingFile(dir, names) {
  for (const name of names) {
    const path = join(dir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

function selectTargets() {
  const targets = listCoverageTargets();
  if (!packageFilter || packageFilter.length === 0) return targets;
  const requested = new Set(packageFilter);
  return targets.filter((target) => [...target.filterNames].some((name) => requested.has(name)));
}

function runVitest(packageDir, configFile, outDir) {
  let lastStderr = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--config',
        configFile,
        '--coverage',
        '--coverage.reporter=json',
        `--coverage.reportsDirectory=${outDir}`,
        '--silent',
      ],
      { cwd: packageDir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
    );
    const stderr = result.stderr ?? '';
    const stdout = result.stdout ?? '';
    lastStderr = stderr;
    const text = stderr + stdout;
    const testsFailed = /(?:Test Files|Tests)\s+.*\bfailed\b/.test(text);
    if (!testsFailed && result.status === 0) {
      return true;
    }
    if (!testsFailed) break;
    if (attempt === 1) {
      process.stdout.write('retrying ... ');
    }
  }
  process.stderr.write(lastStderr);
  return false;
}

function loadCoverageMap(jsonPath) {
  if (!existsSync(jsonPath)) return null;
  const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
  return libCoverage.createCoverageMap(data);
}

function aggregate(targets) {
  rmSync(scratchRoot, { recursive: true, force: true });
  mkdirSync(scratchRoot, { recursive: true });

  // Seed with existing aggregate only for targeted refreshes so
  // --packages=auth,sessions leaves every other package's coverage intact.
  // A full workspace invocation rebuilds from an empty map to avoid preserving
  // stale files from retired scopes.
  const merged = packageFilter?.length && existsSync(aggregateOut)
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
    if (!skipUnit && target.unitConfig) {
      const out = join(scratchRoot, target.scratchId, 'unit');
      mkdirSync(out, { recursive: true });
      process.stdout.write(`[${target.displayName}] unit ... `);
      const ok = runVitest(target.dir, target.unitConfig, out);
      process.stdout.write(ok ? 'ok\n' : 'failed\n');
      if (!ok) failureCount += 1;
      const map = loadCoverageMap(join(out, 'coverage-final.json'));
      if (map) merged.merge(map);
    }

    if (!skipIntegration && target.integrationConfig) {
      const out = join(scratchRoot, target.scratchId, 'integration');
      mkdirSync(out, { recursive: true });
      process.stdout.write(`[${target.displayName}] int  ... `);
      const ok = runVitest(target.dir, target.integrationConfig, out);
      process.stdout.write(ok ? 'ok\n' : 'failed\n');
      if (!ok) failureCount += 1;
      const map = loadCoverageMap(join(out, 'coverage-final.json'));
      if (map) merged.merge(map);
    }
  }

  removeTestSupportCoverage(merged);
  normalizeGeneratedDecoratorMetadataBranches(merged);

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
    process.stderr.write(`\n${failureCount} Vitest invocation(s) had failing tests\n`);
    process.exit(1);
  }
}

function normalizeGeneratedDecoratorMetadataBranches(coverageMap) {
  for (const file of coverageMap.files()) {
    if (!existsSync(file)) continue;
    const sourceLines = readFileSync(file, 'utf8').split(/\r?\n/);
    const coverage = coverageMap.data[file];
    if (!coverage?.branchMap || !coverage.b) continue;

    for (const branchId of Object.keys(coverage.branchMap)) {
      const branch = coverage.branchMap[branchId];
      const lineNumber = branch?.loc?.start?.line;
      if (branch?.type !== 'cond-expr' || !lineNumber) continue;
      if (!isConstructorMetadataBranch(sourceLines, lineNumber)) continue;
      delete coverage.branchMap[branchId];
      delete coverage.b[branchId];
    }
  }
}

function removeTestSupportCoverage(coverageMap) {
  for (const file of coverageMap.files()) {
    if (file.includes(`${sep}test${sep}`) || file.includes(`${sep}tests${sep}`)) {
      delete coverageMap.data[file];
    }
  }
}

function isConstructorMetadataBranch(sourceLines, oneBasedLineNumber) {
  const index = oneBasedLineNumber - 1;
  const line = sourceLines[index]?.trim() ?? '';
  if (line.startsWith('@Inject(') || line.startsWith('@Optional()')) {
    return true;
  }
  if (/^constructor\(.*\b(private|public|protected|readonly)\b/.test(line)) {
    return true;
  }
  const windowStart = Math.max(0, index - 8);
  const nearby = sourceLines.slice(windowStart, index + 1).join('\n');
  return nearby.includes('constructor(') && /^(private|public|protected|readonly)\b/.test(line);
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
