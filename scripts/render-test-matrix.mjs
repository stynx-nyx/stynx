#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
const useColor = args.color === true;
const compact = args.compact === true;
const showEmpty = args.empty === true;
const aspect = args.aspect;
const matrixConfig = loadMatrixConfig();

const levels = ['Unit', 'API', 'DB', 'E2E', 'Mutation'];
const coverageColumn = 'Coverage (lines|stat/brch|func)';
const columns = [...levels, coverageColumn];
const workspaces = discoverWorkspaces();
const aggregateCoverageByWorkspace = loadCoverageByWorkspace(workspaces);
const unitCoverageByWorkspace = loadScratchCoverageByWorkspace(workspaces, 'unit');
const integrationCoverageByWorkspace = loadScratchCoverageByWorkspace(workspaces, 'integration');
const rows = [];

for (const ws of workspaces) {
  const results = {
    Unit: readTurboArtifact(ws.dir, 'turbo-test.log'),
    API: readApiResult(ws),
    DB: readDbResult(ws),
    E2E: readE2EResult(ws),
    Mutation: readMutationResult(ws),
    [coverageColumn]: aggregateCoverageByWorkspace.has(ws.dir)
      ? { status: 'passed', source: 'coverage' }
      : null,
  };
  const coverage = {
    Unit: unitCoverageByWorkspace.get(ws.dir),
    API: null,
    DB: integrationCoverageByWorkspace.get(ws.dir),
    E2E: null,
    Mutation: null,
    [coverageColumn]: aggregateCoverageByWorkspace.get(ws.dir),
  };
  const cells = Object.fromEntries(
    columns.map((column) => [column, buildCell(ws, column, results[column], coverage[column])]),
  );

  if (!showEmpty && Object.values(cells).every((cell) => !isInterestingCell(cell))) {
    continue;
  }

  rows.push({ name: ws.label, cells });
}

printMatrix(rows);

function parseArgs(values) {
  const parsed = { color: false, compact: false, empty: false, aspect: 'status' };
  const aspectFlags = [];

  for (const value of values) {
    if (value === '--') continue;
    if (value === '--color' || value === '--color=always') parsed.color = true;
    else if (value === '--no-color' || value === '--color=never') parsed.color = false;
    else if (value === '--compact') parsed.compact = true;
    else if (value === '--empty') parsed.empty = true;
    else if (value === '--status') aspectFlags.push('status');
    else if (value === '--coverage') aspectFlags.push('coverage');
    else if (value === '--timing') aspectFlags.push('timing');
    else if (value === '--help' || value === '-h') {
      printUsage();
      process.exit(0);
    } else {
      process.stderr.write(`Unknown option: ${value}\n\n`);
      printUsage(process.stderr);
      process.exit(2);
    }
  }

  const uniqueAspectFlags = [...new Set(aspectFlags)];
  if (uniqueAspectFlags.length > 1) {
    process.stderr.write(`Incompatible aspect flags: ${aspectFlags.map((flag) => `--${flag}`).join(' ')}\n`);
    process.exit(2);
  }
  if (uniqueAspectFlags.length === 1) parsed.aspect = uniqueAspectFlags[0];
  return parsed;
}

function printUsage(stream = process.stdout) {
  stream.write(`Usage: node scripts/render-test-matrix.mjs [--status|--coverage|--timing] [--color] [--compact] [--empty]

Reads existing result artifacts only; it does not run tests.

Sources:
  - scripts/test-matrix.config.json for meaningless cells and coverage thresholds
  - */.turbo/turbo-test*.log for Jest, Node test, and custom test summaries
  - */.turbo/turbo-test*.log.meta.json for recorder timing metadata
  - reference/web/test-results/.last-run.json for Playwright E2E status
  - packages/*/reports/mutation/mutation.json when present
  - coverage/coverage-final.json for aggregate coverage
  - coverage/.aggregate-scratch/<pkg>/unit/coverage-final.json for unit coverage
  - coverage/.aggregate-scratch/<pkg>/integration/coverage-final.json for DB coverage

Modes:
  --status    state plus [suites_passed/suites_total | tests_passed/tests_total] counts
  --coverage  coverage only: lines | statements / branches | functions
  --timing    runtime only: 842ms, 3.1s, or 1:24

States:
  '   '     configured as meaningless for that package/level
  ' - '     no package script/config for that level
  ' 0 '     package has that level, but no current artifact exists
  FAIL      current artifact exists and did not pass

Color:
  Status/timing states use emoji glyphs under --color.
  Coverage numbers keep ANSI threshold coloring under --color.
`);
}

function discoverWorkspaces() {
  const roots = ['packages', 'packages-web', 'reference', 'test', 'tools'];
  const entries = [];

  for (const root of roots) {
    const absRoot = join(repoRoot, root);
    if (!existsSync(absRoot)) continue;
    for (const child of readdirSync(absRoot, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const dir = join(absRoot, child.name);
      const pkgPath = join(dir, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      entries.push({
        dir,
        root,
        name: pkg.name ?? child.name,
        label: pkg.name ?? `${root}/${child.name}`,
        scripts: pkg.scripts ?? {},
      });
    }
  }

  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

function loadMatrixConfig() {
  const path = join(repoRoot, 'scripts', 'test-matrix.config.json');
  if (!existsSync(path)) {
    return { thresholds: {}, notApplicable: [] };
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readTurboArtifact(dir, fileName) {
  const path = join(dir, '.turbo', fileName);
  if (!existsSync(path)) return null;

  const parsed = parseTestLog(readFileSync(path, 'utf8')) ?? { status: 'present' };
  const meta = readArtifactMeta(path);
  return mergeArtifactMeta(parsed, meta);
}

function readArtifactMeta(logPath) {
  const metaPath = `${logPath}.meta.json`;
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

function mergeArtifactMeta(result, meta) {
  if (!meta) return result;
  const merged = { ...result };
  if (typeof meta.durationMs === 'number' && Number.isFinite(meta.durationMs)) {
    merged.durationMs = meta.durationMs;
  }
  if (meta.signal || (typeof meta.exitCode === 'number' && meta.exitCode !== 0)) {
    merged.status = 'failed';
  } else if (!merged.status || merged.status === 'present') {
    merged.status = 'passed';
  }
  return merged;
}

function readApiResult(ws) {
  if (ws.name !== '@stynx/reference-api') return null;
  return readTurboArtifact(ws.dir, 'turbo-test$colon$int.log') ?? readTurboArtifact(ws.dir, 'turbo-test.log');
}

function readDbResult(ws) {
  if (ws.root === 'test' && basename(ws.dir) === 'db') return readTurboArtifact(ws.dir, 'turbo-test.log');
  if (ws.scripts['test:int']) return readTurboArtifact(ws.dir, 'turbo-test$colon$int.log');
  if (!ws.dir.includes(`${sep}packages${sep}`)) return null;
  return readTurboArtifact(ws.dir, 'turbo-test$colon$int.log');
}

function readE2EResult(ws) {
  if (ws.name !== '@stynx/reference-web') return null;
  const e2eArtifact =
    readTurboArtifact(ws.dir, 'turbo-test$colon$e2e.log') ??
    readTurboArtifact(ws.dir, 'turbo-test-e2e.log');
  const lastRunPath = join(ws.dir, 'test-results', '.last-run.json');
  if (!existsSync(lastRunPath)) return e2eArtifact;

  const payload = JSON.parse(readFileSync(lastRunPath, 'utf8'));
  const status = payload.status === 'passed' ? 'passed' : payload.status === 'failed' ? 'failed' : 'present';
  return {
    ...(e2eArtifact ?? {}),
    status,
    source: 'playwright-last-run',
  };
}

function readMutationResult(ws) {
  const path = join(ws.dir, 'reports', 'mutation', 'mutation.json');
  if (!existsSync(path)) return null;
  const payload = JSON.parse(readFileSync(path, 'utf8'));
  const score = payload?.systemUnderTestMetrics?.mutationScore;
  if (typeof score !== 'number') return { status: 'present', source: 'mutation' };
  return {
    suitesPassed: null,
    suitesTotal: null,
    testsPassed: Math.round(score),
    testsTotal: 100,
    status: 'passed',
    source: 'mutation',
  };
}

function parseTestLog(raw) {
  const text = stripAnsi(raw).replace(/\r/g, '\n');
  return parseJestOrCustomLog(text) ?? parseNodeTestLog(text);
}

function parseJestOrCustomLog(text) {
  const suiteSummary = lastSummary(text, 'Test Suites');
  const testSummary = lastSummary(text, 'Tests');
  if (!suiteSummary && !testSummary) return null;

  const suites = suiteSummary ? parseSummaryCounts(suiteSummary) : {};
  const tests = testSummary ? parseSummaryCounts(testSummary) : {};
  const failed = (suites.failed ?? 0) + (tests.failed ?? 0);
  return {
    suitesPassed: suites.passed ?? null,
    suitesTotal: suites.total ?? null,
    testsPassed: tests.passed ?? null,
    testsTotal: tests.total ?? null,
    durationMs: parseJestDurationMs(text),
    status: failed > 0 ? 'failed' : 'passed',
  };
}

function parseNodeTestLog(text) {
  const suitesTotal = lastNumberAfterInfo(text, 'suites');
  const testsTotal = lastNumberAfterInfo(text, 'tests');
  const testsPassed = lastNumberAfterInfo(text, 'pass');
  const failed = lastNumberAfterInfo(text, 'fail') ?? 0;
  const durationMs = lastNumberAfterInfo(text, 'duration_ms');
  if (suitesTotal == null && testsTotal == null && testsPassed == null && durationMs == null) {
    return null;
  }

  return {
    suitesPassed: suitesTotal != null && failed === 0 ? suitesTotal : null,
    suitesTotal,
    testsPassed: testsPassed ?? (testsTotal != null ? testsTotal - failed : null),
    testsTotal: testsTotal ?? testsPassed,
    durationMs,
    status: failed > 0 ? 'failed' : 'passed',
  };
}

function lastSummary(text, label) {
  const matches = [...text.matchAll(new RegExp(`${label}:\\s+([^\\n]+)`, 'g'))];
  if (matches.length === 0) return null;
  return matches.at(-1)[1];
}

function parseSummaryCounts(summary) {
  const total = numberBefore(summary, 'total');
  const failed = numberBefore(summary, 'failed') ?? 0;
  const passed = numberBefore(summary, 'passed') ?? (total != null ? total - failed : null);
  return { passed, total, failed };
}

function parseJestDurationMs(text) {
  const matches = [...text.matchAll(/Time:\s+([\d.]+)\s*(ms|s|m)?/g)];
  if (matches.length === 0) return null;
  const [, value, unit = 's'] = matches.at(-1);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (unit === 'ms') return numeric;
  if (unit === 'm') return numeric * 60_000;
  return numeric * 1000;
}

function lastNumberAfterInfo(text, word) {
  const matches = [...text.matchAll(new RegExp(`(?:ℹ|i)\\s+${word}\\s+([\\d.]+)`, 'g'))];
  if (matches.length === 0) return null;
  const value = Number(matches.at(-1)[1]);
  return Number.isFinite(value) ? value : null;
}

function numberBefore(text, word) {
  const match = text.match(new RegExp(`(\\d+)\\s+${word}`));
  return match ? Number(match[1]) : null;
}

function buildCell(ws, column, result, coverage) {
  if (aspect === 'coverage') return buildCoverageCell(ws, column, coverage);
  if (aspect === 'timing') return buildTimingCell(ws, column, result);
  return buildStatusCell(ws, column, result);
}

function buildStatusCell(ws, column, result) {
  if (isNotApplicable(ws, column)) {
    return { state: 'not-applicable' };
  }

  const configured = isConfiguredColumn(ws, column);
  if (!configured && !result) {
    return { state: 'no-tests' };
  }
  if (!result) {
    return { state: 'not-run' };
  }

  return {
    state: resultFailed(result) ? 'failed' : 'passed',
    result,
  };
}

function buildCoverageCell(ws, column, coverage) {
  if (isNotApplicable(ws, column) || !['Unit', 'DB', coverageColumn].includes(column)) {
    return { state: 'not-applicable' };
  }
  if (coverage) {
    return { state: 'coverage', coverage };
  }
  if (isConfiguredColumn(ws, column)) {
    return { state: 'not-run' };
  }
  return { state: 'no-tests' };
}

function buildTimingCell(ws, column, result) {
  if (isNotApplicable(ws, column) || column === coverageColumn) {
    return { state: 'not-applicable' };
  }
  const configured = isConfiguredColumn(ws, column);
  if (!configured && !result) {
    return { state: 'no-tests' };
  }
  if (!result) {
    return { state: 'not-run' };
  }
  if (typeof result.durationMs === 'number' && Number.isFinite(result.durationMs)) {
    return {
      state: resultFailed(result) ? 'failed' : 'passed',
      durationMs: result.durationMs,
    };
  }
  return { state: 'unknown-timing' };
}

function isConfiguredColumn(ws, column) {
  if (column === coverageColumn) return hasAnyCoverageProducingLevel(ws);
  return hasConfiguredLevel(ws, column);
}

function isInterestingCell(cell) {
  return !['not-applicable', 'no-tests'].includes(cell.state);
}

function resultFailed(result) {
  if (!result) return false;
  if (result.status === 'failed') return true;
  return (
    result.testsPassed != null &&
    result.testsTotal != null &&
    result.testsTotal > 0 &&
    result.testsPassed < result.testsTotal
  );
}

function hasAnyCoverageProducingLevel(ws) {
  return ['Unit', 'API', 'DB', 'E2E'].some((level) => hasConfiguredLevel(ws, level));
}

function hasConfiguredLevel(ws, level) {
  if (level === 'Unit') {
    return Boolean(ws.scripts.test) || hasAnyFile(ws.dir, ['jest.config.cjs', 'jest.config.mjs', 'vitest.config.ts']);
  }
  if (level === 'API') {
    return ws.name === '@stynx/reference-api' && Boolean(ws.scripts['test:int'] || ws.scripts.test);
  }
  if (level === 'DB') {
    return (
      (ws.root === 'test' && basename(ws.dir) === 'db') ||
      Boolean(ws.scripts['test:int']) ||
      hasAnyFile(ws.dir, ['jest.integration.config.cjs', 'jest.integration.config.mjs'])
    );
  }
  if (level === 'E2E') {
    return Boolean(ws.scripts['test:e2e']) || hasAnyFile(ws.dir, ['playwright.config.mjs', 'playwright.config.ts']);
  }
  if (level === 'Mutation') {
    return Boolean(ws.scripts.stryker || ws.scripts.mutation) || hasAnyFile(ws.dir, ['stryker.conf.mjs', 'stryker.conf.cjs']);
  }
  return false;
}

function hasAnyFile(dir, names) {
  return names.some((name) => existsSync(join(dir, name)));
}

function isNotApplicable(ws, column) {
  const level = column === coverageColumn ? 'Coverage' : column;
  return (matrixConfig.notApplicable ?? []).some((entry) => {
    if (!entry.levels?.includes(level)) return false;
    return matchesPattern(ws.name, entry.packagePattern);
  });
}

function matchesPattern(value, pattern) {
  if (!pattern) return false;
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(value);
}

function loadCoverageByWorkspace(workspaces) {
  const path = join(repoRoot, 'coverage', 'coverage-final.json');
  return existsSync(path) ? summarizeCoverage(path, workspaces) : new Map();
}

function loadScratchCoverageByWorkspace(workspaces, level) {
  const out = new Map();
  for (const ws of workspaces) {
    const leaf = basename(ws.dir);
    const path = join(repoRoot, 'coverage', '.aggregate-scratch', leaf, level, 'coverage-final.json');
    if (!existsSync(path)) continue;
    const summary = summarizeCoverage(path, [ws]).get(ws.dir);
    if (summary) out.set(ws.dir, summary);
  }
  return out;
}

function summarizeCoverage(path, workspaces) {
  const byWorkspace = new Map(workspaces.map((ws) => [ws.dir, newCoverageCounter()]));
  const coverage = JSON.parse(readFileSync(path, 'utf8'));

  for (const [file, fileCoverage] of Object.entries(coverage)) {
    const ws = findWorkspaceForFile(file, workspaces);
    if (!ws) continue;
    addFileCoverage(byWorkspace.get(ws.dir), fileCoverage);
  }

  const summaries = new Map();
  for (const [dir, counter] of byWorkspace) {
    if (counter.statements.total === 0 && counter.lines.total === 0) continue;
    summaries.set(dir, {
      lines: pct(counter.lines),
      statements: pct(counter.statements),
      branches: pct(counter.branches),
      functions: pct(counter.functions),
    });
  }
  return summaries;
}

function findWorkspaceForFile(file, workspaces) {
  const abs = resolve(file);
  let best = null;
  for (const ws of workspaces) {
    const rel = relative(ws.dir, abs);
    if (rel.startsWith('..') || rel === '') continue;
    if (!best || ws.dir.length > best.dir.length) best = ws;
  }
  return best;
}

function newCoverageCounter() {
  return {
    lines: { covered: 0, total: 0 },
    statements: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
  };
}

function addFileCoverage(counter, fileCoverage) {
  const lines = new Map();
  for (const [id, hit] of Object.entries(fileCoverage.s ?? {})) {
    const statement = fileCoverage.statementMap?.[id];
    if (!statement?.start?.line) continue;
    const line = statement.start.line;
    const prior = lines.get(line) ?? false;
    lines.set(line, prior || Number(hit) > 0);
  }
  counter.lines.total += lines.size;
  counter.lines.covered += [...lines.values()].filter(Boolean).length;

  addFlatMetric(counter.statements, Object.values(fileCoverage.s ?? {}));
  addFlatMetric(counter.functions, Object.values(fileCoverage.f ?? {}));
  addFlatMetric(counter.branches, Object.values(fileCoverage.b ?? {}).flat());
}

function addFlatMetric(counter, hits) {
  counter.total += hits.length;
  counter.covered += hits.filter((hit) => Number(hit) > 0).length;
}

function pct(counter) {
  if (counter.total === 0) return null;
  return (counter.covered / counter.total) * 100;
}

function printMatrix(rows) {
  const headers = ['Package', ...columns];
  const body = rows.map((row) => [row.name, ...columns.map((level) => renderCell(row.cells[level]))]);
  const table = renderTable([headers, ...body]);
  process.stdout.write(`${table}\n\n`);

  if (aspect === 'coverage') {
    process.stdout.write('Coverage cell order: lines | statements / branches | functions.\n');
    process.stdout.write('Unit uses unit scratch coverage; DB uses integration scratch coverage; Coverage uses coverage/coverage-final.json.\n');
  } else if (aspect === 'timing') {
    process.stdout.write('Timing prefers recorder sidecar durationMs, then Jest Time, then Node duration_ms.\n');
  } else {
    process.stdout.write('Status cell order: suites_passed/suites_total | tests_passed/tests_total.\n');
  }
  process.stdout.write("'   ' = configured meaningless; ' - ' = no package script/config; ' 0 ' = applicable level has no current artifact.\n");
}

function renderCell(cell) {
  if (!cell) return renderNoTests();
  if (cell.state === 'not-applicable') return colorize('   ', 'dim');
  if (cell.state === 'no-tests') return renderNoTests();
  if (cell.state === 'not-run') return renderNotRun();
  if (cell.state === 'coverage') return renderCoverage(cell.coverage);
  if (cell.state === 'unknown-timing') return renderNotRun();
  if (aspect === 'timing') return renderTiming(cell);
  return renderStatusResult(cell);
}

function renderNoTests() {
  return useColor ? colorize('·', 'dim') : colorize(' - ', 'dim');
}

function renderNotRun() {
  return useColor ? `${stateGlyph('not-run')} 0` : colorize(' 0 ', 'yellow');
}

function renderTiming(cell) {
  return `${stateGlyph(cell.state)}${formatDuration(cell.durationMs)}`;
}

function renderStatusResult(cell) {
  const counts = renderCounts(cell.result);
  if (cell.state === 'failed') {
    return `${stateGlyph('failed')}FAIL ${counts}`;
  }
  return `${stateGlyph('passed')}${counts}`;
}

function stateGlyph(state) {
  if (!useColor) return '';
  if (state === 'failed') return '🔴 ';
  if (state === 'not-run') return '🟡';
  return '🟢 ';
}

function renderCounts(result) {
  if (!result) return '';
  return `[${renderCountPair(result.suitesPassed, result.suitesTotal)} | ${renderCountPair(
    result.testsPassed,
    result.testsTotal,
  )}]`;
}

function renderCountPair(passed, total) {
  return `${formatCount(passed)}/${formatCount(total)}`;
}

function formatCount(value) {
  return value == null ? ' ' : String(value);
}

function renderCoverage(coverage) {
  if (!coverage) return '  |    /    |   ';
  const first = `${formatMetric(coverage.lines, 'lines')} | ${formatMetric(coverage.statements, 'statements')}`;
  const second = `${formatMetric(coverage.branches, 'branches')} | ${formatMetric(coverage.functions, 'functions')}`;
  return compact ? `${first} / ${second}` : `${first}\n${second}`;
}

function formatMetric(value, metric) {
  if (value == null) return '  ';
  if (Math.round(value) === 100) {
    return useColor ? colorize('✓✓', 'green') : '✓✓';
  }
  const rounded = String(Math.round(value)).padStart(3, ' ');
  const threshold = thresholdFor(metric);
  if (!useColor) return rounded.trim();
  if (value >= threshold) return colorize(rounded.trim(), 'green');
  if (value >= 50) return colorize(rounded.trim(), 'yellow');
  return colorize(rounded.trim(), 'red');
}

function thresholdFor(metric) {
  return matrixConfig.thresholds?.[metric] ?? (metric === 'branches' ? 80 : 85);
}

function formatDuration(durationMs) {
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))}ms`;
  if (durationMs < 60_000) {
    const seconds = durationMs / 1000;
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function renderTable(rows) {
  const splitRows = rows.map((row) => row.map((cell) => String(cell).split('\n')));
  const widths = [];
  for (const row of splitRows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, ...cell.map((line) => visibleLength(line)));
    });
  }

  const sepLine = widths.map((width) => '-'.repeat(width)).join('-+-');
  const rendered = [];
  splitRows.forEach((row, rowIndex) => {
    const height = Math.max(...row.map((cell) => cell.length));
    for (let lineIndex = 0; lineIndex < height; lineIndex += 1) {
      rendered.push(
        row
          .map((cell, colIndex) => padVisible(cell[lineIndex] ?? '', widths[colIndex]))
          .join(' | '),
      );
    }
    if (rowIndex === 0) rendered.push(sepLine);
  });
  return rendered.join('\n');
}

function padVisible(value, width) {
  return value + ' '.repeat(Math.max(0, width - visibleLength(value)));
}

function visibleLength(value) {
  return Array.from(stripAnsi(value)).length;
}

function stripAnsi(value) {
  return String(value)
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function colorize(value, color) {
  if (!useColor) return value;
  const codes = {
    green: 32,
    yellow: 33,
    red: 31,
    dim: 90,
  };
  return `\u001B[${codes[color]}m${value}\u001B[0m`;
}
