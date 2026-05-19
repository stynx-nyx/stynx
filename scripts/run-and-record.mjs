#!/usr/bin/env node
// scripts/run-and-record.mjs
//
// Canonical wrapper for any test runner invocation. Produces a single artifact
// at <packageDir>/.test-results/<level>.json that validates against
// tools/repo-config/test-result.schema.json.
//
// Replaces the per-package record-test-artifact.mjs invocations (which only
// captured timing + raw log) and the bespoke shapes returned by each consumer.
//
// Usage:
//   node scripts/run-and-record.mjs \
//     --package <name>     # e.g. @stynx/contracts
//     --level   <level>    # unit|integration|e2e|mutation|perf|coverage|smoke
//     --runner  <runner>   # vitest|stryker-vitest|playwright|node-test|perf-smoke|rls-smoke
//     [--output-dir <path>] # default: <cwd>/.test-results
//     [--no-junit]         # suppress the JUnit XML companion (default on)
//     [--coverage-source <path>]
//                          # for --level=coverage: explicit path to a vitest
//                          # coverage-final.json to read percentages from.
//                          # Defaults to <cwd>/coverage-vitest/coverage-final.json.
//     -- <command> [args...]
//
// All runners are wired end-to-end as of R2.

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const SCHEMA_VERSION = '1';
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const schemaPath = resolve(repoRoot, 'tools/repo-config/test-result.schema.json');

const VALID_LEVELS = new Set([
  'unit',
  'integration',
  'e2e',
  'mutation',
  'perf',
  'coverage',
  'smoke',
]);
const VALID_RUNNERS = new Set([
  'vitest',
  'stryker-vitest',
  'playwright',
  'perf-smoke',
  'rls-smoke',
  'node-test',
]);

function parseArgs(argv) {
  // JUnit emission is on by default (R5). Pass `--no-junit` to suppress —
  // useful for very-large-suite runs where the XML file is a hot artifact.
  const args = { command: [], keepJunit: true };
  const flags = argv.slice(2);
  const sepIdx = flags.indexOf('--');
  if (sepIdx === -1) {
    throw new Error('Missing `--` separator before the test command.');
  }
  args.command = flags.slice(sepIdx + 1);
  if (args.command.length === 0) {
    throw new Error('No command after `--`.');
  }
  const head = flags.slice(0, sepIdx);
  for (let i = 0; i < head.length; i += 1) {
    const a = head[i];
    if (a === '--package') args.package = head[++i];
    else if (a === '--level') args.level = head[++i];
    else if (a === '--runner') args.runner = head[++i];
    else if (a === '--output-dir') args.outputDir = head[++i];
    else if (a === '--keep-junit') args.keepJunit = true;
    else if (a === '--no-junit') args.keepJunit = false;
    else if (a === '--coverage-source') args.coverageSource = head[++i];
    else throw new Error(`Unknown flag: ${a}`);
  }
  if (!args.package) throw new Error('--package is required');
  if (!args.level || !VALID_LEVELS.has(args.level)) {
    throw new Error(`--level must be one of: ${[...VALID_LEVELS].join(', ')}`);
  }
  if (!args.runner || !VALID_RUNNERS.has(args.runner)) {
    throw new Error(`--runner must be one of: ${[...VALID_RUNNERS].join(', ')}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const cwd = process.cwd();
  const outputDir = resolve(cwd, args.outputDir ?? '.test-results');
  mkdirSync(outputDir, { recursive: true });
  const artifactPath = join(outputDir, `${args.level}.json`);
  const logPath = join(outputDir, `${args.level}.log`);
  const junitPath = join(outputDir, `${args.level}.junit.xml`);

  const tmpVitestReport = join(tmpdir(), `vitest-${process.pid}-${Date.now()}.json`);
  const playwrightReportPath = join(outputDir, `${args.level}.playwright.json`);

  // For Vitest, inject reporters and the JSON outputFile via env. Vitest 3
  // honours VITEST_REPORTER and --outputFile flags, but the simplest path is
  // to ALWAYS pass `--reporter=default --reporter=json --outputFile.json=<path>`
  // to the underlying vitest command. We do that by appending to args.command
  // when --runner=vitest. The default reporter keeps developer UX; the json
  // reporter gives us machine-readable results.
  let commandArgs = [...args.command];
  const commandEnv = { ...process.env };
  if (args.runner === 'vitest') {
    commandArgs.push(
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${tmpVitestReport}`,
    );
    if (args.keepJunit) {
      commandArgs.push('--reporter=junit', `--outputFile.junit=${junitPath}`);
    }
  } else if (args.runner === 'playwright') {
    commandArgs.push('--reporter=line,json');
    commandEnv.PLAYWRIGHT_JSON_OUTPUT_NAME = playwrightReportPath;
  }
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(commandArgs[0] ?? '')) {
    const [name, ...valueParts] = commandArgs.shift().split('=');
    commandEnv[name] = valueParts.join('=');
  }
  if (args.runner === 'stryker-vitest') {
    rmSync(join(cwd, 'reports', 'mutation', 'mutation.json'), { force: true });
  }

  const startedAt = new Date();
  const startedMs = Date.now();
  let stdoutBuf = '';
  let stderrBuf = '';

  const child = spawn(commandArgs[0], commandArgs.slice(1), {
    cwd,
    env: commandEnv,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk;
    process.stderr.write(chunk);
  });

  const exit = await new Promise((resolve_) => {
    child.on('close', (code, signal) => resolve_({ code, signal }));
    child.on('error', (err) => resolve_({ code: null, signal: null, error: err }));
  });

  const endedAt = new Date();
  const durationMs = Date.now() - startedMs;

  writeFileSync(logPath, stdoutBuf + (stderrBuf ? `\n[stderr]\n${stderrBuf}` : ''));

  // ── Build the canonical artifact ───────────────────────────────────────────
  const artifact = {
    schemaVersion: SCHEMA_VERSION,
    package: args.package,
    level: args.level,
    runner: args.runner,
    runnerVersion: await detectRunnerVersion(args.runner),
    status: deriveStatus(exit, args.runner),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs,
    exitCode: exit.code,
    signal: exit.signal,
    artifacts: {
      raw: relativeTo(cwd, logPath),
      ...(args.keepJunit && existsSync(junitPath)
        ? { junit: relativeTo(cwd, junitPath) }
        : {}),
    },
    env: {
      node: process.versions.node,
      ci: Boolean(process.env.CI),
      ...(process.env.GITHUB_REF_NAME ? { branch: process.env.GITHUB_REF_NAME } : {}),
      ...(process.env.GITHUB_SHA ? { commit: process.env.GITHUB_SHA } : {}),
    },
    command: { argv: commandArgs, cwd },
  };

  // Runner-specific enrichment. Each branch may set totals, slowestTests,
  // metric, and additional artifacts.* paths.
  artifact.metric = { kind: 'none' };
  if (args.runner === 'vitest' && existsSync(tmpVitestReport)) {
    enrichFromVitest(artifact, tmpVitestReport, args, cwd);
    rmSync(tmpVitestReport, { force: true });
  } else if (args.runner === 'stryker-vitest') {
    enrichFromStryker(artifact, cwd);
  } else if (args.runner === 'playwright' && existsSync(playwrightReportPath)) {
    enrichFromPlaywright(artifact, playwrightReportPath, cwd);
  } else if (args.runner === 'perf-smoke') {
    enrichFromPerfSmoke(artifact, stdoutBuf);
  } else if (args.runner === 'rls-smoke') {
    // Timing + exit-code only; no metric.
  } else if (args.runner === 'node-test') {
    enrichFromNodeTest(artifact, stdoutBuf);
  }

  // Coverage enrichment (independent of runner — works wherever a vitest
  // coverage-final.json has been written into the package).
  if (args.level === 'coverage') {
    enrichCoverage(artifact, args, cwd);
  }

  if (exit.error) {
    artifact.status = 'error';
  }

  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n');
  writeCompanionCoverageArtifact({ artifact, args, commandArgs, cwd, outputDir });

  // Best-effort schema validation (warns but doesn't fail the run).
  validateAgainstSchema(artifact);

  // Propagate child exit code so Turbo / CI still react correctly.
  if (exit.signal) {
    process.kill(process.pid, exit.signal);
    return;
  }
  process.exit(exit.code ?? 1);
}

function relativeTo(base, p) {
  const rel = resolve(p).slice(resolve(base).length + 1);
  return rel || p;
}

function deriveStatus({ code, signal }, _runner) {
  if (signal) return 'error';
  if (code === 0) return 'passed';
  if (code === null) return 'error';
  return 'failed';
}

async function detectRunnerVersion(runner) {
  if (runner === 'vitest' || runner === 'stryker-vitest') {
    try {
       
      return (await import('vitest/package.json', { with: { type: 'json' } })).default.version;
    } catch {
      try {
        const req = (await import('node:module')).createRequire(import.meta.url);
        return req('vitest/package.json').version;
      } catch {
        return undefined;
      }
    }
  }
  if (runner === 'playwright') {
    try {
      return (await import('@playwright/test/package.json', { with: { type: 'json' } })).default.version;
    } catch {
      try {
        const req = (await import('node:module')).createRequire(import.meta.url);
        return req('@playwright/test/package.json').version;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function extractVitestTotals(report) {
  const totals = {
    files: (report.testResults ?? []).length,
    tests: report.numTotalTests ?? 0,
    passed: report.numPassedTests ?? 0,
    failed: report.numFailedTests ?? 0,
    skipped: (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0),
    todo: report.numTodoTests ?? 0,
  };
  return totals;
}

function extractSlowestTests(report, limit) {
  const all = [];
  for (const suite of report.testResults ?? []) {
    for (const a of suite.assertionResults ?? []) {
      if (typeof a.duration === 'number' && a.duration > 0) {
        all.push({
          name: a.fullName ?? a.title ?? '(unnamed)',
          file: suite.name,
          durationMs: a.duration,
        });
      }
    }
  }
  all.sort((a, b) => b.durationMs - a.durationMs);
  return all.slice(0, limit);
}

function enrichFromVitest(artifact, tmpReportPath, args, _cwd) {
  try {
    const report = JSON.parse(readFileSync(tmpReportPath, 'utf8'));
    artifact.totals = extractVitestTotals(report);
    artifact.slowestTests = extractSlowestTests(report, 10);
    if (artifact.status === 'passed' && artifact.totals.tests === 0) {
      artifact.status = 'skipped';
    }
  } catch {
    /* best-effort */
  }
}

// Stryker writes `reports/mutation/mutation.json` (relative to the package).
// Parse mutant statuses to produce a mutation score + breakdown.
function enrichFromStryker(artifact, cwd) {
  const reportPath = join(cwd, 'reports', 'mutation', 'mutation.json');
  if (!existsSync(reportPath)) return;
  let payload;
  try {
    payload = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return;
  }
  const counts = { Killed: 0, Survived: 0, Timeout: 0, NoCoverage: 0, CompileError: 0, RuntimeError: 0, Ignored: 0 };
  let totalMutants = 0;
  for (const file of Object.values(payload.files ?? {})) {
    for (const m of file.mutants ?? []) {
      totalMutants += 1;
      counts[m.status] = (counts[m.status] ?? 0) + 1;
    }
  }
  const covered = counts.Killed + counts.Survived + counts.Timeout;
  const score = covered > 0 ? ((counts.Killed + counts.Timeout) / covered) * 100 : null;
  const breakThreshold = payload.thresholds?.break;
  artifact.totals = {
    files: Object.keys(payload.files ?? {}).length,
    tests: totalMutants,
    passed: counts.Killed + counts.Timeout,
    failed: counts.Survived,
    skipped: counts.NoCoverage + counts.Ignored,
    todo: 0,
  };
  artifact.metric = {
    kind: 'score',
    score,
    thresholds: payload.thresholds ?? undefined,
  };
  if (score !== null && typeof breakThreshold === 'number' && score < breakThreshold) {
    artifact.status = 'failed';
  }
  // Companion artifact paths (relative to cwd / package dir).
  artifact.artifacts.report = 'reports/mutation/mutation.json';
  const htmlDir = `reports/mutation/${artifact.package.replace(/[@/]/g, '-')}`;
  if (existsSync(join(cwd, htmlDir, 'index.html'))) {
    artifact.artifacts.html = `${htmlDir}/index.html`;
  }
}

function enrichFromPlaywright(artifact, reportPath, cwd) {
  let payload;
  try {
    payload = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return;
  }

  const files = new Set();
  const totals = { files: 0, tests: 0, passed: 0, failed: 0, skipped: 0, todo: 0 };
  const slowest = [];

  function walkSuite(suite, inheritedFile) {
    const suiteFile = suite.file ?? inheritedFile;
    for (const child of suite.suites ?? []) walkSuite(child, suiteFile);
    for (const spec of suite.specs ?? []) {
      const file = spec.file ?? suiteFile;
      if (file) files.add(file);
      for (const test of spec.tests ?? []) {
        totals.tests += 1;
        const statuses = (test.results ?? []).map((r) => r.status);
        const durationMs = (test.results ?? []).reduce((sum, r) => sum + (r.duration ?? 0), 0);
        const outcome = test.outcome ?? '';
        if (statuses.includes('skipped') || outcome === 'skipped') {
          totals.skipped += 1;
        } else if (outcome === 'expected' || outcome === 'flaky' || statuses.includes('passed')) {
          totals.passed += 1;
        } else {
          totals.failed += 1;
        }
        if (durationMs > 0) {
          slowest.push({
            name: [...(test.titlePath ?? []), spec.title].filter(Boolean).join(' > ') || spec.title || '(unnamed)',
            file,
            durationMs,
          });
        }
      }
    }
  }

  for (const suite of payload.suites ?? []) walkSuite(suite);
  totals.files = files.size;
  artifact.totals = totals;
  slowest.sort((a, b) => b.durationMs - a.durationMs);
  artifact.slowestTests = slowest.slice(0, 10);
  artifact.artifacts.json = relativeTo(cwd, reportPath);
  if (totals.failed > 0) artifact.status = 'failed';
  if (artifact.status === 'passed' && totals.tests === 0) artifact.status = 'skipped';
}

// perf-smoke emits one JSON line on stdout: { p50_ms, p95_ms, throughput_rps }.
function enrichFromPerfSmoke(artifact, stdout) {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].startsWith('{')) continue;
    try {
      const parsed = JSON.parse(lines[i]);
      if (typeof parsed.p50_ms === 'number') {
        artifact.metric = {
          kind: 'perf',
          perf: {
            p50Ms: parsed.p50_ms,
            p95Ms: parsed.p95_ms,
            rps: parsed.throughput_rps ?? parsed.rps,
            samples: parsed.samples,
          },
        };
        return;
      }
    } catch {
      /* not JSON */
    }
  }
}

function enrichCoverage(artifact, args, cwd) {
  const source = args.coverageSource
    ? resolve(cwd, args.coverageSource)
    : join(cwd, 'coverage-vitest', 'coverage-final.json');
  if (!existsSync(source)) return;
  let map;
  try {
    map = JSON.parse(readFileSync(source, 'utf8'));
  } catch {
    return;
  }
  // Aggregate per-file istanbul totals -> percentages.
  const totals = { lines: { total: 0, covered: 0 }, statements: { total: 0, covered: 0 },
                   functions: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 } };
  for (const fileCov of Object.values(map)) {
    for (const sc of Object.values(fileCov.statementMap ?? {})) void sc;
    for (const sid of Object.keys(fileCov.s ?? {})) {
      totals.statements.total += 1;
      if (fileCov.s[sid] > 0) totals.statements.covered += 1;
    }
    for (const fid of Object.keys(fileCov.f ?? {})) {
      totals.functions.total += 1;
      if (fileCov.f[fid] > 0) totals.functions.covered += 1;
    }
    for (const bid of Object.keys(fileCov.b ?? {})) {
      const branches = fileCov.b[bid] ?? [];
      for (const hits of branches) {
        totals.branches.total += 1;
        if (hits > 0) totals.branches.covered += 1;
      }
    }
    // Lines: derive from statementMap's per-line coverage when available.
    const linesSeen = new Set();
    const linesCovered = new Set();
    for (const [sid, loc] of Object.entries(fileCov.statementMap ?? {})) {
      const line = loc?.start?.line;
      if (typeof line !== 'number') continue;
      linesSeen.add(line);
      if (fileCov.s[sid] > 0) linesCovered.add(line);
    }
    totals.lines.total += linesSeen.size;
    totals.lines.covered += linesCovered.size;
  }
  const pct = (b) => b.total > 0 ? (b.covered / b.total) * 100 : 0;
  artifact.metric = {
    kind: 'coverage',
    coverage: {
      lines: round2(pct(totals.lines)),
      branches: round2(pct(totals.branches)),
      functions: round2(pct(totals.functions)),
      statements: round2(pct(totals.statements)),
    },
  };
  artifact.artifacts.coverage = source.startsWith(cwd) ? source.slice(cwd.length + 1) : source;
}

function writeCompanionCoverageArtifact({ artifact, args, commandArgs, cwd, outputDir }) {
  if (args.runner !== 'vitest' || args.level === 'coverage') return;
  if (!vitestCoverageRequested(commandArgs)) return;

  const coverageArtifact = {
    ...artifact,
    level: 'coverage',
    artifacts: { ...artifact.artifacts },
    metric: { kind: 'none' },
  };
  enrichCoverage(coverageArtifact, args, cwd);
  if (coverageArtifact.metric?.kind !== 'coverage') return;

  writeFileSync(join(outputDir, 'coverage.json'), JSON.stringify(coverageArtifact, null, 2) + '\n');
}

function vitestCoverageRequested(commandArgs) {
  return commandArgs.some((arg) => arg === '--coverage' || arg.startsWith('--coverage.'));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Node's built-in test runner (node --test) emits TAP-like trailer lines:
//   # tests <n>
//   # pass <n>
//   # fail <n>
//   # skipped <n>
//   # duration_ms <n>
// when run with the default spec reporter.
function enrichFromNodeTest(artifact, stdout) {
  const totals = { files: 0, tests: 0, passed: 0, failed: 0, skipped: 0, todo: 0 };
  const re = /^\s*[#ℹ]?\s*(tests|suites|pass|fail|skipped|todo|duration_ms)\b[^\d]*([\d.]+)/i;
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(re);
    if (m) {
      const n = Number(m[2]);
      if (!Number.isNaN(n)) {
        if (m[1].toLowerCase() === 'tests') totals.tests = n;
        else if (m[1].toLowerCase() === 'suites') totals.files = n;
        else if (m[1].toLowerCase() === 'pass') totals.passed = n;
        else if (m[1].toLowerCase() === 'fail') totals.failed = n;
        else if (m[1].toLowerCase() === 'skipped') totals.skipped = n;
        else if (m[1].toLowerCase() === 'todo') totals.todo = n;
      }
    }
    const simple = line.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/i);
    if (simple) {
      totals.passed = Number(simple[1]);
      totals.tests = Number(simple[2]);
    }
  }
  if (totals.tests > 0) {
    artifact.totals = totals;
    if (artifact.status === 'passed' && totals.failed > 0) artifact.status = 'failed';
  }
}

function validateAgainstSchema(artifact) {
  // Soft validation: confirm required fields are present + types broadly
  // correct. A full draft-2020-12 validator is overkill for a single in-house
  // schema; the writer is the only producer, so we only need to catch
  // accidental drift. Hard validation can be wired into a CI job later.
  if (!existsSync(schemaPath)) return;
  const required = ['schemaVersion', 'package', 'level', 'runner', 'status',
    'startedAt', 'endedAt', 'durationMs', 'exitCode'];
  const missing = required.filter((k) => artifact[k] === undefined);
  if (missing.length > 0) {
    process.stderr.write(`[run-and-record] schema warn: missing ${missing.join(', ')}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`[run-and-record] ${err.message}\n`);
  process.exit(2);
});
