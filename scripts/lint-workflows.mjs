#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { verifyNoRemoteMutationWorkflows } from './lib/mutation-roster.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const workflowsDir = resolve(repoRoot, '.github/workflows');
const generatedWorkflow = 'devai-main-observation.yml';
const workflows = readdirSync(workflowsDir)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort();

verifyNoRemoteMutationWorkflows(repoRoot);

// Required status checks on `main` that live in path-filtered workflows. Each
// needs a companion workflow with the exact inverse filter reporting the same
// job names, or pull requests outside those paths can never merge. The two
// path lists must stay identical and the companion must expose every job.
const pathFilteredRequiredChecks = [
  {
    filtered: 'reference-apps.yml',
    companion: 'reference-apps-not-applicable.yml',
    requiredJobs: ['reference-web-e2e'],
  },
  {
    filtered: 'release-prep.yml',
    companion: 'release-prep-not-applicable.yml',
    requiredJobs: ['package-policy', 'dependency-audit'],
  },
];
for (const pair of pathFilteredRequiredChecks) {
  verifyPathFilteredRequiredCheckCompanion(pair);
}

function verifyPathFilteredRequiredCheckCompanion({ filtered, companion, requiredJobs }) {
  const load = (name) => parseYaml(readFileSync(resolve(workflowsDir, name), 'utf8'));
  const filteredPaths = load(filtered).on?.pull_request?.paths;
  const companionWorkflow = load(companion);
  const companionIgnore = companionWorkflow.on?.pull_request?.['paths-ignore'];
  if (!Array.isArray(filteredPaths) || !Array.isArray(companionIgnore)) {
    console.error(`[workflows] ${filtered} pull_request.paths or ${companion} pull_request.paths-ignore is missing`);
    process.exit(1);
  }
  if (JSON.stringify(filteredPaths) !== JSON.stringify(companionIgnore)) {
    console.error(`[workflows] ${companion} paths-ignore must equal ${filtered} paths (same entries, same order)`);
    process.exit(1);
  }
  for (const requiredJob of requiredJobs) {
    if (companionWorkflow.jobs?.[requiredJob]?.name !== requiredJob) {
      console.error(`[workflows] ${companion} must expose a job named ${requiredJob}`);
      process.exit(1);
    }
  }
}

function runActionlint(args) {
  const result = spawnSync('github-actionlint', args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const authoredWorkflows = workflows.filter((name) => name !== generatedWorkflow);
if (authoredWorkflows.length > 0) {
  runActionlint(authoredWorkflows.map((name) => `.github/workflows/${name}`));
}

if (workflows.includes(generatedWorkflow)) {
  // DEVAI binds this package-generated workflow byte-for-byte. Its cp source
  // deliberately leaves only the final `*.json` unquoted; all other findings
  // in the generated workflow remain fail-closed.
  runActionlint([
    '-ignore',
    'SC2086:info:3:36: Double quote to prevent globbing and word splitting',
    `.github/workflows/${generatedWorkflow}`,
  ]);
}
