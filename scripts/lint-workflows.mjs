#!/usr/bin/env node

import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyNoRemoteMutationWorkflows } from './lib/mutation-roster.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const workflowsDir = resolve(repoRoot, '.github/workflows');
const generatedWorkflow = 'devai-main-observation.yml';
const workflows = readdirSync(workflowsDir)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort();

verifyNoRemoteMutationWorkflows(repoRoot);

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
