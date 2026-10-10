import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';

import {
  collectPublicPackages,
  validateReleaseVersionPolicy,
} from '../../scripts/lib/release-version-policy.mjs';
import {
  fetchRegistryCensus,
  loadRegistryAnomalyPolicy,
  registryVersionPolicyConstants,
  RegistryVersionPolicyError,
  validateRegistryCensus,
} from '../../scripts/lib/registry-version-policy.mjs';
import {
  expectedRebaselineChangelog,
  runUnifiedRebaseline,
  unifiedRebaselinePackageCount,
  unifiedRebaselineSource,
  unifiedRebaselineTarget,
} from '../../scripts/lib/unified-rebaseline.mjs';
import { discoverMutationRoster } from '../../scripts/lib/mutation-roster.mjs';
import {
  classifyReleaseContext,
  isFinalVersionedCandidate,
  isSixthStablePatchVersionedCandidate,
  isSeventhStablePatchVersionedCandidate,
  isFifthStablePatchVersionedCandidate,
  isFourthStablePatchVersionedCandidate,
  isSecondStablePatchVersionedCandidate,
  isThirdStablePatchVersionedCandidate,
  isStablePatchVersionedCandidate,
  isVersionedPreModeCandidate,
  releaseContextConstants,
  ReleaseContextError,
} from '../../scripts/lib/release-context.mjs';
import {
  applyFixedGroupVersion,
  computeFixedGroupBump,
  FixedGroupVersionError,
  incrementVersion,
  parseChangesetFrontmatter,
  planFixedGroupVersion,
  readPendingChangesets,
} from '../../scripts/lib/fixed-group-version.mjs';
import * as fixedGroupVersion from '../../scripts/lib/fixed-group-version.mjs';
import { typeOnlyCoverageExclusions } from '../../tools/repo-config/coverage-population.mjs';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const anomalyPolicy = JSON.parse(
  readFileSync(join(repoRoot, 'law', 'policy', 'registry-version-anomalies.json'), 'utf8'),
);
const packageRoster = JSON.parse(
  readFileSync(join(repoRoot, 'law', 'policy', 'stynx-package-roster.json'), 'utf8'),
);

// The 1.1.1 release campaign policy was retired with the DEVAI adoption
// migration. Its still-valid product content — the 44-package census — now
// lives in law/policy/stynx-package-roster.json. The six first publications of
// that campaign shipped at 1.1.1, so the census is 44/44/0 and no absence is
// approved. This fixture reconstructs the shape the product registry-census
// validator accepts, so first-publication policy enforcement keeps its coverage
// without a candidate-bound campaign document.
// The registry census is validated against the current unified candidate
// (registryVersionPolicyConstants.candidate), not the historical 1.2.0
// rebaseline target that unified-rebaseline.mjs still describes.
const currentCandidate = '1.5.6';
const previousCandidate = '1.5.0-rc.2';
const preflightLatest = '1.5.5';

const campaignPolicy = {
  policy_id: 'stynx.package-roster',
  candidate: {
    version: currentCandidate,
    publishable_count: packageRoster.counts.publishable,
    mutation_count: packageRoster.counts.mutation,
    existing_private_count: packageRoster.counts.existing_private,
    approved_first_publication_count: packageRoster.counts.approved_first_publications,
  },
  publishable_packages: [...packageRoster.publishable_packages],
  existing_private_packages: [...packageRoster.existing_private_packages],
  mutation_packages: [...packageRoster.mutation_packages],
  approved_first_publications: [...packageRoster.approved_first_publications],
};
const changesetConfig = JSON.parse(
  readFileSync(join(repoRoot, '.changeset', 'config.json'), 'utf8'),
);
const packageNames = [...changesetConfig.fixed[0]].sort();
const firstPublicationNames = [];
const singleVersionNames = [
  '@stynx-nyx/jobs',
  '@stynx-nyx/mobile-runtime',
  '@stynx-nyx/notifications',
  '@stynx-nyx/offline-sync',
  '@stynx-nyx/outbox',
  '@stynx-nyx/worklist',
];
const publishedPackageNames = packageNames.filter(
  (packageName) => !firstPublicationNames.includes(packageName),
);

function registryMetadata(name, versions) {
  return {
    name,
    versions: Object.fromEntries(versions.map((version) => [version, { name, version }])),
    'dist-tags': { latest: preflightLatest, rc: previousCandidate },
  };
}

function publishedRegistryState(name, versions) {
  return {
    authenticated: true,
    status: 200,
    metadata: registryMetadata(
      name,
      versions.includes(preflightLatest) ? versions : [...versions, preflightLatest],
    ),
  };
}

function absentRegistryState() {
  return { authenticated: true, status: 404 };
}

function validRegistryCensus() {
  return new Map(
    packageNames.map((name) => {
      if (firstPublicationNames.includes(name)) return [name, absentRegistryState()];
      const versions =
        name === '@stynx-nyx/angular-profile'
          ? ['0.5.0', '1.0.0', '1.1.0', previousCandidate, preflightLatest, '2.0.0']
          : name === '@stynx-nyx/angular-sessions' || name === '@stynx-nyx/sessions'
            ? ['0.5.0', '1.0.0', '1.1.0', previousCandidate, preflightLatest]
            : singleVersionNames.includes(name)
              ? ['1.1.1', previousCandidate, preflightLatest]
              : ['0.5.0', '1.0.0', previousCandidate, preflightLatest];
      return [name, publishedRegistryState(name, versions)];
    }),
  );
}

function validInventory() {
  return {
    authenticated: true,
    complete: true,
    packageNames: [...publishedPackageNames],
  };
}

function validate(overrides = {}) {
  return validateRegistryCensus({
    packageNames,
    registryStatesByPackage: validRegistryCensus(),
    githubPackagesInventory: validInventory(),
    candidate: currentCandidate,
    anomalyPolicy,
    campaignPolicy,
    ...overrides,
  });
}

function assertPolicyError(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof RegistryVersionPolicyError);
    assert.equal(error.code, code);
    return true;
  });
}

const preparedBaseCommit = 'b77b50230e3906cee632eb9218b06603cce6c89a';
const preparedHeadCommit = '6d7f86d70e784a281fe025bf50babc9f3b3e8aee';

function prAReleaseContext(overrides = {}) {
  const { roster: mutationRoster } = discoverMutationRoster(repoRoot);
  return {
    baseCommit: preparedBaseCommit,
    headCommit: preparedHeadCommit,
    commits: [{ sha: preparedHeadCommit, subject: 'test(release): prepare campaign controls' }],
    versionParent: null,
    versionChanges: [],
    followUpChanges: [],
    rootManifestFollowUpValid: false,
    versionRebaselineValid: false,
    prAPreparation: {
      campaignPolicy,
      rootVersion: '1.0.0',
      packageVersions: packageNames.map((name) => ({ name, version: '1.0.0' })),
      mutationPackageNames: mutationRoster.map(({ packageName }) => packageName).sort(),
      changes: [{ status: 'M', path: 'scripts/run-release-preparation.mjs' }],
      ...overrides,
    },
  };
}

test('ordinary changed publishable packages without a Changeset remain ordinary and fail closed', () => {
  const context = prAReleaseContext();
  context.prAPreparation = undefined;
  context.commits = [{ sha: preparedHeadCommit, subject: 'feat(core): change public behavior' }];
  assert.deepEqual(classifyReleaseContext(context), {
    kind: 'ordinary',
    baseCommit: preparedBaseCommit,
    headCommit: preparedHeadCommit,
  });
});

test('versioned RC status accepts only the complete consumed fixed-group candidate', () => {
  const packageStates = collectPublicPackages(repoRoot).map(({ name, manifestPath }) => ({
    name,
    manifestPath: relative(repoRoot, manifestPath),
    baseVersion: '1.4.0',
    candidateVersion: '1.5.0-rc.1',
  }));
  assert.equal(packageStates.length, 44);
  const input = {
    baseRootVersion: '1.4.0',
    candidateRootVersion: '1.5.0-rc.1',
    versionCommitVersion: '1.5.0',
    packageStates,
    changedManifestPaths: packageStates.map(({ manifestPath }) => manifestPath),
    changesetIdsOnDisk: ['tenancy-context-15'],
    followUpChanges: [],
    basePreState: null,
    preState: {
      mode: 'pre',
      tag: 'rc',
      initialVersions: Object.fromEntries(packageStates.map(({ name }) => [name, '1.4.0'])),
      changesets: ['tenancy-context-15'],
    },
  };
  assert.equal(isVersionedPreModeCandidate(input), true);

  for (const [label, mutate] of [
    [
      'no version commit',
      (value) => {
        value.versionCommitVersion = null;
      },
    ],
    [
      'marker core drift',
      (value) => {
        value.versionCommitVersion = '9.9.9';
      },
    ],
    [
      'wrong mode',
      (value) => {
        value.preState.mode = 'exit';
      },
    ],
    [
      'wrong tag',
      (value) => {
        value.preState.tag = 'latest';
      },
    ],
    [
      'stable candidate',
      (value) => {
        value.candidateRootVersion = '1.5.0';
      },
    ],
    [
      'same version as base',
      (value) => {
        value.baseRootVersion = '1.5.0-rc.1';
      },
    ],
    [
      'one package omitted',
      (value) => {
        value.packageStates.pop();
      },
    ],
    [
      'one package not versioned',
      (value) => {
        value.packageStates[43].candidateVersion = '1.4.0';
      },
    ],
    [
      'one base mismatch',
      (value) => {
        value.packageStates[0].baseVersion = '1.3.1';
      },
    ],
    [
      'one changed manifest omitted',
      (value) => {
        value.changedManifestPaths.pop();
      },
    ],
    [
      'one unexpected manifest',
      (value) => {
        value.changedManifestPaths.push('packages/unrelated/package.json');
      },
    ],
    [
      'no consumed changeset',
      (value) => {
        value.preState.changesets = [];
      },
    ],
    [
      'pending changeset',
      (value) => {
        value.changesetIdsOnDisk.push('new-work');
      },
    ],
    [
      'missing consumed file',
      (value) => {
        value.changesetIdsOnDisk = [];
      },
    ],
    [
      'source changed after versioning',
      (value) => {
        value.followUpChanges = [{ status: 'M', path: 'packages/core/src/index.ts' }];
      },
    ],
    [
      'new changeset after versioning',
      (value) => {
        value.followUpChanges = [{ status: 'A', path: '.changeset/late.md' }];
      },
    ],
  ]) {
    const invalid = structuredClone(input);
    mutate(invalid);
    assert.equal(isVersionedPreModeCandidate(invalid), false, label);
  }

  const laterRc = structuredClone(input);
  laterRc.baseRootVersion = '1.5.0-rc.1';
  laterRc.candidateRootVersion = '1.5.0-rc.2';
  laterRc.packageStates.forEach((entry) => {
    entry.baseVersion = '1.5.0-rc.1';
    entry.candidateVersion = '1.5.0-rc.2';
  });
  laterRc.preState.changesets.push('sse-stream-15');
  laterRc.changesetIdsOnDisk.push('sse-stream-15');
  laterRc.basePreState = structuredClone(input.preState);
  assert.equal(isVersionedPreModeCandidate(laterRc), true, 'rc.2 advances from rc.1');

  const repeatedRc = structuredClone(laterRc);
  repeatedRc.candidateRootVersion = '1.5.0-rc.1';
  repeatedRc.packageStates.forEach((entry) => {
    entry.candidateVersion = '1.5.0-rc.1';
  });
  assert.equal(isVersionedPreModeCandidate(repeatedRc), false, 'ordinal must advance');

  const discontinuousPre = structuredClone(laterRc);
  discontinuousPre.basePreState.initialVersions[packageStates[0].name] = '1.3.0';
  assert.equal(
    isVersionedPreModeCandidate(discontinuousPre),
    false,
    'pre mode initial versions remain bound',
  );
});

test('final versioned candidate accepts a late single marker and exact generated release surface', () => {
  const packageStates = collectPublicPackages(repoRoot).map(({ name, manifestPath }) => ({
    name,
    manifestPath: relative(repoRoot, manifestPath),
    baseVersion: '1.5.0-rc.3',
    candidateVersion: '1.5.0',
  }));
  assert.equal(packageStates.length, 44);
  const preState = {
    mode: 'pre',
    tag: 'rc',
    initialVersions: Object.fromEntries(packageStates.map(({ name }) => [name, '1.4.0'])),
    changesets: ['ctg9-signature', 'ctg9-outbox'],
  };
  const markerChanges = [
    { status: 'D', path: '.changeset/pre.json' },
    ...preState.changesets.map((id) => ({ status: 'D', path: `.changeset/${id}.md` })),
    ...packageStates.flatMap(({ manifestPath }) => [
      { status: 'M', path: manifestPath },
      { status: 'M', path: manifestPath.replace(/package\.json$/u, 'CHANGELOG.md') },
    ]),
    ...[
      'docs/meta/security/sbom.cdx.json',
      'package.json',
      'tools/create-stynx-app/template/package.json',
      'packages/pdf/README.md',
      'packages/pdf-a/README.md',
      'packages/pdf-a-vera-docker/README.md',
    ].map((path) => ({ status: 'M', path })),
  ];
  const input = {
    baseRootVersion: '1.5.0-rc.3',
    basePreState: preState,
    markerCommits: [
      { sha: 'a'.repeat(40), subject: 'docs(release): close CTG9 contract' },
      { sha: 'b'.repeat(40), subject: 'test(release): probe final candidate' },
      { sha: 'c'.repeat(40), subject: 'feat(release): classify final candidate' },
      { sha: 'd'.repeat(40), subject: 'chore(repo): version 1.5.0 final release' },
      { sha: 'e'.repeat(40), subject: 'docs(release): record review' },
    ],
    markerParentPreState: structuredClone(preState),
    markerChanges,
    followUpChanges: [
      { status: 'A', path: 'work/rounds/R-0002/reviews/final-release.md' },
      { status: 'M', path: 'law/policy/forbidden-action-authorizations.json' },
    ],
    candidateRootVersion: '1.5.0',
    packageStates,
    changesetIdsOnDisk: [],
    preState: null,
  };
  assert.equal(isFinalVersionedCandidate(input), true);

  for (const [label, mutate] of [
    [
      'missing marker',
      (value) => {
        value.markerCommits.splice(3, 1);
      },
    ],
    [
      'duplicate marker',
      (value) => {
        value.markerCommits.push({
          sha: 'f'.repeat(40),
          subject: 'chore(repo): version 1.5.0 final release',
        });
      },
    ],
    [
      'wrong base',
      (value) => {
        value.baseRootVersion = '1.5.0-rc.2';
      },
    ],
    [
      'wrong root version',
      (value) => {
        value.candidateRootVersion = '1.5.1';
      },
    ],
    [
      'one base package drift',
      (value) => {
        value.packageStates[0].baseVersion = '1.5.0-rc.2';
      },
    ],
    [
      'one final package drift',
      (value) => {
        value.packageStates[0].candidateVersion = '1.5.0-rc.3';
      },
    ],
    [
      '43 manifests',
      (value) => {
        value.packageStates.pop();
      },
    ],
    [
      'duplicate manifest',
      (value) => {
        value.packageStates[43] = structuredClone(value.packageStates[0]);
      },
    ],
    [
      'retained pre state',
      (value) => {
        value.preState = { mode: 'exit', tag: 'rc' };
      },
    ],
    [
      'pending changeset',
      (value) => {
        value.changesetIdsOnDisk.push('new-work');
      },
    ],
    [
      'parent in exit mode',
      (value) => {
        value.markerParentPreState.mode = 'exit';
      },
    ],
    [
      'parent initial version drift',
      (value) => {
        value.markerParentPreState.initialVersions[value.packageStates[0].name] = '1.3.0';
      },
    ],
    [
      'parent changeset drift',
      (value) => {
        value.markerParentPreState.changesets.push('untracked');
      },
    ],
    [
      'missing pre deletion',
      (value) => {
        value.markerChanges.shift();
      },
    ],
    [
      'missing consumed changeset',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== '.changeset/ctg9-outbox.md',
        );
      },
    ],
    [
      'missing changelog',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) =>
            path !== value.packageStates[0].manifestPath.replace(/package\.json$/u, 'CHANGELOG.md'),
        );
      },
    ],
    [
      'missing root support',
      (value) => {
        value.markerChanges = value.markerChanges.filter(({ path }) => path !== 'package.json');
      },
    ],
    [
      'extra generated path',
      (value) => {
        value.markerChanges.push({ status: 'M', path: 'packages/core/README.md' });
      },
    ],
    [
      'source follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'packages/core/src/index.ts' });
      },
    ],
    [
      'sensor follow-up',
      (value) => {
        value.followUpChanges.push({
          status: 'M',
          path: 'test/scripts/release-version-policy.test.mjs',
        });
      },
    ],
    [
      'workflow follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: '.github/workflows/release.yml' });
      },
    ],
    [
      'other round follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'work/rounds/R-0001/review.md' });
      },
    ],
    [
      'generated proof follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'A', path: 'record/proofs/final.json' });
      },
    ],
    [
      'deleted round note',
      (value) => {
        value.followUpChanges.push({ status: 'D', path: 'work/rounds/R-0002/reviews/old.md' });
      },
    ],
    [
      'added policy authorization',
      (value) => {
        value.followUpChanges.push({
          status: 'A',
          path: 'law/policy/forbidden-action-authorizations.json',
        });
      },
    ],
  ]) {
    const invalid = structuredClone(input);
    mutate(invalid);
    assert.equal(isFinalVersionedCandidate(invalid), false, label);
  }
});

test('stable 1.5.1 patch context consumes one changeset and rejects ungoverned follow-ups', () => {
  const packageStates = collectPublicPackages(repoRoot).map(({ name, manifestPath }) => ({
    name,
    manifestPath: relative(repoRoot, manifestPath),
    parentVersion: '1.5.0',
    candidateVersion: '1.5.1',
  }));
  assert.equal(packageStates.length, 44);
  const markerChanges = [
    { status: 'D', path: '.changeset/postrelease-request-path.md' },
    ...packageStates.flatMap(({ manifestPath }) => [
      { status: 'M', path: manifestPath },
      { status: 'M', path: manifestPath.replace(/package\.json$/u, 'CHANGELOG.md') },
    ]),
    ...[
      'docs/meta/security/sbom.cdx.json',
      'package.json',
      'tools/create-stynx-app/template/package.json',
      'packages/pdf/README.md',
      'packages/pdf-a/README.md',
      'packages/pdf-a-vera-docker/README.md',
    ].map((path) => ({ status: 'M', path })),
  ];
  const input = {
    baseRootVersion: '1.5.0',
    markerParentRootVersion: '1.5.0',
    candidateRootVersion: '1.5.1',
    markerCommits: [
      { sha: 'a'.repeat(40), subject: 'fix(repo): complete postrelease request path' },
      { sha: 'b'.repeat(40), subject: 'chore(repo): version fixed group to 1.5.1' },
      { sha: 'c'.repeat(40), subject: 'docs(repo): bind patch policy' },
    ],
    markerChanges,
    markerParentChangesets: ['.changeset/postrelease-request-path.md'],
    followUpChanges: [
      { status: 'M', path: 'law/policy/registry-version-anomalies.json' },
      { status: 'M', path: 'package.json' },
      { status: 'A', path: 'work/rounds/R-0003/reviews/delivery-review-3.json' },
    ],
    rootManifestMatchesMarker: true,
    packageStates,
    changesetIdsOnDisk: [],
    preState: null,
    markerParentPreState: null,
  };
  assert.equal(isStablePatchVersionedCandidate(input), true);
  for (const [label, mutate] of [
    [
      'wrong base',
      (value) => {
        value.baseRootVersion = '1.4.0';
      },
    ],
    [
      'wrong candidate',
      (value) => {
        value.candidateRootVersion = '1.5.2';
      },
    ],
    [
      'missing marker',
      (value) => {
        value.markerCommits.splice(1, 1);
      },
    ],
    [
      'duplicate marker',
      (value) => {
        value.markerCommits.push({
          sha: 'd'.repeat(40),
          subject: 'chore(repo): version fixed group to 1.5.1',
        });
      },
    ],
    [
      'missing changeset',
      (value) => {
        value.markerParentChangesets = [];
      },
    ],
    [
      'extra changeset',
      (value) => {
        value.markerParentChangesets.push('.changeset/other.md');
      },
    ],
    [
      'unconsumed changeset',
      (value) => {
        value.markerChanges.shift();
      },
    ],
    [
      'missing manifest',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== value.packageStates[0].manifestPath,
        );
      },
    ],
    [
      'missing changelog',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) =>
            path !== value.packageStates[0].manifestPath.replace(/package\.json$/u, 'CHANGELOG.md'),
        );
      },
    ],
    [
      'extra package',
      (value) => {
        value.packageStates.push(structuredClone(value.packageStates[0]));
      },
    ],
    [
      'one package stale',
      (value) => {
        value.packageStates[0].candidateVersion = '1.5.0';
      },
    ],
    [
      'retained pre mode',
      (value) => {
        value.preState = { mode: 'exit' };
      },
    ],
    [
      'pending changeset',
      (value) => {
        value.changesetIdsOnDisk.push('later');
      },
    ],
    [
      'source follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'packages/core/src/index.ts' });
      },
    ],
    [
      'workflow follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: '.github/workflows/release.yml' });
      },
    ],
    [
      'root manifest drift',
      (value) => {
        value.rootManifestMatchesMarker = false;
      },
    ],
  ]) {
    const invalid = structuredClone(input);
    mutate(invalid);
    assert.equal(isStablePatchVersionedCandidate(invalid), false, label);
  }
});

test('stable 1.5.2 patch context consumes only session policy and rejects unbound changes', () => {
  const packageStates = collectPublicPackages(repoRoot).map(({ name, manifestPath }) => ({
    name,
    manifestPath: relative(repoRoot, manifestPath),
    parentVersion: '1.5.1',
    candidateVersion: '1.5.2',
  }));
  assert.equal(packageStates.length, 44);
  const markerChanges = [
    { status: 'D', path: '.changeset/session-policy-http-status.md' },
    ...packageStates.flatMap(({ manifestPath }) => [
      { status: 'M', path: manifestPath },
      { status: 'M', path: manifestPath.replace(/package\.json$/u, 'CHANGELOG.md') },
    ]),
    ...[
      'docs/meta/security/sbom.cdx.json',
      'package.json',
      'tools/create-stynx-app/template/package.json',
      'packages/pdf/README.md',
      'packages/pdf-a/README.md',
      'packages/pdf-a-vera-docker/README.md',
    ].map((path) => ({ status: 'M', path })),
  ];
  const input = {
    baseRootVersion: '1.5.0',
    markerParentRootVersion: '1.5.1',
    candidateRootVersion: '1.5.2',
    markerCommits: [
      { sha: 'a'.repeat(40), subject: 'fix(sessions): return policy denial as 403' },
      { sha: 'b'.repeat(40), subject: 'chore(repo): version fixed group to 1.5.2' },
      { sha: 'c'.repeat(40), subject: 'docs(release): bind second stable patch' },
    ],
    markerChanges,
    markerParentChangesets: ['.changeset/session-policy-http-status.md'],
    followUpChanges: [
      { status: 'M', path: 'law/policy/registry-version-anomalies.json' },
      { status: 'M', path: 'law/policy/forbidden-action-authorizations.json' },
      { status: 'M', path: 'scripts/lib/release-context.mjs' },
      { status: 'M', path: 'test/scripts/release-version-policy.test.mjs' },
      { status: 'M', path: '.semgrepignore' },
      { status: 'A', path: 'law/adr/2026-09-29-postrelease-pki-fixture-scan.md' },
      { status: 'A', path: 'work/rounds/R-0003/reviews/second-stable-patch.json' },
    ],
    rootManifestMatchesMarker: true,
    packageStates,
    changesetIdsOnDisk: [],
    preState: null,
    markerParentPreState: null,
  };
  assert.equal(isSecondStablePatchVersionedCandidate(input), true);

  for (const [label, mutate] of [
    [
      'wrong parent root version',
      (value) => {
        value.markerParentRootVersion = '1.5.0';
      },
    ],
    [
      'wrong candidate root version',
      (value) => {
        value.candidateRootVersion = '1.5.1';
      },
    ],
    [
      'wrong marker subject',
      (value) => {
        value.markerCommits[1].subject = 'chore(repo): version fixed group to 1.5.1';
      },
    ],
    [
      'duplicate marker',
      (value) => {
        value.markerCommits.push({
          sha: 'd'.repeat(40),
          subject: 'chore(repo): version fixed group to 1.5.2',
        });
      },
    ],
    [
      'missing changeset',
      (value) => {
        value.markerParentChangesets = [];
      },
    ],
    [
      'extra changeset',
      (value) => {
        value.markerParentChangesets.push('.changeset/other.md');
      },
    ],
    [
      'changeset deletion missing',
      (value) => {
        value.markerChanges.shift();
      },
    ],
    [
      'missing package manifest',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== value.packageStates[0].manifestPath,
        );
      },
    ],
    [
      'missing changelog',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) =>
            path !== value.packageStates[0].manifestPath.replace(/package\.json$/u, 'CHANGELOG.md'),
        );
      },
    ],
    [
      'missing generated support path',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== 'docs/meta/security/sbom.cdx.json',
        );
      },
    ],
    [
      'extra generated path',
      (value) => {
        value.markerChanges.push({ status: 'M', path: 'packages/core/README.md' });
      },
    ],
    [
      'one stale package version',
      (value) => {
        value.packageStates[0].candidateVersion = '1.5.1';
      },
    ],
    [
      'one wrong parent package version',
      (value) => {
        value.packageStates[0].parentVersion = '1.5.0';
      },
    ],
    [
      'pending changeset',
      (value) => {
        value.changesetIdsOnDisk.push('late-change');
      },
    ],
    [
      'pre mode retained',
      (value) => {
        value.preState = { mode: 'pre', tag: 'rc' };
      },
    ],
    [
      'source follow-up',
      (value) => {
        value.followUpChanges.push({
          status: 'M',
          path: 'packages/sessions/src/session-policy.service.ts',
        });
      },
    ],
    [
      'workflow follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: '.github/workflows/release.yml' });
      },
    ],
    [
      'missing exact root binding',
      (value) => {
        value.rootManifestMatchesMarker = false;
      },
    ],
    [
      'root manifest follow-up is not allowed',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'package.json' });
      },
    ],
    [
      'unrelated law follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'law/adr/unrelated.md' });
      },
    ],
    [
      'Semgrep allowlist status must be modified',
      (value) => {
        value.followUpChanges.push({ status: 'A', path: '.semgrepignore' });
      },
    ],
    [
      'PKI scan ADR status must be added',
      (value) => {
        value.followUpChanges.push({
          status: 'M',
          path: 'law/adr/2026-09-29-postrelease-pki-fixture-scan.md',
        });
      },
    ],
    [
      'deleted follow-up',
      (value) => {
        value.followUpChanges.push({
          status: 'D',
          path: 'work/rounds/R-0003/reviews/removed.json',
        });
      },
    ],
  ]) {
    const invalid = structuredClone(input);
    mutate(invalid);
    assert.equal(isSecondStablePatchVersionedCandidate(invalid), false, label);
  }
});

test('stable 1.5.3 patch context consumes exactly the eleven pending changesets from the 1.5.2 base', () => {
  const changesets = [
    '.changeset/angular-22-2-1-advisory.md',
    '.changeset/auth-sessions-partition-maintenance.md',
    '.changeset/auth-sessions-partition-retention.md',
    '.changeset/deps-minor-patch-2026-10.md',
    '.changeset/ngsse-opt-in-options.md',
    '.changeset/offline-sync-lists-idempotent-reserve.md',
    '.changeset/outbox-event-reads-retry.md',
    '.changeset/outbox-exact-null-assertions.md',
    '.changeset/signature-declarative-qualified.md',
    '.changeset/signature-offline-sync-test-clock.md',
    '.changeset/sse-429-retry-after-polling.md',
  ];
  const packageStates = collectPublicPackages(repoRoot).map(({ name, manifestPath }) => ({
    name,
    manifestPath: relative(repoRoot, manifestPath),
    parentVersion: '1.5.2',
    candidateVersion: '1.5.3',
  }));
  assert.equal(packageStates.length, 44);
  const markerChanges = [
    ...changesets.map((path) => ({ status: 'D', path })),
    ...packageStates.flatMap(({ manifestPath }) => [
      { status: 'M', path: manifestPath },
      { status: 'M', path: manifestPath.replace(/package\.json$/u, 'CHANGELOG.md') },
    ]),
    ...[
      'docs/meta/security/sbom.cdx.json',
      'package.json',
      'tools/create-stynx-app/template/package.json',
      'packages/pdf/README.md',
      'packages/pdf-a/README.md',
      'packages/pdf-a-vera-docker/README.md',
    ].map((path) => ({ status: 'M', path })),
  ];
  const input = {
    baseRootVersion: '1.5.2',
    markerParentRootVersion: '1.5.2',
    candidateRootVersion: '1.5.3',
    markerCommits: [
      { sha: 'a'.repeat(40), subject: 'docs(repo): govern the 1.5.3 stable patch candidate' },
      { sha: 'b'.repeat(40), subject: 'chore(repo): version fixed group to 1.5.3' },
      { sha: 'c'.repeat(40), subject: 'fix(repo): classify the exact 1.5.3 release candidate' },
    ],
    markerChanges,
    // Git lists the parent tree's changesets in path order; the classifier binds the set.
    markerParentChangesets: [...changesets].reverse(),
    followUpChanges: [
      { status: 'M', path: 'law/policy/forbidden-action-authorizations.json' },
      { status: 'M', path: 'law/policy/registry-version-anomalies.json' },
      { status: 'M', path: 'law/trace.json' },
      { status: 'M', path: 'scripts/lib/registry-version-policy.mjs' },
      { status: 'M', path: 'scripts/lib/release-context.mjs' },
      { status: 'M', path: 'scripts/run-release-preparation.mjs' },
      { status: 'M', path: 'test/scripts/local-rc-blocker-contract.test.mjs' },
      { status: 'M', path: 'test/scripts/release-version-policy.test.mjs' },
    ],
    rootManifestMatchesMarker: true,
    packageStates,
    changesetIdsOnDisk: [],
    preState: null,
    markerParentPreState: null,
  };
  assert.equal(isThirdStablePatchVersionedCandidate(input), true);
  assert.equal(isSecondStablePatchVersionedCandidate(input), false);

  for (const [label, mutate] of [
    [
      'base is not the unpublished 1.5.2 main',
      (value) => {
        value.baseRootVersion = '1.5.0';
      },
    ],
    [
      'wrong parent root version',
      (value) => {
        value.markerParentRootVersion = '1.5.1';
      },
    ],
    [
      'wrong candidate root version',
      (value) => {
        value.candidateRootVersion = '1.5.4';
      },
    ],
    [
      'wrong marker subject',
      (value) => {
        value.markerCommits[1].subject = 'chore(repo): version fixed group to 1.5.2';
      },
    ],
    [
      'marker first',
      (value) => {
        value.markerCommits.shift();
      },
    ],
    [
      'duplicate marker',
      (value) => {
        value.markerCommits.push({
          sha: 'd'.repeat(40),
          subject: 'chore(repo): version fixed group to 1.5.3',
        });
      },
    ],
    [
      'one changeset missing from the parent',
      (value) => {
        value.markerParentChangesets.pop();
      },
    ],
    [
      'extra parent changeset',
      (value) => {
        value.markerParentChangesets.push('.changeset/late-change.md');
      },
    ],
    [
      'one changeset deletion missing',
      (value) => {
        value.markerChanges.shift();
      },
    ],
    [
      'missing package manifest',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== value.packageStates[0].manifestPath,
        );
      },
    ],
    [
      'missing generated support path',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== 'packages/pdf/README.md',
        );
      },
    ],
    [
      'extra generated path',
      (value) => {
        value.markerChanges.push({ status: 'M', path: 'packages/core/README.md' });
      },
    ],
    [
      'one stale package version',
      (value) => {
        value.packageStates[0].candidateVersion = '1.5.2';
      },
    ],
    [
      'one wrong parent package version',
      (value) => {
        value.packageStates[0].parentVersion = '1.5.1';
      },
    ],
    [
      'pending changeset',
      (value) => {
        value.changesetIdsOnDisk.push('late-change');
      },
    ],
    [
      'pre mode retained',
      (value) => {
        value.preState = { mode: 'pre', tag: 'rc' };
      },
    ],
    [
      'source follow-up',
      (value) => {
        value.followUpChanges.push({
          status: 'M',
          path: 'packages/privacy/src/privacy.service.ts',
        });
      },
    ],
    [
      'migration follow-up',
      (value) => {
        value.followUpChanges.push({
          status: 'A',
          path: 'packages/data/migrations/platform/0025_late.sql',
        });
      },
    ],
    [
      'workflow follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: '.github/workflows/release.yml' });
      },
    ],
    [
      'root manifest follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'package.json' });
      },
    ],
    [
      'unrelated law follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'law/adr/unrelated.md' });
      },
    ],
    [
      'second-patch Semgrep follow-up is not carried over',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: '.semgrepignore' });
      },
    ],
    [
      'missing exact root binding',
      (value) => {
        value.rootManifestMatchesMarker = false;
      },
    ],
    [
      'deleted follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'D', path: 'law/trace.json' });
      },
    ],
  ]) {
    const invalid = structuredClone(input);
    mutate(invalid);
    assert.equal(isThirdStablePatchVersionedCandidate(invalid), false, label);
  }
});

test('stable 1.5.4 patch context consumes exactly the four pending changesets from the published 1.5.3 base', () => {
  const changesets = [
    '.changeset/ngsse-server-close-policy.md',
    '.changeset/outbox-event-destinations.md',
    '.changeset/readme-generated-dependency-pointer.md',
    '.changeset/serialize-db-backed-specs.md',
  ];
  const packageStates = collectPublicPackages(repoRoot).map(({ name, manifestPath }) => ({
    name,
    manifestPath: relative(repoRoot, manifestPath),
    parentVersion: '1.5.3',
    candidateVersion: '1.5.4',
  }));
  assert.equal(packageStates.length, 44);
  const markerChanges = [
    ...changesets.map((path) => ({ status: 'D', path })),
    ...packageStates.flatMap(({ manifestPath }) => [
      { status: 'M', path: manifestPath },
      { status: 'M', path: manifestPath.replace(/package\.json$/u, 'CHANGELOG.md') },
    ]),
    ...[
      'docs/meta/security/sbom.cdx.json',
      'package.json',
      'tools/create-stynx-app/template/package.json',
      'packages/pdf/README.md',
      'packages/pdf-a/README.md',
      'packages/pdf-a-vera-docker/README.md',
    ].map((path) => ({ status: 'M', path })),
  ];
  const input = {
    baseRootVersion: '1.5.3',
    markerParentRootVersion: '1.5.3',
    candidateRootVersion: '1.5.4',
    markerCommits: [
      { sha: 'a'.repeat(40), subject: 'docs(repo): govern the 1.5.4 stable patch candidate' },
      { sha: 'b'.repeat(40), subject: 'chore(repo): version fixed group to 1.5.4' },
      { sha: 'c'.repeat(40), subject: 'fix(repo): classify the exact 1.5.4 release candidate' },
    ],
    markerChanges,
    // The parent tree lists its changesets in path order; the classifier binds the set.
    markerParentChangesets: [...changesets].reverse(),
    followUpChanges: [
      { status: 'M', path: 'law/policy/forbidden-action-authorizations.json' },
      { status: 'M', path: 'law/policy/registry-version-anomalies.json' },
      { status: 'M', path: 'law/trace.json' },
      { status: 'M', path: 'scripts/lib/registry-version-policy.mjs' },
      { status: 'M', path: 'scripts/lib/release-context.mjs' },
      { status: 'M', path: 'scripts/run-release-preparation.mjs' },
      { status: 'M', path: 'test/scripts/local-rc-blocker-contract.test.mjs' },
      { status: 'M', path: 'test/scripts/release-version-policy.test.mjs' },
    ],
    rootManifestMatchesMarker: true,
    packageStates,
    changesetIdsOnDisk: [],
    preState: null,
    markerParentPreState: null,
  };
  assert.equal(isFourthStablePatchVersionedCandidate(input), true);
  assert.equal(isThirdStablePatchVersionedCandidate(input), false);
  assert.equal(isSecondStablePatchVersionedCandidate(input), false);

  for (const [label, mutate] of [
    [
      'base is not the published 1.5.3 main',
      (value) => {
        value.baseRootVersion = '1.5.2';
      },
    ],
    [
      'wrong parent root version',
      (value) => {
        value.markerParentRootVersion = '1.5.2';
      },
    ],
    [
      'wrong candidate root version',
      (value) => {
        value.candidateRootVersion = '1.5.5';
      },
    ],
    [
      'wrong marker subject',
      (value) => {
        value.markerCommits[1].subject = 'chore(repo): version fixed group to 1.5.3';
      },
    ],
    [
      'marker first',
      (value) => {
        value.markerCommits.shift();
      },
    ],
    [
      'duplicate marker',
      (value) => {
        value.markerCommits.push({
          sha: 'd'.repeat(40),
          subject: 'chore(repo): version fixed group to 1.5.4',
        });
      },
    ],
    [
      'one changeset missing from the parent',
      (value) => {
        value.markerParentChangesets.pop();
      },
    ],
    [
      'extra parent changeset',
      (value) => {
        value.markerParentChangesets.push('.changeset/late-change.md');
      },
    ],
    [
      'one changeset deletion missing',
      (value) => {
        value.markerChanges.shift();
      },
    ],
    [
      'missing package manifest',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== value.packageStates[0].manifestPath,
        );
      },
    ],
    [
      'missing generated support path',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== 'packages/pdf/README.md',
        );
      },
    ],
    [
      'extra generated path',
      (value) => {
        value.markerChanges.push({ status: 'M', path: 'packages/core/README.md' });
      },
    ],
    [
      'one stale package version',
      (value) => {
        value.packageStates[0].candidateVersion = '1.5.3';
      },
    ],
    [
      'one wrong parent package version',
      (value) => {
        value.packageStates[0].parentVersion = '1.5.2';
      },
    ],
    [
      'pending changeset',
      (value) => {
        value.changesetIdsOnDisk.push('late-change');
      },
    ],
    [
      'pre mode retained',
      (value) => {
        value.preState = { mode: 'pre', tag: 'rc' };
      },
    ],
    [
      'source follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'packages/outbox/src/outbox.service.ts' });
      },
    ],
    [
      'migration follow-up',
      (value) => {
        value.followUpChanges.push({
          status: 'A',
          path: 'packages/data/migrations/platform/0025_late.sql',
        });
      },
    ],
    [
      'workflow follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: '.github/workflows/release.yml' });
      },
    ],
    [
      'root manifest follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'package.json' });
      },
    ],
    [
      'unrelated law follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'law/adr/unrelated.md' });
      },
    ],
    [
      'second-patch Semgrep follow-up is not carried over',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: '.semgrepignore' });
      },
    ],
    [
      'missing exact root binding',
      (value) => {
        value.rootManifestMatchesMarker = false;
      },
    ],
    [
      'deleted follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'D', path: 'law/trace.json' });
      },
    ],
  ]) {
    const invalid = structuredClone(input);
    mutate(invalid);
    assert.equal(isFourthStablePatchVersionedCandidate(invalid), false, label);
  }
});

test('stable 1.5.5 patch context consumes exactly the one pending changeset from the unpublished 1.5.4 base', () => {
  const changesets = ['.changeset/pdf-handlebars-advisories.md'];
  const packageStates = collectPublicPackages(repoRoot).map(({ name, manifestPath }) => ({
    name,
    manifestPath: relative(repoRoot, manifestPath),
    parentVersion: '1.5.4',
    candidateVersion: '1.5.5',
  }));
  assert.equal(packageStates.length, 44);
  const markerChanges = [
    ...changesets.map((path) => ({ status: 'D', path })),
    ...packageStates.flatMap(({ manifestPath }) => [
      { status: 'M', path: manifestPath },
      { status: 'M', path: manifestPath.replace(/package\.json$/u, 'CHANGELOG.md') },
    ]),
    ...[
      'docs/meta/security/sbom.cdx.json',
      'package.json',
      'tools/create-stynx-app/template/package.json',
      'packages/pdf/README.md',
      'packages/pdf-a/README.md',
      'packages/pdf-a-vera-docker/README.md',
    ].map((path) => ({ status: 'M', path })),
  ];
  const input = {
    baseRootVersion: '1.5.4',
    markerParentRootVersion: '1.5.4',
    candidateRootVersion: '1.5.5',
    markerCommits: [
      { sha: 'a'.repeat(40), subject: 'docs(repo): govern the 1.5.5 stable patch candidate' },
      { sha: 'b'.repeat(40), subject: 'chore(repo): version fixed group to 1.5.5' },
      { sha: 'c'.repeat(40), subject: 'fix(repo): classify the exact 1.5.5 release candidate' },
    ],
    markerChanges,
    // The parent tree lists its changesets in path order; the classifier binds the set.
    markerParentChangesets: [...changesets].reverse(),
    followUpChanges: [
      { status: 'M', path: 'law/policy/forbidden-action-authorizations.json' },
      { status: 'M', path: 'law/policy/registry-version-anomalies.json' },
      { status: 'M', path: 'law/trace.json' },
      { status: 'M', path: 'scripts/lib/registry-version-policy.mjs' },
      { status: 'M', path: 'scripts/lib/release-context.mjs' },
      { status: 'M', path: 'scripts/run-release-preparation.mjs' },
      { status: 'M', path: 'test/scripts/local-rc-blocker-contract.test.mjs' },
      { status: 'M', path: 'test/scripts/release-version-policy.test.mjs' },
    ],
    rootManifestMatchesMarker: true,
    packageStates,
    changesetIdsOnDisk: [],
    preState: null,
    markerParentPreState: null,
  };
  assert.equal(isFifthStablePatchVersionedCandidate(input), true);
  assert.equal(isSixthStablePatchVersionedCandidate(input), false);
  assert.equal(isFourthStablePatchVersionedCandidate(input), false);
  assert.equal(isThirdStablePatchVersionedCandidate(input), false);
  assert.equal(isSecondStablePatchVersionedCandidate(input), false);

  for (const [label, mutate] of [
    [
      'base is not the 1.5.4 main',
      (value) => {
        value.baseRootVersion = '1.5.3';
      },
    ],
    [
      'wrong parent root version',
      (value) => {
        value.markerParentRootVersion = '1.5.3';
      },
    ],
    [
      'wrong candidate root version',
      (value) => {
        value.candidateRootVersion = '1.5.6';
      },
    ],
    [
      'wrong marker subject',
      (value) => {
        value.markerCommits[1].subject = 'chore(repo): version fixed group to 1.5.4';
      },
    ],
    [
      'marker first',
      (value) => {
        value.markerCommits.shift();
      },
    ],
    [
      'duplicate marker',
      (value) => {
        value.markerCommits.push({
          sha: 'd'.repeat(40),
          subject: 'chore(repo): version fixed group to 1.5.5',
        });
      },
    ],
    [
      'one changeset missing from the parent',
      (value) => {
        value.markerParentChangesets.pop();
      },
    ],
    [
      'extra parent changeset',
      (value) => {
        value.markerParentChangesets.push('.changeset/late-change.md');
      },
    ],
    [
      'one changeset deletion missing',
      (value) => {
        value.markerChanges.shift();
      },
    ],
    [
      'missing package manifest',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== value.packageStates[0].manifestPath,
        );
      },
    ],
    [
      'missing generated support path',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== 'packages/pdf/README.md',
        );
      },
    ],
    [
      'extra generated path',
      (value) => {
        value.markerChanges.push({ status: 'M', path: 'packages/core/README.md' });
      },
    ],
    [
      'one stale package version',
      (value) => {
        value.packageStates[0].candidateVersion = '1.5.4';
      },
    ],
    [
      'one wrong parent package version',
      (value) => {
        value.packageStates[0].parentVersion = '1.5.2';
      },
    ],
    [
      'pending changeset',
      (value) => {
        value.changesetIdsOnDisk.push('late-change');
      },
    ],
    [
      'pre mode retained',
      (value) => {
        value.preState = { mode: 'pre', tag: 'rc' };
      },
    ],
    [
      'source follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'packages/outbox/src/outbox.service.ts' });
      },
    ],
    [
      'migration follow-up',
      (value) => {
        value.followUpChanges.push({
          status: 'A',
          path: 'packages/data/migrations/platform/0025_late.sql',
        });
      },
    ],
    [
      'workflow follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: '.github/workflows/release.yml' });
      },
    ],
    [
      'root manifest follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'package.json' });
      },
    ],
    [
      'unrelated law follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'law/adr/unrelated.md' });
      },
    ],
    [
      'second-patch Semgrep follow-up is not carried over',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: '.semgrepignore' });
      },
    ],
    [
      'missing exact root binding',
      (value) => {
        value.rootManifestMatchesMarker = false;
      },
    ],
    [
      'deleted follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'D', path: 'law/trace.json' });
      },
    ],
  ]) {
    const invalid = structuredClone(input);
    mutate(invalid);
    assert.equal(isFifthStablePatchVersionedCandidate(invalid), false, label);
  }
});

test('stable 1.5.6 patch context consumes exactly the 4 pending changesets from the published 1.5.5 base', () => {
  const changesets = [
    '.changeset/ngsse-open-status.md',
    '.changeset/offline-sync-1-5-6-slice.md',
    '.changeset/outbox-named-destinations.md',
    '.changeset/signature-trust-profile-sets.md',
  ];
  const packageStates = collectPublicPackages(repoRoot).map(({ name, manifestPath }) => ({
    name,
    manifestPath: relative(repoRoot, manifestPath),
    parentVersion: '1.5.5',
    candidateVersion: '1.5.6',
  }));
  assert.equal(packageStates.length, 44);
  const markerChanges = [
    ...changesets.map((path) => ({ status: 'D', path })),
    ...packageStates.flatMap(({ manifestPath }) => [
      { status: 'M', path: manifestPath },
      { status: 'M', path: manifestPath.replace(/package\.json$/u, 'CHANGELOG.md') },
    ]),
    ...[
      'docs/meta/security/sbom.cdx.json',
      'package.json',
      'tools/create-stynx-app/template/package.json',
      'packages/pdf/README.md',
      'packages/pdf-a/README.md',
      'packages/pdf-a-vera-docker/README.md',
    ].map((path) => ({ status: 'M', path })),
  ];
  const input = {
    baseRootVersion: '1.5.5',
    markerParentRootVersion: '1.5.5',
    candidateRootVersion: '1.5.6',
    markerCommits: [
      { sha: 'a'.repeat(40), subject: 'docs(repo): govern the 1.5.6 stable patch candidate' },
      { sha: 'b'.repeat(40), subject: 'chore(repo): version fixed group to 1.5.6' },
      { sha: 'c'.repeat(40), subject: 'fix(repo): classify the exact 1.5.6 release candidate' },
    ],
    markerChanges,
    // The parent tree lists its changesets in path order; the classifier binds the set.
    markerParentChangesets: [...changesets].reverse(),
    followUpChanges: [
      { status: 'M', path: 'law/policy/forbidden-action-authorizations.json' },
      { status: 'M', path: 'law/policy/registry-version-anomalies.json' },
      { status: 'M', path: 'law/trace.json' },
      { status: 'M', path: 'scripts/lib/registry-version-policy.mjs' },
      { status: 'M', path: 'scripts/lib/release-context.mjs' },
      { status: 'M', path: 'scripts/run-release-preparation.mjs' },
      { status: 'M', path: 'test/scripts/local-rc-blocker-contract.test.mjs' },
      { status: 'M', path: 'test/scripts/release-version-policy.test.mjs' },
    ],
    rootManifestMatchesMarker: true,
    packageStates,
    changesetIdsOnDisk: [],
    preState: null,
    markerParentPreState: null,
  };
  assert.equal(isSixthStablePatchVersionedCandidate(input), true);
  assert.equal(isFifthStablePatchVersionedCandidate(input), false);
  assert.equal(isFourthStablePatchVersionedCandidate(input), false);
  assert.equal(isThirdStablePatchVersionedCandidate(input), false);
  assert.equal(isSecondStablePatchVersionedCandidate(input), false);

  for (const [label, mutate] of [
    [
      'base is not the published 1.5.5 main',
      (value) => {
        value.baseRootVersion = '1.5.4';
      },
    ],
    [
      'wrong parent root version',
      (value) => {
        value.markerParentRootVersion = '1.5.4';
      },
    ],
    [
      'wrong candidate root version',
      (value) => {
        value.candidateRootVersion = '1.5.7';
      },
    ],
    [
      'wrong marker subject',
      (value) => {
        value.markerCommits[1].subject = 'chore(repo): version fixed group to 1.5.5';
      },
    ],
    [
      'marker first',
      (value) => {
        value.markerCommits.shift();
      },
    ],
    [
      'duplicate marker',
      (value) => {
        value.markerCommits.push({
          sha: 'd'.repeat(40),
          subject: 'chore(repo): version fixed group to 1.5.6',
        });
      },
    ],
    [
      'one changeset missing from the parent',
      (value) => {
        value.markerParentChangesets.pop();
      },
    ],
    [
      'extra parent changeset',
      (value) => {
        value.markerParentChangesets.push('.changeset/late-change.md');
      },
    ],
    [
      'one changeset deletion missing',
      (value) => {
        value.markerChanges.shift();
      },
    ],
    [
      'missing package manifest',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== value.packageStates[0].manifestPath,
        );
      },
    ],
    [
      'missing generated support path',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== 'packages/pdf/README.md',
        );
      },
    ],
    [
      'extra generated path',
      (value) => {
        value.markerChanges.push({ status: 'M', path: 'packages/core/README.md' });
      },
    ],
    [
      'one stale package version',
      (value) => {
        value.packageStates[0].candidateVersion = '1.5.5';
      },
    ],
    [
      'one wrong parent package version',
      (value) => {
        value.packageStates[0].parentVersion = '1.5.4';
      },
    ],
    [
      'pending changeset',
      (value) => {
        value.changesetIdsOnDisk.push('late-change');
      },
    ],
    [
      'pre mode retained',
      (value) => {
        value.preState = { mode: 'pre', tag: 'rc' };
      },
    ],
    [
      'source follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'packages/outbox/src/outbox.service.ts' });
      },
    ],
    [
      'migration follow-up',
      (value) => {
        value.followUpChanges.push({
          status: 'A',
          path: 'packages/data/migrations/platform/0025_late.sql',
        });
      },
    ],
    [
      'workflow follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: '.github/workflows/release.yml' });
      },
    ],
    [
      'root manifest follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'package.json' });
      },
    ],
    [
      'unrelated law follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: 'law/adr/unrelated.md' });
      },
    ],
    [
      'second-patch Semgrep follow-up is not carried over',
      (value) => {
        value.followUpChanges.push({ status: 'M', path: '.semgrepignore' });
      },
    ],
    [
      'missing exact root binding',
      (value) => {
        value.rootManifestMatchesMarker = false;
      },
    ],
    [
      'deleted follow-up',
      (value) => {
        value.followUpChanges.push({ status: 'D', path: 'law/trace.json' });
      },
    ],
  ]) {
    const invalid = structuredClone(input);
    mutate(invalid);
    assert.equal(isSixthStablePatchVersionedCandidate(invalid), false, label);
  }
});

function seventhStablePatchFixture() {
  const changesets = [
    '.changeset/offline-sync-1-5-7-pending-review-context.md',
    '.changeset/outbox-configurable-app-role.md',
  ];
  const packageStates = collectPublicPackages(repoRoot).map(({ name, manifestPath }) => ({
    name,
    manifestPath: relative(repoRoot, manifestPath),
    parentVersion: '1.5.6',
    candidateVersion: '1.5.7',
  }));
  return {
    baseRootVersion: '1.5.6',
    markerParentRootVersion: '1.5.6',
    candidateRootVersion: '1.5.7',
    markerCommits: [
      { sha: 'a'.repeat(40), subject: 'docs(repo): govern the 1.5.7 stable patch candidate' },
      { sha: 'b'.repeat(40), subject: 'chore(repo): version fixed group to 1.5.7' },
      { sha: 'c'.repeat(40), subject: 'test(repo): bind the 1.5.7 release candidate' },
    ],
    markerChanges: [
      ...changesets.map((path) => ({ status: 'D', path })),
      ...packageStates.flatMap(({ manifestPath }) => [
        { status: 'M', path: manifestPath },
        { status: 'M', path: manifestPath.replace(/package\.json$/u, 'CHANGELOG.md') },
      ]),
      ...[
        'docs/meta/security/sbom.cdx.json',
        'package.json',
        'tools/create-stynx-app/template/package.json',
        'packages/pdf/README.md',
        'packages/pdf-a/README.md',
        'packages/pdf-a-vera-docker/README.md',
      ].map((path) => ({ status: 'M', path })),
    ],
    markerParentChangesets: [...changesets].reverse(),
    followUpChanges: [
      { status: 'M', path: 'law/policy/forbidden-action-authorizations.json' },
      { status: 'M', path: 'law/policy/registry-version-anomalies.json' },
      { status: 'M', path: 'law/trace.json' },
      { status: 'M', path: 'test/scripts/local-rc-blocker-contract.test.mjs' },
      { status: 'M', path: 'test/scripts/release-version-policy.test.mjs' },
    ],
    rootManifestMatchesMarker: true,
    packageStates,
    changesetIdsOnDisk: [],
    preState: null,
    markerParentPreState: null,
  };
}

test('stable 1.5.7 patch context accepts exactly the two feature changesets and 44 packages from published 1.5.6', () => {
  const input = seventhStablePatchFixture();
  assert.equal(input.packageStates.length, 44);
  assert.equal(input.markerParentChangesets.length, 2);
  assert.equal(isSeventhStablePatchVersionedCandidate(input), true);
  assert.equal(isSixthStablePatchVersionedCandidate(input), false);
  assert.equal(
    isSeventhStablePatchVersionedCandidate({ ...input, followUpChanges: [] }),
    true,
    'the version marker itself is sufficient without later evidence commits',
  );
});

test('stable 1.5.7 patch context rejects drift in release identity, marker, package population and follow-up scope', () => {
  const input = seventhStablePatchFixture();
  const mutations = [
    ['wrong published base', (value) => (value.baseRootVersion = '1.5.5')],
    ['wrong marker parent', (value) => (value.markerParentRootVersion = '1.5.5')],
    ['wrong candidate', (value) => (value.candidateRootVersion = '1.5.8')],
    ['missing parent changeset', (value) => value.markerParentChangesets.pop()],
    [
      'unexpected parent changeset',
      (value) => value.markerParentChangesets.push('.changeset/unrelated-feature.md'),
    ],
    ['unconsumed changeset', (value) => value.changesetIdsOnDisk.push('late-change')],
    ['missing changeset deletion', (value) => value.markerChanges.shift()],
    [
      'wrong marker version',
      (value) => (value.markerCommits[1].subject = 'chore(repo): version fixed group to 1.5.6'),
    ],
    [
      'extra version marker',
      (value) =>
        value.markerCommits.push({
          sha: 'd'.repeat(40),
          subject: 'chore(repo): version fixed group to 1.5.7',
        }),
    ],
    ['marker without preparation', (value) => value.markerCommits.shift()],
    ['missing package', (value) => value.packageStates.pop()],
    [
      'duplicate package identity',
      (value) => (value.packageStates[1].name = value.packageStates[0].name),
    ],
    [
      'duplicate package manifest',
      (value) => (value.packageStates[1].manifestPath = value.packageStates[0].manifestPath),
    ],
    ['stale package version', (value) => (value.packageStates[0].candidateVersion = '1.5.6')],
    ['wrong parent package version', (value) => (value.packageStates[0].parentVersion = '1.5.5')],
    [
      'missing package marker change',
      (value) => {
        value.markerChanges = value.markerChanges.filter(
          ({ path }) => path !== value.packageStates[0].manifestPath,
        );
      },
    ],
    ['root bytes changed after marker', (value) => (value.rootManifestMatchesMarker = false)],
    ['prerelease state retained', (value) => (value.preState = { mode: 'pre', tag: 'rc' })],
  ];
  for (const path of [
    'packages/offline-sync/src/offline-sync.service.ts',
    'packages/offline-sync/migrations/0005_unreviewed.sql',
    '.github/workflows/release.yml',
    'package.json',
    'law/adr/unrelated.md',
    'test/scripts/unrelated.test.mjs',
  ]) {
    mutations.push([
      `unapproved post-marker path: ${path}`,
      (value) => value.followUpChanges.push({ status: 'M', path }),
    ]);
  }
  for (const [label, mutate] of mutations) {
    const invalid = structuredClone(input);
    mutate(invalid);
    assert.equal(isSeventhStablePatchVersionedCandidate(invalid), false, label);
  }
});

test('Semgrep ignore list preserves build exclusions and only exact public PKI fixture keys', () => {
  const entries = readFileSync(join(repoRoot, '.semgrepignore'), 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

  assert.deepEqual(entries, [
    'dist/',
    'build/',
    'coverage/',
    'node_modules/',
    '.turbo/',
    '.changeset/release-drafts/',
    'docs/.docusaurus/',
    'docs/.generated/',
    'docs/build/',
    'infra/cdk/cdk.out/',
    'reference/api/dist/',
    'reference/web/dist/',
    'packages/**/dist/',
    'packages-web/**/dist/',
    'packages/signature/test/fixtures/pki/root.key.pem',
    'packages/signature/test/fixtures/pki/signer.key.pem',
    'packages/signature/test/fixtures/pki/spoof.key.pem',
    'packages/signature/test/fixtures/pki/tsa.key.pem',
    'packages/signature/test/fixtures/pki/bad-responder.key.pem',
    'packages/signature/test/fixtures/pki/chain-signer.key.pem',
    'packages/signature/test/fixtures/pki/expired-tsa.key.pem',
    'packages/signature/test/fixtures/pki/intermediate.key.pem',
    'packages/signature/test/fixtures/pki/root2.key.pem',
    'packages/signature/test/fixtures/pki/signer2.key.pem',
    'packages/signature/test/fixtures/pki/tsa2.key.pem',
  ]);
});

test('release preparation routes the final candidate to empty status and skips consumed drafts', () => {
  const source = repositorySource('scripts/run-release-preparation.mjs');
  assert.match(source, /isFinalVersionedCandidate/u);
  assert.match(
    source,
    /if \(context\.kind === 'ordinary'\) \{\s*run\('pnpm', \[\s*'exec',\s*'changeset',\s*'status'/u,
  );
  assert.match(source, /JSON\.stringify\(\{ changesets: \[\], releases: \[\] \}, null, 2\)/u);
  assert.match(
    source,
    /if \(context\.kind === 'ordinary'\) \{\s*run\('pnpm', \['run', 'release:drafts'\]\)/u,
  );
});

test('version rebaseline permits only the three generated dependency README consequences', () => {
  assert.match(
    repositorySource('scripts/run-release-preparation.mjs'),
    /const expectedManifestSet = new Set\(expectedManifests\);[\s\S]*expectedManifestSet\.has\(path\)/u,
  );
  const context = {
    baseCommit: preparedBaseCommit,
    headCommit: preparedHeadCommit,
    commits: [{ sha: preparedHeadCommit, subject: 'ci: version packages' }],
    versionParent: preparedBaseCommit,
    versionChanges: [
      { status: 'M', path: 'packages/pdf/package.json' },
      { status: 'M', path: 'packages/pdf/CHANGELOG.md' },
      { status: 'M', path: 'packages/pdf/README.md' },
      { status: 'M', path: 'packages/pdf-a/README.md' },
      { status: 'M', path: 'packages/pdf-a-vera-docker/README.md' },
    ],
    followUpChanges: [],
    rootManifestFollowUpValid: false,
    versionRebaselineValid: true,
  };

  assert.deepEqual(classifyReleaseContext(context), {
    kind: 'version-pr',
    baseCommit: preparedBaseCommit,
    headCommit: preparedHeadCommit,
    versionCommit: preparedHeadCommit,
    changesetCount: 0,
    packageCount: 1,
    rebaseline: true,
  });

  const unrelatedReadme = structuredClone(context);
  unrelatedReadme.versionChanges.push({ status: 'M', path: 'packages/core/README.md' });
  assert.throws(
    () => classifyReleaseContext(unrelatedReadme),
    (error) =>
      error instanceof ReleaseContextError && error.code === 'RELEASE_CONTEXT_VERSION_DIFF',
  );
});

test('Architect policy and workspace structurally define exactly 44/44/0', () => {
  const { roster: mutationRoster, failures: mutationFailures } = discoverMutationRoster(repoRoot);
  const mutationNames = mutationRoster.map(({ packageName }) => packageName).sort();
  assert.equal(registryVersionPolicyConstants.packageCount, 44);
  assert.equal(packageNames.length, 44);
  assert.equal(new Set(packageNames).size, 44);
  assert.equal(publishedPackageNames.length, 44);
  assert.deepEqual([...packageRoster.publishable_packages].sort(), packageNames);
  assert.deepEqual([...packageRoster.existing_private_packages].sort(), publishedPackageNames);
  assert.deepEqual(mutationFailures, []);
  assert.equal(mutationNames.length, 38);
  assert.deepEqual([...packageRoster.mutation_packages].sort(), mutationNames);
  assert.deepEqual([...packageRoster.approved_first_publications].sort(), firstPublicationNames);
  assert.equal(packageRoster.counts.publishable, 44);
  assert.equal(packageRoster.counts.mutation, 38);
  assert.equal(packageRoster.counts.existing_private, 44);
  assert.equal(packageRoster.counts.approved_first_publications, 0);
});

test('final registry policy candidate equals the root and all 44 publishable manifest versions', () => {
  const candidate = currentCandidate;
  const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const publishablePackages = collectPublicPackages(repoRoot);

  assert.equal(registryVersionPolicyConstants.candidate, candidate);
  assert.equal(registryVersionPolicyConstants.previousCandidate, previousCandidate);
  assert.equal(anomalyPolicy.next_unified_version, candidate);
  assert.equal(anomalyPolicy.anomalies[0].allowed_candidate, candidate);
  assert.equal(rootManifest.version, candidate);
  assert.equal(publishablePackages.length, 44);
  for (const { manifest } of publishablePackages) {
    assert.equal(manifest.version, candidate, `${manifest.name} must match the registry candidate`);
  }
});

function assertGovernedMutationFloor({ roster, failures }) {
  const expectedNames = [...packageRoster.mutation_packages].sort();
  const actualNames = roster.map(({ packageName }) => packageName).sort();
  assert.deepEqual(failures, []);
  assert.equal(roster.length, 38);
  assert.equal(new Set(actualNames).size, 38);
  assert.deepEqual(actualNames, expectedNames);
  for (const { packageName, thresholds } of roster) {
    assert.equal(thresholds.break, 90, `${packageName}: mutation break must resolve to 90`);
    assert.ok(
      [
        [90, 90, 80],
        [90, 95, 85],
        [90, 100, 90],
      ].some(
        ([breakThreshold, high, low]) =>
          thresholds.break === breakThreshold && thresholds.high === high && thresholds.low === low,
      ),
      `${packageName}: mutation reporting bands must resolve to a governed tier`,
    );
  }
}

test('complete discovered mutation roster resolves the governed break=90 floor', () => {
  const discovered = discoverMutationRoster(repoRoot);
  assertGovernedMutationFloor(discovered);

  const mutations = [
    ({ roster }) => roster.pop(),
    ({ roster }) => roster.push({ ...roster[0], packageName: '@stynx-nyx/extra' }),
    ({ roster }) => roster.push(structuredClone(roster[0])),
    ({ roster }) => {
      roster[0].thresholds.break = 89;
    },
    ({ roster }) => {
      roster[0].thresholds.break = 91;
    },
    ({ failures }) => failures.push('unknown mutation policy unresolved'),
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(discovered);
    mutate(candidate);
    assert.throws(() => assertGovernedMutationFloor(candidate), assert.AssertionError);
  }
});

test('complete authenticated registry and inventory census returns 44/44/0', () => {
  const census = validRegistryCensus();
  for (const name of packageNames) {
    assert.ok(
      Object.hasOwn(census.get(name).metadata.versions, previousCandidate),
      `${name} must retain RC2`,
    );
    assert.equal(
      census.get(name).metadata['dist-tags'].rc,
      previousCandidate,
      `${name} must advertise RC2`,
    );
  }
  assert.deepEqual(validate(), {
    anomalyMatches: 1,
    absentPackageCount: 0,
    packageCount: 44,
    publishedPackageCount: 44,
  });
});

test('legitimate 1.1.0 history and the exact angular-profile 2.0.0 anomaly are accepted', () => {
  const result = validate();
  assert.equal(result.anomalyMatches, 1);
  assert.equal(result.publishedPackageCount, 44);
});

test('unadjudicated, missing, broadened, altered, or unmatched anomaly policy fails closed', () => {
  const unadjudicatedMajor = validRegistryCensus();
  unadjudicatedMajor.set(
    '@stynx-nyx/sessions',
    publishedRegistryState('@stynx-nyx/sessions', ['1.1.0', previousCandidate, '2.0.0']),
  );
  assertPolicyError(
    () => validate({ registryStatesByPackage: unadjudicatedMajor }),
    'REGISTRY_UNADJUDICATED_VERSION',
  );

  const missingExactAnomaly = validRegistryCensus();
  missingExactAnomaly.set(
    '@stynx-nyx/angular-profile',
    publishedRegistryState('@stynx-nyx/angular-profile', ['1.0.0', '1.1.0', previousCandidate]),
  );
  assertPolicyError(
    () => validate({ registryStatesByPackage: missingExactAnomaly }),
    'REGISTRY_ANOMALY_UNMATCHED',
  );

  const doubledPolicy = structuredClone(anomalyPolicy);
  doubledPolicy.anomalies.push(structuredClone(doubledPolicy.anomalies[0]));
  assertPolicyError(
    () => validate({ anomalyPolicy: doubledPolicy }),
    'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
  );

  const broadened = structuredClone(anomalyPolicy);
  broadened.anomalies[0].applies_to_other_packages = true;
  assertPolicyError(
    () => validate({ anomalyPolicy: broadened }),
    'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
  );

  const altered = structuredClone(anomalyPolicy);
  altered.anomalies[0].version = '2.0.1';
  assertPolicyError(
    () => validate({ anomalyPolicy: altered }),
    'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
  );

  assertPolicyError(() => validate({ candidate: '1.1.2' }), 'REGISTRY_CANDIDATE_UNSUPPORTED');
});

test('first-publication exceptions reject extra, reopened, renamed, and wrong-candidate policy', () => {
  const mutations = [
    (policy) => policy.approved_first_publications.push('@stynx-nyx/extra'),
    (policy) => {
      policy.approved_first_publications = ['@stynx-nyx/jobs'];
    },
    (policy) => {
      policy.approved_first_publications[0] = '@stynx-nyx/jobs-renamed';
    },
    (policy) => {
      policy.candidate.version = '1.1.2';
    },
  ];
  for (const mutate of mutations) {
    const policy = structuredClone(campaignPolicy);
    mutate(policy);
    assertPolicyError(
      () => validate({ campaignPolicy: policy }),
      'REGISTRY_FIRST_PUBLICATION_POLICY_UNSUPPORTED',
    );
  }
});

test('roster drift, incomplete census, malformed metadata, and unsupported versions fail closed', () => {
  assertPolicyError(
    () => validate({ packageNames: packageNames.slice(1) }),
    'REGISTRY_ROSTER_DRIFT',
  );

  const partial = validRegistryCensus();
  partial.delete('@stynx-nyx/sessions');
  assertPolicyError(
    () => validate({ registryStatesByPackage: partial }),
    'REGISTRY_CENSUS_INCOMPLETE',
  );

  const malformed = validRegistryCensus();
  malformed.get('@stynx-nyx/sessions').metadata.name = '@stynx-nyx/other';
  assertPolicyError(
    () => validate({ registryStatesByPackage: malformed }),
    'REGISTRY_METADATA_MALFORMED',
  );

  const unsupportedVersion = validRegistryCensus();
  unsupportedVersion.set(
    '@stynx-nyx/sessions',
    publishedRegistryState('@stynx-nyx/sessions', ['1.1.0', previousCandidate, 'v1.1.1']),
  );
  assertPolicyError(
    () => validate({ registryStatesByPackage: unsupportedVersion }),
    'REGISTRY_VERSION_UNSUPPORTED',
  );
});

test('registry and authenticated inventory must be complete and agree exactly', () => {
  const unauthenticatedObservation = validRegistryCensus();
  unauthenticatedObservation.get('@stynx-nyx/sessions').authenticated = false;
  assertPolicyError(
    () => validate({ registryStatesByPackage: unauthenticatedObservation }),
    'REGISTRY_AUTH_MISSING',
  );

  const missingPackage = validRegistryCensus();
  missingPackage.set('@stynx-nyx/sessions', absentRegistryState());
  assertPolicyError(
    () => validate({ registryStatesByPackage: missingPackage }),
    'REGISTRY_UNAPPROVED_ABSENCE',
  );

  const disagreement = validInventory();
  disagreement.packageNames.push('@stynx-nyx/extra');
  assertPolicyError(
    () => validate({ githubPackagesInventory: disagreement }),
    'REGISTRY_INVENTORY_DISAGREEMENT',
  );

  const incomplete = validInventory();
  incomplete.complete = false;
  assertPolicyError(
    () => validate({ githubPackagesInventory: incomplete }),
    'REGISTRY_INVENTORY_INCOMPLETE',
  );

  const unauthenticated = validInventory();
  unauthenticated.authenticated = false;
  assertPolicyError(
    () => validate({ githubPackagesInventory: unauthenticated }),
    'REGISTRY_AUTH_MISSING',
  );
});

test('authenticated census fails closed on missing auth, authentication failure, and timeout', async () => {
  await assert.rejects(
    fetchRegistryCensus({ packageNames, token: '' }),
    (error) => error.code === 'REGISTRY_AUTH_MISSING',
  );

  const syntheticToken = `ghp_${'A'.repeat(36)}`;
  await assert.rejects(
    fetchRegistryCensus({
      packageNames,
      token: syntheticToken,
      fetchImpl: async () => ({ ok: false, status: 401 }),
    }),
    (error) => {
      assert.equal(error.code, 'REGISTRY_REQUEST_FAILED');
      assert.doesNotMatch(error.message, new RegExp(syntheticToken, 'u'));
      return true;
    },
  );

  await assert.rejects(
    fetchRegistryCensus({
      packageNames,
      token: syntheticToken,
      fetchImpl: async () => {
        throw new DOMException('timed out', 'TimeoutError');
      },
    }),
    (error) => error.code === 'REGISTRY_REQUEST_FAILED',
  );
});

test('authenticated census rejects malformed metadata and unsupported HTTP status', async () => {
  const syntheticToken = `ghp_${'B'.repeat(36)}`;
  await assert.rejects(
    fetchRegistryCensus({
      packageNames: ['@stynx-nyx/sessions'],
      token: syntheticToken,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => Promise.reject() }),
    }),
    (error) => error.code === 'REGISTRY_METADATA_MALFORMED',
  );

  await assert.rejects(
    fetchRegistryCensus({
      packageNames: ['@stynx-nyx/sessions'],
      token: syntheticToken,
      fetchImpl: async () => ({ ok: false, status: 418 }),
    }),
    (error) => error.code === 'REGISTRY_REQUEST_FAILED',
  );
});

test('Architect anomaly policy is required at its exact approved digest', () => {
  // The next unified candidate must be explicitly bound in the Architect
  // policy; 1.2.0 remains historical rebaseline data.
  assert.equal(currentCandidate, '1.5.6');
  assert.equal(anomalyPolicy.next_unified_version, currentCandidate);
  assert.equal(anomalyPolicy.owner_decision.date, '2026-10-10');
  assert.equal(
    anomalyPolicy.owner_decision.repository_baseline,
    'f3edd68f7c5c78c9e614b3b70629b5ec76959049',
  );
  assert.equal(
    anomalyPolicy.owner_decision.repository_tree,
    '3e338000650a34ff4bb767e393a69c257c48a6be',
  );
  assert.deepEqual(anomalyPolicy.owner_decision.supersedes, {
    date: '2026-10-08',
    next_unified_version: '1.5.5',
  });
  for (const phrase of [
    '44',
    previousCandidate,
    currentCandidate,
    'exact-main-SHA',
    'rc',
    'latest',
    preflightLatest,
  ]) {
    assert.ok(
      anomalyPolicy.owner_decision.statement.includes(phrase),
      `Owner statement must name ${phrase}`,
    );
  }
  assert.equal(anomalyPolicy.preflight_latest_version, preflightLatest);
  assert.notEqual(currentCandidate, unifiedRebaselineTarget);
  const anomaly = loadRegistryAnomalyPolicy(repoRoot, currentCandidate);
  assert.equal(anomaly.allowed_candidate, currentCandidate);
  for (const phrase of [
    '44',
    currentCandidate,
    previousCandidate,
    'rc',
    'latest',
    'angular-profile 2.0.0',
    'immutable',
  ]) {
    assert.ok(anomaly.closure_condition.includes(phrase), `closure condition must name ${phrase}`);
  }
  const recordedRc2Anomaly = {
    anomaly_id: 'REGISTRY-VERSION-ANOMALY-0001',
    package: '@stynx-nyx/angular-profile',
    version: '2.0.0',
    github_package_version_id: 1024692931,
    classification: 'erroneous-semver-publication',
    evidence: {
      npm_integrity:
        'sha512-YVcTjo0jNNdn9/Xb2M5b/aeOjkU4fAPyYWsWuW0DFjOh+DJG87meWwfUbFBUgZiS6ZFntnaSOi9MHqrAGMXXtw==',
      tarball_sha256: '7cefacd0535d0f5e7398a8a5d1e44d29415dd4aa234269d36eb28c97f25b7aee',
      observed_at: '2026-08-24T02:04:20.663Z',
    },
    rationale:
      'The Owner adjudicated 2.0.0 as an incorrect major assignment rather than a canonical STYNX 2.x decision.',
    allowed_candidate: previousCandidate,
    allowed_effects: ['registry-monotonicity-exception'],
    permitted_remediation: ['retain-as-noncanonical-history'],
    deletion_requires: 'new-owner-authorization-naming-version-id-and-recovery-evidence',
    deprecation_requires: 'new-owner-authorization-naming-package-version-action-and-message',
    closure_condition:
      'Unified 1.5.0-rc.2 is verified for all 44 publishable packages, rc resolves to 1.5.0-rc.2, latest remains at 1.4.0, and angular-profile 2.0.0 remains immutable non-canonical history.',
    applies_to_other_packages: false,
    applies_to_other_versions: false,
  };
  const unchangedAnomaly = structuredClone(anomalyPolicy.anomalies[0]);
  unchangedAnomaly.allowed_candidate = recordedRc2Anomaly.allowed_candidate;
  unchangedAnomaly.closure_condition = recordedRc2Anomaly.closure_condition;
  assert.deepEqual(unchangedAnomaly, recordedRc2Anomaly);
  assertPolicyError(
    () => loadRegistryAnomalyPolicy(repoRoot, previousCandidate),
    'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
  );
  assertPolicyError(
    () => loadRegistryAnomalyPolicy(repoRoot, unifiedRebaselineTarget),
    'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
  );

  const root = mkdtempSync(join(tmpdir(), 'stynx-anomaly-policy-'));
  try {
    assertPolicyError(
      () => loadRegistryAnomalyPolicy(root, currentCandidate),
      'REGISTRY_ANOMALY_POLICY_MISSING',
    );
    const policyPath = join(root, 'law', 'policy', 'registry-version-anomalies.json');
    mkdirSync(dirname(policyPath), { recursive: true });
    writeFileSync(policyPath, '{}\n');
    assertPolicyError(
      () => loadRegistryAnomalyPolicy(root, currentCandidate),
      'REGISTRY_ANOMALY_POLICY_MODIFIED',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createRebaselineFixture() {
  const root = mkdtempSync(join(tmpdir(), 'stynx-rebaseline-policy-'));
  const names = Array.from(
    { length: unifiedRebaselinePackageCount },
    (_, index) => `@stynx-nyx/fixture-${String(index).padStart(2, '0')}`,
  );
  writeJson(join(root, 'package.json'), {
    name: 'stynx-workspace',
    private: true,
    version: unifiedRebaselineSource,
  });
  writeJson(join(root, '.changeset', 'config.json'), {
    fixed: [names],
  });
  mkdirSync(join(root, 'packages-web'), { recursive: true });

  for (const [index, name] of names.entries()) {
    const packageDirectory = join(root, 'packages', `fixture-${String(index).padStart(2, '0')}`);
    const manifest = {
      name,
      version: unifiedRebaselineSource,
      dependencies:
        index === 0
          ? { [names[1]]: `^${unifiedRebaselineSource}`, [names[2]]: 'workspace:*' }
          : undefined,
    };
    writeJson(join(packageDirectory, 'package.json'), manifest);
    const priorTargetSection =
      index === 0
        ? `\n## ${unifiedRebaselineTarget}\n\n### Patch Changes\n\n- Preserve this unpublished historical note.\n`
        : '';
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(
      join(packageDirectory, 'CHANGELOG.md'),
      `# ${name}\n\n## 0.5.0\n\n- Existing history.\n${priorTargetSection}`,
    );
  }

  writeJson(join(root, 'tools', 'create-stynx-app', 'template', 'package.json'), {
    name: 'consumer-template',
    private: true,
    dependencies: { [names[0]]: `^${unifiedRebaselineSource}` },
  });
  writeJson(join(root, 'docs', 'meta', 'security', 'sbom.cdx.json'), {
    version: '0.5.0',
  });
  const sbomScript = join(root, 'scripts', 'generate-sbom.mjs');
  mkdirSync(dirname(sbomScript), { recursive: true });
  writeFileSync(
    sbomScript,
    [
      "import {readFileSync,writeFileSync} from 'node:fs';",
      "const root=JSON.parse(readFileSync('package.json','utf8'));",
      "const path='docs/meta/security/sbom.cdx.json';",
      "const expected=JSON.stringify({version:root.version},null,2)+'\\n';",
      "if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==expected)process.exit(1)}else{writeFileSync(path,expected)}",
      '',
    ].join('\n'),
  );
  return { names, root };
}

test('one-time rebaseline deterministically updates the exact 44-package release surface', () => {
  const fixture = createRebaselineFixture();
  try {
    const changesetConfig = JSON.parse(
      readFileSync(join(fixture.root, '.changeset', 'config.json'), 'utf8'),
    );
    const first = runUnifiedRebaseline(fixture.root, changesetConfig, 'write');
    assert.deepEqual(first, { packageCount: 44, changedFiles: 91 });
    assert.deepEqual(runUnifiedRebaseline(fixture.root, changesetConfig, 'check'), {
      packageCount: 44,
      changedFiles: 0,
    });
    assert.deepEqual(runUnifiedRebaseline(fixture.root, changesetConfig, 'write'), {
      packageCount: 44,
      changedFiles: 0,
    });

    const firstManifest = JSON.parse(
      readFileSync(join(fixture.root, 'packages', 'fixture-00', 'package.json'), 'utf8'),
    );
    assert.equal(firstManifest.version, unifiedRebaselineTarget);
    assert.equal(firstManifest.dependencies[fixture.names[1]], `^${unifiedRebaselineTarget}`);
    assert.equal(firstManifest.dependencies[fixture.names[2]], 'workspace:*');
    const template = JSON.parse(
      readFileSync(
        join(fixture.root, 'tools', 'create-stynx-app', 'template', 'package.json'),
        'utf8',
      ),
    );
    assert.equal(template.dependencies[fixture.names[0]], `^${unifiedRebaselineTarget}`);

    const changelog = readFileSync(
      join(fixture.root, 'packages', 'fixture-00', 'CHANGELOG.md'),
      'utf8',
    );
    const targetHeading = new RegExp(
      '^## ' + unifiedRebaselineTarget.split('.').join('\\.') + '$',
      'gmu',
    );
    assert.equal(changelog.match(targetHeading)?.length, 1);
    assert.match(changelog, /Unified Version Rebaseline/u);
    assert.match(changelog, /Preserve this unpublished historical note/u);
    assert.equal(expectedRebaselineChangelog(changelog, fixture.names[0]), changelog);

    const staleManifestPath = join(fixture.root, 'packages', 'fixture-01', 'package.json');
    const staleManifest = JSON.parse(readFileSync(staleManifestPath, 'utf8'));
    staleManifest.version = '1.1.0';
    writeJson(staleManifestPath, staleManifest);
    assert.throws(
      () => runUnifiedRebaseline(fixture.root, changesetConfig, 'check'),
      /root and all public package versions must be unified/u,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const repositorySource = (path) => readFileSync(join(repoRoot, path), 'utf8');

function publicWorkspaceManifests() {
  return ['packages', 'packages-web']
    .flatMap((directory) =>
      readdirSync(join(repoRoot, directory), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(repoRoot, directory, entry.name, 'package.json'))
        .filter(existsSync),
    )
    .map((path) => ({ path, manifest: JSON.parse(readFileSync(path, 'utf8')) }))
    .filter(({ manifest }) => packageNames.includes(manifest.name))
    .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
}

function executableFromPath(name) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {
      continue;
    }
  }
  return undefined;
}

function trackedPaths() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split('\0').filter(Boolean).sort();
}

function trackedProjection(root, paths) {
  return paths.map((path) => {
    const absolutePath = join(root, path);
    const stat = lstatSync(absolutePath);
    const bytes = stat.isSymbolicLink()
      ? Buffer.from(readlinkSync(absolutePath))
      : readFileSync(absolutePath);
    return {
      path,
      mode: stat.mode & 0o777,
      type: stat.isSymbolicLink() ? 'symlink' : 'file',
      digest: createHash('sha256').update(bytes).digest('hex'),
    };
  });
}

function cleanOperation(manifest) {
  const command = manifest.scripts?.clean;
  assert.equal(typeof command, 'string', `${manifest.name}: clean operation is required`);
  const rmMatch = /^rm -rf (dist(?: coverage)?)$/u.exec(command);
  if (rmMatch) {
    const executable = executableFromPath('rm');
    assert.ok(executable, `${manifest.name}: supported host rm must resolve`);
    assert.ok(isAbsolute(executable), `${manifest.name}: rm resolution must be absolute`);
    return { command, executable, args: ['-rf', ...rmMatch[1].split(' ')] };
  }

  const nodeMatch = /^node -e "([\s\S]+)"$/u.exec(command);
  assert.ok(nodeMatch, `${manifest.name}: unsupported clean command`);
  accessSync(process.execPath, constants.X_OK);
  const source = nodeMatch[1];
  assert.match(source, /require\(['"]node:fs['"]\)/u, `${manifest.name}: node:fs is required`);
  assert.match(source, /rmSync/u, `${manifest.name}: clean must remove outputs`);
  assert.match(source, /recursive\s*:\s*true/u, `${manifest.name}: recursive removal required`);
  assert.match(source, /force\s*:\s*true/u, `${manifest.name}: missing outputs must succeed`);
  assert.doesNotMatch(source, /(?:\.\.|\/|\\|src|generated)/u, `${manifest.name}: target escape`);
  assert.ok(
    /^const fs=require\(['"]node:fs['"]\); fs\.rmSync\(['"]dist['"],\{recursive:true,force:true\}\); fs\.rmSync\(['"]coverage['"],\{recursive:true,force:true\}\)$/u.test(
      source,
    ) ||
      /^for \(const path of \[['"]dist['"], ['"]coverage['"]\]\) require\(['"]node:fs['"]\)\.rmSync\(path, \{ recursive: true, force: true \}\)$/u.test(
        source,
      ),
    `${manifest.name}: node clean body must contain only the approved removals`,
  );
  const targets = [...source.matchAll(/['"](dist|coverage)['"]/gu)].map((match) => match[1]);
  assert.deepEqual([...new Set(targets)].sort(), ['coverage', 'dist']);
  return { command, executable: process.execPath, args: ['-e', source] };
}

function assertConfined(packageRoot, target, label) {
  const displacement = relative(realpathSync(packageRoot), realpathSync(target));
  assert.ok(
    displacement !== '' && !displacement.startsWith('..') && !isAbsolute(displacement),
    `${label}: target must remain inside its package`,
  );
  assert.equal(lstatSync(target).isSymbolicLink(), false, `${label}: symlink target is forbidden`);
}

test('all 44 package clean operations are confined, executable, idempotent, and tracked-tree preserving', () => {
  const manifests = publicWorkspaceManifests();
  const names = manifests.map(({ manifest }) => manifest.name);
  assert.equal(manifests.length, 44);
  assert.equal(new Set(names).size, 44);
  assert.deepEqual(names, [...packageRoster.publishable_packages].sort());

  const paths = trackedPaths();
  const trackedSet = new Set(paths);
  assert.ok(paths.some((path) => path.startsWith('packages-web/sdk/src/generated/')));
  const sharedBefore = trackedProjection(repoRoot, paths);
  const operations = manifests.map(({ path, manifest }) => {
    const packageRoot = dirname(path);
    const operation = cleanOperation(manifest);
    const targets = operation.args.filter(
      (argument) => argument === 'dist' || argument === 'coverage',
    );
    const declaredTargets = targets.length
      ? targets
      : [...operation.args.at(-1).matchAll(/['"](dist|coverage)['"]/gu)].map((match) => match[1]);
    assert.ok(declaredTargets.length > 0, `${manifest.name}: clean targets are required`);
    assert.equal(new Set(declaredTargets).size, declaredTargets.length);
    for (const target of declaredTargets) {
      assert.ok(['dist', 'coverage'].includes(target), `${manifest.name}: unapproved target`);
      const relativeTarget = relative(repoRoot, join(packageRoot, target));
      assert.equal(trackedSet.has(relativeTarget), false, `${manifest.name}: target is tracked`);
      assert.equal(
        paths.some((trackedPath) => trackedPath.startsWith(`${relativeTarget}/`)),
        false,
        `${manifest.name}: target contains tracked paths`,
      );
    }
    return {
      manifest,
      operation,
      relativePackageRoot: relative(repoRoot, packageRoot),
      declaredTargets,
    };
  });
  assert.equal(operations.length, 44);

  const fixtureRoot = mkdtempSync(join(tmpdir(), 'stynx-clean-contract-'));
  const fixtureDisplacement = relative(resolve(tmpdir()), fixtureRoot);
  assert.ok(fixtureDisplacement && !fixtureDisplacement.startsWith('..'));
  try {
    const archive = spawnSync('git', ['-C', repoRoot, 'archive', '--format=tar', 'HEAD'], {
      cwd: fixtureRoot,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.ifError(archive.error);
    assert.equal(archive.status, 0, archive.stderr.toString());
    const extracted = spawnSync('tar', ['-xf', '-'], {
      cwd: fixtureRoot,
      input: archive.stdout,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ifError(extracted.error);
    assert.equal(extracted.status, 0, extracted.stderr.toString());
    const fixtureBefore = trackedProjection(fixtureRoot, paths);
    assert.equal(fixtureBefore.length, paths.length);

    const seededExecutions = [];
    for (const { manifest, operation, relativePackageRoot, declaredTargets } of operations) {
      const packageRoot = join(fixtureRoot, relativePackageRoot);
      for (const target of declaredTargets) {
        const output = join(packageRoot, target);
        mkdirSync(output, { recursive: true });
        writeFileSync(join(output, 'd12-seeded-output.txt'), manifest.name);
        assertConfined(packageRoot, output, manifest.name);
      }
      const result = spawnSync(operation.executable, operation.args, {
        cwd: packageRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      assert.ifError(result.error);
      assert.equal(result.signal, null, `${manifest.name}: clean received a signal`);
      assert.equal(result.status, 0, `${manifest.name}: ${result.stderr || result.stdout}`);
      for (const target of declaredTargets)
        assert.equal(existsSync(join(packageRoot, target)), false);
      seededExecutions.push(manifest.name);
    }
    assert.deepEqual(seededExecutions, names, 'every seeded clean operation must execute once');

    const idempotenceExecutions = [];
    for (const { manifest, operation, relativePackageRoot } of operations) {
      const result = spawnSync(operation.executable, operation.args, {
        cwd: join(fixtureRoot, relativePackageRoot),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      assert.ifError(result.error);
      assert.equal(result.signal, null, `${manifest.name}: idempotence run received a signal`);
      assert.equal(result.status, 0, `${manifest.name}: idempotence failed`);
      idempotenceExecutions.push(manifest.name);
    }
    assert.deepEqual(idempotenceExecutions, names, 'every clean operation must be idempotent');
    assert.deepEqual(trackedProjection(fixtureRoot, paths), fixtureBefore);
  } finally {
    try {
      assert.deepEqual(trackedProjection(repoRoot, paths), sharedBefore);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
      assert.equal(existsSync(fixtureRoot), false);
    }
  }
});

function runNode(path, args = [], options = {}) {
  return spawnSync(process.execPath, [join(repoRoot, path), ...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('generated README dependency truth covers the exact 44-package manifest graph', () => {
  assert.match(rootManifest.scripts['package-readmes:write'] ?? '', /--write/u);
  assert.match(rootManifest.scripts['package-readmes:check'] ?? '', /--check/u);
  assert.match(rootManifest.scripts['release:policy'], /package-readmes:check/u);
  const generator = repositorySource('scripts/generate-package-readmes.mjs');
  for (const marker of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'devDependencies',
  ]) {
    assert.match(generator, new RegExp(marker, 'u'));
  }
  const check = runNode('scripts/generate-package-readmes.mjs', ['--check']);
  assert.equal(check.status, 0, check.stderr || check.stdout);
});

test('coverage is executable and reports four metrics for every one of the 44 packages', () => {
  assert.match(rootManifest.scripts['test:coverage'], /scripts\/run-coverage/u);
  assert.match(rootManifest.scripts['ci:stynx:release'], /test:coverage/u);
  const coverage = repositorySource('scripts/run-coverage.mjs');
  const coverageBase = repositorySource('tools/repo-config/vitest.base.mjs');
  assert.doesNotMatch(
    coverageBase,
    /^\s*'src\/index\.ts',\s*$/mu,
    'executable package entry points cannot be blanket-excluded from coverage',
  );
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'stynx-coverage-classifier-'));
  try {
    const cases = [
      ['pure-barrel', "export { value } from './value';\n", true],
      ['runtime-declaration', 'export const value = 1;\n', false],
      ['runtime-initializer', "export { value } from './value';\ninitialize();\n", false],
      ['invalid-syntax', 'export {\n', false],
      ['empty-entrypoint', '', false],
    ];
    for (const [name, source, excluded] of cases) {
      const packageDir = join(fixtureRoot, name);
      mkdirSync(join(packageDir, 'src'), { recursive: true });
      writeFileSync(join(packageDir, 'src', 'index.ts'), source);
      const config = createVitestConfig({ packageDir, packageName: `fixture-${name}` });
      assert.equal(
        config.test.coverage.exclude.includes('src/index.ts'),
        excluded,
        `${name}: executable, empty, or unparseable entrypoints must remain coverage-bearing`,
      );
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
  assert.match(coverage, /discoverPublishablePackages/u);
  for (const metric of ['branches', 'functions', 'lines', 'statements']) {
    assert.match(coverage, new RegExp(metric, 'u'));
  }
  const workspaces = publicWorkspaceManifests();
  assert.equal(workspaces.length, 44);
  for (const { manifest } of workspaces) {
    assert.match(
      manifest.scripts?.['test:coverage'] ?? '',
      /(?:vitest|jest|coverage)/u,
      `${manifest.name}: missing executable test:coverage command`,
    );
  }
});

test('D24.32 exact type-only coverage candidates fail closed and four configs bind shared coverage', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'stynx-coverage-type-only-'));
  try {
    const cases = [
      [
        'erased',
        "import type { Input } from './input';\nexport type { Output } from './output';\nexport interface Contract { value: Input }\ntype Local = string;\n",
        true,
      ],
      ['runtime-const', 'export const value = 1;\n', false],
      ['runtime-enum', 'export enum Value { One }\n', false],
      ['runtime-class', 'export class Value {}\n', false],
      ['runtime-namespace', 'export namespace Value { export const one = 1; }\n', false],
      ['side-effect-import', "import './runtime';\nexport interface Contract {}\n", false],
      ['value-export', "export { value } from './runtime';\n", false],
      ['invalid', 'export interface {\n', false],
      ['empty', '', false],
    ];
    for (const [name, source, excluded] of cases) {
      const packageDir = join(fixtureRoot, name);
      mkdirSync(join(packageDir, 'src'), { recursive: true });
      writeFileSync(join(packageDir, 'src', 'candidate.ts'), source);
      assert.deepEqual(
        typeOnlyCoverageExclusions({ packageDir, candidates: ['src/candidate.ts'] }),
        excluded ? ['src/candidate.ts'] : [],
        `${name}: ambiguous or executable candidates must remain coverage-bearing`,
      );
    }

    const missingRoot = join(fixtureRoot, 'missing');
    mkdirSync(join(missingRoot, 'src'), { recursive: true });
    assert.deepEqual(
      typeOnlyCoverageExclusions({ packageDir: missingRoot, candidates: ['src/missing.ts'] }),
      [],
    );
    const symlinkRoot = join(fixtureRoot, 'symlink');
    mkdirSync(join(symlinkRoot, 'src'), { recursive: true });
    writeFileSync(join(symlinkRoot, 'outside.ts'), 'export interface Contract {}\n');
    symlinkSync(join(symlinkRoot, 'outside.ts'), join(symlinkRoot, 'src/candidate.ts'));
    assert.deepEqual(
      typeOnlyCoverageExclusions({ packageDir: symlinkRoot, candidates: ['src/candidate.ts'] }),
      [],
    );
    assert.throws(() =>
      typeOnlyCoverageExclusions({ packageDir: missingRoot, candidates: ['../escape.ts'] }),
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }

  const exactCandidates = new Map([
    ['packages/idempotency', ['src/request-context.ts']],
    ['packages/ratelimit', ['src/request-context.ts']],
    ['packages/mobile-runtime', ['src/ports.ts']],
  ]);
  for (const [workspace, candidates] of exactCandidates) {
    assert.deepEqual(
      typeOnlyCoverageExclusions({ packageDir: join(repoRoot, workspace), candidates }),
      candidates,
      `${workspace}: exact erased-only candidate must remain mechanically classified`,
    );
  }

  for (const workspace of [
    'packages/idempotency',
    'packages/ratelimit',
    'packages/mobile-runtime',
    'packages/preferences',
  ]) {
    const source = repositorySource(`${workspace}/vitest.config.ts`);
    assert.match(source, /createVitestConfig/u);
    assert.match(source, /packageName:\s*['"]@stynx-nyx\//u);
    assert.doesNotMatch(source, /\bdefineConfig\b/u);
  }
  for (const workspace of exactCandidates.keys()) {
    const source = repositorySource(`${workspace}/vitest.config.ts`);
    assert.match(source, /typeOnlyCoverageExclusions/u);
  }

  const sentinel = createVitestConfig({
    packageDir: join(repoRoot, 'packages/mobile-runtime'),
    packageName: '@stynx-nyx/mobile-runtime',
  });
  assert.deepEqual(sentinel.test.coverage.include, ['src/**/*.ts']);
  assert.deepEqual(
    {
      statements: sentinel.test.coverage.thresholds.statements,
      branches: sentinel.test.coverage.thresholds.branches,
      functions: sentinel.test.coverage.thresholds.functions,
      lines: sentinel.test.coverage.thresholds.lines,
    },
    { statements: 100, branches: 100, functions: 100, lines: 100 },
  );
  assert.equal(sentinel.test.coverage.thresholds.autoUpdate, false);
  assert.equal('stryker-setup-1.js'.startsWith('src/'), false);
});

test('public API baselines exactly cover 44 packages including jobs, notifications, and outbox', () => {
  const baseline = JSON.parse(
    repositorySource('docs/framework/contracts/public-api-baselines.json'),
  );
  assert.deepEqual(
    Object.keys(baseline.packages).sort(),
    [...packageRoster.publishable_packages].sort(),
  );
  for (const name of ['@stynx-nyx/jobs', '@stynx-nyx/notifications', '@stynx-nyx/outbox']) {
    assert.ok(
      Object.keys(baseline.packages[name]?.declarationHashes ?? {}).length > 0,
      `${name}: missing public API baseline`,
    );
  }
  const check = runNode('scripts/verify-public-api-baselines.mjs');
  assert.equal(check.status, 0, check.stderr || check.stdout);
});

test('readiness-bearing RLS fails closed when live PostgreSQL observation is unavailable', () => {
  const isolatedEnvironment = { ...process.env, STYNX_RLS_LIVE_REQUIRED: '1' };
  for (const variable of [
    'DATABASE_URL',
    'STYNX_DATABASE_URL',
    'STYNX_TEST_DATABASE_URL',
    'STYNX_TEST_PG_HOST',
    'STYNX_TEST_PG_PASSWORD',
    'STYNX_TEST_PG_PORT',
    'STYNX_TEST_PG_SOCKET_DIR',
    'STYNX_TEST_PG_TEMPLATE',
    'STYNX_TEST_PG_USER',
    'PGDATABASE',
    'PGHOST',
    'PGHOSTADDR',
    'PGPASSFILE',
    'PGPASSWORD',
    'PGPORT',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGUSER',
  ]) {
    delete isolatedEnvironment[variable];
  }
  const check = spawnSync('bash', [join(repoRoot, 'scripts/check-rls-smoke.sh')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: isolatedEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const evidence = `${check.stdout}\n${check.stderr}`;
  assert.notEqual(check.status, 0, 'live-required RLS must not convert unavailable input to PASS');
  assert.match(evidence, /RLS_LIVE_(?:CONFIG|OBSERVATION)_MISSING/u);
  assert.doesNotMatch(evidence, /\[RLS\]\[missing\]/u);
});

test('sourcemap verification fails closed on an empty expected population', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'stynx-empty-sourcemaps-'));
  try {
    writeJson(join(fixture, 'tools', 'tsconfig', 'angular18.json'), {
      compilerOptions: { inlineSources: true },
    });
    mkdirSync(join(fixture, 'packages-web'), { recursive: true });
    const check = runNode('scripts/verify-web-sourcemaps.mjs', ['--repo-root', fixture]);
    assert.notEqual(check.status, 0, 'zero sourcemaps must not establish a readiness observation');
    assert.match(`${check.stdout}\n${check.stderr}`, /SOURCEMAP_(?:DIST_)?POPULATION_EMPTY/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('scenario=all hardening reaches every k6 scenario with authenticated fail-closed evidence', () => {
  const hardening = repositorySource('.github/workflows/hardening.yml');
  assert.match(hardening, /default:\s*all/u);
  for (const scenario of ['auth', 'crud', 'upload', 'cascade-delete']) {
    assert.match(hardening, new RegExp(`${scenario}.*summary`, 'su'));
  }
  assert.match(hardening, /github\.event_name == 'workflow_dispatch'/u);
  assert.match(hardening, /NODE_AUTH_TOKEN_FILE/u);
  assert.match(hardening, /healthz/u);
  assert.match(hardening, /scenarios=\(auth crud upload cascade-delete\)/u);
  assert.match(hardening, /for scenario in "\$\{scenarios\[@\]\}"/u);
  assert.match(
    hardening,
    /for scenario in[\s\S]*docker compose[^\n]+up -d --build[\s\S]*run-scenarios\.mjs --scenario "\$scenario"[\s\S]*docker compose[^\n]+down -v/u,
  );
  assert.doesNotMatch(hardening, /STYNX_K6_SCENARIO_PAUSE_MS/u);
  assert.match(hardening, /No current k6 summary files were produced/u);
});

test('live branch and release-tag protection drift are both fail-closed', () => {
  const protection = repositorySource('scripts/verify-branch-protection.mjs');
  for (const field of [
    'enforce_admins',
    'require_code_owner_reviews',
    'required_conversation_resolution',
  ]) {
    assert.match(protection, new RegExp(field, 'u'));
  }
  for (const marker of ['refs/tags', 'ruleset', 'required_status_checks']) {
    assert.match(protection, new RegExp(marker, 'iu'));
  }
});

test('publication uses an ordered 44-package plan, durable per-package receipts, and stop-first recovery', () => {
  const workflow = repositorySource('.github/workflows/release.yml');
  for (const marker of [
    'publication-plan',
    'publication-receipt',
    'candidate_tree',
    'integrity',
    'shasum',
    'stop-on-first-failure',
    'partial',
    'recovery',
  ]) {
    assert.match(workflow, new RegExp(marker, 'u'));
  }
  assert.match(workflow, /candidate_sha.*40-character/su);
  assert.match(workflow, /44/u);
  // The monotonicity step reads the candidate from the policy constant; the
  // workflow carries no per-release version literal.
  assert.match(workflow, /--registry-monotonicity --candidate-from-policy/u);
  assert.doesNotMatch(workflow, /--candidate \d+\.\d+\.\d+/u);
  const verifier = repositorySource('scripts/verify-release-policy.mjs');
  assert.match(verifier, /--candidate-from-policy/u);
  assert.match(verifier, /registryVersionPolicyConstants\.candidate/u);
});

test('final registry monotonicity accepts prerelease history and only its singular anomaly', () => {
  assert.equal(packageNames.length, 44);
  assert.equal(registryVersionPolicyConstants.candidate, currentCandidate);
  assert.equal(registryVersionPolicyConstants.previousCandidate, previousCandidate);
  assert.equal(registryVersionPolicyConstants.preflightLatestVersion, preflightLatest);
  assert.equal(anomalyPolicy.anomalies.length, 1);
  assert.deepEqual(
    anomalyPolicy.anomalies.map(({ package: name, version }) => [name, version]),
    [['@stynx-nyx/angular-profile', '2.0.0']],
  );

  for (const version of [
    '1.4.0',
    '1.5.0-rc.0',
    '1.5.0-rc.1',
    previousCandidate,
    '1.5.1',
    '1.5.2',
    '1.5.3',
  ]) {
    const history = validRegistryCensus();
    history.set(
      '@stynx-nyx/sessions',
      publishedRegistryState('@stynx-nyx/sessions', ['1.1.1', previousCandidate, version]),
    );
    assert.deepEqual(validate({ registryStatesByPackage: history }), {
      anomalyMatches: 1,
      absentPackageCount: 0,
      packageCount: 44,
      publishedPackageCount: 44,
    });
  }

  for (const [version, code] of [
    [currentCandidate, 'REGISTRY_CANDIDATE_EXISTS'],
    ['1.5.0-rc.4', null],
    ['1.6.0', 'REGISTRY_CANONICAL_LINE_NOT_MONOTONIC'],
    ['2.0.0', 'REGISTRY_UNADJUDICATED_VERSION'],
  ]) {
    const history = validRegistryCensus();
    history.set(
      '@stynx-nyx/sessions',
      publishedRegistryState('@stynx-nyx/sessions', ['1.1.1', previousCandidate, version]),
    );
    if (code === null) assert.doesNotThrow(() => validate({ registryStatesByPackage: history }));
    else assertPolicyError(() => validate({ registryStatesByPackage: history }), code);
  }

  for (const candidate of [
    '1.5.0-rc.1',
    previousCandidate,
    '1.5.0-rc.4',
    '1.5.1',
    '1.5.2',
    '1.5.3',
  ]) {
    assertPolicyError(
      () => loadRegistryAnomalyPolicy(repoRoot, candidate),
      'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
    );
    assertPolicyError(() => validate({ candidate }), 'REGISTRY_CANDIDATE_UNSUPPORTED');
  }
});

test('final registry census requires RC2 in every published package after version checks', () => {
  const missingPrevious = validRegistryCensus();
  missingPrevious.set(
    '@stynx-nyx/sessions',
    publishedRegistryState('@stynx-nyx/sessions', ['1.1.1']),
  );
  assertPolicyError(
    () => validate({ registryStatesByPackage: missingPrevious }),
    'REGISTRY_PREVIOUS_CANDIDATE_MISSING',
  );
  const candidateAlreadyExists = validRegistryCensus();
  candidateAlreadyExists.set(
    '@stynx-nyx/sessions',
    publishedRegistryState('@stynx-nyx/sessions', ['1.1.1', previousCandidate, currentCandidate]),
  );
  assertPolicyError(
    () => validate({ registryStatesByPackage: candidateAlreadyExists }),
    'REGISTRY_CANDIDATE_EXISTS',
  );
});

test('final policy bytes bind to the Architect stable decision before registry observation', () => {
  assert.doesNotThrow(() => loadRegistryAnomalyPolicy(repoRoot, currentCandidate));
});

test('RC2 publication uses only pure dist-tag helpers and preserves latest during rc publication', async () => {
  const publication = await import('../../scripts/lib/publication-dist-tag.mjs');
  const preState = { mode: 'pre', tag: 'rc', changesets: ['tenancy'] };
  assert.equal(publication.selectPublicationDistTag({ version: '1.5.0-rc.2', preState }), 'rc');
  assert.equal(
    publication.selectPublicationDistTag({ version: '1.5.0', preState: undefined }),
    'latest',
  );
  for (const input of [
    { version: '1.5.0-rc.2', preState: undefined },
    { version: '1.5.0-rc.2', preState: { ...preState, tag: 'beta' } },
    { version: '1.5.0-rc.2', preState: { ...preState, tag: 'latest' } },
    { version: '1.5.0', preState },
    { version: '1.5.0', preState: { ...preState, mode: 'exit' } },
  ]) {
    assert.throws(
      () => publication.selectPublicationDistTag(input),
      (error) => error?.code === 'PUBLICATION_DIST_TAG_INVALID',
    );
  }
  assert.deepEqual(
    publication.buildNpmPublishArgs({
      tarball: 'fixture.tgz',
      registry: 'https://npm.pkg.github.com',
      tag: 'rc',
      version: '1.5.0-rc.2',
    }),
    [
      'publish',
      'fixture.tgz',
      '--registry',
      'https://npm.pkg.github.com',
      '--tag',
      'rc',
      '--access',
      'restricted',
    ],
  );
  assert.throws(
    () =>
      publication.buildNpmPublishArgs({
        tarball: 'fixture.tgz',
        registry: 'https://npm.pkg.github.com',
        tag: 'latest',
        version: '1.5.0-rc.2',
      }),
    (error) => error?.code === 'PUBLICATION_DIST_TAG_INVALID',
  );
  assert.doesNotThrow(() =>
    publication.verifyPostPublishDistTags({
      candidate: '1.5.0-rc.2',
      preflightLatest: '1.4.0',
      preflightDistTags: { latest: '1.4.0', legacy: '0.9.0' },
      distTags: { latest: '1.4.0', rc: '1.5.0-rc.2', legacy: '0.9.0' },
    }),
  );
  assert.doesNotThrow(() =>
    publication.verifyPostPublishDistTags({
      candidate: '1.5.0-rc.2',
      preflightLatest: '1.4.0',
      preflightDistTags: { latest: '1.4.0', rc: '1.5.0-rc.1' },
      distTags: { latest: '1.4.0', rc: '1.5.0-rc.2' },
    }),
  );
  for (const [distTags, code] of [
    [{ latest: '1.4.0', legacy: '0.9.0' }, 'PUBLICATION_DIST_TAG_UNKNOWN'],
    [{ latest: '1.4.0', rc: '1.5.0-rc.2' }, 'PUBLICATION_DIST_TAG_DRIFT'],
    [{ latest: '1.5.0-rc.2', rc: '1.5.0-rc.2' }, 'PUBLICATION_DIST_TAG_DRIFT'],
    [{ latest: '1.4.0', rc: '1.5.0-rc.2', legacy: '0.9.1' }, 'PUBLICATION_DIST_TAG_DRIFT'],
  ]) {
    assert.throws(
      () =>
        publication.verifyPostPublishDistTags({
          candidate: '1.5.0-rc.2',
          preflightLatest: '1.4.0',
          preflightDistTags: { latest: '1.4.0', legacy: '0.9.0' },
          distTags,
        }),
      (error) => error?.code === code,
    );
  }
  assert.doesNotThrow(() =>
    publication.assertNoPendingPreChangesets({ preState, changesetIds: ['tenancy'] }),
  );
  assert.throws(
    () =>
      publication.assertNoPendingPreChangesets({
        preState,
        changesetIds: ['tenancy', 'future-ctg'],
      }),
    (error) => error?.code === 'PUBLICATION_DIST_TAG_INVALID',
  );

  const publisher = repositorySource('scripts/publish-release-plan.mjs');
  assert.match(publisher, /publication-dist-tag\.mjs/u);
  assert.match(publisher, /candidate_sha/u);
  assert.match(publisher, /candidate_tree/u);
  assert.match(publisher, /stop-on-first-failure/u);
});

test('final preflight requires the RC2 tag and stable latest on every package', async () => {
  const { validatePreflightDistTags } = await import('../../scripts/lib/publication-dist-tag.mjs');
  const publisher = repositorySource('scripts/publish-release-plan.mjs');
  assert.match(publisher, /preflightRc:\s*registryVersionPolicyConstants\.previousCandidate/u);
  const helperSource = repositorySource('scripts/lib/publication-dist-tag.mjs');
  assert.match(
    helperSource,
    /export function verifyPostPublishDistTags\(\{ candidate, preflightLatest, preflightDistTags, distTags \}\)/u,
  );
  const preflightLatest = registryVersionPolicyConstants.preflightLatestVersion;
  const preflightRc = previousCandidate;
  assert.equal(preflightLatest, '1.5.5');
  assert.deepEqual(
    validatePreflightDistTags({
      preflightLatest,
      preflightRc,
      distTags: { latest: preflightLatest, rc: previousCandidate, legacy: '0.9.0' },
    }),
    { latest: preflightLatest, rc: previousCandidate, legacy: '0.9.0' },
  );
  for (const latest of ['2.0.0', currentCandidate, '1.4.0']) {
    assert.throws(
      () =>
        validatePreflightDistTags({
          preflightLatest,
          preflightRc,
          distTags: { latest, rc: previousCandidate },
        }),
      (error) => error?.code === 'PUBLICATION_DIST_TAG_DRIFT',
    );
  }
  for (const distTags of [
    { rc: previousCandidate },
    null,
    [],
    {},
    { latest: 1 },
    { '': preflightLatest },
  ]) {
    assert.throws(
      () => validatePreflightDistTags({ preflightLatest, preflightRc, distTags }),
      (error) => error?.code === 'PUBLICATION_DIST_TAG_UNKNOWN',
    );
  }
  assert.throws(
    () =>
      validatePreflightDistTags({
        preflightLatest,
        preflightRc,
        distTags: { latest: preflightLatest },
      }),
    (error) => error?.code === 'PUBLICATION_DIST_TAG_UNKNOWN',
  );
  for (const rc of ['1.5.0-rc.1', currentCandidate]) {
    assert.throws(
      () =>
        validatePreflightDistTags({
          preflightLatest,
          preflightRc,
          distTags: { latest: preflightLatest, rc },
        }),
      (error) => error?.code === 'PUBLICATION_DIST_TAG_DRIFT',
    );
  }
  assert.deepEqual(
    validatePreflightDistTags({ preflightLatest, distTags: { latest: preflightLatest } }),
    { latest: preflightLatest },
    'historical helper calls may omit preflightRc',
  );
});

test('final publication moves only latest while RC2 and other tags stay fixed', async () => {
  const { verifyPostPublishDistTags } = await import('../../scripts/lib/publication-dist-tag.mjs');
  const preflightDistTags = { latest: preflightLatest, rc: previousCandidate, legacy: '0.9.0' };
  assert.doesNotThrow(() =>
    verifyPostPublishDistTags({
      candidate: currentCandidate,
      preflightLatest,
      preflightDistTags,
      distTags: { latest: currentCandidate, rc: previousCandidate, legacy: '0.9.0' },
    }),
  );
  assert.throws(
    () =>
      verifyPostPublishDistTags({
        candidate: currentCandidate,
        preflightLatest,
        preflightDistTags,
        distTags: { latest: currentCandidate, rc: currentCandidate, legacy: '0.9.0' },
      }),
    (error) => error?.code === 'PUBLICATION_DIST_TAG_DRIFT',
  );
  assert.throws(
    () =>
      verifyPostPublishDistTags({
        candidate: currentCandidate,
        preflightLatest,
        preflightDistTags,
        distTags: { latest: '1.5.1', rc: previousCandidate, legacy: '0.9.0' },
      }),
    (error) => error?.code === 'PUBLICATION_DIST_TAG_DRIFT',
  );
});

test('final stable publication roster, rc2 visibility, bounded rereads, and stable release tags', async () => {
  const publication = await import('../../scripts/lib/publication-dist-tag.mjs');
  const { discoverPublishablePackages } =
    await import('../../scripts/lib/publishable-packages.mjs');
  const { parseStableVersionTag } =
    await import('../../scripts/resolve-release-forbidden-range.mjs');
  const candidate = currentCandidate;
  const packages = discoverPublishablePackages(repoRoot).map((entry) => ({
    ...entry,
    manifest: { ...entry.manifest, version: candidate },
  }));
  assert.equal(packages.length, 44);
  assert.equal(packages[0].name, '@stynx-nyx/angular');
  assert.doesNotThrow(() => publication.validatePublicationRoster(packages, candidate));
  for (const roster of [packages.slice(1), [packages[1], packages[0], ...packages.slice(2)]]) {
    assert.throws(
      () => publication.validatePublicationRoster(roster, candidate),
      (error) => error?.code === 'PUBLICATION_ROSTER_DRIFT',
    );
  }
  assert.throws(
    () =>
      publication.validatePublicationRoster(
        [
          { ...packages[0], manifest: { ...packages[0].manifest, version: '1.5.0-rc.3' } },
          ...packages.slice(1),
        ],
        candidate,
      ),
    (error) => error?.code === 'PUBLICATION_VERSION_DRIFT',
  );
  assert.equal(publication.publicationPlanConstants.canaryPackage, '@stynx-nyx/angular');
  assert.equal(publication.publicationPlanConstants.packageCount, 44);
  assert.equal(publication.publicationPlanConstants.maxVisibilityRereads, 5);
  assert.equal(publication.publicationPlanConstants.visibilityRereadDelayMs, 2_000);
  for (const [rc, code] of [
    [previousCandidate, 'PUBLICATION_DIST_TAG_UNKNOWN'],
    ['1.5.0-rc.0', 'PUBLICATION_DIST_TAG_DRIFT'],
  ]) {
    assert.throws(
      () =>
        publication.verifyPostPublishDistTags({
          candidate,
          preflightLatest: registryVersionPolicyConstants.preflightLatestVersion,
          preflightDistTags: { latest: preflightLatest, rc: previousCandidate },
          distTags: { latest: preflightLatest, rc },
        }),
      (error) => error?.code === code,
    );
  }
  assert.deepEqual(parseStableVersionTag(`v${candidate}`), [1n, 5n, 6n]);
  assert.throws(
    () => parseStableVersionTag(`v${previousCandidate}`),
    /malformed stable release tag/u,
  );
  const publisher = repositorySource('scripts/publish-release-plan.mjs');
  const workflow = repositorySource('.github/workflows/release.yml');
  assert.match(publisher, /publicationPlanConstants\.maxVisibilityRereads/u);
  assert.match(publisher, /publicationPlanConstants\.visibilityRereadDelayMs/u);
  assert.match(publisher, /validatePublicationRoster\(packages, version\)/u);
  assert.match(publisher, /const tag = `\$\{entry\.package\}@\$\{version\}`/u);
  assert.doesNotMatch(publisher, /git\(\['tag',\s*`v/u);
  assert.doesNotMatch(workflow, /git tag\s+v\d/u);
});

test('RC1 default planning keeps a future pre-mode changeset while publication preflight alone refuses it', () => {
  const fixture = createFixedGroupFixture({
    version: '1.5.0-rc.1',
    changesets: {
      'consumed.md': "---\n'@stynx-nyx/fixture-auth': minor\n---\n\nConsumed.\n",
      'future.md': "---\n'@stynx-nyx/fixture-core': patch\n---\n\nFuture CTG.\n",
    },
  });
  try {
    writeRcPreState(fixture, { changesets: ['consumed'] });
    const before = readFileSync(join(fixture.root, '.changeset', 'pre.json'), 'utf8');
    assert.deepEqual(validateReleaseVersionPolicy(fixture.root, { fixed: [fixture.names] }), []);
    const plan = planFixedGroupVersion(fixture.root, { fixed: [fixture.names] });
    assert.equal(plan.expected, '1.5.0-rc.2');
    assert.equal(readFileSync(join(fixture.root, '.changeset', 'pre.json'), 'utf8'), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// Fixed-group version rule (see scripts/lib/fixed-group-version.mjs): the
// release unit's next version is the current unified version advanced by the
// highest bump type a pending changeset declares for a group member. Changesets'
// peer-dependency inference, which reads `workspace:*` peers as the exact old
// version and therefore promotes every minor to a major, is corrected after
// `changeset version` has written its output.

function createFixedGroupFixture({ version = '1.3.0', changesets = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'stynx-fixed-group-'));
  const names = ['@stynx-nyx/fixture-core', '@stynx-nyx/fixture-auth', '@stynx-nyx/fixture-sdk'];
  writeJson(join(root, 'package.json'), { name: 'stynx-workspace', private: true, version });
  writeJson(join(root, '.changeset', 'config.json'), { fixed: [names] });
  mkdirSync(join(root, 'packages-web'), { recursive: true });
  for (const [index, name] of names.entries()) {
    const directory = join(root, 'packages', name.split('/')[1]);
    writeJson(join(directory, 'package.json'), {
      name,
      version,
      peerDependencies: index === 0 ? undefined : { [names[0]]: 'workspace:*' },
    });
    writeFileSync(
      join(directory, 'CHANGELOG.md'),
      `# ${name}\n\n## ${version}\n\n- Existing history.\n`,
    );
  }
  writeJson(join(root, 'tools', 'create-stynx-app', 'template', 'package.json'), {
    name: 'consumer-template',
    dependencies: { [names[0]]: `^${version}` },
  });
  for (const [file, body] of Object.entries(changesets)) {
    writeFileSync(join(root, '.changeset', file), body);
  }
  return { root, names };
}

function writeRcPreState(
  fixture,
  { mode = 'pre', tag = 'rc', initialVersion = '1.4.0', changesets = [], initialVersions } = {},
) {
  writeJson(join(fixture.root, '.changeset', 'pre.json'), {
    mode,
    tag,
    initialVersions:
      initialVersions ?? Object.fromEntries(fixture.names.map((name) => [name, initialVersion])),
    changesets,
  });
}

function assertAnyFixedGroupError(callback) {
  assert.throws(callback, (error) => error instanceof FixedGroupVersionError);
}

function assertFixedGroupError(callback, code) {
  assert.throws(
    callback,
    (error) => error instanceof FixedGroupVersionError && error.code === code,
    `expected ${code}`,
  );
}

test('changeset frontmatter parsing accepts the workspace form and fails closed on anything else', () => {
  const parsed = parseChangesetFrontmatter(
    '---\n\'@stynx-nyx/core\': minor\n"@stynx-nyx/auth": patch\n---\n\nSummary line.\n',
  );
  assert.deepEqual(parsed.releases, [
    { name: '@stynx-nyx/core', type: 'minor' },
    { name: '@stynx-nyx/auth', type: 'patch' },
  ]);
  assert.equal(parsed.summary, 'Summary line.');
  assertFixedGroupError(
    () => parseChangesetFrontmatter("'@stynx-nyx/core': minor\n---\n"),
    'CHANGESET_FRONTMATTER_MISSING',
  );
  assertFixedGroupError(
    () => parseChangesetFrontmatter("---\n'@stynx-nyx/core': minor\n"),
    'CHANGESET_FRONTMATTER_MISSING',
  );
  assertFixedGroupError(
    () => parseChangesetFrontmatter("---\n'@stynx-nyx/core': breaking\n---\n"),
    'CHANGESET_FRONTMATTER_MALFORMED',
  );
});

test('fixed-group bump is the highest declared type for a member and never a peer-inferred major', () => {
  const group = ['@stynx-nyx/core', '@stynx-nyx/auth'];
  const minor = { releases: [{ name: '@stynx-nyx/core', type: 'minor' }] };
  const patch = { releases: [{ name: '@stynx-nyx/auth', type: 'patch' }] };
  const foreignMajor = { releases: [{ name: '@stynx-nyx/reference-api', type: 'major' }] };
  assert.equal(computeFixedGroupBump([patch, minor, foreignMajor], group), 'minor');
  assert.equal(computeFixedGroupBump([patch], group), 'patch');
  assert.equal(
    computeFixedGroupBump(
      [{ releases: [{ name: '@stynx-nyx/core', type: 'major' }] }, patch],
      group,
    ),
    'major',
  );
  assert.equal(computeFixedGroupBump([foreignMajor], group), null);
  assert.equal(computeFixedGroupBump([], group), null);
  assert.equal(incrementVersion('1.3.0', 'patch'), '1.3.1');
  assert.equal(incrementVersion('1.3.0', 'minor'), '1.4.0');
  assert.equal(incrementVersion('1.3.9', 'major'), '2.0.0');
  assertFixedGroupError(() => incrementVersion('v1.3.0', 'patch'), 'VERSION_MALFORMED');
  assertFixedGroupError(() => incrementVersion('1.3.0', 'premajor'), 'BUMP_UNSUPPORTED');
});

test('the version plan reads pending changesets and advances the unified version by the declared bump', () => {
  const fixture = createFixedGroupFixture({
    changesets: {
      'a-minor.md': "---\n'@stynx-nyx/fixture-auth': minor\n---\n\nFeature.\n",
      'b-patch.md': "---\n'@stynx-nyx/fixture-core': patch\n---\n\nFix.\n",
      'README.md': '# not a changeset\n',
    },
  });
  try {
    const pending = readPendingChangesets(fixture.root);
    assert.deepEqual(
      pending.map(({ file }) => file),
      ['.changeset/a-minor.md', '.changeset/b-patch.md'],
    );
    const plan = planFixedGroupVersion(fixture.root, { fixed: [fixture.names] });
    assert.equal(plan.current, '1.3.0');
    assert.equal(plan.bump, 'minor');
    assert.equal(plan.expected, '1.4.0');
    assert.deepEqual(plan.changesets, [
      { file: '.changeset/a-minor.md', types: ['minor'] },
      { file: '.changeset/b-patch.md', types: ['patch'] },
    ]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }

  const idle = createFixedGroupFixture();
  try {
    const plan = planFixedGroupVersion(idle.root, { fixed: [idle.names] });
    assert.equal(plan.bump, null);
    assert.equal(plan.expected, '1.3.0');
    assert.deepEqual(plan.changesets, []);
    assertFixedGroupError(
      () => planFixedGroupVersion(idle.root, { fixed: [idle.names.slice(1)] }),
      'FIXED_GROUP_ROSTER_DRIFT',
    );
    assertFixedGroupError(
      () => planFixedGroupVersion(idle.root, { fixed: [] }),
      'FIXED_GROUP_UNSUPPORTED',
    );
  } finally {
    rmSync(idle.root, { recursive: true, force: true });
  }
});

test('an over-promoted generated version is rewritten in manifests and the new changelog section only', () => {
  const fixture = createFixedGroupFixture();
  try {
    for (const name of fixture.names) {
      const directory = join(fixture.root, 'packages', name.split('/')[1]);
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      manifest.version = '2.0.0';
      writeJson(join(directory, 'package.json'), manifest);
      writeFileSync(
        join(directory, 'CHANGELOG.md'),
        `# ${name}\n\n## 2.0.0\n\n### Minor Changes\n\n- abc1234: Feature.\n\n### Patch Changes\n\n- Updated dependencies [abc1234]\n  - ${fixture.names[0]}@2.0.0\n  - @stynx-nyx/outside@2.0.0\n\n## 1.3.0\n\n- Existing history.\n`,
      );
    }
    const result = applyFixedGroupVersion(fixture.root, { from: '2.0.0', to: '1.4.0' });
    assert.deepEqual(result, { manifests: 3, changelogs: 3 });
    for (const name of fixture.names) {
      const directory = join(fixture.root, 'packages', name.split('/')[1]);
      assert.equal(
        JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).version,
        '1.4.0',
      );
      const changelog = readFileSync(join(directory, 'CHANGELOG.md'), 'utf8');
      assert.match(changelog, /^## 1\.4\.0$/mu);
      assert.doesNotMatch(changelog, /^## 2\.0\.0$/mu);
      assert.match(
        changelog,
        new RegExp(`^ {2}- ${fixture.names[0].replace('/', '\\/')}@1\\.4\\.0$`, 'mu'),
      );
      assert.match(changelog, /^ {2}- @stynx-nyx\/outside@2\.0\.0$/mu);
      assert.match(changelog, /^## 1\.3\.0$/mu);
    }
    assert.deepEqual(applyFixedGroupVersion(fixture.root, { from: '1.4.0', to: '1.4.0' }), {
      manifests: 0,
      changelogs: 0,
    });
    assertFixedGroupError(
      () => applyFixedGroupVersion(fixture.root, { from: '2.0.0', to: '1.5.0' }),
      'VERSION_NOT_UNIFIED',
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('RC1 pre mode starts at rc.1 and advances only for changesets not already consumed', () => {
  const initial = createFixedGroupFixture({
    version: '1.4.0',
    changesets: { 'tenancy.md': "---\n'@stynx-nyx/fixture-auth': minor\n---\n\nTenancy.\n" },
  });
  try {
    writeRcPreState(initial);
    const plan = planFixedGroupVersion(initial.root, { fixed: [initial.names] });
    assert.equal(plan.current, '1.4.0');
    assert.equal(plan.bump, 'minor');
    assert.equal(plan.expected, '1.5.0-rc.1');
    assert.notEqual(plan.expected, '1.5.0');
    assert.notEqual(plan.expected, '2.0.0-rc.0');
  } finally {
    rmSync(initial.root, { recursive: true, force: true });
  }

  const subsequent = createFixedGroupFixture({
    version: '1.5.0-rc.1',
    changesets: {
      'tenancy.md': "---\n'@stynx-nyx/fixture-auth': minor\n---\n\nConsumed tenancy.\n",
      'follow-up.md': "---\n'@stynx-nyx/fixture-core': patch\n---\n\nFollow-up.\n",
    },
  });
  try {
    writeRcPreState(subsequent, { changesets: ['tenancy'] });
    const plan = planFixedGroupVersion(subsequent.root, { fixed: [subsequent.names] });
    assert.equal(plan.expected, '1.5.0-rc.2');
    assert.equal(plan.bump, 'patch');
    assert.deepEqual(plan.changesets, [{ file: '.changeset/follow-up.md', types: ['patch'] }]);

    writeRcPreState(subsequent, { changesets: ['tenancy', 'follow-up'] });
    const noOp = planFixedGroupVersion(subsequent.root, { fixed: [subsequent.names] });
    assert.equal(noOp.bump, null);
    assert.equal(noOp.expected, '1.5.0-rc.1');
    assert.deepEqual(noOp.changesets, []);
  } finally {
    rmSync(subsequent.root, { recursive: true, force: true });
  }
});

test('RC1 exit consumes retained changesets and rejects a recomputed major base', () => {
  const fixture = createFixedGroupFixture({
    version: '1.5.0-rc.2',
    changesets: {
      'tenancy.md': "---\n'@stynx-nyx/fixture-auth': minor\n---\n\nConsumed tenancy.\n",
    },
  });
  try {
    writeRcPreState(fixture, { mode: 'exit', changesets: ['tenancy'] });
    const plan = planFixedGroupVersion(fixture.root, { fixed: [fixture.names] });
    assert.equal(plan.bump, 'minor');
    assert.equal(plan.expected, '1.5.0');
    assert.notEqual(plan.changesets.length, 0);

    writeFileSync(
      join(fixture.root, '.changeset', 'owner-od-required.md'),
      "---\n'@stynx-nyx/fixture-sdk': major\n---\n\nMajor.\n",
    );
    assertAnyFixedGroupError(() => planFixedGroupVersion(fixture.root, { fixed: [fixture.names] }));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('RC1 fails closed for malformed pre state, drift, and missing retained changesets', () => {
  const invalidStates = [
    { mode: 'unknown', tag: 'rc', initialVersions: {}, changesets: [] },
    { mode: 'pre', initialVersions: {}, changesets: [] },
    { mode: 'pre', tag: 1, initialVersions: {}, changesets: [] },
    { mode: 'pre', tag: 'rc', changesets: [] },
    { mode: 'pre', tag: 'rc', initialVersions: [], changesets: [] },
    { mode: 'pre', tag: 'rc', initialVersions: {}, changesets: {} },
  ];
  for (const state of invalidStates) {
    const fixture = createFixedGroupFixture({ version: '1.4.0' });
    try {
      writeJson(join(fixture.root, '.changeset', 'pre.json'), state);
      assertAnyFixedGroupError(() =>
        planFixedGroupVersion(fixture.root, { fixed: [fixture.names] }),
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  const invalidJson = createFixedGroupFixture({ version: '1.4.0' });
  try {
    writeFileSync(join(invalidJson.root, '.changeset', 'pre.json'), '{ invalid json');
    assertAnyFixedGroupError(() =>
      planFixedGroupVersion(invalidJson.root, { fixed: [invalidJson.names] }),
    );
  } finally {
    rmSync(invalidJson.root, { recursive: true, force: true });
  }

  const drift = createFixedGroupFixture({
    version: '1.5.0-rc.1',
    changesets: { 'retained.md': "---\n'@stynx-nyx/fixture-auth': minor\n---\n\nRetained.\n" },
  });
  try {
    writeRcPreState(drift, {
      changesets: ['retained'],
      initialVersions: { [drift.names[0]]: '1.4.0' },
    });
    assertAnyFixedGroupError(() => planFixedGroupVersion(drift.root, { fixed: [drift.names] }));
    writeRcPreState(drift, { changesets: ['missing'] });
    assertAnyFixedGroupError(() => planFixedGroupVersion(drift.root, { fixed: [drift.names] }));
    writeRcPreState(drift, { tag: 'beta', changesets: ['retained'] });
    assertAnyFixedGroupError(() => planFixedGroupVersion(drift.root, { fixed: [drift.names] }));
  } finally {
    rmSync(drift.root, { recursive: true, force: true });
  }
});

test('RC1 rejects pre-mode majors and prerelease manifest drift before a generated version can be rewritten', () => {
  const major = createFixedGroupFixture({
    version: '1.5.0-rc.1',
    changesets: {
      'major.md': "---\n'@stynx-nyx/fixture-core': major\n---\n\nOwner decision required.\n",
    },
  });
  try {
    writeRcPreState(major);
    assertAnyFixedGroupError(() => planFixedGroupVersion(major.root, { fixed: [major.names] }));
  } finally {
    rmSync(major.root, { recursive: true, force: true });
  }

  for (const { version, changesets } of [
    { version: '1.5.0-beta.1', changesets: ['retained'] },
    { version: '1.4.0', changesets: ['retained'] },
    { version: '1.5.0-rc.1', changesets: [] },
  ]) {
    const fixture = createFixedGroupFixture({
      version,
      changesets: { 'retained.md': "---\n'@stynx-nyx/fixture-auth': minor\n---\n\nRetained.\n" },
    });
    try {
      writeRcPreState(fixture, { changesets });
      assertAnyFixedGroupError(() =>
        planFixedGroupVersion(fixture.root, { fixed: [fixture.names] }),
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test('RC1 applies the native rc.0 result as rc.1 and rewrites exact sibling references', () => {
  const fixture = createFixedGroupFixture({ version: '1.5.0-rc.0' });
  try {
    for (const name of fixture.names) {
      const directory = join(fixture.root, 'packages', name.split('/')[1]);
      writeFileSync(
        join(directory, 'CHANGELOG.md'),
        `# ${name}\n\n## 1.5.0-rc.0\n\n### Minor Changes\n\n- Candidate.\n\n### Patch Changes\n\n- Updated dependencies\n  - ${fixture.names[0]}@1.5.0-rc.0\n`,
      );
    }
    assert.deepEqual(
      applyFixedGroupVersion(fixture.root, { from: '1.5.0-rc.0', to: '1.5.0-rc.1' }),
      {
        manifests: fixture.names.length,
        changelogs: fixture.names.length,
      },
    );
    for (const name of fixture.names) {
      const directory = join(fixture.root, 'packages', name.split('/')[1]);
      assert.equal(
        JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).version,
        '1.5.0-rc.1',
      );
      const changelog = readFileSync(join(directory, 'CHANGELOG.md'), 'utf8');
      assert.match(changelog, /^## 1\.5\.0-rc\.1$/mu);
      assert.match(
        changelog,
        new RegExp(`^ {2}- ${fixture.names[0].replace('/', '\\/')}@1\\.5\\.0-rc\\.1$`, 'mu'),
      );
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('RC1 validates Changesets pre-state transition before correcting the generated candidate', () => {
  const firstBefore = {
    mode: 'pre',
    tag: 'rc',
    initialVersions: { '@stynx-nyx/fixture-auth': '1.4.0' },
    changesets: [],
  };
  const firstAfter = { ...firstBefore, changesets: ['tenancy'] };
  assert.doesNotThrow(() =>
    fixedGroupVersion.validateGeneratedVersionTransition({
      beforePreState: firstBefore,
      afterPreState: firstAfter,
      current: '1.4.0',
      generated: '1.5.0-rc.0',
      pendingIds: ['tenancy'],
    }),
  );

  const nextBefore = { ...firstAfter };
  const nextAfter = { ...nextBefore, changesets: ['tenancy', 'follow-up'] };
  assert.doesNotThrow(() =>
    fixedGroupVersion.validateGeneratedVersionTransition({
      beforePreState: nextBefore,
      afterPreState: nextAfter,
      current: '1.5.0-rc.1',
      generated: '1.5.0-rc.2',
      pendingIds: ['follow-up'],
    }),
  );

  const invalidTransitions = [
    { generated: '1.5.0-beta.2' },
    { generated: '1.5.0-rc.3' },
    { generated: '1.5.0-rc.1' },
    { afterPreState: { ...nextBefore, changesets: ['tenancy'] } },
    { afterPreState: { ...nextBefore, changesets: ['tenancy', 'follow-up', 'extra'] } },
    { afterPreState: { ...nextBefore, changesets: ['follow-up'] } },
    { afterPreState: { ...nextAfter, mode: 'exit' } },
    { afterPreState: { ...nextAfter, tag: 'beta' } },
  ];
  for (const invalid of invalidTransitions) {
    assert.throws(() =>
      fixedGroupVersion.validateGeneratedVersionTransition({
        beforePreState: nextBefore,
        afterPreState: nextAfter,
        current: '1.5.0-rc.1',
        generated: '1.5.0-rc.2',
        pendingIds: ['follow-up'],
        ...invalid,
      }),
    );
  }
});

test('RC1 rewrite changes only the generated rc section and preserves exact rc.1 history', () => {
  const fixture = createFixedGroupFixture({ version: '1.5.0-rc.1' });
  try {
    for (const name of fixture.names) {
      const directory = join(fixture.root, 'packages', name.split('/')[1]);
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      manifest.version = '2.0.0-rc.2';
      writeJson(join(directory, 'package.json'), manifest);
      const prior = `## 1.5.0-rc.1\n\n### Minor Changes\n\n- Prior RC history.\n`;
      writeFileSync(
        join(directory, 'CHANGELOG.md'),
        `# ${name}\n\n## 2.0.0-rc.2\n\n### Minor Changes\n\n- New patch.\n\n### Patch Changes\n\n- Updated dependencies\n  - ${fixture.names[0]}@2.0.0-rc.2\n  - @stynx-nyx/outside@2.0.0-rc.2\n\n${prior}`,
      );
    }
    applyFixedGroupVersion(fixture.root, { from: '2.0.0-rc.2', to: '1.5.0-rc.2' });
    for (const name of fixture.names) {
      const directory = join(fixture.root, 'packages', name.split('/')[1]);
      const prior = `## 1.5.0-rc.1\n\n### Minor Changes\n\n- Prior RC history.\n`;
      const changelog = readFileSync(join(directory, 'CHANGELOG.md'), 'utf8');
      assert.match(changelog, /^## 1\.5\.0-rc\.2$/mu);
      assert.doesNotMatch(changelog, /^### Major Changes$/mu);
      assert.match(
        changelog,
        new RegExp(`^ {2}- ${fixture.names[0].replace('/', '\\/')}@1\\.5\\.0-rc\\.2$`, 'mu'),
      );
      assert.match(changelog, /^ {2}- @stynx-nyx\/outside@2\.0\.0-rc\.2$/mu);
      assert.equal(changelog.slice(changelog.indexOf('## 1.5.0-rc.1')), prior);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('the release unit is versioned by the fixed-group script and previews without writing', () => {
  const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(
    rootManifest.scripts['version-packages'],
    releaseContextConstants.versionPackagesCommand,
  );
  assert.equal(releaseContextConstants.versionPackagesCommand, 'node scripts/version-packages.mjs');
  assert.equal(
    rootManifest.scripts['release:preview'],
    'node scripts/version-packages.mjs --preview',
  );
  // Compare the bytes the script could write (root and public manifests,
  // changelogs, template) rather than `git status`, which sibling test
  // packages perturb with their own temporary directories.
  const writableState = () => {
    const hash = createHash('sha256');
    const files = [
      join(repoRoot, 'package.json'),
      join(repoRoot, '.changeset', 'pre.json'),
      join(repoRoot, 'tools', 'create-stynx-app', 'template', 'package.json'),
      ...collectPublicPackages(repoRoot).flatMap(({ manifestPath }) => [
        manifestPath,
        join(dirname(manifestPath), 'CHANGELOG.md'),
      ]),
    ];
    for (const file of files) {
      if (existsSync(file)) hash.update(file).update(readFileSync(file));
    }
    return hash.digest('hex');
  };
  const before = writableState();
  const preview = spawnSync(process.execPath, ['scripts/version-packages.mjs', '--preview'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /\[version-packages\] (no pending changesets|fixed-group bump)/u);
  assert.equal(writableState(), before);
});
