import { isDeepStrictEqual } from 'node:util';

const fullSha = /^[0-9a-f]{40}$/u;
const versionCommitSubject = 'ci: version packages';
const unifiedRebaselineVersion = '1.2.0';
const releaseStatusCommand = 'node scripts/run-release-preparation.mjs --release-status';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const rcVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-rc\.(0|[1-9]\d*)$/u;
const finalVersionCommitSubject = 'chore(repo): version 1.5.0 final release';
const finalVersion = '1.5.0';
const finalBaseVersion = '1.5.0-rc.3';
const stablePatchVersionCommitSubject = 'chore(repo): version fixed group to 1.5.1';

const allowedVersionSupportPaths = new Set([
  'docs/meta/security/sbom.cdx.json',
  'package.json',
  'packages/pdf/README.md',
  'packages/pdf-a/README.md',
  'packages/pdf-a-vera-docker/README.md',
  'tools/create-stynx-app/template/package.json',
]);

const allowedVersionFollowUpPaths = new Set([
  '.changeset/config.json',
  'docs/adopters/stynx/release-readiness.md',
  'docs/meta/security/sbom.cdx.json',
  'package.json',
  'scripts/lib/release-context.mjs',
  'scripts/lib/release-version-policy.mjs',
  'scripts/run-release-preparation.mjs',
  'scripts/sync-release-version.mjs',
  'scripts/verify-release-policy.mjs',
  // The versioned root manifest changes this frozen contract's digest. Its
  // exact pin must follow the generated version commit without loosening the
  // contract or permitting arbitrary release follow-up paths.
  'test/scripts/local-rc-blocker-contract.test.mjs',
  'tools/create-stynx-app/template/package.json',
]);

const allowedStablePatchFollowUpPaths = new Set([
  'law/policy/registry-version-anomalies.json',
  'law/trace.json',
  'package.json',
  'scripts/lib/registry-version-policy.mjs',
  'scripts/lib/release-context.mjs',
  'scripts/run-release-preparation.mjs',
  'test/db/outbox-event-log-migration.spec.ts',
  'test/scripts/local-rc-blocker-contract.test.mjs',
  'test/scripts/release-version-policy.test.mjs',
]);

export class ReleaseContextError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReleaseContextError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReleaseContextError(code, message);
}

function isChangeset(path) {
  return /^\.changeset\/[^/]+\.md$/u.test(path);
}

function packageDirectory(path) {
  const match = /^(packages|packages-web)\/[^/]+\/(package\.json|CHANGELOG\.md)$/u.exec(path);
  return match ? path.slice(0, path.lastIndexOf('/')) : null;
}

function validateVersionChanges(changes, versionRebaselineValid) {
  const deletedChangesets = [];
  const manifests = new Set();
  const changelogs = new Set();

  for (const change of changes) {
    const { path, status } = change;
    if (status === 'D' && isChangeset(path)) {
      deletedChangesets.push(path);
      continue;
    }

    const directory = packageDirectory(path);
    if (status === 'M' && directory !== null) {
      if (path.endsWith('/package.json')) manifests.add(directory);
      else changelogs.add(directory);
      continue;
    }

    if (status === 'M' && allowedVersionSupportPaths.has(path)) continue;

    fail(
      'RELEASE_CONTEXT_VERSION_DIFF',
      `version commit contains unexpected ${status} path ${path}`,
    );
  }

  if (deletedChangesets.length === 0 && !versionRebaselineValid) {
    fail('RELEASE_CONTEXT_NO_CHANGESETS', 'version commit consumes no changesets');
  }
  if (manifests.size === 0) {
    fail('RELEASE_CONTEXT_NO_PACKAGES', 'version commit changes no package manifests');
  }
  for (const directory of manifests) {
    if (!changelogs.has(directory)) {
      fail(
        'RELEASE_CONTEXT_CHANGELOG_MISSING',
        `versioned package ${directory} has no matching changelog change`,
      );
    }
  }
  for (const directory of changelogs) {
    if (!manifests.has(directory)) {
      fail(
        'RELEASE_CONTEXT_MANIFEST_MISSING',
        `changed changelog ${directory} has no matching package manifest change`,
      );
    }
  }

  return {
    changesetCount: deletedChangesets.length,
    packageCount: manifests.size,
    rebaseline: deletedChangesets.length === 0,
  };
}

function validateFollowUpChanges(changes, rootManifestFollowUpValid) {
  for (const change of changes) {
    if (!['A', 'M'].includes(change.status) || !allowedVersionFollowUpPaths.has(change.path)) {
      fail(
        'RELEASE_CONTEXT_FOLLOW_UP_DIFF',
        `version candidate contains unexpected follow-up ${change.status} path ${change.path}`,
      );
    }
  }
  if (changes.some((change) => change.path === 'package.json') && !rootManifestFollowUpValid) {
    fail(
      'RELEASE_CONTEXT_ROOT_MANIFEST',
      'version candidate changes root package.json beyond the release-preparation command',
    );
  }
}

/** A generated, already-versioned RC has no pending Changesets status to draft. */
export function isVersionedPreModeCandidate({
  baseRootVersion,
  candidateRootVersion,
  versionCommitVersion,
  packageStates,
  changedManifestPaths,
  changesetIdsOnDisk,
  followUpChanges,
  basePreState,
  preState,
}) {
  const baseStable = stableVersion.exec(baseRootVersion);
  const baseRc = rcVersion.exec(baseRootVersion);
  const candidateRc = rcVersion.exec(candidateRootVersion);
  if (
    (!baseStable && !baseRc) ||
    !candidateRc ||
    versionCommitVersion !== candidateRootVersion.slice(0, -`-rc.${candidateRc[4]}`.length) ||
    preState?.mode !== 'pre' ||
    preState.tag !== 'rc' ||
    !Array.isArray(preState.changesets) ||
    preState.changesets.length === 0 ||
    !Array.isArray(packageStates) ||
    packageStates.length !== 44 ||
    !Array.isArray(changedManifestPaths) ||
    !Array.isArray(changesetIdsOnDisk) ||
    !Array.isArray(followUpChanges) ||
    followUpChanges.some(
      ({ path }) =>
        /^(?:packages|packages-web|\.changeset)\//u.test(path) && path !== '.changeset/status.json',
    )
  )
    return false;

  if (baseStable) {
    if (basePreState !== null) return false;
    const base = baseStable.slice(1).map(Number);
    const candidate = candidateRc.slice(1, 4).map(Number);
    if (
      !candidate.some(
        (part, index) =>
          part > base[index] &&
          candidate.slice(0, index).every((earlier, i) => earlier === base[i]),
      )
    )
      return false;
  } else {
    if (
      baseRc.slice(1, 4).some((part, index) => part !== candidateRc[index + 1]) ||
      Number(candidateRc[4]) <= Number(baseRc[4]) ||
      basePreState?.mode !== 'pre' ||
      basePreState.tag !== 'rc' ||
      !Array.isArray(basePreState.changesets) ||
      basePreState.changesets.some((id) => !preState.changesets.includes(id))
    )
      return false;
  }

  const names = new Set(packageStates.map(({ name }) => name));
  const paths = new Set(packageStates.map(({ manifestPath }) => manifestPath));
  const changed = new Set(changedManifestPaths);
  const consumed = new Set(preState.changesets);
  const onDisk = new Set(changesetIdsOnDisk);
  if (
    names.size !== 44 ||
    paths.size !== 44 ||
    changed.size !== 44 ||
    changedManifestPaths.length !== 44 ||
    consumed.size !== preState.changesets.length ||
    onDisk.size !== changesetIdsOnDisk.length ||
    consumed.size !== onDisk.size ||
    [...consumed].some((id) => !onDisk.has(id)) ||
    [...paths].some((path) => !changed.has(path))
  )
    return false;

  return packageStates.every(
    ({ name, baseVersion, candidateVersion }) =>
      candidateVersion === candidateRootVersion &&
      (baseStable
        ? baseVersion === preState.initialVersions?.[name]
        : baseVersion === baseRootVersion &&
          basePreState.initialVersions?.[name] === preState.initialVersions?.[name]),
  );
}

/** The consolidated final candidate has one exact marker and no pending release inputs. */
export function isFinalVersionedCandidate({
  baseRootVersion,
  basePreState,
  markerCommits,
  markerParentPreState,
  markerChanges,
  followUpChanges,
  candidateRootVersion,
  packageStates,
  changesetIdsOnDisk,
  preState,
}) {
  if (
    baseRootVersion !== finalBaseVersion ||
    candidateRootVersion !== finalVersion ||
    preState !== null ||
    basePreState?.mode !== 'pre' ||
    basePreState.tag !== 'rc' ||
    !Array.isArray(basePreState.changesets) ||
    !isDeepStrictEqual(markerParentPreState, basePreState) ||
    !Array.isArray(markerCommits) ||
    !Array.isArray(markerChanges) ||
    !Array.isArray(followUpChanges) ||
    !Array.isArray(packageStates) ||
    packageStates.length !== 44 ||
    !Array.isArray(changesetIdsOnDisk) ||
    changesetIdsOnDisk.length !== 0
  )
    return false;

  const markers = markerCommits.filter(({ subject }) => subject === finalVersionCommitSubject);
  if (
    markers.length !== 1 ||
    markerCommits.indexOf(markers[0]) === 0 ||
    markerCommits.some(({ sha, subject }) => !fullSha.test(sha) || typeof subject !== 'string') ||
    new Set(markerCommits.map(({ sha }) => sha)).size !== markerCommits.length
  )
    return false;

  const names = new Set(packageStates.map(({ name }) => name));
  const manifests = new Set(packageStates.map(({ manifestPath }) => manifestPath));
  if (
    names.size !== 44 ||
    manifests.size !== 44 ||
    !packageStates.every(
      (state) =>
        /^@stynx-nyx\/[a-z0-9-]+$/u.test(state.name) &&
        /^(?:packages|packages-web)\/[^/]+\/package\.json$/u.test(state.manifestPath) &&
        state.baseVersion === finalBaseVersion &&
        state.candidateVersion === finalVersion,
    )
  )
    return false;

  const expected = new Map([['.changeset/pre.json', 'D']]);
  for (const id of basePreState.changesets) {
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/u.test(id)) return false;
    expected.set(`.changeset/${id}.md`, 'D');
  }
  if (expected.size !== basePreState.changesets.length + 1) return false;
  // CTG changesets are added as files after the base; the pre state itself is frozen.
  for (const { path, status } of markerChanges) {
    if (status === 'D' && isChangeset(path) && path !== '.changeset/README.md') {
      expected.set(path, 'D');
    }
  }
  for (const manifestPath of manifests) {
    expected.set(manifestPath, 'M');
    expected.set(manifestPath.replace(/package\.json$/u, 'CHANGELOG.md'), 'M');
  }
  for (const path of allowedVersionSupportPaths) expected.set(path, 'M');
  if (
    markerChanges.length !== expected.size ||
    markerChanges.some(({ path, status }) => expected.get(path) !== status) ||
    new Set(markerChanges.map(({ path }) => path)).size !== markerChanges.length
  )
    return false;

  return followUpChanges.every(
    ({ path, status }) =>
      (status === 'A' || status === 'M') &&
      (/^work\/rounds\/R-0002\/.+/u.test(path) ||
        (status === 'M' && path === 'law/policy/forbidden-action-authorizations.json') ||
        // Exact CI portability repairs discovered by clean remote checkouts.
        // None of these files enters the 44 publishable package tarballs.
        (status === 'M' &&
          [
            '.semgrepignore',
            'law/adr/2026-09-28-final-candidate-ci-repair.md',
            'packages-web/angular-i18n/tsconfig.spec.json',
            'scripts/lib/release-context.mjs',
            'tools/tsconfig/base.json',
          ].includes(path)) ||
        (status === 'A' && path === 'law/adr/2026-09-28-final-candidate-ci-repair.md')),
  );
}

/** One consumed changeset versions the complete 1.5.0 fixed group to stable 1.5.1. */
export function isStablePatchVersionedCandidate({
  baseRootVersion,
  markerParentRootVersion,
  candidateRootVersion,
  markerCommits,
  markerChanges,
  markerParentChangesets,
  followUpChanges,
  rootManifestMatchesMarker,
  packageStates,
  changesetIdsOnDisk,
  preState,
  markerParentPreState,
}) {
  if (
    baseRootVersion !== '1.5.0' ||
    markerParentRootVersion !== '1.5.0' ||
    candidateRootVersion !== '1.5.1' ||
    preState !== null ||
    markerParentPreState !== null ||
    rootManifestMatchesMarker !== true ||
    !Array.isArray(markerCommits) ||
    !Array.isArray(markerChanges) ||
    !Array.isArray(markerParentChangesets) ||
    !Array.isArray(followUpChanges) ||
    !Array.isArray(packageStates) ||
    packageStates.length !== 44 ||
    !Array.isArray(changesetIdsOnDisk) ||
    changesetIdsOnDisk.length !== 0 ||
    !isDeepStrictEqual(markerParentChangesets, ['.changeset/postrelease-request-path.md'])
  )
    return false;

  const markers = markerCommits.filter(
    ({ subject }) => subject === stablePatchVersionCommitSubject,
  );
  if (
    markers.length !== 1 ||
    markerCommits.indexOf(markers[0]) === 0 ||
    markerCommits.some(({ sha, subject }) => !fullSha.test(sha) || typeof subject !== 'string') ||
    new Set(markerCommits.map(({ sha }) => sha)).size !== markerCommits.length
  )
    return false;

  const names = new Set(packageStates.map(({ name }) => name));
  const manifests = new Set(packageStates.map(({ manifestPath }) => manifestPath));
  if (
    names.size !== 44 ||
    manifests.size !== 44 ||
    !packageStates.every(
      ({ name, manifestPath, parentVersion, candidateVersion }) =>
        /^@stynx-nyx\/[a-z0-9-]+$/u.test(name) &&
        /^(?:packages|packages-web)\/[^/]+\/package\.json$/u.test(manifestPath) &&
        parentVersion === '1.5.0' &&
        candidateVersion === '1.5.1',
    )
  )
    return false;

  const expected = new Map([['.changeset/postrelease-request-path.md', 'D']]);
  for (const manifestPath of manifests) {
    expected.set(manifestPath, 'M');
    expected.set(manifestPath.replace(/package\.json$/u, 'CHANGELOG.md'), 'M');
  }
  for (const path of allowedVersionSupportPaths) expected.set(path, 'M');
  if (
    markerChanges.length !== expected.size ||
    markerChanges.some(({ path, status }) => expected.get(path) !== status) ||
    new Set(markerChanges.map(({ path }) => path)).size !== markerChanges.length
  )
    return false;

  return followUpChanges.every(
    ({ path, status }) =>
      (status === 'A' || status === 'M') &&
      (/^work\/rounds\/R-0003\/.+/u.test(path) ||
        (status === 'M' && allowedStablePatchFollowUpPaths.has(path))),
  );
}

export function classifyReleaseContext({
  baseCommit,
  headCommit,
  commits,
  versionParent,
  versionChanges,
  followUpChanges,
  rootManifestFollowUpValid,
  versionRebaselineValid = false,
}) {
  if (!fullSha.test(baseCommit) || !fullSha.test(headCommit)) {
    fail('RELEASE_CONTEXT_IDENTITY', 'base and head must be full commit SHAs');
  }

  const versionCommits = commits.filter((commit) => commit.subject === versionCommitSubject);
  if (versionCommits.length === 0) {
    // The 1.1.1 "PR A" campaign-preparation classification was retired with the
    // campaign policy it was bound to. A candidate without a version-packages
    // commit is now simply ordinary.
    return { kind: 'ordinary', baseCommit, headCommit };
  }
  if (versionCommits.length !== 1) {
    fail('RELEASE_CONTEXT_AMBIGUOUS', 'candidate contains multiple version-package commits');
  }

  const versionCommit = versionCommits[0];
  if (commits[0]?.sha !== versionCommit.sha || versionParent !== baseCommit) {
    fail(
      'RELEASE_CONTEXT_BASE_MISMATCH',
      'version-package commit must be the direct first-parent child of origin/main',
    );
  }

  const counts = validateVersionChanges(versionChanges, versionRebaselineValid);
  validateFollowUpChanges(followUpChanges, rootManifestFollowUpValid);

  return {
    kind: 'version-pr',
    baseCommit,
    headCommit,
    versionCommit: versionCommit.sha,
    ...counts,
  };
}

export const releaseContextConstants = Object.freeze({
  releaseStatusCommand,
  versionCommitSubject,
  finalVersionCommitSubject,
  stablePatchVersionCommitSubject,
  unifiedRebaselineVersion,
  releasePreparationCommand: 'node scripts/run-release-preparation.mjs',
  versionPackagesCommand: 'node scripts/version-packages.mjs',
});
