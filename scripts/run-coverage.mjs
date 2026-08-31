import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { discoverPublishablePackages } from './lib/publishable-packages.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const metrics = ['branches', 'functions', 'lines', 'statements'];
const packages = discoverPublishablePackages(repoRoot);
const results = [];
const failures = [];
const collectExisting = process.argv.includes('--collect-existing');

if (!process.argv.includes('--skip-build')) {
  const build = spawnSync('corepack', ['pnpm', 'build'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
  });
  if (build.status !== 0) throw new Error('coverage prerequisite build failed');
}

for (const entry of packages) {
  const command = entry.manifest.scripts?.['test:coverage'];
  if (typeof command !== 'string' || !/(?:vitest|jest|coverage)/u.test(command)) {
    throw new Error(`${entry.name}: missing executable test:coverage command`);
  }
  const coverageDirectories = ['coverage', 'coverage-vitest'].map((name) =>
    resolve(entry.dirPath, name),
  );
  if (!collectExisting) {
    for (const directory of coverageDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  const run = collectExisting
    ? { status: null }
    : spawnSync('corepack', ['pnpm', '--filter', entry.name, 'run', 'test:coverage'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: process.env,
        stdio: 'inherit',
      });
  const summaryPath = coverageDirectories
    .map((directory) => resolve(directory, 'coverage-summary.json'))
    .find(existsSync);
  if (!summaryPath) {
    failures.push(`${entry.name}: coverage summary is missing`);
    continue;
  }
  const total = JSON.parse(readFileSync(summaryPath, 'utf8')).total;
  if (!total) {
    failures.push(`${entry.name}: coverage total is missing`);
    continue;
  }
  if (total.lines?.total === 0) {
    failures.push(`${entry.name}: coverage population is empty`);
  }
  for (const metric of metrics) {
    if (!Number.isFinite(total[metric]?.pct)) {
      failures.push(`${entry.name}: ${metric} coverage metric is missing`);
    }
  }
  results.push({
    package: entry.name,
    commandStatus: run.status,
    ...Object.fromEntries(metrics.map((key) => [key, total[key]])),
  });
  if (run.status === null) {
    failures.push(`${entry.name}: command status not observed in collection-only mode`);
  } else if (run.status !== 0) {
    failures.push(`${entry.name}: coverage thresholds failed`);
  }
}

const outputPath = resolve(repoRoot, '.artifacts/coverage/summary.json');
mkdirSync(dirname(outputPath), { recursive: true });
if (results.length !== packages.length) {
  failures.push(`coverage census incomplete: ${results.length}/${packages.length}`);
}
writeFileSync(
  outputPath,
  `${JSON.stringify({ packageCount: packages.length, results, failures }, null, 2)}\n`,
);
if (failures.length > 0) throw new Error(`Coverage verification failed:\n${failures.join('\n')}`);
process.stdout.write(`Coverage verified for ${packages.length} publishable packages.\n`);
