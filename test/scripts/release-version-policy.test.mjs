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
const packageRoster = JSON.parse(
  readFileSync(join(repoRoot, 'law', 'policy', 'stynx-package-roster.json'), 'utf8'),
);

// The 1.1.1 release campaign policy was retired with the DEVAI adoption
// migration. Its still-valid product content — the 44/38/6 package census and
// the six approved first-publication exceptions — now lives in
// law/policy/stynx-package-roster.json. This fixture reconstructs the shape the
// product registry-census validator accepts, so first-publication policy
// enforcement keeps its coverage without a candidate-bound campaign document.
const campaignPolicy = {
  policy_id: 'stynx.package-roster',
  candidate: {
    version: unifiedRebaselineTarget,
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
  assert.equal(publishedPackageNames.length, 38);
  assert.deepEqual([...packageRoster.publishable_packages].sort(), packageNames);
  assert.deepEqual([...packageRoster.existing_private_packages].sort(), publishedPackageNames);
  assert.deepEqual(mutationFailures, []);
  assert.equal(mutationNames.length, 38);
  assert.deepEqual([...packageRoster.mutation_packages].sort(), mutationNames);
  assert.deepEqual([...packageRoster.approved_first_publications].sort(), firstPublicationNames);
  assert.equal(packageRoster.counts.publishable, 44);
  assert.equal(packageRoster.counts.mutation, 38);
  assert.equal(packageRoster.counts.existing_private, 38);
  assert.equal(packageRoster.counts.approved_first_publications, 6);
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

test('complete authenticated registry and inventory census returns 44/38/6', () => {
  assert.deepEqual(validate(), {
    anomalyMatches: 1,
    absentPackageCount: 6,
    packageCount: 44,
    publishedPackageCount: 38,
  });
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
});
