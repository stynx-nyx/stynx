#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize } from './lib/mutation-roster.mjs';

const repoRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const command = process.argv[2];
const localRcTaskTimeoutMs = 6 * 60 * 60 * 1000;

function fail(message) {
  process.stderr.write(`${JSON.stringify({ ok: false, code: 'STYNX_LOCAL_RC', message })}\n`);
  process.exit(2);
}

function argumentsAfterCommand() {
  const values = {};
  const argv = process.argv.slice(3);
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith('--') || value === undefined || values[token.slice(2)] !== undefined) {
      fail('arguments must be unique --name value pairs');
    }
    values[token.slice(2)] = value;
  }
  return values;
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.inherit ? 'inherit' : 'pipe',
    shell: false,
    env: options.env ?? process.env,
  });
  if (result.error !== undefined || result.status !== 0 || result.signal !== null) {
    const stderr = String(result.stderr ?? '').trim();
    const stdout = String(result.stdout ?? '').trim();
    const detail = (result.error?.message ?? result.signal ?? stderr) || stdout.slice(-8192);
    fail(`${executable} failed: ${detail}`);
  }
  return String(result.stdout ?? '').trim();
}

function git(args) {
  return run('git', ['-C', repoRoot, ...args]);
}

function externalPath(value, label, { mustExist = true } = {}) {
  if (typeof value !== 'string' || value === '' || !isAbsolute(value)) {
    fail(`${label} must be an absolute path outside STYNX`);
  }
  const path = mustExist ? realpathSync(value) : resolve(value);
  const escaped = relative(repoRoot, path);
  if (escaped === '' || (!escaped.startsWith('..') && !isAbsolute(escaped))) {
    fail(`${label} must be outside STYNX`);
  }
  return path;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value === '') fail(`${name} is required`);
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function json(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function exactMap(actual, expected, label) {
  if (canonicalize(actual) !== canonicalize(expected)) {
    fail(`${label} does not match the approved local environment`);
  }
}

function verifierRoot() {
  const root = externalPath(requiredEnvironment('DEVAI_VERIFIER_ROOT'), 'DEVAI_VERIFIER_ROOT');
  const expectedCommit = requiredEnvironment('DEVAI_VERIFIER_COMMIT');
  const actualCommit = run('git', ['-C', root, 'rev-parse', 'HEAD']);
  if (actualCommit !== expectedCommit || !/^[0-9a-f]{40}$/u.test(actualCommit)) {
    fail('DEVAI verifier is not at the approved immutable commit');
  }
  if (run('git', ['-C', root, 'status', '--porcelain']) !== '') {
    fail('DEVAI verifier checkout must be clean');
  }
  return root;
}

function selectedRcTasks(descriptor) {
  const byId = new Map(descriptor.tasks.map((task) => [task.nodeId, task]));
  const profile = descriptor.profiles.find((entry) => entry.profileId === 'rc');
  if (!profile) fail('test-tasks.json has no RC profile');
  const selected = new Set();
  const queue = [...profile.requiredNodes];
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    if (selected.has(nodeId)) continue;
    const task = byId.get(nodeId);
    if (!task) fail(`RC profile names unknown task ${nodeId}`);
    selected.add(nodeId);
    queue.push(...task.dependencies);
  }
  return descriptor.tasks.filter((task) => selected.has(task.nodeId));
}

function actualToolchain(tasks) {
  const keys = new Set(tasks.flatMap((task) => task.toolchainKeys));
  const values = {};
  if (keys.has('node')) values.node = process.version;
  if (keys.has('pnpm')) values.pnpm = run('pnpm', ['--version']);
  if (keys.has('postgres')) values.postgres = run('psql', ['--version']);
  for (const packageName of ['vitest', 'typescript']) {
    if (!keys.has(packageName)) continue;
    const manifest = json(join(repoRoot, 'node_modules', packageName, 'package.json'), packageName);
    values[packageName] = `${packageName}@${manifest.version}`;
  }
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function actualEnvironment(tasks) {
  const keys = [...new Set(tasks.flatMap((task) => task.allowlistedEnv))].sort();
  return Object.fromEntries(
    keys.map((key) => {
      let value = process.env[key];
      if (key === 'DEVAI_AUTHORITY_POLICY_SHA256') {
        value = sha256(readFileSync(join(repoRoot, '.devai/config/authority-policy.json')));
      }
      return [key, value === undefined ? null : `sha256:${sha256(value)}`];
    }),
  );
}

function prepare(values) {
  const candidate = values.candidate;
  if (!/^[0-9a-f]{40}$/u.test(candidate ?? '')) fail('--candidate must be one full SHA');
  if (git(['rev-parse', 'HEAD']) !== candidate) fail('candidate must equal clean HEAD');
  if (git(['status', '--porcelain']) !== '') fail('candidate worktree must be clean');
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  if (!/^v24\./u.test(process.version)) fail('Node 24 is required');
  if (!/^9\./u.test(run('pnpm', ['--version']))) fail('pnpm 9 is required');

  const devaiManifest = json(
    join(repoRoot, 'node_modules', '@aarusso-nyx', 'devai', 'package.json'),
    'installed DEVAI manifest',
  );
  if (!/^1\.2\.0(?:-rc\.\d+)?$/u.test(devaiManifest.version ?? '')) {
    fail('installed DEVAI must be 1.2.0 or a 1.2.0 RC');
  }

  const descriptor = json(join(repoRoot, 'test-tasks.json'), 'task descriptor');
  const tasks = selectedRcTasks(descriptor);
  const toolchainPath = externalPath(
    requiredEnvironment('DEVAI_RC_TOOLCHAIN'),
    'DEVAI_RC_TOOLCHAIN',
  );
  const environmentPath = externalPath(
    requiredEnvironment('DEVAI_RC_ENVIRONMENT'),
    'DEVAI_RC_ENVIRONMENT',
  );
  exactMap(json(toolchainPath, 'toolchain control'), actualToolchain(tasks), 'toolchain control');
  exactMap(
    json(environmentPath, 'environment control'),
    actualEnvironment(tasks),
    'environment control',
  );

  run('pnpm', ['--filter', '@stynx-nyx/reference-web', 'exec', 'playwright', '--version']);
  run('pg_isready', [
    '-h',
    requiredEnvironment('STYNX_TEST_PG_HOST'),
    '-p',
    requiredEnvironment('STYNX_TEST_PG_PORT'),
    '-U',
    requiredEnvironment('STYNX_TEST_PG_USER'),
    '-d',
    requiredEnvironment('STYNX_TEST_PG_TEMPLATE'),
  ]);

  const verifier = verifierRoot();
  const devai = join(repoRoot, 'node_modules', '.bin', 'devai');
  if (!existsSync(devai)) fail('repository-local DEVAI binary is missing');
  const checkOutput = run(devai, [
    'check',
    '--rc',
    '--run',
    '--task-timeout-ms',
    String(localRcTaskTimeoutMs),
    '--repo-root',
    repoRoot,
    '--as-role',
    'inspector',
    '--write',
    '--format',
    'json',
  ]);
  const check = JSON.parse(checkOutput);
  if (!check.receipt?.path || !check.receipt?.digest) fail('DEVAI RC run produced no receipt');

  const privateKey = externalPath(
    requiredEnvironment('DEVAI_RC_PRIVATE_KEY'),
    'DEVAI_RC_PRIVATE_KEY',
  );
  const publicKey = externalPath(requiredEnvironment('DEVAI_RC_PUBLIC_KEY'), 'DEVAI_RC_PUBLIC_KEY');
  const outputRoot = externalPath(
    requiredEnvironment('DEVAI_RC_EVIDENCE_DIR'),
    'DEVAI_RC_EVIDENCE_DIR',
  );
  const outputDirectory = join(outputRoot, candidate, check.receipt.digest);
  const exportOutput = run(process.execPath, [
    join(verifier, 'src/export-cli.js'),
    '--repo',
    repoRoot,
    '--receipt',
    resolve(repoRoot, check.receipt.path),
    '--results-dir',
    join(repoRoot, '.devai/state/check-cache/v1/results'),
    '--profile',
    'rc',
    '--commit',
    candidate,
    '--tree',
    tree,
    '--toolchain',
    toolchainPath,
    '--environment',
    environmentPath,
    '--private-key',
    privateKey,
    '--public-key',
    publicKey,
    '--signer-id',
    'stynx-inspector-workstation-01',
    '--output-dir',
    outputDirectory,
  ]);
  const exported = JSON.parse(exportOutput);
  const mutationSummary = json(
    join(
      outputDirectory,
      'artifacts',
      '.devai/state/check-cache/v1/artifacts/mutation/summary.json',
    ),
    'mutation summary',
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      candidate,
      tree,
      receipt: check.receipt.digest,
      taskPolicyDigest: exported.taskPolicyDigest,
      mutationPackageCount: mutationSummary.aggregate.packageCount,
      mutationScore: mutationSummary.aggregate.score,
      mutationDurationMs: mutationSummary.aggregate.durationMs,
      bundle: outputDirectory,
      manifest: join(outputDirectory, 'manifest.json'),
    })}\n`,
  );
}

function publish(values) {
  const manifestPath = externalPath(values.manifest, '--manifest');
  if (manifestPath.split('/').at(-1) !== 'manifest.json')
    fail('--manifest must name manifest.json');
  const bundle = dirname(manifestPath);
  const trustStore = externalPath(
    requiredEnvironment('DEVAI_RC_TRUST_STORE'),
    'DEVAI_RC_TRUST_STORE',
  );
  const verifier = verifierRoot();
  const output = run(process.execPath, [
    join(verifier, 'src/publish-cli.js'),
    '--repo',
    repoRoot,
    '--bundle',
    bundle,
    '--trust',
    trustStore,
    '--tag-prefix',
    'devai-local-evidence/',
    '--workflow',
    'devai-local-rc-verify.yml',
    '--default-branch',
    'main',
  ]);
  process.stdout.write(`${output}\n`);
}

try {
  const values = argumentsAfterCommand();
  if (command === 'prepare') prepare(values);
  else if (command === 'publish') publish(values);
  else fail('expected prepare or publish');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
