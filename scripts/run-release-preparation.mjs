#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyReleaseContext,
  isFinalVersionedCandidate,
  isSecondStablePatchVersionedCandidate,
  isStablePatchVersionedCandidate,
  isVersionedPreModeCandidate,
  releaseContextConstants,
  ReleaseContextError,
} from './lib/release-context.mjs';
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
  const expectedManifests = collectPublicPackages(repoRoot)
    .map(({ manifestPath }) => relative(repoRoot, manifestPath))
    .sort();
  const expectedManifestSet = new Set(expectedManifests);
  const changedManifests = changes
    .filter(({ status, path }) => status === 'M' && expectedManifestSet.has(path))
    .map(({ path }) => path)
    .sort();
  if (JSON.stringify(changedManifests) !== JSON.stringify(expectedManifests)) return false;

  const target = releaseContextConstants.unifiedRebaselineVersion;
  const beforeVersions = expectedManifests.map((path) => readGitJson(baseCommit, path).version);
  return (
    beforeVersions.some((version) => version !== target) &&
    expectedManifests.every((path) => readGitJson(versionCommit, path).version === target)
  );
}

function versionedPreModeContext(baseCommit, headCommit, commits) {
  const prePath = resolve(repoRoot, '.changeset/pre.json');
  if (!existsSync(prePath)) return null;
  const markerPattern = /^chore\(repo\): version (?:first )?(\d+\.\d+\.\d+) release candidate$/u;
  const versionCommits = commits.filter(({ subject }) => markerPattern.test(subject));
  if (versionCommits.length !== 1) return null;

  const publicPackages = collectPublicPackages(repoRoot);
  const packageStates = publicPackages.map(({ name, manifestPath }) => {
    const path = relative(repoRoot, manifestPath);
    return {
      name,
      manifestPath: path,
      baseVersion: readGitJson(baseCommit, path).version,
      candidateVersion: JSON.parse(readFileSync(manifestPath, 'utf8')).version,
    };
  });
  const changedManifestPaths = parseChanges(baseCommit, headCommit)
    .filter(
      ({ status, path }) =>
        status === 'M' && /^(?:packages|packages-web)\/[^/]+\/package\.json$/u.test(path),
    )
    .map(({ path }) => path);
  const preState = JSON.parse(readFileSync(prePath, 'utf8'));
  const baseRootVersion = readGitJson(baseCommit, 'package.json').version;
  const basePreState = /-rc\.\d+$/u.test(baseRootVersion)
    ? readGitJson(baseCommit, '.changeset/pre.json')
    : null;
  const changesetIdsOnDisk = readdirSync(resolve(repoRoot, '.changeset'))
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .map((name) => name.slice(0, -3));
  if (
    !isVersionedPreModeCandidate({
      baseRootVersion,
      candidateRootVersion: JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
        .version,
      versionCommitVersion: markerPattern.exec(versionCommits[0].subject)[1],
      packageStates,
      changedManifestPaths,
      changesetIdsOnDisk,
      followUpChanges: parseChanges(versionCommits[0].sha, headCommit),
      basePreState,
      preState,
    })
  )
    return null;

  return {
    kind: 'versioned-pre-mode',
    baseCommit,
    headCommit,
    versionCommit: versionCommits[0].sha,
    packageCount: packageStates.length,
    changesetCount: preState.changesets.length,
    rebaseline: false,
  };
}

function finalVersionedContext(baseCommit, headCommit, commits) {
  const markerSubject = releaseContextConstants.finalVersionCommitSubject;
  const markers = commits.filter(({ subject }) => subject === markerSubject);
  if (markers.length === 0) return null;
  if (markers.length !== 1) {
    throw new ReleaseContextError(
      'RELEASE_CONTEXT_AMBIGUOUS',
      'candidate has multiple final version markers',
    );
  }

  const marker = markers[0];
  const markerParent = git(['rev-parse', `${marker.sha}^`]);
  const markerChanges = parseChanges(markerParent, marker.sha);
  const parentChangesets = git(['ls-tree', '-r', '--name-only', markerParent, '.changeset'])
    .split('\n')
    .filter((path) => /^\.changeset\/[^/]+\.md$/u.test(path) && path !== '.changeset/README.md');
  const deletedChangesets = markerChanges
    .filter(({ status, path }) => status === 'D' && /^\.changeset\/[^/]+\.md$/u.test(path))
    .map(({ path }) => path);
  if (
    parentChangesets.length === 0 ||
    JSON.stringify([...parentChangesets].sort()) !== JSON.stringify([...deletedChangesets].sort())
  ) {
    throw new ReleaseContextError(
      'RELEASE_CONTEXT_CHANGESETS',
      'final marker must consume exactly every pending changeset from its parent',
    );
  }

  const packageStates = collectPublicPackages(repoRoot).map(({ name, manifestPath }) => {
    const path = relative(repoRoot, manifestPath);
    return {
      name,
      manifestPath: path,
      baseVersion: readGitJson(baseCommit, path).version,
      candidateVersion: readGitJson(headCommit, path).version,
    };
  });
  const basePreState = readGitJson(baseCommit, '.changeset/pre.json');
  const markerParentPreState = readGitJson(markerParent, '.changeset/pre.json');
  const headFiles = git(['ls-tree', '-r', '--name-only', headCommit, '.changeset']).split('\n');
  const changesetIdsOnDisk = headFiles
    .filter((path) => /^\.changeset\/[^/]+\.md$/u.test(path) && path !== '.changeset/README.md')
    .map((path) => path.slice('.changeset/'.length, -3));
  const preState = headFiles.includes('.changeset/pre.json')
    ? readGitJson(headCommit, '.changeset/pre.json')
    : null;
  const markerIndex = commits.findIndex(({ sha }) => sha === marker.sha);
  const followUpChanges = commits
    .slice(markerIndex + 1)
    .flatMap(({ sha }) => parseChanges(git(['rev-parse', `${sha}^`]), sha));
  if (
    !isFinalVersionedCandidate({
      baseRootVersion: readGitJson(baseCommit, 'package.json').version,
      basePreState,
      markerCommits: commits,
      markerParentPreState,
      markerChanges,
      followUpChanges,
      candidateRootVersion: readGitJson(headCommit, 'package.json').version,
      packageStates,
      changesetIdsOnDisk,
      preState,
    })
  ) {
    throw new ReleaseContextError(
      'RELEASE_CONTEXT_FINAL_INVALID',
      'final version candidate does not match its exact marker and follow-up contract',
    );
  }

  return {
    kind: 'final-versioned',
    baseCommit,
    headCommit,
    versionCommit: marker.sha,
    packageCount: packageStates.length,
    changesetCount: deletedChangesets.length,
    rebaseline: false,
  };
}

function stablePatchVersionedContext(
  baseCommit,
  headCommit,
  commits,
  { markerSubject, predicate },
) {
  const markers = commits.filter(({ subject }) => subject === markerSubject);
  if (markers.length === 0) return null;
  if (markers.length !== 1) {
    throw new ReleaseContextError(
      'RELEASE_CONTEXT_AMBIGUOUS',
      'candidate has multiple stable patch markers',
    );
  }

  const marker = markers[0];
  const markerParent = git(['rev-parse', `${marker.sha}^`]);
  const markerChanges = parseChanges(markerParent, marker.sha);
  const parentFiles = git(['ls-tree', '-r', '--name-only', markerParent, '.changeset']).split('\n');
  const markerParentChangesets = parentFiles.filter(
    (path) => /^\.changeset\/[^/]+\.md$/u.test(path) && path !== '.changeset/README.md',
  );
  const headFiles = git(['ls-tree', '-r', '--name-only', headCommit, '.changeset']).split('\n');
  const changesetIdsOnDisk = headFiles
    .filter((path) => /^\.changeset\/[^/]+\.md$/u.test(path) && path !== '.changeset/README.md')
    .map((path) => path.slice('.changeset/'.length, -3));
  const packageStates = collectPublicPackages(repoRoot).map(({ name, manifestPath }) => {
    const path = relative(repoRoot, manifestPath);
    return {
      name,
      manifestPath: path,
      parentVersion: readGitJson(markerParent, path).version,
      candidateVersion: readGitJson(headCommit, path).version,
    };
  });
  const markerIndex = commits.findIndex(({ sha }) => sha === marker.sha);
  const followUpChanges = commits
    .slice(markerIndex + 1)
    .flatMap(({ sha }) => parseChanges(git(['rev-parse', `${sha}^`]), sha));
  const input = {
    baseRootVersion: readGitJson(baseCommit, 'package.json').version,
    markerParentRootVersion: readGitJson(markerParent, 'package.json').version,
    candidateRootVersion: readGitJson(headCommit, 'package.json').version,
    markerCommits: commits,
    markerChanges,
    markerParentChangesets,
    followUpChanges,
    rootManifestMatchesMarker:
      JSON.stringify(readGitJson(marker.sha, 'package.json')) ===
      JSON.stringify(readGitJson(headCommit, 'package.json')),
    packageStates,
    changesetIdsOnDisk,
    preState: headFiles.includes('.changeset/pre.json')
      ? readGitJson(headCommit, '.changeset/pre.json')
      : null,
    markerParentPreState: parentFiles.includes('.changeset/pre.json')
      ? readGitJson(markerParent, '.changeset/pre.json')
      : null,
  };
  if (!predicate(input)) {
    throw new ReleaseContextError(
      'RELEASE_CONTEXT_PATCH_INVALID',
      'stable patch candidate does not match its consumed changeset and fixed-group contract',
    );
  }

  return {
    kind: 'stable-patch-versioned',
    baseCommit,
    headCommit,
    versionCommit: marker.sha,
    packageCount: packageStates.length,
    changesetCount: markerParentChangesets.length,
    rebaseline: false,
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

  const classified = classifyReleaseContext({
    baseCommit,
    headCommit,
    commits,
    versionParent: marker ? git(['rev-parse', `${marker.sha}^`]) : null,
    versionChanges,
    followUpChanges: marker ? parseChanges(marker.sha, headCommit) : [],
    rootManifestFollowUpValid: marker ? rootManifestFollowUpValid(marker.sha, rebaseline) : false,
    versionRebaselineValid: rebaseline,
  });
  return classified.kind === 'ordinary'
    ? (versionedPreModeContext(baseCommit, headCommit, commits) ??
        finalVersionedContext(baseCommit, headCommit, commits) ??
        stablePatchVersionedContext(baseCommit, headCommit, commits, {
          markerSubject: releaseContextConstants.secondStablePatchVersionCommitSubject,
          predicate: isSecondStablePatchVersionedCandidate,
        }) ??
        stablePatchVersionedContext(baseCommit, headCommit, commits, {
          markerSubject: releaseContextConstants.stablePatchVersionCommitSubject,
          predicate: isStablePatchVersionedCandidate,
        }) ??
        classified)
    : classified;
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
