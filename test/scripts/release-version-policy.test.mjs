import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

test('trace closes 489/374/115/14=503 with all 12 mappings and current assertion digests', () => {
  const check = runNode('scripts/verify-devai-trace.mjs');
  const summary = JSON.parse(check.stdout);
  assert.equal(summary.tracked_test_paths, 489);
  assert.equal(summary.executable_tests, 374);
  assert.equal(summary.fixtures_and_support, 115);
  assert.equal(summary.scripts_and_config_attestations, 14);
  assert.equal(summary.governed_test_surface, 503);
  assert.deepEqual(summary.failures, []);
  assert.equal(check.status, 0, check.stderr || check.stdout);
});

test('readiness-bearing RLS fails closed when live PostgreSQL observation is unavailable', () => {
  const check = spawnSync('bash', [join(repoRoot, 'scripts/check-rls-smoke.sh')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      STYNX_RLS_LIVE_REQUIRED: '1',
      STYNX_TEST_DATABASE_URL: '',
      DATABASE_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.notEqual(check.status, 0, 'live-required RLS must not convert unavailable input to PASS');
  assert.match(`${check.stdout}\n${check.stderr}`, /RLS_LIVE_(?:CONFIG|OBSERVATION)_MISSING/u);
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

test('missing, stale, failed, or foreign-tree campaign evidence blocks release preparation', () => {
  assert.ok(existsSync(join(repoRoot, 'scripts/verify-missing-evidence.mjs')));
  assert.match(rootManifest.scripts['ci:stynx:release'], /missing-evidence/u);
  const evidence = repositorySource('scripts/verify-missing-evidence.mjs');
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
