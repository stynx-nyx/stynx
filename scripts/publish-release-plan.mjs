#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { discoverPublishablePackages } from './lib/publishable-packages.mjs';
import { loadRegistryAnomalyPolicy, publishTagForPackage } from './lib/registry-version-policy.mjs';

const repoRoot = process.cwd();
const rootManifest = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const version = rootManifest.version;
const registry = 'https://npm.pkg.github.com';
const artifactRoot = resolve(repoRoot, '.artifacts/publication');
const tarballRoot = resolve(artifactRoot, 'tarballs');
const receiptRoot = resolve(artifactRoot, 'publication-receipts');
const candidateSha = git(['rev-parse', 'HEAD']);
const candidateTree = git(['rev-parse', 'HEAD^{tree}']);
const workflowRun = process.env.GITHUB_RUN_ID ?? null;
const packages = discoverPublishablePackages(repoRoot);
const anomaly = loadRegistryAnomalyPolicy(repoRoot, version);

if (packages.length !== 44)
  fail('PUBLICATION_ROSTER_DRIFT', `expected 44 packages, found ${packages.length}`);
if (!/^[0-9a-f]{40}$/u.test(candidateSha) || !/^[0-9a-f]{40}$/u.test(candidateTree)) {
  fail(
    'PUBLICATION_CANDIDATE_INVALID',
    'candidate_sha and candidate_tree must be exact Git identities',
  );
}
if (git(['status', '--porcelain']) !== '')
  fail('PUBLICATION_TREE_DIRTY', 'candidate tree is not clean');
mkdirSync(tarballRoot, { recursive: true });
mkdirSync(receiptRoot, { recursive: true });

const planEntries = [];
for (const entry of packages) {
  if (entry.manifest.version !== version) {
    fail('PUBLICATION_VERSION_DRIFT', `${entry.name}: expected exact ${version}`);
  }
  const packed = runJson('corepack', [
    'pnpm',
    '--dir',
    entry.dir,
    'pack',
    '--pack-destination',
    tarballRoot,
    '--json',
  ]);
  const filename = Array.isArray(packed) ? packed[0]?.filename : packed?.filename;
  if (!filename) fail('PUBLICATION_PACK_FAILED', `${entry.name}: pack emitted no filename`);
  const tarball = resolve(entry.dir, filename);
  const bytes = readFileSync(tarball);
  planEntries.push({
    order: planEntries.length + 1,
    package: entry.name,
    version,
    tarball: basename(tarball),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    shasum: createHash('sha1').update(bytes).digest('hex'),
  });
}

const plan = {
  schemaVersion: '1.0.0',
  kind: 'publication-plan',
  candidate_sha: candidateSha,
  candidate_tree: candidateTree,
  package_count: planEntries.length,
  version,
  registry,
  'stop-on-first-failure': true,
  partial_publication_recovery: 'new-exact-owner-authorization-required',
  packages: planEntries,
};

for (const entry of planEntries) {
  const observed = registryMetadata(entry.package);
  if (observed.kind === 'unknown') {
    fail('PUBLICATION_PREFLIGHT_UNKNOWN', `${entry.package}: registry state is unknown`);
  }
  if (observed.kind === 'published') {
    fail('PUBLICATION_CANDIDATE_COLLISION', `${entry.package}@${version} already exists`);
  }
  entry.tag = publishTagForPackage({
    packageName: entry.package,
    candidate: version,
    observedVersions: entry.package === anomaly.package ? registryVersions(entry.package) : [],
    anomaly,
  });
}
writeJson(resolve(artifactRoot, 'publication-plan.json'), plan);

for (const entry of planEntries) {
  const attemptedAt = new Date().toISOString();
  const tarball = resolve(tarballRoot, entry.tarball);
  const publishArguments = ['publish', tarball, '--registry', registry, '--access', 'restricted'];
  if (entry.tag !== null) publishArguments.push('--tag', entry.tag);
  const result = spawnSync('npm', publishArguments, {
    cwd: repoRoot,
    env: publishEnvironment(),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  const observed = registryMetadata(entry.package);
  const receipt = {
    schemaVersion: '1.0.0',
    kind: 'publication-receipt',
    package: entry.package,
    version,
    publish_tag: entry.tag,
    outcome:
      result.status === 0 && observed.kind === 'published'
        ? 'verified-published'
        : observed.kind === 'published'
          ? 'ambiguous-command-verified-published'
          : 'failed-or-unknown',
    expected_integrity: entry.integrity,
    expected_shasum: entry.shasum,
    integrity: observed.integrity ?? null,
    shasum: observed.shasum ?? null,
    timestamp: attemptedAt,
    workflow_run: workflowRun,
    candidate_sha: candidateSha,
    candidate_tree: candidateTree,
  };
  writeJson(resolve(receiptRoot, `${String(entry.order).padStart(2, '0')}.json`), receipt);
  const verified =
    result.status === 0 &&
    observed.kind === 'published' &&
    observed.integrity === entry.integrity &&
    observed.shasum === entry.shasum;
  if (!verified) {
    fail(
      'PUBLICATION_STOP_FIRST',
      `${entry.package}: stopped on first failure or ambiguous outcome; partial recovery requires a new Owner authorization`,
    );
  }
}

function registryVersions(packageName) {
  const result = spawnSync(
    'npm',
    ['view', packageName, 'versions', '--json', '--registry', registry],
    {
      cwd: repoRoot,
      env: publishEnvironment(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.status !== 0) {
    fail('PUBLICATION_PREFLIGHT_UNKNOWN', `${packageName}: registry history is unknown`);
  }
  try {
    const versions = JSON.parse(result.stdout);
    return Array.isArray(versions) ? versions : [versions];
  } catch {
    fail('PUBLICATION_PREFLIGHT_UNKNOWN', `${packageName}: registry history is malformed`);
  }
}

process.stdout.write(`Published and verified ordered ${planEntries.length}-package plan.\n`);

function registryMetadata(packageName) {
  const result = spawnSync(
    'npm',
    [
      'view',
      `${packageName}@${version}`,
      'version',
      'dist.integrity',
      'dist.shasum',
      '--json',
      '--registry',
      registry,
    ],
    {
      cwd: repoRoot,
      env: publishEnvironment(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.status !== 0) {
    if (/E404|404 Not Found/u.test(`${result.stdout}\n${result.stderr}`)) return { kind: 'absent' };
    return { kind: 'unknown' };
  }
  try {
    const metadata = JSON.parse(result.stdout);
    if (metadata.version !== version) return { kind: 'unknown' };
    return {
      kind: 'published',
      integrity: metadata['dist.integrity'],
      shasum: metadata['dist.shasum'],
    };
  } catch {
    return { kind: 'unknown' };
  }
}

function publishEnvironment() {
  return {
    ...process.env,
    NPM_CONFIG_PROVENANCE: 'false',
    NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN,
  };
}

function git(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) fail('PUBLICATION_GIT_FAILED', `git ${args[0]} failed`);
  return result.stdout.trim();
}

function runJson(executable, args) {
  const result = spawnSync(executable, args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) fail('PUBLICATION_COMMAND_FAILED', `${executable} ${args[0]} failed`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail('PUBLICATION_COMMAND_MALFORMED', `${executable} ${args[0]} emitted malformed JSON`);
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fail(code, message) {
  process.stderr.write(`${code}: ${message}\n`);
  process.exit(1);
}
