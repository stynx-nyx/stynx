#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-n');
const help = args.includes('--help') || args.includes('-h');
const unknownArgs = args.filter((arg) => !['--dry-run', '-n', '--help', '-h'].includes(arg));

if (help) {
  console.log(`Usage: pnpm clean [-- --dry-run]

Removes installable and generated workspace artifacts while preserving tracked files.

Options:
  -n, --dry-run  Print what would be removed without deleting it.
  -h, --help     Show this help.
`);
  process.exit(0);
}

if (unknownArgs.length > 0) {
  console.error(`[clean][fail] Unknown arguments: ${unknownArgs.join(', ')}`);
  process.exit(2);
}

function slashPath(path) {
  return path.split(sep).join('/');
}

function cleanRelativePath(path) {
  return slashPath(path).replace(/^\.\//, '').replace(/\/+$/, '');
}

function assertInsideWorkspace(path) {
  const relativePath = relative(rootDir, path);
  if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) {
    return;
  }

  throw new Error(`refusing to clean path outside workspace: ${path}`);
}

function readTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || 'git ls-files failed').trim();
    throw new Error(`cannot determine tracked files: ${message}`);
  }

  return result.stdout.split('\0').filter(Boolean).map(cleanRelativePath);
}

const trackedFiles = readTrackedFiles();
const trackedFileSet = new Set(trackedFiles);
const candidates = new Set();
const planned = [];
const plannedSet = new Set();
const skipped = [];

const exactTargets = [
  '.agent',
  '.claude',
  '.release',
  '.tmp-tsconfig-smoke',
  '.toolchain',
  '.turbo',
  '.pnpm-store',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'lcov-report',
  'reports',
  'test-results',
  '.changeset/status.json',
  'backend/build',
  'backend/dist',
  'backend/node_modules',
  'docs/.docusaurus',
  'docs/.generated',
  'docs/.turbo',
  'docs/build',
  'docs/dist',
  'docs/node_modules',
  'docs/work/diag',
  'docs/work/inv',
  'docs/work/plan',
  'frontend/.angular/cache',
  'frontend/build',
  'frontend/dist',
  'frontend/node_modules',
  'infra/cdk/build',
  'infra/cdk/cdk.out',
  'infra/cdk/coverage',
  'infra/cdk/dist',
  'infra/cdk/node_modules',
  'packages-web/sdk/src/generated',
  'test/perf/k6/baseline',
  'test/perf/k6/results',
  'tests/e2e/.summary.txt',
];

const generatedDirectoryNames = new Set([
  '.angular',
  '.cache',
  '.docusaurus',
  '.generated',
  '.nyc_output',
  '.playwright',
  '.pnpm-store',
  '.release',
  '.terraform',
  '.tmp-tsconfig-smoke',
  '.toolchain',
  '.turbo',
  'build',
  'cdk.out',
  'coverage',
  'dist',
  'lcov-report',
  'node_modules',
  'playwright-report',
  'reports',
  'test-results',
  'tmp',
]);

function isTracked(relativePath) {
  return trackedFileSet.has(cleanRelativePath(relativePath));
}

function containsTrackedFile(relativePath) {
  const cleanPath = cleanRelativePath(relativePath);
  const prefix = cleanPath === '' ? '' : `${cleanPath}/`;
  return trackedFiles.some(
    (trackedFile) => trackedFile === cleanPath || trackedFile.startsWith(prefix),
  );
}

function shouldRemoveDirectory(entry, relativePath) {
  const cleanPath = cleanRelativePath(relativePath);
  return (
    generatedDirectoryNames.has(entry) ||
    entry.endsWith('.stryker-tmp') ||
    cleanPath.endsWith('/src/generated')
  );
}

function shouldRemoveFile(entry, relativePath) {
  const cleanPath = cleanRelativePath(relativePath);
  return (
    cleanPath === '.changeset/status.json' ||
    cleanPath === 'tests/e2e/.summary.txt' ||
    entry === '.eslintcache' ||
    entry === '.stylelintcache' ||
    entry === 'junit.xml' ||
    entry === 'tsconfig.tsbuildinfo' ||
    entry.endsWith('.log') ||
    entry.endsWith('.tgz') ||
    entry.endsWith('.tmp') ||
    entry.endsWith('.tsbuildinfo') ||
    /^npm-debug\.log/.test(entry) ||
    /^pnpm-debug\.log/.test(entry) ||
    /^yarn-debug\.log/.test(entry) ||
    /^yarn-error\.log/.test(entry)
  );
}

function addCandidate(relativePath) {
  const cleanPath = cleanRelativePath(relativePath);
  if (cleanPath === '' || cleanPath === '.git') {
    return;
  }
  candidates.add(cleanPath);
}

function walkForCandidates(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    const relativePath = cleanRelativePath(relative(rootDir, absolutePath));

    if (relativePath === '.git' || relativePath.startsWith('.git/')) {
      continue;
    }

    if (entry.isDirectory()) {
      if (shouldRemoveDirectory(entry.name, relativePath)) {
        addCandidate(relativePath);
        continue;
      }
      walkForCandidates(absolutePath);
      continue;
    }

    if (entry.isFile() || entry.isSymbolicLink()) {
      if (shouldRemoveFile(entry.name, relativePath)) {
        addCandidate(relativePath);
      }
    }
  }
}

function recordRemoval(relativePath) {
  if (plannedSet.has(relativePath)) {
    return false;
  }
  plannedSet.add(relativePath);
  planned.push(relativePath);
  const prefix = dryRun ? '[clean][dry-run]' : '[clean]';
  console.log(`${prefix} remove ${relativePath}`);
  return true;
}

function removePath(absolutePath, relativePath) {
  const shouldRemove = recordRemoval(relativePath);
  if (!dryRun) {
    if (!shouldRemove) {
      return;
    }
    rmSync(absolutePath, { force: true, recursive: true });
  }
}

function cleanMixedDirectory(absoluteDirectory, relativeDirectory) {
  let entries;
  try {
    entries = readdirSync(absoluteDirectory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolutePath = join(absoluteDirectory, entry.name);
    const relativePath = cleanRelativePath(join(relativeDirectory, entry.name));

    if (isTracked(relativePath)) {
      skipped.push(`${relativePath} (tracked)`);
      continue;
    }

    if (entry.isDirectory() && containsTrackedFile(relativePath)) {
      cleanMixedDirectory(absolutePath, relativePath);
      continue;
    }

    removePath(absolutePath, relativePath);
  }
}

function cleanCandidate(relativePath) {
  const cleanPath = cleanRelativePath(relativePath);
  const absolutePath = resolve(rootDir, cleanPath);
  assertInsideWorkspace(absolutePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  if (isTracked(cleanPath)) {
    skipped.push(`${cleanPath} (tracked)`);
    return;
  }

  const stat = lstatSync(absolutePath);
  if (stat.isDirectory() && containsTrackedFile(cleanPath)) {
    cleanMixedDirectory(absolutePath, cleanPath);
    return;
  }

  removePath(absolutePath, cleanPath);
}

for (const target of exactTargets) {
  addCandidate(target);
}
walkForCandidates(rootDir);

const orderedCandidates = [...candidates].sort((left, right) => {
  const leftDepth = left.split('/').length;
  const rightDepth = right.split('/').length;
  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }
  return left.localeCompare(right);
});

try {
  for (const candidate of orderedCandidates) {
    cleanCandidate(candidate);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[clean][fail] ${message}`);
  process.exit(1);
}

const suffix = dryRun ? 'would be removed' : 'removed';
console.log(`[clean][ok] ${planned.length} path${planned.length === 1 ? '' : 's'} ${suffix}.`);
if (skipped.length > 0) {
  console.log(
    `[clean][ok] ${skipped.length} tracked path${skipped.length === 1 ? '' : 's'} preserved.`,
  );
}
