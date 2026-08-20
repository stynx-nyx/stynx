#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const expectedRepository = 'stynx-nyx/stynx';
const command = process.argv[2];

if (command === '--help' || command === '-h' || command === undefined) {
  usage();
  process.exit(command === undefined ? 1 : 0);
}

try {
  if (command === 'prepare') {
    prepare();
  } else if (command === 'publish') {
    publish();
  } else {
    fail('DOCS_PUBLISH_COMMAND', 'command must be prepare or publish');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown failure';
  console.error(`[docs-publication] ${message}`);
  process.exit(1);
}

function prepare() {
  const candidate = requiredOption('--candidate');
  const output = resolve(requiredOption('--output'));
  requireExternalPath(output);
  if (existsSync(output)) fail('DOCS_BUNDLE_EXISTS', 'output path already exists');

  const identity = verifyExactMain(candidate);
  run('pnpm', ['--filter', '@stynx-nyx/docs-site', 'build'], repoRoot, true);

  const buildDir = resolve(repoRoot, 'docs/site/build');
  if (!existsSync(buildDir)) fail('DOCS_BUILD_MISSING', 'documentation build output is missing');

  mkdirSync(dirname(output), { recursive: true });
  const temporary = mkdtempSync(join(dirname(output), '.stynx-docs-prepare-'));
  try {
    const siteDir = join(temporary, 'site');
    cpSync(buildDir, siteDir, { recursive: true, errorOnExist: true });
    writeFileSync(join(siteDir, '.nojekyll'), '');
    const files = collectFiles(siteDir);
    const siteDigest = digestJson(files);
    const manifest = {
      schemaVersion: '1.0.0',
      repository: expectedRepository,
      sourceCommit: identity.commit,
      sourceTree: identity.tree,
      siteDigest,
      files,
    };
    writeFileSync(join(temporary, 'manifest.json'), canonicalJson(manifest));
    renameSync(temporary, output);
    console.log(`[docs-publication] prepared ${files.length} files at ${output}`);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function publish() {
  const manifestPath = resolve(requiredOption('--manifest'));
  const signingKey = resolve(requiredOption('--signing-key'));
  if (!hasFlag('--confirm-publish')) {
    fail('DOCS_PUBLISH_CONSENT', 'publish requires --confirm-publish');
  }
  if (process.env.STYNX_ENABLE_PAGES_DEPLOY !== 'true') {
    fail('DOCS_PUBLISH_OPT_IN', 'STYNX_ENABLE_PAGES_DEPLOY must equal true');
  }
  const signer = verifySigningKey(signingKey);

  const bundleDir = dirname(manifestPath);
  requireExternalPath(bundleDir);
  const manifest = readManifest(manifestPath);
  verifyExactMain(manifest.sourceCommit);
  const actualFiles = collectFiles(join(bundleDir, 'site'));
  if (canonicalJson(actualFiles) !== canonicalJson(manifest.files)) {
    fail('DOCS_BUNDLE_FILES', 'bundle file roster or digests do not match the manifest');
  }
  if (digestJson(actualFiles) !== manifest.siteDigest) {
    fail('DOCS_BUNDLE_DIGEST', 'bundle aggregate digest does not match the manifest');
  }
  const noJekyll = actualFiles.find((file) => file.path === '.nojekyll');
  if (noJekyll?.size !== 0 || noJekyll.sha256 !== sha256(Buffer.alloc(0))) {
    fail('DOCS_BUNDLE_NOJEKYLL', 'bundle must contain an empty .nojekyll file');
  }

  const remote = git(['config', '--get', 'remote.origin.url']).trim();
  if (!isExpectedRemote(remote) || /:\/\/[^/]*@/u.test(remote)) {
    fail('DOCS_REPOSITORY_BINDING', 'origin is not the credential-free STYNX repository');
  }

  const temporary = mkdtempSync(join(tmpdir(), 'stynx-pages-'));
  const checkout = join(temporary, 'gh-pages');
  try {
    run('git', ['clone', '--quiet', '--single-branch', '--branch', 'gh-pages', remote, checkout]);
    for (const entry of readdirSync(checkout)) {
      if (entry !== '.git') rmSync(join(checkout, entry), { recursive: true, force: true });
    }
    for (const entry of readdirSync(join(bundleDir, 'site'))) {
      cpSync(join(bundleDir, 'site', entry), join(checkout, entry), {
        recursive: true,
        errorOnExist: true,
      });
    }

    const manifestDigest = sha256(readFileSync(manifestPath));
    const branchReceipt = {
      schemaVersion: '1.0.0',
      repository: expectedRepository,
      sourceCommit: manifest.sourceCommit,
      sourceTree: manifest.sourceTree,
      siteDigest: manifest.siteDigest,
      manifestDigest,
      signerFingerprint: signer.fingerprint,
    };
    writeFileSync(join(checkout, '.stynx-publication.json'), canonicalJson(branchReceipt));
    git(['add', '--', '.'], checkout);

    const allowedSigners = join(temporary, 'allowed-signers');
    writeFileSync(allowedSigners, `stynx-pages ${signer.publicKey}\n`, { mode: 0o600 });

    let branchCommit;
    let shouldPush = false;
    if (gitStatus(['diff', '--cached', '--quiet'], checkout) === 0) {
      branchCommit = git(['rev-parse', 'HEAD'], checkout).trim();
    } else {
      git(
        [
          '-c',
          'gpg.format=ssh',
          '-c',
          `user.signingkey=${signingKey}`,
          'commit',
          '-S',
          '-m',
          `docs: publish from ${manifest.sourceCommit}`,
        ],
        checkout,
        true,
      );
      branchCommit = git(['rev-parse', 'HEAD'], checkout).trim();
      shouldPush = true;
    }
    git(
      ['-c', `gpg.ssh.allowedSignersFile=${allowedSigners}`, 'verify-commit', branchCommit],
      checkout,
      true,
    );
    if (shouldPush) git(['push', 'origin', 'HEAD:gh-pages'], checkout, true);

    const remoteCommit = git(['ls-remote', 'origin', 'refs/heads/gh-pages'], checkout)
      .trim()
      .split(/\s+/u)[0];
    if (remoteCommit !== branchCommit) {
      fail('DOCS_REMOTE_VERIFICATION', 'remote gh-pages does not match the publication commit');
    }

    writeFileSync(
      join(bundleDir, 'published.json'),
      canonicalJson({
        ...branchReceipt,
        branch: 'gh-pages',
        branchCommit,
        publishedAt: new Date().toISOString(),
      }),
    );
    console.log(`[docs-publication] published ${manifest.sourceCommit} as ${branchCommit}`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function verifyExactMain(candidate) {
  if (!/^[0-9a-f]{40}$/u.test(candidate)) {
    fail('DOCS_CANDIDATE_SHA', 'candidate must be a full lowercase Git commit SHA');
  }
  if (git(['branch', '--show-current']).trim() !== 'main') {
    fail('DOCS_CANDIDATE_BRANCH', 'publication preparation must run from main');
  }
  if (git(['status', '--porcelain', '--untracked-files=all']).trim() !== '') {
    fail('DOCS_CANDIDATE_DIRTY', 'tracked and untracked files must be clean');
  }
  git(['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main'], repoRoot, true);
  const commit = git(['rev-parse', 'HEAD']).trim();
  const remoteMain = git(['rev-parse', 'origin/main']).trim();
  if (commit !== candidate || remoteMain !== candidate) {
    fail('DOCS_CANDIDATE_MISMATCH', 'candidate, HEAD, and origin/main must be identical');
  }
  return { commit, tree: git(['rev-parse', 'HEAD^{tree}']).trim() };
}

function readManifest(path) {
  let raw;
  let manifest;
  try {
    raw = readFileSync(path, 'utf8');
    manifest = JSON.parse(raw);
  } catch {
    fail('DOCS_MANIFEST_JSON', 'manifest must be valid JSON');
  }
  const expectedKeys = [
    'files',
    'repository',
    'schemaVersion',
    'siteDigest',
    'sourceCommit',
    'sourceTree',
  ];
  if (
    manifest?.schemaVersion !== '1.0.0' ||
    manifest?.repository !== expectedRepository ||
    !/^[0-9a-f]{40}$/u.test(manifest?.sourceCommit ?? '') ||
    !/^[0-9a-f]{40}$/u.test(manifest?.sourceTree ?? '') ||
    !/^[0-9a-f]{64}$/u.test(manifest?.siteDigest ?? '') ||
    !Array.isArray(manifest?.files) ||
    canonicalJson(Object.keys(manifest).sort()) !== canonicalJson(expectedKeys)
  ) {
    fail('DOCS_MANIFEST_SCHEMA', 'manifest does not satisfy the publication contract');
  }
  for (const file of manifest.files) {
    if (
      file === null ||
      typeof file !== 'object' ||
      canonicalJson(Object.keys(file).sort()) !== canonicalJson(['path', 'sha256', 'size']) ||
      typeof file.path !== 'string' ||
      file.path.length === 0 ||
      file.path.startsWith('/') ||
      file.path.split('/').includes('..') ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !/^[0-9a-f]{64}$/u.test(file.sha256 ?? '')
    ) {
      fail('DOCS_MANIFEST_FILE', 'manifest contains an invalid file record');
    }
  }
  if (raw !== canonicalJson(manifest)) {
    fail('DOCS_MANIFEST_CANONICAL', 'manifest must use canonical JSON encoding');
  }
  return manifest;
}

function collectFiles(root) {
  if (!existsSync(root)) fail('DOCS_SITE_MISSING', 'bundle site directory is missing');
  const files = [];
  walk(root, '');
  return files.sort((left, right) => left.path.localeCompare(right.path, 'en'));

  function walk(directory, prefix) {
    for (const name of readdirSync(directory).sort((left, right) =>
      left.localeCompare(right, 'en'),
    )) {
      const absolute = join(directory, name);
      const portable = prefix.length === 0 ? name : `${prefix}/${name}`;
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) fail('DOCS_SITE_SYMLINK', 'site bundle must not contain symlinks');
      if (stat.isDirectory()) {
        walk(absolute, portable);
      } else if (stat.isFile()) {
        const bytes = readFileSync(absolute);
        files.push({ path: portable, size: bytes.length, sha256: sha256(bytes) });
      } else {
        fail('DOCS_SITE_FILE_TYPE', 'site bundle contains an unsupported file type');
      }
    }
  }
}

function requiredOption(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail('DOCS_PUBLISH_ARGUMENT', `${name} is required`);
  }
  return value;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function requireExternalPath(path) {
  const rel = relative(repoRoot, path);
  if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`))) {
    fail('DOCS_BUNDLE_LOCATION', 'publication bundles must be outside the repository');
  }
}

function isExpectedRemote(remote) {
  return /^(?:git@github\.com:|https:\/\/github\.com\/)stynx-nyx\/stynx(?:\.git)?$/u.test(remote);
}

function verifySigningKey(path) {
  requireExternalPath(path);
  if (!existsSync(path) || !lstatSync(path).isFile()) {
    fail('DOCS_SIGNING_KEY', 'signing key must be an external regular file');
  }
  if ((lstatSync(path).mode & 0o077) !== 0) {
    fail('DOCS_SIGNING_KEY_MODE', 'signing key must not be accessible by group or others');
  }
  const publicKeyPath = `${path}.pub`;
  if (!existsSync(publicKeyPath) || !lstatSync(publicKeyPath).isFile()) {
    fail('DOCS_SIGNING_PUBLIC_KEY', 'matching public key file is required');
  }
  const publicKey = readFileSync(publicKeyPath, 'utf8').trim();
  if (!/^ssh-(?:rsa|ed25519|ecdsa)[^\s]*\s+[A-Za-z0-9+/=]+(?:\s+.*)?$/u.test(publicKey)) {
    fail('DOCS_SIGNING_PUBLIC_KEY', 'matching public key is malformed');
  }
  const fingerprintOutput = run('ssh-keygen', ['-lf', publicKeyPath]).trim();
  const fingerprint = fingerprintOutput.match(/SHA256:[A-Za-z0-9+/]+/u)?.[0];
  if (fingerprint === undefined) {
    fail('DOCS_SIGNING_FINGERPRINT', 'could not determine the SSH signing fingerprint');
  }
  return { fingerprint, publicKey };
}

function git(args, cwd = repoRoot, inherit = false) {
  return run('git', args, cwd, inherit);
}

function gitStatus(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error) fail('DOCS_GIT_EXECUTION', 'git could not be executed');
  return result.status ?? 1;
}

function run(program, args, cwd = repoRoot, inherit = false) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: inherit ? undefined : 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  });
  if (result.error || result.status !== 0) {
    fail('DOCS_COMMAND_FAILED', `${program} command failed`);
  }
  return inherit ? '' : (result.stdout ?? '');
}

function digestJson(value) {
  return sha256(Buffer.from(canonicalJson(value), 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function fail(code, message) {
  throw new Error(`${code}: ${message}`);
}

function usage() {
  console.log(`Usage:
  node scripts/publish-docs-site.mjs prepare --candidate <full-sha> --output <external-dir>
  STYNX_ENABLE_PAGES_DEPLOY=true node scripts/publish-docs-site.mjs publish --manifest <external-manifest> --signing-key <external-private-key> --confirm-publish`);
}
