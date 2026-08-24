import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import {
  fetchRegistryCensus,
  loadRegistryAnomalyPolicy,
  RegistryVersionPolicyError,
  validateRegistryCensus,
} from '../../scripts/lib/registry-version-policy.mjs';
import {
  expectedRebaselineChangelog,
  runUnifiedRebaseline,
  unifiedRebaselinePackageCount,
  unifiedRebaselineTarget,
} from '../../scripts/lib/unified-rebaseline.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const packageNames = Array.from({ length: 37 }, (_, index) =>
  index === 0
    ? '@stynx-nyx/angular-profile'
    : index === 1
      ? '@stynx-nyx/angular-sessions'
      : `@stynx-nyx/fixture-${String(index).padStart(2, '0')}`,
).concat('@stynx-nyx/sessions');
const anomaly = loadRegistryAnomalyPolicy(repoRoot, unifiedRebaselineTarget);

function registryMetadata(name, versions) {
  return {
    name,
    versions: Object.fromEntries(versions.map((version) => [version, { name, version }])),
    'dist-tags': { latest: versions.at(-1) },
  };
}

function validRegistryCensus() {
  return new Map(
    packageNames.map((name) => [
      name,
      registryMetadata(
        name,
        name === '@stynx-nyx/angular-profile' ? ['1.0.0', '1.1.0', '2.0.0'] : ['1.0.0', '1.1.0'],
      ),
    ]),
  );
}

function assertPolicyError(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof RegistryVersionPolicyError);
    assert.equal(error.code, code);
    return true;
  });
}

test('registry census accepts all 38 packages below 1.1.1 plus the exact anomaly', () => {
  const result = validateRegistryCensus({
    packageNames,
    metadataByPackage: validRegistryCensus(),
    candidate: unifiedRebaselineTarget,
    anomaly,
  });

  assert.deepEqual(result, { anomalyMatches: 1, packageCount: 38 });
});

test('registry census rejects candidate presence and legitimate canonical-line collisions', () => {
  const candidatePresent = validRegistryCensus();
  candidatePresent.set(
    '@stynx-nyx/sessions',
    registryMetadata('@stynx-nyx/sessions', ['1.1.0', '1.1.1']),
  );
  assertPolicyError(
    () =>
      validateRegistryCensus({
        packageNames,
        metadataByPackage: candidatePresent,
        candidate: unifiedRebaselineTarget,
        anomaly,
      }),
    'REGISTRY_CANDIDATE_EXISTS',
  );

  const higherCanonicalVersion = validRegistryCensus();
  higherCanonicalVersion.set(
    '@stynx-nyx/sessions',
    registryMetadata('@stynx-nyx/sessions', ['1.1.0', '1.2.0']),
  );
  assertPolicyError(
    () =>
      validateRegistryCensus({
        packageNames,
        metadataByPackage: higherCanonicalVersion,
        candidate: unifiedRebaselineTarget,
        anomaly,
      }),
    'REGISTRY_CANONICAL_LINE_NOT_MONOTONIC',
  );
});

test('registry census rejects every broader or unmatched anomaly', () => {
  const unadjudicatedMajor = validRegistryCensus();
  unadjudicatedMajor.set(
    '@stynx-nyx/sessions',
    registryMetadata('@stynx-nyx/sessions', ['1.1.0', '2.0.0']),
  );
  assertPolicyError(
    () =>
      validateRegistryCensus({
        packageNames,
        metadataByPackage: unadjudicatedMajor,
        candidate: unifiedRebaselineTarget,
        anomaly,
      }),
    'REGISTRY_UNADJUDICATED_VERSION',
  );

  const missingExactAnomaly = validRegistryCensus();
  missingExactAnomaly.set(
    '@stynx-nyx/angular-profile',
    registryMetadata('@stynx-nyx/angular-profile', ['1.0.0', '1.1.0']),
  );
  assertPolicyError(
    () =>
      validateRegistryCensus({
        packageNames,
        metadataByPackage: missingExactAnomaly,
        candidate: unifiedRebaselineTarget,
        anomaly,
      }),
    'REGISTRY_ANOMALY_UNMATCHED',
  );

  assertPolicyError(
    () =>
      validateRegistryCensus({
        packageNames,
        metadataByPackage: validRegistryCensus(),
        candidate: '1.1.2',
        anomaly,
      }),
    'REGISTRY_CANDIDATE_UNSUPPORTED',
  );
});

test('registry census rejects roster drift, partial responses, and malformed metadata', () => {
  assertPolicyError(
    () =>
      validateRegistryCensus({
        packageNames: packageNames.slice(1),
        metadataByPackage: validRegistryCensus(),
        candidate: unifiedRebaselineTarget,
        anomaly,
      }),
    'REGISTRY_ROSTER_DRIFT',
  );

  const partial = validRegistryCensus();
  partial.delete('@stynx-nyx/sessions');
  assertPolicyError(
    () =>
      validateRegistryCensus({
        packageNames,
        metadataByPackage: partial,
        candidate: unifiedRebaselineTarget,
        anomaly,
      }),
    'REGISTRY_CENSUS_INCOMPLETE',
  );

  const malformed = validRegistryCensus();
  malformed.set('@stynx-nyx/sessions', {
    name: '@stynx-nyx/sessions',
    versions: {},
    'dist-tags': { latest: '1.1.0' },
  });
  assertPolicyError(
    () =>
      validateRegistryCensus({
        packageNames,
        metadataByPackage: malformed,
        candidate: unifiedRebaselineTarget,
        anomaly,
      }),
    'REGISTRY_METADATA_MALFORMED',
  );

  const unsupportedVersion = validRegistryCensus();
  unsupportedVersion.set(
    '@stynx-nyx/sessions',
    registryMetadata('@stynx-nyx/sessions', ['1.1.0', 'v1.1.1']),
  );
  assertPolicyError(
    () =>
      validateRegistryCensus({
        packageNames,
        metadataByPackage: unsupportedVersion,
        candidate: unifiedRebaselineTarget,
        anomaly,
      }),
    'REGISTRY_VERSION_UNSUPPORTED',
  );
});

test('authenticated census fails closed without credentials or on authentication failure', async () => {
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
});

test('Architect anomaly policy is required at its exact approved digest', () => {
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

test('one-time rebaseline deterministically updates the exact 38-package release surface', () => {
  const fixture = createRebaselineFixture();
  try {
    const changesetConfig = JSON.parse(
      readFileSync(join(fixture.root, '.changeset', 'config.json'), 'utf8'),
    );
    const first = runUnifiedRebaseline(fixture.root, changesetConfig, 'write');
    assert.deepEqual(first, { packageCount: 38, changedFiles: 79 });
    assert.deepEqual(runUnifiedRebaseline(fixture.root, changesetConfig, 'check'), {
      packageCount: 38,
      changedFiles: 0,
    });
    assert.deepEqual(runUnifiedRebaseline(fixture.root, changesetConfig, 'write'), {
      packageCount: 38,
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
