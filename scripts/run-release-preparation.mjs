#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyReleaseContext,
  releaseContextConstants,
  ReleaseContextError,
} from './lib/release-context.mjs';
import { discoverMutationRoster } from './lib/mutation-roster.mjs';
import { collectPublicPackages } from './lib/release-version-policy.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(code, message) {
  console.error(`[release-preparation] ${code}: ${message}`);
  process.exit(1);
}

function run(executable, args, { capture = false } = {}) {
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    shell: false,
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    const detail = result.error?.message ?? result.signal ?? `exit ${result.status}`;
    fail('RELEASE_PREPARATION_COMMAND', `${executable} ${args.join(' ')} failed (${detail})`);
  }
  return String(result.stdout ?? '').trim();
}

function git(args) {
  return run('git', ['-C', repoRoot, ...args], { capture: true });
}

function parseChanges(baseCommit, headCommit) {
  const output = git(['diff', '--name-status', '--no-renames', baseCommit, headCommit]);
  if (output === '') return [];
  return output.split('\n').map((line) => {
    const [status, path, extra] = line.split('\t');
    if (!['A', 'M', 'D'].includes(status) || !path || extra !== undefined) {
      fail('RELEASE_CONTEXT_DIFF_FORMAT', 'candidate contains an unsupported diff entry');
    }
    return { status, path };
  });
}

function readGitJson(revision, path) {
  return JSON.parse(git(['show', `${revision}:${path}`]));
}

function candidateHead(baseCommit) {
  const [checkoutCommit, ...parents] = git(['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ');
  if (parents.length === 2 && parents[0] === baseCommit) {
    return parents[1];
  }
  return checkoutCommit;
}

function rootManifestFollowUpValid(versionCommit, rebaseline) {
  const before = readGitJson(versionCommit, 'package.json');
  const after = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
  const expected = structuredClone(before);
  expected.scripts['ci:stynx:release'] = releaseContextConstants.releasePreparationCommand;
  expected.scripts['release:status'] = releaseContextConstants.releaseStatusCommand;
  if (rebaseline) {
    expected.version = releaseContextConstants.unifiedRebaselineVersion;
    expected.scripts['version-packages'] = releaseContextConstants.versionPackagesCommand;
  }
  return JSON.stringify(expected) === JSON.stringify(after);
}

function versionRebaselineValid(baseCommit, versionCommit, changes) {
  if (changes.some(({ status, path }) => status === 'D' && /^\.changeset\//u.test(path))) {
    return false;
  }
  const changedManifests = changes
    .filter(({ status, path }) => status === 'M' && path.endsWith('/package.json'))
    .map(({ path }) => path)
    .sort();
  const expectedManifests = collectPublicPackages(repoRoot)
    .map(({ manifestPath }) => relative(repoRoot, manifestPath))
    .sort();
  if (JSON.stringify(changedManifests) !== JSON.stringify(expectedManifests)) return false;

  const target = releaseContextConstants.unifiedRebaselineVersion;
  const beforeVersions = expectedManifests.map((path) => readGitJson(baseCommit, path).version);
  return (
    beforeVersions.some((version) => version !== target) &&
    expectedManifests.every((path) => readGitJson(versionCommit, path).version === target)
  );
}

function prAPreparation(baseCommit, headCommit) {
  const campaignPolicy = readGitJson(headCommit, 'law/policy/release-campaign-1.1.1.json');
  if (git(['rev-parse', `${baseCommit}^{tree}`]) !== campaignPolicy?.baseline?.tree) {
    return undefined;
  }

  const rootManifest = readGitJson(headCommit, 'package.json');
  const packageVersions = collectPublicPackages(repoRoot).map(({ manifestPath }) => {
    const manifest = readGitJson(headCommit, relative(repoRoot, manifestPath));
    return { name: manifest.name, version: manifest.version };
  });
  const { roster: mutationRoster, failures: mutationFailures } = discoverMutationRoster(repoRoot);
  if (mutationFailures.length > 0) return undefined;

  return {
    campaignPolicy,
    rootVersion: rootManifest.version,
    packageVersions,
    mutationPackageNames: mutationRoster.map(({ packageName }) => packageName).sort(),
    changes: parseChanges(baseCommit, headCommit),
  };
}

function releaseContext() {
  const baseCommit = git(['rev-parse', 'origin/main']);
  // pull_request workflows are checked out at GitHub's synthetic merge commit.
  // When its first parent is the exact base, classify the candidate second
  // parent rather than mistaking the merge wrapper for an ordinary change.
  const headCommit = candidateHead(baseCommit);
  const commitShas = git([
    'rev-list',
    '--first-parent',
    '--reverse',
    `${baseCommit}..${headCommit}`,
  ]);
  const commits =
    commitShas === ''
      ? []
      : commitShas.split('\n').map((sha) => ({
          sha,
          subject: git(['show', '-s', '--format=%s', sha]),
        }));
  const marker = commits.find(
    (commit) => commit.subject === releaseContextConstants.versionCommitSubject,
  );
  const versionChanges = marker ? parseChanges(baseCommit, marker.sha) : [];
  const rebaseline = marker
    ? versionRebaselineValid(baseCommit, marker.sha, versionChanges)
    : false;

  return classifyReleaseContext({
    baseCommit,
    headCommit,
    commits,
    versionParent: marker ? git(['rev-parse', `${marker.sha}^`]) : null,
    versionChanges,
    followUpChanges: marker ? parseChanges(marker.sha, headCommit) : [],
    rootManifestFollowUpValid: marker ? rootManifestFollowUpValid(marker.sha, rebaseline) : false,
    versionRebaselineValid: rebaseline,
    prAPreparation: marker ? undefined : prAPreparation(baseCommit, headCommit),
  });
}

function prepareReleaseStatus() {
  const context = releaseContext();
  if (context.kind === 'ordinary') {
    run('pnpm', [
      'exec',
      'changeset',
      'status',
      '--since',
      'origin/main',
      '--output',
      '.changeset/status.json',
    ]);
    return;
  }

  const statusPath = resolve(repoRoot, '.changeset/status.json');
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, `${JSON.stringify({ changesets: [], releases: [] }, null, 2)}\n`);
  if (context.kind === 'pr-a-preparation') {
    console.log(
      `[release-preparation] ${context.policyId} PR A is non-promoting: ` +
        `${context.packageCount}/${context.mutationCount}/${context.firstPublicationCount}; ` +
        `version projection ${context.versionProjection}`,
    );
  } else {
    console.log(
      `[release-preparation] release status is not applicable to version candidate ${context.versionCommit}`,
    );
  }
}

if (process.argv.includes('--release-status')) {
  try {
    prepareReleaseStatus();
    process.exit(0);
  } catch (error) {
    if (error instanceof ReleaseContextError) fail(error.code, error.message);
    throw error;
  }
}

for (const command of [
  'security:release',
  'release:provenance',
  'release:policy',
  'api:baselines',
  'release:consumer-fixtures',
]) {
  run('pnpm', ['run', command]);
}

try {
  const context = releaseContext();
  if (context.kind === 'ordinary') {
    run('pnpm', ['run', 'release:drafts']);
  } else {
    const source = context.rebaseline
      ? `one-time ${releaseContextConstants.unifiedRebaselineVersion} unified rebaseline`
      : `${context.changesetCount} consumed changesets`;
    console.log(
      `[release-preparation] validated version candidate ${context.versionCommit}: ` +
        `${context.packageCount} packages, ${source}; ` +
        'release draft generation is not applicable',
    );
  }
} catch (error) {
  if (error instanceof ReleaseContextError) fail(error.code, error.message);
  throw error;
}
