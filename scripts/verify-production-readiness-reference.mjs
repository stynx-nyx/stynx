#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const reference = readFileSync(
  resolve(repoRoot, 'docs/stynx/production-grade-private-regulated.md'),
  'utf8',
);
const evidence = readFileSync(
  resolve(repoRoot, 'docs/stynx/production-readiness-evidence.md'),
  'utf8',
);
const operational = readFileSync(resolve(repoRoot, 'docs/stynx/operational-readiness.md'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const failures = [];
const normalizedReference = reference.replace(/\s+/gu, ' ');

const requiredAgents = [
  'CI Proof Agent',
  'RLS Runtime Agent',
  'Frontend Browser Agent',
  'Release Provenance Agent',
  'Operational Rehearsal Agent',
  'Observability/Error Taxonomy Agent',
  'Security Hardening Agent',
];
const requiredHumanActions = [
  'Registry/provenance setup',
  'Remote CI permission',
  'Adopter rehearsal target',
  'Auth/object-store/DB staging resources',
  'Product scope decision',
  'Security/legal reviewer',
  'Release approval',
];
const requiredCommands = [
  'pnpm audit --prod',
  'pnpm api:coverage',
  'pnpm api:contract',
  'pnpm sdk:route-smoke',
  'pnpm api:baselines',
  'pnpm release:consumer-fixtures',
  'pnpm check:rls-negative',
  'pnpm frontend:production-smoke',
  'pnpm frontend:a11y-gate',
  'pnpm release:provenance',
  'pnpm security:release',
  'pnpm lint',
  'pnpm typecheck',
];

if (!normalizedReference.includes('private regulated deployment')) {
  failures.push('production-grade reference must define production-grade as private regulated deployment');
}
for (const agent of requiredAgents) {
  if (!reference.includes(agent)) failures.push(`production-grade reference missing ${agent}`);
}
for (const action of requiredHumanActions) {
  if (!reference.includes(action)) failures.push(`production-grade reference missing ${action}`);
}
for (const command of requiredCommands) {
  if (!evidence.includes(command) && !operational.includes(command)) {
    failures.push(`readiness evidence or operations doc missing ${command}`);
  }
}
for (const scriptName of [
  'frontend:a11y-gate',
  'production:readiness-reference',
  'release:provenance',
]) {
  if (!packageJson.scripts?.[scriptName]) failures.push(`package.json missing ${scriptName}`);
}

if (failures.length > 0) {
  console.error('[production-readiness-reference] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[production-readiness-reference] OK: production-grade reference is persisted');
