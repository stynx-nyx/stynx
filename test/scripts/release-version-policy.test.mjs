import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  chmodSync,
  copyFileSync,
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
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';

import {
  fetchRegistryCensus,
  loadRegistryAnomalyPolicy,
  publishTagForPackage,
  registryVersionPolicyConstants,
  RegistryVersionPolicyError,
  validateRegistryCensus,
} from '../../scripts/lib/registry-version-policy.mjs';
import {
  expectedRebaselineChangelog,
  runUnifiedRebaseline,
  unifiedRebaselinePackageCount,
} from '../../scripts/lib/unified-rebaseline.mjs';
import { discoverMutationRoster, MUTANT_STATUSES } from '../../scripts/lib/mutation-roster.mjs';
import { classifyReleaseContext, ReleaseContextError } from '../../scripts/lib/release-context.mjs';
import { typeOnlyCoverageExclusions } from '../../tools/repo-config/coverage-population.mjs';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

test('D24.46 selective refresh ignores only package prose and selects changed behavior inputs', async () => {
  const { selectCandidateRefreshPackages } = await import(
    `../../scripts/run-mutation-evidence.mjs?selective-refresh=${String(Date.now())}`
  );
  assert.equal(typeof selectCandidateRefreshPackages, 'function');

  const entry = (path, oid) => ({ path, mode: '100644', type: 'blob', oid });
  const sourceOid = '1'.repeat(40);
  const candidateOid = '2'.repeat(40);
  const packageInputs = [
    {
      packageName: '@stynx-nyx/data',
      sourceEntries: [
        entry('packages/data/README.md', sourceOid),
        entry('packages/data/migrations/platform/0019_auth_session_partitions.sql', sourceOid),
      ],
      candidateEntries: [
        entry('packages/data/README.md', candidateOid),
        entry('packages/data/migrations/platform/0019_auth_session_partitions.sql', candidateOid),
      ],
    },
    {
      packageName: '@stynx-nyx/angular-i18n',
      sourceEntries: [
        entry('packages-web/angular-i18n/README.md', sourceOid),
        entry('packages-web/angular-i18n/src/i18n/keys.json', sourceOid),
      ],
      candidateEntries: [
        entry('packages-web/angular-i18n/README.md', candidateOid),
        entry('packages-web/angular-i18n/src/i18n/keys.json', candidateOid),
      ],
    },
    {
      packageName: '@stynx-nyx/core',
      sourceEntries: [entry('packages/core/README.md', sourceOid)],
      candidateEntries: [entry('packages/core/README.md', candidateOid)],
    },
  ];

  assert.deepEqual(
    selectCandidateRefreshPackages({
      packageInputs,
      nonBehavioralPaths: [
        'packages-web/angular-i18n/README.md',
        'packages/core/README.md',
        'packages/data/README.md',
      ],
    }),
    ['@stynx-nyx/angular-i18n', '@stynx-nyx/data'],
  );

  assert.throws(
    () =>
      selectCandidateRefreshPackages({
        packageInputs,
        nonBehavioralPaths: ['packages-web/angular-i18n/src/i18n/keys.json'],
      }),
    /non-behavioral mutation path is invalid/u,
  );
  assert.throws(
    () =>
      selectCandidateRefreshPackages({
        packageInputs,
        nonBehavioralPaths: ['packages/data/README.md', 'packages/data/README.md'],
      }),
    /non-behavioral mutation path population is invalid/u,
  );
});

test('D24.46 local RC advances and verifies the migrated template before DEVAI starts', () => {
  const prepareTemplate = readFileSync(
    join(repoRoot, 'scripts', 'ci-local', 'prepare-int-template.mjs'),
    'utf8',
  );
  const localRc = readFileSync(join(repoRoot, 'scripts', 'devai-local-rc.mjs'), 'utf8');

  assert.match(prepareTemplate, /--maintain/u);
  assert.match(prepareTemplate, /auth\.ensure_current_session_partitions\(\)/u);
  assert.match(prepareTemplate, /auth\.sessions_default/u);
  assert.match(prepareTemplate, /session template partition horizon drifted/u);

  const maintenanceCall = localRc.indexOf("'--maintain'");
  const devaiCall = localRc.indexOf("'check',");
  assert.notEqual(maintenanceCall, -1);
  assert.notEqual(devaiCall, -1);
  assert.ok(maintenanceCall < devaiCall, 'template maintenance must precede the governed graph');
});

const repoRoot = resolve(import.meta.dirname, '..', '..');
const anomalyPolicy = JSON.parse(
  readFileSync(join(repoRoot, 'law', 'policy', 'registry-version-anomalies.json'), 'utf8'),
);
const campaignPolicy = JSON.parse(
  readFileSync(join(repoRoot, 'law', 'policy', 'release-campaign-1.1.1.json'), 'utf8'),
);
const changesetConfig = JSON.parse(
  readFileSync(join(repoRoot, '.changeset', 'config.json'), 'utf8'),
);
const packageNames = [...changesetConfig.fixed[0]].sort();
const firstPublicationNames = [
  '@stynx-nyx/jobs',
  '@stynx-nyx/mobile-runtime',
  '@stynx-nyx/notifications',
  '@stynx-nyx/offline-sync',
  '@stynx-nyx/outbox',
  '@stynx-nyx/worklist',
];
const publishedPackageNames = [...packageNames];
const historicalPublishedPackageNames = packageNames.filter(
  (packageName) => !firstPublicationNames.includes(packageName),
);

function registryMetadata(name, versions) {
  return {
    name,
    versions: Object.fromEntries(versions.map((version) => [version, { name, version }])),
    'dist-tags': { latest: versions.at(-1) },
  };
}

function publishedRegistryState(name, versions) {
  return {
    authenticated: true,
    status: 200,
    metadata: registryMetadata(name, versions),
  };
}

function validRegistryCensus() {
  return new Map(
    packageNames.map((name) => {
      const versions =
        name === '@stynx-nyx/angular-profile'
          ? ['0.5.0', '1.0.0', '1.1.0', '1.1.1', '2.0.0']
          : ['0.5.0', '1.0.0', '1.1.0', '1.1.1'];
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
    candidate: registryVersionPolicyConstants.candidate,
    anomalyPolicy,
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
const preparedBaseTree = 'd0cde059f7a93a624ff01d485ebda9ac3cb9422e';
const preparedHeadCommit = '6d7f86d70e784a281fe025bf50babc9f3b3e8aee';
const exactPrAChangesetPolicy = {
  kind: 'campaign-preparation-only',
  baseline_commit: preparedBaseCommit,
  baseline_tree: preparedBaseTree,
  current_version: '1.0.0',
  candidate_version: '1.1.1',
  changesets: 'forbidden',
  release_status_projection: 'empty-non-promoting',
  version_projection: 'deferred-to-pr-b',
};

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

test('exact PR A campaign preparation emits only an empty non-promoting release status', () => {
  assert.deepEqual(campaignPolicy.pr_a_changeset_policy, exactPrAChangesetPolicy);
  assert.deepEqual(classifyReleaseContext(prAReleaseContext()), {
    kind: 'pr-a-preparation',
    baseCommit: preparedBaseCommit,
    headCommit: preparedHeadCommit,
    policyId: 'stynx.release-campaign-1.1.1',
    packageCount: 44,
    mutationCount: 38,
    firstPublicationCount: 6,
    currentVersion: '1.0.0',
    targetVersion: '1.1.1',
    changesetCount: 0,
    promoting: false,
    releaseStatusProjection: 'empty-non-promoting',
    versionProjection: 'deferred-to-pr-b',
  });
});

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

test('PR A exemption rejects base, policy, roster, and non-candidate version drift', () => {
  const mutations = [
    (context) => {
      context.baseCommit = 'a'.repeat(40);
    },
    (context) => {
      context.prAPreparation.campaignPolicy = structuredClone(campaignPolicy);
      context.prAPreparation.campaignPolicy.policy_id = 'stynx.release-campaign-other';
    },
    (context) => {
      context.prAPreparation.packageVersions.pop();
    },
    (context) => {
      context.prAPreparation.mutationPackageNames.pop();
    },
    (context) => {
      context.prAPreparation.campaignPolicy = structuredClone(campaignPolicy);
      context.prAPreparation.campaignPolicy.approved_first_publications.pop();
    },
    (context) => {
      context.prAPreparation.packageVersions[0].version = '1.1.1';
    },
    (context) => {
      context.prAPreparation.campaignPolicy = structuredClone(campaignPolicy);
      context.prAPreparation.campaignPolicy.candidate.version = '1.1.2';
    },
  ];

  for (const mutate of mutations) {
    const context = prAReleaseContext();
    mutate(context);
    assert.deepEqual(classifyReleaseContext(context), {
      kind: 'ordinary',
      baseCommit: context.baseCommit,
      headCommit: preparedHeadCommit,
    });
  }
});

test('Changeset additions or deletions and version-package commits cannot classify as PR A', () => {
  for (const change of [
    { status: 'A', path: '.changeset/not-pr-a.md' },
    { status: 'D', path: '.changeset/not-pr-a.md' },
  ]) {
    const context = prAReleaseContext({ changes: [change] });
    assert.deepEqual(classifyReleaseContext(context), {
      kind: 'ordinary',
      baseCommit: preparedBaseCommit,
      headCommit: preparedHeadCommit,
    });
  }

  const versionCandidate = prAReleaseContext();
  versionCandidate.commits = [{ sha: preparedHeadCommit, subject: 'ci: version packages' }];
  versionCandidate.versionParent = preparedBaseCommit;
  assert.throws(
    () => classifyReleaseContext(versionCandidate),
    (error) =>
      error instanceof ReleaseContextError && error.code === 'RELEASE_CONTEXT_NO_CHANGESETS',
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

test('Architect policy and workspace structurally define exactly 44/38/6', () => {
  const { roster: mutationRoster, failures: mutationFailures } = discoverMutationRoster(repoRoot);
  const mutationNames = mutationRoster.map(({ packageName }) => packageName).sort();
  assert.equal(registryVersionPolicyConstants.packageCount, 44);
  assert.equal(packageNames.length, 44);
  assert.equal(new Set(packageNames).size, 44);
  assert.equal(campaignPolicy.existing_private_packages.length, 38);
  assert.deepEqual([...campaignPolicy.publishable_packages].sort(), packageNames);
  assert.deepEqual(
    [...campaignPolicy.existing_private_packages].sort(),
    historicalPublishedPackageNames,
  );
  assert.deepEqual(mutationFailures, []);
  assert.equal(mutationNames.length, 38);
  assert.deepEqual([...campaignPolicy.mutation_packages].sort(), mutationNames);
  assert.deepEqual([...campaignPolicy.approved_first_publications].sort(), firstPublicationNames);
  assert.equal(campaignPolicy.candidate.publishable_count, 44);
  assert.equal(campaignPolicy.candidate.mutation_count, 38);
  assert.equal(campaignPolicy.candidate.existing_private_count, 38);
  assert.equal(campaignPolicy.candidate.approved_first_publication_count, 6);
});

function assertGovernedMutationFloor({ roster, failures }) {
  const expectedNames = [...campaignPolicy.mutation_packages].sort();
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

test('complete authenticated registry and inventory census returns the normal 44-package patch', () => {
  assert.deepEqual(validate(), {
    anomalyMatches: 1,
    absentPackageCount: 0,
    packageCount: 44,
    publishedPackageCount: 44,
  });
});

test('1.1.2 collision in any of the 44 packages blocks the unified candidate', () => {
  for (const packageName of packageNames) {
    const states = validRegistryCensus();
    states.set(packageName, publishedRegistryState(packageName, ['0.5.0', '1.1.1', '1.1.2']));
    assertPolicyError(
      () => validate({ registryStatesByPackage: states }),
      'REGISTRY_CANDIDATE_EXISTS',
    );
  }
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
    publishedRegistryState('@stynx-nyx/sessions', ['1.1.0', '2.0.0']),
  );
  assertPolicyError(
    () => validate({ registryStatesByPackage: unadjudicatedMajor }),
    'REGISTRY_UNADJUDICATED_VERSION',
  );

  const missingExactAnomaly = validRegistryCensus();
  missingExactAnomaly.set(
    '@stynx-nyx/angular-profile',
    publishedRegistryState('@stynx-nyx/angular-profile', ['1.0.0', '1.1.0']),
  );
  assertPolicyError(
    () => validate({ registryStatesByPackage: missingExactAnomaly }),
    'REGISTRY_ANOMALY_UNMATCHED',
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

  assertPolicyError(() => validate({ candidate: '1.1.3' }), 'REGISTRY_CANDIDATE_UNSUPPORTED');
});

test('the historical first-publication campaign cannot authorize the normal patch', () => {
  assertPolicyError(
    () => validate({ campaignPolicy }),
    'REGISTRY_FIRST_PUBLICATION_POLICY_UNSUPPORTED',
  );
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
  malformed.set('@stynx-nyx/sessions', publishedRegistryState('@stynx-nyx/sessions', []));
  assertPolicyError(
    () => validate({ registryStatesByPackage: malformed }),
    'REGISTRY_METADATA_MALFORMED',
  );

  const unsupportedVersion = validRegistryCensus();
  unsupportedVersion.set(
    '@stynx-nyx/sessions',
    publishedRegistryState('@stynx-nyx/sessions', ['1.1.0', 'v1.1.1']),
  );
  assertPolicyError(
    () => validate({ registryStatesByPackage: unsupportedVersion }),
    'REGISTRY_VERSION_UNSUPPORTED',
  );
});

test('registry and authenticated inventory must be complete and agree exactly', () => {
  const disagreement = validInventory();
  disagreement.packageNames.push('@stynx-nyx/jobs');
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
  const anomaly = loadRegistryAnomalyPolicy(repoRoot, registryVersionPolicyConstants.candidate);
  assert.equal(anomaly.package, '@stynx-nyx/angular-profile');
  assert.equal(anomaly.version, '2.0.0');
  assert.equal(anomaly.allowed_candidate_line, '1.x');

  const root = mkdtempSync(join(tmpdir(), 'stynx-anomaly-policy-'));
  try {
    assertPolicyError(
      () => loadRegistryAnomalyPolicy(root, registryVersionPolicyConstants.candidate),
      'REGISTRY_ANOMALY_POLICY_MISSING',
    );
    const policyPath = join(root, 'law', 'policy', 'registry-version-anomalies.json');
    mkdirSync(dirname(policyPath), { recursive: true });
    writeFileSync(policyPath, '{}\n');
    assertPolicyError(
      () => loadRegistryAnomalyPolicy(root, registryVersionPolicyConstants.candidate),
      'REGISTRY_ANOMALY_POLICY_MODIFIED',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publisher tag selection is fixture-bound to the exact adjudicated anomaly', () => {
  const anomaly = loadRegistryAnomalyPolicy(repoRoot, registryVersionPolicyConstants.candidate);
  assert.equal(
    publishTagForPackage({
      packageName: '@stynx-nyx/angular-profile',
      candidate: registryVersionPolicyConstants.candidate,
      observedVersions: ['0.5.0', '1.1.1', '2.0.0'],
      anomaly,
    }),
    'latest',
  );
  assert.equal(
    publishTagForPackage({
      packageName: '@stynx-nyx/angular-auth',
      candidate: registryVersionPolicyConstants.candidate,
      observedVersions: ['0.5.0', '1.1.1'],
      anomaly,
    }),
    null,
  );
  assertPolicyError(
    () =>
      publishTagForPackage({
        packageName: '@stynx-nyx/angular-profile',
        candidate: registryVersionPolicyConstants.candidate,
        observedVersions: ['0.5.0', '1.1.1'],
        anomaly,
      }),
    'REGISTRY_ANOMALY_UNMATCHED',
  );
  const broadened = structuredClone(anomaly);
  broadened.publisher_behavior.tag = 'next';
  assertPolicyError(
    () =>
      publishTagForPackage({
        packageName: '@stynx-nyx/angular-profile',
        candidate: registryVersionPolicyConstants.candidate,
        observedVersions: ['2.0.0'],
        anomaly: broadened,
      }),
    'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
  );
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
    version: '1.0.0',
  });
  writeJson(join(root, '.changeset', 'config.json'), {
    fixed: [names],
  });
  mkdirSync(join(root, 'packages-web'), { recursive: true });

  for (const [index, name] of names.entries()) {
    const packageDirectory = join(root, 'packages', `fixture-${String(index).padStart(2, '0')}`);
    const manifest = {
      name,
      version: '1.0.0',
      dependencies: index === 0 ? { [names[1]]: '^1.0.0', [names[2]]: 'workspace:*' } : undefined,
    };
    writeJson(join(packageDirectory, 'package.json'), manifest);
    const priorTargetSection =
      index === 0
        ? '\n## 1.1.1\n\n### Patch Changes\n\n- Preserve this unpublished historical note.\n'
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
    dependencies: { [names[0]]: '^1.0.0' },
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
    assert.equal(firstManifest.version, '1.1.1');
    assert.equal(firstManifest.dependencies[fixture.names[1]], '^1.1.1');
    assert.equal(firstManifest.dependencies[fixture.names[2]], 'workspace:*');
    const template = JSON.parse(
      readFileSync(
        join(fixture.root, 'tools', 'create-stynx-app', 'template', 'package.json'),
        'utf8',
      ),
    );
    assert.equal(template.dependencies[fixture.names[0]], '^1.1.1');

    const changelog = readFileSync(
      join(fixture.root, 'packages', 'fixture-00', 'CHANGELOG.md'),
      'utf8',
    );
    assert.equal(changelog.match(/^## 1\.1\.1$/gmu)?.length, 1);
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
const frozenCompositionCommit = '6754d65f89cc9c2f23ab82f61a4b68c543f0bef4';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(',')}}`;
}

test('D24.33 local release preparation keeps coverage first and excludes remote evidence', () => {
  assert.deepEqual(rootManifest.scripts['ci:stynx:release'].split(' && '), [
    'pnpm test:coverage',
    'node scripts/run-release-preparation.mjs',
  ]);
  assert.doesNotMatch(rootManifest.scripts['ci:stynx:release'], /verify-missing-evidence/u);
});

test('D24.33 promotion keeps the unchanged evidence verifier before publish:true', () => {
  assert.deepEqual(rootManifest.scripts['release:publish:ci'].split(' && '), [
    'node scripts/verify-missing-evidence.mjs',
    'node scripts/changesets-publish-ci.mjs',
  ]);
  const workflow = repositorySource('.github/workflows/release.yml');
  assert.match(workflow, /inputs\.publish == true/u);
  assert.match(workflow, /publish:\s*pnpm release:publish:ci/u);
  assert.ok(
    workflow.indexOf('inputs.publish == true') <
      workflow.indexOf('publish: pnpm release:publish:ci'),
  );
});

test('D24.33 policy binds exact source evidence and a semantics-preserving manifest rebind', () => {
  const policy = JSON.parse(repositorySource('law/policy/stynx-1.1.1-mutation-reuse.json'));
  const d24_33CandidateRebind = structuredClone(policy.candidateRebind);
  delete d24_33CandidateRebind.sourceMaterialization;
  assert.equal(d24_33CandidateRebind.kind, 'protected-source-selective-refresh-v1');
  assert.deepEqual(d24_33CandidateRebind.refreshPackages, policy.freshPackages);
  assert.equal(d24_33CandidateRebind.nonBehavioralPaths.length, 37);
  assert.equal(d24_33CandidateRebind.mutationSubprocesses, 38);
  assert.equal(d24_33CandidateRebind.packageStarts, 38);
  delete d24_33CandidateRebind.refreshPackages;
  delete d24_33CandidateRebind.nonBehavioralPaths;
  d24_33CandidateRebind.kind = 'zero-mutation-candidate-rebind-v2';
  d24_33CandidateRebind.mutationSubprocesses = 0;
  d24_33CandidateRebind.packageStarts = 0;
  assert.deepEqual(d24_33CandidateRebind, {
    kind: 'zero-mutation-candidate-rebind-v2',
    sourceCandidate: {
      commit: 'f8a3521a944abc4b5c8a07e1ebae8d349e549fd7',
      tree: '32a3a8fd59afcd500f9d67552081f819cba9b4d7',
    },
    historicalInputCandidate: {
      commit: frozenCompositionCommit,
      tree: 'fa3f2a43eeb89e73dff04074d021e2ba1783cf84',
    },
    sourceSummary: {
      path: '.devai/state/check-cache/v1/artifacts/mutation/summary.json',
      bytes: 37_433,
      sha256: 'd86162cf5e2055dbea7e418c18de0904bcc2d077f25def95b32e2c71a147cf70',
      packageCount: 38,
      artifactBindingCount: 76,
      provenance: {
        kind: 'protected-evidence-tag-rebound-v1',
        tag: 'devai-local-evidence/23e5f6bd76e29047bae82cf05e8a776474ab35f7',
        tagObject: '766b31c243c8d9a14f3c3cef883d2935e716e828',
        evidenceCommit: '5d07b2923a44750f8daa06d2d0b8cd847d1c99ce',
        evidenceTree: 'dd41ab82ade66608738b442b88f26eb7cca6e989',
        manifestBytes: 17_263,
        manifestSha256: '954f2e3bf369f403612657e49bc1e5d3f289e27a317293865088349965fe347e',
      },
      priorSemanticRebindComparison: {
        kind: 'root-manifest-unchanged-with-historical-input-v1',
        sourceRootManifest: {
          bytes: 10_789,
          sha256: '2bd0ff37f68b2f2a6bebfa6876170555319082853239990ad2354a94fc13ee8d',
          gitBlobOid: '793f046a90b619ff4a770d31c4c15ac9bfa766cc',
        },
        targetRootManifest: {
          bytes: 10_789,
          sha256: '2bd0ff37f68b2f2a6bebfa6876170555319082853239990ad2354a94fc13ee8d',
          gitBlobOid: '793f046a90b619ff4a770d31c4c15ac9bfa766cc',
        },
        allowedScriptTransitions: [],
        comparison: {
          rootManifest: 'source-and-target-identical',
          historicalMutationInputTreeEntries: 'match-explicit-historical-candidate-mode-type-oid',
          otherMutationInputTreeEntries: 'identical-mode-type-oid',
        },
        canonicalContractBytes: 597,
        canonicalContractSha256: '18810544b0301b329b030d1d52d5a117fc74264b554d99a28e1c1e9bed5d44e3',
      },
    },
    sourceInputProjection: {
      kind: 'sorted-package-input-projection-digest-map-v1',
      bytes: 4_934,
      sha256: 'f9222176e2fcde022dae67e8a776fb7de4cfb9e0eb4f85d5c0a1f2c36a86b674',
      disposition: 'historical-source-identities',
    },
    semanticRebindComparison: {
      kind: 'root-manifest-unchanged-with-historical-input-v1',
      sourceRootManifest: {
        bytes: 10_789,
        sha256: '2bd0ff37f68b2f2a6bebfa6876170555319082853239990ad2354a94fc13ee8d',
        gitBlobOid: '793f046a90b619ff4a770d31c4c15ac9bfa766cc',
      },
      targetRootManifest: {
        bytes: 10_789,
        sha256: '2bd0ff37f68b2f2a6bebfa6876170555319082853239990ad2354a94fc13ee8d',
        gitBlobOid: '793f046a90b619ff4a770d31c4c15ac9bfa766cc',
      },
      allowedScriptTransitions: [],
      comparison: {
        rootManifest: 'source-and-target-identical',
        historicalMutationInputTreeEntries: 'match-explicit-historical-candidate-mode-type-oid',
        otherMutationInputTreeEntries: 'identical-mode-type-oid',
      },
      canonicalContractBytes: 597,
      canonicalContractSha256: '18810544b0301b329b030d1d52d5a117fc74264b554d99a28e1c1e9bed5d44e3',
    },
    promotionVerifier: {
      path: 'scripts/verify-missing-evidence.mjs',
      mode: '0644',
      bytes: 2_400,
      sha256: '3b9422b1c137e01116d0775c5e5b77361a1d8024d08076583cf96a5b300cfa73',
      requiredBefore: 'release:publish:ci',
    },
    mutationSubprocesses: 0,
    packageStarts: 0,
    mismatchDisposition: 'fail-before-package-start',
  });
  const observedChangedPaths = spawnSync(
    'git',
    ['diff', '--name-only', `${policy.candidateRebind.sourceCandidate.commit}..HEAD`, '--'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
    .stdout.trim()
    .split('\n')
    .filter(Boolean)
    .sort();
  assert.deepEqual(policy.allowedChangedPaths, observedChangedPaths);

  assert.match(policy.candidateRebind.sourceCandidate.commit, /^[0-9a-f]{40}$/u);
  assert.match(
    policy.candidateRebind.semanticRebindComparison.sourceRootManifest.sha256,
    /^[0-9a-f]{64}$/u,
  );
  assert.equal(JSON.parse(repositorySource('package.json')).version, '1.1.1');
  assert.deepEqual(
    policy.devai145Adoption.semanticMutationInputTransition.versionRebaselineTarget,
    {
      targetRootManifest: {
        bytes: 10_789,
        sha256: '2bd0ff37f68b2f2a6bebfa6876170555319082853239990ad2354a94fc13ee8d',
        gitBlobOid: '793f046a90b619ff4a770d31c4c15ac9bfa766cc',
      },
      manifestTransition: { field: 'version', from: '1.0.0', to: '1.1.1' },
      changedPathContract: {
        workspaceCount: 44,
        perWorkspacePaths: ['CHANGELOG.md', 'package.json'],
        additionalPaths: [
          'docs/meta/security/sbom.cdx.json',
          'package.json',
          'packages/pdf-a-vera-docker/README.md',
          'packages/pdf-a/README.md',
          'packages/pdf/README.md',
          'tools/create-stynx-app/template/package.json',
        ],
        exactPathCount: 94,
      },
    },
  );
  const { canonicalContractBytes, canonicalContractSha256, ...semanticRebindComparison } =
    policy.candidateRebind.semanticRebindComparison;
  const semanticContract = canonicalize({
    kind: semanticRebindComparison.kind,
    source: semanticRebindComparison.sourceRootManifest,
    target: semanticRebindComparison.targetRootManifest,
    transitions: semanticRebindComparison.allowedScriptTransitions,
    comparison: semanticRebindComparison.comparison,
  });
  assert.equal(Buffer.byteLength(semanticContract), canonicalContractBytes);
  assert.equal(sha256(semanticContract), canonicalContractSha256);
  assert.equal(rootManifest.devDependencies['@aarusso-nyx/devai'], '1.4.5');
  assert.deepEqual(policy.devai145Adoption.mutationInputProjection, {
    rosterCount: 38,
    artifactBindingCount: 76,
    productPackageSelectionCount: 0,
    disposition: 'exact-semantic-devai-input-transition-only',
  });
  assert.equal(policy.devai145Adoption.mutationSubprocesses, 0);
  assert.equal(policy.devai145Adoption.packageStarts, 0);
  assert.notEqual(
    policy.candidateRebind.sourceCandidate.commit,
    policy.candidateRebind.historicalInputCandidate.commit,
  );
  assert.equal(policy.veraPdfRobustnessRemediation.mutationProjection.rosterCount, 38);
  assert.equal(policy.veraPdfRobustnessRemediation.mutationProjection.affectedPackageCount, 0);
});

function stripJavaScriptComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');
}

function candidateRebindFunctionBody(runner) {
  const start = runner.indexOf('export async function rebindCandidateComposition');
  assert.notEqual(start, -1, 'candidate rebind export is missing');
  const end = runner.indexOf('\nif (isDirectInvocation) {', start);
  assert.notEqual(end, -1, 'candidate rebind must close at the direct-invocation boundary');
  const body = runner.slice(start, end).trim();
  assert.equal(body.at(-1), '}', 'candidate rebind function does not close at its boundary');
  return stripJavaScriptComments(body);
}

test('D24.33 runner validates and atomically rebinds without a package start', () => {
  const runner = repositorySource('scripts/run-mutation-evidence.mjs');
  const branch = candidateRebindFunctionBody(runner);
  for (const marker of [
    'sourceCandidate',
    'historicalInputCandidate',
    'sourceSummary',
    'protected-evidence-tag-rebound-v1',
    'priorSemanticRebindComparison',
    'artifactBindingCount',
    'sourceInputProjection',
    'semanticRebindComparison',
    'devai145Adoption',
    'semanticMutationInputTransition',
    'sourceLockfile',
    'targetLockfile',
    'manifestTransition',
    'versionRebaselineTarget',
    'sourceAlreadyAtVersionTarget',
    'versionChangedPaths',
    'lockfileTransitionCount',
    'governanceRunnerTransition',
    'otherMutationInputTreeEntries',
    'allowedChangedPaths',
    'reportDigest',
    'resultDigest',
    'provenance',
    'thresholds',
    'targetCensus',
    'statusTotals',
    'score',
    'baseline',
    'canonicalWrite',
    'publishComposedDirectory',
  ]) {
    assert.match(branch, new RegExp(marker, 'u'), `${marker}: missing rebind validation`);
  }
  assert.ok(
    branch.indexOf('sourceSummary') < branch.indexOf('publishComposedDirectory'),
    'source validation must precede publication',
  );
  assert.ok(
    branch.indexOf('sourceCandidate') < branch.indexOf('historicalInputCandidate'),
    'the rebound source identity must be validated separately from historical mutation inputs',
  );
  assert.match(branch, /publishComposedDirectory/u);
  assert.doesNotMatch(
    branch,
    /runPackage|freshRoster\.map|selectedRoster\.map|validateCheapGateMarker|validateBaseline|preflightFullMutationInfrastructure/u,
    'candidate rebind cannot start mutation or a package process',
  );
});

test('D24.33 direct candidate rebind rejects missing or drifted source before fallback', () => {
  const runner = stripJavaScriptComments(repositorySource('scripts/run-mutation-evidence.mjs'));
  assert.match(
    runner,
    /const comparisonBase = policy\.candidateRebind\?\.sourceCandidate\?\.commit \?\? policy\.baseline\.commit/u,
  );
  assert.match(
    runner,
    /!policy\.candidateRebind && changedPaths\.some/u,
    'the strict rebind validator must own chained changed-path validation',
  );
  const directStart = runner.indexOf('if (isDirectInvocation) {');
  const rebindStart = runner.indexOf('if (policy.candidateRebind) {', directStart);
  const fallbackStart = runner.indexOf('validateCheapGateMarker(candidate)', rebindStart);
  assert.notEqual(directStart, -1);
  assert.notEqual(rebindStart, -1);
  assert.notEqual(fallbackStart, -1);
  const directRebind = runner.slice(rebindStart, fallbackStart);
  assert.match(
    directRebind,
    /if \(!existsSync\(sourceSummaryPath\)\)\s*throw new Error\([^)]*source summary[^)]*\)/u,
    'missing source summary must fail instead of falling through',
  );
  assert.match(
    directRebind,
    /sourceBytes\.length !== policy\.candidateRebind\.sourceSummary\.bytes[\s\S]*?throw new Error\([^)]*(?:size|bytes)[^)]*\)/u,
    'wrong source summary size must fail instead of falling through',
  );
  assert.match(
    directRebind,
    /sha256Hex\(sourceBytes\) !== policy\.candidateRebind\.sourceSummary\.sha256[\s\S]*?throw new Error\([^)]*(?:digest|sha256)[^)]*\)/u,
    'wrong source summary digest must fail instead of falling through',
  );
  assert.match(directRebind, /await rebindCandidateComposition/u);
  assert.match(directRebind, /candidate rebind package start is forbidden/u);
  assert.doesNotMatch(
    directRebind,
    /validateCheapGateMarker|validateBaseline|preflightFullMutationInfrastructure|runPackage|freshRoster/u,
  );
});

function copyMutationEvidence(sourceDirectory, targetDirectory) {
  mkdirSync(targetDirectory, { recursive: true });
  for (const name of readdirSync(sourceDirectory)) {
    const source = join(sourceDirectory, name);
    const target = join(targetDirectory, name);
    copyFileSync(source, target);
    chmodSync(target, statSync(source).mode & 0o777);
  }
}

function mutationEvidenceSnapshot(directory) {
  return Object.fromEntries(
    readdirSync(directory)
      .sort()
      .map((name) => {
        const path = join(directory, name);
        return [
          name,
          {
            mode: statSync(path).mode & 0o777,
            bytes: readFileSync(path),
          },
        ];
      }),
  );
}

function refreshFixtureSummaryIdentity(policy, sourceDirectory) {
  const bytes = readFileSync(join(sourceDirectory, 'summary.json'));
  policy.candidateRebind.sourceSummary.bytes = bytes.length;
  policy.candidateRebind.sourceSummary.sha256 = sha256(bytes);
}

const syntheticSharedMutationInputPaths = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'scripts/lib/mutation-evidence.mjs',
  'scripts/lib/mutation-roster.mjs',
  'tools/repo-config/test-policy.json',
  'tools/repo-config/test-thresholds.mjs',
  'tools/repo-config/vitest.base.mjs',
  'tools/stryker/base.mjs',
];

function syntheticTreeEntries(commit) {
  const result = spawnSync('git', ['ls-tree', '-r', '-z', commit, '--'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  const entries = new Map();
  for (const record of result.stdout.split('\0').filter(Boolean)) {
    const match = /^(\d+) ([a-z]+) ([0-9a-f]+)\t(.+)$/u.exec(record);
    assert.ok(match, `invalid synthetic tree record: ${record}`);
    entries.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
  }
  return entries;
}

function syntheticWorkspaceCatalog() {
  const catalog = new Map();
  for (const root of ['packages', 'packages-web']) {
    for (const entry of readdirSync(join(repoRoot, root), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const workspace = `${root}/${entry.name}`;
      const manifestPath = join(repoRoot, workspace, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (typeof manifest.name === 'string') catalog.set(manifest.name, { workspace, manifest });
    }
  }
  return catalog;
}

function syntheticDependencySourceClosure(packageName, catalog) {
  const visited = new Set();
  const visit = (name) => {
    if (visited.has(name)) return;
    visited.add(name);
    const entry = catalog.get(name);
    if (!entry) return;
    for (const dependency of [
      ...Object.keys(entry.manifest.dependencies ?? {}),
      ...Object.keys(entry.manifest.devDependencies ?? {}),
      ...Object.keys(entry.manifest.optionalDependencies ?? {}),
      ...Object.keys(entry.manifest.peerDependencies ?? {}),
    ]) {
      if (catalog.has(dependency)) visit(dependency);
    }
  };
  visit(packageName);
  visited.delete(packageName);
  return [...visited].map((name) => catalog.get(name).workspace).sort();
}

function syntheticMutationInputProjection(entry, entries, catalog) {
  const dependencyWorkspaces = syntheticDependencySourceClosure(entry.packageName, catalog);
  const selected = [];
  for (const [path, metadata] of entries) {
    const own = path === entry.workspace || path.startsWith(`${entry.workspace}/`);
    const dependency = dependencyWorkspaces.some(
      (workspace) =>
        path === `${workspace}/package.json` ||
        path.startsWith(`${workspace}/src/`) ||
        (path.startsWith(`${workspace}/`) && /\/tsconfig[^/]*\.json$/u.test(path)),
    );
    const shared =
      syntheticSharedMutationInputPaths.includes(path) || path.startsWith('tools/tsconfig/');
    if (own || dependency || shared) selected.push({ path, ...metadata });
  }
  selected.sort((left, right) => left.path.localeCompare(right.path));
  return sha256(canonicalize(selected));
}

function writeSyntheticMutationEvidence(sourceDirectory, policy) {
  mkdirSync(sourceDirectory, { recursive: true });
  const { roster, failures } = discoverMutationRoster(repoRoot);
  assert.deepEqual(failures, []);
  assert.equal(roster.length, 38);
  const historicalTree = syntheticTreeEntries(
    policy.candidateRebind.historicalInputCandidate.commit,
  );
  const catalog = syntheticWorkspaceCatalog();
  const fresh = new Set(policy.freshPackages);
  const aggregateTotals = Object.fromEntries(MUTANT_STATUSES.map((status) => [status, 0]));
  const packages = [];
  let durationMs = 0;
  let freshDurationMs = 0;

  for (const [index, rosterEntry] of roster.entries()) {
    const provenance = fresh.has(rosterEntry.packageName) ? 'fresh' : 'reused';
    const stem = rosterEntry.workspace.replaceAll('/', '-');
    const reportName = `${stem}.stryker.json`;
    const resultName = `${stem}.result.json`;
    const reportPath = `.devai/state/check-cache/v1/artifacts/mutation/${reportName}`;
    const resultPath = `.devai/state/check-cache/v1/artifacts/mutation/${resultName}`;
    const report = {
      files: {
        [`${rosterEntry.workspace}/src/synthetic-mutation-target.ts`]: {
          mutants: [{ id: String(index + 1), status: 'Killed' }],
        },
      },
    };
    const statusTotals = Object.fromEntries(MUTANT_STATUSES.map((status) => [status, 0]));
    statusTotals.Killed = 1;
    const packageDurationMs = index + 1;
    const process = { errorAbsent: true, signal: null, status: 0 };
    const reportDigest = sha256(canonicalize(report));
    const result = {
      packageName: rosterEntry.packageName,
      workspace: rosterEntry.workspace,
      passed: true,
      durationMs: packageDurationMs,
      thresholds: rosterEntry.thresholds,
      score: 100,
      statusTotals,
      ...(provenance === 'fresh' ? { process } : {}),
      reportDigest,
      reportPath,
    };
    const resultDigest = sha256(canonicalize(result));
    writeFileSync(join(sourceDirectory, reportName), `${canonicalize(report)}\n`, { mode: 0o644 });
    writeFileSync(join(sourceDirectory, resultName), `${canonicalize(result)}\n`, { mode: 0o644 });
    packages.push({
      packageName: rosterEntry.packageName,
      workspace: rosterEntry.workspace,
      provenance,
      baselineCommit: provenance === 'reused' ? policy.baseline.commit : null,
      baselineTree: provenance === 'reused' ? policy.baseline.tree : null,
      inputProjectionDigest: syntheticMutationInputProjection(rosterEntry, historicalTree, catalog),
      reportPath,
      resultPath,
      reportDigest,
      resultDigest,
      thresholds: rosterEntry.thresholds,
      targetCensus: { targetFileCount: 1, totalMutants: 1 },
      statusTotals,
      score: 100,
      durationMs: packageDurationMs,
      passed: true,
      ...(provenance === 'fresh' ? { process } : {}),
    });
    durationMs += packageDurationMs;
    if (provenance === 'fresh') freshDurationMs += packageDurationMs;
    aggregateTotals.Killed += 1;
  }

  const projectionBytes = Buffer.from(
    JSON.stringify(
      packages
        .map(({ packageName, inputProjectionDigest }) => ({
          packageName,
          inputProjectionDigest,
        }))
        .sort((left, right) => left.packageName.localeCompare(right.packageName)),
    ),
  );
  policy.candidateRebind.sourceInputProjection.bytes = projectionBytes.length;
  policy.candidateRebind.sourceInputProjection.sha256 = sha256(projectionBytes);
  const summary = {
    kind: policy.composedSummaryKind,
    complete: true,
    passed: true,
    candidate: policy.candidateRebind.sourceCandidate,
    baseline: {
      commit: policy.baseline.commit,
      tree: policy.baseline.tree,
      summaryBytes: policy.baseline.summaryBytes,
      summarySha256: policy.baseline.summarySha256,
    },
    aggregate: {
      packageCount: 38,
      freshPackageCount: policy.requiredFreshCount,
      reusedPackageCount: policy.requiredReusedCount,
      durationMs,
      freshDurationMs,
      score: 100,
      statusTotals: aggregateTotals,
    },
    packages,
    semanticRebindComparison: policy.candidateRebind.sourceSummary.priorSemanticRebindComparison,
  };
  writeFileSync(join(sourceDirectory, 'summary.json'), `${canonicalize(summary)}\n`, {
    mode: 0o644,
  });
  refreshFixtureSummaryIdentity(policy, sourceDirectory);
  assert.equal(readdirSync(sourceDirectory).length, 77);
}

test('D24.33 candidate rebind is executable, exhaustive, atomic, and starts no package', async () => {
  const runner = repositorySource('scripts/run-mutation-evidence.mjs');
  assert.match(
    runner,
    /export (?:async )?function rebindCandidateComposition\s*\(/u,
    'candidate rebind must expose the production operation for bounded non-mutation testing',
  );
  assert.match(
    runner,
    /const isDirectInvocation\s*=.*fileURLToPath\(import\.meta\.url\)/su,
    'importing the candidate rebind seam must not execute the mutation runner',
  );
  assert.match(
    runner,
    /if \(isDirectInvocation\) \{/u,
    'all command-line execution must remain behind the direct-invocation guard',
  );

  const { rebindCandidateComposition } = await import(
    `../../scripts/run-mutation-evidence.mjs?d24-33=${sha256(runner)}`
  );
  assert.equal(typeof rebindCandidateComposition, 'function');

  const sourcePolicy = JSON.parse(repositorySource('law/policy/stynx-1.1.1-mutation-reuse.json'));
  const currentCommit = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).stdout.trim();
  const currentTree = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).stdout.trim();
  sourcePolicy.candidateRebind.sourceCandidate = {
    commit: currentCommit,
    tree: currentTree,
  };
  sourcePolicy.candidateRebind.historicalInputCandidate = {
    commit: currentCommit,
    tree: currentTree,
  };
  sourcePolicy.candidateRebind.sourceSummary.provenance = {
    kind: 'synthetic-current-tree-fixture-v1',
  };
  sourcePolicy.candidateRebind.refreshPackages = [];
  sourcePolicy.candidateRebind.nonBehavioralPaths = [];
  sourcePolicy.candidateRebind.mutationSubprocesses = 0;
  sourcePolicy.candidateRebind.packageStarts = 0;
  const manifestBytes = readFileSync(join(repoRoot, 'package.json'));
  const manifestIdentity = {
    bytes: manifestBytes.length,
    sha256: sha256(manifestBytes),
    gitBlobOid: spawnSync('git', ['hash-object', 'package.json'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).stdout.trim(),
  };
  const semanticComparison = sourcePolicy.candidateRebind.semanticRebindComparison;
  semanticComparison.sourceRootManifest = manifestIdentity;
  semanticComparison.targetRootManifest = manifestIdentity;
  semanticComparison.allowedScriptTransitions = [];
  const semanticContract = canonicalize({
    kind: semanticComparison.kind,
    source: semanticComparison.sourceRootManifest,
    target: semanticComparison.targetRootManifest,
    transitions: semanticComparison.allowedScriptTransitions,
    comparison: semanticComparison.comparison,
  });
  semanticComparison.canonicalContractBytes = Buffer.byteLength(semanticContract);
  semanticComparison.canonicalContractSha256 = sha256(semanticContract);
  sourcePolicy.candidateRebind.sourceSummary.priorSemanticRebindComparison =
    structuredClone(semanticComparison);
  const identityFor = (path) => {
    const bytes = readFileSync(join(repoRoot, path));
    return {
      bytes: bytes.length,
      sha256: sha256(bytes),
      gitBlobOid: spawnSync('git', ['hash-object', path], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).stdout.trim(),
    };
  };
  const devaiTransition = sourcePolicy.devai145Adoption.semanticMutationInputTransition;
  sourcePolicy.devai145Adoption.provider.sourceVersion =
    sourcePolicy.devai145Adoption.provider.targetVersion;
  devaiTransition.sourceRootManifest = manifestIdentity;
  devaiTransition.targetRootManifest = manifestIdentity;
  devaiTransition.sourceLockfile = identityFor('pnpm-lock.yaml');
  devaiTransition.targetLockfile = devaiTransition.sourceLockfile;
  const runnerIdentity = identityFor('scripts/run-mutation-evidence.mjs');
  sourcePolicy.devai145Adoption.governanceRunnerTransition.source = runnerIdentity;
  sourcePolicy.devai145Adoption.governanceRunnerTransition.target = runnerIdentity;
  const candidate = {
    commit: currentCommit,
    tree: currentTree,
    clean: true,
    changedPaths: [],
  };
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'stynx-d24-33-rebind-'));
  const sourceEvidence = join(fixtureRoot, 'synthetic-source');
  writeSyntheticMutationEvidence(sourceEvidence, sourcePolicy);
  let packageStarts = 0;
  const onPackageStart = () => {
    packageStarts += 1;
    throw new Error('package start sentinel tripped');
  };

  function writeFixtureSummary(sourceDirectory, mutate) {
    const summaryPath = join(sourceDirectory, 'summary.json');
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    mutate(summary);
    writeFileSync(summaryPath, `${canonicalize(summary)}\n`, { mode: 0o600 });
  }

  async function exerciseFailure({ name, prepare, expected }) {
    const caseRoot = join(fixtureRoot, name);
    const sourceDirectory = join(caseRoot, 'source');
    const finalDirectory = join(caseRoot, 'final');
    copyMutationEvidence(sourceEvidence, sourceDirectory);
    copyMutationEvidence(sourceEvidence, finalDirectory);
    const sourceBefore = mutationEvidenceSnapshot(sourceDirectory);
    const finalBefore = mutationEvidenceSnapshot(finalDirectory);
    const policy = structuredClone(sourcePolicy);
    const inputs = {
      repositoryRoot: repoRoot,
      policy,
      sourceDirectory,
      finalDirectory,
      candidate: structuredClone(candidate),
      onPackageStart,
      refreshPackages: policy.candidateRebind.refreshPackages,
      nonBehavioralPaths: policy.candidateRebind.nonBehavioralPaths,
    };
    prepare({ inputs, policy, sourceDirectory, finalDirectory, writeFixtureSummary });
    const preparedSource = mutationEvidenceSnapshot(sourceDirectory);
    await assert.rejects(() => rebindCandidateComposition(inputs), expected);
    assert.deepEqual(
      mutationEvidenceSnapshot(sourceDirectory),
      preparedSource,
      `${name}: source evidence changed on failure`,
    );
    assert.deepEqual(
      mutationEvidenceSnapshot(finalDirectory),
      finalBefore,
      `${name}: committed evidence changed on failure`,
    );
    assert.equal(packageStarts, 0, `${name}: package start sentinel must remain zero`);
    assert.notDeepEqual(sourceBefore, {}, `${name}: source fixture must be populated`);
    assert.deepEqual(
      readdirSync(caseRoot).filter((entry) => entry.startsWith('.mutation-rebind-')),
      [],
      `${name}: staging or backup residue remains`,
    );
  }

  try {
    const mismatchCases = [
      {
        name: 'missing-source-summary',
        prepare: ({ sourceDirectory }) => {
          rmSync(join(sourceDirectory, 'summary.json'));
        },
        expected: /source summary|ENOENT/u,
      },
      {
        name: 'wrong-source-summary-size',
        prepare: ({ sourceDirectory }) => {
          const summaryPath = join(sourceDirectory, 'summary.json');
          writeFileSync(summaryPath, Buffer.concat([readFileSync(summaryPath), Buffer.from(' ')]));
        },
        expected: /size|bytes/u,
      },
      {
        name: 'wrong-source-summary-digest',
        prepare: ({ sourceDirectory }) => {
          const summaryPath = join(sourceDirectory, 'summary.json');
          const bytes = readFileSync(summaryPath);
          bytes[0] ^= 1;
          writeFileSync(summaryPath, bytes);
        },
        expected: /digest|sha256/u,
      },
      {
        name: 'candidate-drift',
        prepare: ({ inputs }) => {
          inputs.candidate.clean = false;
        },
        expected: /candidate.*(?:dirty|drift)|clean/u,
      },
      {
        name: 'tree-drift',
        prepare: ({ inputs }) => {
          inputs.candidate.tree = '0'.repeat(40);
        },
        expected: /tree/u,
      },
      {
        name: 'path-drift',
        prepare: ({ inputs }) => {
          inputs.candidate.changedPaths.push('unauthorized.fixture');
        },
        expected: /path/u,
      },
      {
        name: 'roster-drift',
        prepare: ({ policy }) => {
          policy.candidateRebind.sourceSummary.packageCount = 37;
        },
        expected: /roster|package.*count/u,
      },
      {
        name: 'binding-drift',
        prepare: ({ policy }) => {
          policy.candidateRebind.sourceSummary.artifactBindingCount = 75;
        },
        expected: /binding/u,
      },
      {
        name: 'artifact-digest',
        prepare: ({ sourceDirectory }) => {
          const summary = JSON.parse(readFileSync(join(sourceDirectory, 'summary.json'), 'utf8'));
          const report = summary.packages[0].reportPath.split('/').at(-1);
          writeFileSync(join(sourceDirectory, report), '{}\n', { mode: 0o600 });
        },
        expected: /artifact|report|digest|size/u,
      },
      {
        name: 'provenance-drift',
        prepare: ({ policy, sourceDirectory, writeFixtureSummary: writeSummary }) => {
          writeSummary(sourceDirectory, (summary) => {
            summary.packages[0].provenance = 'foreign';
          });
          refreshFixtureSummaryIdentity(policy, sourceDirectory);
        },
        expected: /provenance/u,
      },
      {
        name: 'threshold-drift',
        prepare: ({ policy, sourceDirectory, writeFixtureSummary: writeSummary }) => {
          writeSummary(sourceDirectory, (summary) => {
            summary.packages[0].thresholds.break = 89;
          });
          refreshFixtureSummaryIdentity(policy, sourceDirectory);
        },
        expected: /threshold/u,
      },
      {
        name: 'target-drift',
        prepare: ({ policy, sourceDirectory, writeFixtureSummary: writeSummary }) => {
          writeSummary(sourceDirectory, (summary) => {
            summary.packages[0].targetCensus.targetFileCount += 1;
          });
          refreshFixtureSummaryIdentity(policy, sourceDirectory);
        },
        expected: /target/u,
      },
      {
        name: 'status-drift',
        prepare: ({ policy, sourceDirectory, writeFixtureSummary: writeSummary }) => {
          writeSummary(sourceDirectory, (summary) => {
            summary.packages[0].statusTotals.Killed += 1;
          });
          refreshFixtureSummaryIdentity(policy, sourceDirectory);
        },
        expected: /status/u,
      },
      {
        name: 'score-drift',
        prepare: ({ policy, sourceDirectory, writeFixtureSummary: writeSummary }) => {
          writeSummary(sourceDirectory, (summary) => {
            summary.packages[0].score -= 1;
          });
          refreshFixtureSummaryIdentity(policy, sourceDirectory);
        },
        expected: /score/u,
      },
      {
        name: 'baseline-drift',
        prepare: ({ policy, sourceDirectory, writeFixtureSummary: writeSummary }) => {
          writeSummary(sourceDirectory, (summary) => {
            summary.baseline.tree = '0'.repeat(40);
          });
          refreshFixtureSummaryIdentity(policy, sourceDirectory);
        },
        expected: /baseline/u,
      },
      {
        name: 'semantic-comparison-drift',
        prepare: ({ policy }) => {
          policy.candidateRebind.semanticRebindComparison.canonicalContractSha256 = '0'.repeat(64);
        },
        expected: /semantic|comparison/u,
      },
      {
        name: 'mode-drift',
        prepare: ({ sourceDirectory }) => {
          const summary = JSON.parse(readFileSync(join(sourceDirectory, 'summary.json'), 'utf8'));
          const report = summary.packages[0].reportPath.split('/').at(-1);
          chmodSync(join(sourceDirectory, report), 0o600);
        },
        expected: /mode/u,
      },
      {
        name: 'size-drift',
        prepare: ({ policy }) => {
          policy.candidateRebind.sourceSummary.bytes += 1;
        },
        expected: /size|bytes/u,
      },
      {
        name: 'summary-digest-drift',
        prepare: ({ policy }) => {
          policy.candidateRebind.sourceSummary.sha256 = '0'.repeat(64);
        },
        expected: /digest|sha256/u,
      },
    ];
    for (const mismatch of mismatchCases) await exerciseFailure(mismatch);

    for (const phase of ['after-final-to-backup', 'after-staging-to-final']) {
      await exerciseFailure({
        name: `atomic-publication-${phase}`,
        prepare: ({ inputs }) => {
          inputs.onPublicationPhase = (observedPhase) => {
            if (observedPhase === phase) {
              throw new Error(`synthetic atomic publication failure: ${phase}`);
            }
          };
        },
        expected: new RegExp(`synthetic atomic publication failure: ${phase}`, 'u'),
      });
    }

    const successRoot = join(fixtureRoot, 'success');
    const successSource = join(successRoot, 'source');
    const successFinal = join(successRoot, 'final');
    copyMutationEvidence(sourceEvidence, successSource);
    copyMutationEvidence(sourceEvidence, successFinal);
    const sourceBefore = mutationEvidenceSnapshot(successSource);
    const result = await rebindCandidateComposition({
      repositoryRoot: repoRoot,
      policy: structuredClone(sourcePolicy),
      sourceDirectory: successSource,
      finalDirectory: successFinal,
      candidate: structuredClone(candidate),
      onPackageStart,
    });
    assert.deepEqual(mutationEvidenceSnapshot(successSource), sourceBefore);
    const successFiles = mutationEvidenceSnapshot(successFinal);
    assert.equal(Object.keys(successFiles).length, 77);
    for (const [name, identity] of Object.entries(sourceBefore)) {
      if (name !== 'summary.json') assert.deepEqual(successFiles[name], identity, name);
    }
    const reboundSummary = JSON.parse(readFileSync(join(successFinal, 'summary.json'), 'utf8'));
    assert.deepEqual(reboundSummary.candidate, {
      commit: candidate.commit,
      tree: candidate.tree,
    });
    assert.deepEqual(
      reboundSummary.semanticRebindComparison,
      sourcePolicy.candidateRebind.semanticRebindComparison,
    );
    assert.equal(result.mode, 'candidate-rebound-composition');
    assert.equal(packageStarts, 0);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function materializationFixtureGit(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function gitObjectIdentity(root, commit, path) {
  const bytes = spawnSync('git', ['cat-file', 'blob', `${commit}:${path}`], {
    cwd: root,
    encoding: null,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ifError(bytes.error);
  assert.equal(bytes.status, 0, String(bytes.stderr));
  return {
    path,
    bytes: bytes.stdout.length,
    gitBlobOid: materializationFixtureGit(root, ['rev-parse', `${commit}:${path}`]),
    sha256: sha256(bytes.stdout),
  };
}

function createMaterializationFixture({ unsafeArtifact = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'stynx-d24-46-materialization-'));
  materializationFixtureGit(root, ['init', '-b', 'main']);
  materializationFixtureGit(root, ['config', 'user.name', 'STYNX Fixture']);
  materializationFixtureGit(root, ['config', 'user.email', 'fixture@stynx.invalid']);
  writeFileSync(join(root, 'seed.txt'), 'source candidate\n');
  materializationFixtureGit(root, ['add', 'seed.txt']);
  materializationFixtureGit(root, ['commit', '-m', 'fixture: source candidate']);
  const sourceCommit = materializationFixtureGit(root, ['rev-parse', 'HEAD']);
  const sourceTree = materializationFixtureGit(root, ['rev-parse', 'HEAD^{tree}']);

  const relativeArtifactRoot = '.devai/state/check-cache/v1/artifacts/mutation';
  const protectedArtifactRoot = join(root, 'artifacts', relativeArtifactRoot);
  mkdirSync(protectedArtifactRoot, { recursive: true });
  const report = {
    testFiles: {},
    files: {
      'packages/example/src/index.ts': {
        source: unsafeArtifact ? 'npm_abcdefghijklmnopqrstuvwxyz' : 'export const value = 1;',
        mutants: [
          {
            coveredBy: [],
            killedBy: [],
            replacement: '2',
            status: 'Killed',
            statusReason: 'fixture',
          },
        ],
      },
    },
  };
  const result = {
    packageName: '@stynx-nyx/example',
    workspace: 'packages/example',
    passed: true,
  };
  const sourceSummary = {
    kind: 'mutation-composed-report-set-v1',
    complete: true,
    passed: true,
    candidate: { commit: sourceCommit, tree: sourceTree },
    aggregate: { packageCount: 1 },
    packages: [
      {
        packageName: '@stynx-nyx/example',
        reportPath: `${relativeArtifactRoot}/packages-example.stryker.json`,
        resultPath: `${relativeArtifactRoot}/packages-example.result.json`,
      },
    ],
  };
  const artifactValues = new Map([
    ['packages-example.stryker.json', report],
    ['packages-example.result.json', result],
    ['summary.json', sourceSummary],
  ]);
  for (const [name, value] of artifactValues) {
    writeFileSync(join(protectedArtifactRoot, name), `${canonicalize(value)}\n`, { mode: 0o644 });
  }
  const manifest = {
    schemaVersion: '1.1.0',
    repositoryId: 'stynx-nyx/stynx-fixture',
    commit: sourceCommit,
    tree: sourceTree,
    profile: 'rc',
    signerId: 'fixture-inspector',
    artifacts: [...artifactValues.keys()].map((name) => ({
      mediaType: 'application/json',
      path: `${relativeArtifactRoot}/${name}`,
      sha256: sha256(readFileSync(join(protectedArtifactRoot, name))),
    })),
    resultDigests: [],
  };
  writeFileSync(join(root, 'manifest.json'), `${canonicalize(manifest)}\n`, { mode: 0o644 });
  materializationFixtureGit(root, ['add', 'artifacts', 'manifest.json']);
  materializationFixtureGit(root, ['commit', '-m', 'fixture: protected evidence']);
  const evidenceCommit = materializationFixtureGit(root, ['rev-parse', 'HEAD']);
  const evidenceTree = materializationFixtureGit(root, ['rev-parse', 'HEAD^{tree}']);
  materializationFixtureGit(root, ['tag', '-a', 'fixture-evidence', '-m', 'fixture evidence']);
  const tagObject = materializationFixtureGit(root, ['rev-parse', 'fixture-evidence']);

  const historicalRunner = `
    import { chmodSync, copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
    import { join } from 'node:path';
    function canonical(value) {
      if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
      if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
      return JSON.stringify(value);
    }
    export async function rebindCandidateComposition({ policy, sourceDirectory, finalDirectory, candidate }) {
      for (const name of readdirSync(sourceDirectory).sort()) {
        if (name === 'summary.json') continue;
        copyFileSync(join(sourceDirectory, name), join(finalDirectory, name));
        chmodSync(join(finalDirectory, name), 0o644);
      }
      const summary = JSON.parse(readFileSync(join(sourceDirectory, 'summary.json'), 'utf8'));
      summary.candidate = { commit: candidate.commit, tree: candidate.tree };
      summary.semanticRebindComparison = policy.semanticRebindComparison;
      writeFileSync(join(finalDirectory, 'summary.json'), canonical(summary) + '\\n', { mode: 0o644 });
      return { mode: 'candidate-rebound-composition' };
    }
  `;
  function commitStep(id) {
    mkdirSync(join(root, 'law'), { recursive: true });
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(
      join(root, 'law', 'step-policy.json'),
      `${canonicalize({ semanticRebindComparison: { kind: `fixture-step-${id}` } })}\n`,
    );
    writeFileSync(join(root, 'scripts', 'historical-runner.mjs'), historicalRunner);
    materializationFixtureGit(root, [
      'add',
      'law/step-policy.json',
      'scripts/historical-runner.mjs',
    ]);
    materializationFixtureGit(root, ['commit', '-m', `fixture: rebind ${id}`]);
    const commit = materializationFixtureGit(root, ['rev-parse', 'HEAD']);
    const tree = materializationFixtureGit(root, ['rev-parse', 'HEAD^{tree}']);
    return {
      candidate: { commit, tree },
      policy: gitObjectIdentity(root, commit, 'law/step-policy.json'),
      runner: gitObjectIdentity(root, commit, 'scripts/historical-runner.mjs'),
      semanticRebindComparison: { kind: `fixture-step-${id}` },
    };
  }
  const first = commitStep('one');
  const second = commitStep('two');
  const sourceBytes = readFileSync(join(protectedArtifactRoot, 'summary.json'));
  const firstSummary = { ...sourceSummary, candidate: first.candidate };
  firstSummary.semanticRebindComparison = first.semanticRebindComparison;
  const firstBytes = Buffer.from(`${canonicalize(firstSummary)}\n`);
  const secondSummary = { ...firstSummary, candidate: second.candidate };
  secondSummary.semanticRebindComparison = second.semanticRebindComparison;
  const secondBytes = Buffer.from(`${canonicalize(secondSummary)}\n`);
  const manifestBytes = readFileSync(join(root, 'manifest.json'));
  const policy = {
    candidateRebind: {
      sourceSummary: {
        path: `${relativeArtifactRoot}/summary.json`,
        bytes: secondBytes.length,
        sha256: sha256(secondBytes),
        packageCount: 1,
        artifactBindingCount: 2,
      },
      sourceMaterialization: {
        kind: 'protected-tag-chained-zero-execution-rebind-v1',
        destination: relativeArtifactRoot,
        protectedSource: {
          tag: 'fixture-evidence',
          tagObject,
          evidenceCommit,
          evidenceTree,
          repositoryId: manifest.repositoryId,
          profile: manifest.profile,
          signerId: manifest.signerId,
          manifest: {
            path: 'manifest.json',
            bytes: manifestBytes.length,
            sha256: sha256(manifestBytes),
          },
          artifactPrefix: `artifacts/${relativeArtifactRoot}/`,
          artifactCount: 3,
          reportCount: 1,
          resultCount: 1,
          summary: { bytes: sourceBytes.length, sha256: sha256(sourceBytes) },
        },
        steps: [
          {
            ...first,
            inputSummary: { bytes: sourceBytes.length, sha256: sha256(sourceBytes) },
            outputSummary: { bytes: firstBytes.length, sha256: sha256(firstBytes) },
          },
          {
            ...second,
            inputSummary: { bytes: firstBytes.length, sha256: sha256(firstBytes) },
            outputSummary: { bytes: secondBytes.length, sha256: sha256(secondBytes) },
          },
        ],
        checkout: 'local-shared-clone-exact-detached-commit',
        publication: 'same-filesystem-atomic-rename',
        existingDestination: 'accept-only-exact-complete-source',
        interruptedStaging: 'reject-without-reuse',
        credentialInputs: 0,
        mutationSubprocesses: 0,
        packageStarts: 0,
        mismatchDisposition: 'fail-before-destination-publication',
      },
    },
  };
  return { root, policy, expectedSummary: secondBytes, unsafeArtifact };
}

test('D24.46 protected source materialization is exact, atomic, portable, and zero-execution', async () => {
  const governed = JSON.parse(
    repositorySource('law/policy/stynx-1.1.1-mutation-reuse.json'),
  ).candidateRebind;
  const contract = governed.sourceMaterialization;
  assert.equal(contract.kind, 'protected-tag-chained-zero-execution-rebind-v1');
  assert.equal(contract.protectedSource.tagObject, '766b31c243c8d9a14f3c3cef883d2935e716e828');
  assert.equal(contract.protectedSource.evidenceCommit, '5d07b2923a44750f8daa06d2d0b8cd847d1c99ce');
  assert.equal(contract.protectedSource.evidenceTree, 'dd41ab82ade66608738b442b88f26eb7cca6e989');
  assert.equal(contract.protectedSource.artifactCount, 77);
  assert.equal(contract.protectedSource.reportCount, 38);
  assert.equal(contract.protectedSource.resultCount, 38);
  assert.equal(
    contract.protectedSource.summary.sha256,
    '6548078707306ef7d28169e34ba50ee8d324c5766f60c50fdf41a153f7800d45',
  );
  assert.deepEqual(
    contract.steps.map((step) => ({
      commit: step.candidate.commit,
      tree: step.candidate.tree,
      policy: step.policy.gitBlobOid,
      runner: step.runner.gitBlobOid,
      output: step.outputSummary.sha256,
    })),
    [
      {
        commit: 'fce985d4914f3f2b450b4ca4e0828d665ca0e36e',
        tree: '684d6c3012f4745961c8448f337c430634b3a8fe',
        policy: '3961061d0f5be3ba87758d1633e60dcbceb8aa65',
        runner: '42e1b760449d14126c7bebab7f5a16af253a4b82',
        output: 'fc8396fa8fb3add85b6aa81332bef75cfdf234b970cebed595167d2e1b76d05d',
      },
      {
        commit: 'f8a3521a944abc4b5c8a07e1ebae8d349e549fd7',
        tree: '32a3a8fd59afcd500f9d67552081f819cba9b4d7',
        policy: '3ada5eca7193976c1d281ca1bd4964c5997c8d98',
        runner: '657da63dbe1a7343bb7ea428a2f0157138abaf74',
        output: 'd86162cf5e2055dbea7e418c18de0904bcc2d077f25def95b32e2c71a147cf70',
      },
    ],
  );
  assert.equal(contract.steps.at(-1).outputSummary.sha256, governed.sourceSummary.sha256);
  assert.equal(contract.credentialInputs, 0);
  assert.equal(contract.mutationSubprocesses, 0);
  assert.equal(contract.packageStarts, 0);

  const runner = repositorySource('scripts/run-mutation-evidence.mjs');
  assert.match(runner, /export (?:async )?function materializeCandidateRebindSource\s*\(/u);
  assert.match(runner, /git[^\n]*clone[^\n]*(?:--shared|--local)/u);
  assert.match(runner, /assertFocusedEvidenceSafe/u);
  assert.match(runner, /candidate rebind package start is forbidden/u);
  assert.match(runner, /renameSync/u);
  const { materializeCandidateRebindSource } = await import(
    `../../scripts/run-mutation-evidence.mjs?d24-46=${sha256(runner)}`
  );
  assert.equal(typeof materializeCandidateRebindSource, 'function');

  const fixture = createMaterializationFixture();
  const finalDirectory = join(fixture.root, 'accepted-source');
  let packageStarts = 0;
  const onPackageStart = () => {
    packageStarts += 1;
    throw new Error('package start sentinel tripped');
  };
  const baseInputs = {
    repositoryRoot: fixture.root,
    policy: fixture.policy,
    finalDirectory,
    onPackageStart,
  };
  try {
    const result = await materializeCandidateRebindSource(baseInputs);
    assert.equal(result.mode, 'materialized-protected-source');
    assert.equal(result.packageStarts, 0);
    assert.equal(packageStarts, 0);
    assert.equal(readdirSync(finalDirectory).length, 3);
    assert.equal(
      sha256(readFileSync(join(finalDirectory, 'summary.json'))),
      sha256(fixture.expectedSummary),
    );
    assert.deepEqual(readFileSync(join(finalDirectory, 'summary.json')), fixture.expectedSummary);
    assert.deepEqual(
      readdirSync(fixture.root).filter((name) => name.startsWith('.mutation-source-materialize')),
      [],
    );
    const validated = await materializeCandidateRebindSource(baseInputs);
    assert.equal(validated.mode, 'validated-existing-source');
    assert.equal(packageStarts, 0);

    const mismatchCases = [
      ['missing-tag', (value) => (value.protectedSource.tag = 'missing-evidence'), /tag|ref/u],
      ['tag-object', (value) => (value.protectedSource.tagObject = '0'.repeat(40)), /tag/u],
      [
        'evidence-commit',
        (value) => (value.protectedSource.evidenceCommit = '0'.repeat(40)),
        /commit/u,
      ],
      ['evidence-tree', (value) => (value.protectedSource.evidenceTree = '0'.repeat(40)), /tree/u],
      [
        'manifest-size',
        (value) => (value.protectedSource.manifest.bytes += 1),
        /manifest.*(?:size|bytes)/u,
      ],
      [
        'manifest-digest',
        (value) => (value.protectedSource.manifest.sha256 = '0'.repeat(64)),
        /manifest.*(?:digest|sha256)/u,
      ],
      [
        'artifact-path',
        (value) => (value.protectedSource.artifactPrefix = '../escape/'),
        /path|prefix/u,
      ],
      [
        'artifact-count',
        (value) => (value.protectedSource.artifactCount += 1),
        /artifact.*count|population/u,
      ],
      [
        'report-count',
        (value) => (value.protectedSource.reportCount += 1),
        /report.*count|population/u,
      ],
      [
        'result-count',
        (value) => (value.protectedSource.resultCount += 1),
        /result.*count|population/u,
      ],
      ['old-summary-final', (value) => (value.steps = []), /step|final.*summary|source summary/u],
      ['step-policy', (value) => (value.steps[0].policy.sha256 = '0'.repeat(64)), /policy/u],
      ['step-runner', (value) => (value.steps[0].runner.gitBlobOid = '0'.repeat(40)), /runner/u],
      [
        'step-input',
        (value) => (value.steps[0].inputSummary.sha256 = '0'.repeat(64)),
        /input.*summary/u,
      ],
      [
        'step-output',
        (value) => (value.steps[0].outputSummary.sha256 = '0'.repeat(64)),
        /output.*summary/u,
      ],
      [
        'final-summary',
        (value) => (value.steps[1].outputSummary.sha256 = '0'.repeat(64)),
        /output.*summary|final.*summary/u,
      ],
      ['package-starts', (value) => (value.packageStarts = 1), /package.*start/u],
      [
        'mutation-subprocesses',
        (value) => (value.mutationSubprocesses = 1),
        /mutation.*subprocess/u,
      ],
    ];
    for (const [name, mutate, expected] of mismatchCases) {
      const caseFinal = join(fixture.root, `rejected-${name}`);
      const policy = structuredClone(fixture.policy);
      mutate(policy.candidateRebind.sourceMaterialization);
      await assert.rejects(
        () =>
          materializeCandidateRebindSource({
            repositoryRoot: fixture.root,
            policy,
            finalDirectory: caseFinal,
            onPackageStart,
          }),
        expected,
        name,
      );
      assert.equal(existsSync(caseFinal), false, `${name}: rejected source was published`);
      assert.equal(packageStarts, 0, `${name}: package start sentinel changed`);
    }

    const interruptedFinal = join(fixture.root, 'interrupted-final');
    const interruptedStage = join(fixture.root, '.mutation-source-materialize');
    mkdirSync(interruptedStage);
    await assert.rejects(
      () =>
        materializeCandidateRebindSource({
          ...baseInputs,
          finalDirectory: interruptedFinal,
          stagingDirectory: interruptedStage,
        }),
      /staging|residue/u,
    );
    assert.equal(existsSync(interruptedFinal), false);
    assert.equal(packageStarts, 0);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }

  const unsafeFixture = createMaterializationFixture({ unsafeArtifact: true });
  try {
    await assert.rejects(
      () =>
        materializeCandidateRebindSource({
          repositoryRoot: unsafeFixture.root,
          policy: unsafeFixture.policy,
          finalDirectory: join(unsafeFixture.root, 'unsafe-final'),
          onPackageStart,
        }),
      /credential|unsafe|portable/u,
    );
    assert.equal(existsSync(join(unsafeFixture.root, 'unsafe-final')), false);
    assert.equal(packageStarts, 0);
  } finally {
    rmSync(unsafeFixture.root, { recursive: true, force: true });
  }
});

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
  assert.deepEqual(names, [...campaignPolicy.publishable_packages].sort());

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
    env: options.env ?? process.env,
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

test('generated README check rejects hand-written dependency prose outside its markers', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'stynx-readme-prose-'));
  try {
    mkdirSync(join(fixtureRoot, 'scripts', 'lib'), { recursive: true });
    mkdirSync(join(fixtureRoot, 'packages-web'), { recursive: true });
    copyFileSync(
      join(repoRoot, 'scripts', 'generate-package-readmes.mjs'),
      join(fixtureRoot, 'scripts', 'generate-package-readmes.mjs'),
    );
    copyFileSync(
      join(repoRoot, 'scripts', 'lib', 'publishable-packages.mjs'),
      join(fixtureRoot, 'scripts', 'lib', 'publishable-packages.mjs'),
    );
    writeJson(join(fixtureRoot, 'packages', 'fixture', 'package.json'), {
      name: '@stynx-nyx/fixture',
      version: '1.1.2',
    });
    writeFileSync(
      join(fixtureRoot, 'packages', 'fixture', 'README.md'),
      '# Fixture\n\nPeer dependencies: stale hand-written claim.\n',
    );
    const check = spawnSync(
      process.execPath,
      [join(fixtureRoot, 'scripts', 'generate-package-readmes.mjs'), '--check'],
      { cwd: fixtureRoot, encoding: 'utf8' },
    );
    assert.notEqual(check.status, 0);
    assert.match(check.stderr, /hand-written dependency prose outside the generated markers/u);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Doctor distinguishes an unavailable live RLS observation from a verified check', () => {
  const env = { ...process.env };
  for (const variable of ['DATABASE_URL', 'STYNX_DATABASE_URL', 'STYNX_TEST_DATABASE_URL']) {
    delete env[variable];
  }
  const doctor = runNode('scripts/stynx-doctor.mjs', ['--json'], { env });
  const result = JSON.parse(doctor.stdout);
  const rls = result.checks.find(({ name }) => name === 'rls-smoke');
  assert.equal(rls.status, 'skipped');
  assert.match(rls.message, /not attempted/u);
  assert.equal(Object.hasOwn(rls, 'ok'), false);
});

test('INV-COVERAGE-001 remains a gate and claims all six operational package families', () => {
  const invariant = JSON.parse(repositorySource('law/invariants/INV-COVERAGE-001.json'));
  const useCases = JSON.parse(
    repositorySource('product/use-cases/stynx-operational-packages.json'),
  );
  assert.equal(invariant.severity, 'gate');
  assert.match(invariant.statement, /refs\.serviceOperationIds\[\]/u);
  assert.equal(useCases.cases.length, 6);
  assert.deepEqual(
    useCases.cases.map(({ id }) => id),
    [
      'UC-stynx-015',
      'UC-stynx-016',
      'UC-stynx-017',
      'UC-stynx-018',
      'UC-stynx-019',
      'UC-stynx-020',
    ],
  );
  const serviceOperations = [
    ...new Set(
      useCases.cases.flatMap(({ mainFlow }) =>
        mainFlow.flatMap(({ refs }) => refs.serviceOperationIds ?? []),
      ),
    ),
  ];
  for (const packageName of [
    'jobs',
    'mobile-runtime',
    'notifications',
    'offline-sync',
    'outbox',
    'worklist',
  ]) {
    assert.ok(
      serviceOperations.some((operation) => operation.startsWith(`@stynx-nyx/${packageName}:`)),
      `${packageName}: no authored service-operation claim`,
    );
  }
  const endpointIds = useCases.cases.flatMap(({ mainFlow }) =>
    mainFlow.flatMap(({ refs }) => refs.endpointIds ?? []),
  );
  assert.deepEqual(endpointIds.sort(), [
    'POST /offline-sync/conflicts/:id/resolve',
    'POST /offline-sync/numbering-reservations',
    'POST /offline-sync/numbering-reservations/:id/cancel',
    'POST /offline-sync/sync-batches',
  ]);
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
    [...campaignPolicy.publishable_packages].sort(),
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

test('trace closes 495/380/115/14=509 with all 12 mappings and current assertion digests', () => {
  const check = runNode('scripts/verify-devai-trace.mjs');
  const summary = JSON.parse(check.stdout);
  assert.equal(summary.tracked_test_paths, 495);
  assert.equal(summary.executable_tests, 380);
  assert.equal(summary.fixtures_and_support, 115);
  assert.equal(summary.scripts_and_config_attestations, 14);
  assert.equal(summary.governed_test_surface, 509);
  assert.deepEqual(summary.failures, []);
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

test('missing, stale, failed, or foreign-tree campaign evidence remains fail-closed', () => {
  assert.ok(existsSync(join(repoRoot, 'scripts/verify-missing-evidence.mjs')));
  const evidence = repositorySource('scripts/verify-missing-evidence.mjs');
  assert.equal(
    sha256(evidence),
    JSON.parse(repositorySource('law/policy/stynx-1.1.1-mutation-reuse.json')).candidateRebind
      .promotionVerifier.sha256,
  );
  for (const marker of [
    'candidate',
    'tree',
    'verified-local-rc',
    'hardening',
    'stale',
    'missing',
  ]) {
    assert.match(evidence, new RegExp(marker, 'iu'));
  }
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
});
