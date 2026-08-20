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
requireText(workflow, /candidate_sha:/u, 'release workflow must accept an exact candidate SHA');
requireText(
  workflow,
  /\^\[0-9a-f\]\{40\}\$/u,
  'release workflow must require a full lowercase candidate SHA',
);
requireText(
  workflow,
  /git rev-parse origin\/main/u,
  'release workflow must bind publication to exact origin/main',
);
requireText(
  workflow,
  /refs\/heads\/main:refs\/remotes\/origin\/main/u,
  'release workflow must refresh the exact origin/main ref before publication',
);
requireText(
  workflow,
  /OWNER_PUBLISH_OPT_IN/u,
  'release workflow must fail closed without the Owner-controlled opt-in',
);
requireText(
  workflow,
  /PUBLISH_TOKEN:\s*\$\{\{ secrets\.NPM_TOKEN \}\}/u,
  'release workflow must fail closed without the protected publication token',
);
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
forbidText(
  workflow,
  /^\s{2}NODE_AUTH_TOKEN:/mu,
  'release workflow must not expose a registry token through workflow-wide environment',
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

function forbidText(text, pattern, message) {
  if (pattern.test(text)) failures.push(message);
}
