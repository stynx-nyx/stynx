#!/usr/bin/env node
// scripts/migrate-test-scripts-to-wrapper.mjs
//
// R1 fan-out: rewrite per-package `test` and `test:int` scripts to invoke
// scripts/run-and-record.mjs so every Vitest run lands a canonical
// .test-results/<level>.json artifact.
//
// Idempotent. Run from the workspace root. Skips packages that already use
// the wrapper or that don't have a Vitest config.
//
// Single-shot migration tool — delete after R1 fan-out is verified.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const wrapperPath = resolve(__dirname, 'run-and-record.mjs');

const dirs = [
  'packages',
  'packages-web',
  'infra',
  'reference',
  'domain',
  'test',
];

const targets = [];

import { readdirSync, statSync } from 'node:fs';

function walk(rel) {
  const dir = resolve(repoRoot, rel);
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (!statSync(p).isDirectory()) continue;
    if (entry === 'node_modules' || entry === '.stryker-tmp' || entry === 'dist') continue;
    const pkgJson = join(p, 'package.json');
    if (existsSync(pkgJson)) {
      targets.push(p);
      continue;
    }
    // one level deeper (e.g. domain/demo-bookmark/api)
    for (const sub of readdirSync(p)) {
      const subDir = join(p, sub);
      if (!statSync(subDir).isDirectory()) continue;
      if (sub === 'node_modules' || sub === 'dist') continue;
      if (existsSync(join(subDir, 'package.json'))) targets.push(subDir);
    }
  }
}
for (const d of dirs) walk(d);

let touched = 0;
let skipped = 0;
let noVitest = 0;

for (const pkgDir of targets) {
  const pkgJsonPath = join(pkgDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  if (!pkg.scripts) continue;
  const relWrapper = './' + relative(pkgDir, wrapperPath).split(sep).join('/');

  let changed = false;

  // Unit test
  if (pkg.scripts.test && /vitest run --config \.\/vitest\.config\.ts/.test(pkg.scripts.test) && !/run-and-record\.mjs/.test(pkg.scripts.test)) {
    pkg.scripts.test = `node ${relWrapper} --package ${pkg.name} --level unit --runner vitest -- vitest run --config ./vitest.config.ts`;
    changed = true;
  }
  // Integration test
  if (pkg.scripts['test:int'] && /vitest run --config \.\/vitest\.int\.config\.ts/.test(pkg.scripts['test:int']) && !/run-and-record\.mjs/.test(pkg.scripts['test:int'])) {
    pkg.scripts['test:int'] = `node ${relWrapper} --package ${pkg.name} --level integration --runner vitest -- vitest run --config ./vitest.int.config.ts`;
    changed = true;
  }

  if (!pkg.scripts.test && !pkg.scripts['test:int']) {
    noVitest += 1;
    continue;
  }

  if (changed) {
    writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    touched += 1;
    process.stderr.write(`[migrate] ${pkg.name}\n`);
  } else {
    skipped += 1;
  }
}

process.stderr.write(`\n[migrate] touched ${touched}, already-wrapped ${skipped}, no-vitest ${noVitest}\n`);
