#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '..');
const angularTsconfigPath = resolve(repoRoot, 'tools/tsconfig/angular18.json');
const localNpmDir = resolve(repoRoot, '.release/local-npm');
const failures = [];
let checkedMaps = 0;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function walk(dir, predicate) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, predicate);
    return predicate(path) ? [path] : [];
  });
}

function hasSourcesContent(map) {
  return (
    Array.isArray(map.sourcesContent) &&
    map.sourcesContent.length === map.sources?.length &&
    map.sourcesContent.every((source) => typeof source === 'string')
  );
}

function validateMap(mapPath, sourceRoot) {
  checkedMaps += 1;
  const map = readJson(mapPath);
  if (hasSourcesContent(map)) return;

  const missing = (map.sources ?? []).filter((source) => {
    if (source.startsWith('webpack://') || source.startsWith('ng://')) return false;
    return !existsSync(resolve(sourceRoot, dirname(mapPath), map.sourceRoot ?? '', source));
  });

  if (missing.length > 0) {
    failures.push(`${mapPath}: missing sourcesContent and source files ${missing.join(', ')}`);
  }
}

function validateDistMaps() {
  const mapFiles = walk(resolve(repoRoot, 'packages-web'), (path) => path.endsWith('.js.map'));
  for (const mapPath of mapFiles) {
    validateMap(mapPath, repoRoot);
  }
}

function validateTarballMaps() {
  if (!existsSync(localNpmDir)) return;
  const tarballs = readdirSync(localNpmDir)
    .filter((name) => /^stynx-web-angular.*\.tgz$/.test(name))
    .map((name) => resolve(localNpmDir, name));

  for (const tarball of tarballs) {
    const tempDir = mkdtempSync(join(tmpdir(), 'stynx-web-sourcemaps-'));
    try {
      execFileSync('tar', ['-xzf', tarball, '-C', tempDir], { stdio: 'ignore' });
      const packageRoot = resolve(tempDir, 'package');
      const mapFiles = walk(packageRoot, (path) => path.endsWith('.js.map'));
      for (const mapPath of mapFiles) {
        const map = readJson(mapPath);
        checkedMaps += 1;
        if (!hasSourcesContent(map)) {
          failures.push(
            `${basename(tarball)}:${mapPath.slice(packageRoot.length + 1)} missing sourcesContent`,
          );
        }
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

const angularTsconfig = readJson(angularTsconfigPath);
if (angularTsconfig.compilerOptions?.inlineSources !== true) {
  failures.push('tools/tsconfig/angular18.json must set compilerOptions.inlineSources=true');
}

validateDistMaps();
validateTarballMaps();

if (failures.length > 0) {
  console.error('[web-sourcemaps] failed checks:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[web-sourcemaps] OK: ${checkedMaps} source maps checked`);
