#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
const useColor = args.color === true;
const compact = args.compact === true;
const showEmpty = args.empty === true;
const showResume = args.resume === true;
const aspect = args.aspect;
const matrixConfig = loadMatrixConfig();

const levels = ['Unit', 'API', 'DB', 'E2E', 'Mutation'];
const coverageColumn = 'Coverage (lines|stat/brch|func)';
const coverageMetricColumns = ['Lines', 'Statements', 'Branches', 'Functions'];
const coverageMetricByColumn = {
  Lines: 'lines',
  Statements: 'statements',
  Branches: 'branches',
  Functions: 'functions',
};
const timingValueWidth = 13;
const columns = aspect === 'coverage' ? coverageMetricColumns : levels;
const workspaces = discoverWorkspaces();
const coverageByWorkspace = aspect === 'coverage' ? loadCoverageByWorkspace(workspaces) : new Map();
const rows = [];

for (const ws of workspaces) {
  const coverageSummary = coverageByWorkspace.get(ws.dir);
  const results = {
    Unit: readCanonicalResult(ws.dir, 'unit'),
    API: readApiResult(ws),
    DB: readDbResult(ws),
    E2E: readE2EResult(ws),
    Mutation: readMutationResult(ws),
  };
  const coverage = {
    API: null,
    E2E: null,
    Mutation: null,
    Lines: coverageSummary,
    Statements: coverageSummary,
    Branches: coverageSummary,
    Functions: coverageSummary,
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
  const parsed = { color: true, compact: false, empty: false, resume: false, aspect: 'status' };
  const aspectFlags = [];

  for (const value of values) {
    if (value === '--') continue;
    if (value === '--color' || value === '--color=always') parsed.color = true;
    else if (value === '--no-color' || value === '--color=never') parsed.color = false;
    else if (value === '--compact') parsed.compact = true;
    else if (value === '--empty') parsed.empty = true;
    else if (value === '--resume') parsed.resume = true;
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
  stream.write(`Usage: node scripts/render-test-matrix.mjs [--status|--coverage|--timing] [--color|--no-color] [--compact] [--empty] [--resume]

Reads existing result artifacts only; it does not run tests.

Sources:
  - scripts/test-matrix.config.json for meaningless cells and coverage thresholds
  - */.test-results/<level>.json (canonical, schema v1) for every level
  - reference/web/test-results/.last-run.json for Playwright E2E status
  - coverage/coverage-final.json for aggregate workspace coverage

Modes:
  --status    state plus [suites_passed/suites_total | tests_passed/tests_total] counts
  --coverage  coverage only: lines, statements, branches, functions
  --timing    runtime only: fixed-width [hh:][mm:]ss.mmm rendering
  --compact   glyph-only cells: 🟢 pass/at threshold, 🟡 not run/fail/below threshold,
              🔴 below 50% coverage, · no config, blank meaningless
  --resume    append summary totals for the selected mode

States:
  '   '     configured as meaningless for that package/level
  ' - '     no package script/config for that level
  ' 0 '     package has that level, but no current artifact exists
  FAIL      current artifact exists and did not pass

Color:
  Enabled by default; pass --no-color to disable.
  Coverage is green at/above threshold, yellow from 50% to threshold, red below 50%.
`);
}

function discoverWorkspaces() {
  const roots = aspect === 'coverage'
    ? ['packages', 'packages-web']
    : ['packages', 'packages-web', 'domain', 'infra', 'reference', 'test', 'tools'];
  const entries = [];

  for (const root of roots) {
    const absRoot = join(repoRoot, root);
    if (!existsSync(absRoot)) continue;
    entries.push(...discoverWorkspacesUnder(root, absRoot));
  }

  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

function discoverWorkspacesUnder(root, dir) {
  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return [{
      dir,
      root,
      name: pkg.name ?? relative(repoRoot, dir),
      label: pkg.name ?? relative(repoRoot, dir),
      scripts: pkg.scripts ?? {},
    }];
  }

  const entries = [];
  for (const child of readdirSync(dir, { withFileTypes: true })) {
    if (!child.isDirectory()) continue;
    if (child.name === 'node_modules' || child.name === 'dist' || child.name.startsWith('.')) continue;
    entries.push(...discoverWorkspacesUnder(root, join(dir, child.name)));
  }
  return entries;
}

function loadMatrixConfig() {
  const path = join(repoRoot, 'scripts', 'test-matrix.config.json');
  if (!existsSync(path)) {
    return { thresholds: {}, notApplicable: [] };
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readCanonicalResult(dir, level) {
  const path = join(dir, '.test-results', `${level}.json`);
  if (!existsSync(path)) return null;
  try {
    const r = JSON.parse(readFileSync(path, 'utf8'));
    if (r.schemaVersion !== '1') return null;
    // For mutation, surface the score as testsPassed/total = score/100 so the
    // matrix renders 'XX/100' in count mode and the threshold-aware status
    // colour still works.
    if (r.level === 'mutation' && typeof r.metric?.score === 'number') {
      return {
        status: r.status === 'passed' ? 'passed' : r.status === 'failed' ? 'failed' : 'present',
        durationMs: r.durationMs,
        suitesPassed: null,
        suitesTotal: null,
        testsPassed: Math.round(r.metric.score),
        testsTotal: 100,
        // Tag as 'mutation' so resultFailed() defers to the artifact's
        // own status (which the wrapper already set from Stryker's break
        // threshold) instead of treating score<100 as a failure.
        source: 'mutation',
      };
    }
    return {
      status: r.status === 'passed' ? 'passed' : r.status === 'failed' ? 'failed' : 'present',
      durationMs: r.durationMs,
      suitesPassed: r.totals?.files ?? null,
      suitesTotal: r.totals?.files ?? null,
      testsPassed: r.totals?.passed ?? null,
      testsTotal: r.totals?.tests ?? null,
      source: 'test-result/v1',
    };
  } catch {
    return null;
  }
}

function readApiResult(ws) {
  if (!hasConfiguredLevel(ws, 'API')) return null;
  // API column is satisfied by the package's integration tests; same artifact
  // as the DB column reads.
  return readCanonicalResult(ws.dir, 'integration');
}

function readDbResult(ws) {
  if (!hasConfiguredLevel(ws, 'DB')) return null;
  return readCanonicalResult(ws.dir, 'integration');
}

function readE2EResult(ws) {
  if (!hasConfiguredLevel(ws, 'E2E')) return null;
  const e2eArtifact = readCanonicalResult(ws.dir, 'e2e');
  if (ws.name !== '@stynx/reference-web') return e2eArtifact;
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
  // Canonical only after R3.
  const canonical = readCanonicalResult(ws.dir, 'mutation');
  if (canonical) return canonical;
  // Legacy fallback for in-flight migrations only; remove once every package
  // has run through the wrapper at least once.
  const path = join(ws.dir, 'reports', 'mutation', 'mutation.json');
  if (!existsSync(path)) return null;
  const payload = JSON.parse(readFileSync(path, 'utf8'));
  const score = payload?.systemUnderTestMetrics?.mutationScore ?? calculateStrykerMutationScore(payload);
  if (typeof score !== 'number') return { status: 'present', source: 'mutation' };
  const breakThreshold = payload?.thresholds?.break;
  return {
    suitesPassed: null,
    suitesTotal: null,
    testsPassed: Math.round(score),
    testsTotal: 100,
    status: typeof breakThreshold === 'number' && score < breakThreshold ? 'failed' : 'passed',
    source: 'mutation',
  };
}

function calculateStrykerMutationScore(payload) {
  const files = payload?.files;
  if (!files || typeof files !== 'object') return null;
  let killed = 0;
  let detected = 0;
  let undetected = 0;
  for (const file of Object.values(files)) {
    for (const mutant of file?.mutants ?? []) {
      if (mutant.status === 'Killed' || mutant.status === 'TimedOut') {
        killed += 1;
        detected += 1;
      } else if (mutant.status === 'Survived' || mutant.status === 'NoCoverage') {
        undetected += 1;
      }
    }
  }
  const total = detected + undetected;
  return total > 0 ? (killed / total) * 100 : null;
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
  if (isNotApplicable(ws, 'Coverage')) {
    return { state: 'not-applicable' };
  }
  const metric = coverageMetricByColumn[column];
  if (!metric) {
    return { state: 'not-applicable' };
  }
  if (!hasCoverageConfigured(ws)) {
    return { state: 'no-tests' };
  }
  if (coverage) {
    return { state: 'coverage-metric', value: coverage[metric], metric };
  }
  return { state: 'not-run' };
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
  if (result.source === 'mutation') return false;
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

function hasCoverageConfigured(ws) {
  return hasAnyFile(ws.dir, ['vitest.config.ts', 'vitest.config.mjs']);
}

function hasConfiguredLevel(ws, level) {
  if (level === 'Unit') {
    return Boolean(ws.scripts.test) || hasAnyFile(ws.dir, ['vitest.config.ts', 'vitest.config.mjs']);
  }
  if (level === 'API') {
    return (
      Boolean(ws.scripts['test:api']) ||
      (ws.name === '@stynx/reference-api' && Boolean(ws.scripts['test:int'] || ws.scripts.test)) ||
      hasControllerSource(ws.dir)
    );
  }
  if (level === 'DB') {
    return (
      (ws.root === 'test' && basename(ws.dir) === 'db') ||
      Boolean(ws.scripts['test:int']) ||
      hasAnyFile(ws.dir, ['vitest.int.config.ts', 'vitest.int.config.mjs'])
    );
  }
  if (level === 'E2E') {
    return isRunnableScript(ws.scripts['test:e2e']) || hasAnyFile(ws.dir, ['playwright.config.mjs', 'playwright.config.ts']);
  }
  if (level === 'Mutation') {
    return Boolean(ws.scripts.stryker || ws.scripts.mutation) || hasAnyFile(ws.dir, ['stryker.conf.mjs', 'stryker.conf.cjs']);
  }
  return false;
}

function isRunnableScript(script) {
  if (!script) return false;
  return !/removed during V6 cutover|tests pending/i.test(script);
}

function hasAnyFile(dir, names) {
  return names.some((name) => existsSync(join(dir, name)));
}

function hasControllerSource(dir) {
  const srcDir = join(dir, 'src');
  if (!existsSync(srcDir)) return false;
  return hasFileMatching(srcDir, (name) => name.endsWith('.controller.ts'));
}

function hasFileMatching(dir, predicate) {
  for (const child of readdirSync(dir, { withFileTypes: true })) {
    const childPath = join(dir, child.name);
    if (child.isDirectory()) {
      if (child.name === 'dist' || child.name === 'node_modules' || child.name.startsWith('.')) continue;
      if (hasFileMatching(childPath, predicate)) return true;
    } else if (predicate(child.name)) {
      return true;
    }
  }
  return false;
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
    if (isNonBehavioralCoverageFile(file)) continue;
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

function isNonBehavioralCoverageFile(file) {
  const normalized = file.split(sep).join('/');
  return (
    normalized.endsWith('/src/index.ts') ||
    normalized.endsWith('/src/tokens.ts') ||
    normalized.includes('/src/generated/') ||
    normalized.includes('/src/schema/') ||
    normalized.endsWith('/schema.ts')
  );
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
  const tableColumns = showResume && aspect === 'timing' ? [...columns, 'Total'] : columns;
  const headers = ['Package', ...tableColumns.map((column) => renderHeader(column))];
  const body = rows.map((row) => renderMatrixRow(row, tableColumns));
  const resumeRows = renderResumeRows(rows, tableColumns);
  const tableRows = [headers, ...body, ...resumeRows];
  const table = renderTable(tableRows, { separatorBeforeLast: resumeRows.length > 0 });
  process.stdout.write(`${table}\n\n`);

  if (aspect === 'coverage') {
    process.stdout.write('Coverage columns: lines, statements, branches, functions.\n');
    process.stdout.write('Source: coverage/coverage-final.json.\n');
  } else if (aspect === 'timing') {
    process.stdout.write('Timing prefers recorder sidecar durationMs, then Vitest Time, then Node duration_ms.\n');
  } else {
    process.stdout.write('Status cell order: suites_passed/suites_total | tests_passed/tests_total.\n');
  }
  process.stdout.write("'   ' = configured meaningless; ' - ' = no package script/config; ' 0 ' = applicable level has no current artifact.\n");
}

function renderMatrixRow(row, tableColumns) {
  const rendered = [row.name, ...columns.map((level) => renderCell(row.cells[level]))];
  if (tableColumns.includes('Total')) {
    rendered.push(renderTimingTotal(sumTimingRow(row)));
  }
  return rendered;
}

function renderResumeRows(rows, tableColumns) {
  if (!showResume) return [];
  if (aspect === 'coverage') {
    return [['Resume', ...columns.map((column) => renderCoverageResume(rows, column))]];
  }
  if (aspect === 'timing') {
    return [
      [
        'Total',
        ...columns.map((column) => renderTimingTotal(sumTimingColumn(rows, column))),
        renderTimingTotal(sumTimingRows(rows)),
      ],
    ];
  }
  return [['Resume', ...columns.map((column) => renderStatusResume(rows, column))]];
}

function renderStatusResume(rows, column) {
  const expectedRows = rows.filter((row) => isExpectedCell(row.cells[column]));
  const green = expectedRows.filter((row) => row.cells[column]?.state === 'passed').length;
  return `${green}/${expectedRows.length}`;
}

function renderCoverageResume(rows, column) {
  const metric = coverageMetricByColumn[column];
  const expectedRows = rows.filter((row) => isExpectedCoverageCell(row.cells[column]));
  let above = 0;
  for (const row of expectedRows) {
    const cell = row.cells[column];
    if (cell?.state === 'coverage-metric' && cell.value != null && cell.value >= thresholdFor(metric)) {
      above += 1;
    }
  }
  return `${above}/${expectedRows.length}`;
}

function isExpectedCoverageCell(cell) {
  if (!isExpectedCell(cell)) return false;
  return cell.state !== 'coverage-metric' || cell.value != null;
}

function isExpectedCell(cell) {
  return Boolean(cell && !['not-applicable', 'no-tests'].includes(cell.state));
}

function sumTimingRows(rows) {
  return rows.reduce((total, row) => total + sumTimingRow(row), 0);
}

function sumTimingRow(row) {
  return columns.reduce((total, column) => total + timingDuration(row.cells[column]), 0);
}

function sumTimingColumn(rows, column) {
  return rows.reduce((total, row) => total + timingDuration(row.cells[column]), 0);
}

function timingDuration(cell) {
  return typeof cell?.durationMs === 'number' && Number.isFinite(cell.durationMs) ? cell.durationMs : 0;
}

function renderTimingTotal(durationMs) {
  if (durationMs <= 0) return '';
  return formatDuration(durationMs);
}

function renderHeader(column) {
  if (!compact) return column;
  return (
    {
      Unit: 'U',
      API: 'A',
      DB: 'D',
      E2E: 'E',
      Mutation: 'M',
      Lines: 'L',
      Statements: 'S',
      Branches: 'B',
      Functions: 'F',
      Total: 'T',
    }[column] ?? column
  );
}

function renderCell(cell) {
  if (compact) return renderCompactCell(cell);
  if (!cell) return renderNoTests();
  if (cell.state === 'not-applicable') return colorize('   ', 'dim');
  if (cell.state === 'no-tests') return renderNoTests();
  if (cell.state === 'not-run') return renderNotRun();
  if (cell.state === 'coverage') return renderCoverage(cell.coverage);
  if (cell.state === 'coverage-metric') return formatMetric(cell.value, cell.metric);
  if (cell.state === 'unknown-timing') return renderNotRun();
  if (aspect === 'timing') return renderTiming(cell);
  return renderStatusResult(cell);
}

function renderCompactCell(cell) {
  if (!cell) return renderCompactNoTests();
  if (cell.state === 'not-applicable') return ' ';
  if (cell.state === 'no-tests') return renderCompactNoTests();
  if (cell.state === 'not-run' || cell.state === 'unknown-timing') return renderCompactState('not-run');
  if (cell.state === 'coverage-metric') return renderCompactCoverage(cell.value, cell.metric);
  if (cell.state === 'coverage') return renderCompactState(cell.coverage ? 'passed' : 'not-run');
  return renderCompactState(cell.state);
}

function renderCompactNoTests() {
  return useColor ? '·' : '-';
}

function renderCompactState(state) {
  if (state === 'passed') return useColor ? '🟢' : 'P';
  if (state === 'failed' || state === 'not-run') return useColor ? '🟡' : '!';
  return useColor ? colorize('·', 'dim') : '-';
}

function renderCompactCoverage(value, metric) {
  if (value == null) return ' ';
  const threshold = thresholdFor(metric);
  if (value >= threshold) return useColor ? '🟢' : 'G';
  if (value >= 50) return useColor ? '🟡' : 'Y';
  return useColor ? '🔴' : 'R';
}

function renderNoTests() {
  return colorize(' - ', 'dim');
}

function renderNotRun() {
  return colorize(' 0 ', 'yellow');
}

function renderTiming(cell) {
  const duration = formatDuration(cell.durationMs);
  if (!useColor) return duration;
  return colorize(duration, cell.state === 'failed' ? 'yellow' : 'green');
}

function renderStatusResult(cell) {
  const counts = renderCounts(cell.result);
  if (cell.state === 'failed') {
    return colorize(`FAIL ${counts}`, 'yellow');
  }
  return counts;
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
  return `${first}\n${second}`;
}

function formatMetric(value, metric) {
  if (value == null) return '   ';
  if (Math.round(value) === 100) {
    const perfect = '✓✓'.padStart(3, ' ');
    return useColor ? colorize(perfect, 'green') : perfect;
  }
  const rounded = String(Math.round(value)).padStart(3, ' ');
  const threshold = thresholdFor(metric);
  if (!useColor) return rounded;
  if (value >= threshold) return colorize(rounded, 'green');
  if (value >= 50) return colorize(rounded, 'yellow');
  return colorize(rounded, 'red');
}

function thresholdFor(metric) {
  return matrixConfig.thresholds?.[metric] ?? (metric === 'branches' ? 80 : 85);
}

function formatDuration(durationMs) {
  const totalMs = Math.max(0, Math.round(durationMs));
  const ms = String(totalMs % 1000).padStart(3, '0');
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const secondsText = hours > 0 || totalMinutes > 0 ? String(seconds).padStart(2, '0') : String(seconds);
  const value =
    hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${secondsText}.${ms}s`
      : totalMinutes > 0
        ? `${totalMinutes}:${secondsText}.${ms}s`
        : `${secondsText}.${ms}s`;
  return value.padStart(timingValueWidth);
}

function renderTable(rows, options = {}) {
  const splitRows = rows.map((row) => row.map((cell) => String(cell).split('\n')));
  const widths = [];
  for (const row of splitRows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, ...cell.map((line) => visibleLength(line)));
    });
  }
  if (aspect === 'timing' && !compact) {
    for (let index = 1; index < widths.length; index += 1) {
      widths[index] = Math.max(widths[index] ?? 0, timingValueWidth);
    }
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
    if (options.separatorBeforeLast && rowIndex === rows.length - 2) rendered.push(sepLine);
  });
  return rendered.join('\n');
}

function padVisible(value, width) {
  return value + ' '.repeat(Math.max(0, width - visibleLength(value)));
}

function visibleLength(value) {
  return Array.from(stripAnsi(value)).reduce((width, char) => width + charWidth(char), 0);
}

function charWidth(char) {
  const codePoint = char.codePointAt(0);
  if (codePoint == null) return 0;
  if (codePoint === 0xfe0f) return 0;
  if (isWideGlyph(codePoint)) return 2;
  return 1;
}

function isWideGlyph(codePoint) {
  return codePoint >= 0x1f300 && codePoint <= 0x1faff;
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
