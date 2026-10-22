#!/usr/bin/env node
// Coverage for packages tested with node:test (the SM-21 tool packages).
// Runs the given spec files with Node's built-in coverage and writes the
// istanbul-shaped coverage/coverage-summary.json that run-coverage.mjs reads.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const metrics = ['branches', 'functions', 'lines', 'statements'];
const packageDir = process.cwd();
const coverageDir = resolve(packageDir, 'coverage');
const lcovPath = resolve(coverageDir, 'lcov.info');
const specs = process.argv.slice(2);
if (specs.length === 0) throw new Error('node-test-coverage requires at least one spec file');

rmSync(coverageDir, { recursive: true, force: true });
mkdirSync(coverageDir, { recursive: true });
const run = spawnSync(
  process.execPath,
  [
    '--test',
    '--experimental-test-coverage',
    '--test-coverage-exclude=**/test/**',
    '--test-coverage-exclude=**/node_modules/**',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=lcov',
    `--test-reporter-destination=${lcovPath}`,
    ...specs,
  ],
  { cwd: packageDir, stdio: 'inherit' },
);

const totals = Object.fromEntries(metrics.map((metric) => [metric, { total: 0, covered: 0 }]));
const fields = {
  LF: ['lines', 'total'],
  LH: ['lines', 'covered'],
  FNF: ['functions', 'total'],
  FNH: ['functions', 'covered'],
  BRF: ['branches', 'total'],
  BRH: ['branches', 'covered'],
};
for (const line of readFileSync(lcovPath, 'utf8').split('\n')) {
  const [key, value] = line.split(':');
  const field = fields[key];
  if (field) totals[field[0]][field[1]] += Number(value);
}
// lcov carries no statement counts; Node reports statements as lines.
totals.statements = { ...totals.lines };
const total = Object.fromEntries(
  metrics.map((metric) => {
    const { total: count, covered } = totals[metric];
    const pct = count === 0 ? 100 : Math.round((covered / count) * 10_000) / 100;
    return [metric, { total: count, covered, skipped: 0, pct }];
  }),
);
writeFileSync(
  resolve(coverageDir, 'coverage-summary.json'),
  `${JSON.stringify({ total }, null, 2)}\n`,
);
process.exit(run.status ?? 1);
