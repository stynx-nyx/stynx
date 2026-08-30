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
  registryVersionPolicyConstants,
  RegistryVersionPolicyError,
  validateRegistryCensus,
} from '../../scripts/lib/registry-version-policy.mjs';
import {
  expectedRebaselineChangelog,
  runUnifiedRebaseline,
  unifiedRebaselinePackageCount,
  unifiedRebaselineTarget,
} from '../../scripts/lib/unified-rebaseline.mjs';
import { discoverMutationRoster } from '../../scripts/lib/mutation-roster.mjs';
import { classifyReleaseContext, ReleaseContextError } from '../../scripts/lib/release-context.mjs';
import { typeOnlyCoverageExclusions } from '../../tools/repo-config/coverage-population.mjs';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

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
const publishedPackageNames = packageNames.filter(
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

function absentRegistryState() {
  return { authenticated: true, status: 404 };
}

function validRegistryCensus() {
  return new Map(
    packageNames.map((name) => {
      if (firstPublicationNames.includes(name)) return [name, absentRegistryState()];
      const versions =
        name === '@stynx-nyx/angular-profile'
          ? ['0.5.0', '1.0.0', '1.1.0', '2.0.0']
          : name === '@stynx-nyx/angular-sessions' || name === '@stynx-nyx/sessions'
            ? ['0.5.0', '1.0.0', '1.1.0']
            : ['0.5.0', '1.0.0'];
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
    candidate: unifiedRebaselineTarget,
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

test('Architect policy and workspace structurally define exactly 44/38/6', () => {
  const { roster: mutationRoster, failures: mutationFailures } = discoverMutationRoster(repoRoot);
  const mutationNames = mutationRoster.map(({ packageName }) => packageName).sort();
  assert.equal(registryVersionPolicyConstants.packageCount, 44);
  assert.equal(packageNames.length, 44);
  assert.equal(new Set(packageNames).size, 44);
  assert.equal(publishedPackageNames.length, 38);
  assert.deepEqual([...campaignPolicy.publishable_packages].sort(), packageNames);
  assert.deepEqual([...campaignPolicy.existing_private_packages].sort(), publishedPackageNames);
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

test('complete authenticated registry and inventory census returns 44/38/6', () => {
  assert.deepEqual(validate(), {
    anomalyMatches: 1,
    absentPackageCount: 6,
    packageCount: 44,
    publishedPackageCount: 38,
  });
});

test('1.1.1 collision in any of the 44 packages blocks the unified candidate', () => {
  for (const packageName of packageNames) {
    const states = validRegistryCensus();
    states.set(packageName, publishedRegistryState(packageName, ['0.5.0', '1.1.0', '1.1.1']));
    assertPolicyError(
      () => validate({ registryStatesByPackage: states }),
      'REGISTRY_CANDIDATE_EXISTS',
    );
  }
});

test('legitimate 1.1.0 history and the exact angular-profile 2.0.0 anomaly are accepted', () => {
  const result = validate();
  assert.equal(result.anomalyMatches, 1);
  assert.equal(result.publishedPackageCount, 38);
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

  assertPolicyError(() => validate({ candidate: '1.1.2' }), 'REGISTRY_CANDIDATE_UNSUPPORTED');
});

test('first-publication exceptions reject extra, missing, renamed, and wrong-candidate policy', () => {
  const mutations = [
    (policy) => policy.approved_first_publications.push('@stynx-nyx/extra'),
    (policy) => policy.approved_first_publications.pop(),
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
  const anomaly = loadRegistryAnomalyPolicy(repoRoot, unifiedRebaselineTarget);
  assert.equal(anomaly.package, '@stynx-nyx/angular-profile');
  assert.equal(anomaly.version, '2.0.0');
  assert.equal(anomaly.allowed_candidate, '1.1.1');

  const root = mkdtempSync(join(tmpdir(), 'stynx-anomaly-policy-'));
  try {
    assertPolicyError(
      () => loadRegistryAnomalyPolicy(root, unifiedRebaselineTarget),
      'REGISTRY_ANOMALY_POLICY_MISSING',
    );
    const policyPath = join(root, 'law', 'policy', 'registry-version-anomalies.json');
    mkdirSync(dirname(policyPath), { recursive: true });
    writeFileSync(policyPath, '{}\n');
    assertPolicyError(
      () => loadRegistryAnomalyPolicy(root, unifiedRebaselineTarget),
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
    version: '0.5.0',
  });
  writeJson(join(root, '.changeset', 'config.json'), {
    fixed: [names],
  });
  mkdirSync(join(root, 'packages-web'), { recursive: true });

  for (const [index, name] of names.entries()) {
    const packageDirectory = join(root, 'packages', `fixture-${String(index).padStart(2, '0')}`);
    const manifest = {
      name,
      version: '0.5.0',
      dependencies: index === 0 ? { [names[1]]: '^0.5.0', [names[2]]: 'workspace:*' } : undefined,
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
    dependencies: { [names[0]]: '^0.5.0' },
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

function repositorySourceAt(commit, path) {
  const result = spawnSync('git', ['show', `${commit}:${path}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

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
  const sourcePolicy = JSON.parse(
    repositorySourceAt(frozenCompositionCommit, 'law/policy/stynx-1.1.1-mutation-reuse.json'),
  );
  assert.deepEqual(policy.candidateRebind, {
    kind: 'zero-mutation-candidate-rebind-v1',
    sourceCandidate: {
      commit: frozenCompositionCommit,
      tree: 'fa3f2a43eeb89e73dff04074d021e2ba1783cf84',
    },
    sourceSummary: {
      path: '.devai/state/check-cache/v1/artifacts/mutation/summary.json',
      bytes: 36_649,
      sha256: '00af2696162936a3f2ca4d7cfc7f68d8f2134a3639b111b07db1a34df1560e29',
      packageCount: 38,
      artifactBindingCount: 76,
    },
    sourceInputProjection: {
      kind: 'sorted-package-input-projection-digest-map-v1',
      bytes: 4_934,
      sha256: 'f9222176e2fcde022dae67e8a776fb7de4cfb9e0eb4f85d5c0a1f2c36a86b674',
      disposition: 'historical-source-identities',
    },
    semanticRebindComparison: {
      kind: 'root-manifest-two-script-transition-v1',
      sourceRootManifest: {
        bytes: 10_790,
        sha256: '07f672f29660f90cb9480a7ff395463f5ccb08ecd5f74e61869391ef1653b47c',
        gitBlobOid: '6d232561370502cac0489bc2cddeaf316be6beea',
      },
      targetRootManifest: {
        bytes: 10_790,
        sha256: 'cccac5d19c5b38dd2f2d4840451c7c7d1b2fbb6403451bc0c2b149f0e8f80846',
        gitBlobOid: 'da1ed88ad64acc60996d76e150af883ece7ba944',
      },
      allowedScriptTransitions: [
        {
          field: 'scripts.ci:stynx:release',
          from: 'pnpm test:coverage && node scripts/verify-missing-evidence.mjs && node scripts/run-release-preparation.mjs',
          to: 'pnpm test:coverage && node scripts/run-release-preparation.mjs',
        },
        {
          field: 'scripts.release:publish:ci',
          from: 'node scripts/changesets-publish-ci.mjs',
          to: 'node scripts/verify-missing-evidence.mjs && node scripts/changesets-publish-ci.mjs',
        },
      ],
      comparison: {
        rootManifest: 'target-bytes-equal-exact-two-source-byte-replacements',
        otherRootManifestBytes: 'identical',
        otherMutationInputTreeEntries: 'identical-mode-type-oid',
      },
      canonicalContractBytes: 960,
      canonicalContractSha256: 'cc7054ec2e3cdaf15ed6b2a30259ac483496ed3f25cb180933a08d6d1b45aa28',
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
  assert.deepEqual(policy.allowedChangedPaths, [
    ...sourcePolicy.allowedChangedPaths.slice(0, 3),
    'package.json',
    ...sourcePolicy.allowedChangedPaths.slice(3),
  ]);

  const sourceManifest = JSON.parse(repositorySourceAt(frozenCompositionCommit, 'package.json'));
  assert.equal(
    Buffer.byteLength(repositorySourceAt(frozenCompositionCommit, 'package.json')),
    10_790,
  );
  assert.equal(
    sha256(repositorySourceAt(frozenCompositionCommit, 'package.json')),
    policy.candidateRebind.semanticRebindComparison.sourceRootManifest.sha256,
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
  const normalizedManifest = structuredClone(rootManifest);
  for (const script of ['ci:stynx:release', 'release:publish:ci']) {
    normalizedManifest.scripts[script] = sourceManifest.scripts[script];
  }
  assert.deepEqual(
    normalizedManifest,
    sourceManifest,
    'only the two release sequencing fields may differ from the frozen mutation input',
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(rootManifest.scripts).filter(
        ([script]) => !['ci:stynx:release', 'release:publish:ci'].includes(script),
      ),
    ),
    Object.fromEntries(
      Object.entries(sourceManifest.scripts).filter(
        ([script]) => !['ci:stynx:release', 'release:publish:ci'].includes(script),
      ),
    ),
  );
});

test('D24.33 runner validates and atomically rebinds without a package start', () => {
  const runner = repositorySource('scripts/run-mutation-evidence.mjs');
  const branchStart = runner.indexOf('policy.candidateRebind');
  assert.notEqual(branchStart, -1, 'candidate rebind branch is missing');
  const branchEnd = runner.indexOf('\n  const baseline = validateBaseline', branchStart);
  assert.notEqual(branchEnd, -1, 'candidate rebind must precede fresh composition');
  const branch = runner.slice(branchStart, branchEnd);
  for (const marker of [
    'sourceCandidate',
    'sourceSummary',
    'artifactBindingCount',
    'sourceInputProjection',
    'semanticRebindComparison',
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
  assert.match(runner, /renameSync\(stagingDirectory, finalDirectory\)/u);
  assert.match(runner, /renameSync\(backupDirectory, finalDirectory\)/u);
  assert.doesNotMatch(
    branch,
    /runPackage|freshRoster\.map|selectedRoster\.map|preflightFullMutationInfrastructure/u,
    'candidate rebind cannot start mutation or a package process',
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

  const sourceEvidence = join(repoRoot, '.devai/state/check-cache/v1/artifacts/mutation');
  const sourcePolicy = JSON.parse(repositorySource('law/policy/stynx-1.1.1-mutation-reuse.json'));
  const currentCommit = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).stdout.trim();
  const currentTree = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).stdout.trim();
  const changedPaths = spawnSync(
    'git',
    ['diff', '--name-only', `${frozenCompositionCommit}..HEAD`],
    { cwd: repoRoot, encoding: 'utf8' },
  )
    .stdout.trim()
    .split('\n');
  const candidate = {
    commit: currentCommit,
    tree: currentTree,
    clean: true,
    changedPaths,
  };
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'stynx-d24-33-rebind-'));
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
  }

  try {
    const mismatchCases = [
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
          inputs.candidate.changedPaths.push('README.md');
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

    await exerciseFailure({
      name: 'atomic-publication-failure',
      prepare: ({ inputs }) => {
        inputs.publishDirectory = () => {
          throw new Error('synthetic atomic publication failure');
        };
      },
      expected: /synthetic atomic publication failure/u,
    });

    const successRoot = join(fixtureRoot, 'success');
    const successSource = join(successRoot, 'source');
    const successFinal = join(successRoot, 'final');
    copyMutationEvidence(sourceEvidence, successSource);
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
  assert.match(hardening, /No current k6 summary files were produced/u);
});

test('missing, stale, failed, or foreign-tree campaign evidence remains fail-closed', () => {
  assert.ok(existsSync(join(repoRoot, 'scripts/verify-missing-evidence.mjs')));
  const evidence = repositorySource('scripts/verify-missing-evidence.mjs');
  assert.equal(
    sha256(evidence),
    sha256(repositorySourceAt(frozenCompositionCommit, 'scripts/verify-missing-evidence.mjs')),
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
