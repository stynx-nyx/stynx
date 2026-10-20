#!/usr/bin/env node
import { verifyOpenApiContract } from '../packages/cli/engines/openapi-contract.mjs';

// The engine ships in @stynx-nyx/cli (`stynx verify-openapi-contract --json`, SM-07).
const { failures, paths } = verifyOpenApiContract({ root: process.cwd() });

if (failures.length > 0) {
  console.error('[openapi:contract] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[openapi:contract] OK: ${paths} paths`);
