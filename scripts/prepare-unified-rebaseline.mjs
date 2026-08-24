#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUnifiedRebaseline, unifiedRebaselineTarget } from './lib/unified-rebaseline.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args.includes('--write') ? 'write' : args.includes('--check') ? 'check' : undefined;
const targetIndex = args.indexOf('--target');
const target = targetIndex === -1 ? undefined : args[targetIndex + 1];

if (
  args.length !== 3 ||
  !mode ||
  (args.includes('--write') && args.includes('--check')) ||
  target !== unifiedRebaselineTarget ||
  targetIndex === -1 ||
  targetIndex !== args.lastIndexOf('--target')
) {
  console.error(
    `Usage: node scripts/prepare-unified-rebaseline.mjs --target ${unifiedRebaselineTarget} (--write|--check)`,
  );
  process.exit(1);
}

const changesetConfig = JSON.parse(
  readFileSync(resolve(repoRoot, '.changeset/config.json'), 'utf8'),
);

try {
  const result = runUnifiedRebaseline(repoRoot, changesetConfig, mode);
  console.log(
    `[rebaseline] OK: ${mode} verified ${result.packageCount} packages at ${unifiedRebaselineTarget}; changed files=${result.changedFiles}`,
  );
} catch (error) {
  console.error(`[rebaseline] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
