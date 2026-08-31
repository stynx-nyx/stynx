import { createHash } from 'node:crypto';

const fullSha = /^[0-9a-f]{40}$/u;
const versionCommitSubject = 'ci: version packages';
const unifiedRebaselineVersion = '1.1.1';
const releaseStatusCommand = 'node scripts/run-release-preparation.mjs --release-status';
const prAPolicyDigest = '7218cd47417a3f33eba9231b0ded060e19dc919472ead8e40cf55d565a4cb71f';

const allowedVersionSupportPaths = new Set([
  'docs/meta/security/sbom.cdx.json',
  'package.json',
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
  'tools/create-stynx-app/template/package.json',
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

function sameSortedValues(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

function isPreparationChange({ path, status }) {
  return (
    ['A', 'M'].includes(status) &&
    typeof path === 'string' &&
    path.length > 0 &&
    !isChangeset(path) &&
    path !== 'CHANGELOG.md' &&
    !path.endsWith('/CHANGELOG.md')
  );
}

function classifyPrAPreparation({ baseCommit, headCommit, commits, prAPreparation }) {
  if (prAPreparation === undefined) return null;

  const { campaignPolicy, rootVersion, packageVersions, mutationPackageNames, changes } =
    prAPreparation;
  const changesetPolicy = campaignPolicy?.pr_a_changeset_policy;
  const publishableNames = campaignPolicy?.publishable_packages;
  const mutationNames = campaignPolicy?.mutation_packages;
  const firstPublicationNames = campaignPolicy?.approved_first_publications;
  const policyDigest = createHash('sha256')
    .update(JSON.stringify(campaignPolicy ?? null))
    .digest('hex');
  const packageNames = Array.isArray(packageVersions)
    ? packageVersions.map(({ name }) => name)
    : [];

  const exactPolicy =
    policyDigest === prAPolicyDigest &&
    campaignPolicy?.policy_id === 'stynx.release-campaign-1.1.1' &&
    campaignPolicy?.baseline?.commit === 'b77b50230e3906cee632eb9218b06603cce6c89a' &&
    campaignPolicy?.baseline?.tree === 'd0cde059f7a93a624ff01d485ebda9ac3cb9422e' &&
    campaignPolicy?.baseline?.projected_version === '1.0.0' &&
    campaignPolicy?.candidate?.version === '1.1.1' &&
    campaignPolicy?.candidate?.publishable_count === 44 &&
    campaignPolicy?.candidate?.mutation_count === 38 &&
    campaignPolicy?.candidate?.approved_first_publication_count === 6 &&
    changesetPolicy?.kind === 'campaign-preparation-only' &&
    changesetPolicy?.baseline_commit === campaignPolicy.baseline.commit &&
    changesetPolicy?.baseline_tree === campaignPolicy.baseline.tree &&
    changesetPolicy?.current_version === '1.0.0' &&
    changesetPolicy?.candidate_version === '1.1.1' &&
    changesetPolicy?.changesets === 'forbidden' &&
    changesetPolicy?.release_status_projection === 'empty-non-promoting' &&
    changesetPolicy?.version_projection === 'deferred-to-pr-b';
  const exactRosters =
    sameSortedValues(packageNames, publishableNames ?? []) &&
    sameSortedValues(mutationPackageNames, mutationNames ?? []) &&
    new Set(packageNames).size === 44 &&
    new Set(mutationPackageNames ?? []).size === 38 &&
    new Set(firstPublicationNames ?? []).size === 6;
  const baselineVersions =
    rootVersion === '1.0.0' &&
    Array.isArray(publishableNames) &&
    packageVersions?.length === 44 &&
    packageVersions.every(
      ({ name, version }) => publishableNames.includes(name) && version === '1.0.0',
    );
  const preparationDiff =
    Array.isArray(changes) && changes.length > 0 && changes.every(isPreparationChange);
  const noVersionCommit = !commits.some(({ subject }) => subject === versionCommitSubject);

  if (
    baseCommit !== changesetPolicy?.baseline_commit ||
    !exactPolicy ||
    !exactRosters ||
    !baselineVersions ||
    !preparationDiff ||
    !noVersionCommit
  ) {
    return null;
  }

  return {
    kind: 'pr-a-preparation',
    baseCommit,
    headCommit,
    policyId: campaignPolicy.policy_id,
    packageCount: 44,
    mutationCount: 38,
    firstPublicationCount: 6,
    currentVersion: '1.0.0',
    targetVersion: '1.1.1',
    changesetCount: 0,
    promoting: false,
    releaseStatusProjection: 'empty-non-promoting',
    versionProjection: 'deferred-to-pr-b',
  };
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

export function classifyReleaseContext({
  baseCommit,
  headCommit,
  commits,
  versionParent,
  versionChanges,
  followUpChanges,
  rootManifestFollowUpValid,
  versionRebaselineValid = false,
  prAPreparation,
}) {
  if (!fullSha.test(baseCommit) || !fullSha.test(headCommit)) {
    fail('RELEASE_CONTEXT_IDENTITY', 'base and head must be full commit SHAs');
  }

  const versionCommits = commits.filter((commit) => commit.subject === versionCommitSubject);
  if (versionCommits.length === 0) {
    const preparation = classifyPrAPreparation({
      baseCommit,
      headCommit,
      commits,
      prAPreparation,
    });
    if (preparation !== null) return preparation;
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
  unifiedRebaselineVersion,
  releasePreparationCommand: 'node scripts/run-release-preparation.mjs',
  versionPackagesCommand:
    'changeset version && node scripts/sync-release-version.mjs && pnpm security:sbom',
});
