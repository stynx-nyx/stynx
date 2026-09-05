#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export function compareBranchProtection(declared, live) {
  const drift = [];
  compareScalar(drift, 'enforce_admins', declared.enforce_admins, live.enforce_admins?.enabled);
  compareScalar(
    drift,
    'required_linear_history',
    declared.required_linear_history,
    live.required_linear_history?.enabled,
  );
  compareScalar(
    drift,
    'allow_force_pushes',
    declared.allow_force_pushes,
    live.allow_force_pushes?.enabled,
  );
  compareScalar(drift, 'allow_deletions', declared.allow_deletions, live.allow_deletions?.enabled);
  compareScalar(
    drift,
    'required_conversation_resolution',
    declared.required_conversation_resolution,
    live.required_conversation_resolution?.enabled,
  );

  const declaredReviews = declared.required_pull_request_reviews ?? null;
  const liveReviews = live.required_pull_request_reviews ?? null;
  if (declaredReviews === null || liveReviews === null) {
    if (JSON.stringify(declaredReviews) !== JSON.stringify(liveReviews)) {
      drift.push({
        path: 'required_pull_request_reviews',
        declared: declaredReviews,
        live: liveReviews,
      });
    }
  } else {
    for (const key of [
      'required_approving_review_count',
      'dismiss_stale_reviews',
      'require_code_owner_reviews',
    ]) {
      compareScalar(
        drift,
        `required_pull_request_reviews.${key}`,
        declaredReviews[key],
        liveReviews[key],
      );
    }
  }

  const declaredChecks = declared.required_status_checks ?? null;
  const liveChecks = live.required_status_checks ?? null;
  if (declaredChecks === null || liveChecks === null) {
    if (JSON.stringify(declaredChecks) !== JSON.stringify(liveChecks)) {
      drift.push({ path: 'required_status_checks', declared: declaredChecks, live: liveChecks });
    }
  } else {
    compareScalar(drift, 'required_status_checks.strict', declaredChecks.strict, liveChecks.strict);
    const declaredContexts = uniqueSorted(declaredChecks.contexts ?? []);
    const liveContexts = uniqueSorted(liveChecks.contexts ?? []);
    const declaredOnly = declaredContexts.filter((context) => !liveContexts.includes(context));
    const liveOnly = liveContexts.filter((context) => !declaredContexts.includes(context));
    if (declaredOnly.length > 0 || liveOnly.length > 0) {
      drift.push({
        path: 'required_status_checks.contexts',
        declaredOnly,
        liveOnly,
      });
    }
  }

  return drift;
}

export function readDeclaredBranchProtection(policyPath, branch) {
  const policy = parse(readFileSync(policyPath, 'utf8'));
  if (!policy || !Array.isArray(policy.branches)) {
    throw new Error('branch-protection policy must contain a branches array');
  }
  const matches = policy.branches.filter((entry) => entry?.name === branch);
  if (matches.length !== 1 || !matches[0].protection) {
    throw new Error(`branch-protection policy must declare ${branch} exactly once`);
  }
  return matches[0].protection;
}

function compareScalar(drift, path, declared, live) {
  if (declared !== live) drift.push({ path, declared: declared ?? null, live: live ?? null });
}

function uniqueSorted(values) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new Error('required status contexts must be an array of strings');
  }
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function repositoryFromOrigin(repoRoot) {
  const origin = command('git', ['remote', 'get-url', 'origin'], repoRoot);
  const match = /github\.com(?::|\/)([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(origin);
  if (!match) throw new Error('origin is not a supported GitHub repository URL');
  return `${match[1]}/${match[2]}`;
}

function command(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`${executable} ${args[0]} failed with exit ${String(result.status)}`);
  }
  return result.stdout.trim();
}

function parseArgs(args) {
  const parsed = { branch: 'main', json: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--') continue;
    if (args[index] === '--branch') parsed.branch = args[++index];
    else if (args[index] === '--repository') parsed.repository = args[++index];
    else if (args[index] === '--policy') parsed.policy = args[++index];
    else if (args[index] === '--json') parsed.json = true;
    else throw new Error(`unknown argument: ${args[index]}`);
  }
  if (!parsed.branch || (args.includes('--repository') && !parsed.repository)) {
    throw new Error('branch and repository arguments require values');
  }
  return parsed;
}

function main() {
  const repoRoot = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const repository =
    args.repository || process.env.GITHUB_REPOSITORY || repositoryFromOrigin(repoRoot);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
    throw new Error('repository must be an owner/repository pair');
  }
  const policyPath = resolve(repoRoot, args.policy || '.github/branch-protection.yml');
  const declared = readDeclaredBranchProtection(policyPath, args.branch);
  const live = JSON.parse(
    command(
      'gh',
      ['api', `repos/${repository}/branches/${encodeURIComponent(args.branch)}/protection`],
      repoRoot,
    ),
  );
  const drift = compareBranchProtection(declared, live);
  const rulesets = JSON.parse(
    command('gh', ['api', `repos/${repository}/rulesets?includes_parents=true`], repoRoot),
  );
  if (!Array.isArray(rulesets)) throw new Error('live ruleset response must be an array');
  // The ruleset list endpoint returns a summary without `conditions`; the
  // include patterns are only available by fetching each ruleset by id.
  // Reading them from the list alone always yields an empty pattern set and
  // reports drift against a ruleset that is present and active.
  const releaseTagRule = rulesets.some((summary) => {
    if (summary?.enforcement !== 'active' || summary?.target !== 'tag') return false;
    const ruleset =
      summary?.conditions === undefined
        ? JSON.parse(command('gh', ['api', `repos/${repository}/rulesets/${summary.id}`], repoRoot))
        : summary;
    const include = ruleset?.conditions?.ref_name?.include ?? [];
    return include.some(
      (pattern) => pattern === 'refs/tags/v*' || pattern === 'refs/tags/@stynx-nyx/*@*',
    );
  });
  if (!releaseTagRule) {
    drift.push({
      path: 'ruleset.refs/tags',
      declared: ['refs/tags/v*', 'refs/tags/@stynx-nyx/*@*'],
      live: null,
    });
  }
  const result = {
    ok: drift.length === 0,
    repository,
    branch: args.branch,
    policy: policyPath.replace(`${repoRoot}/`, ''),
    drift,
  };

  if (args.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else if (result.ok) process.stdout.write(`Branch protection matches ${result.policy}.\n`);
  else {
    process.stderr.write(`Branch protection drift detected for ${repository}:${args.branch}\n`);
    for (const entry of drift) process.stderr.write(`- ${entry.path}: ${JSON.stringify(entry)}\n`);
  }
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`branch-protection verification failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
