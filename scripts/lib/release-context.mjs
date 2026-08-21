const fullSha = /^[0-9a-f]{40}$/u;
const versionCommitSubject = 'ci: version packages';

const allowedVersionFollowUpPaths = new Set([
  'docs/meta/security/sbom.cdx.json',
  'package.json',
  'scripts/lib/release-context.mjs',
  'scripts/run-release-preparation.mjs',
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

function validateVersionChanges(changes) {
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

    fail(
      'RELEASE_CONTEXT_VERSION_DIFF',
      `version commit contains unexpected ${status} path ${path}`,
    );
  }

  if (deletedChangesets.length === 0) {
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

export function classifyReleaseContext({
  baseCommit,
  headCommit,
  commits,
  versionParent,
  versionChanges,
  followUpChanges,
  rootManifestFollowUpValid,
}) {
  if (!fullSha.test(baseCommit) || !fullSha.test(headCommit)) {
    fail('RELEASE_CONTEXT_IDENTITY', 'base and head must be full commit SHAs');
  }

  const versionCommits = commits.filter((commit) => commit.subject === versionCommitSubject);
  if (versionCommits.length === 0) {
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

  const counts = validateVersionChanges(versionChanges);
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
  versionCommitSubject,
  releasePreparationCommand: 'node scripts/run-release-preparation.mjs',
});
