import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const campaign = JSON.parse(
  readFileSync(join(repoRoot, 'law', 'policy', 'release-campaign-1.1.1.json'), 'utf8'),
);
const workflow = readFileSync(
  join(repoRoot, '.github', 'workflows', 'devai-local-rc-verify.yml'),
  'utf8',
);
const localRcWrapper = readFileSync(join(repoRoot, 'scripts', 'devai-local-rc.mjs'), 'utf8');
const contract = campaign.devai.verifier_materialization;
const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const lockfile = readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
const projectBinding = JSON.parse(
  readFileSync(join(repoRoot, '.devai', 'config', 'project.json'), 'utf8'),
);
const installedDevaiRoot = join(repoRoot, 'node_modules', '@aarusso-nyx', 'devai');
const installedManifest = JSON.parse(
  readFileSync(join(installedDevaiRoot, 'package.json'), 'utf8'),
);
const installedVerifierPolicy = readFileSync(
  join(installedDevaiRoot, 'dist', 'law', 'policy', 'trusted-local-rc-verifier-package.json'),
);

const provider = {
  package: '@aarusso-nyx/devai',
  version: '1.4.5',
  tarball:
    'https://npm.pkg.github.com/download/@aarusso-nyx/devai/1.4.5/1d5aa3fc8748a3ac7c2150750f60803c0b357b86',
  shasum: '1d5aa3fc8748a3ac7c2150750f60803c0b357b86',
  sha256: 'f5fa97bb2c0d7b81487de6c13eac1d78bcb1fdaa8021a051d0c4c9f7e7371d26',
  integrity:
    'sha512-5XuNGqbiqRGx+3MJOlO9VdJoKwX5MZ9a1BxdX/APUeD/j48CgtLwf5hNyxDkujxexekNn5TGSLUmU7aki2LTeQ==',
  sourceCommit: '5461ba55d8fba23d8e0a310480eb62d1e3c6c52c',
  sourceTree: 'b339fa7fb13b0792ac929b5f3f57f4b84366b649',
  signedTagObject: '11eaeaf34b4aad76565ae1adc0fb1abf0ad37ae9',
};

const verifier = {
  package: '@aarusso-nyx/devai',
  version: '1.4.4',
  tarball:
    'https://npm.pkg.github.com/download/@aarusso-nyx/devai/1.4.4/fcdf9a21f92094fce10d4cee42440abf44200467',
  shasum: 'fcdf9a21f92094fce10d4cee42440abf44200467',
  integrity:
    'sha512-B1AJzDAZNw+UM1m7bQjwHT9q0gO3cutNpGPRAXFEBtq3L6AZymI6RvLc4ghh05ssOoREynXKuJyjsayRJbWPEQ==',
  sourceCommit: '3aec624d0c0aecc534e60ee45306a4e5e6a7e94d',
  sourceTree: '2cad519aba8117a1850eee85d41eae452d51a141',
  provenance: '8ebafff53524031a3207a2256ebcd0fa6e0cc4271fd4bb6bca5aa003395034bd',
  embeddedSourceCommit: '37e75a5c27569d4cb3fdb4a3dc97a140da4d78de',
  policyDigest: '8d16a2dc7754920f0b27e2d37eb5ce3464d5a62df7db720a45c3a03c2ee1cba1',
  workflowDigest: '615cb94cf9b6ab79883c9b0a409fdefac296197779777bb8834e7dca6c43455d',
};

const evidenceBins = {
  'devai-evidence-policy': './dist/runtime/evidence-verification/src/build-policy-cli.js',
  'devai-evidence-verify': './dist/runtime/evidence-verification/src/cli.js',
  'devai-evidence-bundle-verify': './dist/runtime/evidence-verification/src/bundle-cli.js',
  'devai-evidence-export': './dist/runtime/evidence-verification/src/export-cli.js',
  'devai-evidence-publish': './dist/runtime/evidence-verification/src/publish-cli.js',
};

function materializationStep() {
  const start = workflow.indexOf('      - name: Materialize protected DEVAI verifier package');
  assert.notEqual(start, -1, 'materialization step must exist');
  const end = workflow.indexOf('\n      - name:', start + 1);
  assert.notEqual(end, -1, 'materialization step must have a bounded body');
  return workflow.slice(start, end);
}

function assertContainsAll(source, expected, label) {
  for (const value of expected) {
    assert.ok(source.includes(String(value)), `${label} must bind ${String(value)}`);
  }
}

function localRcProviderGuard() {
  const condition = localRcWrapper.match(/devaiManifest\.version\s*!==\s*'([^']+)'/u);
  const failure = localRcWrapper.match(/installed DEVAI must be exact ([^']+)'/u);
  assert.ok(condition, 'local RC prepare must have an exact installed-provider condition');
  assert.ok(failure, 'local RC prepare must name the exact installed provider in its failure');
  return { conditionVersion: condition[1], failureVersion: failure[1] };
}

test('campaign binds the exact provider and independent verifier materialization contract', () => {
  assert.deepEqual(
    {
      package: campaign.devai.package,
      version: campaign.devai.version,
      tarball: campaign.devai.tarball,
      shasum: campaign.devai.shasum,
      sha256: campaign.devai.sha256,
      integrity: campaign.devai.integrity,
      sourceCommit: campaign.devai.source_commit,
      sourceTree: campaign.devai.source_tree,
      signedTagObject: campaign.devai.signed_tag_object,
    },
    provider,
  );
  assert.equal(contract.provider_version, provider.version);
  assert.equal(contract.canonical_policy_sha256, verifier.policyDigest);
  assert.equal(contract.package.version, verifier.version);
  assert.notEqual(contract.provider_version, contract.package.version);
  assert.equal(contract.verifier.provenance_sha256, verifier.provenance);
  assert.equal(contract.verifier.source_commit, verifier.embeddedSourceCommit);
  assert.equal(contract.verifier.payload_file_count, 21);
  assert.deepEqual(contract.verifier.binaries, evidenceBins);
  assert.deepEqual(contract.adopter_fallbacks, []);
});

test('generated workflow requires the dedicated package token without a GitHub token fallback', () => {
  const step = materializationStep();
  const permissions = workflow.slice(
    workflow.indexOf('permissions:'),
    workflow.indexOf('\nenv:', workflow.indexOf('permissions:')),
  );
  assert.match(permissions, /^\s{2}contents: read$/mu);
  assert.match(permissions, /^\s{2}packages: read$/mu);
  assert.match(permissions, /^\s{2}checks: write$/mu);
  assert.ok(step.includes('NODE_AUTH_TOKEN: ${{ secrets.PACKAGES_READ_TOKEN }}'));
  assert.match(step, /set\s+-euo\s+pipefail/u);
  assert.match(step, /test\s+-n\s+["']?\$(?:\{NODE_AUTH_TOKEN(?::-)?\}|NODE_AUTH_TOKEN)["']?/u);
  assert.doesNotMatch(step, /github\.token|GITHUB_TOKEN/u);
  assert.doesNotMatch(step, /NODE_AUTH_TOKEN[^\n]*\|\|/u);
  assert.doesNotMatch(workflow, /PACKAGES_READ_TOKEN[^\n]*github\.token/u);
});

test('generated workflow keeps provider 1.4.5 distinct from verifier package 1.4.4', () => {
  const step = materializationStep();
  assert.equal(rootManifest.devDependencies[provider.package], provider.version);
  assert.equal(projectBinding.devai_version, provider.version);
  assert.equal(installedManifest.name, provider.package);
  assert.equal(installedManifest.version, provider.version);
  assertContainsAll(
    lockfile,
    [provider.version, provider.tarball, provider.integrity],
    'provider package lock',
  );
  assertContainsAll(
    step,
    [
      verifier.version,
      verifier.tarball,
      verifier.shasum,
      verifier.integrity,
      verifier.sourceCommit,
      verifier.sourceTree,
    ],
    'independent verifier distribution',
  );
  assert.doesNotMatch(step, /1\.4\.5|1d5aa3fc8748a3ac7c2150750f60803c0b357b86/u);
});

test('local RC prepare accepts only provider 1.4.5 without conflating verifier 1.4.4', () => {
  const guard = localRcProviderGuard();
  const candidateVersions = [
    provider.version,
    verifier.version,
    '1.4.3',
    '1.4.6',
    'latest',
    '^1.4.5',
  ];
  const acceptedVersions = candidateVersions.filter(
    (candidateVersion) => candidateVersion === guard.conditionVersion,
  );

  assert.equal(contract.provider_version, provider.version);
  assert.equal(contract.package.version, verifier.version);
  assert.notEqual(contract.provider_version, contract.package.version);
  assert.deepEqual(
    { ...guard, acceptedVersions },
    {
      conditionVersion: provider.version,
      failureVersion: provider.version,
      acceptedVersions: [provider.version],
    },
  );
});

test('generated workflow rejects mutable package selectors and unpinned distribution sources', () => {
  const step = materializationStep();
  assert.doesNotMatch(step, /@latest|\^1\.|~1\.|\b1\.2\.x\b|dist-tags|npm\s+view/u);
  assert.ok(step.includes(verifier.tarball));
  assert.equal(rootManifest.devDependencies[provider.package], provider.version);
  assert.match(lockfile, /specifier:\s+1\.4\.5/u);
  assert.ok(lockfile.includes(provider.tarball));
  assert.match(step, /https:\/\/npm\.pkg\.github\.com/u);
  assert.doesNotMatch(step, /https:\/\/github\.com\/.+\/archive\//u);
});

test('generated workflow never falls back to candidate packages or the STYNX CLI', () => {
  const step = materializationStep();
  assert.doesNotMatch(step, /candidate\/packages\/cli|@stynx-nyx\/cli|\bstynx\b/u);
  assert.ok(step.includes('dist/runtime/evidence-verification'));
  assert.deepEqual(contract.adopter_fallbacks, []);
});

test('generated workflow validates archives before extraction and rejects unsafe entry types', () => {
  const step = materializationStep();
  const extractionIndex = step.search(/\btar\s+[^\n]*(?:-x|--extract)|\bnpm\s+unpack\b/u);
  assert.notEqual(
    extractionIndex,
    -1,
    'workflow must have one explicit archive extraction boundary',
  );
  const validationPrefix = step.slice(0, extractionIndex);
  assertContainsAll(
    validationPrefix,
    [
      'DEVAI_VERIFIER_ARCHIVE_ABSOLUTE_PATH_INVALID',
      'DEVAI_VERIFIER_ARCHIVE_PATH_TRAVERSAL_INVALID',
      'DEVAI_VERIFIER_ARCHIVE_SYMLINK_INVALID',
      'DEVAI_VERIFIER_ARCHIVE_HARDLINK_INVALID',
      'DEVAI_VERIFIER_ARCHIVE_SPECIAL_FILE_INVALID',
    ],
    'pre-extraction archive validation',
  );
});

test('generated workflow cannot execute lifecycle scripts, candidate code, or product commands', () => {
  const step = materializationStep();
  const installs = step
    .split('\n')
    .filter((entry) => /(?:pnpm|npm|yarn)\s+(?:install|ci)/u.test(entry));
  for (const line of installs) assert.match(line, /--ignore-scripts/u);
  assert.doesNotMatch(step, /(?:pnpm|npm|yarn)\s+run|node\s+candidate/u);
  assert.doesNotMatch(step, /candidate\/(?:packages|packages-web|reference|product|scripts)\//u);
  assert.ok(contract.materialization.package_lifecycle_scripts === false);
  assert.ok(contract.materialization.candidate_product_execution === false);
});

test('generated workflow verifies exact provenance, population, file digests, and all evidence bins', () => {
  const step = materializationStep();
  assertContainsAll(
    step,
    [
      verifier.provenance,
      verifier.embeddedSourceCommit,
      'provenance.files.length !== 21',
      'DEVAI_VERIFIER_PACKAGE_POPULATION_INVALID',
      'DEVAI_VERIFIER_PACKAGE_FILE_DIGEST_INVALID',
      'DEVAI_VERIFIER_PACKAGE_PROVENANCE_INVALID',
      'DEVAI_VERIFIER_PACKAGE_BIN_INVALID',
      ...Object.keys(evidenceBins),
      ...Object.values(evidenceBins),
    ],
    'closed verifier population',
  );
  assert.doesNotMatch(step, /\['[0-9a-f]{40}',\s*'[0-9a-f]{40}'\]\.includes/u);
});

test('external provenance duplicate is required, matched, and never the sole trust root', () => {
  const step = materializationStep();
  const committedTrust = `test "$actual_provenance_sha256" = "${verifier.provenance}"`;
  const externalDuplicate = 'test "$actual_provenance_sha256" = "$VERIFIER_PROVENANCE_SHA256"';
  const committedTrustIndex = step.indexOf(committedTrust);
  const externalDuplicateIndex = step.indexOf(externalDuplicate);
  assert.notEqual(committedTrustIndex, -1);
  assert.notEqual(externalDuplicateIndex, -1);
  assert.ok(committedTrustIndex < externalDuplicateIndex);
  assert.ok(step.includes('DEVAI_LEDGER_VERIFIER_PROVENANCE_SHA256'));
  assert.equal(contract.external_duplicate.required, true);
  assert.equal(contract.external_duplicate.sole_trust_root, false);
});

test('installed provider policy and supported Doctor bind the exact generated workflow bytes', () => {
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(rootManifest.devDependencies[provider.package], provider.version);
  assert.ok(lockfile.includes(provider.tarball));
  assert.equal(installedManifest.version, provider.version);
  assert.equal(digest(installedVerifierPolicy), verifier.policyDigest);
  assert.equal(digest(workflow), verifier.workflowDigest);

  const doctor = spawnSync(
    process.execPath,
    [
      join(installedDevaiRoot, 'dist', 'runtime', 'index', 'bin.js'),
      'doctor',
      '--repo-root',
      repoRoot,
      '--format',
      'json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(doctor.status, 0, doctor.stderr);
  const result = JSON.parse(doctor.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.result.verdict, 'pass');
  const checks = result.result.value.checks;
  assert.deepEqual(checks.find(({ name }) => name === 'devai-version-match')?.info, {
    pinned: provider.version,
    running: provider.version,
    provenance: { source: 'npm-package' },
  });
  assert.equal(checks.find(({ name }) => name === 'trusted-local-rc-boundary')?.ok, true);
});
