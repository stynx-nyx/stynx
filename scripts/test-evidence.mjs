#!/usr/bin/env node
// scripts/test-evidence.mjs
//
// Aggregates every <pkg>/.test-results/<level>.json across the workspace
// into a single workspace-level summary at coverage/test-evidence.json.
// This is the artifact DEVAI sensors (test.unit, test.integration,
// test.coverage-depth, perf-test, etc.) should READ instead of re-running
// pnpm test themselves — same canonical data, no duplicate work.
//
// Output shape (stable, additive — bumps schemaVersion on breaking change):
//   {
//     "schemaVersion": "1",
//     "generatedAt": "...",
//     "workspace": "/abs/path",
//     "levels": {
//       "unit":        { "packages": N, "passed": N, "failed": N, "tests": N, "wallMs": N, "results": [...] },
//       "integration": { ... },
//       "e2e":         { ... },
//       "mutation":    { "packages": N, "scoreAvg": N, "scoreMin": N, "results": [...] },
//       "coverage":    { "packages": N, "linesAvg": N, ... },
//       "perf":        { ... },
//       "smoke":       { ... }
//     },
//     "all": [...flattened list of all per-(pkg, level) results...]
//   }
//
// Each entry in `results[]` is a copy of the canonical artifact's key fields,
// minus the verbose `slowestTests` and `command` payloads. Add `--with-slowest`
// to include the top-N slowest tests per package.
//
// Usage:
//   node scripts/test-evidence.mjs                 # writes coverage/test-evidence.json
//   node scripts/test-evidence.mjs --print         # also stdout-prints the summary
//   node scripts/test-evidence.mjs --with-slowest  # include slowestTests[]
//   node scripts/test-evidence.mjs --output <path> # override output path

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = '1';
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.includes('=') ? a.split('=') : [a, true];
    return [k.replace(/^--/, ''), v];
  }),
);
const includeSlowest = Boolean(args.get('with-slowest'));
const printToStdout = Boolean(args.get('print'));
const outputPath = args.get('output') ?? join(repoRoot, 'coverage', 'test-evidence.json');

const dirsToWalk = ['packages', 'packages-web', 'infra', 'reference', 'domain', 'test', 'tools'];

function* walkArtifacts() {
  // Workspace-root .test-results (perf, smoke) come first.
  const rootResults = join(repoRoot, '.test-results');
  if (existsSync(rootResults)) {
    for (const f of readdirSync(rootResults)) {
      if (f.endsWith('.json')) yield join(rootResults, f);
    }
  }
  for (const root of dirsToWalk) {
    yield* walkUnder(join(repoRoot, root));
  }
}

function* walkUnder(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.stryker-tmp')) continue;
    const child = join(dir, entry.name);
    if (entry.name === '.test-results') {
      for (const f of readdirSync(child)) {
        if (f.endsWith('.json')) yield join(child, f);
      }
      continue;
    }
    yield* walkUnder(child);
  }
}

const all = [];
for (const path of walkArtifacts()) {
  try {
    const r = JSON.parse(readFileSync(path, 'utf8'));
    if (r.schemaVersion !== '1') continue;
    const entry = {
      package: r.package,
      level: r.level,
      runner: r.runner,
      status: r.status,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationMs: r.durationMs,
      exitCode: r.exitCode,
      totals: r.totals,
      metric: r.metric,
      artifacts: r.artifacts,
    };
    if (includeSlowest && r.slowestTests) entry.slowestTests = r.slowestTests;
    all.push(entry);
  } catch {
    // skip malformed
  }
}

function summariseLevel(level) {
  const slice = all.filter((r) => r.level === level);
  if (slice.length === 0) return null;
  const passed = slice.filter((r) => r.status === 'passed').length;
  const failed = slice.filter((r) => r.status === 'failed' || r.status === 'error').length;
  const tests = slice.reduce((s, r) => s + (r.totals?.tests ?? 0), 0);
  const passedTests = slice.reduce((s, r) => s + (r.totals?.passed ?? 0), 0);
  const failedTests = slice.reduce((s, r) => s + (r.totals?.failed ?? 0), 0);
  const wallMs = slice.reduce((s, r) => s + (r.durationMs ?? 0), 0);
  const summary = {
    packages: slice.length,
    packagesPassed: passed,
    packagesFailed: failed,
    tests,
    testsPassed: passedTests,
    testsFailed: failedTests,
    wallMs,
    results: slice,
  };
  if (level === 'mutation') {
    const scores = slice
      .map((r) => r.metric?.score)
      .filter((s) => typeof s === 'number');
    if (scores.length > 0) {
      summary.scoreAvg = scores.reduce((s, n) => s + n, 0) / scores.length;
      summary.scoreMin = Math.min(...scores);
      summary.scoreMax = Math.max(...scores);
    }
  }
  if (level === 'coverage') {
    const cov = slice.map((r) => r.metric?.coverage).filter(Boolean);
    if (cov.length > 0) {
      for (const k of ['lines', 'branches', 'functions', 'statements']) {
        const vals = cov.map((c) => c[k]).filter((v) => typeof v === 'number');
        if (vals.length > 0) {
          summary[`${k}Avg`] = vals.reduce((s, n) => s + n, 0) / vals.length;
          summary[`${k}Min`] = Math.min(...vals);
        }
      }
    }
  }
  return summary;
}

const evidence = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  workspace: repoRoot,
  levels: {
    unit: summariseLevel('unit'),
    integration: summariseLevel('integration'),
    e2e: summariseLevel('e2e'),
    mutation: summariseLevel('mutation'),
    coverage: summariseLevel('coverage'),
    perf: summariseLevel('perf'),
    smoke: summariseLevel('smoke'),
  },
  all,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + '\n');

if (printToStdout) {
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
} else {
  const counts = Object.entries(evidence.levels)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v.packages}`)
    .join(' ');
  process.stderr.write(`[test-evidence] wrote ${outputPath} (${counts})\n`);
}
