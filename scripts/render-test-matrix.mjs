#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
const useColor = args.color === true;
const compact = args.compact === true;
const showEmpty = args.empty === true;
const matrixConfig = loadMatrixConfig();

const levels = ['Unit', 'API', 'DB', 'E2E', 'Mutation'];
const coverageColumn = 'Coverage (lines|stat/brch|func)';
const columns = [...levels, coverageColumn];
const workspaces = discoverWorkspaces();
const coverageByWorkspace = loadCoverageByWorkspace(workspaces);
const unitCoverageByWorkspace = loadScratchCoverageByWorkspace(workspaces, 'unit');
const rows = [];

for (const ws of workspaces) {
  const cells = {
    Unit: buildTestCell(ws, 'Unit', readTurboResult(ws.dir, 'turbo-test.log'), unitCoverageByWorkspace.get(ws.dir)),
    API: buildTestCell(ws, 'API', readApiResult(ws), null),
    DB: buildTestCell(ws, 'DB', readDbResult(ws), null),
    E2E: buildTestCell(ws, 'E2E', readE2EResult(ws), null),
    Mutation: buildTestCell(ws, 'Mutation', readMutationResult(ws), null),
    [coverageColumn]: buildCoverageCell(ws, coverageByWorkspace.get(ws.dir)),
  };

  if (!showEmpty && Object.values(cells).every((cell) => !isInterestingCell(cell))) {
    continue;
  }

  rows.push({ name: ws.label, cells });
}

printMatrix(rows);

function parseArgs(values) {
  const parsed = { color: false, compact: false, empty: false };
  for (const value of values) {
    if (value === '--color' || value === '--color=always') parsed.color = true;
    if (value === '--no-color' || value === '--color=never') parsed.color = false;
    if (value === '--compact') parsed.compact = true;
    if (value === '--empty') parsed.empty = true;
    if (value === '--help' || value === '-h') {
      process.stdout.write(`Usage: node scripts/render-test-matrix.mjs [--color] [--compact] [--empty]

Reads existing result artifacts only; it does not run tests.

Sources:
  - scripts/test-matrix.config.json for meaningless cells and coverage thresholds
  - */.turbo/turbo-test*.log for Jest pass counts
  - reference/web/test-results/.last-run.json for Playwright status
  - packages/*/reports/mutation/mutation.json when present
  - coverage/coverage-final.json for aggregate coverage
  - coverage/.aggregate-scratch/<pkg>/unit/coverage-final.json for unit coverage

Cell format:
  [pass/all]
  lines | statements
  branches | functions

States:
  '   '     configured as meaningless for that package/level
  ' - '     no package script/config for that level
  ' 0 '     package has that test level, but no current result artifact exists
  NO COUNTS coverage exists, but no pass/all result artifact exists
  FAIL     result artifact exists and did not pass all tests

Color:
  GREEN  >= configured threshold
  YELLOW >= 50 and below threshold
  RED    < 50
`);
      process.exit(0);
    }
  }
  return parsed;
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

function readTurboResult(dir, fileName) {
  const path = join(dir, '.turbo', fileName);
  if (!existsSync(path)) return null;
  return parseJestLog(readFileSync(path, 'utf8'));
}

function readApiResult(ws) {
  if (ws.name !== '@stynx/reference-api') return null;
  return readTurboResult(ws.dir, 'turbo-test$colon$int.log') ?? readTurboResult(ws.dir, 'turbo-test.log');
}

function readDbResult(ws) {
  if (ws.root === 'test' && basename(ws.dir) === 'db') return readTurboResult(ws.dir, 'turbo-test.log');
  if (!ws.dir.includes(`${sep}packages${sep}`)) return null;
  return readTurboResult(ws.dir, 'turbo-test$colon$int.log');
}

function readE2EResult(ws) {
  if (ws.name !== '@stynx/reference-web') return null;
  const path = join(ws.dir, 'test-results', '.last-run.json');
  if (!existsSync(path)) return null;
  const payload = JSON.parse(readFileSync(path, 'utf8'));
  if (payload.status === 'passed') return { passed: null, total: null, status: 'passed' };
  if (Array.isArray(payload.failedTests)) {
    return { passed: 0, total: payload.failedTests.length, status: 'failed' };
  }
  return { passed: null, total: null, status: payload.status ?? 'unknown' };
}

function readMutationResult(ws) {
  const path = join(ws.dir, 'reports', 'mutation', 'mutation.json');
  if (!existsSync(path)) return null;
  const payload = JSON.parse(readFileSync(path, 'utf8'));
  const score = payload?.systemUnderTestMetrics?.mutationScore;
  if (typeof score !== 'number') return { passed: null, total: null, status: 'present' };
  return {
    passed: Math.round(score),
    total: 100,
    status: 'score',
    note: `${score.toFixed(1)}%`,
  };
}

function parseJestLog(raw) {
  const text = stripAnsi(raw).replace(/\r/g, '\n');
  const matches = [...text.matchAll(/Tests:\s+([^\n]+)/g)];
  if (matches.length === 0) return null;
  const summary = matches.at(-1)[1];
  const total = numberBefore(summary, 'total');
  const passed = numberBefore(summary, 'passed') ?? (total != null ? total - (numberBefore(summary, 'failed') ?? 0) : null);
  const status = (numberBefore(summary, 'failed') ?? 0) > 0 ? 'failed' : 'passed';
  return { passed, total, status };
}

function numberBefore(text, word) {
  const match = text.match(new RegExp(`(\\d+)\\s+${word}`));
  return match ? Number(match[1]) : null;
}

function buildTestCell(ws, level, result, coverage) {
  if (isNotApplicable(ws, level)) {
    return { state: 'not-applicable' };
  }

  const configured = hasConfiguredLevel(ws, level);
  if (!configured && !result && !coverage) {
    return { state: 'no-tests' };
  }
  if (!result && coverage) {
    return { state: 'no-counts', coverage };
  }
  if (!result) {
    return { state: 'not-run' };
  }

  return {
    state: resultFailed(result) ? 'failed' : 'passed',
    result,
    coverage,
  };
}

function buildCoverageCell(ws, coverage) {
  if (isNotApplicable(ws, 'Coverage')) {
    return { state: 'not-applicable' };
  }
  if (coverage) {
    return { state: 'coverage', coverage };
  }
  if (hasAnyCoverageProducingLevel(ws)) {
    return { state: 'not-run' };
  }
  return { state: 'no-tests' };
}

function isInterestingCell(cell) {
  return !['not-applicable', 'no-tests'].includes(cell.state);
}

function resultFailed(result) {
  if (!result) return false;
  if (result.status === 'failed') return true;
  if (result.status === 'score' || result.status === 'present') return false;
  return result.passed != null && result.total != null && result.total > 0 && result.passed < result.total;
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

function isNotApplicable(ws, level) {
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
  process.stdout.write('Coverage cell order: lines | statements / branches | functions.\n');
  process.stdout.write('Coverage column uses coverage/coverage-final.json; level cells use level-specific scratch coverage when present.\n');
  process.stdout.write("'   ' = configured meaningless; ' - ' = no package script/config; ' 0 ' = test exists but has no current artifact.\n");
  process.stdout.write('NO COUNTS = coverage exists but no pass/all artifact; FAIL = current artifact did not pass all tests.\n');
}

function renderCell(cell) {
  if (!cell) return colorize(' - ', 'dim');
  if (cell.state === 'not-applicable') return colorize('   ', 'dim');
  if (cell.state === 'no-tests') return colorize(' - ', 'dim');
  if (cell.state === 'not-run') return colorize(' 0 ', 'yellow');
  if (cell.state === 'coverage') return renderCoverage(cell.coverage);

  const result = renderStatefulResult(cell);
  const coverage = renderCoverage(cell.coverage);
  if (compact) {
    return [result, coverage].filter((part) => part && part !== '—').join(' ');
  }
  return [result, coverage].filter((part) => part && part !== '—').join('\n');
}

function renderStatefulResult(cell) {
  if (cell.state === 'no-counts') return colorize('NO COUNTS', 'yellow');
  if (cell.state === 'failed') return `${colorize('FAIL', 'red')} ${renderResult(cell.result)}`;
  return renderResult(cell.result);
}

function renderResult(result) {
  if (!result) return '';
  if (result.status === 'score') return colorize(`[${result.note ?? `${result.passed}/${result.total}`}]`, 'yellow');
  if (result.passed == null || result.total == null) return `[${result.status}]`;
  const text = `[${result.passed}/${result.total}]`;
  if (result.total === 0) return text;
  return colorize(text, result.passed === result.total ? 'green' : 'red');
}

function renderCoverage(coverage) {
  if (!coverage) return '—';
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
  return stripAnsi(value).length;
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
