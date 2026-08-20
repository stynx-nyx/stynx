#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverMutationRoster } from './lib/mutation-roster.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootFlagIndex = process.argv.indexOf('--root');
const repoRoot =
  rootFlagIndex === -1 ? resolve(scriptDir, '..') : resolve(process.argv[rootFlagIndex + 1] ?? '');
const { roster, failures } = discoverMutationRoster(repoRoot);

if (failures.length > 0) {
  console.error('[mutation-roster] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ count: roster.length, packages: roster })}\n`);
} else {
  console.log(`[mutation-roster] OK: ${roster.length} configured packages are executable`);
  for (const entry of roster) console.log(`- ${entry.packageName}: ${entry.config}`);
}
