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
  /registry-url:\s*https:\/\/npm\.pkg\.github\.com/u,
  'release workflow must target GitHub Packages',
);
requireText(
  workflow,
  /NPM_CONFIG_PROVENANCE:\s*['"]false['"]/u,
  'release workflow must explicitly disable unsupported npm provenance',
);
requireText(
  publishScript,
  /NPM_CONFIG_PROVENANCE:\s*['"]false['"]/u,
  'changesets publish script must force unsupported npm provenance off',
);
requireText(
  securityPolicy,
  /restricted packages to GitHub Packages/u,
  'security release policy must identify the restricted GitHub Packages boundary',
);
requireText(
  securityPolicy,
  /NPM_CONFIG_PROVENANCE=false/u,
  'security release policy must record the explicit provenance setting',
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
