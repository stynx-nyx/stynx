#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const candidate = git(['rev-parse', 'HEAD']);
const tree = git(['rev-parse', 'HEAD^{tree}']);
const failures = [];

if (!/^[0-9a-f]{40}$/u.test(candidate) || !/^[0-9a-f]{40}$/u.test(tree)) {
  failures.push('candidate or tree identity is malformed');
}
if (git(['status', '--porcelain']) !== '') failures.push('candidate worktree is not clean');

const repository = process.env.GITHUB_REPOSITORY || repositoryFromOrigin();
const checks = api(`repos/${repository}/commits/${candidate}/check-runs?per_page=100`);
const runs = Array.isArray(checks?.check_runs) ? checks.check_runs : [];
const requiredChecks = new Map([
  ['verified-local-rc', 'trusted local RC'],
  ['k6', 'hardening scenario=all'],
]);
for (const [required, label] of requiredChecks) {
  const matching = runs.filter((run) => run.name === required);
  const successful = matching.filter(
    (run) =>
      run.status === 'completed' && run.conclusion === 'success' && run.head_sha === candidate,
  );
  if (successful.length !== 1) {
    failures.push(`${label} evidence is missing, stale, failed, duplicated, or foreign-tree`);
  }
}

const localRc = runs.find((run) => run.name === 'verified-local-rc' && run.head_sha === candidate);
if (localRc && !String(localRc.output?.summary ?? '').includes(tree)) {
  failures.push('verified-local-rc evidence does not name the exact candidate tree');
}

const result = { ok: failures.length === 0, candidate, tree, failures };
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.ok) process.exitCode = 1;

function repositoryFromOrigin() {
  const origin = git(['remote', 'get-url', 'origin']);
  const match = /github\.com(?::|\/)([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(origin);
  if (!match) throw new Error('origin is not a supported GitHub repository URL');
  return `${match[1]}/${match[2]}`;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
  return result.stdout.trim();
}

function api(path) {
  const result = spawnSync('gh', ['api', path], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`campaign evidence observation failed for ${path}`);
  }
  return JSON.parse(result.stdout);
}
