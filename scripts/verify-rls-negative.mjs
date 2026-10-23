#!/usr/bin/env node
import { verifyRlsNegative } from '../packages/cli/engines/rls-negative.mjs';

// The static rules ship in @stynx-nyx/cli (`stynx verify-rls-negative --json --ddl`, SM-07);
// this script adds the repository's runtime-negative specs and evidence manifest.
const { failures, tables } = verifyRlsNegative({
  root: process.cwd(),
  ddlRoots: ['database/ddl', 'database/migrations'],
  runtimeDir: 'test/db/runtime',
  runtimeEvidence: [
    ['auth cross-tenant insert rejection', /rejects cross-tenant tenancy inserts/iu],
    ['auth cross-tenant update hiding', /hides cross-tenant updates/iu],
    ['audit cross-tenant insert rejection', /rejects inserts for another tenant/iu],
    [
      'storage tenant mismatch rejection',
      /rejects storage file inserts when the provided tenant mismatches/iu,
    ],
    ['storage tenant scoped read isolation', /sees only the current tenant files/iu],
  ],
  coveragePath: 'docs/framework/contracts/tenant-isolation-coverage.json',
  coverageRequired: true,
});

if (failures.length > 0) {
  console.error('[rls-negative] failed');
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log(`[rls-negative] OK: ${tables.length} tenant-scoped tables checked`);
