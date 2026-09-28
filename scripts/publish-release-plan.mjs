#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { discoverPublishablePackages } from './lib/publishable-packages.mjs';
import { registryVersionPolicyConstants } from './lib/registry-version-policy.mjs';
import { readPendingChangesets, readPreState } from './lib/fixed-group-version.mjs';
import {
  assertNoPendingPreChangesets,
  buildNpmPublishArgs,
  publicationPlanConstants,
  selectPublicationDistTag,
  validatePublicationRoster,
  validatePreflightDistTags,
  verifyPostPublishDistTags,
} from './lib/publication-dist-tag.mjs';

const repoRoot = process.cwd();
// The unified candidate version is bound once, in the registry version policy,
// so the publication plan and the monotonicity check cannot disagree.
const version = registryVersionPolicyConstants.candidate;
const registry = 'https://npm.pkg.github.com';
const artifactRoot = resolve(repoRoot, '.artifacts/publication');
const tarballRoot = resolve(artifactRoot, 'tarballs');
const receiptRoot = resolve(artifactRoot, 'publication-receipts');
const candidateSha = git(['rev-parse', 'HEAD']);
const candidateTree = git(['rev-parse', 'HEAD^{tree}']);
const workflowRun = process.env.GITHUB_RUN_ID ?? null;
const packages = discoverPublishablePackages(repoRoot);
validatePublicationRoster(packages, version);
const preState = readPreState(repoRoot);
const distTag = selectPublicationDistTag({ version, preState });
assertNoPendingPreChangesets({
  preState,
  changesetIds: readPendingChangesets(repoRoot).map(({ file }) => file.slice('.changeset/'.length, -'.md'.length)),
});

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

// Observe the complete registry state for every package before the first publish.
const preflightDistTags = new Map();
for (const entry of packages) {
  const observed = registryMetadata(entry.name);
  if (observed.kind === 'unknown') {
    fail('PUBLICATION_PREFLIGHT_UNKNOWN', `${entry.name}: registry state is unknown`);
  }
  if (observed.kind === 'published') {
    fail('PUBLICATION_CANDIDATE_COLLISION', `${entry.name}@${version} already exists`);
  }
  const tags = registryDistTags(entry.name);
  if (tags.kind !== 'known') {
    fail('PUBLICATION_DIST_TAG_UNKNOWN', `${entry.name}: registry dist-tags are unreadable`);
  }
  preflightDistTags.set(entry.name, validatePreflightDistTags({
    preflightLatest: registryVersionPolicyConstants.preflightLatestVersion,
    preflightRc: registryVersionPolicyConstants.previousCandidate,
    distTags: tags.value,
  }));
}

const planEntries = [];
for (const entry of packages) {
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
    dist_tag: distTag,
    preflight_dist_tags: preflightDistTags.get(entry.name),
  });
}

const plan = {
  schemaVersion: '1.0.0',
  kind: 'publication-plan',
  candidate_sha: candidateSha,
  candidate_tree: candidateTree,
  package_count: planEntries.length,
  version,
  dist_tag: distTag,
  registry,
  'stop-on-first-failure': true,
  partial_publication_recovery: 'new-exact-owner-authorization-required',
  packages: planEntries,
};
writeJson(resolve(artifactRoot, 'publication-plan.json'), plan);

for (const entry of planEntries) {
  const attemptedAt = new Date().toISOString();
  const tarball = resolve(tarballRoot, entry.tarball);
  const result = spawnSync(
    'npm',
    buildNpmPublishArgs({ tarball, registry, tag: distTag, version }),
    { cwd: repoRoot, env: publishEnvironment(), encoding: 'utf8', stdio: 'inherit' },
  );
  const visibility = observePublishedCandidate(entry);
  const observed = visibility.metadata;
  const artifactMatches = observed.kind === 'published' &&
    observed.integrity === entry.integrity && observed.shasum === entry.shasum;
  const stopCode = visibility.error?.code ??
    (observed.kind === 'published' && !artifactMatches ? 'PUBLICATION_INTEGRITY_MISMATCH' :
      !artifactMatches ? 'PUBLICATION_VISIBILITY_UNKNOWN' :
        result.status !== 0 ? 'PUBLICATION_COMMAND_AMBIGUOUS' : null);
  const receipt = {
    schemaVersion: '1.0.0',
    kind: 'publication-receipt',
    package: entry.package,
    version,
    dist_tag: distTag,
    preflight_dist_tags: entry.preflight_dist_tags,
    visibility_observations: visibility.observations,
    reread_count: visibility.observations.length - 1,
    command_status: result.status,
    stop_code: stopCode,
    outcome:
      result.status === 0 && stopCode === null
        ? 'verified-published'
        : result.status !== 0 && visibility.error === null && artifactMatches
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
    stopCode === null;
  if (!verified) {
    fail(
      stopCode ?? 'PUBLICATION_STOP_FIRST',
      `${entry.package}: stopped on first failure or ambiguous outcome; partial recovery requires a new Owner authorization${visibility.error ? ` (${visibility.error.message})` : ''}`,
    );
  }
  // changesets/action reads each "New tag:" line, pushes that tag ref, and
  // creates the matching GitHub Release, so the tag must already exist here.
  const tag = `${entry.package}@${version}`;
  git(['tag', tag, candidateSha]);
  process.stdout.write(`New tag: ${tag}\n`);
}

process.stdout.write(`Published and verified ordered ${planEntries.length}-package plan.\n`);

function observePublishedCandidate(entry) {
  const observations = [];
  for (let reread = 0; reread <= publicationPlanConstants.maxVisibilityRereads; reread += 1) {
    if (reread > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, publicationPlanConstants.visibilityRereadDelayMs);
    const metadata = registryMetadata(entry.package);
    const tags = registryDistTags(entry.package);
    observations.push({
      reread,
      metadata_kind: metadata.kind,
      dist_tags: tags.kind === 'known' ? tags.value : null,
    });
    if (metadata.kind === 'unknown' || tags.kind !== 'known') {
      return { metadata, observations, error: { code: 'PUBLICATION_DIST_TAG_UNKNOWN', message: 'registry metadata is unreadable after publish' } };
    }
    let tagError = null;
    try {
      verifyPostPublishDistTags({
        candidate: version,
        preflightLatest: registryVersionPolicyConstants.preflightLatestVersion,
        preflightDistTags: entry.preflight_dist_tags,
        distTags: tags.value,
      });
    } catch (error) {
      if (error?.code === 'PUBLICATION_DIST_TAG_DRIFT') {
        return { metadata, observations, error };
      }
      if (error?.code !== 'PUBLICATION_DIST_TAG_UNKNOWN') throw error;
      tagError = error;
    }
    if (metadata.kind === 'published' && tagError === null) {
      return { metadata, observations, error: null };
    }
    if (reread === publicationPlanConstants.maxVisibilityRereads) {
      return {
        metadata,
        observations,
        error: tagError ?? { code: 'PUBLICATION_DIST_TAG_UNKNOWN', message: 'candidate version did not become visible' },
      };
    }
  }
}

function registryDistTags(packageName) {
  const result = spawnSync(
    'npm',
    ['view', packageName, 'dist-tags', '--json', '--registry', registry],
    { cwd: repoRoot, env: publishEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (result.status !== 0) return { kind: 'unknown' };
  try {
    return { kind: 'known', value: JSON.parse(result.stdout) };
  } catch {
    return { kind: 'unknown' };
  }
}

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
