#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/release.yml'), 'utf8');
const publishScript = readFileSync(resolve(repoRoot, 'scripts/changesets-publish-ci.mjs'), 'utf8');
const securityPolicy = readFileSync(
  resolve(repoRoot, 'docs/meta/security/security-release-policy.md'),
  'utf8',
);
const readinessReference = readFileSync(
  resolve(repoRoot, 'docs/adopters/stynx/production-grade-private-regulated.md'),
  'utf8',
);
const failures = [];

requireText(workflow, /id-token:\s*write/u, 'release workflow must grant OIDC id-token: write');
requireText(workflow, /packages:\s*write/u, 'release workflow must grant packages: write');
requireText(
  workflow,
  /NPM_CONFIG_PROVENANCE:\s*['"]?true['"]?/u,
  'release workflow must enable npm provenance',
);
requireText(
  publishScript,
  /NPM_CONFIG_PROVENANCE:\s*['"]true['"]/u,
  'changesets publish script must force npm provenance',
);
requireText(
  securityPolicy,
  /Package publication must use npm provenance/u,
  'security release policy must require package provenance',
);
requireText(
  readinessReference,
  /Registry\/provenance setup/u,
  'private regulated readiness reference must list registry/provenance human action',
);

if (failures.length > 0) {
  console.error('[release-provenance] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[release-provenance] OK: release provenance controls are wired');

function requireText(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message);
}
