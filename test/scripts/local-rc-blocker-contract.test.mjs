import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  FOCUSED_MUTATION_ARTIFACT_ROOT,
  FOCUSED_MUTATION_FILE_SYSTEM,
  FOCUSED_MUTATION_LIMITS,
  FULL_MUTATION_ARTIFACT_ROOT,
  GOVERNED_MUTATION_DIFF_ARGUMENTS,
  assertFocusedEvidenceSafe,
  assertFocusedMutationAttemptAvailable,
  assertFocusedMutationByteBounds,
  assertFocusedMutationCandidate,
  assertFocusedMutationCensus,
  assertFocusedMutationProcessResult,
  buildMutationEnvironment,
  captureFocusedMutationCandidate,
  classifyMutationOutcome,
  encodeFocusedMutationJson,
  focusedMutationAttemptPaths,
  focusedMutationCensus,
  normalizeMutationReport,
  projectFocusedMutationReport,
  publishFocusedMutationEvidence,
  withMutationReportCleanup,
} from '../../scripts/lib/mutation-evidence.mjs';
import {
  canonicalize,
  discoverMutationRoster,
  sha256Hex,
} from '../../scripts/lib/mutation-roster.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const privacyRoot = join(repoRoot, 'packages/privacy');
const repositoryPreferencesDist = join(repoRoot, 'packages/preferences/dist');
const expectedNotificationsMutate = [
  'src/notifications.service.ts',
  'src/dispatch.service.ts',
  'src/inbox.service.ts',
  'src/templates/registry.ts',
  'src/templates/render.ts',
  'src/preferences/preferences.port.ts',
  'src/adapters/email-ses.adapter.ts',
  'src/adapters/sms-sns.adapter.ts',
  'src/adapters/push-stub.adapter.ts',
  'src/adapters/inapp-postgres.adapter.ts',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  assert.ifError(result.error);
  return result;
}

function mutationReport({ status = 'Killed', path = 'src/index.ts' } = {}) {
  return {
    thresholds: { break: 90, high: 100, low: 90 },
    projectRoot: repoRoot,
    config: { incremental: false },
    framework: { name: 'Stryker', version: '9.6.1' },
    files: {
      [path]: {
        language: 'typescript',
        source: 'private transient source',
        mutants: [{ id: '0', mutatorName: 'BooleanLiteral', replacement: 'false', status }],
      },
    },
    testFiles: {},
  };
}

const focusedStatusTotals = Object.freeze({
  CompileError: 304,
  Ignored: 76,
  Killed: 302,
  NoCoverage: 0,
  Pending: 0,
  RuntimeError: 0,
  Survived: 126,
  Timeout: 0,
});
const focusedCensus = Object.freeze({
  targetFileCount: 10,
  total: 808,
  scored: 428,
  nonScored: 380,
});
const focusedCommit = 'a'.repeat(40);
const focusedTree = 'b'.repeat(40);
const focusedDiffDigest = 'c'.repeat(64);
const focusedInputDigests = Object.freeze({
  configDigest: '1'.repeat(64),
  packageDigest: '2'.repeat(64),
  sourceSetDigest: '3'.repeat(64),
  targetSetDigest: '4'.repeat(64),
});

function focusedCurrentShapeReport() {
  const statuses = Object.entries(focusedStatusTotals).flatMap(([status, count]) =>
    Array.from({ length: count }, () => status),
  );
  const files = Object.fromEntries(
    Array.from({ length: 10 }, (_, fileIndex) => [
      `src/target-${String(fileIndex).padStart(2, '0')}.ts`,
      {
        language: 'typescript',
        source: `transient source ${String(fileIndex)}`,
        mutants: [],
      },
    ]),
  );
  const targets = Object.keys(files);
  statuses.forEach((status, index) => {
    files[targets[index % targets.length]].mutants.push({
      id: String(index),
      mutatorName: 'BooleanLiteral',
      replacement: 'github_pat_transientcredential000000000000',
      statusReason: '/Users/example/transient-reason',
      coveredBy: [`covered-${String(index)}`],
      killedBy: [`killed-${String(index)}`],
      status,
      location: {
        start: { line: index + 1, column: 0 },
        end: { line: index + 1, column: 1 },
      },
    });
  });
  return {
    thresholds: { break: 90, high: 100, low: 90 },
    projectRoot: '.',
    config: {},
    framework: { name: 'Stryker', version: '9.6.1' },
    files,
    testFiles: {
      'test/transient.spec.ts': {
        source: 'private transient test source',
        tests: [{ id: 'private-test-identifier', name: 'private test identifier' }],
      },
    },
  };
}

function focusedAttempt(root, { kind = 'success', digest = focusedDiffDigest, pid = 7001 } = {}) {
  return focusedMutationAttemptPaths({
    repoRoot: root,
    packageStem: 'packages-worklist',
    commit: focusedCommit,
    diffDigest: digest,
    kind,
    pid,
  });
}

function focusedFile(name, value, limit = FOCUSED_MUTATION_LIMITS.manifest) {
  const bytes = encodeFocusedMutationJson(value, limit, name);
  return { name, bytes, digest: sha256Hex(bytes) };
}

function focusedInventory(root) {
  if (!existsSync(root)) return [];
  const entries = [];
  const visit = (path) => {
    const metadata = lstatSync(path);
    const relativePath = relative(root, path) || '.';
    const entry = {
      path: relativePath,
      mode: metadata.mode & 0o777,
      type: metadata.isDirectory() ? 'directory' : metadata.isSymbolicLink() ? 'symlink' : 'file',
    };
    if (metadata.isFile()) {
      const bytes = readFileSync(path);
      entry.size = bytes.length;
      entry.digest = sha256Hex(bytes);
    }
    entries.push(entry);
    if (metadata.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(join(path, name));
    }
  };
  visit(root);
  return entries;
}

function focusedCandidateFixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'stynx-d24-12-candidate-'));
  const allowedUnstagedPaths = Array.from(
    { length: 4 },
    (_, index) => `spec-${String(index + 1)}.ts`,
  );
  for (const [index, path] of allowedUnstagedPaths.entries()) {
    writeFileSync(join(root, path), `spec ${String(index + 1)}\n`, { mode: 0o644 });
  }
  const state = {
    commit: focusedCommit,
    tree: focusedTree,
    indexStatus: 0,
    status: allowedUnstagedPaths.map((path) => ` M ${path}\0`).join(''),
    ignored: '!! node_modules/\0',
    diffBytes: Buffer.from('governed diff bytes\n'),
    inputDigests: { ...focusedInputDigests },
  };
  const gitRun = (_root, arguments_) => {
    let status = 0;
    let stdout = Buffer.alloc(0);
    if (arguments_[0] === 'rev-parse' && arguments_[1] === 'HEAD^{commit}') {
      stdout = Buffer.from(`${state.commit}\n`);
    } else if (arguments_[0] === 'rev-parse' && arguments_[1] === 'HEAD^{tree}') {
      stdout = Buffer.from(`${state.tree}\n`);
    } else if (arguments_[0] === 'diff' && arguments_[1] === '--cached') {
      status = state.indexStatus;
    } else if (arguments_[0] === 'status' && arguments_.includes('--ignored=matching')) {
      stdout = Buffer.from(`${state.status}${state.ignored}`);
    } else if (arguments_[0] === 'status') {
      stdout = Buffer.from(state.status);
    } else if (canonicalize(arguments_) === canonicalize(GOVERNED_MUTATION_DIFF_ARGUMENTS)) {
      stdout = state.diffBytes;
    } else {
      throw new Error(`unexpected focused git arguments: ${arguments_.join(' ')}`);
    }
    return { error: undefined, signal: null, status, stdout, stderr: Buffer.alloc(0) };
  };
  const capture = (overrides = {}) =>
    captureFocusedMutationCandidate({
      repoRoot: root,
      allowedUnstagedPaths,
      readInputDigests: () => ({ ...state.inputDigests }),
      gitRun,
      ...overrides,
    });
  return { root, allowedUnstagedPaths, state, gitRun, capture };
}

function assertSafeFixtureRoot(fixtureRoot) {
  const resolvedFixtureRoot = resolve(fixtureRoot);
  assert.notEqual(resolvedFixtureRoot, repoRoot, 'fixture must not resolve to the shared checkout');
  assert.equal(
    dirname(resolvedFixtureRoot),
    resolve(tmpdir()),
    'fixture must be a direct temp child',
  );
  assert.match(basename(resolvedFixtureRoot), /^stynx-d10-fixture-/u);
  return resolvedFixtureRoot;
}

function assertInsideFixture(fixtureRoot, target, label) {
  const resolvedFixtureRoot = assertSafeFixtureRoot(fixtureRoot);
  const resolvedTarget = resolve(target);
  const displacement = relative(resolvedFixtureRoot, resolvedTarget);
  assert.ok(
    displacement !== '' && !displacement.startsWith('..') && !isAbsolute(displacement),
    `${label} must resolve inside the isolated fixture`,
  );
  return resolvedTarget;
}

function spawnInFixture(fixture, command, args, options = {}) {
  const fixtureRoot = assertSafeFixtureRoot(fixture.root);
  fixture.subprocessCwds.push(fixtureRoot);
  return spawnSync(command, args, { ...options, cwd: fixtureRoot });
}

function removeInsideFixture(fixture, target, options) {
  const resolvedTarget = assertInsideFixture(fixture.root, target, 'destructive target');
  fixture.destructiveTargets.push(resolvedTarget);
  rmSync(resolvedTarget, options);
}

function removeFixture(fixture) {
  const fixtureRoot = assertSafeFixtureRoot(fixture.root);
  fixture.destructiveTargets.push(fixtureRoot);
  rmSync(fixtureRoot, { recursive: true, force: true });
}

function createBuildFixture() {
  const fixture = {
    root: mkdtempSync(join(tmpdir(), 'stynx-d10-fixture-')),
    destructiveTargets: [],
    subprocessCwds: [],
  };
  try {
    const archive = spawnInFixture(
      fixture,
      'git',
      [
        '-C',
        repoRoot,
        'archive',
        '--format=tar',
        'HEAD',
        '--',
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'tsconfig.json',
        'turbo.json',
        'docs/framework/api/openapi.json',
        'packages',
        'reference/api',
        'reference/web/package.json',
        'reference/web/playwright.config.mjs',
        'reference/web/scripts/serve-reference-api-stack.mjs',
        'scripts/verify-reference-api-build-inputs.mjs',
        'tools',
      ],
      { maxBuffer: 128 * 1024 * 1024 },
    );
    assert.ifError(archive.error);
    assert.equal(archive.status, 0, archive.stderr.toString());
    const extracted = spawnInFixture(fixture, 'tar', ['-xf', '-'], {
      input: archive.stdout,
      maxBuffer: 128 * 1024 * 1024,
    });
    assert.ifError(extracted.error);
    assert.equal(extracted.status, 0, extracted.stderr.toString());
    return fixture;
  } catch (error) {
    removeFixture(fixture);
    throw error;
  }
}

function modeOf(stat) {
  return stat.mode & 0o7777;
}

function entryExists(target) {
  try {
    lstatSync(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function assertPreferencesFixtureRoot(fixtureRoot) {
  const resolvedFixtureRoot = resolve(fixtureRoot);
  assert.equal(dirname(resolvedFixtureRoot), realpathSync(tmpdir()));
  assert.match(basename(resolvedFixtureRoot), /^stynx-d17-2-preferences-fixture-/u);
  const stat = lstatSync(resolvedFixtureRoot);
  assert.equal(stat.isDirectory(), true);
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal(realpathSync(resolvedFixtureRoot), resolvedFixtureRoot);
  return resolvedFixtureRoot;
}

function assertInsidePreferencesFixture(fixture, target, label, { allowLeafSymlink = false } = {}) {
  const fixtureRoot = assertPreferencesFixtureRoot(fixture.root);
  const resolvedTarget = resolve(target);
  const displacement = relative(fixtureRoot, resolvedTarget);
  assert.ok(
    displacement !== '' && !displacement.startsWith('..') && !isAbsolute(displacement),
    `${label} must resolve inside the owned preferences fixture`,
  );
  const segments = displacement.split('/');
  let cursor = fixtureRoot;
  for (const [index, segment] of segments.entries()) {
    cursor = join(cursor, segment);
    if (!entryExists(cursor)) continue;
    const stat = lstatSync(cursor);
    assert.ok(
      !stat.isSymbolicLink() || (allowLeafSymlink && index === segments.length - 1),
      `${label} must not traverse a symbolic link`,
    );
    if (!stat.isSymbolicLink()) assert.equal(realpathSync(cursor), resolve(cursor));
  }
  assert.notEqual(resolvedTarget, repositoryPreferencesDist);
  return resolvedTarget;
}

function assertFixtureDist(fixture, distRoot = fixture.distRoot) {
  const resolvedDist = assertInsidePreferencesFixture(fixture, distRoot, 'fixture dist root');
  assert.equal(resolvedDist, resolve(fixture.distRoot), 'fixture dist root must match ownership');
  return resolvedDist;
}

function createPreferencesFixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'stynx-d17-2-preferences-fixture-'));
  const fixture = {
    root,
    distRoot: join(root, 'packages/preferences/dist'),
    destructiveTargets: [],
  };
  assertPreferencesFixtureRoot(root);
  assertFixtureDist(fixture);
  return fixture;
}

function inventoryFixtureTree(fixture, root) {
  const resolvedRoot = assertInsidePreferencesFixture(fixture, root, 'inventory root', {
    allowLeafSymlink: true,
  });
  if (!entryExists(resolvedRoot)) {
    const inventory = { present: false, entries: [] };
    return {
      ...inventory,
      digest: createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),
    };
  }

  const entries = [];
  const visit = (target) => {
    const resolvedTarget = assertInsidePreferencesFixture(fixture, target, 'inventory entry', {
      allowLeafSymlink: true,
    });
    const stat = lstatSync(resolvedTarget);
    const path = relative(fixture.root, resolvedTarget);
    assert.ok(path !== '' && !path.startsWith('..') && !isAbsolute(path));
    if (stat.isDirectory()) {
      entries.push({ path, type: 'directory', mode: modeOf(stat) });
      for (const name of readdirSync(resolvedTarget).sort()) visit(join(resolvedTarget, name));
      return;
    }
    if (stat.isFile()) {
      const bytes = readFileSync(resolvedTarget);
      entries.push({
        path,
        type: 'file',
        mode: modeOf(stat),
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      return;
    }
    if (stat.isSymbolicLink()) {
      const targetBytes = Buffer.from(readlinkSync(resolvedTarget));
      entries.push({
        path,
        type: 'symlink',
        mode: modeOf(stat),
        size: targetBytes.length,
        sha256: createHash('sha256').update(targetBytes).digest('hex'),
      });
      return;
    }
    assert.fail(`unsupported preferences entry type: ${path}`);
  };
  visit(resolvedRoot);
  const inventory = { present: true, entries };
  return {
    ...inventory,
    digest: createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),
  };
}

function snapshotPreferencesDist(fixture, distRoot = fixture.distRoot) {
  const resolvedDistRoot = assertFixtureDist(fixture, distRoot);
  const snapshotParent = assertInsidePreferencesFixture(
    fixture,
    join(fixture.root, 'snapshots'),
    'snapshot parent',
  );
  mkdirSync(snapshotParent, { recursive: true, mode: 0o700 });
  const snapshotRoot = mkdtempSync(join(snapshotParent, 'snapshot-'));
  const resolvedSnapshotRoot = assertInsidePreferencesFixture(
    fixture,
    snapshotRoot,
    'snapshot root',
  );
  try {
    const inventory = inventoryFixtureTree(fixture, resolvedDistRoot);
    const storedEntries = [];
    for (const [index, entry] of inventory.entries.entries()) {
      const source = assertInsidePreferencesFixture(
        fixture,
        resolve(fixture.root, entry.path),
        'snapshot source',
        { allowLeafSymlink: true },
      );
      if (entry.type === 'file') {
        const storagePath = assertInsidePreferencesFixture(
          fixture,
          join(resolvedSnapshotRoot, `entry-${index}`),
          'snapshot storage',
        );
        writeFileSync(storagePath, readFileSync(source), { mode: entry.mode });
        storedEntries.push({ ...entry, storagePath });
      } else if (entry.type === 'symlink') {
        const storagePath = assertInsidePreferencesFixture(
          fixture,
          join(resolvedSnapshotRoot, `entry-${index}`),
          'snapshot storage',
        );
        writeFileSync(storagePath, Buffer.from(readlinkSync(source)), { mode: 0o600 });
        storedEntries.push({ ...entry, storagePath });
      } else {
        storedEntries.push(entry);
      }
    }
    const inventoryPath = assertInsidePreferencesFixture(
      fixture,
      join(resolvedSnapshotRoot, 'inventory.json'),
      'snapshot inventory',
    );
    writeFileSync(inventoryPath, `${JSON.stringify(inventory)}\n`, { mode: 0o600 });
    return {
      root: resolvedSnapshotRoot,
      distRoot: resolvedDistRoot,
      inventory,
      entries: storedEntries,
    };
  } catch (error) {
    fixture.destructiveTargets.push(resolvedSnapshotRoot);
    rmSync(resolvedSnapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

function restorePreferencesDist(fixture, snapshot, distRoot = fixture.distRoot) {
  const resolvedDistRoot = assertFixtureDist(fixture, distRoot);
  assert.equal(snapshot.distRoot, resolvedDistRoot, 'snapshot root must match fixture dist root');
  assertInsidePreferencesFixture(fixture, snapshot.root, 'snapshot root');
  const currentInventory = inventoryFixtureTree(fixture, resolvedDistRoot);
  if (JSON.stringify(currentInventory) === JSON.stringify(snapshot.inventory)) return false;
  fixture.destructiveTargets.push(resolvedDistRoot);
  rmSync(resolvedDistRoot, { recursive: true, force: true });
  if (!snapshot.inventory.present) return true;

  for (const entry of snapshot.entries.filter(({ type }) => type === 'directory')) {
    const target = assertInsidePreferencesFixture(
      fixture,
      resolve(fixture.root, entry.path),
      'restored directory',
    );
    mkdirSync(target, { recursive: true, mode: entry.mode });
  }
  for (const entry of snapshot.entries.filter(({ type }) => type !== 'directory')) {
    const target = assertInsidePreferencesFixture(
      fixture,
      resolve(fixture.root, entry.path),
      'restored entry',
    );
    mkdirSync(dirname(target), { recursive: true });
    if (entry.type === 'file') {
      writeFileSync(target, readFileSync(entry.storagePath), { mode: entry.mode });
      chmodSync(target, entry.mode);
    } else {
      symlinkSync(readFileSync(entry.storagePath, 'utf8'), target);
    }
  }
  for (const entry of snapshot.entries
    .filter(({ type }) => type === 'directory')
    .toSorted((left, right) => right.path.length - left.path.length)) {
    chmodSync(
      assertInsidePreferencesFixture(
        fixture,
        resolve(fixture.root, entry.path),
        'restored mode target',
      ),
      entry.mode,
    );
  }
  return true;
}

function withPreferencesDistRestored(fixture, operation, evidence = {}) {
  const snapshot = snapshotPreferencesDist(fixture);
  evidence.snapshotRoot = snapshot.root;
  evidence.before = snapshot.inventory;
  try {
    return operation();
  } finally {
    try {
      evidence.restorationRequired = restorePreferencesDist(fixture, snapshot);
      evidence.after = inventoryFixtureTree(fixture, fixture.distRoot);
      assert.deepEqual(evidence.after, evidence.before);
    } finally {
      const snapshotTarget = assertInsidePreferencesFixture(
        fixture,
        snapshot.root,
        'snapshot cleanup',
      );
      fixture.destructiveTargets.push(snapshotTarget);
      rmSync(snapshotTarget, { recursive: true, force: true });
      evidence.snapshotRemoved = !entryExists(snapshot.root);
      assert.equal(evidence.snapshotRemoved, true);
    }
  }
}

function seedPreferencesDist(fixture, state) {
  const distRoot = assertFixtureDist(fixture);
  fixture.destructiveTargets.push(distRoot);
  rmSync(distRoot, { recursive: true, force: true });
  if (state === 'absent') return;
  assert.equal(state, 'seeded');
  const emptyDirectory = assertInsidePreferencesFixture(fixture, join(distRoot, 'empty'), 'seed');
  const nestedDirectory = assertInsidePreferencesFixture(
    fixture,
    join(distRoot, 'mixed/nested'),
    'seed',
  );
  const dataFile = assertInsidePreferencesFixture(
    fixture,
    join(nestedDirectory, 'payload.bin'),
    'seed',
  );
  const executable = assertInsidePreferencesFixture(fixture, join(distRoot, 'mixed/tool'), 'seed');
  const link = assertInsidePreferencesFixture(
    fixture,
    join(distRoot, 'mixed/payload-link'),
    'seed',
  );
  mkdirSync(emptyDirectory, { recursive: true, mode: 0o750 });
  mkdirSync(nestedDirectory, { recursive: true, mode: 0o711 });
  writeFileSync(dataFile, Buffer.from([0, 255, 10, 13, 42]), { mode: 0o640 });
  writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o751 });
  symlinkSync('nested/payload.bin', link);
  chmodSync(emptyDirectory, 0o750);
  chmodSync(nestedDirectory, 0o711);
}

function mutatePreferencesDist(fixture) {
  const distRoot = assertFixtureDist(fixture);
  fixture.destructiveTargets.push(distRoot);
  rmSync(distRoot, { recursive: true, force: true });
  const generated = assertInsidePreferencesFixture(
    fixture,
    join(distRoot, 'preferences/src/index.js'),
    'mutation output',
  );
  mkdirSync(dirname(generated), { recursive: true });
  writeFileSync(generated, 'export const generated = true;\n', { mode: 0o644 });
}

function removePreferencesFixture(fixture, remover = rmSync) {
  const fixtureRoot = assertPreferencesFixtureRoot(fixture.root);
  fixture.destructiveTargets.push(fixtureRoot);
  remover(fixtureRoot, { recursive: true, force: true });
  assert.equal(entryExists(fixtureRoot), false);
}

function resolvedPrivacyPopulation(configName) {
  const result = run(
    'pnpm',
    [
      '--filter',
      '@stynx-nyx/privacy',
      'exec',
      'vitest',
      'list',
      '--config',
      `./${configName}`,
      '--filesOnly',
    ],
    { cwd: privacyRoot },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split(/\r?\n/u).filter(Boolean).sort();
}

function ownedRedisPort(mappingOutput) {
  const mappings = mappingOutput
    .split(/\r?\n/u)
    .map((mapping) => mapping.trim())
    .filter(Boolean);
  assert.ok(mappings.length > 0, 'the owned Compose redis mapping must be present');
  const ports = mappings.map((mapping) => {
    const match = /:(\d+)$/u.exec(mapping);
    assert.ok(match, 'every owned Compose redis mapping must end in a numeric host port');
    const port = Number(match[1]);
    assert.ok(
      Number.isSafeInteger(port) && port >= 1 && port <= 65_535,
      'the owned Compose redis host port must be within 1..65535',
    );
    return port;
  });
  const distinctPorts = [...new Set(ports)];
  assert.equal(distinctPorts.length, 1, 'owned Compose redis mappings must yield one port');
  return distinctPorts[0];
}

function ownedRedisUrl(mappingOutput, hostOverride) {
  const host = hostOverride ?? '127.0.0.1';
  assert.ok(host.length > 0, 'the redis host must not be empty');
  return `redis://${host}:${ownedRedisPort(mappingOutput)}`;
}

function assertD14HelperContract(helper, rootManifest) {
  assert.doesNotMatch(
    helper,
    /['"](?:127\.0\.0\.1:)?6379:6379['"]/u,
    'D14 rejects the current fixed 6379:6379 host publication',
  );
  assert.match(helper, /127\.0\.0\.1::6379/u);
  assert.match(
    helper,
    /\[\s*'compose',\s*'-f',\s*composeFile,\s*'port',\s*'redis',\s*'6379'\s*\]/su,
  );
  assert.match(helper, /process\.env\.TESTCONTAINERS_HOST_OVERRIDE\s*\?\?\s*'127\.0\.0\.1'/u);
  assert.match(
    helper,
    /STYNX_REDIS_URL:\s*`redis:\/\/\$\{[A-Za-z_$][\w$]*\}:\$\{[A-Za-z_$][\w$]*\}`/u,
  );
  assert.doesNotMatch(helper, /redis:\/\/127\.0\.0\.1:6379/u);
  assert.doesNotMatch(
    helper,
    /spawn(?:Sync)?\(\s*'docker',\s*\[\s*'(?:ps|inspect|stop|kill|rm|container|network|volume)'/su,
  );
  assert.doesNotMatch(helper, /(?:find|reserve|probe)(?:Free|Available)?Port/iu);
  assert.doesNotMatch(helper, /(?:retry|setTimeout)\s*\(/u);
  assert.equal((helper.match(/\bawait sleep\(/gu) ?? []).length, 1);
  assert.match(helper, /while \(isProcessAlive\(parentPid\)\) \{\s*await sleep\(250\);\s*\}/su);
  assert.doesNotMatch(rootManifest.scripts['test:e2e'], /--concurrency/u);
  assert.doesNotMatch(rootManifest.scripts.test, /--concurrency/u);
}

const startupProtocol = 'stynx-reference-api-startup-v1';
const startupOutputPrefix = '[reference-api-startup]';
const helperSuccessStates = [
  'helper-entered',
  'compose-ready',
  'redis-mapping-resolved',
  'build-inputs-verified',
  'child-spawned',
];
const startupSuccessStates = ['bootstrap-entered', 'nest-created', 'listening'];
const startupFailureReasons = ['nest-initialization', 'pre-listen-configuration', 'listen'];
const startupChildTerminals = ['child-error', 'child-disconnect', 'child-exit'];
const runtimeRouteTableStates = [
  'runtime-route-table-present',
  'runtime-route-table-absent',
  'runtime-route-table-indeterminate',
];
const governedRuntimeRoutes = ['GET /healthz', 'GET /readyz', 'GET /_reference/demo-tenants'];
const runtimeRouteTableBegin = '// D17.6 runtime route table inspection: begin';
const runtimeRouteTableEnd = '// D17.6 runtime route table inspection: end';
const ownedListenerBindingBegin = '// D17.7 owned listener binding: begin';
const ownedListenerBindingEnd = '// D17.7 owned listener binding: end';
const helperManagedBindingBegin = '// D18 helper-managed listener binding: begin';
const helperManagedBindingEnd = '// D18 helper-managed listener binding: end';
const helperManagedMarker = 'STYNX_REFERENCE_API_HELPER_MANAGED';
const ownedListenerOptIn = '--d17-owned-route-classifier';
const defaultEndpointOptIn = '--d19-default-endpoint-classifier';
const ownedListenerOutputPrefix = '[reference-api-owned-route]';
const ownedListenerSlots = ['health', 'readiness', 'api-local', 'sentinel'];
const ownedListenerSlotCodes = {
  health: [
    'owned-healthz-2xx',
    'owned-healthz-404',
    'owned-healthz-other',
    'owned-healthz-connect-failed',
  ],
  readiness: [
    'owned-readyz-2xx',
    'owned-readyz-404',
    'owned-readyz-503',
    'owned-readyz-other',
    'owned-readyz-connect-failed',
  ],
  'api-local': [
    'owned-api-local-2xx',
    'owned-api-local-404',
    'owned-api-local-other',
    'owned-api-local-connect-failed',
  ],
  sentinel: ['owned-sentinel-404', 'owned-sentinel-other', 'owned-sentinel-connect-failed'],
};
const ownedListenerFinalCodes = [
  'owned-full-table-present',
  'owned-full-table-absent',
  'owned-full-table-indeterminate',
];
const defaultEndpointOutputPrefix = '[reference-api-default-endpoint]';
const defaultEndpointSlotCodes = {
  healthz: [
    'default-healthz-2xx',
    'default-healthz-404',
    'default-healthz-other',
    'default-healthz-connect-failed',
  ],
  readyz: [
    'default-readyz-2xx',
    'default-readyz-404',
    'default-readyz-503',
    'default-readyz-other',
    'default-readyz-connect-failed',
  ],
};
const defaultEndpointFinalCodes = [
  'default-endpoint-ready',
  'default-endpoint-unavailable',
  'default-endpoint-indeterminate',
];
const playwrightApiReadyLine = '[reference-api-startup] runtime-route-table-present';
const playwrightApiReadyWaitSource = '^\\[reference-api-startup\\] runtime-route-table-present$';
const playwrightApiReadyWaitLine =
  '      wait: { stderr: /^\\[reference-api-startup\\] runtime-route-table-present$/m },\n';
const d21ComposeTerminalCodes = [
  'compose-up-spawn-failed',
  'compose-up-exit-nonzero',
  'compose-up-signaled',
];

function normalizeD20PlaywrightWait(source) {
  const occurrenceCount = source.split(playwrightApiReadyWaitLine).length - 1;
  assert.ok([0, 1].includes(occurrenceCount), 'D20 wait field must occur at most once');
  assert.equal((source.match(/\bwait\s*:/gu) ?? []).length, occurrenceCount);
  assert.equal((source.match(/\bstdout\s*:/gu) ?? []).length, 0);

  if (occurrenceCount === 1) {
    const apiEntryStart = source.indexOf(
      "    {\n      command: 'node scripts/serve-reference-api-stack.mjs',",
    );
    const apiEntryEnd = source.indexOf('\n    },', apiEntryStart);
    const waitIndex = source.indexOf(playwrightApiReadyWaitLine);
    assert.ok(apiEntryStart >= 0);
    assert.ok(apiEntryEnd > apiEntryStart);
    assert.ok(waitIndex > apiEntryStart && waitIndex < apiEntryEnd);

    const waitExpression = /^\[reference-api-startup\] runtime-route-table-present$/m;
    assert.equal(waitExpression.source, playwrightApiReadyWaitSource);
    assert.equal(waitExpression.flags, 'm');
    assert.equal(waitExpression.global, false);
    assert.equal(waitExpression.exec(playwrightApiReadyLine)?.groups, undefined);
    assert.doesNotMatch(playwrightApiReadyWaitLine, /\(\?<|\([^?]|\/g\b/u);
  }

  const normalized = source.replace(playwrightApiReadyWaitLine, '');
  assert.equal(normalized.includes(playwrightApiReadyWaitLine), false);
  if (occurrenceCount === 1) {
    const insertionIndex = source.indexOf(playwrightApiReadyWaitLine);
    assert.equal(
      `${normalized.slice(0, insertionIndex)}${playwrightApiReadyWaitLine}${normalized.slice(insertionIndex)}`,
      source,
    );
  }
  return normalized;
}

function escapeRegExpLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function fixedStartupOutput(code) {
  assert.ok(
    [
      ...helperSuccessStates,
      ...startupSuccessStates,
      ...startupFailureReasons.map((reason) => `bootstrap-failed:${reason}`),
      ...startupChildTerminals,
      ...runtimeRouteTableStates,
      ...d21ComposeTerminalCodes,
    ].includes(code),
    'startup output must be one bounded fixed code',
  );
  return `${startupOutputPrefix} ${code}`;
}

function frozenMainWithoutRuntimeRouteTableInspection(source) {
  const beginCount = source.split(runtimeRouteTableBegin).length - 1;
  const endCount = source.split(runtimeRouteTableEnd).length - 1;
  if (beginCount === 0 && endCount === 0) return source;
  assert.equal(beginCount, 1, 'D17.6 main inspection begin marker must occur exactly once');
  assert.equal(endCount, 1, 'D17.6 main inspection end marker must occur exactly once');
  const begin = source.indexOf(runtimeRouteTableBegin);
  const end = source.indexOf(runtimeRouteTableEnd, begin);
  assert.ok(end > begin, 'D17.6 main inspection markers must be ordered');
  const beginLine = source.lastIndexOf('\n', begin) + 1;
  const afterEnd = source.indexOf('\n', end);
  assert.ok(afterEnd >= 0, 'D17.6 main inspection end marker must terminate its line');
  return `${source.slice(0, beginLine)}${source.slice(afterEnd + 1)}`;
}

function frozenMainWithoutOwnedListenerBinding(source) {
  const beginCount = source.split(ownedListenerBindingBegin).length - 1;
  const endCount = source.split(ownedListenerBindingEnd).length - 1;
  if (beginCount === 0 && endCount === 0) return source;
  assert.equal(beginCount, 1, 'D17.7 main binding begin marker must occur exactly once');
  assert.equal(endCount, 1, 'D17.7 main binding end marker must occur exactly once');
  const begin = source.indexOf(ownedListenerBindingBegin);
  const end = source.indexOf(ownedListenerBindingEnd, begin);
  assert.ok(end > begin, 'D17.7 main binding markers must be ordered');
  const beginLine = source.lastIndexOf('\n', begin) + 1;
  const afterEnd = source.indexOf('\n', end);
  assert.ok(afterEnd >= 0, 'D17.7 main binding end marker must terminate its line');
  return `${source.slice(0, beginLine)}    await app.listen(port);\n${source.slice(afterEnd + 1)}`;
}

function startupOracle(cleanup, recorder = () => undefined) {
  let nextState = 0;
  let terminal = false;
  let cleanupComplete = false;
  const recorded = new Set();

  function recordFixed(code) {
    assert.equal(recorded.has(code), false, 'a fixed startup state must be recorded once');
    recorded.add(code);
    recorder(fixedStartupOutput(code));
  }

  function fail(code) {
    terminal = true;
    if (startupChildTerminals.includes(code)) recordFixed(code);
    if (!cleanupComplete) {
      cleanupComplete = true;
      cleanup(code);
    }
    return { accepted: false, code };
  }

  function message(record) {
    if (terminal) return fail('terminal-record');
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return fail('malformed-record');
    }
    if (record.protocol !== startupProtocol || typeof record.state !== 'string') {
      return fail('malformed-record');
    }
    const keys = Object.keys(record).sort();
    if (record.state === 'bootstrap-failed') {
      if (!startupFailureReasons.includes(record.reason)) return fail('invalid-failure-reason');
      if (keys.join(',') !== 'protocol,reason,state') return fail('unbounded-record');
      const permittedAtPhase =
        (nextState === 1 && record.reason === 'nest-initialization') ||
        (nextState === 2 && ['pre-listen-configuration', 'listen'].includes(record.reason));
      if (!permittedAtPhase) return fail('out-of-order-record');
      terminal = true;
      cleanupComplete = true;
      recordFixed(`bootstrap-failed:${record.reason}`);
      cleanup(`bootstrap-failed:${record.reason}`);
      return { accepted: true, state: 'bootstrap-failed', reason: record.reason };
    }
    if (keys.join(',') !== 'protocol,state') return fail('unbounded-record');
    if (record.state !== startupSuccessStates[nextState]) return fail('out-of-order-record');
    nextState += 1;
    recordFixed(record.state);
    if (record.state === 'listening') terminal = true;
    return { accepted: true, state: record.state };
  }

  function childTerminal(kind) {
    if (!['error', 'disconnect', 'exit'].includes(kind)) return fail('unknown-child-event');
    if (terminal && nextState === startupSuccessStates.length) {
      return { accepted: true, state: 'already-listening' };
    }
    return fail(`child-${kind}`);
  }

  return { message, childTerminal };
}

function assertBootstrapBeforeRuntimeLoads(source) {
  const runtimeStaticImports = source.match(/^import\s+(?!type(?:\s|\{))/gmu) ?? [];
  assert.deepEqual(
    runtimeStaticImports,
    [],
    'main may retain only erased type-only static imports',
  );
  const enteredIndex = source.indexOf("state: 'bootstrap-entered'");
  assert.ok(enteredIndex >= 0, 'bootstrap-entered must be present');
  const dynamicImports = [...source.matchAll(/\bimport\s*\(/gu)].map(({ index }) => index);
  assert.ok(dynamicImports.length > 0, 'runtime and application modules must load dynamically');
  assert.equal(
    dynamicImports.every((index) => index > enteredIndex),
    true,
    'bootstrap-entered must precede every runtime and application dynamic import',
  );
}

function helperStartupFixture() {
  const stdout = [];
  const stderr = [];
  const operations = [];
  let pending = 'start';
  let terminal = false;
  let childOracle;

  function requirePending(expected) {
    assert.equal(terminal, false, 'terminal startup cannot advance');
    assert.equal(pending, expected, `expected pending ${expected}`);
  }

  function emit(code) {
    stderr.push(fixedStartupOutput(code));
  }

  function start() {
    requirePending('start');
    emit('helper-entered');
    operations.push('compose-up');
    pending = 'compose-up';
  }

  function resolveCompose() {
    requirePending('compose-up');
    emit('compose-ready');
    operations.push('redis-mapping');
    pending = 'redis-mapping';
  }

  function resolveRedisMapping() {
    requirePending('redis-mapping');
    emit('redis-mapping-resolved');
    operations.push('build-inputs');
    pending = 'build-inputs';
  }

  function resolveBuildInputs() {
    requirePending('build-inputs');
    emit('build-inputs-verified');
    operations.push('child-spawn-call');
    pending = 'child-spawn-call';
  }

  function spawnCall() {
    requirePending('child-spawn-call');
    operations.push('child-spawn-event');
    pending = 'child-spawn-event';
  }

  function spawnEvent() {
    requirePending('child-spawn-event');
    emit('child-spawned');
    pending = 'ipc';
    childOracle = startupOracle(
      () => {
        terminal = true;
      },
      (line) => stderr.push(line),
    );
  }

  function ipc(record) {
    requirePending('ipc');
    const result = childOracle.message(record);
    if (!result.accepted || result.state === 'bootstrap-failed') terminal = true;
    return result;
  }

  function childTerminal(event) {
    requirePending('ipc');
    const result = childOracle.childTerminal(event);
    if (!result.accepted) terminal = true;
    return result;
  }

  return {
    stdout,
    stderr,
    operations,
    start,
    resolveCompose,
    resolveRedisMapping,
    resolveBuildInputs,
    spawnCall,
    spawnEvent,
    ipc,
    childTerminal,
  };
}

function advanceHelperToSpawn(fixture) {
  fixture.start();
  fixture.resolveCompose();
  fixture.resolveRedisMapping();
  fixture.resolveBuildInputs();
  fixture.spawnCall();
  fixture.spawnEvent();
}

const readinessIndicatorNames = ['postgres', 'redis', 'jwks', 's3'];

function readinessDiagnosticFixture() {
  const requests = [];
  const requestCounts = { healthz: 0, readyz: 0 };
  const cleanupTargets = [];
  let state = 'await-listening';
  let healthClassification;
  let healthConnectFailed = false;
  let outcome;
  let cleanupComplete = false;

  function cleanup() {
    if (cleanupComplete) return;
    cleanupComplete = true;
    requests.length = 0;
    cleanupTargets.push('owned-d17-diagnostic');
  }

  function stop(nextOutcome) {
    outcome = nextOutcome;
    state = 'stopped';
    cleanup();
    return { accepted: true, outcome };
  }

  function reject() {
    state = 'stopped';
    cleanup();
    return { accepted: false };
  }

  function issue(endpoint) {
    requestCounts[endpoint] += 1;
    requests.push(`GET ${endpoint}`);
    state = `await-${endpoint}`;
  }

  function phase(line) {
    if (state === 'stopped') return { accepted: false };
    if (line !== fixedStartupOutput('listening')) {
      return { accepted: true, triggered: false };
    }
    if (state !== 'await-listening') return reject();
    issue('healthz');
    return { accepted: true, triggered: true };
  }

  function response(endpoint, event) {
    if (state !== `await-${endpoint}` || !['healthz', 'readyz'].includes(endpoint)) {
      return reject();
    }
    if (!event || typeof event !== 'object' || Array.isArray(event)) return reject();
    const keys = Object.keys(event).sort().join(',');
    if (event.kind === 'connect-failed') {
      if (keys !== 'kind') return reject();
      if (endpoint === 'healthz') {
        healthConnectFailed = true;
        issue('readyz');
        return { accepted: true, classified: false };
      }
      return stop({
        classifications: healthConnectFailed
          ? ['connect-failed']
          : [healthClassification, 'connect-failed'],
      });
    }
    if (event.kind !== 'response' || !Number.isSafeInteger(event.status)) return reject();
    if (event.status < 100 || event.status > 599) return reject();

    if (endpoint === 'healthz') {
      if (keys !== 'kind,status') return reject();
      healthClassification =
        event.status >= 200 && event.status < 300 ? 'healthz-2xx' : 'healthz-non2xx';
      issue('readyz');
      return { accepted: true, classified: false };
    }

    if (healthConnectFailed) {
      if (keys !== 'kind,status') return reject();
      return stop({ classifications: ['connect-failed'] });
    }
    if (!healthClassification) return reject();
    if (event.status === 503) {
      if (keys !== 'indicators,kind,status' || !Array.isArray(event.indicators)) return reject();
      if (event.indicators.length === 0) return reject();
      const seen = new Set();
      const indicators = [];
      for (const indicator of event.indicators) {
        if (!indicator || typeof indicator !== 'object' || Array.isArray(indicator))
          return reject();
        if (Object.keys(indicator).sort().join(',') !== 'name,passing') return reject();
        if (!readinessIndicatorNames.includes(indicator.name)) return reject();
        if (seen.has(indicator.name) || typeof indicator.passing !== 'boolean') return reject();
        seen.add(indicator.name);
        indicators.push({ name: indicator.name, passing: indicator.passing });
      }
      indicators.sort(
        (left, right) =>
          readinessIndicatorNames.indexOf(left.name) - readinessIndicatorNames.indexOf(right.name),
      );
      return stop({
        classifications: [healthClassification, 'readyz-503'],
        indicators,
      });
    }
    if (keys !== 'kind,status') return reject();
    const readinessClassification =
      event.status >= 200 && event.status < 300
        ? 'readyz-2xx'
        : event.status === 404
          ? 'readyz-404'
          : 'readyz-other';
    return stop({ classifications: [healthClassification, readinessClassification] });
  }

  function snapshot() {
    return {
      state,
      requests: [...requests],
      requestCounts: { ...requestCounts },
      outcome: outcome ? structuredClone(outcome) : undefined,
      cleanupTargets: [...cleanupTargets],
    };
  }

  return { phase, response, snapshot };
}

function startReadinessDiagnostic(fixture) {
  for (const code of [...helperSuccessStates, ...startupSuccessStates.slice(0, 2)]) {
    assert.deepEqual(fixture.phase(fixedStartupOutput(code)), {
      accepted: true,
      triggered: false,
    });
    assert.deepEqual(fixture.snapshot().requests, []);
  }
  assert.deepEqual(fixture.phase(fixedStartupOutput('listening')), {
    accepted: true,
    triggered: true,
  });
  assert.deepEqual(fixture.snapshot().requests, ['GET healthz']);
}

function runtimeRouteTableFixture() {
  const stdout = [];
  const stderr = [];
  const cleanupTargets = [];
  const phases = [...helperSuccessStates, ...startupSuccessStates];
  let nextPhase = 0;
  let state = 'phases';
  let acceptedRouteState;
  let cleanupComplete = false;

  function cleanup() {
    if (cleanupComplete) return;
    cleanupComplete = true;
    cleanupTargets.push('owned-d17-route-table-fixture');
  }

  function reject(reason) {
    state = 'rejected';
    cleanup();
    return { accepted: false, reason };
  }

  function phase(code) {
    if (state !== 'phases') return reject('phase-after-terminal');
    if (code !== phases[nextPhase]) return reject('phase-order');
    stderr.push(fixedStartupOutput(code));
    nextPhase += 1;
    if (nextPhase === phases.length) state = 'await-route-table';
    return { accepted: true, code };
  }

  function ipc(record) {
    if (state === 'phases') return reject('early-route-table');
    if (state === 'classified') return reject('duplicate-route-table');
    if (state !== 'await-route-table') return reject('route-table-after-terminal');
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return reject('malformed-route-table');
    }
    if (Object.keys(record).sort().join(',') !== 'protocol,state') {
      return reject('payload-bearing-route-table');
    }
    if (record.protocol !== startupProtocol || !runtimeRouteTableStates.includes(record.state)) {
      return reject('unknown-route-table');
    }
    acceptedRouteState = record.state;
    stderr.push(fixedStartupOutput(record.state));
    state = 'classified';
    return { accepted: true, state: record.state };
  }

  function childTerminal(event) {
    if (!['error', 'disconnect', 'exit'].includes(event)) {
      return reject('unknown-child-event');
    }
    if (state === 'classified') {
      state = 'completed';
      cleanup();
      return { accepted: true, state: acceptedRouteState };
    }
    if (state === 'await-route-table') stderr.push(fixedStartupOutput(`child-${event}`));
    return reject('child-without-route-table');
  }

  function snapshot() {
    return {
      stdout: [...stdout],
      stderr: [...stderr],
      cleanupTargets: [...cleanupTargets],
      nextPhase,
      state,
      acceptedRouteState,
    };
  }

  return { phase, ipc, childTerminal, snapshot };
}

function advanceRuntimeRouteTableFixture(fixture) {
  for (const code of [...helperSuccessStates, ...startupSuccessStates]) {
    assert.deepEqual(fixture.phase(code), { accepted: true, code });
  }
}

function d18ListenerOwnershipOracle({
  marker,
  ambientIpv4 = false,
  bindCollision = false,
  cleanupKind = 'async',
} = {}) {
  const helperManaged = marker === '1';
  const bindHost = helperManaged ? '127.0.0.1' : 'host-omitted';
  if (helperManaged && bindCollision) {
    return {
      bindHost,
      listening: false,
      routeTable: undefined,
      ipv4ProbeOwnedByChild: false,
      stderr: [fixedStartupOutput('bootstrap-failed:listen')],
      classifierRequests: [],
      cleanupEvents: [{ kind: cleanupKind, target: 'owned-d18-fixture' }],
      exitCode: 1,
    };
  }
  return {
    bindHost,
    listening: true,
    routeTable: 'runtime-route-table-present',
    ipv4ProbeOwnedByChild: helperManaged,
    ipv4ProbeMayReachAmbient: !helperManaged && ambientIpv4,
    stderr: [],
    classifierRequests: [],
    cleanupEvents: [],
    exitCode: undefined,
  };
}

function d18HelperInvocationOracle(args = [], inherited = {}) {
  const exactOptIn = args.length === 1 && args[0] === ownedListenerOptIn;
  const normalMode = args.length === 0;
  if (!normalMode && !exactOptIn) {
    return {
      accepted: false,
      operations: [],
      phases: [],
      classifierRequests: [],
      childEnvironment: undefined,
      exitCode: 1,
    };
  }
  const childEnvironment = { ...inherited };
  delete childEnvironment[helperManagedMarker];
  delete childEnvironment.STYNX_REFERENCE_API_OWNED_DIAGNOSTIC;
  childEnvironment[helperManagedMarker] = '1';
  if (exactOptIn) childEnvironment.STYNX_REFERENCE_API_OWNED_DIAGNOSTIC = '1';
  return {
    accepted: true,
    operations: ['owned-resource-setup', 'child-spawn'],
    phases: [...helperSuccessStates, ...startupSuccessStates, 'runtime-route-table-present'],
    classifierRequests: exactOptIn ? [...ownedListenerSlots] : [],
    childEnvironment,
    host: '127.0.0.1',
    port: exactOptIn ? 33_117 : 3_000,
    exitCode: undefined,
  };
}

function d19HelperModeOracle(args = [], inherited = {}) {
  const normalMode = args.length === 0;
  const d17Mode = args.length === 1 && args[0] === ownedListenerOptIn;
  const d19Mode = args.length === 1 && args[0] === defaultEndpointOptIn;
  if (!normalMode && !d17Mode && !d19Mode) {
    return {
      accepted: false,
      operations: [],
      phases: [],
      requests: [],
      childEnvironment: undefined,
      exitCode: 1,
    };
  }
  const childEnvironment = { ...inherited };
  delete childEnvironment[helperManagedMarker];
  delete childEnvironment.STYNX_REFERENCE_API_OWNED_DIAGNOSTIC;
  childEnvironment[helperManagedMarker] = '1';
  if (d17Mode) childEnvironment.STYNX_REFERENCE_API_OWNED_DIAGNOSTIC = '1';
  return {
    accepted: true,
    mode: normalMode ? 'default' : d17Mode ? 'd17' : 'd19',
    operations: ['owned-resource-setup', 'child-spawn'],
    phases: [...helperSuccessStates, ...startupSuccessStates],
    requests: [],
    childEnvironment,
    childInputs: {
      host: '127.0.0.1',
      port: d17Mode ? 33_117 : 3_000,
      helperManaged: '1',
      ownedDiagnostic: d17Mode ? '1' : undefined,
    },
    exitCode: undefined,
  };
}

function d21ComposeUpFixture() {
  const stderr = [fixedStartupOutput('helper-entered')];
  const stdout = [];
  const cleanupEvents = [];
  let terminal;
  let complete = false;

  function cleanup() {
    if (cleanupEvents.length === 0) {
      cleanupEvents.push({ kind: 'confined', target: 'owned-d21-fixture' });
    }
  }

  function childEvent(event) {
    if (complete || !event || typeof event !== 'object' || Array.isArray(event)) {
      return { accepted: false };
    }
    const keys = Object.keys(event).sort();
    let classification;
    if (keys.join(',') === 'kind' && event.kind === 'error') {
      classification = 'compose-up-spawn-failed';
    } else if (keys.join(',') === 'code,kind,signal' && event.kind === 'exit') {
      if (event.signal !== null) {
        classification = 'compose-up-signaled';
      } else if (Number.isInteger(event.code) && event.code !== 0) {
        classification = 'compose-up-exit-nonzero';
      } else if (event.code === 0 && event.signal === null) {
        stderr.push(fixedStartupOutput('compose-ready'));
        complete = true;
        return { accepted: true, classification: undefined };
      }
    }
    if (!classification) {
      complete = true;
      cleanup();
      return { accepted: false };
    }
    terminal = classification;
    stderr.push(`${startupOutputPrefix} ${classification}`);
    complete = true;
    cleanup();
    return { accepted: true, classification };
  }

  function snapshot() {
    return {
      stdout: [...stdout],
      stderr: [...stderr],
      terminal,
      cleanupEvents: [...cleanupEvents],
      complete,
    };
  }

  return { childEvent, snapshot };
}

function parseD22OwnedPostgresMapping(mappingText, hostOverrideDeclared) {
  const lines = mappingText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error('mapping-absent');
  const allowedAddresses = hostOverrideDeclared
    ? new Set(['0.0.0.0', '::'])
    : new Set(['127.0.0.1']);
  const ports = lines.map((line) => {
    const match = /^(\[[^\]]+\]|[^[\]]+):(\d+)$/u.exec(line);
    const address = match?.[1].replace(/^\[|\]$/gu, '');
    const port = Number(match?.[2]);
    if (
      !match ||
      !address ||
      !allowedAddresses.has(address) ||
      !Number.isSafeInteger(port) ||
      port < 1 ||
      port > 65_535
    ) {
      throw new Error('mapping-invalid');
    }
    return port;
  });
  if (new Set(ports).size !== 1) throw new Error('mapping-conflict');
  return ports[0];
}

function d22PostgresMappingFixture({ mappingText, hostOverride, inheritedPort = '55433' }) {
  const hostOverrideDeclared = hostOverride !== undefined;
  const operations = ['compose-up', 'postgres-port-query'];
  const cleanupEvents = [];
  try {
    const discoveredPort = parseD22OwnedPostgresMapping(mappingText, hostOverrideDeclared);
    const endpointHost = hostOverride ?? '127.0.0.1';
    const databaseUrl = `postgresql://postgres:postgres@${endpointHost}:${discoveredPort}/postgres`;
    operations.push('build-input-verification', 'child-spawn');
    return {
      accepted: true,
      postgresPublish: hostOverrideDeclared ? '0.0.0.0::5432' : '127.0.0.1::5432',
      mappingCommand: ['compose', '-f', 'owned-compose-file', 'port', 'postgres', '5432'],
      childEnvironment: {
        STYNX_OWNER_DATABASE_URL: databaseUrl,
        STYNX_APP_DATABASE_URL: databaseUrl,
        STYNX_READER_DATABASE_URL: databaseUrl,
      },
      operations,
      cleanupEvents,
      stdout: [],
      stderr: [],
    };
  } catch {
    cleanupEvents.push({ kind: 'confined', target: 'owned-d22-fixture' });
    return {
      accepted: false,
      operations,
      cleanupEvents,
      stdout: [],
      stderr: [],
    };
  } finally {
    void inheritedPort;
  }
}

function parseUniqueJson(text) {
  let index = 0;
  function skipWhitespace() {
    while (/\s/u.test(text[index] ?? '')) index += 1;
  }
  function stringToken() {
    if (text[index] !== '"') throw new Error('string-required');
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
        continue;
      }
      if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      index += 1;
    }
    throw new Error('unterminated-string');
  }
  function value() {
    skipWhitespace();
    if (text[index] === '{') return object();
    if (text[index] === '[') {
      index += 1;
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      while (true) {
        value();
        skipWhitespace();
        if (text[index] === ']') {
          index += 1;
          return;
        }
        if (text[index] !== ',') throw new Error('array-separator');
        index += 1;
      }
    }
    if (text[index] === '"') {
      stringToken();
      return;
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(
      text.slice(index),
    );
    if (!match) throw new Error('value-required');
    index += match[0].length;
  }
  function object() {
    const keys = new Set();
    index += 1;
    skipWhitespace();
    if (text[index] === '}') {
      index += 1;
      return;
    }
    while (true) {
      skipWhitespace();
      const key = stringToken();
      if (keys.has(key)) throw new Error('duplicate-member');
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ':') throw new Error('member-separator');
      index += 1;
      value();
      skipWhitespace();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      if (text[index] !== ',') throw new Error('object-separator');
      index += 1;
    }
  }
  value();
  skipWhitespace();
  if (index !== text.length) throw new Error('trailing-material');
  return JSON.parse(text);
}

function validateD19ReadinessBody(body) {
  if (typeof body !== 'string' || Buffer.byteLength(body) > 16_384) return undefined;
  let parsed;
  try {
    parsed = parseUniqueJson(body);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  if (Object.keys(parsed).sort().join(',') !== 'details,error,info,status') return undefined;
  if (parsed.status !== 'error') return undefined;
  for (const projection of [parsed.info, parsed.details]) {
    if (!projection || typeof projection !== 'object' || Array.isArray(projection))
      return undefined;
    if (
      Object.keys(projection).sort().join(',') !== readinessIndicatorNames.slice().sort().join(',')
    ) {
      return undefined;
    }
  }
  const indicators = [];
  for (const name of readinessIndicatorNames) {
    const info = parsed.info[name];
    const details = parsed.details[name];
    if (
      !info ||
      typeof info !== 'object' ||
      Array.isArray(info) ||
      !Object.hasOwn(info, 'status') ||
      !details ||
      typeof details !== 'object' ||
      Array.isArray(details) ||
      !Object.hasOwn(details, 'status') ||
      !['up', 'down'].includes(info.status) ||
      details.status !== info.status
    ) {
      return undefined;
    }
    indicators.push({ name, passing: info.status === 'up' });
  }
  const down = indicators.filter(({ passing }) => !passing).map(({ name }) => name);
  if (down.length === 0) return undefined;
  if (!parsed.error || typeof parsed.error !== 'object' || Array.isArray(parsed.error)) {
    return undefined;
  }
  if (Object.keys(parsed.error).sort().join(',') !== down.slice().sort().join(','))
    return undefined;
  return indicators;
}

function d19ReadinessBody(statuses) {
  const projection = Object.fromEntries(
    readinessIndicatorNames.map((name) => [
      name,
      statuses[name] === 'down'
        ? { status: 'down', error: 'discarded indicator detail' }
        : { status: 'up' },
    ]),
  );
  const error = Object.fromEntries(
    readinessIndicatorNames
      .filter((name) => statuses[name] === 'down')
      .map((name) => [name, { error: 'discarded indicator detail' }]),
  );
  return JSON.stringify({ status: 'error', info: projection, error, details: projection });
}

function d19ClassifierFixture(cleanupKind = 'async') {
  const requests = [];
  const attempted = { healthz: 0, readyz: 0 };
  const codes = [];
  const stderr = [];
  const cleanupEvents = [];
  let state = 'await-route-table';
  let healthCode;
  let bodyReads = 0;

  function emit(code) {
    codes.push(code);
    stderr.push(`${defaultEndpointOutputPrefix} ${code}`);
  }
  function cleanup() {
    if (cleanupEvents.length === 0)
      cleanupEvents.push({ kind: cleanupKind, target: 'owned-d19-fixture' });
  }
  function stop(finalCode, accepted = true) {
    if (finalCode) emit(finalCode);
    state = 'stopped';
    cleanup();
    return { accepted };
  }
  function issue(slot) {
    attempted[slot] += 1;
    requests.push(`GET ${slot}`);
    state = `await-${slot}`;
  }
  function routeTable(record) {
    if (state !== 'await-route-table') return stop(undefined, false);
    if (record !== 'runtime-route-table-present') return stop(undefined, false);
    issue('healthz');
    return { accepted: true };
  }
  function response(slot, event) {
    if (state !== `await-${slot}` || !event || typeof event !== 'object' || Array.isArray(event)) {
      return stop(undefined, false);
    }
    let code;
    if (event.kind === 'connect-failed') {
      if (Object.keys(event).join(',') !== 'kind') return stop(undefined, false);
      code = `default-${slot}-connect-failed`;
    } else if (
      event.kind === 'response' &&
      Number.isSafeInteger(event.status) &&
      event.status >= 100 &&
      event.status <= 599 &&
      ['kind,status', 'body,kind,status'].includes(Object.keys(event).sort().join(','))
    ) {
      if (slot === 'readyz' && event.status === 503) {
        const indicators = validateD19ReadinessBody(event.body);
        if (!indicators) return stop(undefined, false);
        bodyReads += Buffer.byteLength(event.body);
        code = 'default-readyz-503';
        emit(code);
        for (const { name, passing } of indicators) {
          emit(`default-readyz-${name}-${passing ? 'pass' : 'fail'}`);
        }
      } else {
        code =
          event.status >= 200 && event.status < 300
            ? `default-${slot}-2xx`
            : event.status === 404
              ? `default-${slot}-404`
              : `default-${slot}-other`;
      }
    } else {
      return stop(undefined, false);
    }
    if (!(slot === 'readyz' && event.status === 503)) emit(code);
    if (slot === 'healthz') {
      healthCode = code;
      issue('readyz');
      return { accepted: true };
    }
    const finalCode =
      healthCode === 'default-healthz-2xx' && code === 'default-readyz-2xx'
        ? 'default-endpoint-ready'
        : healthCode === 'default-healthz-2xx' && code === 'default-readyz-503'
          ? 'default-endpoint-unavailable'
          : 'default-endpoint-indeterminate';
    return stop(finalCode);
  }
  function terminal() {
    return stop(undefined, false);
  }
  function snapshot() {
    return {
      requests: [...requests],
      attempted: { ...attempted },
      codes: [...codes],
      stderr: [...stderr],
      stdout: [],
      cleanupEvents: [...cleanupEvents],
      bodyReads,
      state,
    };
  }
  return { routeTable, response, terminal, snapshot };
}

function ownedListenerDiagnosticFixture(args = [], inheritedInternalControl = false) {
  const stdout = [];
  const stderr = [];
  const operations = [];
  const attemptedSlots = [];
  const slotCodes = [];
  const cleanupTargets = [];
  const exactOptIn = args.length === 1 && args[0] === ownedListenerOptIn;
  const normalMode = args.length === 0;
  const fixedDiagnosticHost = '127.0.0.1';
  const fixedDiagnosticPort = 33_117;
  const childBinding = exactOptIn
    ? { host: fixedDiagnosticHost, port: fixedDiagnosticPort }
    : undefined;
  const requesterBinding = exactOptIn
    ? { host: fixedDiagnosticHost, port: fixedDiagnosticPort }
    : undefined;
  const inheritedControl = inheritedInternalControl ? 'inherited' : undefined;
  const internalControl = exactOptIn ? '1' : undefined;
  let state = normalMode ? 'default-ready' : exactOptIn ? 'diagnostic-ready' : 'rejected';
  let currentSlot = -1;
  let cleanupComplete = false;
  let discardedStreams = 0;
  let exitCode = state === 'rejected' ? 1 : undefined;
  const controls = {
    inheritedControlStripped:
      inheritedControl === undefined || internalControl !== inheritedControl,
    internalControlSetByCliOnly: exactOptIn && internalControl === '1',
    childUsesFixedDiagnosticBinding:
      childBinding?.host === fixedDiagnosticHost && childBinding?.port === fixedDiagnosticPort,
    requesterUsesFixedDiagnosticBinding:
      requesterBinding?.host === fixedDiagnosticHost &&
      requesterBinding?.port === fixedDiagnosticPort,
    bindingConsistent:
      !exactOptIn ||
      (childBinding.host === requesterBinding.host && childBinding.port === requesterBinding.port),
  };

  function cleanup() {
    if (cleanupComplete) return;
    cleanupComplete = true;
    cleanupTargets.push('owned-d17-7-fixture');
  }

  function reject() {
    state = 'stopped';
    exitCode = 1;
    if (operations.length > 0) cleanup();
    return { accepted: false };
  }

  function emit(code) {
    const allowed = [...Object.values(ownedListenerSlotCodes).flat(), ...ownedListenerFinalCodes];
    assert.equal(allowed.includes(code), true, 'D17.7 output must be one exact fixed code');
    stderr.push(`${ownedListenerOutputPrefix} ${code}`);
  }

  function start() {
    if (!['default-ready', 'diagnostic-ready'].includes(state)) return reject();
    operations.push('owned-resource-setup', 'docker-closure', 'build-verifier', 'child-spawn');
    state = normalMode ? 'default-running' : 'await-route-table';
    return { accepted: true, diagnostic: exactOptIn };
  }

  function issueNextSlot() {
    currentSlot += 1;
    if (currentSlot === ownedListenerSlots.length) {
      const finalCode =
        slotCodes.join(',') ===
        'owned-healthz-2xx,owned-readyz-2xx,owned-api-local-2xx,owned-sentinel-404'
          ? 'owned-full-table-present'
          : slotCodes.join(',') ===
              'owned-healthz-2xx,owned-readyz-503,owned-api-local-2xx,owned-sentinel-404'
            ? 'owned-full-table-present'
            : slotCodes.join(',') ===
                'owned-healthz-404,owned-readyz-404,owned-api-local-404,owned-sentinel-404'
              ? 'owned-full-table-absent'
              : 'owned-full-table-indeterminate';
      emit(finalCode);
      state = 'completed';
      exitCode = 0;
      cleanup();
      return { accepted: true, finalCode };
    }
    attemptedSlots.push(ownedListenerSlots[currentSlot]);
    state = `await-${ownedListenerSlots[currentSlot]}`;
    return { accepted: true, slot: ownedListenerSlots[currentSlot] };
  }

  function routeTable(record) {
    if (state === 'default-running') {
      if (!runtimeRouteTableStates.includes(record)) return reject();
      stderr.push(fixedStartupOutput(record));
      return { accepted: true, diagnostic: false };
    }
    if (state !== 'await-route-table' || !runtimeRouteTableStates.includes(record)) return reject();
    stderr.push(fixedStartupOutput(record));
    if (record !== 'runtime-route-table-present') return reject();
    return issueNextSlot();
  }

  function classify(slot, event) {
    if (state !== `await-${slot}` || slot !== ownedListenerSlots[currentSlot]) return reject();
    if (!event || typeof event !== 'object' || Array.isArray(event)) return reject();
    const keys = Object.keys(event).sort().join(',');
    let code;
    if (event.kind === 'connect-failed') {
      if (keys !== 'kind') return reject();
      code = `owned-${slot === 'health' ? 'healthz' : slot === 'readiness' ? 'readyz' : slot}-connect-failed`;
    } else if (
      event.kind === 'response' &&
      keys === 'kind,status' &&
      Number.isSafeInteger(event.status) &&
      event.status >= 100 &&
      event.status <= 599
    ) {
      discardedStreams += 1;
      const stem = slot === 'health' ? 'healthz' : slot === 'readiness' ? 'readyz' : slot;
      const classification =
        event.status >= 200 && event.status < 300
          ? '2xx'
          : event.status === 404
            ? '404'
            : slot === 'readiness' && event.status === 503
              ? '503'
              : 'other';
      code = `owned-${stem}-${classification}`;
    } else {
      return reject();
    }
    if (!ownedListenerSlotCodes[slot].includes(code)) return reject();
    slotCodes.push(code);
    emit(code);
    return issueNextSlot();
  }

  function terminal(kind) {
    if (
      ![
        'bind-failure',
        'child-error',
        'child-disconnect',
        'child-exit',
        'protocol-failure',
        'assertion-failure',
        'command-failure',
        'cleanup-failure',
      ].includes(kind)
    ) {
      return reject();
    }
    return reject();
  }

  function snapshot() {
    return {
      stdout: [...stdout],
      stderr: [...stderr],
      operations: [...operations],
      attemptedSlots: [...attemptedSlots],
      slotCodes: [...slotCodes],
      cleanupTargets: [...cleanupTargets],
      controls: { ...controls },
      discardedStreams,
      state,
      exitCode,
    };
  }

  return { start, routeTable, classify, terminal, snapshot };
}

function runOwnedListenerResponses(events) {
  const fixture = ownedListenerDiagnosticFixture([ownedListenerOptIn], true);
  assert.deepEqual(fixture.start(), { accepted: true, diagnostic: true });
  assert.deepEqual(fixture.routeTable('runtime-route-table-present'), {
    accepted: true,
    slot: 'health',
  });
  for (const [index, event] of events.entries()) {
    const slot = ownedListenerSlots[index];
    assert.equal(fixture.classify(slot, event).accepted, true);
  }
  return fixture.snapshot();
}

function ownedListenerCleanupPreloadSource() {
  return String.raw`
import childProcess from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';

const actionsPath = process.env.D17_7_ACTIONS;
const action = (name) => fs.appendFileSync(actionsPath, name + '\n');
const later = (callback) => setImmediate(callback);
const statuses = [204, 503, 200, 404];
let requestIndex = 0;

process.on('unhandledRejection', () => action('unhandled-rejection'));
process.on('uncaughtExceptionMonitor', () => action('uncaught-exception'));

class SeamChild extends EventEmitter {
  constructor(kind) {
    super();
    this.kind = kind;
    this.pid = 51001;
    this.exitCode = null;
    this.signalCode = null;
  }

  finish(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
  }

  kill(signal = 'SIGTERM') {
    this.signalCode = signal;
    return true;
  }

  unref() {}
}

fs.promises.rm = async () => {
  action('async-rm');
  throw new Error('private cleanup rejection');
};

childProcess.spawn = (command, args = []) => {
  if (command === 'docker' && args.includes('up')) {
    action('up');
    const child = new SeamChild('up');
    later(() => child.finish(0));
    return child;
  }
  if (command === 'docker' && args.includes('down')) {
    action('async-down');
    const child = new SeamChild('down');
    later(() => child.finish(0));
    return child;
  }
  if (command === 'node' && String(args[0]).includes('verify-reference-api-build-inputs')) {
    action('verify');
    const child = new SeamChild('verify');
    later(() => child.finish(0));
    return child;
  }
  if (command === 'node') {
    action('api');
    const child = new SeamChild('api');
    later(() => {
      child.emit('spawn');
      for (const state of ['bootstrap-entered', 'nest-created', 'listening', 'runtime-route-table-present']) {
        child.emit('message', { protocol: 'stynx-reference-api-startup-v1', state });
      }
    });
    return child;
  }
  if (command === process.execPath) {
    action('watchdog');
    return new SeamChild('watchdog');
  }
  throw new Error('unexpected seam command');
};

childProcess.spawnSync = (command, args = []) => {
  if (command === 'docker' && args.includes('port')) {
    action('port');
    return { status: 0, signal: null, stdout: '127.0.0.1:49152\n', stderr: '' };
  }
  if (command === 'docker' && args.includes('down')) {
    action('sync-down');
    return { status: 0, signal: null, stdout: '', stderr: '' };
  }
  throw new Error('unexpected seam sync command');
};

http.get = (_options, callback) => {
  const current = requestIndex;
  requestIndex += 1;
  action('request-' + String(current + 1));
  const request = new EventEmitter();
  later(() => {
    const response = new EventEmitter();
    response.statusCode = statuses[current];
    response.resume = () => action('discard-' + String(current + 1));
    callback(response);
  });
  return request;
};

syncBuiltinESMExports();
`;
}

function runOwnedListenerCleanupRejection() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'stynx-d17-7-cleanup-seam-'));
  const helperSource = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  const helperPath = join(fixtureRoot, 'reference/web/scripts/serve-reference-api-stack.mjs');
  const preloadPath = join(fixtureRoot, 'cleanup-preload.mjs');
  const actionsPath = join(fixtureRoot, 'actions.log');
  const composeRoot = join(fixtureRoot, 'owned-compose');
  try {
    for (const directory of [
      dirname(helperPath),
      join(fixtureRoot, 'scripts'),
      join(fixtureRoot, 'reference/api/dist/reference/api/src'),
      composeRoot,
    ]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(helperPath, helperSource);
    assert.equal(readFileSync(helperPath, 'utf8'), helperSource);
    writeFileSync(preloadPath, ownedListenerCleanupPreloadSource());
    writeFileSync(join(fixtureRoot, 'scripts/verify-reference-api-build-inputs.mjs'), '');
    writeFileSync(join(fixtureRoot, 'reference/api/dist/reference/api/src/main.js'), '');
    writeFileSync(join(composeRoot, 'compose.yml'), 'services: {}\n');

    const child = spawnSync(
      process.execPath,
      ['--import', preloadPath, helperPath, ownedListenerOptIn],
      {
        cwd: fixtureRoot,
        encoding: 'utf8',
        timeout: 5_000,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: tmpdir(),
          D17_7_ACTIONS: actionsPath,
          STYNX_REFERENCE_API_STACK_COMPOSE_DIR: composeRoot,
        },
      },
    );
    assert.ifError(child.error);
    return {
      status: child.status,
      signal: child.signal,
      stdout: child.stdout ?? '',
      stderr: child.stderr ?? '',
      actions: existsSync(actionsPath)
        ? readFileSync(actionsPath, 'utf8').trim().split(/\r?\n/u).filter(Boolean)
        : [],
      leakedFixturePath:
        (child.stdout ?? '').includes(fixtureRoot) || (child.stderr ?? '').includes(fixtureRoot),
    };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    assert.equal(existsSync(fixtureRoot), false, 'D17.7 cleanup seam must always be removed');
  }
}

function boundedHelperFailureViolations(result, expectedCodes) {
  const governedLines = result.stderr
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(`${startupOutputPrefix} `));
  const ungovernedStderr = result.stderr
    .split(/\r?\n/u)
    .filter((line) => line.length > 0 && !line.startsWith(`${startupOutputPrefix} `));
  const violations = [];
  if (result.status === 0 || result.signal !== null) violations.push('nonzero-exit');
  if (result.stdout.length !== 0) violations.push('governed-stdout');
  if (ungovernedStderr.length !== 0) violations.push('raw-stderr');
  if (result.leakedFixturePath) violations.push('temporary-compose-path');
  if (!result.composeRemoved) violations.push('owned-compose-cleanup');
  if (governedLines.join('\n') !== expectedCodes.map(fixedStartupOutput).join('\n')) {
    violations.push('governed-phase-sequence');
  }
  if (
    [...result.stdout, ...ungovernedStderr].some((line) =>
      /(?:exception|error|stack|path|env|credential|token|secret|https?:|redis:|port|command|argument|argv)/iu.test(
        line,
      ),
    )
  ) {
    violations.push('raw-failure-payload');
  }
  return violations;
}

function runActualHelperFailureScenario(scenario) {
  assert.ok(['run-checked', 'redis-mapping'].includes(scenario));
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'stynx-d16-helper-fixture-'));
  const helperSource = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  const helperPath = join(fixtureRoot, 'reference/web/scripts/serve-reference-api-stack.mjs');
  const composeRoot = join(fixtureRoot, 'owned-compose');
  const fakeBin = join(fixtureRoot, 'bin');
  const dockerLog = join(fixtureRoot, 'docker-actions.log');
  try {
    for (const directory of [
      dirname(helperPath),
      composeRoot,
      fakeBin,
      join(fixtureRoot, 'scripts'),
    ]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(helperPath, helperSource);
    assert.equal(
      readFileSync(helperPath, 'utf8'),
      helperSource,
      'fixture must execute exact helper bytes',
    );
    writeFileSync(join(composeRoot, 'compose.yml'), 'services: {}\n');
    writeFileSync(
      join(fixtureRoot, 'scripts/verify-reference-api-build-inputs.mjs'),
      'process.exit(0);\n',
    );
    writeFileSync(
      join(fakeBin, 'docker'),
      `#!/bin/sh
case " $* " in
  *" up "*)
    printf '%s\\n' up >> "$D16_DOCKER_ACTIONS"
    ${scenario === 'run-checked' ? 'exit 23' : 'exit 0'}
    ;;
  *" port postgres 5432 "*)
    printf '%s\\n' port >> "$D16_DOCKER_ACTIONS"
    printf '%s\\n' 127.0.0.1:49151
    exit 0
    ;;
  *" port redis 6379 "*)
    printf '%s\\n' port >> "$D16_DOCKER_ACTIONS"
    printf '%s\\n' not-a-mapping
    exit 0
    ;;
  *" down "*)
    printf '%s\\n' down >> "$D16_DOCKER_ACTIONS"
    exit 0
    ;;
esac
exit 97
`,
    );
    chmodSync(join(fakeBin, 'docker'), 0o700);

    const child = spawnSync(process.execPath, [helperPath], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: `${fakeBin}:${process.env.PATH}`,
        HOME: process.env.HOME,
        TMPDIR: tmpdir(),
        D16_DOCKER_ACTIONS: dockerLog,
        STYNX_REFERENCE_API_STACK_COMPOSE_DIR: composeRoot,
      },
    });
    assert.ifError(child.error);
    const stdout = child.stdout ?? '';
    const stderr = child.stderr ?? '';
    return {
      status: child.status,
      signal: child.signal,
      stdout,
      stderr,
      dockerActions: existsSync(dockerLog)
        ? readFileSync(dockerLog, 'utf8').trim().split(/\r?\n/u)
        : [],
      composeRemoved: !existsSync(composeRoot),
      leakedFixturePath: stdout.includes(fixtureRoot) || stderr.includes(fixtureRoot),
    };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    assert.equal(existsSync(fixtureRoot), false, 'failure fixture must be removed on every exit');
  }
}

function remainingHelperSeamViolations(result, expected) {
  const governedLines = result.stderr
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(`${startupOutputPrefix} `));
  const ungovernedStderr = result.stderr
    .split(/\r?\n/u)
    .filter((line) => line.length > 0 && !line.startsWith(`${startupOutputPrefix} `));
  const violations = [];
  if (result.status === 0 || result.signal !== null) violations.push('nonzero-exit');
  if (result.stdout.length !== 0) violations.push('raw-stdout');
  if (ungovernedStderr.length !== 0) violations.push('raw-stderr');
  if (result.leakedFixturePath) violations.push('temporary-path-output');
  if (result.ownedComposePresent !== expected.ownedComposePresent) {
    violations.push('owned-compose-confinement');
  }
  const actionAlternatives = expected.actionAlternatives ?? [expected.actions];
  if (!actionAlternatives.some((actions) => result.actions.join(',') === actions.join(','))) {
    violations.push('seam-operation-sequence');
  }
  if (governedLines.join('\n') !== expected.codes.map(fixedStartupOutput).join('\n')) {
    violations.push('governed-phase-sequence');
  }
  if (new Set(governedLines).size !== governedLines.length) {
    violations.push('duplicate-governed-phase');
  }
  if (
    [...result.stdout, ...ungovernedStderr].some((line) =>
      /(?:exception|error|stack|path|env|credential|token|secret|https?:|redis:|port|command|argument|argv|compose\.yml)/iu.test(
        line,
      ),
    )
  ) {
    violations.push('raw-failure-payload');
  }
  return violations;
}

function helperSeamPreloadSource() {
  return String.raw`
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';

const scenario = process.env.D16_SCENARIO;
const actionsPath = process.env.D16_ACTIONS;
const rawText = 'unbounded exception stack /private/workstation env credential https://host:6379 command argument';
const action = (name) => fs.appendFileSync(actionsPath, name + '\n');
const later = (callback) => setImmediate(callback);
const syncCleanupScenario = [
  'sync-cleanup-output',
  'sync-cleanup-failure',
  'sync-cleanup-watchdog-only',
  'sync-cleanup-api-only',
].includes(scenario);
let watchdogSpawnObserved = false;
let apiSpawnEmitted = false;
let syncCleanupExitStarted = false;

function maybeExitSyncCleanup() {
  if (
    !syncCleanupScenario ||
    syncCleanupExitStarted ||
    !watchdogSpawnObserved ||
    !apiSpawnEmitted
  ) {
    return;
  }
  syncCleanupExitStarted = true;
  action('sync-exit');
  process.exit(31);
}

function observeWatchdogSpawn() {
  if (!syncCleanupScenario) return;
  if (watchdogSpawnObserved) return;
  watchdogSpawnObserved = true;
  action('watchdog-spawn-observed');
  maybeExitSyncCleanup();
}

function recordApiSpawnEmitted() {
  if (!syncCleanupScenario) return;
  if (apiSpawnEmitted) return;
  apiSpawnEmitted = true;
  action('api-spawn-emitted');
  maybeExitSyncCleanup();
}

process.on('uncaughtExceptionMonitor', () => action('uncaught'));

class SeamChild extends EventEmitter {
  constructor(pid = 41001, kind = 'operation') {
    super();
    this.pid = pid;
    this.kind = kind;
    this.exitCode = null;
    this.signalCode = null;
  }

  finish(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
  }

  kill(signal = 'SIGTERM') {
    if (scenario === 'child-kill-throw' && this.kind === 'api') throw new Error(rawText);
    if (this.exitCode === null && this.signalCode === null) this.signalCode = signal;
    return true;
  }

  unref() {}
}

if (scenario === 'compose-write-failure') {
  fs.promises.writeFile = async () => {
    throw new Error(rawText);
  };
}
if (scenario.endsWith('-rm-rejection')) {
  fs.promises.rm = async () => {
    throw new Error(rawText);
  };
}
if (scenario === 'watchdog-worker-rmsync-throw') {
  fs.rmSync = () => {
    throw new Error(rawText);
  };
}

childProcess.spawn = (command, args = [], options = {}) => {
  if (command === 'docker' && args.includes('up')) {
    action('up');
    const child = new SeamChild();
    later(() => child.finish(0));
    return child;
  }
  if (command === 'docker' && args.includes('down')) {
    action('down');
    if (scenario.endsWith('-compose-rejection')) throw new Error(rawText);
    const child = new SeamChild();
    later(() => child.finish(0));
    return child;
  }
  if (command === 'node' && String(args[0]).includes('verify-reference-api-build-inputs')) {
    action('verify');
    const child = new SeamChild();
    later(() => child.finish(scenario === 'build-verifier-failure' ? 19 : 0));
    return child;
  }
  if (command === 'node') {
    action('api');
    const child = new SeamChild(41001, 'api');
    later(() => {
      child.emit('spawn');
      if (scenario !== 'sync-cleanup-watchdog-only') recordApiSpawnEmitted();
      later(() => {
        if (scenario === 'child-raw-error') {
          process.stdout.write(rawText + '\n');
          process.stderr.write(rawText + '\n');
          child.emit('error', new Error(rawText));
          return;
        }
        if (scenario === 'child-kill-throw') {
          child.emit('error', new Error(rawText));
          return;
        }
        const match = /^child-(error|disconnect|exit)-(?:compose|rm)-rejection$/u.exec(scenario);
        if (!match) return;
        if (match[1] === 'error') child.emit('error', new Error(rawText));
        if (match[1] === 'disconnect') child.emit('disconnect');
        if (match[1] === 'exit') child.finish(29);
      });
    });
    return child;
  }
  if (command === process.execPath && options.env?.STYNX_REFERENCE_API_STACK_WATCHDOG === '1') {
    action('watchdog');
    if (scenario !== 'sync-cleanup-api-only') observeWatchdogSpawn();
    if (scenario === 'watchdog-spawn-failure') throw new Error(rawText);
    const child = new SeamChild(41002);
    if (scenario === 'watchdog-error') {
      later(() => child.emit('error', new Error(rawText)));
    }
    return child;
  }
  throw new Error(rawText);
};

childProcess.spawnSync = (command, args = []) => {
  if (command === 'docker' && args.includes('port')) {
    action('port');
    return { status: 0, signal: null, stdout: '127.0.0.1:49152\n', stderr: '' };
  }
  if (command === 'docker' && args.includes('down')) {
    action('sync-down');
    if (scenario === 'sync-cleanup-output') {
      process.stdout.write(rawText + '\n');
      process.stderr.write(rawText + '\n');
    }
    if (scenario === 'sync-cleanup-failure') {
      return { status: null, signal: null, error: new Error(rawText), stdout: '', stderr: '' };
    }
    return { status: 0, signal: null, stdout: '', stderr: '' };
  }
  return { status: 0, signal: null, stdout: '', stderr: '' };
};

syncBuiltinESMExports();
`;
}

function runRemainingHelperSeamScenario(scenario) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'stynx-d16-remaining-seams-'));
  const helperSource = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  const helperPath = join(fixtureRoot, 'reference/web/scripts/serve-reference-api-stack.mjs');
  const preloadPath = join(fixtureRoot, 'seam-preload.mjs');
  const actionsPath = join(fixtureRoot, 'actions.log');
  const composeRoot = join(fixtureRoot, 'owned-compose');
  const generatedComposeParent = join(fixtureRoot, 'generated-compose');
  const setupScenario = ['mkdtemp-failure', 'compose-write-failure'].includes(scenario);
  try {
    for (const directory of [
      dirname(helperPath),
      join(fixtureRoot, 'scripts'),
      join(fixtureRoot, 'reference/api/dist/reference/api/src'),
      generatedComposeParent,
      ...(setupScenario ? [] : [composeRoot]),
    ]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(helperPath, helperSource);
    assert.equal(
      readFileSync(helperPath, 'utf8'),
      helperSource,
      'fixture must execute exact helper bytes',
    );
    writeFileSync(preloadPath, helperSeamPreloadSource());
    writeFileSync(
      join(fixtureRoot, 'scripts/verify-reference-api-build-inputs.mjs'),
      'process.exit(0);\n',
    );
    writeFileSync(
      join(fixtureRoot, 'reference/api/dist/reference/api/src/main.js'),
      'process.exit(0);\n',
    );
    if (!setupScenario) writeFileSync(join(composeRoot, 'compose.yml'), 'services: {}\n');

    const child = spawnSync(process.execPath, ['--import', preloadPath, helperPath], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR:
          scenario === 'mkdtemp-failure'
            ? join(fixtureRoot, 'absent-temp-root')
            : generatedComposeParent,
        D16_ACTIONS: actionsPath,
        D16_SCENARIO: scenario,
        ...(setupScenario ? {} : { STYNX_REFERENCE_API_STACK_COMPOSE_DIR: composeRoot }),
        ...(scenario === 'empty-host' ? { TESTCONTAINERS_HOST_OVERRIDE: '' } : {}),
        ...(scenario === 'watchdog-worker-rmsync-throw'
          ? {
              STYNX_REFERENCE_API_STACK_WATCHDOG: '1',
              STYNX_REFERENCE_API_STACK_PARENT_PID: '2147483647',
            }
          : {}),
      },
    });
    assert.ifError(child.error);
    const stdout = child.stdout ?? '';
    const stderr = child.stderr ?? '';
    const generatedComposeDirectories = readdirSync(generatedComposeParent).filter((name) =>
      name.startsWith('stynx-reference-api-stack-'),
    );
    return {
      status: child.status,
      signal: child.signal,
      stdout,
      stderr,
      actions: existsSync(actionsPath)
        ? readFileSync(actionsPath, 'utf8').trim().split(/\r?\n/u).filter(Boolean)
        : [],
      ownedComposePresent: setupScenario
        ? generatedComposeDirectories.length > 0
        : existsSync(composeRoot),
      leakedFixturePath: stdout.includes(fixtureRoot) || stderr.includes(fixtureRoot),
    };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    assert.equal(existsSync(fixtureRoot), false, 'remaining-seam fixture must always be removed');
  }
}

test('D16 oracle accepts only the ordered fixed startup sequence and bounded failures', () => {
  const successCleanup = [];
  const successRecords = [];
  const success = startupOracle(
    (code) => successCleanup.push(code),
    (record) => successRecords.push(record),
  );
  for (const state of startupSuccessStates) {
    assert.deepEqual(success.message({ protocol: startupProtocol, state }), {
      accepted: true,
      state,
    });
  }
  assert.deepEqual(successCleanup, []);
  assert.deepEqual(
    successRecords,
    startupSuccessStates.map((state) => `${startupOutputPrefix} ${state}`),
  );
  assert.deepEqual(success.childTerminal('exit'), { accepted: true, state: 'already-listening' });

  for (const reason of startupFailureReasons) {
    const cleanup = [];
    const records = [];
    const oracle = startupOracle(
      (code) => cleanup.push(code),
      (record) => records.push(record),
    );
    assert.equal(
      oracle.message({ protocol: startupProtocol, state: 'bootstrap-entered' }).accepted,
      true,
    );
    if (reason !== 'nest-initialization') {
      assert.equal(
        oracle.message({ protocol: startupProtocol, state: 'nest-created' }).accepted,
        true,
      );
    }
    assert.deepEqual(
      oracle.message({ protocol: startupProtocol, state: 'bootstrap-failed', reason }),
      { accepted: true, state: 'bootstrap-failed', reason },
    );
    assert.deepEqual(cleanup, [`bootstrap-failed:${reason}`]);
    assert.equal(records.at(-1), `${startupOutputPrefix} bootstrap-failed:${reason}`);
    assert.equal(
      records.filter((record) => record === `${startupOutputPrefix} bootstrap-failed:${reason}`)
        .length,
      1,
    );
  }
});

test('D16 oracle rejects malformed, unknown, unbounded, duplicate, and out-of-order records', () => {
  const invalidRecords = [
    null,
    'bootstrap-entered',
    [],
    {},
    { protocol: 'unknown', state: 'bootstrap-entered' },
    { protocol: startupProtocol, state: 'unknown' },
    { protocol: startupProtocol, state: 'nest-created' },
    { protocol: startupProtocol, state: 'bootstrap-failed', reason: 'raw-error' },
    { protocol: startupProtocol, state: 'bootstrap-entered', error: 'raw' },
    { protocol: startupProtocol, state: 'bootstrap-entered', path: '/private/workstation' },
    { protocol: startupProtocol, state: 'bootstrap-entered', env: 'secret' },
    { protocol: startupProtocol, state: 'bootstrap-entered', credential: 'secret' },
    { protocol: startupProtocol, state: 'bootstrap-entered', url: 'scheme://host' },
    { protocol: startupProtocol, state: 'bootstrap-entered', port: 3000 },
    { protocol: startupProtocol, state: 'bootstrap-entered', command: 'node api' },
  ];
  for (const record of invalidRecords) {
    const cleanup = [];
    const records = [];
    const oracle = startupOracle(
      (code) => cleanup.push(code),
      (output) => records.push(output),
    );
    assert.equal(oracle.message(record).accepted, false);
    assert.equal(cleanup.length, 1);
    assert.deepEqual(records, []);
  }

  for (const duplicateOrOutOfOrder of [
    { protocol: startupProtocol, state: 'bootstrap-entered' },
    { protocol: startupProtocol, state: 'listening' },
  ]) {
    const cleanup = [];
    const oracle = startupOracle((code) => cleanup.push(code));
    assert.equal(
      oracle.message({ protocol: startupProtocol, state: 'bootstrap-entered' }).accepted,
      true,
    );
    assert.equal(oracle.message(duplicateOrOutOfOrder).accepted, false);
    assert.equal(cleanup.length, 1);
  }

  const terminalCleanup = [];
  const terminal = startupOracle((code) => terminalCleanup.push(code));
  for (const state of startupSuccessStates) {
    assert.equal(terminal.message({ protocol: startupProtocol, state }).accepted, true);
  }
  assert.equal(terminal.message({ protocol: startupProtocol, state: 'listening' }).accepted, false);
  assert.deepEqual(terminalCleanup, ['terminal-record']);
});

test('D16 oracle immediately confines child error, disconnect, and pre-listening exit', () => {
  for (const event of ['error', 'disconnect', 'exit']) {
    const cleanup = [];
    const records = [];
    const oracle = startupOracle(
      (code) => cleanup.push(code),
      (record) => records.push(record),
    );
    assert.equal(
      oracle.message({ protocol: startupProtocol, state: 'bootstrap-entered' }).accepted,
      true,
    );
    assert.deepEqual(oracle.childTerminal(event), { accepted: false, code: `child-${event}` });
    assert.deepEqual(cleanup, [`child-${event}`]);
    assert.equal(records.at(-1), `${startupOutputPrefix} child-${event}`);
    assert.equal(
      records.filter((record) => record === `${startupOutputPrefix} child-${event}`).length,
      1,
    );
  }
});

test('D16 import-order oracle loads runtime modules only after bootstrap-entered', () => {
  assertBootstrapBeforeRuntimeLoads(`
    import type { RuntimeShape } from './runtime-shape';
    async function bootstrap(): Promise<void> {
      emitStartupRecord({ protocol: startupProtocol, state: 'bootstrap-entered' });
      const runtime = await import('@nestjs/core');
      void runtime;
    }
  `);
  assert.throws(() =>
    assertBootstrapBeforeRuntimeLoads(`
      import { NestFactory } from '@nestjs/core';
      emitStartupRecord({ protocol: startupProtocol, state: 'bootstrap-entered' });
    `),
  );
  assert.throws(() =>
    assertBootstrapBeforeRuntimeLoads(`
      const runtime = await import('@nestjs/core');
      emitStartupRecord({ protocol: startupProtocol, state: 'bootstrap-entered' });
      void runtime;
    `),
  );
});

test('D16.1 fixture emits eight stderr-only success codes at exact operation boundaries', () => {
  const fixture = helperStartupFixture();
  assert.deepEqual(fixture.stdout, []);
  assert.deepEqual(fixture.stderr, []);
  fixture.start();
  assert.deepEqual(fixture.operations, ['compose-up']);
  assert.deepEqual(fixture.stderr, [fixedStartupOutput('helper-entered')]);
  fixture.resolveCompose();
  assert.equal(fixture.stderr.at(-1), fixedStartupOutput('compose-ready'));
  fixture.resolveRedisMapping();
  assert.equal(fixture.stderr.at(-1), fixedStartupOutput('redis-mapping-resolved'));
  fixture.resolveBuildInputs();
  assert.equal(fixture.stderr.at(-1), fixedStartupOutput('build-inputs-verified'));
  const beforeSpawnEvent = [...fixture.stderr];
  fixture.spawnCall();
  assert.deepEqual(fixture.stderr, beforeSpawnEvent);
  fixture.spawnEvent();
  assert.equal(fixture.stderr.at(-1), fixedStartupOutput('child-spawned'));
  for (const state of startupSuccessStates) {
    assert.equal(fixture.ipc({ protocol: startupProtocol, state }).accepted, true);
  }
  assert.deepEqual(fixture.stdout, []);
  assert.deepEqual(
    fixture.stderr,
    [...helperSuccessStates, ...startupSuccessStates].map(fixedStartupOutput),
  );
  assert.equal(new Set(fixture.stderr).size, 8);
});

test('D16.1 fixture cuts off once for all six bounded terminal alternatives', () => {
  for (const reason of startupFailureReasons) {
    const fixture = helperStartupFixture();
    advanceHelperToSpawn(fixture);
    assert.equal(
      fixture.ipc({ protocol: startupProtocol, state: 'bootstrap-entered' }).accepted,
      true,
    );
    if (reason !== 'nest-initialization') {
      assert.equal(
        fixture.ipc({ protocol: startupProtocol, state: 'nest-created' }).accepted,
        true,
      );
    }
    assert.equal(
      fixture.ipc({ protocol: startupProtocol, state: 'bootstrap-failed', reason }).accepted,
      true,
    );
    const terminal = fixedStartupOutput(`bootstrap-failed:${reason}`);
    assert.equal(fixture.stderr.at(-1), terminal);
    assert.equal(fixture.stderr.filter((line) => line === terminal).length, 1);
    assert.throws(() => fixture.ipc({ protocol: startupProtocol, state: 'listening' }));
    assert.deepEqual(fixture.stdout, []);
  }

  for (const event of ['error', 'disconnect', 'exit']) {
    const fixture = helperStartupFixture();
    advanceHelperToSpawn(fixture);
    const result = fixture.childTerminal(event);
    assert.deepEqual(result, { accepted: false, code: `child-${event}` });
    const terminal = fixedStartupOutput(`child-${event}`);
    assert.equal(fixture.stderr.at(-1), terminal);
    assert.equal(fixture.stderr.filter((line) => line === terminal).length, 1);
    assert.throws(() => fixture.ipc({ protocol: startupProtocol, state: 'bootstrap-entered' }));
    assert.deepEqual(fixture.stdout, []);
  }
});

test('D16.1 fixture fails closed without printing malformed or sensitive IPC payloads', () => {
  const invalidRecords = [
    null,
    { protocol: 'unknown', state: 'bootstrap-entered' },
    { protocol: startupProtocol, state: 'unknown' },
    { protocol: startupProtocol, state: 'nest-created' },
    { protocol: startupProtocol, state: 'bootstrap-entered', error: 'raw-secret' },
    { protocol: startupProtocol, state: 'bootstrap-entered', path: '/private/workstation' },
    { protocol: startupProtocol, state: 'bootstrap-entered', env: 'production' },
    { protocol: startupProtocol, state: 'bootstrap-entered', credential: 'token' },
    { protocol: startupProtocol, state: 'bootstrap-entered', url: 'scheme://host' },
    { protocol: startupProtocol, state: 'bootstrap-entered', port: 3000 },
    { protocol: startupProtocol, state: 'bootstrap-entered', command: 'node api' },
  ];
  for (const record of invalidRecords) {
    const fixture = helperStartupFixture();
    advanceHelperToSpawn(fixture);
    const before = [...fixture.stderr];
    assert.equal(fixture.ipc(record).accepted, false);
    assert.deepEqual(fixture.stderr, before);
    assert.deepEqual(fixture.stdout, []);
    assert.doesNotMatch(
      fixture.stderr.join('\n'),
      /raw-secret|private|workstation|production|credential|token|scheme|host|3000|node api/iu,
    );
  }

  const duplicate = helperStartupFixture();
  advanceHelperToSpawn(duplicate);
  assert.equal(
    duplicate.ipc({ protocol: startupProtocol, state: 'bootstrap-entered' }).accepted,
    true,
  );
  const beforeDuplicate = [...duplicate.stderr];
  assert.equal(
    duplicate.ipc({ protocol: startupProtocol, state: 'bootstrap-entered' }).accepted,
    false,
  );
  assert.deepEqual(duplicate.stderr, beforeDuplicate);
  assert.throws(() => duplicate.ipc({ protocol: startupProtocol, state: 'nest-created' }));
});

test('D16.1 pre-child failure oracle rejects cleanup, phase, and raw-output escapes', () => {
  const safe = {
    status: 1,
    signal: null,
    stdout: '',
    stderr: `${fixedStartupOutput('helper-entered')}\n`,
    composeRemoved: true,
    leakedFixturePath: false,
  };
  assert.deepEqual(boundedHelperFailureViolations(safe, ['helper-entered']), []);
  assert.deepEqual(
    boundedHelperFailureViolations(
      {
        ...safe,
        stdout: 'raw command argument',
        stderr: `${safe.stderr}Error: /private/owned-compose/compose.yml\n`,
        composeRemoved: false,
        leakedFixturePath: true,
      },
      ['helper-entered', 'compose-ready'],
    ).sort(),
    [
      'governed-phase-sequence',
      'governed-stdout',
      'owned-compose-cleanup',
      'raw-failure-payload',
      'raw-stderr',
      'temporary-compose-path',
    ],
  );
});

test('D16.1 production contains runChecked and Redis mapping failures before child spawn', () => {
  const scenarios = [
    {
      name: 'run-checked',
      expectedCodes: ['helper-entered', 'compose-up-exit-nonzero'],
      expectedDockerActions: ['up', 'down'],
    },
    {
      name: 'redis-mapping',
      expectedCodes: ['helper-entered', 'compose-ready'],
      expectedDockerActions: ['up', 'port', 'port', 'down'],
    },
  ];
  const violations = [];
  for (const scenario of scenarios) {
    const result = runActualHelperFailureScenario(scenario.name);
    if (result.dockerActions.join(',') !== scenario.expectedDockerActions.join(',')) {
      violations.push(`${scenario.name}:confined-owned-cleanup`);
    }
    violations.push(
      ...boundedHelperFailureViolations(result, scenario.expectedCodes).map(
        (violation) => `${scenario.name}:${violation}`,
      ),
    );
  }
  assert.deepEqual(violations, []);
});

test('D16.1 remaining-seam oracle consumes failures and rejects every raw channel', () => {
  const expected = {
    codes: ['helper-entered'],
    actions: ['up', 'down'],
    ownedComposePresent: false,
  };
  const safe = {
    status: 1,
    signal: null,
    stdout: '',
    stderr: `${fixedStartupOutput('helper-entered')}\n`,
    actions: ['up', 'down'],
    ownedComposePresent: false,
    leakedFixturePath: false,
  };
  assert.deepEqual(remainingHelperSeamViolations(safe, expected), []);
  const violations = remainingHelperSeamViolations(
    {
      ...safe,
      status: 0,
      stdout: 'unbounded command argument',
      stderr: `${safe.stderr}${safe.stderr}Error: /private/compose.yml\n`,
      actions: ['up'],
      ownedComposePresent: true,
      leakedFixturePath: true,
    },
    expected,
  );
  assert.deepEqual([...new Set(violations)].sort(), [
    'duplicate-governed-phase',
    'governed-phase-sequence',
    'nonzero-exit',
    'owned-compose-confinement',
    'raw-failure-payload',
    'raw-stderr',
    'raw-stdout',
    'seam-operation-sequence',
    'temporary-path-output',
  ]);
});

test('D16.1 production contains every remaining setup, child, watchdog, and cleanup seam', () => {
  const helperCodes = [
    'helper-entered',
    'compose-ready',
    'redis-mapping-resolved',
    'build-inputs-verified',
    'child-spawned',
  ];
  const throughVerifier = helperCodes.slice(0, 3);
  const throughBuild = helperCodes.slice(0, 4);
  const throughChild = helperCodes;
  const childActions = ['up', 'port', 'port', 'verify', 'api', 'watchdog'];
  const syncCleanupActions = [
    ...childActions,
    'watchdog-spawn-observed',
    'api-spawn-emitted',
    'sync-exit',
    'sync-down',
  ];
  const scenarios = [
    { name: 'mkdtemp-failure', codes: [], actions: [] },
    { name: 'compose-write-failure', codes: [], actions: [] },
    { name: 'empty-host', codes: [], actions: [] },
    {
      name: 'build-verifier-failure',
      codes: throughVerifier,
      actions: ['up', 'port', 'port', 'verify', 'down'],
    },
    {
      name: 'child-raw-error',
      codes: [...throughChild, 'child-error'],
      actions: [...childActions, 'down'],
    },
    {
      name: 'watchdog-spawn-failure',
      codes: throughBuild,
      actions: childActions,
    },
    {
      name: 'watchdog-error',
      codes: throughChild,
      actions: [...childActions, 'sync-down'],
    },
    ...['error', 'disconnect', 'exit'].flatMap((event) => [
      {
        name: `child-${event}-compose-rejection`,
        codes: [...throughChild, `child-${event}`],
        actions: [...childActions, 'down', 'sync-down'],
      },
      {
        name: `child-${event}-rm-rejection`,
        codes: [...throughChild, `child-${event}`],
        actions: [...childActions, 'down', 'sync-down'],
      },
    ]),
    {
      name: 'sync-cleanup-output',
      codes: throughChild,
      actions: syncCleanupActions,
    },
    {
      name: 'sync-cleanup-failure',
      codes: throughChild,
      actions: syncCleanupActions,
    },
  ];
  assert.equal(scenarios.length, 15);
  const violations = [];
  for (const scenario of scenarios) {
    const result = runRemainingHelperSeamScenario(scenario.name);
    violations.push(
      ...remainingHelperSeamViolations(result, {
        ...scenario,
        ownedComposePresent: false,
      }).map((violation) => `${scenario.name}:${violation}`),
    );
  }
  assert.deepEqual(violations, []);
});

test('D16.1 lifecycle-seam oracle distinguishes consumed failures from silenced escalation', () => {
  const preloadSource = helperSeamPreloadSource();
  const controlSource = runRemainingHelperSeamScenario.toString();
  assert.doesNotMatch(preloadSource, /\bsetTimeout\s*\(/u);
  assert.doesNotMatch(controlSource, /\bsetTimeout\s*\(/u);
  assert.equal((controlSource.match(/timeout:\s*5_000/gu) ?? []).length, 1);
  assert.match(
    preloadSource,
    /child\.emit\('spawn'\);\s*if \(scenario !== 'sync-cleanup-watchdog-only'\) recordApiSpawnEmitted\(\)/u,
  );

  const prerequisiteControls = [
    {
      name: 'sync-cleanup-watchdog-only',
      requiredAction: 'watchdog-spawn-observed',
      forbiddenAction: 'api-spawn-emitted',
    },
    {
      name: 'sync-cleanup-api-only',
      requiredAction: 'api-spawn-emitted',
      forbiddenAction: 'watchdog-spawn-observed',
    },
  ];
  for (const control of prerequisiteControls) {
    const result = runRemainingHelperSeamScenario(control.name);
    assert.equal(result.status, 0);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, '');
    assert.deepEqual(
      result.stderr.trim().split(/\r?\n/u),
      helperSuccessStates.map(fixedStartupOutput),
    );
    assert.equal(result.actions.filter((action) => action === control.requiredAction).length, 1);
    assert.equal(result.actions.includes(control.forbiddenAction), false);
    assert.equal(result.actions.includes('sync-exit'), false);
    assert.equal(result.actions.at(-1), 'down');
    assert.equal(result.ownedComposePresent, false);
    assert.equal(result.leakedFixturePath, false);
  }

  const workerExpected = {
    codes: [],
    actions: ['sync-down'],
    ownedComposePresent: true,
  };
  const workerSafe = {
    status: 1,
    signal: null,
    stdout: '',
    stderr: '',
    actions: ['sync-down'],
    ownedComposePresent: true,
    leakedFixturePath: false,
  };
  assert.deepEqual(remainingHelperSeamViolations(workerSafe, workerExpected), []);
  assert.deepEqual(
    remainingHelperSeamViolations(
      { ...workerSafe, actions: ['sync-down', 'uncaught'] },
      workerExpected,
    ),
    ['seam-operation-sequence'],
  );

  const childCodes = [...helperSuccessStates, 'child-error'];
  const childActions = ['up', 'port', 'verify', 'api', 'watchdog'];
  assert.deepEqual(
    remainingHelperSeamViolations(
      {
        ...workerSafe,
        stderr: `${childCodes.map(fixedStartupOutput).join('\n')}\n`,
        actions: [...childActions, 'down'],
        ownedComposePresent: false,
      },
      {
        codes: childCodes,
        actions: [...childActions, 'down'],
        actionAlternatives: [
          [...childActions, 'down'],
          [...childActions, 'sync-down'],
        ],
        ownedComposePresent: false,
      },
    ),
    [],
  );
});

test('D16.1 production contains watchdog-worker rmSync and shutdown child-kill throws', () => {
  const childActions = ['up', 'port', 'port', 'verify', 'api', 'watchdog'];
  const scenarios = [
    {
      name: 'watchdog-worker-rmsync-throw',
      codes: [],
      actions: ['sync-down'],
      ownedComposePresent: true,
    },
    {
      name: 'child-kill-throw',
      codes: [...helperSuccessStates, 'child-error'],
      actions: [...childActions, 'down'],
      actionAlternatives: [
        [...childActions, 'down'],
        [...childActions, 'sync-down'],
      ],
      ownedComposePresent: false,
    },
  ];
  const violations = [];
  for (const scenario of scenarios) {
    const result = runRemainingHelperSeamScenario(scenario.name);
    violations.push(
      ...remainingHelperSeamViolations(result, scenario).map(
        (violation) => `${scenario.name}:${violation}`,
      ),
    );
  }
  assert.deepEqual(violations, []);
});

test('D17 starts only on listening and classifies each HTTP status exactly once in order', () => {
  const cases = [
    {
      healthStatus: 204,
      readyStatus: 204,
      expected: ['healthz-2xx', 'readyz-2xx'],
    },
    {
      healthStatus: 500,
      readyStatus: 404,
      expected: ['healthz-non2xx', 'readyz-404'],
    },
    {
      healthStatus: 204,
      readyStatus: 418,
      expected: ['healthz-2xx', 'readyz-other'],
    },
  ];
  const observed = new Set();
  for (const scenario of cases) {
    const fixture = readinessDiagnosticFixture();
    startReadinessDiagnostic(fixture);
    assert.deepEqual(fixture.snapshot().requestCounts, { healthz: 1, readyz: 0 });
    assert.deepEqual(
      fixture.response('healthz', { kind: 'response', status: scenario.healthStatus }),
      { accepted: true, classified: false },
    );
    assert.deepEqual(fixture.snapshot().requests, ['GET healthz', 'GET readyz']);
    assert.deepEqual(fixture.snapshot().requestCounts, { healthz: 1, readyz: 1 });
    assert.deepEqual(
      fixture.response('readyz', { kind: 'response', status: scenario.readyStatus }),
      { accepted: true, outcome: { classifications: scenario.expected } },
    );
    const completed = fixture.snapshot();
    assert.deepEqual(completed.outcome, { classifications: scenario.expected });
    assert.deepEqual(completed.requests, []);
    assert.deepEqual(completed.cleanupTargets, ['owned-d17-diagnostic']);
    for (const classification of scenario.expected) observed.add(classification);
    assert.deepEqual(fixture.response('readyz', { kind: 'response', status: 204 }), {
      accepted: false,
    });
    assert.deepEqual(fixture.snapshot(), completed);
  }
  assert.deepEqual([...observed].sort(), [
    'healthz-2xx',
    'healthz-non2xx',
    'readyz-2xx',
    'readyz-404',
    'readyz-other',
  ]);
});

test('D17 maps either connection terminal to only fixed connect-failed outcomes', () => {
  const healthFailure = readinessDiagnosticFixture();
  startReadinessDiagnostic(healthFailure);
  assert.deepEqual(healthFailure.response('healthz', { kind: 'connect-failed' }), {
    accepted: true,
    classified: false,
  });
  assert.deepEqual(healthFailure.snapshot().requests, ['GET healthz', 'GET readyz']);
  assert.deepEqual(healthFailure.response('readyz', { kind: 'response', status: 204 }), {
    accepted: true,
    outcome: { classifications: ['connect-failed'] },
  });
  assert.deepEqual(healthFailure.snapshot().cleanupTargets, ['owned-d17-diagnostic']);

  const readyFailure = readinessDiagnosticFixture();
  startReadinessDiagnostic(readyFailure);
  assert.deepEqual(readyFailure.response('healthz', { kind: 'response', status: 204 }), {
    accepted: true,
    classified: false,
  });
  assert.deepEqual(readyFailure.response('readyz', { kind: 'connect-failed' }), {
    accepted: true,
    outcome: { classifications: ['healthz-2xx', 'connect-failed'] },
  });
  assert.deepEqual(readyFailure.snapshot().requestCounts, { healthz: 1, readyz: 1 });
  assert.deepEqual(readyFailure.snapshot().cleanupTargets, ['owned-d17-diagnostic']);
});

test('D17 readyz-503 retains only canonical allowlisted boolean indicator projections', () => {
  const fixture = readinessDiagnosticFixture();
  startReadinessDiagnostic(fixture);
  assert.deepEqual(fixture.response('healthz', { kind: 'response', status: 200 }), {
    accepted: true,
    classified: false,
  });
  const indicators = [
    { name: 's3', passing: true },
    { name: 'postgres', passing: false },
    { name: 'jwks', passing: true },
    { name: 'redis', passing: false },
  ];
  assert.deepEqual(fixture.response('readyz', { kind: 'response', status: 503, indicators }), {
    accepted: true,
    outcome: {
      classifications: ['healthz-2xx', 'readyz-503'],
      indicators: [
        { name: 'postgres', passing: false },
        { name: 'redis', passing: false },
        { name: 'jwks', passing: true },
        { name: 's3', passing: true },
      ],
    },
  });
  const completed = fixture.snapshot();
  assert.deepEqual(completed.requests, []);
  assert.deepEqual(completed.requestCounts, { healthz: 1, readyz: 1 });
  assert.deepEqual(completed.cleanupTargets, ['owned-d17-diagnostic']);
  assert.deepEqual(
    completed.outcome.indicators.map(({ name }) => name),
    readinessIndicatorNames,
  );
  assert.equal(
    completed.outcome.indicators.every(({ passing }) => typeof passing === 'boolean'),
    true,
  );
});

test('D17 rejects malformed or raw readiness material without retaining it', () => {
  const invalidEvents = [
    null,
    { kind: 'response' },
    { kind: 'response', status: 0 },
    { kind: 'response', status: 503 },
    { kind: 'response', status: 503, indicators: [] },
    { kind: 'response', status: 503, indicators: [{ name: 'unknown', passing: false }] },
    {
      kind: 'response',
      status: 503,
      indicators: [
        { name: 'redis', passing: false },
        { name: 'redis', passing: true },
      ],
    },
    { kind: 'response', status: 503, indicators: [{ name: 'redis', passing: 'false' }] },
    { kind: 'response', status: 503, indicators: [{ passing: false }] },
    { kind: 'response', status: 503, indicators: [{ name: 'redis' }] },
    { kind: 'response', status: 503, indicators: [{ name: 'redis', passing: false, body: 'x' }] },
    { kind: 'response', status: 204, body: 'raw-body' },
    { kind: 'connect-failed', error: 'raw-error' },
    { kind: 'response', status: 204, url: 'http://127.0.0.1:3000/readyz' },
    { kind: 'response', status: 204, port: 3000 },
    { kind: 'response', status: 204, path: '/private/workstation' },
    { kind: 'response', status: 204, env: 'production' },
    { kind: 'response', status: 204, credential: 'secret' },
  ];
  for (const event of invalidEvents) {
    const fixture = readinessDiagnosticFixture();
    startReadinessDiagnostic(fixture);
    assert.deepEqual(fixture.response('healthz', { kind: 'response', status: 204 }), {
      accepted: true,
      classified: false,
    });
    assert.deepEqual(fixture.response('readyz', event), { accepted: false });
    const rejected = fixture.snapshot();
    assert.equal(rejected.state, 'stopped');
    assert.deepEqual(rejected.requestCounts, { healthz: 1, readyz: 1 });
    assert.equal(rejected.outcome, undefined);
    assert.deepEqual(rejected.cleanupTargets, ['owned-d17-diagnostic']);
    assert.doesNotMatch(
      JSON.stringify(rejected),
      /raw|unknown|127\.0\.0\.1|3000|private|workstation|production|credential|secret/iu,
    );
  }

  const outOfOrder = readinessDiagnosticFixture();
  assert.deepEqual(outOfOrder.response('readyz', { kind: 'response', status: 204 }), {
    accepted: false,
  });
  assert.deepEqual(outOfOrder.snapshot().requests, []);
  assert.deepEqual(outOfOrder.snapshot().cleanupTargets, ['owned-d17-diagnostic']);

  const duplicateListening = readinessDiagnosticFixture();
  startReadinessDiagnostic(duplicateListening);
  assert.deepEqual(duplicateListening.phase(fixedStartupOutput('listening')), {
    accepted: false,
  });
  assert.deepEqual(duplicateListening.snapshot().requestCounts, { healthz: 1, readyz: 0 });
  assert.deepEqual(duplicateListening.snapshot().cleanupTargets, ['owned-d17-diagnostic']);

  const source = `${readinessDiagnosticFixture}\n${startReadinessDiagnostic}`;
  assert.doesNotMatch(source, /\b(?:setTimeout|setInterval|sleep|retry|poll)\s*\(/iu);
  assert.doesNotMatch(source, /\btimeout\b/iu);
});

test('D17.6 route-table oracle records one exact post-listening outcome', () => {
  assert.deepEqual(governedRuntimeRoutes, [
    'GET /healthz',
    'GET /readyz',
    'GET /_reference/demo-tenants',
  ]);
  const expectedPhases = [...helperSuccessStates, ...startupSuccessStates].map(fixedStartupOutput);
  for (const outcome of runtimeRouteTableStates) {
    const fixture = runtimeRouteTableFixture();
    assert.deepEqual(fixture.snapshot(), {
      stdout: [],
      stderr: [],
      cleanupTargets: [],
      nextPhase: 0,
      state: 'phases',
      acceptedRouteState: undefined,
    });
    advanceRuntimeRouteTableFixture(fixture);
    assert.deepEqual(fixture.snapshot().stderr, expectedPhases);
    assert.equal(fixture.snapshot().state, 'await-route-table');
    assert.deepEqual(fixture.ipc({ protocol: startupProtocol, state: outcome }), {
      accepted: true,
      state: outcome,
    });
    assert.deepEqual(fixture.snapshot().stderr, [...expectedPhases, fixedStartupOutput(outcome)]);
    assert.deepEqual(fixture.snapshot().stdout, []);
    assert.deepEqual(fixture.snapshot().cleanupTargets, []);
    assert.deepEqual(fixture.childTerminal('exit'), { accepted: true, state: outcome });
    assert.deepEqual(fixture.snapshot().cleanupTargets, ['owned-d17-route-table-fixture']);
    assert.equal(
      fixture.snapshot().stderr.filter((line) => line === fixedStartupOutput(outcome)).length,
      1,
    );
  }
});

test('D17.6 route-table oracle fails closed on every invalid message and child terminal', () => {
  const early = runtimeRouteTableFixture();
  for (const code of [...helperSuccessStates, ...startupSuccessStates].slice(0, -1)) {
    assert.equal(early.phase(code).accepted, true);
  }
  assert.deepEqual(early.ipc({ protocol: startupProtocol, state: runtimeRouteTableStates[0] }), {
    accepted: false,
    reason: 'early-route-table',
  });
  assert.deepEqual(early.snapshot().cleanupTargets, ['owned-d17-route-table-fixture']);
  assert.equal(
    early.snapshot().stderr.some((line) => /runtime-route-table/u.test(line)),
    false,
  );

  const invalidRecords = [
    null,
    [],
    'runtime-route-table-present',
    { state: 'runtime-route-table-present' },
    { protocol: 'unknown-protocol', state: 'runtime-route-table-present' },
    { protocol: startupProtocol, state: 'unknown-route-table' },
    { protocol: startupProtocol, state: 'runtime-route-table-present', route: '/healthz' },
    { protocol: startupProtocol, state: 'runtime-route-table-absent', table: 'raw-table' },
    { protocol: startupProtocol, state: 'runtime-route-table-indeterminate', error: 'raw-error' },
    { protocol: startupProtocol, state: 'runtime-route-table-present', address: '127.0.0.1' },
    { protocol: startupProtocol, state: 'runtime-route-table-present', port: 3000 },
    { protocol: startupProtocol, state: 'runtime-route-table-present', env: 'production' },
    { protocol: startupProtocol, state: 'runtime-route-table-present', credential: 'secret' },
  ];
  for (const record of invalidRecords) {
    const fixture = runtimeRouteTableFixture();
    advanceRuntimeRouteTableFixture(fixture);
    assert.equal(fixture.ipc(record).accepted, false);
    const snapshot = fixture.snapshot();
    assert.deepEqual(snapshot.cleanupTargets, ['owned-d17-route-table-fixture']);
    assert.equal(
      snapshot.stderr.some((line) => /runtime-route-table/u.test(line)),
      false,
    );
    assert.doesNotMatch(
      JSON.stringify(snapshot),
      /(?:raw-table|raw-error|127\.0\.0\.1|production|secret|\/healthz)/u,
    );
  }

  const duplicate = runtimeRouteTableFixture();
  advanceRuntimeRouteTableFixture(duplicate);
  assert.equal(
    duplicate.ipc({ protocol: startupProtocol, state: runtimeRouteTableStates[0] }).accepted,
    true,
  );
  assert.deepEqual(
    duplicate.ipc({ protocol: startupProtocol, state: runtimeRouteTableStates[0] }),
    { accepted: false, reason: 'duplicate-route-table' },
  );
  assert.equal(
    duplicate
      .snapshot()
      .stderr.filter((line) => line === fixedStartupOutput(runtimeRouteTableStates[0])).length,
    1,
  );
  assert.deepEqual(duplicate.snapshot().cleanupTargets, ['owned-d17-route-table-fixture']);

  for (const event of ['error', 'disconnect', 'exit']) {
    const fixture = runtimeRouteTableFixture();
    advanceRuntimeRouteTableFixture(fixture);
    assert.deepEqual(fixture.childTerminal(event), {
      accepted: false,
      reason: 'child-without-route-table',
    });
    assert.deepEqual(fixture.snapshot().stderr.slice(-1), [fixedStartupOutput(`child-${event}`)]);
    assert.deepEqual(fixture.snapshot().cleanupTargets, ['owned-d17-route-table-fixture']);
  }

  const outOfOrder = runtimeRouteTableFixture();
  assert.deepEqual(outOfOrder.phase('compose-ready'), {
    accepted: false,
    reason: 'phase-order',
  });
  assert.deepEqual(outOfOrder.snapshot().cleanupTargets, ['owned-d17-route-table-fixture']);
  const source = `${runtimeRouteTableFixture}\n${advanceRuntimeRouteTableFixture}`;
  assert.doesNotMatch(source, /\b(?:setTimeout|setInterval|sleep|retry|poll)\s*\(/iu);
  assert.doesNotMatch(source, /\b(?:process\.env|fetch|request|listen|connect)\b/iu);
});

test('D17.6 production binds one IPC-only live route-table state after listening', () => {
  const main = readFileSync(join(repoRoot, 'reference/api/src/main.ts'), 'utf8');
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  const healthController = readFileSync(
    join(repoRoot, 'packages/health/src/health.controller.ts'),
    'utf8',
  );
  const referenceController = readFileSync(
    join(repoRoot, 'reference/api/src/sample/reference-dev-auth.controller.ts'),
    'utf8',
  );
  assert.equal((healthController.match(/@Get\('\/healthz'\)/gu) ?? []).length, 1);
  assert.equal((healthController.match(/@Get\('\/readyz'\)/gu) ?? []).length, 1);
  assert.match(referenceController, /@Controller\('\/_reference'\)/u);
  assert.equal((referenceController.match(/@Get\('\/demo-tenants'\)/gu) ?? []).length, 1);

  const mainBindingPresent =
    main.includes(runtimeRouteTableBegin) &&
    main.includes(runtimeRouteTableEnd) &&
    runtimeRouteTableStates.every((state) => main.includes(`'${state}'`));
  assert.equal(
    mainBindingPresent,
    true,
    'D17.6 main runtime route-table inspection is not implemented',
  );
  const inspectionBegin = main.indexOf(runtimeRouteTableBegin);
  const inspectionEnd = main.indexOf(runtimeRouteTableEnd, inspectionBegin);
  const inspection = main.slice(inspectionBegin, inspectionEnd);
  const listeningIndex = main.indexOf("state: 'listening'");
  assert.ok(inspectionBegin > listeningIndex);
  assert.deepEqual(
    governedRuntimeRoutes.filter((route) => inspection.includes(route)),
    governedRuntimeRoutes,
  );
  assert.match(inspection, /(?:getHttpAdapter|getInstance|httpAdapter)/u);
  assert.match(inspection, /process\.send|emitStartupRecord/u);
  assert.doesNotMatch(inspection, /console\.(?:log|error)|process\.env|\b(?:fetch|request)\s*\(/u);

  const helperBindingPresent = runtimeRouteTableStates.every((state) =>
    helper.includes(`'${state}'`),
  );
  assert.equal(
    helperBindingPresent,
    true,
    'D17.6 helper runtime route-table acceptance is not implemented',
  );
  const helperListeningIndex = helper.indexOf("'listening'");
  const helperRouteIndex = Math.min(
    ...runtimeRouteTableStates.map((state) => helper.indexOf(`'${state}'`)),
  );
  assert.ok(helperRouteIndex > helperListeningIndex);
  assert.match(helper, /console\.error\(\s*`\$\{startupOutputPrefix\} \$\{code\}`\s*\)/u);
  assert.doesNotMatch(
    helper,
    /runtime-route-table[^;\n]*(?:route|table|error|address|host|port|env|credential|url|path)/iu,
  );
});

test('D17.7 CLI oracle keeps default HTTP-free and admits only one exact opt-in', () => {
  const exactPrefix = new RegExp(
    `^${escapeRegExpLiteral(ownedListenerOutputPrefix)} owned-healthz-2xx$`,
    'u',
  );
  assert.match(`${ownedListenerOutputPrefix} owned-healthz-2xx`, exactPrefix);
  for (const nearMiss of [
    '[reference-api-owned-route owned-healthz-2xx',
    '[reference-api-owned-routE] owned-healthz-2xx',
    '[reference-api-owned-route]] owned-healthz-2xx',
    `raw ${ownedListenerOutputPrefix} owned-healthz-2xx`,
  ]) {
    assert.doesNotMatch(nearMiss, exactPrefix);
  }
  const normal = ownedListenerDiagnosticFixture([], true);
  assert.deepEqual(normal.start(), { accepted: true, diagnostic: false });
  assert.deepEqual(normal.routeTable('runtime-route-table-present'), {
    accepted: true,
    diagnostic: false,
  });
  const normalSnapshot = normal.snapshot();
  assert.deepEqual(normalSnapshot.attemptedSlots, []);
  assert.deepEqual(normalSnapshot.slotCodes, []);
  assert.equal(
    normalSnapshot.stderr.some((line) => line.startsWith(`${ownedListenerOutputPrefix} `)),
    false,
  );
  assert.deepEqual(normalSnapshot.controls, {
    inheritedControlStripped: true,
    internalControlSetByCliOnly: false,
    childUsesFixedDiagnosticBinding: false,
    requesterUsesFixedDiagnosticBinding: false,
    bindingConsistent: true,
  });

  const diagnostic = ownedListenerDiagnosticFixture([ownedListenerOptIn], true);
  assert.deepEqual(diagnostic.start(), { accepted: true, diagnostic: true });
  assert.deepEqual(diagnostic.snapshot().attemptedSlots, []);
  assert.deepEqual(diagnostic.snapshot().controls, {
    inheritedControlStripped: true,
    internalControlSetByCliOnly: true,
    childUsesFixedDiagnosticBinding: true,
    requesterUsesFixedDiagnosticBinding: true,
    bindingConsistent: true,
  });

  const rejectedArgs = [
    ['--unknown'],
    [ownedListenerOptIn, ownedListenerOptIn],
    [ownedListenerOptIn, '--additional'],
    [`${ownedListenerOptIn}=1`],
    ['d17-owned-route-classifier'],
    ['', ownedListenerOptIn],
  ];
  for (const args of rejectedArgs) {
    const fixture = ownedListenerDiagnosticFixture(args, true);
    const rejected = fixture.snapshot();
    assert.equal(rejected.exitCode, 1);
    assert.equal(rejected.state, 'rejected');
    assert.deepEqual(rejected.operations, []);
    assert.deepEqual(rejected.attemptedSlots, []);
    assert.deepEqual(rejected.cleanupTargets, []);
    assert.deepEqual(rejected.stdout, []);
    assert.deepEqual(rejected.stderr, []);
    assert.doesNotMatch(JSON.stringify(rejected), /unknown|additional|classifier=|argument|argv/iu);
  }
});

test('D17.7 route-table oracle requests only after one exact present state', () => {
  for (const routeState of ['runtime-route-table-absent', 'runtime-route-table-indeterminate']) {
    const fixture = ownedListenerDiagnosticFixture([ownedListenerOptIn], true);
    assert.deepEqual(fixture.start(), { accepted: true, diagnostic: true });
    assert.deepEqual(fixture.routeTable(routeState), { accepted: false });
    const stopped = fixture.snapshot();
    assert.deepEqual(stopped.attemptedSlots, []);
    assert.deepEqual(stopped.slotCodes, []);
    assert.deepEqual(stopped.cleanupTargets, ['owned-d17-7-fixture']);
    assert.equal(stopped.exitCode, 1);
  }

  const present = ownedListenerDiagnosticFixture([ownedListenerOptIn], true);
  assert.deepEqual(present.start(), { accepted: true, diagnostic: true });
  assert.deepEqual(present.routeTable('runtime-route-table-present'), {
    accepted: true,
    slot: 'health',
  });
  assert.deepEqual(present.snapshot().attemptedSlots, ['health']);
  assert.deepEqual(present.snapshot().slotCodes, []);
  assert.deepEqual(present.snapshot().cleanupTargets, []);
  assert.deepEqual(present.routeTable('runtime-route-table-present'), { accepted: false });
  assert.deepEqual(present.snapshot().cleanupTargets, ['owned-d17-7-fixture']);
});

test('D17.7 classifier oracle emits every slot class and exact final mapping', () => {
  const response = (status) => ({ kind: 'response', status });
  const connect = { kind: 'connect-failed' };
  const present = runOwnedListenerResponses([
    response(204),
    response(503),
    response(200),
    response(404),
  ]);
  assert.deepEqual(present.attemptedSlots, ownedListenerSlots);
  assert.deepEqual(present.slotCodes, [
    'owned-healthz-2xx',
    'owned-readyz-503',
    'owned-api-local-2xx',
    'owned-sentinel-404',
  ]);
  assert.equal(present.stderr.at(-1), `${ownedListenerOutputPrefix} owned-full-table-present`);
  assert.equal(present.discardedStreams, 4);
  assert.deepEqual(present.cleanupTargets, ['owned-d17-7-fixture']);

  const absent = runOwnedListenerResponses([
    response(404),
    response(404),
    response(404),
    response(404),
  ]);
  assert.equal(absent.stderr.at(-1), `${ownedListenerOutputPrefix} owned-full-table-absent`);
  const indeterminate = runOwnedListenerResponses([
    response(500),
    response(200),
    response(404),
    response(500),
  ]);
  assert.equal(
    indeterminate.stderr.at(-1),
    `${ownedListenerOutputPrefix} owned-full-table-indeterminate`,
  );

  const slotCases = {
    health: [response(200), response(404), response(500), connect],
    readiness: [response(200), response(404), response(503), response(500), connect],
    'api-local': [response(200), response(404), response(500), connect],
    sentinel: [response(404), response(500), connect],
  };
  const observed = new Set();
  for (const [targetSlot, events] of Object.entries(slotCases)) {
    for (const targetEvent of events) {
      const scenario = [response(200), response(200), response(200), response(404)];
      scenario[ownedListenerSlots.indexOf(targetSlot)] = targetEvent;
      const snapshot = runOwnedListenerResponses(scenario);
      assert.deepEqual(snapshot.attemptedSlots, ownedListenerSlots);
      assert.equal(snapshot.slotCodes.length, 4);
      assert.equal(snapshot.stderr.length, 6);
      assert.equal(snapshot.stdout.length, 0);
      assert.equal(snapshot.cleanupTargets.length, 1);
      for (const code of snapshot.slotCodes) observed.add(code);
    }
  }
  assert.deepEqual([...observed].sort(), Object.values(ownedListenerSlotCodes).flat().sort());
});

test('D17.7 classifier oracle discards bodies and confines every terminal path', () => {
  const rawEvents = [
    { kind: 'response', status: 200, body: 'raw-body' },
    { kind: 'response', status: 200, headers: { authorization: 'secret' } },
    { kind: 'connect-failed', error: 'raw-error' },
    { kind: 'response', status: 200, path: '/private/workstation' },
    { kind: 'response', status: 200, url: 'http://127.0.0.1:33117/healthz' },
    { kind: 'response', status: 200, port: 33117 },
    { kind: 'response', status: 200, env: 'production' },
  ];
  for (const event of rawEvents) {
    const fixture = ownedListenerDiagnosticFixture([ownedListenerOptIn], true);
    fixture.start();
    fixture.routeTable('runtime-route-table-present');
    assert.deepEqual(fixture.classify('health', event), { accepted: false });
    const rejected = fixture.snapshot();
    assert.equal(rejected.discardedStreams, 0);
    assert.deepEqual(rejected.slotCodes, []);
    assert.deepEqual(rejected.cleanupTargets, ['owned-d17-7-fixture']);
    assert.doesNotMatch(
      JSON.stringify(rejected),
      /raw|authorization|secret|private|workstation|https?:|33117|production/iu,
    );
  }

  for (const terminal of [
    'bind-failure',
    'child-error',
    'child-disconnect',
    'child-exit',
    'protocol-failure',
    'assertion-failure',
    'command-failure',
    'cleanup-failure',
  ]) {
    const fixture = ownedListenerDiagnosticFixture([ownedListenerOptIn], true);
    fixture.start();
    assert.deepEqual(fixture.terminal(terminal), { accepted: false });
    const stopped = fixture.snapshot();
    assert.equal(stopped.exitCode, 1);
    assert.deepEqual(stopped.attemptedSlots, []);
    assert.deepEqual(stopped.cleanupTargets, ['owned-d17-7-fixture']);
    assert.deepEqual(stopped.stdout, []);
  }

  const incomplete = ownedListenerDiagnosticFixture([ownedListenerOptIn], true);
  incomplete.start();
  incomplete.routeTable('runtime-route-table-present');
  incomplete.classify('health', { kind: 'connect-failed' });
  assert.deepEqual(incomplete.snapshot().attemptedSlots, ['health', 'readiness']);
  assert.deepEqual(incomplete.terminal('child-exit'), { accepted: false });
  assert.deepEqual(incomplete.snapshot().cleanupTargets, ['owned-d17-7-fixture']);
  const fixtureSource = `${ownedListenerDiagnosticFixture}\n${runOwnedListenerResponses}`;
  assert.doesNotMatch(fixtureSource, /\b(?:setTimeout|setInterval|sleep|retry|poll)\s*\(/iu);
  assert.doesNotMatch(fixtureSource, /\btimeout\b/iu);
});

test('D17.7 production binds the singleton owned-listener classifier without default drift', () => {
  const main = readFileSync(join(repoRoot, 'reference/api/src/main.ts'), 'utf8');
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  assert.equal(
    helper.includes(`'${ownedListenerOptIn}'`) || helper.includes(`"${ownedListenerOptIn}"`),
    true,
    'D17.7 exact singleton CLI opt-in is not implemented',
  );
  assert.match(helper, /process\.argv\.slice\(2\)/u);
  assert.match(helper, /STYNX_REFERENCE_API_OWNED_DIAGNOSTIC/u);
  assert.match(helper, /127\.0\.0\.1/u);
  assert.match(helper, /33117/u);
  for (const path of ['/healthz', '/readyz', '/_reference/demo-tenants']) {
    assert.match(helper, new RegExp(path.replaceAll('/', '\\/'), 'u'));
  }
  for (const code of [
    ...Object.values(ownedListenerSlotCodes).flat(),
    ...ownedListenerFinalCodes,
  ]) {
    assert.equal(helper.includes(`'${code}'`) || helper.includes(`"${code}"`), true);
  }
  assert.match(helper, new RegExp(escapeRegExpLiteral(ownedListenerOutputPrefix), 'u'));
  assert.equal((helper.match(/\bawait sleep\(/gu) ?? []).length, 1);
  assert.doesNotMatch(helper, /(?:retry|setTimeout|setInterval)\s*\(/u);
  assert.equal(main.includes(ownedListenerBindingBegin), true);
  assert.equal(main.includes(ownedListenerBindingEnd), true);
  assert.match(main, /STYNX_REFERENCE_API_OWNED_DIAGNOSTIC/u);
  assert.match(main, /app\.listen\(port,\s*['"]127\.0\.0\.1['"]\)/u);
  const reconstructedMain = frozenMainWithoutOwnedListenerBinding(main);
  assert.equal(
    createHash('sha256').update(reconstructedMain).digest('hex'),
    '47a9ae09aa32abf13ca7b079c035d2b5e17c43b3c730651e82eccf8f292bd3eb',
  );
  assert.equal(reconstructedMain.includes(ownedListenerBindingBegin), false);
  assert.equal(reconstructedMain.includes(ownedListenerBindingEnd), false);
  assert.equal((reconstructedMain.match(/await app\.listen\(port\);/gu) ?? []).length, 1);
});

test('D17.7 production fails closed on asynchronous owned cleanup rejection', () => {
  const result = runOwnedListenerCleanupRejection();
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  const startupLines = result.stderr
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(`${startupOutputPrefix} `));
  const classifierLines = result.stderr
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(`${ownedListenerOutputPrefix} `));
  const ungovernedLines = result.stderr
    .split(/\r?\n/u)
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith(`${startupOutputPrefix} `) &&
        !line.startsWith(`${ownedListenerOutputPrefix} `),
    );
  const expectedStartupLines = [
    ...helperSuccessStates,
    ...startupSuccessStates,
    'runtime-route-table-present',
  ].map(fixedStartupOutput);
  const expectedClassifierLines = [
    'owned-healthz-2xx',
    'owned-readyz-503',
    'owned-api-local-2xx',
    'owned-sentinel-404',
    'owned-full-table-present',
  ].map((code) => `${ownedListenerOutputPrefix} ${code}`);
  const violations = [];
  if (result.status === 0 || result.signal !== null) violations.push('nonzero-terminal');
  if (result.stdout.length !== 0 || ungovernedLines.length !== 0) {
    violations.push('raw-output');
  }
  if (result.leakedFixturePath) violations.push('fixture-path-output');
  if (startupLines.join('\n') !== expectedStartupLines.join('\n')) {
    violations.push('startup-sequence');
  }
  if (classifierLines.join('\n') !== expectedClassifierLines.join('\n')) {
    violations.push('classifier-sequence');
  }
  if (new Set(classifierLines).size !== classifierLines.length) {
    violations.push('duplicate-classifier-code');
  }
  for (const action of [
    'async-down',
    'async-rm',
    ...[1, 2, 3, 4].flatMap((index) => [`request-${index}`, `discard-${index}`]),
  ]) {
    if (result.actions.filter((candidate) => candidate === action).length !== 1) {
      violations.push(`action-count:${action}`);
    }
  }
  if (result.actions.includes('sync-down')) violations.push('duplicate-cleanup-attempt');
  if (result.actions.includes('unhandled-rejection')) violations.push('unhandled-rejection');
  if (result.actions.includes('uncaught-exception')) violations.push('uncaught-exception');
  if (!/void runOwnedRouteClassifier\(\)\.catch\(\(\) =>/u.test(helper)) {
    violations.push('classifier-rejection-routing');
  }
  assert.deepEqual(
    violations,
    [],
    'D17.7 async owned cleanup rejection must fail closed without duplicate cleanup',
  );
});

test('D18 listener oracle distinguishes a present table from IPv4 child ownership', () => {
  const ambiguous = d18ListenerOwnershipOracle({ ambientIpv4: true });
  assert.equal(ambiguous.bindHost, 'host-omitted');
  assert.equal(ambiguous.listening, true);
  assert.equal(ambiguous.routeTable, 'runtime-route-table-present');
  assert.equal(ambiguous.ipv4ProbeOwnedByChild, false);
  assert.equal(ambiguous.ipv4ProbeMayReachAmbient, true);
  assert.deepEqual(ambiguous.classifierRequests, []);

  const owned = d18ListenerOwnershipOracle({ marker: '1', ambientIpv4: true });
  assert.equal(owned.bindHost, '127.0.0.1');
  assert.equal(owned.listening, true);
  assert.equal(owned.routeTable, 'runtime-route-table-present');
  assert.equal(owned.ipv4ProbeOwnedByChild, true);
  assert.equal(owned.ipv4ProbeMayReachAmbient, false);

  for (const marker of [undefined, '', '0', 'true', '01', ' 1 ', 'inherited']) {
    const standalone = d18ListenerOwnershipOracle({ marker });
    assert.equal(standalone.bindHost, 'host-omitted');
    assert.equal(standalone.ipv4ProbeOwnedByChild, false);
  }
});

test('D18 helper oracle strips inherited controls and preserves exact CLI tiers', () => {
  const inherited = {
    [helperManagedMarker]: 'inherited-helper',
    STYNX_REFERENCE_API_OWNED_DIAGNOSTIC: 'inherited-diagnostic',
  };
  const normal = d18HelperInvocationOracle([], inherited);
  assert.equal(normal.accepted, true);
  assert.equal(normal.childEnvironment[helperManagedMarker], '1');
  assert.equal('STYNX_REFERENCE_API_OWNED_DIAGNOSTIC' in normal.childEnvironment, false);
  assert.equal(normal.host, '127.0.0.1');
  assert.equal(normal.port, 3_000);
  assert.deepEqual(normal.classifierRequests, []);
  assert.deepEqual(normal.phases, [
    ...helperSuccessStates,
    ...startupSuccessStates,
    'runtime-route-table-present',
  ]);

  const diagnostic = d18HelperInvocationOracle([ownedListenerOptIn], inherited);
  assert.equal(diagnostic.accepted, true);
  assert.equal(diagnostic.childEnvironment[helperManagedMarker], '1');
  assert.equal(diagnostic.childEnvironment.STYNX_REFERENCE_API_OWNED_DIAGNOSTIC, '1');
  assert.equal(diagnostic.host, '127.0.0.1');
  assert.equal(diagnostic.port, 33_117);
  assert.deepEqual(diagnostic.classifierRequests, ownedListenerSlots);

  for (const args of [
    ['--unknown'],
    [ownedListenerOptIn, ownedListenerOptIn],
    [ownedListenerOptIn, '--additional'],
    [`${ownedListenerOptIn}=1`],
  ]) {
    const rejected = d18HelperInvocationOracle(args, inherited);
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.exitCode, 1);
    assert.deepEqual(rejected.operations, []);
    assert.deepEqual(rejected.phases, []);
    assert.deepEqual(rejected.classifierRequests, []);
    assert.equal(rejected.childEnvironment, undefined);
  }
});

test('D18 bind-collision oracle emits one bounded failure and one confined cleanup', () => {
  for (const cleanupKind of ['async', 'sync']) {
    const collision = d18ListenerOwnershipOracle({
      marker: '1',
      ambientIpv4: true,
      bindCollision: true,
      cleanupKind,
    });
    assert.equal(collision.bindHost, '127.0.0.1');
    assert.equal(collision.listening, false);
    assert.equal(collision.routeTable, undefined);
    assert.equal(collision.ipv4ProbeOwnedByChild, false);
    assert.deepEqual(collision.stderr, [fixedStartupOutput('bootstrap-failed:listen')]);
    assert.deepEqual(collision.classifierRequests, []);
    assert.deepEqual(collision.cleanupEvents, [{ kind: cleanupKind, target: 'owned-d18-fixture' }]);
    assert.equal(collision.exitCode, 1);
  }
  const oracleSource = `${d18ListenerOwnershipOracle}\n${d18HelperInvocationOracle}`;
  assert.doesNotMatch(oracleSource, /\b(?:setTimeout|setInterval|sleep|retry|poll)\s*\(/iu);
  assert.doesNotMatch(oracleSource, /\btimeout\b/iu);
});

test('D18 production marks every helper child and binds only exact managed main', () => {
  const main = readFileSync(join(repoRoot, 'reference/api/src/main.ts'), 'utf8');
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  assert.equal(
    helper.includes(helperManagedMarker),
    true,
    'D18 helper-managed marker is not implemented',
  );
  const deleteManaged = helper.indexOf(`delete childEnvironment.${helperManagedMarker}`);
  const deleteDiagnostic = helper.indexOf(
    'delete childEnvironment.STYNX_REFERENCE_API_OWNED_DIAGNOSTIC',
  );
  const setManaged = helper.search(
    /childEnvironment\.STYNX_REFERENCE_API_HELPER_MANAGED\s*=\s*['"]1['"]/u,
  );
  const setDiagnostic = helper.search(
    /if \(ownedRouteClassifierEnabled\) \{\s*childEnvironment\.STYNX_REFERENCE_API_OWNED_DIAGNOSTIC\s*=\s*['"]1['"]/su,
  );
  assert.ok(deleteManaged >= 0);
  assert.ok(deleteDiagnostic > deleteManaged);
  assert.ok(setManaged > deleteDiagnostic);
  assert.ok(setDiagnostic > setManaged);
  assert.match(main, /process\.env\.STYNX_REFERENCE_API_HELPER_MANAGED\s*===\s*['"]1['"]/u);
  assert.equal((main.match(/STYNX_REFERENCE_API_HELPER_MANAGED/gu) ?? []).length, 1);
  assert.equal((main.match(/app\.listen\(port,\s*['"]127\.0\.0\.1['"]\)/gu) ?? []).length, 1);
  assert.equal((main.match(/await app\.listen\(port\);/gu) ?? []).length, 1);
  assert.equal(
    (main.match(new RegExp(escapeRegExpLiteral(helperManagedBindingBegin), 'gu')) ?? []).length,
    1,
  );
  assert.equal(
    (main.match(new RegExp(escapeRegExpLiteral(helperManagedBindingEnd), 'gu')) ?? []).length,
    1,
  );
  const reconstructedMain = frozenMainWithoutOwnedListenerBinding(main);
  assert.equal(
    createHash('sha256').update(reconstructedMain).digest('hex'),
    '47a9ae09aa32abf13ca7b079c035d2b5e17c43b3c730651e82eccf8f292bd3eb',
  );
  assert.doesNotMatch(helper, /(?:find|reserve|probe)(?:Free|Available)?(?:Host|Port)/iu);
  assert.doesNotMatch(helper, /(?:fallbackHost|fallbackPort|alternateHost)/u);
  assert.equal((helper.match(/\bawait sleep\(/gu) ?? []).length, 1);
  assert.doesNotMatch(helper, /(?:retry|setTimeout|setInterval)\s*\(/u);
});

test('D19 CLI oracle partitions modes before resources and preserves D17 bytes', () => {
  const inherited = {
    [helperManagedMarker]: 'inherited-helper',
    STYNX_REFERENCE_API_OWNED_DIAGNOSTIC: 'inherited-diagnostic',
  };
  const normal = d19HelperModeOracle([], inherited);
  const d19 = d19HelperModeOracle([defaultEndpointOptIn], inherited);
  assert.equal(normal.mode, 'default');
  assert.equal(d19.mode, 'd19');
  assert.deepEqual(d19.childEnvironment, normal.childEnvironment);
  assert.deepEqual(d19.childInputs, normal.childInputs);
  assert.deepEqual(normal.requests, []);
  assert.deepEqual(d19.requests, []);
  assert.equal(normal.childEnvironment[helperManagedMarker], '1');
  assert.equal('STYNX_REFERENCE_API_OWNED_DIAGNOSTIC' in normal.childEnvironment, false);

  const d17 = d19HelperModeOracle([ownedListenerOptIn], inherited);
  assert.equal(d17.mode, 'd17');
  assert.equal(d17.childInputs.port, 33_117);
  assert.equal(d17.childInputs.host, '127.0.0.1');
  assert.equal(d17.childEnvironment.STYNX_REFERENCE_API_OWNED_DIAGNOSTIC, '1');
  assert.equal(d17.childEnvironment[helperManagedMarker], '1');
  assert.deepEqual(ownedListenerSlots, ['health', 'readiness', 'api-local', 'sentinel']);
  assert.equal(ownedListenerOptIn, '--d17-owned-route-classifier');

  for (const args of [
    ['--unknown'],
    [defaultEndpointOptIn, defaultEndpointOptIn],
    [ownedListenerOptIn, defaultEndpointOptIn],
    [defaultEndpointOptIn, '--additional'],
    [`${defaultEndpointOptIn}=1`],
  ]) {
    const rejected = d19HelperModeOracle(args, inherited);
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.exitCode, 1);
    assert.deepEqual(rejected.operations, []);
    assert.deepEqual(rejected.phases, []);
    assert.deepEqual(rejected.requests, []);
    assert.equal(rejected.childEnvironment, undefined);
  }
});

test('D19 classifier starts only after present and requests health then readiness once', () => {
  for (const record of [
    'runtime-route-table-absent',
    'runtime-route-table-indeterminate',
    'unknown',
    { state: 'runtime-route-table-present', payload: 'raw' },
  ]) {
    const fixture = d19ClassifierFixture();
    assert.deepEqual(fixture.routeTable(record), { accepted: false });
    const stopped = fixture.snapshot();
    assert.deepEqual(stopped.requests, []);
    assert.deepEqual(stopped.attempted, { healthz: 0, readyz: 0 });
    assert.equal(stopped.cleanupEvents.length, 1);
  }
  const terminal = d19ClassifierFixture();
  assert.deepEqual(terminal.terminal(), { accepted: false });
  assert.deepEqual(terminal.snapshot().requests, []);

  const ordered = d19ClassifierFixture();
  assert.deepEqual(ordered.routeTable('runtime-route-table-present'), { accepted: true });
  assert.deepEqual(ordered.snapshot().requests, ['GET healthz']);
  assert.deepEqual(ordered.response('healthz', { kind: 'response', status: 204 }), {
    accepted: true,
  });
  assert.deepEqual(ordered.snapshot().requests, ['GET healthz', 'GET readyz']);
  assert.deepEqual(ordered.response('readyz', { kind: 'response', status: 204 }), {
    accepted: true,
  });
  const complete = ordered.snapshot();
  assert.deepEqual(complete.attempted, { healthz: 1, readyz: 1 });
  assert.deepEqual(complete.codes, [
    'default-healthz-2xx',
    'default-readyz-2xx',
    'default-endpoint-ready',
  ]);
  assert.equal(complete.cleanupEvents.length, 1);
  assert.deepEqual(ordered.routeTable('runtime-route-table-present'), { accepted: false });
});

test('D19 classifier covers every fixed slot code and complete-pair final mapping', () => {
  const valid503 = d19ReadinessBody({ postgres: 'down', redis: 'up', jwks: 'up', s3: 'up' });
  const healthEvents = [
    { event: { kind: 'response', status: 200, body: 'raw-unread' }, code: 'default-healthz-2xx' },
    { event: { kind: 'response', status: 404, body: 'raw-unread' }, code: 'default-healthz-404' },
    { event: { kind: 'response', status: 500, body: 'raw-unread' }, code: 'default-healthz-other' },
    { event: { kind: 'connect-failed' }, code: 'default-healthz-connect-failed' },
  ];
  const readyEvents = [
    { event: { kind: 'response', status: 200, body: 'raw-unread' }, code: 'default-readyz-2xx' },
    { event: { kind: 'response', status: 404, body: 'raw-unread' }, code: 'default-readyz-404' },
    { event: { kind: 'response', status: 503, body: valid503 }, code: 'default-readyz-503' },
    { event: { kind: 'response', status: 500, body: 'raw-unread' }, code: 'default-readyz-other' },
    { event: { kind: 'connect-failed' }, code: 'default-readyz-connect-failed' },
  ];
  const observed = new Set();
  const finals = new Set();
  for (const health of healthEvents) {
    for (const readiness of readyEvents) {
      const fixture = d19ClassifierFixture();
      fixture.routeTable('runtime-route-table-present');
      fixture.response('healthz', health.event);
      fixture.response('readyz', readiness.event);
      const snapshot = fixture.snapshot();
      observed.add(health.code);
      observed.add(readiness.code);
      finals.add(snapshot.codes.at(-1));
      assert.equal(snapshot.attempted.healthz, 1);
      assert.equal(snapshot.attempted.readyz, 1);
      assert.equal(snapshot.stdout.length, 0);
      if (readiness.event.status !== 503) assert.equal(snapshot.bodyReads, 0);
      assert.doesNotMatch(JSON.stringify(snapshot), /raw-unread/u);
    }
  }
  assert.deepEqual([...observed].sort(), Object.values(defaultEndpointSlotCodes).flat().sort());
  assert.deepEqual([...finals].sort(), defaultEndpointFinalCodes.slice().sort());
});

test('D19 readiness-503 oracle enforces bounded exact shape and fixed indicator order', () => {
  const validBody = d19ReadinessBody({ postgres: 'down', redis: 'up', jwks: 'down', s3: 'up' });
  const valid = d19ClassifierFixture();
  valid.routeTable('runtime-route-table-present');
  valid.response('healthz', { kind: 'response', status: 200 });
  assert.deepEqual(valid.response('readyz', { kind: 'response', status: 503, body: validBody }), {
    accepted: true,
  });
  const accepted = valid.snapshot();
  assert.deepEqual(accepted.codes, [
    'default-healthz-2xx',
    'default-readyz-503',
    'default-readyz-postgres-fail',
    'default-readyz-redis-pass',
    'default-readyz-jwks-fail',
    'default-readyz-s3-pass',
    'default-endpoint-unavailable',
  ]);
  assert.equal(accepted.bodyReads, Buffer.byteLength(validBody));
  assert.doesNotMatch(JSON.stringify(accepted), /discarded indicator detail/u);

  const boundaryBody = `${validBody}${' '.repeat(16_384 - Buffer.byteLength(validBody))}`;
  assert.equal(Buffer.byteLength(boundaryBody), 16_384);
  assert.deepEqual(validateD19ReadinessBody(boundaryBody), [
    { name: 'postgres', passing: false },
    { name: 'redis', passing: true },
    { name: 'jwks', passing: false },
    { name: 's3', passing: true },
  ]);

  const base = JSON.parse(validBody);
  const invalidBodies = [
    `${validBody}${' '.repeat(16_385)}`,
    '{not-json',
    '[]',
    JSON.stringify({ ...base, extra: true }),
    JSON.stringify({ ...base, status: 'ok' }),
    JSON.stringify({ ...base, info: { ...base.info, unknown: { status: 'down' } } }),
    JSON.stringify({ ...base, info: { ...base.info, s3: undefined } }),
    JSON.stringify({ ...base, details: { ...base.details, postgres: { status: 'up' } } }),
    JSON.stringify({ ...base, error: { redis: {} } }),
    d19ReadinessBody({ postgres: 'up', redis: 'up', jwks: 'up', s3: 'up' }),
    validBody.replace('"status":"error"', '"status":"error","status":"error"'),
    validBody.replace('"postgres":', '"postgres":{"status":"down"},"postgres":'),
  ];
  for (const body of invalidBodies) {
    const fixture = d19ClassifierFixture();
    fixture.routeTable('runtime-route-table-present');
    fixture.response('healthz', { kind: 'response', status: 200 });
    assert.deepEqual(fixture.response('readyz', { kind: 'response', status: 503, body }), {
      accepted: false,
    });
    const rejected = fixture.snapshot();
    assert.deepEqual(rejected.codes, ['default-healthz-2xx']);
    assert.equal(rejected.bodyReads, 0);
    assert.equal(rejected.cleanupEvents.length, 1);
  }
  const premature = d19ClassifierFixture();
  premature.routeTable('runtime-route-table-present');
  premature.response('healthz', { kind: 'response', status: 200 });
  assert.deepEqual(
    premature.response('readyz', {
      kind: 'response',
      status: 503,
      body: validBody,
      premature: true,
    }),
    { accepted: false },
  );
  assert.equal(premature.snapshot().bodyReads, 0);
});

test('D19 classifier keeps bounded output and once-only synchronous or asynchronous cleanup', () => {
  for (const cleanupKind of ['async', 'sync']) {
    const fixture = d19ClassifierFixture(cleanupKind);
    fixture.routeTable('runtime-route-table-present');
    fixture.response('healthz', { kind: 'connect-failed' });
    fixture.response('readyz', { kind: 'connect-failed' });
    fixture.terminal();
    const snapshot = fixture.snapshot();
    assert.equal(snapshot.stdout.length, 0);
    assert.deepEqual(snapshot.cleanupEvents, [{ kind: cleanupKind, target: 'owned-d19-fixture' }]);
    assert.equal(new Set(snapshot.codes).size, snapshot.codes.length);
    for (const line of snapshot.stderr) {
      assert.match(line, new RegExp(`^${escapeRegExpLiteral(defaultEndpointOutputPrefix)} `, 'u'));
    }
  }
  const fixtureSource = `${d19HelperModeOracle}\n${parseUniqueJson}\n${validateD19ReadinessBody}\n${d19ClassifierFixture}`;
  assert.doesNotMatch(fixtureSource, /\b(?:setTimeout|setInterval|sleep|retry|poll)\s*\(/iu);
  assert.doesNotMatch(fixtureSource, /\btimeout\b/iu);
});

test('D19 production binds the exact default-endpoint classifier without frozen drift', () => {
  const main = readFileSync(join(repoRoot, 'reference/api/src/main.ts'), 'utf8');
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  assert.equal(
    helper.includes(`'${defaultEndpointOptIn}'`) || helper.includes(`"${defaultEndpointOptIn}"`),
    true,
    'D19 exact singleton CLI is not implemented',
  );
  assert.equal(
    createHash('sha256').update(main).digest('hex'),
    'c56246aa274b5df7cd88ca11692f580fca724d60a41b69b0021bb63fbf0acc0b',
  );
  assert.match(helper, new RegExp(escapeRegExpLiteral(defaultEndpointOutputPrefix), 'u'));
  assert.match(helper, /16384|16_384/u);
  for (const code of [
    ...Object.values(defaultEndpointSlotCodes).flat(),
    ...defaultEndpointFinalCodes,
    ...readinessIndicatorNames.flatMap((name) => [
      `default-readyz-${name}-pass`,
      `default-readyz-${name}-fail`,
    ]),
  ]) {
    assert.equal(helper.includes(`'${code}'`) || helper.includes(`"${code}"`), true);
  }
  assert.equal((helper.match(/['"]\/healthz['"]/gu) ?? []).length >= 2, true);
  assert.equal((helper.match(/['"]\/readyz['"]/gu) ?? []).length >= 2, true);
  assert.equal((helper.match(/33117/gu) ?? []).length, 1);
  assert.equal((helper.match(/\bawait sleep\(/gu) ?? []).length, 1);
  assert.doesNotMatch(helper, /(?:retry|setTimeout|setInterval)\s*\(/u);
});

test('D20 binds the exact installed Playwright 1.60 spawned-readiness semantics', () => {
  const referenceWebRequire = createRequire(join(repoRoot, 'reference/web/package.json'));
  const playwrightTestPackagePath = referenceWebRequire.resolve('@playwright/test/package.json');
  const playwrightTestPackage = JSON.parse(readFileSync(playwrightTestPackagePath, 'utf8'));
  const playwrightRequire = createRequire(playwrightTestPackagePath);
  const playwrightPackagePath = playwrightRequire.resolve('playwright/package.json');
  const playwrightPackage = JSON.parse(readFileSync(playwrightPackagePath, 'utf8'));
  const playwrightCorePackagePath = playwrightRequire.resolve('playwright-core/package.json');
  const playwrightCorePackage = JSON.parse(readFileSync(playwrightCorePackagePath, 'utf8'));
  const runnerSource = readFileSync(
    join(dirname(playwrightPackagePath), 'lib/runner/index.js'),
    'utf8',
  );
  const lock = readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8');

  assert.equal(playwrightTestPackage.version, '1.60.0');
  assert.equal(playwrightPackage.version, '1.60.0');
  assert.equal(playwrightCorePackage.version, '1.60.0');
  assert.match(lock, /'@playwright\/test@1\.60\.0':\n\s+dependencies:\n\s+playwright: 1\.60\.0/u);
  assert.match(lock, /playwright@1\.60\.0:\n\s+dependencies:\n\s+playwright-core: 1\.60\.0/u);
  assert.match(lock, /playwright-core@1\.60\.0: \{\}/u);

  const initialUrlCheck = runnerSource.indexOf(
    'const isAlreadyAvailable = await this._isAvailableCallback?.();',
  );
  const reuseReturn = runnerSource.indexOf(
    'if (this._options.reuseExistingServer)\n        return;',
    initialUrlCheck,
  );
  const processLaunch = runnerSource.indexOf(
    'const { launchedProcess, gracefullyClose } = await launchProcess({',
  );
  const stderrWaitCreation = runnerSource.indexOf(
    'if (this._options.wait?.stdout || this._options.wait?.stderr)\n      this._waitForStdioPromise = new ManualPromise();',
  );
  assert.ok(initialUrlCheck >= 0);
  assert.ok(reuseReturn > initialUrlCheck);
  assert.ok(processLaunch > reuseReturn);
  assert.ok(stderrWaitCreation > processLaunch);

  const reporterProjection = runnerSource.indexOf(
    'this._reporter.onStdErr?.(prefixOutputLines(data.toString(), this._options.name));',
    stderrWaitCreation,
  );
  const rawCollector = runnerSource.indexOf(
    'stdioWaitCollectors[stdio] += data.toString();',
    reporterProjection,
  );
  const rawMatch = runnerSource.indexOf(
    'const result = this._options.wait[stdio].exec(stdioWaitCollectors[stdio]);',
    rawCollector,
  );
  assert.ok(reporterProjection > stderrWaitCreation);
  assert.ok(rawCollector > reporterProjection);
  assert.ok(rawMatch > rawCollector);
  assert.equal(runnerSource.includes('prefixOutputLines(stdioWaitCollectors[stdio]'), false);

  const waitForProcessStart = runnerSource.indexOf('async _waitForProcess() {');
  const waitForProcessEnd = runnerSource.indexOf('\n  }\n};', waitForProcessStart);
  const waitForProcessSource = runnerSource.slice(waitForProcessStart, waitForProcessEnd);
  assert.match(waitForProcessSource, /const racingPromises = \[this\._processExitedPromise\];/u);
  assert.match(
    waitForProcessSource,
    /racingPromises\.push\(raceAgainstDeadline\(\(\) => waitFor\(this\._isAvailableCallback, cancellationToken\), deadline\)\);/u,
  );
  assert.match(
    waitForProcessSource,
    /racingPromises\.push\(raceAgainstDeadline\(\(\) => this\._waitForStdioPromise, deadline\)\);/u,
  );
  assert.match(waitForProcessSource, /await Promise\.race\(racingPromises\)/u);

  const collectorSource = runnerSource.slice(stderrWaitCreation, waitForProcessStart);
  assert.match(
    collectorSource,
    /for \(const \[key, value\] of Object\.entries\(result\.groups \|\| \{\}\)\)\n\s+process\.env\[key\.toUpperCase\(\)\] = value;/u,
  );
  assert.equal(
    (collectorSource.match(/process\.env\[key\.toUpperCase\(\)\] = value;/gu) ?? []).length,
    1,
  );
});

test('D20 frozen Playwright normalization admits only the exact API wait field', () => {
  const configSource = readFileSync(join(repoRoot, 'reference/web/playwright.config.mjs'), 'utf8');
  const occurrenceCount = configSource.split(playwrightApiReadyWaitLine).length - 1;
  const frozenBaseline = normalizeD20PlaywrightWait(configSource);
  assert.equal(
    createHash('sha256').update(frozenBaseline).digest('hex'),
    '3fbbb1a4dc5bcafe289113674ae8176f2cc90af74dfd69c6f1dc4f138fbff067',
  );
  if (occurrenceCount === 0) {
    assert.equal(frozenBaseline, configSource);
  } else {
    assert.equal(occurrenceCount, 1);
    assert.equal(configSource.replace(playwrightApiReadyWaitLine, ''), frozenBaseline);
  }

  const apiAnchor = '      reuseExistingServer: true,\n      timeout: 300_000,\n';
  assert.equal(
    (frozenBaseline.match(new RegExp(escapeRegExpLiteral(apiAnchor), 'gu')) ?? []).length,
    1,
  );
  const withExactWait = frozenBaseline.replace(
    apiAnchor,
    `      reuseExistingServer: true,\n${playwrightApiReadyWaitLine}      timeout: 300_000,\n`,
  );
  assert.equal(normalizeD20PlaywrightWait(withExactWait), frozenBaseline);
  assert.throws(() => normalizeD20PlaywrightWait(`${withExactWait}${playwrightApiReadyWaitLine}`));

  const staticAnchor =
    "    {\n      command: 'pnpm build:web && PORT=3100 node scripts/serve-static.mjs',\n";
  assert.throws(() =>
    normalizeD20PlaywrightWait(
      frozenBaseline.replace(staticAnchor, `${staticAnchor}${playwrightApiReadyWaitLine}`),
    ),
  );
  assert.throws(() =>
    normalizeD20PlaywrightWait(
      frozenBaseline.replace(
        apiAnchor,
        '      reuseExistingServer: true,\n      wait: { stderr: /(runtime-route-table-present)/g },\n      timeout: 300_000,\n',
      ),
    ),
  );
  assert.throws(() =>
    normalizeD20PlaywrightWait(
      frozenBaseline.replace(
        apiAnchor,
        '      reuseExistingServer: true,\n      wait: { stdout: /runtime-route-table-present/m },\n      timeout: 300_000,\n',
      ),
    ),
  );
});

test('D20 production adds only the exact API-entry raw-stderr wait', async () => {
  const configPath = join(repoRoot, 'reference/web/playwright.config.mjs');
  const configSource = readFileSync(configPath, 'utf8');
  const frozenWithoutWait = normalizeD20PlaywrightWait(configSource);
  assert.equal(
    createHash('sha256').update(frozenWithoutWait).digest('hex'),
    '3fbbb1a4dc5bcafe289113674ae8176f2cc90af74dfd69c6f1dc4f138fbff067',
  );
  assert.equal(
    configSource.includes(playwrightApiReadyWaitLine),
    true,
    'D20 exact API stderr wait is not implemented',
  );
  const config = (await import(`../../reference/web/playwright.config.mjs?d20=${Date.now()}`))
    .default;
  assert.equal(Array.isArray(config.webServer), true);
  assert.equal(config.webServer.length, 2);
  const [apiEntry, staticEntry] = config.webServer;
  assert.deepEqual(Object.keys(apiEntry).sort(), [
    'command',
    'cwd',
    'reuseExistingServer',
    'timeout',
    'url',
    'wait',
  ]);
  assert.equal(apiEntry.command, 'node scripts/serve-reference-api-stack.mjs');
  assert.equal(apiEntry.cwd, fileURLToPath(new URL('../../reference/web/', import.meta.url)));
  assert.equal(apiEntry.url, 'http://127.0.0.1:3000/readyz');
  assert.equal(apiEntry.reuseExistingServer, true);
  assert.equal(apiEntry.timeout, 300_000);
  assert.ok(apiEntry.wait, 'D20 exact API stderr wait is not implemented');
  assert.deepEqual(Object.keys(apiEntry.wait), ['stderr']);
  assert.equal(apiEntry.wait.stderr instanceof RegExp, true);
  assert.equal(apiEntry.wait.stderr.source, playwrightApiReadyWaitSource);
  assert.equal(apiEntry.wait.stderr.flags, 'm');
  assert.equal(apiEntry.wait.stderr.global, false);
  assert.equal(apiEntry.wait.stderr.exec(playwrightApiReadyLine)?.groups, undefined);
  assert.equal(apiEntry.wait.stderr.test(`${playwrightApiReadyLine}-extra`), false);
  assert.equal(apiEntry.wait.stderr.test(`[webServer] ${playwrightApiReadyLine}`), false);

  assert.deepEqual(staticEntry, {
    command: 'pnpm build:web && PORT=3100 node scripts/serve-static.mjs',
    cwd: fileURLToPath(new URL('../../reference/web/', import.meta.url)),
    port: 3100,
    reuseExistingServer: true,
    timeout: 120_000,
  });
  assert.doesNotMatch(configSource, /wait:\s*\{\s*stdout:/u);
  assert.doesNotMatch(playwrightApiReadyWaitLine, /\(\?<|\([^?]|\/g\b/u);
});

test('D21 Compose-up oracle selects one bounded terminal before confined cleanup', () => {
  const matrix = [
    {
      event: { kind: 'error' },
      classification: 'compose-up-spawn-failed',
    },
    {
      event: { kind: 'exit', code: 17, signal: null },
      classification: 'compose-up-exit-nonzero',
    },
    {
      event: { kind: 'exit', code: null, signal: true },
      classification: 'compose-up-signaled',
    },
  ];
  for (const { event, classification } of matrix) {
    const fixture = d21ComposeUpFixture();
    assert.deepEqual(fixture.childEvent(event), { accepted: true, classification });
    const snapshot = fixture.snapshot();
    assert.deepEqual(snapshot.stdout, []);
    assert.deepEqual(snapshot.stderr, [
      fixedStartupOutput('helper-entered'),
      `${startupOutputPrefix} ${classification}`,
    ]);
    assert.equal(snapshot.stderr.includes(fixedStartupOutput('compose-ready')), false);
    assert.deepEqual(snapshot.cleanupEvents, [{ kind: 'confined', target: 'owned-d21-fixture' }]);
    assert.equal(snapshot.terminal, classification);
  }

  for (const events of [
    [{ kind: 'error' }, { kind: 'exit', code: 1, signal: null }],
    [
      { kind: 'exit', code: null, signal: true },
      { kind: 'exit', code: 1, signal: null },
    ],
    [{ kind: 'error' }, { kind: 'error' }, { kind: 'exit', code: null, signal: true }],
  ]) {
    const fixture = d21ComposeUpFixture();
    assert.equal(fixture.childEvent(events[0]).accepted, true);
    for (const event of events.slice(1)) {
      assert.deepEqual(fixture.childEvent(event), { accepted: false });
    }
    const snapshot = fixture.snapshot();
    assert.equal(snapshot.stderr.length, 2);
    assert.equal(snapshot.cleanupEvents.length, 1);
    assert.equal(d21ComposeTerminalCodes.includes(snapshot.terminal), true);
  }

  const success = d21ComposeUpFixture();
  assert.deepEqual(success.childEvent({ kind: 'exit', code: 0, signal: null }), {
    accepted: true,
    classification: undefined,
  });
  assert.deepEqual(success.snapshot(), {
    stdout: [],
    stderr: [fixedStartupOutput('helper-entered'), fixedStartupOutput('compose-ready')],
    terminal: undefined,
    cleanupEvents: [],
    complete: true,
  });
});

test('D21 Compose-up oracle rejects payload and retains no raw diagnostic material', () => {
  const forbiddenEvents = [
    { kind: 'error', error: new Error('raw') },
    { kind: 'error', output: 'raw' },
    { kind: 'exit', code: 1, signal: null, path: '/private/fixture' },
    { kind: 'exit', code: 1, signal: null, env: 'TOKEN' },
    { kind: 'exit', code: 1, signal: null, command: 'docker compose' },
    { kind: 'exit', code: 1, signal: null, url: 'http://127.0.0.1' },
    { kind: 'exit', code: 1, signal: null, port: 6379 },
    { kind: 'exit', code: 1, signal: null, credential: 'secret' },
  ];
  for (const event of forbiddenEvents) {
    const fixture = d21ComposeUpFixture();
    assert.deepEqual(fixture.childEvent(event), { accepted: false });
    const snapshot = fixture.snapshot();
    assert.deepEqual(snapshot.stdout, []);
    assert.deepEqual(snapshot.stderr, [fixedStartupOutput('helper-entered')]);
    assert.equal(snapshot.cleanupEvents.length, 1);
    assert.doesNotMatch(
      JSON.stringify(snapshot),
      /raw|private|TOKEN|docker compose|127\.0\.0\.1|6379|secret/u,
    );
  }
  const fixtureSource = `${d21ComposeUpFixture}`;
  assert.doesNotMatch(fixtureSource, /\b(?:setTimeout|setInterval|sleep|retry|poll)\s*\(/iu);
  assert.doesNotMatch(fixtureSource, /\btimeout\b/iu);
});

test('D21 production binds exact Compose-up terminals without D14-D20 drift', () => {
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  const frozenFiles = {
    'reference/api/src/main.ts': 'c56246aa274b5df7cd88ca11692f580fca724d60a41b69b0021bb63fbf0acc0b',
    'reference/web/playwright.config.mjs':
      '126344dd1fcbceb9496ade28ae95eea73686884d305681c13afc00c94a02c4be',
    'package.json': '69abd8d0745f8eafafae028d8e64bba14eaf2ee174b627cdea93679b110d7459',
    'reference/api/package.json':
      'bffedbee254dde969ae2a2a77689587fa9f553f0b9df2b869bd2b8fe910a5b64',
    'reference/web/package.json':
      'b1e3b617a0db97bc380dc7577700460e6fa1bbe1e64f54146e0e80943df37b0c',
    'turbo.json': 'd32a54129f37eb21a86d346cfcf09eb914cda06ebdc5166c432a9f23c67db467',
  };
  for (const [path, digest] of Object.entries(frozenFiles)) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(join(repoRoot, path)))
        .digest('hex'),
      digest,
    );
  }
  assertD14HelperContract(helper, JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')));
  assert.match(helper, /mkdtemp\(resolve\(tmpdir\(\), ['"]stynx-reference-api-stack-['"]\)\)/u);
  assert.match(
    helper,
    /services:\\n {2}postgres:[\s\S]*?ports:\\n {6}- '\$\{postgresPublish\}'[\s\S]*?redis:[\s\S]*?ports:\\n {6}- '\$\{redisPublish\}'/u,
  );
  assert.match(
    helper,
    /\[\s*['"]compose['"],\s*['"]-f['"],\s*composeFile,\s*['"]up['"],\s*['"]--wait['"],\s*['"]postgres['"],\s*['"]redis['"]\s*\]/su,
  );
  assert.match(
    helper,
    /return spawn\(command, args, \{\s*cwd: workspaceRoot,\s*stdio: ['"]inherit['"],\s*\.\.\.options,\s*\}\);/su,
  );
  assert.match(helper, /const childEnvironment = \{ \.\.\.process\.env \};/u);
  assert.match(helper, /stdio:\s*['"]ignore['"]/u);
  assert.equal((helper.match(/\bawait sleep\(/gu) ?? []).length, 1);
  assert.doesNotMatch(helper, /(?:retry|setTimeout|setInterval)\s*\(/u);
  assert.match(helper, /await composeDown\(\);\s*\} finally \{\s*process\.exit\(1\);/su);

  for (const code of d21ComposeTerminalCodes) {
    assert.equal(
      (helper.match(new RegExp(`['"]${escapeRegExpLiteral(code)}['"]`, 'gu')) ?? []).length,
      1,
      'D21 Compose-up terminal classifications are not implemented',
    );
  }
  const helperEntered = helper.indexOf("recordStartupCode('helper-entered')");
  const composeReady = helper.indexOf("recordStartupCode('compose-ready')", helperEntered);
  const cleanup = helper.indexOf('await composeDown();', composeReady);
  assert.ok(helperEntered >= 0);
  assert.ok(composeReady > helperEntered);
  assert.ok(cleanup > composeReady);
  assert.doesNotMatch(
    helper,
    /compose-up-(?:spawn-failed|exit-nonzero|signaled)[^'"\n]*(?:error|stack|path|env|command|url|port|credential|code|signal)/iu,
  );
});

test('D22 PostgreSQL mapping oracle generates atomic publications and accepts one safe port', () => {
  const local = d22PostgresMappingFixture({ mappingText: '127.0.0.1:49152' });
  assert.equal(local.accepted, true);
  assert.equal(local.postgresPublish, '127.0.0.1::5432');
  assert.deepEqual(local.mappingCommand, [
    'compose',
    '-f',
    'owned-compose-file',
    'port',
    'postgres',
    '5432',
  ]);
  assert.deepEqual(local.operations, [
    'compose-up',
    'postgres-port-query',
    'build-input-verification',
    'child-spawn',
  ]);
  assert.deepEqual(local.stdout, []);
  assert.deepEqual(local.stderr, []);

  for (const mappingText of [
    '0.0.0.0:49200',
    '[::]:49200',
    ':::49200',
    '0.0.0.0:49200\n[::]:49200',
  ]) {
    const overridden = d22PostgresMappingFixture({
      mappingText,
      hostOverride: 'owned-docker-host',
    });
    assert.equal(overridden.accepted, true);
    assert.equal(overridden.postgresPublish, '0.0.0.0::5432');
    assert.deepEqual(overridden.operations, local.operations);
  }
  assert.equal(parseD22OwnedPostgresMapping('[127.0.0.1]:49152', false), 49_152);
});

test('D22 PostgreSQL mapping oracle rejects absent, unsafe, malformed, and conflicting mappings', () => {
  const invalidLocalMappings = [
    '',
    '\n',
    'localhost:49152',
    '0.0.0.0:49152',
    '::1:49152',
    '[127.0.0.1:49152',
    '127.0.0.1',
    '127.0.0.1:not-decimal',
    '127.0.0.1:0',
    '127.0.0.1:65536',
    '127.0.0.1:49152\n127.0.0.1:49153',
  ];
  const invalidOverrideMappings = [
    '127.0.0.1:49152',
    '[::1]:49152',
    'example.invalid:49152',
    '0.0.0.0:49152\n[::]:49153',
  ];
  for (const [mappingText, hostOverride] of [
    ...invalidLocalMappings.map((mappingText) => [mappingText, undefined]),
    ...invalidOverrideMappings.map((mappingText) => [mappingText, 'owned-docker-host']),
  ]) {
    const rejected = d22PostgresMappingFixture({ mappingText, hostOverride });
    assert.equal(rejected.accepted, false);
    assert.deepEqual(rejected.operations, ['compose-up', 'postgres-port-query']);
    assert.deepEqual(rejected.cleanupEvents, [{ kind: 'confined', target: 'owned-d22-fixture' }]);
    assert.deepEqual(rejected.stdout, []);
    assert.deepEqual(rejected.stderr, []);
    assert.equal('childEnvironment' in rejected, false);
  }
});

test('D22 PostgreSQL endpoint handoff ignores inherited fixed ports and retains no mapping text', () => {
  const first = d22PostgresMappingFixture({
    mappingText: '127.0.0.1:49321',
    inheritedPort: '55433',
  });
  const changedInherited = d22PostgresMappingFixture({
    mappingText: '127.0.0.1:49321',
    inheritedPort: '1',
  });
  assert.deepEqual(changedInherited, first);
  assert.deepEqual(Object.keys(first.childEnvironment).sort(), [
    'STYNX_APP_DATABASE_URL',
    'STYNX_OWNER_DATABASE_URL',
    'STYNX_READER_DATABASE_URL',
  ]);
  assert.equal(new Set(Object.values(first.childEnvironment)).size, 1);
  for (const url of Object.values(first.childEnvironment)) {
    assert.equal(url, 'postgresql://postgres:postgres@127.0.0.1:49321/postgres');
    assert.equal(url.includes('55433'), false);
  }
  const overridden = d22PostgresMappingFixture({
    mappingText: '[::]:49444',
    hostOverride: 'owned-docker-host',
    inheritedPort: '55433',
  });
  for (const url of Object.values(overridden.childEnvironment)) {
    assert.equal(url, 'postgresql://postgres:postgres@owned-docker-host:49444/postgres');
  }
  const projection = JSON.stringify({ first, overridden });
  assert.doesNotMatch(projection, /127\.0\.0\.1:49321\n|\[::\]:49444|55433/u);
  assert.doesNotMatch(
    `${parseD22OwnedPostgresMapping}\n${d22PostgresMappingFixture}`,
    /\b(?:setTimeout|setInterval|sleep|retry|poll|fallback)\s*\(/iu,
  );
});

test('D22 production binds owned PostgreSQL mapping without D14-D21 drift', () => {
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  const frozenFiles = {
    'reference/api/src/main.ts': 'c56246aa274b5df7cd88ca11692f580fca724d60a41b69b0021bb63fbf0acc0b',
    'reference/web/playwright.config.mjs':
      '126344dd1fcbceb9496ade28ae95eea73686884d305681c13afc00c94a02c4be',
    'package.json': '69abd8d0745f8eafafae028d8e64bba14eaf2ee174b627cdea93679b110d7459',
    'reference/api/package.json':
      'bffedbee254dde969ae2a2a77689587fa9f553f0b9df2b869bd2b8fe910a5b64',
    'reference/web/package.json':
      'b1e3b617a0db97bc380dc7577700460e6fa1bbe1e64f54146e0e80943df37b0c',
    'turbo.json': 'd32a54129f37eb21a86d346cfcf09eb914cda06ebdc5166c432a9f23c67db467',
  };
  for (const [path, digest] of Object.entries(frozenFiles)) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(join(repoRoot, path)))
        .digest('hex'),
      digest,
    );
  }
  assertD14HelperContract(helper, JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')));
  assert.match(
    helper,
    /POSTGRES_DB: postgres[\s\S]*?POSTGRES_USER: postgres[\s\S]*?POSTGRES_PASSWORD: postgres/u,
  );
  assert.match(helper, /pg_isready -U postgres -d postgres/u);
  assert.match(helper, /['"]postgres['"],\s*['"]redis['"]/u);
  assert.match(
    helper,
    /['"]compose['"],\s*['"]-f['"],\s*composeFile,\s*['"]down['"],\s*['"]-v['"]/u,
  );
  for (const code of d21ComposeTerminalCodes) {
    assert.equal((helper.match(new RegExp(`['"]${code}['"]`, 'gu')) ?? []).length, 1);
  }
  assert.equal((helper.match(/\bawait sleep\(/gu) ?? []).length, 1);
  assert.doesNotMatch(helper, /(?:retry|setTimeout|setInterval)\s*\(/u);
  assert.doesNotMatch(
    helper,
    /spawn(?:Sync)?\(\s*['"]docker['"],\s*\[\s*['"](?:ps|inspect|stop|kill|rm|container|network|volume)['"]/su,
  );

  assert.equal(
    helper.includes(
      "const postgresPublish = process.env.TESTCONTAINERS_HOST_OVERRIDE ? '0.0.0.0::5432' : '127.0.0.1::5432';",
    ),
    true,
    'D22 atomic PostgreSQL host publication is not implemented',
  );
  assert.doesNotMatch(helper, /\$\{postgresPort\}:5432/u);
  assert.match(
    helper,
    /\[\s*['"]compose['"],\s*['"]-f['"],\s*composeFile,\s*['"]port['"],\s*['"]postgres['"],\s*['"]5432['"]\s*\]/su,
  );
  assert.equal((helper.match(/STYNX_(?:OWNER|APP|READER)_DATABASE_URL:/gu) ?? []).length, 3);
  assert.doesNotMatch(
    helper,
    /(?:postgresPublish|OwnedPostgres|postgresMapping)[^\n]*(?:console|stdout|stderr)/iu,
  );
});

test('D16.1 freezes main, Playwright, tasks, manifests, ports, timeouts, and D14', () => {
  const frozen = {
    'reference/api/src/main.ts': 'c6175bfa1f231730a0c339a8f48fd28a7a04c1c3f6f60de643ae4b767bf7c7a9',
    'reference/web/playwright.config.mjs':
      '3fbbb1a4dc5bcafe289113674ae8176f2cc90af74dfd69c6f1dc4f138fbff067',
    'package.json': '69abd8d0745f8eafafae028d8e64bba14eaf2ee174b627cdea93679b110d7459',
    'reference/api/package.json':
      'bffedbee254dde969ae2a2a77689587fa9f553f0b9df2b869bd2b8fe910a5b64',
    'reference/web/package.json':
      'b1e3b617a0db97bc380dc7577700460e6fa1bbe1e64f54146e0e80943df37b0c',
    'turbo.json': 'd32a54129f37eb21a86d346cfcf09eb914cda06ebdc5166c432a9f23c67db467',
  };
  for (const [path, digest] of Object.entries(frozen)) {
    const source = readFileSync(join(repoRoot, path), 'utf8');
    const normalizedSource =
      path === 'reference/api/src/main.ts'
        ? frozenMainWithoutRuntimeRouteTableInspection(
            frozenMainWithoutOwnedListenerBinding(source),
          )
        : path === 'reference/web/playwright.config.mjs'
          ? normalizeD20PlaywrightWait(source)
          : source;
    assert.equal(createHash('sha256').update(normalizedSource).digest('hex'), digest);
  }
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assertD14HelperContract(helper, rootManifest);
});

test('D16.1 production binds all governed phases to stderr and none to stdout', () => {
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  assert.doesNotMatch(
    helper,
    /console\.log\(\s*`\$\{startupOutputPrefix\}/u,
    'D16.1 still emits governed startup phases on stdout',
  );
  assert.match(helper, /console\.error\(\s*`\$\{startupOutputPrefix\} \$\{code\}`\s*\)/u);
  for (const code of helperSuccessStates) {
    assert.match(helper, new RegExp(`['"]${code}['"]`, 'u'));
  }
  assert.match(
    helper,
    /recordStartupCode\(\s*['"]helper-entered['"]\s*\);\s*await runChecked\(\s*['"]docker['"][\s\S]*?['"]up['"]/u,
  );
  assert.match(
    helper,
    /await runChecked\(\s*['"]docker['"][\s\S]*?['"]up['"][\s\S]*?recordStartupCode\(\s*['"]compose-ready['"]\s*\)/u,
  );
  assert.match(
    helper,
    /redisPort\s*=\s*discoverOwnedRedisPort\(\);\s*recordStartupCode\(\s*['"]redis-mapping-resolved['"]\s*\)/u,
  );
  assert.match(
    helper,
    /await runChecked\(\s*['"]node['"],\s*\[verifyReferenceApiBuildInputs\]\s*\);\s*recordStartupCode\(\s*['"]build-inputs-verified['"]\s*\)/u,
  );
  assert.match(
    helper,
    /apiProcess\.once\(\s*['"]spawn['"],\s*\(\)\s*=>\s*\{\s*recordStartupCode\(\s*['"]child-spawned['"]\s*\)/u,
  );
  assert.doesNotMatch(
    helper,
    /console\.error[^;\n]*(?:record|error|exception|stack|path|env|credential|url|port|pid|command|args)/iu,
  );
});

test('D16 preserves D14 dynamic Redis and Playwright readiness configuration', () => {
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  const playwright = readFileSync(join(repoRoot, 'reference/web/playwright.config.mjs'), 'utf8');
  const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assertD14HelperContract(helper, rootManifest);
  assert.match(playwright, /timeout:\s*90_000/u);
  assert.match(playwright, /url:\s*'http:\/\/127\.0\.0\.1:3000\/readyz'/u);
  assert.match(playwright, /reuseExistingServer:\s*true/u);
  assert.match(playwright, /timeout:\s*300_000/u);
  assert.doesNotMatch(`${helper}\n${playwright}`, /(?:setTimeout|retry|poll)\s*\(/iu);
});

test('D16 production binds the fixed credential-free startup protocol before watchdog readiness', () => {
  const main = readFileSync(join(repoRoot, 'reference/api/src/main.ts'), 'utf8');
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  assert.match(main, /stynx-reference-api-startup-v1/u, 'D16 startup protocol is not implemented');
  assert.match(helper, /stynx-reference-api-startup-v1/u);
  assert.match(
    helper,
    /const startupOutputPrefix\s*=\s*['"]\[reference-api-startup\]['"]/u,
    'D16 fixed Playwright-visible startup prefix is not implemented',
  );
  assert.match(helper, /recordAcceptedStartupState\(record\)/u);
  assert.match(helper, /console\.error\(\s*`\$\{startupOutputPrefix\} \$\{code\}`\s*\)/u);
  for (const fixedValue of [
    ...startupSuccessStates,
    'bootstrap-failed',
    ...startupFailureReasons,
  ]) {
    assert.match(main, new RegExp(`['"]${fixedValue}['"]`, 'u'));
    assert.match(helper, new RegExp(`['"]${fixedValue}['"]`, 'u'));
  }
  assert.match(main, /(?:typeof process\.send === 'function'|process\.send\?\.)/u);
  assertBootstrapBeforeRuntimeLoads(main);
  assert.doesNotMatch(
    main,
    /process\.send[^;\n]*(?:error|stack|path|env|credential|url|port|command)/iu,
  );
  assert.doesNotMatch(main, /Logger\.error\(\s*(?:error|exception|cause)\b/iu);
  assert.match(helper, /stdio:\s*\[[^\]]*['"]ipc['"][^\]]*\]/su);

  const watchdogIndex = helper.lastIndexOf('startCleanupWatchdog()');
  assert.ok(watchdogIndex > 0);
  for (const event of ['message', 'error', 'disconnect', 'exit']) {
    const listener = new RegExp(`apiProcess\\.(?:on|once)\\(['"]${event}['"]`, 'u').exec(helper);
    assert.ok(listener, `D16 ${event} listener is missing`);
    assert.ok(listener.index < watchdogIndex, `D16 ${event} listener must precede watchdog start`);
  }
  assert.match(helper, /shutdown\(\s*['"]SIGTERM['"]\s*,\s*1\s*\)/u);
  assert.doesNotMatch(helper, /(?:setTimeout|retry|poll)\s*\(/iu);
  assert.doesNotMatch(
    helper,
    /console\.(?:log|error)[^;\n]*(?:error|stack|path|env|credential|url|port|command|record\b(?!\.state))/iu,
  );
});

test('D14 oracle resolves only one valid owned Redis mapping and honors the host override', () => {
  assert.equal(ownedRedisUrl('127.0.0.1:49152'), 'redis://127.0.0.1:49152');
  assert.equal(
    ownedRedisUrl('0.0.0.0:49153\n[::]:49153\n', 'host.docker.internal'),
    'redis://host.docker.internal:49153',
  );
  assert.equal(ownedRedisPort('127.0.0.1:49154\n[::1]:49154'), 49154);
  for (const mappingOutput of [
    '',
    '127.0.0.1',
    '127.0.0.1:not-a-port',
    '127.0.0.1:0',
    '127.0.0.1:65536',
    '127.0.0.1:49152 trailing-data',
    '127.0.0.1:49152\n[::]:49153',
  ]) {
    assert.throws(() => ownedRedisPort(mappingOutput));
  }
  assert.throws(() => ownedRedisUrl('127.0.0.1:49152', ''));

  const contractFixture = [
    "ports:\n  - '127.0.0.1::6379'",
    "const mappingArgs = ['compose', '-f', composeFile, 'port', 'redis', '6379'];",
    "const redisHost = process.env.TESTCONTAINERS_HOST_OVERRIDE ?? '127.0.0.1';",
    'STYNX_REDIS_URL: `redis://${redisHost}:${redisPort}`',
    'while (isProcessAlive(parentPid)) { await sleep(250); }',
  ].join('\n');
  assertD14HelperContract(contractFixture, {
    scripts: { 'test:e2e': 'turbo run test:e2e --force', test: 'turbo run test' },
  });
});

test('D14 helper uses only its owned Docker-assigned Redis endpoint', () => {
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assertD14HelperContract(helper, rootManifest);
});

test('resolved root E2E graph has one preferences producer before both reference consumers', () => {
  const result = run('pnpm', [
    'exec',
    'turbo',
    'run',
    'test:e2e',
    '--dry=json',
    '--filter=./reference/*',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const graph = JSON.parse(result.stdout);
  const producers = graph.tasks.filter(({ taskId }) => taskId === '@stynx-nyx/preferences#build');
  assert.equal(producers.length, 1);
  for (const taskId of ['@stynx-nyx/reference-api#build', '@stynx-nyx/reference-web#test:e2e']) {
    const task = graph.tasks.find((entry) => entry.taskId === taskId);
    assert.ok(task, `${taskId} must be present in the resolved graph`);
    assert.ok(
      task.dependencies.includes(
        taskId.endsWith('#build')
          ? '@stynx-nyx/preferences#build'
          : '@stynx-nyx/reference-api#build',
      ),
      `${taskId} must retain its prerequisite edge`,
    );
  }
});

test('E2E task bodies and web-server helpers consume builds without nesting producers', () => {
  const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const apiManifest = JSON.parse(
    readFileSync(join(repoRoot, 'reference/api/package.json'), 'utf8'),
  );
  const webManifest = JSON.parse(
    readFileSync(join(repoRoot, 'reference/web/package.json'), 'utf8'),
  );
  const playwright = readFileSync(join(repoRoot, 'reference/web/playwright.config.mjs'), 'utf8');
  const helper = readFileSync(
    join(repoRoot, 'reference/web/scripts/serve-reference-api-stack.mjs'),
    'utf8',
  );
  assert.match(rootManifest.scripts['test:e2e'], /^turbo run test:e2e\b/u);
  for (const body of [
    apiManifest.scripts['test:e2e'],
    webManifest.scripts['test:e2e'],
    playwright,
    helper,
  ]) {
    assert.doesNotMatch(body, /(?:pnpm|npm|yarn)[^\n]*(?:reference-api|preferences)[^\n]*build/u);
  }
  assert.match(helper, /runChecked\('node', \[verifyReferenceApiBuildInputs\]\)/u);
});

test('privacy ordinary, integration, and coverage tiers resolve exact disjoint populations', () => {
  const expectedOrdinary = [
    'test/unit/privacy-runtime.spec.ts',
    'test/unit/privacy.controller.spec.ts',
    'test/unit/privacy.service.spec.ts',
    'test/wiring/privacy-http.wiring-spec.ts',
  ].sort();
  const expectedIntegration = ['test/integration/privacy.module.spec.ts'];
  const expectedAll = [...expectedOrdinary, ...expectedIntegration].sort();
  const ordinary = resolvedPrivacyPopulation('vitest.config.ts');
  const integration = resolvedPrivacyPopulation('vitest.int.config.ts');
  const coverage = resolvedPrivacyPopulation('vitest.coverage.config.ts');

  assert.equal(ordinary.length, 4);
  assert.deepEqual(ordinary, expectedOrdinary);
  assert.equal(integration.length, 1);
  assert.deepEqual(integration, expectedIntegration);
  assert.equal(coverage.length, 5);
  assert.deepEqual(coverage, expectedAll);
  assert.deepEqual(
    ordinary.filter((path) => integration.includes(path)),
    [],
  );
  assert.deepEqual([...new Set([...ordinary, ...integration])].sort(), expectedAll);

  const ordinaryConfig = readFileSync(join(privacyRoot, 'vitest.config.ts'), 'utf8');
  const integrationConfig = readFileSync(join(privacyRoot, 'vitest.int.config.ts'), 'utf8');
  const coverageConfig = readFileSync(join(privacyRoot, 'vitest.coverage.config.ts'), 'utf8');
  const withoutPopulation = (source) =>
    source.replace(/^\s*include: \[[^\n]+\],$/mu, '  include: [D13_POPULATION],');
  assert.equal(withoutPopulation(coverageConfig), withoutPopulation(ordinaryConfig));
  assert.match(ordinaryConfig, /test\/unit\/\*\*\/\*\.spec\.ts/u);
  assert.doesNotMatch(ordinaryConfig, /test\/integration/u);
  assert.match(integrationConfig, /include: \['test\/integration\/\*\*\/\*\.spec\.ts'\]/u);
  assert.match(integrationConfig, /testTimeout: 60000/u);
  assert.match(
    readFileSync(join(privacyRoot, 'test/integration/privacy.module.spec.ts'), 'utf8'),
    /timeout: 120_000/u,
  );

  const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const privacyManifest = JSON.parse(readFileSync(join(privacyRoot, 'package.json'), 'utf8'));
  const turbo = readFileSync(join(repoRoot, 'turbo.json'), 'utf8');
  assert.equal(
    rootManifest.scripts['test:int'],
    "turbo run test:int --concurrency=1 --filter='./packages/*'",
  );
  assert.doesNotMatch(rootManifest.scripts.test, /--concurrency/u);
  assert.equal(privacyManifest.scripts.test, 'vitest run --config ./vitest.config.ts');
  assert.equal(privacyManifest.scripts['test:int'], 'vitest run --config ./vitest.int.config.ts');
  assert.doesNotMatch(turbo, /"test"\s*:\s*\{[^}]*"cache"\s*:\s*false/su);
  assert.doesNotMatch(
    `${ordinaryConfig}\n${integrationConfig}\n${coverageConfig}`,
    /\b(?:sleep|retry|exclude|singleThread|sequentialFiles)\b/u,
  );
});

test('clean preferences build emits both exact exports and reference-api fails closed without declarations', () => {
  const fixture = createBuildFixture();
  const fixtureRoot = assertSafeFixtureRoot(fixture.root);
  try {
    const trackedReferenceApiDist = run('git', [
      'ls-files',
      '--',
      'reference/api/dist',
      'reference/api/dist/**',
    ]);
    assert.equal(trackedReferenceApiDist.status, 0, trackedReferenceApiDist.stderr);
    assert.equal(trackedReferenceApiDist.stdout, '');
    const fixtureApiRoot = join(fixtureRoot, 'reference/api');
    const fixtureReferenceApiDist = join(fixtureApiRoot, 'dist');
    const fixtureReferenceApiMain = join(fixtureReferenceApiDist, 'reference/api/src/main.js');
    const fixturePreferencesDist = join(fixtureRoot, 'packages/preferences/dist');
    const fixturePreferencesRuntime = join(fixturePreferencesDist, 'preferences/src/index.js');
    const fixturePreferencesDeclaration = join(
      fixturePreferencesDist,
      'preferences/src/index.d.ts',
    );
    const fixtureVerifier = join(fixtureRoot, 'scripts/verify-reference-api-build-inputs.mjs');
    const fixtureHelper = join(fixtureRoot, 'reference/web/scripts/serve-reference-api-stack.mjs');
    const frozenPaths = [
      'package.json',
      'turbo.json',
      'reference/api/package.json',
      'reference/api/tsconfig.json',
      'reference/api/src/app.module.ts',
      'reference/api/src/main.ts',
      'packages/health/src/health.controller.ts',
      'packages/health/src/health.module.ts',
      'reference/web/package.json',
      'reference/web/playwright.config.mjs',
      'reference/web/scripts/serve-reference-api-stack.mjs',
      'scripts/verify-reference-api-build-inputs.mjs',
    ];
    const frozenBytes = new Map(
      frozenPaths.map((path) => [path, readFileSync(join(fixtureRoot, path))]),
    );
    for (const [target, label] of [
      [fixtureReferenceApiDist, 'reference API output directory'],
      [fixtureReferenceApiMain, 'reference API executable'],
      [fixturePreferencesDist, 'preferences output directory'],
      [fixturePreferencesRuntime, 'preferences runtime output'],
      [fixturePreferencesDeclaration, 'preferences declaration output'],
      [fixtureVerifier, 'reference API verifier'],
      [fixtureHelper, 'reference API helper'],
    ]) {
      assert.equal(assertInsideFixture(fixtureRoot, target, label), resolve(target));
    }

    const apiManifest = JSON.parse(readFileSync(join(fixtureApiRoot, 'package.json'), 'utf8'));
    const apiTsconfig = JSON.parse(readFileSync(join(fixtureApiRoot, 'tsconfig.json'), 'utf8'));
    const helperSource = readFileSync(fixtureHelper, 'utf8');
    const helperTarget = /const referenceApiMain = resolve\(workspaceRoot, '([^']+)'\);/u.exec(
      helperSource,
    );
    assert.ok(helperTarget);
    assert.equal(resolve(fixtureRoot, helperTarget[1]), fixtureReferenceApiMain);
    assert.equal(apiManifest.scripts.start, 'node dist/reference/api/src/main.js');
    assert.equal(
      resolve(fixtureApiRoot, apiManifest.scripts.start.slice('node '.length)),
      fixtureReferenceApiMain,
    );
    const compilerRootDir = resolve(fixtureApiRoot, apiTsconfig.compilerOptions.rootDir);
    const compilerOutDir = resolve(fixtureApiRoot, apiTsconfig.compilerOptions.outDir);
    const emittedMain = join(
      compilerOutDir,
      relative(compilerRootDir, join(fixtureApiRoot, 'src/main.ts')).replace(/\.ts$/u, '.js'),
    );
    assert.equal(emittedMain, fixtureReferenceApiMain);
    assert.equal(entryExists(fixtureReferenceApiMain), false);

    const sourceAppModule = readFileSync(join(fixtureApiRoot, 'src/app.module.ts'), 'utf8');
    const sourceMain = readFileSync(join(fixtureApiRoot, 'src/main.ts'), 'utf8');
    const sourceHealthModule = readFileSync(
      join(fixtureRoot, 'packages/health/src/health.module.ts'),
      'utf8',
    );
    const sourceHealthController = readFileSync(
      join(fixtureRoot, 'packages/health/src/health.controller.ts'),
      'utf8',
    );
    assert.equal((sourceAppModule.match(/\bStynxHealthModule\.forRoot\(/gu) ?? []).length, 1);
    assert.doesNotMatch(
      `${sourceMain}\n${sourceAppModule}`,
      /\b(?:setGlobalPrefix|enableVersioning)\s*\(|\bRouterModule\b/u,
    );
    assert.match(sourceHealthModule, /controllers:\s*\[StynxHealthController\]/u);
    assert.equal((sourceHealthModule.match(/\bStynxHealthController\b/gu) ?? []).length, 2);
    assert.equal((sourceHealthController.match(/@Controller\(\)/gu) ?? []).length, 1);
    assert.equal((sourceHealthController.match(/@Get\('\/healthz'\)/gu) ?? []).length, 1);
    assert.equal((sourceHealthController.match(/@Get\('\/readyz'\)/gu) ?? []).length, 1);
    assert.match(
      sourceHealthController,
      /error instanceof HealthCheckError[\s\S]*throw new ServiceUnavailableException\(/u,
    );
    assert.doesNotMatch(sourceHealthController, /(?:NotFoundException|\b404\b)/u);
    const healthHttpSensor = readFileSync(
      join(fixtureRoot, 'packages/health/test/wiring/health-http.wiring-spec.ts'),
      'utf8',
    );
    const healthMatrixSensor = readFileSync(
      join(fixtureRoot, 'packages/health/test/integration/health.api-matrix.spec.ts'),
      'utf8',
    );
    const referenceApiSensor = readFileSync(
      join(fixtureRoot, 'reference/api/test/integration/reference-api.runtime.spec.ts'),
      'utf8',
    );
    assert.match(healthHttpSensor, /get\('\/healthz'\)\.expect\(200\)/u);
    assert.match(healthHttpSensor, /get\('\/readyz'\)\.expect\(200\)/u);
    assert.match(
      healthMatrixSensor,
      /get\('\/readyz'\)[\s\S]*?expect\(200\)[\s\S]*?get\('\/readyz'\)[\s\S]*?expect\(503\)/u,
    );
    assert.doesNotMatch(healthMatrixSensor, /get\('\/readyz'\)[^;]*expect\(404\)/u);
    assert.match(
      referenceApiSensor,
      /\.get\('\/healthz'\)\.expect\(200\);\s*await request[\s\S]*?\.get\('\/readyz'\)\.expect\(200\)/u,
    );

    const manifestEntries = readdirSync(join(fixtureRoot, 'packages'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(fixtureRoot, 'packages', entry.name, 'package.json'))
      .filter(entryExists)
      .map((path) => ({
        path,
        root: dirname(path),
        manifest: JSON.parse(readFileSync(path, 'utf8')),
      }));
    manifestEntries.push({
      path: join(fixtureApiRoot, 'package.json'),
      root: fixtureApiRoot,
      manifest: apiManifest,
    });
    const manifestsByName = new Map(manifestEntries.map((entry) => [entry.manifest.name, entry]));
    assert.equal(manifestsByName.size, manifestEntries.length);
    const closure = new Map();
    const visiting = new Set();
    const workspaceDependencies = (manifest) =>
      Object.entries({
        ...(manifest.dependencies ?? {}),
        ...(manifest.optionalDependencies ?? {}),
        ...(manifest.peerDependencies ?? {}),
        ...(manifest.devDependencies ?? {}),
      }).filter(
        ([dependency, version]) =>
          dependency.startsWith('@stynx-nyx/') && String(version).startsWith('workspace:'),
      );
    const visitRuntimeDependency = (name) => {
      assert.equal(visiting.has(name), false, `runtime workspace dependency cycle at ${name}`);
      if (closure.has(name)) return;
      const entry = manifestsByName.get(name);
      assert.ok(entry, `runtime workspace dependency manifest missing for ${name}`);
      visiting.add(name);
      for (const [dependency] of workspaceDependencies(entry.manifest)) {
        visitRuntimeDependency(dependency);
      }
      visiting.delete(name);
      closure.set(name, entry);
    };
    visitRuntimeDependency('@stynx-nyx/reference-api');
    const derivedTaskIds = [...closure.keys()].map((name) => `${name}#build`).sort();

    const installed = spawnInFixture(
      fixture,
      'corepack',
      [
        'pnpm',
        'install',
        '--offline',
        '--frozen-lockfile',
        '--ignore-scripts',
        '--filter',
        '@stynx-nyx/preferences...',
        '--filter',
        '@stynx-nyx/reference-api...',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    assert.ifError(installed.error);
    assert.equal(installed.status, 0, installed.stderr);
    removeInsideFixture(fixture, fixturePreferencesDist, { recursive: true, force: true });
    const built = spawnInFixture(
      fixture,
      'corepack',
      ['pnpm', '--filter', '@stynx-nyx/preferences', 'build'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    assert.ifError(built.error);
    assert.equal(built.status, 0, built.stderr);
    assert.equal(existsSync(fixturePreferencesRuntime), true);
    assert.equal(existsSync(fixturePreferencesDeclaration), true);
    const verified = spawnInFixture(fixture, 'node', [fixtureVerifier], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.ifError(verified.error);
    assert.equal(verified.status, 0, verified.stderr);
    const dryBuild = spawnInFixture(
      fixture,
      'corepack',
      ['pnpm', 'exec', 'turbo', 'run', 'build', '--filter=@stynx-nyx/reference-api', '--dry=json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    assert.ifError(dryBuild.error);
    assert.equal(dryBuild.status, 0, dryBuild.stderr);
    const dryGraph = JSON.parse(dryBuild.stdout);
    const graphTaskIds = dryGraph.tasks.map(({ taskId }) => taskId).sort();
    assert.equal(new Set(graphTaskIds).size, graphTaskIds.length);
    assert.deepEqual(graphTaskIds, derivedTaskIds);
    assert.equal(
      graphTaskIds.filter((taskId) => taskId === '@stynx-nyx/reference-api#build').length,
      1,
    );
    for (const [name, entry] of closure) {
      const graphTask = dryGraph.tasks.find(({ taskId }) => taskId === `${name}#build`);
      assert.ok(graphTask);
      for (const [dependency] of workspaceDependencies(entry.manifest)) {
        assert.ok(graphTask.dependencies.includes(`${dependency}#build`));
      }
    }
    const apiBuilt = spawnInFixture(
      fixture,
      'corepack',
      ['pnpm', 'exec', 'turbo', 'run', 'build', '--filter=@stynx-nyx/reference-api', '--force'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    assert.ifError(apiBuilt.error);
    assert.equal(apiBuilt.status, 0, `${apiBuilt.stderr}\n${apiBuilt.stdout}`);
    const executableStat = lstatSync(fixtureReferenceApiMain);
    assert.equal(executableStat.isFile(), true);
    assert.equal(executableStat.isSymbolicLink(), false);
    assert.equal(
      assertInsideFixture(fixtureRoot, fixtureReferenceApiMain, 'compiled executable'),
      resolve(fixtureReferenceApiMain),
    );
    const compiledMain = readFileSync(fixtureReferenceApiMain, 'utf8');
    assert.match(compiledMain, /stynx-reference-api-startup-v1/u);
    assert.deepEqual(
      [...compiledMain.matchAll(/state:\s*['"]([^'"]+)['"]/gu)].map((match) => match[1]),
      ['bootstrap-entered', 'nest-created', 'listening', 'bootstrap-failed'],
    );
    const bootstrapEnteredIndex = compiledMain.search(/state:\s*['"]bootstrap-entered['"]/u);
    const runtimeImportIndex = compiledMain.search(/import\(['"]reflect-metadata['"]\)/u);
    assert.ok(bootstrapEnteredIndex >= 0);
    assert.ok(runtimeImportIndex > bootstrapEnteredIndex);
    const runtimeTargets = new Map();
    for (const [name, entry] of closure) {
      let runtimeTarget;
      if (name === '@stynx-nyx/reference-api') {
        assert.equal(entry.manifest.scripts.start, 'node dist/reference/api/src/main.js');
        runtimeTarget = entry.manifest.scripts.start.slice('node '.length);
      } else {
        assert.equal(typeof entry.manifest.main, 'string');
        const rootExport = entry.manifest.exports?.['.'];
        assert.equal(typeof rootExport, 'object');
        assert.equal(rootExport.require, `./${entry.manifest.main}`);
        assert.equal(rootExport.default, `./${entry.manifest.main}`);
        runtimeTarget = entry.manifest.main;
      }
      const expectedRuntime = assertInsideFixture(
        fixtureRoot,
        join(entry.root, runtimeTarget),
        `${name} runtime target`,
      );
      const runtimeStat = lstatSync(expectedRuntime);
      assert.equal(runtimeStat.isFile(), true);
      assert.equal(runtimeStat.isSymbolicLink(), false);
      const canonicalRuntime = realpathSync(expectedRuntime);
      const canonicalDisplacement = relative(realpathSync(fixtureRoot), canonicalRuntime);
      assert.ok(
        canonicalDisplacement !== '' &&
          !canonicalDisplacement.startsWith('..') &&
          !isAbsolute(canonicalDisplacement),
      );
      runtimeTargets.set(name, expectedRuntime);
    }
    const resolvedPackages = new Set(['@stynx-nyx/reference-api']);
    for (const [importerName, entry] of closure) {
      const importerRequire = createRequire(runtimeTargets.get(importerName));
      for (const [dependencyName] of workspaceDependencies(entry.manifest)) {
        const resolvedRuntime = importerRequire.resolve(dependencyName);
        assert.equal(
          realpathSync(resolvedRuntime),
          realpathSync(runtimeTargets.get(dependencyName)),
        );
        assert.deepEqual(
          readFileSync(resolvedRuntime),
          readFileSync(runtimeTargets.get(dependencyName)),
        );
        resolvedPackages.add(dependencyName);
      }
    }
    assert.deepEqual([...resolvedPackages].sort(), [...closure.keys()].sort());
    const compiledAppModule = join(fixtureReferenceApiDist, 'reference/api/src/app.module.js');
    assert.equal(
      assertInsideFixture(fixtureRoot, compiledAppModule, 'compiled AppModule'),
      resolve(compiledAppModule),
    );
    const importProbe = spawnInFixture(
      fixture,
      process.execPath,
      [
        '-e',
        "const write=process.stdout.write.bind(process.stdout);process.stdout.write=()=>true;process.stderr.write=()=>true;try{require(process.argv[1]);write('import-pass\\n')}catch{write('import-fail\\n');process.exitCode=1}",
        compiledAppModule,
      ],
      {
        encoding: 'utf8',
        env: {},
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      },
    );
    assert.ifError(importProbe.error);
    assert.equal(importProbe.signal, null);
    assert.equal(importProbe.status, 0, 'compiled AppModule import-fail');
    assert.equal(importProbe.stdout, 'import-pass\n');
    assert.equal(importProbe.stderr, '');
    const metadataProbeSource = String.raw`
const { createRequire } = require('node:module');
const { readFileSync, realpathSync } = require('node:fs');
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = () => true;
process.stderr.write = () => true;
const codes = [
  'app-health-import',
  'health-controller',
  'health-root',
  'healthz-metadata',
  'readyz-metadata',
  'route-bootstrap',
];
let terminal = false;
function emit(code, passed) {
  if (terminal) return false;
  write(code + (passed ? '-pass' : '-fail') + '\n');
  if (!passed) {
    terminal = true;
    process.exitCode = 1;
  }
  return passed;
}
let appExports;
let healthExports;
let constants;
let common;
try {
  const fixtureRequire = createRequire(process.argv[1]);
  const healthEntry = fixtureRequire.resolve('@stynx-nyx/health');
  if (realpathSync(healthEntry) !== realpathSync(process.argv[2])) throw new Error();
  appExports = fixtureRequire(process.argv[1]);
  healthExports = fixtureRequire(healthEntry);
  constants = fixtureRequire('@nestjs/common/constants');
  common = fixtureRequire('@nestjs/common');
} catch {
  emit(codes[0], false);
}
if (!terminal) {
  const imports = Reflect.getMetadata(constants.MODULE_METADATA.IMPORTS, appExports.AppModule);
  const matches = Array.isArray(imports)
    ? imports.filter(
        (entry) =>
          entry && typeof entry === 'object' && entry.module === healthExports.StynxHealthModule,
      )
    : [];
  if (emit(codes[0], matches.length === 1)) {
    const controllers = matches[0].controllers;
    if (
      emit(
        codes[1],
        Array.isArray(controllers) &&
          controllers.length === 1 &&
          controllers[0] === healthExports.StynxHealthController,
      )
    ) {
      const controllerPath = Reflect.getMetadata(
        constants.PATH_METADATA,
        healthExports.StynxHealthController,
      );
      const normalizedControllerPath =
        typeof controllerPath === 'string'
          ? '/' + controllerPath.replace(/^\/+|\/+$/gu, '')
          : controllerPath === undefined
            ? '/'
            : null;
      if (emit(codes[2], normalizedControllerPath === '/')) {
        const liveness = healthExports.StynxHealthController.prototype.liveness;
        const readiness = healthExports.StynxHealthController.prototype.readiness;
        if (
          emit(
            codes[3],
            typeof liveness === 'function' &&
              Reflect.getMetadata(constants.METHOD_METADATA, liveness) === common.RequestMethod.GET &&
              Reflect.getMetadata(constants.PATH_METADATA, liveness) === '/healthz',
          )
        ) {
          if (
            emit(
              codes[4],
              typeof readiness === 'function' &&
                Reflect.getMetadata(constants.METHOD_METADATA, readiness) ===
                  common.RequestMethod.GET &&
                Reflect.getMetadata(constants.PATH_METADATA, readiness) === '/readyz',
            )
          ) {
            let compiledBootstrap;
            let compiledAppModule;
            try {
              compiledBootstrap = readFileSync(process.argv[3], 'utf8');
              compiledAppModule = readFileSync(process.argv[1], 'utf8');
            } catch {
              compiledBootstrap = '';
              compiledAppModule = '';
            }
            emit(
              codes[5],
              compiledBootstrap.length > 0 &&
                compiledAppModule.length > 0 &&
                !/\b(?:setGlobalPrefix|enableVersioning)\s*\(|\bRouterModule\b/u.test(
                  compiledBootstrap + '\n' + compiledAppModule,
                ),
            );
          }
        }
      }
    }
  }
}
`;
    const metadataProbe = spawnInFixture(
      fixture,
      process.execPath,
      [
        '-e',
        metadataProbeSource,
        compiledAppModule,
        runtimeTargets.get('@stynx-nyx/health'),
        fixtureReferenceApiMain,
      ],
      {
        encoding: 'utf8',
        env: {},
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      },
    );
    const expectedMetadataCodes = [
      'app-health-import-pass',
      'health-controller-pass',
      'health-root-pass',
      'healthz-metadata-pass',
      'readyz-metadata-pass',
      'route-bootstrap-pass',
    ];
    const permittedMetadataCodes = new Set(
      expectedMetadataCodes.flatMap((code) => [code, code.replace(/-pass$/u, '-fail')]),
    );
    const metadataCodes = metadataProbe.stdout.trimEnd().split('\n');
    assert.equal(metadataProbe.error === undefined, true, 'compiled metadata child spawn-fail');
    assert.equal(metadataProbe.signal, null);
    assert.equal(
      metadataCodes.every((code) => permittedMetadataCodes.has(code)),
      true,
      'compiled metadata child emitted an unapproved classification',
    );
    assert.equal(metadataProbe.stderr.length, 0, 'compiled metadata child emitted stderr');
    assert.equal(metadataProbe.status, 0, metadataCodes.at(-1));
    assert.deepEqual(metadataCodes, expectedMetadataCodes);
    for (const [path, before] of frozenBytes) {
      assert.deepEqual(readFileSync(join(fixtureRoot, path)), before);
    }
    removeInsideFixture(fixture, fixturePreferencesDeclaration, { force: true });
    const rejected = spawnInFixture(fixture, 'node', [fixtureVerifier], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.ifError(rejected.error);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /declaration output is unavailable/u);
  } finally {
    assert.ok(fixture.subprocessCwds.length >= 10);
    assert.equal(
      fixture.subprocessCwds.every((cwd) => cwd === fixtureRoot),
      true,
    );
    assert.equal(
      fixture.destructiveTargets.every((target) =>
        target === fixtureRoot
          ? true
          : relative(fixtureRoot, target) !== '' &&
            !relative(fixtureRoot, target).startsWith('..') &&
            !isAbsolute(relative(fixtureRoot, target)),
      ),
      true,
    );
    assert.equal(fixture.subprocessCwds.includes(repoRoot), false);
    assert.equal(fixture.destructiveTargets.includes(repositoryPreferencesDist), false);
    assert.equal(fixture.destructiveTargets.includes(join(repoRoot, 'reference/api/dist')), false);
    removeFixture(fixture);
    assert.equal(existsSync(fixtureRoot), false);
  }
});

test('preferences output restoration is exact across success and injected failures', () => {
  const fixture = createPreferencesFixture();
  const matrix = [];
  try {
    for (const state of ['absent', 'seeded']) {
      for (const outcome of ['success', 'command-failure', 'assertion-failure']) {
        seedPreferencesDist(fixture, state);
        const evidence = {};
        const scenario = () =>
          withPreferencesDistRestored(
            fixture,
            () => {
              mutatePreferencesDist(fixture);
              if (outcome === 'command-failure') throw new Error('injected command failure');
              if (outcome === 'assertion-failure') assert.fail('injected assertion failure');
              assert.equal(existsSync(join(fixture.distRoot, 'preferences/src/index.js')), true);
            },
            evidence,
          );
        if (outcome === 'success') {
          scenario();
        } else {
          assert.throws(scenario, new RegExp(`injected ${outcome.replace('-', ' ')}`, 'u'));
        }
        assert.deepEqual(evidence.after, evidence.before);
        assert.equal(evidence.after.digest, evidence.before.digest);
        assert.equal(evidence.restorationRequired, true);
        assert.equal(evidence.snapshotRemoved, true);
        assert.equal(entryExists(evidence.snapshotRoot), false);
        matrix.push({ state, outcome, restored: true });
      }
    }
    assert.deepEqual(matrix, [
      { state: 'absent', outcome: 'success', restored: true },
      { state: 'absent', outcome: 'command-failure', restored: true },
      { state: 'absent', outcome: 'assertion-failure', restored: true },
      { state: 'seeded', outcome: 'success', restored: true },
      { state: 'seeded', outcome: 'command-failure', restored: true },
      { state: 'seeded', outcome: 'assertion-failure', restored: true },
    ]);
    const restorationSource = [
      inventoryFixtureTree,
      snapshotPreferencesDist,
      restorePreferencesDist,
      withPreferencesDistRestored,
      seedPreferencesDist,
      mutatePreferencesDist,
    ].join('\n');
    assert.doesNotMatch(restorationSource, /\bgit\s+(?:status|diff)\b/u);
    assert.doesNotMatch(restorationSource, /\b(?:setTimeout|setInterval|sleep|retry|poll)\b/u);
    assert.doesNotMatch(
      restorationSource,
      /repositoryPreferencesDist|packages\/preferences\/dist/u,
    );
    assert.notEqual(resolve(fixture.distRoot), repositoryPreferencesDist);
    assert.throws(() => assertInsidePreferencesFixture(fixture, fixture.root, 'fixture root'));
    assert.throws(() =>
      assertInsidePreferencesFixture(fixture, join(fixture.root, '..', 'escape'), 'escape'),
    );
    assert.throws(() => snapshotPreferencesDist(fixture, join(fixture.root, 'wrong-dist')));
    const escapeLink = assertInsidePreferencesFixture(
      fixture,
      join(fixture.root, 'escape-link'),
      'escape link',
    );
    symlinkSync(repositoryPreferencesDist, escapeLink);
    assert.throws(() =>
      assertInsidePreferencesFixture(fixture, join(escapeLink, 'child'), 'symlink escape'),
    );
    fixture.destructiveTargets.push(escapeLink);
    rmSync(escapeLink, { force: true });
    assert.throws(
      () =>
        removePreferencesFixture(fixture, () => {
          throw new Error('injected cleanup failure');
        }),
      /injected cleanup failure/u,
    );
    assert.equal(entryExists(fixture.root), true);
    assert.equal(
      fixture.destructiveTargets.every(
        (target) =>
          target === fixture.root ||
          (relative(fixture.root, target) !== '' &&
            !relative(fixture.root, target).startsWith('..') &&
            !isAbsolute(relative(fixture.root, target))),
      ),
      true,
    );
    assert.equal(fixture.destructiveTargets.includes(repositoryPreferencesDist), false);
  } finally {
    removePreferencesFixture(fixture);
    assert.equal(entryExists(fixture.root), false);
  }
});

test('report-first classification distinguishes score, harness, missing, and portability failures', () => {
  for (const channel of ['stdout', 'stderr']) {
    assert.deepEqual(
      classifyMutationOutcome({
        reportState: 'normalized',
        score: 90,
        threshold: 90,
        repoRoot,
        subprocessResult: {
          error: undefined,
          signal: null,
          status: 0,
          stdout: '',
          stderr: '',
          [channel]: '/Users/example/transient-output',
        },
      }),
      { classification: 'mutation-pass' },
    );
    assert.deepEqual(
      classifyMutationOutcome({
        reportState: 'normalized',
        score: 90,
        threshold: 90,
        repoRoot,
        subprocessResult: {
          error: undefined,
          signal: null,
          status: 1,
          stdout: '',
          stderr: '',
          [channel]: '/Users/example/failed-child-output',
        },
      }),
      { classification: 'mutation-harness-failure', reason: 'rejected-workstation-path' },
    );
  }
  for (const status of [0, 1]) {
    for (const channel of ['stdout', 'stderr']) {
      assert.deepEqual(
        classifyMutationOutcome({
          reportState: 'normalized',
          score: 90,
          threshold: 90,
          repoRoot,
          subprocessResult: {
            error: undefined,
            signal: null,
            status,
            stdout: '',
            stderr: '',
            [channel]: 'github_pat_abcdefghijklmnopqrstuvwxyz0123456789',
          },
        }),
        { classification: 'mutation-harness-failure', reason: 'rejected-credential-material' },
      );
    }
  }
  assert.deepEqual(
    classifyMutationOutcome({
      reportState: 'normalized',
      score: 89.5,
      threshold: 90,
      subprocessResult: { error: undefined, signal: null, status: 1, stderr: `${repoRoot}/x` },
    }),
    { classification: 'mutation-score-failure' },
  );
  assert.deepEqual(
    classifyMutationOutcome({
      reportState: 'normalized',
      score: 90,
      threshold: 90,
      subprocessResult: { error: undefined, signal: null, status: 1, stderr: '' },
    }),
    { classification: 'mutation-harness-failure', reason: 'nonzero-exit' },
  );
  assert.deepEqual(
    classifyMutationOutcome({
      reportState: 'missing',
      subprocessResult: { error: undefined, signal: null, status: 1, stderr: '' },
    }),
    { classification: 'mutation-harness-failure', reason: 'nonzero-exit' },
  );
  assert.deepEqual(
    classifyMutationOutcome({
      reportState: 'unsafe',
      reportFailureCode: 'MUTATION_REPORT_HOST_PATH',
      subprocessResult: { error: undefined, signal: null, status: 0, stderr: '' },
    }),
    {
      classification: 'mutation-portability-failure',
      reason: 'MUTATION_REPORT_HOST_PATH',
    },
  );
});

test('mutation normalization replaces the repository root and rejects unsafe report content', () => {
  const thresholds = { break: 90, high: 100, low: 90 };
  const normalized = normalizeMutationReport(
    mutationReport(),
    thresholds,
    'packages/notifications',
    repoRoot,
  );
  assert.equal(normalized.projectRoot, '.');
  assert.deepEqual(normalized.config, {});
  assert.equal(normalized.files['src/index.ts'].source, undefined);
  assert.equal(normalized.files['src/index.ts'].mutants[0].replacement, undefined);
  assert.throws(
    () =>
      normalizeMutationReport(
        mutationReport({ path: '/Users/example/private.ts' }),
        thresholds,
        'packages/notifications',
        repoRoot,
      ),
    { code: 'MUTATION_REPORT_HOST_PATH' },
  );
  const retainedValueReport = mutationReport();
  retainedValueReport.framework.name = '/Users/example/private-framework';
  assert.throws(
    () =>
      normalizeMutationReport(retainedValueReport, thresholds, 'packages/notifications', repoRoot),
    { code: 'MUTATION_REPORT_HOST_PATH' },
  );
});

test('mutation child environment forces non-incremental execution and strips credentials', () => {
  const child = buildMutationEnvironment({
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    STRYKER_INCREMENTAL: 'true',
    NODE_AUTH_TOKEN: 'npm_examplecredential000000000',
    GITHUB_TOKEN: 'ghp_examplecredential000000000',
    AWS_SECRET_ACCESS_KEY: 'example',
    DEVAI_SIGNING_PRIVATE_KEY: 'example',
    UNRELATED_SECRET: 'example',
  });
  assert.equal(child.STRYKER_INCREMENTAL, 'false');
  assert.equal(child.PATH, process.env.PATH);
  for (const key of [
    'NODE_AUTH_TOKEN',
    'GITHUB_TOKEN',
    'AWS_SECRET_ACCESS_KEY',
    'DEVAI_SIGNING_PRIVATE_KEY',
    'UNRELATED_SECRET',
  ]) {
    assert.equal(child[key], undefined);
  }
});

test('raw mutation reports are removed after every callback exit', () => {
  const workspace = 'packages/notifications';
  const reportDirectory = join(repoRoot, workspace, 'reports/mutation');
  for (const behavior of ['return', 'throw']) {
    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(join(reportDirectory, 'mutation.json'), '{}');
    if (behavior === 'return') {
      withMutationReportCleanup(repoRoot, workspace, () => undefined);
    } else {
      assert.throws(() =>
        withMutationReportCleanup(repoRoot, workspace, () => {
          throw new Error('bounded test failure');
        }),
      );
    }
    assert.equal(existsSync(reportDirectory), false);
  }
});

test('D24.12 focused report projection enforces census, process, safety, and headroom', () => {
  const report = focusedCurrentShapeReport();
  const projected = projectFocusedMutationReport(report, repoRoot);
  assert.equal(projected.testFiles, undefined);
  const persisted = canonicalize(projected);
  for (const forbidden of [
    'source',
    'replacement',
    'statusReason',
    'coveredBy',
    'killedBy',
    'private-test-identifier',
    'github_pat_',
    '/Users/example',
  ]) {
    assert.equal(persisted.includes(forbidden), false);
  }
  assert.equal(assertFocusedEvidenceSafe(projected, repoRoot), true);
  const census = focusedMutationCensus(projected, focusedStatusTotals);
  assert.deepEqual(census, focusedCensus);
  assert.equal(assertFocusedMutationCensus(census, focusedCensus), true);
  for (const [key, value] of Object.entries(focusedCensus)) {
    for (const displacement of [-1, 1]) {
      assert.throws(
        () =>
          assertFocusedMutationCensus(
            { ...focusedCensus, [key]: value + displacement },
            focusedCensus,
          ),
        { code: 'MUTATION_FOCUSED_CENSUS' },
      );
    }
  }
  const incompleteTotals = { ...focusedStatusTotals };
  delete incompleteTotals.Pending;
  assert.throws(() => focusedMutationCensus(projected, incompleteTotals), {
    code: 'MUTATION_FOCUSED_ACCOUNTING',
  });
  assert.equal(
    assertFocusedMutationProcessResult({ errorAbsent: true, signal: null, status: 0 }, 'success'),
    true,
  );
  for (const processResult of [
    { errorAbsent: false, signal: null, status: 0 },
    { errorAbsent: true, signal: 'SIGTERM', status: 0 },
    { errorAbsent: true, signal: null, status: 1 },
    { errorAbsent: true, signal: null, status: 0, stdout: 'not retained' },
  ]) {
    assert.throws(() => assertFocusedMutationProcessResult(processResult, 'success'), {
      code: 'MUTATION_FOCUSED_PROCESS',
    });
  }
  assert.equal(
    assertFocusedMutationProcessResult({ errorAbsent: true, signal: null, status: 1 }, 'failure'),
    true,
  );
  for (const unsafe of [
    { source: 'retained' },
    { nested: { replacement: 'retained' } },
    { value: '/Users/example/retained' },
    { value: 'github_pat_abcdefghijklmnopqrstuvwxyz0123456789' },
  ]) {
    assert.throws(() => assertFocusedEvidenceSafe(unsafe, repoRoot));
  }
  const reportBytes = encodeFocusedMutationJson(
    projected,
    FOCUSED_MUTATION_LIMITS.report,
    'current-shape report',
  );
  assert.equal(reportBytes.length <= FOCUSED_MUTATION_LIMITS.syntheticReportHeadroom, true);
  assert.equal(
    (FOCUSED_MUTATION_LIMITS.report - reportBytes.length) / FOCUSED_MUTATION_LIMITS.report >= 0.25,
    true,
  );
});

test('D24.12 focused evidence bounds enforce every exact byte boundary', () => {
  const reportMax = Buffer.allocUnsafe(FOCUSED_MUTATION_LIMITS.report);
  const resultMax = Buffer.allocUnsafe(FOCUSED_MUTATION_LIMITS.result);
  const manifestMax = Buffer.allocUnsafe(FOCUSED_MUTATION_LIMITS.manifest);
  assert.equal(
    assertFocusedMutationByteBounds({
      reportBytes: reportMax,
      resultBytes: resultMax,
      manifestBytes: manifestMax,
      kind: 'success',
    }),
    FOCUSED_MUTATION_LIMITS.aggregate,
  );
  const one = Buffer.from('x');
  for (const [field, limit] of [
    ['reportBytes', FOCUSED_MUTATION_LIMITS.report],
    ['resultBytes', FOCUSED_MUTATION_LIMITS.result],
    ['manifestBytes', FOCUSED_MUTATION_LIMITS.manifest],
  ]) {
    const base = { reportBytes: one, resultBytes: one, manifestBytes: one, kind: 'success' };
    assert.doesNotThrow(() =>
      assertFocusedMutationByteBounds({ ...base, [field]: Buffer.allocUnsafe(limit - 1) }),
    );
    assert.doesNotThrow(() =>
      assertFocusedMutationByteBounds({ ...base, [field]: Buffer.allocUnsafe(limit) }),
    );
    assert.throws(
      () => assertFocusedMutationByteBounds({ ...base, [field]: Buffer.allocUnsafe(limit + 1) }),
      { code: 'MUTATION_FOCUSED_BOUNDS' },
    );
  }
  assert.doesNotThrow(() =>
    assertFocusedMutationByteBounds({
      manifestBytes: manifestMax.subarray(0, -1),
      kind: 'failure',
    }),
  );
  assert.doesNotThrow(() =>
    assertFocusedMutationByteBounds({ manifestBytes: manifestMax, kind: 'failure' }),
  );
  assert.throws(
    () =>
      assertFocusedMutationByteBounds({
        manifestBytes: Buffer.allocUnsafe(FOCUSED_MUTATION_LIMITS.manifest + 1),
        kind: 'failure',
      }),
    { code: 'MUTATION_FOCUSED_BOUNDS' },
  );
});

test('D24.12 focused publication is immutable, exact, and rollback-safe', () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'stynx-d24-12-publish-'));
  try {
    const paths = focusedAttempt(root);
    const report = focusedFile(paths.reportName, { kind: 'report', total: 808 }, 4096);
    const result = focusedFile(paths.resultName, { kind: 'result', scored: 428 }, 4096);
    const manifest = focusedFile(paths.manifestName, {
      kind: 'manifest',
      paths: paths.relative,
      reportDigest: report.digest,
      resultDigest: result.digest,
    });
    const files = [report, result, manifest];
    const byteSet = {
      reportBytes: report.bytes,
      resultBytes: result.bytes,
      manifestBytes: manifest.bytes,
    };
    const phases = [];
    assert.deepEqual(
      publishFocusedMutationEvidence({
        paths,
        files,
        byteSet,
        validateCandidate: (phase) => phases.push(phase),
      }),
      paths.relative,
    );
    assert.deepEqual(phases, ['before-write', 'before-publication', 'after-publication']);
    assert.equal(lstatSync(paths.finalDirectory).mode & 0o777, 0o700);
    assert.equal(existsSync(paths.stageDirectory), false);
    assert.deepEqual(
      readdirSync(paths.finalDirectory).sort(),
      files.map(({ name }) => name).sort(),
    );
    for (const entry of files) {
      const path = join(paths.finalDirectory, entry.name);
      const bytes = readFileSync(path);
      assert.equal(lstatSync(path).mode & 0o777, 0o600);
      assert.deepEqual(bytes, entry.bytes);
      assert.equal(sha256Hex(bytes), entry.digest);
    }
    const successInventory = focusedInventory(paths.finalDirectory);
    assert.throws(
      () =>
        publishFocusedMutationEvidence({
          paths,
          files,
          byteSet,
          validateCandidate: () => undefined,
        }),
      { code: 'MUTATION_FOCUSED_COLLISION' },
    );
    const sameAttemptFailure = focusedAttempt(root, { kind: 'failure', pid: 7002 });
    const failureManifest = focusedFile(sameAttemptFailure.manifestName, { kind: 'failure' });
    assert.throws(
      () =>
        publishFocusedMutationEvidence({
          paths: sameAttemptFailure,
          files: [failureManifest],
          byteSet: { manifestBytes: failureManifest.bytes },
          validateCandidate: () => undefined,
        }),
      { code: 'MUTATION_FOCUSED_COLLISION' },
    );
    const separateFailure = focusedAttempt(root, { kind: 'failure', digest: 'd'.repeat(64) });
    const separateManifest = focusedFile(separateFailure.manifestName, { kind: 'failure' });
    publishFocusedMutationEvidence({
      paths: separateFailure,
      files: [separateManifest],
      byteSet: { manifestBytes: separateManifest.bytes },
      validateCandidate: () => undefined,
    });
    assert.deepEqual(focusedInventory(paths.finalDirectory), successInventory);
    assert.equal(
      lstatSync(join(separateFailure.finalDirectory, separateManifest.name)).mode & 0o777,
      0o600,
    );
    assert.throws(
      () =>
        publishFocusedMutationEvidence({
          paths: separateFailure,
          files: [separateManifest],
          byteSet: { manifestBytes: separateManifest.bytes },
          validateCandidate: () => undefined,
        }),
      { code: 'MUTATION_FOCUSED_COLLISION' },
    );

    const inject = (label, fileSystem, validateCandidate = () => undefined) => {
      const injectedPaths = focusedAttempt(root, {
        digest: sha256Hex(label),
        pid: 7100 + label.length,
      });
      const injectedReport = focusedFile(injectedPaths.reportName, { label, kind: 'report' }, 4096);
      const injectedResult = focusedFile(injectedPaths.resultName, { label, kind: 'result' }, 4096);
      const injectedManifest = focusedFile(injectedPaths.manifestName, { label, kind: 'manifest' });
      assert.throws(() =>
        publishFocusedMutationEvidence({
          paths: injectedPaths,
          files: [injectedReport, injectedResult, injectedManifest],
          byteSet: {
            reportBytes: injectedReport.bytes,
            resultBytes: injectedResult.bytes,
            manifestBytes: injectedManifest.bytes,
          },
          validateCandidate,
          fileSystem,
        }),
      );
      assert.deepEqual(focusedInventory(paths.finalDirectory), successInventory);
      return injectedPaths;
    };
    inject('write', {
      ...FOCUSED_MUTATION_FILE_SYSTEM,
      writeFileSync: () => {
        throw new Error('injected write');
      },
    });
    let closeInjected = false;
    inject('close', {
      ...FOCUSED_MUTATION_FILE_SYSTEM,
      closeSync: (descriptor) => {
        if (!closeInjected) {
          closeInjected = true;
          throw new Error('injected close');
        }
        FOCUSED_MUTATION_FILE_SYSTEM.closeSync(descriptor);
      },
    });
    inject('chmod', {
      ...FOCUSED_MUTATION_FILE_SYSTEM,
      chmodSync: () => {
        throw new Error('injected chmod');
      },
    });
    inject('rename', {
      ...FOCUSED_MUTATION_FILE_SYSTEM,
      renameSync: () => {
        throw new Error('injected rename');
      },
    });
    const digestPaths = focusedAttempt(root, { digest: 'f'.repeat(64), pid: 7199 });
    const digestReport = focusedFile(digestPaths.reportName, { kind: 'report' }, 4096);
    const digestResult = focusedFile(digestPaths.resultName, { kind: 'result' }, 4096);
    const digestManifest = focusedFile(digestPaths.manifestName, { kind: 'manifest' });
    assert.throws(
      () =>
        publishFocusedMutationEvidence({
          paths: digestPaths,
          files: [{ ...digestReport, digest: '0'.repeat(64) }, digestResult, digestManifest],
          byteSet: {
            reportBytes: digestReport.bytes,
            resultBytes: digestResult.bytes,
            manifestBytes: digestManifest.bytes,
          },
          validateCandidate: () => undefined,
        }),
      { code: 'MUTATION_FOCUSED_DIGEST' },
    );
    assert.equal(existsSync(digestPaths.stageDirectory), false);
    for (const phase of ['before-write', 'before-publication', 'after-publication']) {
      const injectedPaths = inject(`candidate-${phase}`, FOCUSED_MUTATION_FILE_SYSTEM, (actual) => {
        if (actual === phase) throw new Error(`injected ${phase}`);
      });
      assert.equal(existsSync(injectedPaths.finalDirectory), phase === 'after-publication');
      if (phase === 'after-publication') {
        assert.deepEqual(
          readdirSync(injectedPaths.finalDirectory).sort(),
          [injectedPaths.manifestName, injectedPaths.reportName, injectedPaths.resultName].sort(),
        );
      }
      assert.equal(existsSync(injectedPaths.stageDirectory), false);
    }
    const boundPaths = focusedAttempt(root, { digest: 'e'.repeat(64), pid: 7200 });
    const boundReport = focusedFile(boundPaths.reportName, { kind: 'report' }, 4096);
    const boundResult = focusedFile(boundPaths.resultName, { kind: 'result' }, 4096);
    const boundManifest = focusedFile(boundPaths.manifestName, { kind: 'manifest' });
    assert.throws(
      () =>
        publishFocusedMutationEvidence({
          paths: boundPaths,
          files: [boundReport, boundResult, boundManifest],
          byteSet: {
            reportBytes: boundReport.bytes,
            resultBytes: boundResult.bytes,
            manifestBytes: Buffer.allocUnsafe(FOCUSED_MUTATION_LIMITS.manifest + 1),
          },
          validateCandidate: () => undefined,
        }),
      { code: 'MUTATION_FOCUSED_BOUNDS' },
    );
    assert.equal(existsSync(boundPaths.stageDirectory), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('D24.12 focused paths reject containment, symlink, collision, file, and mode faults', () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'stynx-d24-12-paths-'));
  try {
    const sibling = focusedAttempt(root);
    assert.equal(
      relative(resolve(root, FULL_MUTATION_ARTIFACT_ROOT), sibling.focusedRoot).startsWith('..'),
      true,
    );
    assert.throws(
      () =>
        focusedMutationAttemptPaths({
          repoRoot: root,
          packageStem: 'packages-worklist',
          commit: focusedCommit,
          diffDigest: focusedDiffDigest,
          kind: 'success',
          artifactRoot: '../escape',
        }),
      { code: 'MUTATION_REPORT_PATH' },
    );
    for (const artifactRoot of [
      FULL_MUTATION_ARTIFACT_ROOT,
      `${FULL_MUTATION_ARTIFACT_ROOT}/nested`,
    ]) {
      assert.throws(
        () =>
          focusedMutationAttemptPaths({
            repoRoot: root,
            packageStem: 'packages-worklist',
            commit: focusedCommit,
            diffDigest: focusedDiffDigest,
            kind: 'success',
            artifactRoot,
          }),
        { code: 'MUTATION_FOCUSED_PATH' },
      );
    }
    const outside = mkdtempSync(join(realpathSync(tmpdir()), 'stynx-d24-12-outside-'));
    mkdirSync(join(root, '.devai/state/check-cache/v1/artifacts'), { recursive: true });
    symlinkSync(outside, sibling.focusedRoot);
    assert.throws(() => assertFocusedMutationAttemptAvailable(sibling), {
      code: 'MUTATION_FOCUSED_SYMLINK',
    });
    rmSync(sibling.focusedRoot, { force: true });
    rmSync(outside, { recursive: true, force: true });

    const fileFault = (label, overrides, expectedCode) => {
      const paths = focusedAttempt(root, { digest: sha256Hex(label), pid: 7300 + label.length });
      const report = focusedFile(paths.reportName, { label, kind: 'report' }, 4096);
      const result = focusedFile(paths.resultName, { label, kind: 'result' }, 4096);
      const manifest = focusedFile(paths.manifestName, { label, kind: 'manifest' });
      assert.throws(
        () =>
          publishFocusedMutationEvidence({
            paths,
            files: [report, result, manifest],
            byteSet: {
              reportBytes: report.bytes,
              resultBytes: result.bytes,
              manifestBytes: manifest.bytes,
            },
            validateCandidate: () => undefined,
            fileSystem: { ...FOCUSED_MUTATION_FILE_SYSTEM, ...overrides(paths) },
          }),
        { code: expectedCode },
      );
      return paths;
    };
    fileFault(
      'extra-file',
      (paths) => ({
        readdirSync: (path) => {
          const names = FOCUSED_MUTATION_FILE_SYSTEM.readdirSync(path);
          return path === paths.stageDirectory ? [...names, 'extra.json'] : names;
        },
      }),
      'MUTATION_FOCUSED_FILES',
    );
    fileFault(
      'stage-symlink',
      (paths) => ({
        lstatSync: (path) => {
          const metadata = FOCUSED_MUTATION_FILE_SYSTEM.lstatSync(path);
          if (path.startsWith(`${paths.stageDirectory}/`)) {
            return { ...metadata, isFile: () => true, isSymbolicLink: () => true };
          }
          return metadata;
        },
      }),
      'MUTATION_FOCUSED_MODE',
    );
    const wrongFinal = fileFault(
      'wrong-final-mode',
      (paths) => ({
        lstatSync: (path) => {
          const metadata = FOCUSED_MUTATION_FILE_SYSTEM.lstatSync(path);
          if (path.startsWith(`${paths.finalDirectory}/`)) {
            return {
              ...metadata,
              mode: (metadata.mode & ~0o777) | 0o644,
              isFile: () => true,
              isSymbolicLink: () => false,
            };
          }
          return metadata;
        },
      }),
      'MUTATION_FOCUSED_MODE',
    );
    assert.equal(existsSync(wrongFinal.finalDirectory), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('D24.12 focused candidate rejects index, population, mode, identity, digest, and input drift', () => {
  const fixture = focusedCandidateFixture();
  try {
    const expected = fixture.capture();
    assert.equal(expected.commit, focusedCommit);
    assert.equal(expected.tree, focusedTree);
    assert.equal(expected.cleanIndex, true);
    assert.equal(expected.allowedUnstaged.length, 4);
    assert.equal(expected.diffDigest, sha256Hex(fixture.state.diffBytes));
    assert.deepEqual(expected.inputDigests, focusedInputDigests);
    assert.deepEqual(GOVERNED_MUTATION_DIFF_ARGUMENTS, [
      '-c',
      'core.abbrev=9',
      '-c',
      'color.ui=false',
      '-c',
      'diff.noprefix=false',
      '-c',
      'diff.mnemonicprefix=false',
      '-c',
      'diff.algorithm=myers',
      '-c',
      'diff.indentHeuristic=true',
      '-c',
      'core.autocrlf=false',
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--binary',
      'HEAD',
      '--',
    ]);
    fixture.state.indexStatus = 1;
    assert.throws(() => fixture.capture(), { code: 'MUTATION_FOCUSED_INDEX' });
    fixture.state.indexStatus = 0;
    const originalStatus = fixture.state.status;
    fixture.state.status += '?? fifth.ts\0';
    assert.throws(() => fixture.capture(), { code: 'MUTATION_FOCUSED_STATUS' });
    fixture.state.status = originalStatus;
    chmodSync(join(fixture.root, fixture.allowedUnstagedPaths[0]), 0o600);
    assert.throws(() => fixture.capture(), { code: 'MUTATION_FOCUSED_MODE' });
    chmodSync(join(fixture.root, fixture.allowedUnstagedPaths[0]), 0o644);
    const symlinkPath = join(fixture.root, fixture.allowedUnstagedPaths[1]);
    rmSync(symlinkPath);
    symlinkSync(join(fixture.root, fixture.allowedUnstagedPaths[0]), symlinkPath);
    assert.throws(() => fixture.capture(), { code: 'MUTATION_FOCUSED_MODE' });
    rmSync(symlinkPath);
    writeFileSync(symlinkPath, 'spec 2\n', { mode: 0o644 });
    writeFileSync(join(fixture.root, fixture.allowedUnstagedPaths[0]), 'drifted spec\n');
    const fileDrift = fixture.capture();
    assert.throws(() => assertFocusedMutationCandidate(expected, fileDrift), {
      code: 'MUTATION_FOCUSED_DRIFT',
    });
    writeFileSync(join(fixture.root, fixture.allowedUnstagedPaths[0]), 'spec 1\n');
    for (const [field, drifted] of [
      ['commit', 'd'.repeat(40)],
      ['tree', 'e'.repeat(40)],
    ]) {
      const original = fixture.state[field];
      fixture.state[field] = drifted;
      assert.throws(() => assertFocusedMutationCandidate(expected, fixture.capture()), {
        code: 'MUTATION_FOCUSED_DRIFT',
      });
      fixture.state[field] = original;
    }
    const originalDiff = fixture.state.diffBytes;
    fixture.state.diffBytes = Buffer.from('different governed diff\n');
    assert.throws(() => assertFocusedMutationCandidate(expected, fixture.capture()), {
      code: 'MUTATION_FOCUSED_DRIFT',
    });
    fixture.state.diffBytes = originalDiff;
    for (const key of Object.keys(focusedInputDigests)) {
      const original = fixture.state.inputDigests[key];
      fixture.state.inputDigests[key] = 'f'.repeat(64);
      assert.throws(() => assertFocusedMutationCandidate(expected, fixture.capture()), {
        code: 'MUTATION_FOCUSED_DRIFT',
      });
      fixture.state.inputDigests[key] = original;
    }
    delete fixture.state.inputDigests.configDigest;
    assert.throws(() => fixture.capture(), { code: 'MUTATION_FOCUSED_INPUT' });
    fixture.state.inputDigests.configDigest = focusedInputDigests.configDigest;
    const ignored = fixture.capture();
    fixture.state.ignored += '!! unexpected-cache/\0';
    const ignoredDrift = fixture.capture();
    assert.throws(() => assertFocusedMutationCandidate(ignored, ignoredDrift), {
      code: 'MUTATION_FOCUSED_IGNORED_DRIFT',
    });
    assert.equal(assertFocusedMutationCandidate(ignored, ignoredDrift, ['unexpected-cache']), true);
    fixture.state.status = ' M ../escape.ts\0';
    assert.throws(() => fixture.capture({ allowedUnstagedPaths: ['../escape.ts'] }), {
      code: 'MUTATION_REPORT_PATH',
    });
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('D24.12 focused and full-roster publication roots are mechanically independent', () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'stynx-d24-12-roots-'));
  try {
    const runnerSource = readFileSync(
      resolve(repoRoot, 'scripts/run-mutation-evidence.mjs'),
      'utf8',
    );
    const runPackageSource = runnerSource.slice(
      runnerSource.indexOf('function runPackage(entry) {'),
      runnerSource.indexOf('\nfunction runFocusedPackage'),
    );
    const compositionStart = runnerSource.indexOf('\n  if (policy) {');
    const legacyStart = runnerSource.indexOf('\n  if (!normalizeExisting) {', compositionStart);
    const fullPublisherSource = runnerSource.slice(compositionStart, legacyStart);
    assert.match(runPackageSource, /function runPackage\(entry\)/u);
    assert.doesNotMatch(runPackageSource, /FOCUSED_MUTATION_ARTIFACT_ROOT|focused-attempts/u);
    assert.match(fullPublisherSource, /mutation-composed-report-set-v1/u);
    assert.match(fullPublisherSource, /fresh|reused/u);
    assert.doesNotMatch(fullPublisherSource, /publishFocusedMutationEvidence/u);
    const focusedPaths = focusedAttempt(root);
    const focusedManifest = focusedFile(focusedPaths.manifestName, { kind: 'focused' });
    const focusedReport = focusedFile(focusedPaths.reportName, { kind: 'focused-report' }, 4096);
    const focusedResult = focusedFile(focusedPaths.resultName, { kind: 'focused-result' }, 4096);
    publishFocusedMutationEvidence({
      paths: focusedPaths,
      files: [focusedReport, focusedResult, focusedManifest],
      byteSet: {
        reportBytes: focusedReport.bytes,
        resultBytes: focusedResult.bytes,
        manifestBytes: focusedManifest.bytes,
      },
      validateCandidate: () => undefined,
    });
    const focusedBefore = focusedInventory(focusedPaths.focusedRoot);
    const fullRoot = resolve(root, FULL_MUTATION_ARTIFACT_ROOT);
    const fullStage = resolve(
      root,
      '.devai/state/check-cache/v1/artifacts/.mutation-stage-synthetic',
    );
    mkdirSync(fullStage, { recursive: true });
    const legacyReport = `${canonicalize({ kind: 'mutation-report-v1', total: 3 })}\n`;
    const legacyResult = `${canonicalize({
      kind: 'mutation-package-result-v1',
      reportDigest: sha256Hex(legacyReport),
    })}\n`;
    writeFileSync(join(fullStage, 'packages-synthetic.stryker.json'), legacyReport);
    writeFileSync(join(fullStage, 'packages-synthetic.result.json'), legacyResult);
    renameSync(fullStage, fullRoot);
    assert.equal(
      readFileSync(join(fullRoot, 'packages-synthetic.stryker.json'), 'utf8'),
      legacyReport,
    );
    assert.equal(
      readFileSync(join(fullRoot, 'packages-synthetic.result.json'), 'utf8'),
      legacyResult,
    );
    assert.equal(
      sha256Hex(readFileSync(join(fullRoot, 'packages-synthetic.stryker.json'))),
      sha256Hex(legacyReport),
    );
    assert.deepEqual(focusedInventory(focusedPaths.focusedRoot), focusedBefore);
    rmSync(fullRoot, { recursive: true, force: true });
    mkdirSync(fullStage, { recursive: true });
    writeFileSync(join(fullStage, 'summary.json'), `${canonicalize({ complete: true })}\n`);
    renameSync(fullStage, fullRoot);
    assert.deepEqual(focusedInventory(focusedPaths.focusedRoot), focusedBefore);
    assert.equal(
      relative(
        resolve(root, FULL_MUTATION_ARTIFACT_ROOT),
        resolve(root, FOCUSED_MUTATION_ARTIFACT_ROOT),
      ).startsWith('..'),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('D24.15 full-roster infrastructure preflight fails before package one', async () => {
  const mutationEvidence = await import('../../scripts/lib/mutation-evidence.mjs');
  const preflight = mutationEvidence.preflightFullMutationInfrastructure;
  assert.equal(
    typeof preflight,
    'function',
    'D24.15 requires exported injectable preflightFullMutationInfrastructure',
  );

  const sentinelEnvironment = Object.freeze({
    CI: 'true',
    STYNX_TEST_PG_HOST: 'sentinel-postgres-host.invalid',
    STYNX_TEST_PG_PORT: '65432',
    STYNX_TEST_PG_TEMPLATE: 'sentinel_template',
    STYNX_TEST_PG_USER: 'sentinel-user',
    PGHOST: 'forbidden-fallback-host.invalid',
    PGPORT: '7654',
    PGUSER: 'forbidden-fallback-user',
    PGPASSWORD: 'github_pat_forbiddenfallback000000000000',
    DATABASE_URL: 'postgresql://forbidden-user:forbidden-password@forbidden-host.invalid/forbidden',
    NODE_AUTH_TOKEN: 'inert-node-auth-marker',
    GITHUB_TOKEN: 'inert-github-token-marker',
    AWS_SECRET_ACCESS_KEY: 'forbidden-ambient-aws-secret',
    DEVAI_SIGNING_PRIVATE_KEY: 'forbidden-ambient-signing-key',
    UNRELATED_SENTINEL: 'forbidden-ambient-sentinel',
  });
  const rejectedDiagnostic =
    '/Users/example/private-workstation github_pat_forbiddendiagnostic000000000000';
  const subprocessResult = (status, { error = undefined, signal = null } = {}) => ({
    error,
    signal,
    status,
    stdout: rejectedDiagnostic,
    stderr: rejectedDiagnostic,
  });
  const fixedFailure = (reason, docker, postgres) => ({
    ok: false,
    mode: 'full-roster',
    classification: 'mutation-harness-failure',
    reason,
    packagesStarted: 0,
    preflight: { docker, postgres },
  });
  const fixtures = [];
  const invoke = ({
    missing = [],
    dockerStatus = 0,
    postgresStatus = 0,
    dockerError = undefined,
    postgresError = undefined,
    dockerSignal = null,
    postgresSignal = null,
  } = {}) => {
    const environment = { ...sentinelEnvironment };
    for (const key of missing) delete environment[key];
    const childEnvironment = buildMutationEnvironment(environment);
    const calls = [];
    const commandRun = (command, arguments_, options = {}) => {
      assert.equal(
        canonicalize(options.env) === canonicalize(childEnvironment),
        true,
        'D24.15 preflight child environment must use buildMutationEnvironment allowlist',
      );
      assert.equal(options.env.CI, 'true');
      assert.equal(options.env.STRYKER_INCREMENTAL, 'false');
      for (const key of [
        'NODE_AUTH_TOKEN',
        'GITHUB_TOKEN',
        'AWS_SECRET_ACCESS_KEY',
        'DEVAI_SIGNING_PRIVATE_KEY',
        'UNRELATED_SENTINEL',
        'PGHOST',
        'PGPORT',
        'PGUSER',
        'PGPASSWORD',
      ]) {
        assert.equal(options.env[key], undefined);
      }
      calls.push([command, [...arguments_]]);
      if (command === 'docker') {
        assert.deepEqual(arguments_, ['info']);
        return subprocessResult(dockerStatus, { error: dockerError, signal: dockerSignal });
      }
      if (command === 'pg_isready') {
        assert.deepEqual(arguments_, [
          '-h',
          environment.STYNX_TEST_PG_HOST,
          '-p',
          environment.STYNX_TEST_PG_PORT,
          '-U',
          environment.STYNX_TEST_PG_USER,
          '-d',
          environment.STYNX_TEST_PG_TEMPLATE,
        ]);
        return subprocessResult(postgresStatus, {
          error: postgresError,
          signal: postgresSignal,
        });
      }
      assert.fail(`D24.15 invoked forbidden command class: ${command}`);
    };
    const result = preflight({ environment, commandRun });
    fixtures.push({ calls, result });
    return { calls, result };
  };
  const dockerCall = [['docker', ['info']]];
  const postgresCall = [
    'pg_isready',
    [
      '-h',
      sentinelEnvironment.STYNX_TEST_PG_HOST,
      '-p',
      sentinelEnvironment.STYNX_TEST_PG_PORT,
      '-U',
      sentinelEnvironment.STYNX_TEST_PG_USER,
      '-d',
      sentinelEnvironment.STYNX_TEST_PG_TEMPLATE,
    ],
  ];

  for (const missingControl of [
    'STYNX_TEST_PG_HOST',
    'STYNX_TEST_PG_PORT',
    'STYNX_TEST_PG_USER',
    'STYNX_TEST_PG_TEMPLATE',
  ]) {
    const fixture = invoke({ missing: [missingControl] });
    assert.deepEqual(
      fixture.result,
      fixedFailure('missing-postgres-controls', 'ready', 'missing-controls'),
    );
    assert.deepEqual(fixture.calls, dockerCall);
  }
  const allMissing = invoke({
    missing: [
      'STYNX_TEST_PG_HOST',
      'STYNX_TEST_PG_PORT',
      'STYNX_TEST_PG_USER',
      'STYNX_TEST_PG_TEMPLATE',
    ],
  });
  assert.deepEqual(
    allMissing.result,
    fixedFailure('missing-postgres-controls', 'ready', 'missing-controls'),
  );
  assert.deepEqual(allMissing.calls, dockerCall);

  const dockerUnreachable = invoke({ dockerStatus: 1, postgresStatus: 1 });
  assert.deepEqual(
    dockerUnreachable.result,
    fixedFailure('docker-unreachable', 'unreachable', 'not-checked'),
  );
  assert.deepEqual(dockerUnreachable.calls, dockerCall);

  const dockerCommandError = invoke({
    dockerError: { message: rejectedDiagnostic },
    dockerStatus: null,
  });
  assert.deepEqual(
    dockerCommandError.result,
    fixedFailure('docker-unreachable', 'unreachable', 'not-checked'),
  );
  assert.deepEqual(dockerCommandError.calls, dockerCall);

  const postgresUnreachable = invoke({ postgresStatus: 1 });
  assert.deepEqual(
    postgresUnreachable.result,
    fixedFailure('postgres-unreachable', 'ready', 'unreachable'),
  );
  assert.deepEqual(postgresUnreachable.calls, [...dockerCall, postgresCall]);

  const postgresCommandSignal = invoke({ postgresSignal: 'SIGTERM', postgresStatus: null });
  assert.deepEqual(
    postgresCommandSignal.result,
    fixedFailure('postgres-unreachable', 'ready', 'unreachable'),
  );
  assert.deepEqual(postgresCommandSignal.calls, [...dockerCall, postgresCall]);

  const simultaneous = invoke({
    missing: ['STYNX_TEST_PG_HOST'],
    dockerStatus: 1,
    postgresStatus: 1,
  });
  assert.deepEqual(
    simultaneous.result,
    fixedFailure('missing-postgres-controls', 'unreachable', 'missing-controls'),
  );
  assert.deepEqual(simultaneous.calls, dockerCall);

  const success = invoke();
  assert.equal(success.result, undefined, 'successful preflight emits no new record');
  assert.deepEqual(success.calls, [...dockerCall, postgresCall]);

  for (const { calls, result } of fixtures) {
    for (const [command, arguments_] of calls) {
      assert.equal(['docker', 'pg_isready'].includes(command), true);
      assert.equal(
        arguments_.some((argument) =>
          /(?:context|run|start|create|clone|skip|retry|socket|fallback|stryker|pnpm)/iu.test(
            String(argument),
          ),
        ),
        false,
      );
    }
    if (result === undefined) continue;
    assert.deepEqual(Object.keys(result).sort(), [
      'classification',
      'mode',
      'ok',
      'packagesStarted',
      'preflight',
      'reason',
    ]);
    assert.deepEqual(Object.keys(result.preflight).sort(), ['docker', 'postgres']);
    const encoded = `${canonicalize(result)}\n`;
    assert.equal(Buffer.byteLength(encoded) <= 512, true);
    for (const forbidden of [
      ...Object.values(sentinelEnvironment),
      rejectedDiagnostic,
      '/Users/',
      'github_pat_',
      'docker info',
      'pg_isready',
    ]) {
      assert.equal(encoded.includes(forbidden), false);
    }
  }

  const helperSource = Function.prototype.toString.call(preflight);
  assert.doesNotMatch(
    helperSource,
    /(?:rmSync|renameSync|mkdirSync|writeFileSync|mutation-stage|mutation-backup|artifactRoot|runPackage|stryker|sanitizeMutationDiagnostic|classifyMutationSubprocess)/u,
  );
  assert.doesNotMatch(
    helperSource,
    /(?:docker\s+(?:context|run|start)|createdb|create\s+database|template\s+clone|setTimeout|sleep|retry|skip-package)/iu,
  );
});

test('D24.15 runner bypasses preflight only for non-executing modes', () => {
  const runnerSource = readFileSync(resolve(repoRoot, 'scripts/run-mutation-evidence.mjs'), 'utf8');
  const focusedBranch = runnerSource.indexOf('\n  if (diagnosticPackageName) {');
  const focusedExit = runnerSource.indexOf('process.exit(0);', focusedBranch);
  const compositionBranch = runnerSource.indexOf('\n  if (policy) {');
  const compositionPreflight = runnerSource.indexOf(
    'preflightFullMutationInfrastructure()',
    compositionBranch,
  );
  const packageAction = runnerSource.indexOf('freshRoster.map(runPackage)', compositionBranch);
  const preflightCall = runnerSource.lastIndexOf('preflightFullMutationInfrastructure(');
  const normalizeBypass = runnerSource.lastIndexOf('if (!normalizeExisting) {', preflightCall);
  const stagingAction = runnerSource.lastIndexOf(
    '\n  rmSync(stagingDirectory, { recursive: true, force: true });',
  );
  assert.equal(focusedBranch > 0, true);
  assert.equal(focusedExit > focusedBranch, true);
  assert.equal(preflightCall > focusedExit, true, 'focused mode must bypass full-roster preflight');
  assert.equal(
    normalizeBypass > focusedExit && normalizeBypass < preflightCall,
    true,
    '--normalize-existing must bypass full-roster infrastructure preflight',
  );
  assert.equal(preflightCall < stagingAction, true, 'preflight must precede staging action');
  assert.equal(
    compositionPreflight > compositionBranch && compositionPreflight < packageAction,
    true,
    'composition preflight must precede fresh package one',
  );
  const preflightBranch = runnerSource.slice(normalizeBypass, stagingAction);
  assert.match(preflightBranch, /if \(!normalizeExisting\) \{/u);
  assert.match(preflightBranch, /preflightFullMutationInfrastructure\(\)/u);
  assert.match(preflightBranch, /JSON\.stringify\([^)]*preflight[^)]*\)/u);
  assert.match(preflightBranch, /process\.exit\(1\)/u);
  assert.doesNotMatch(preflightBranch, /(?:runPackage|mkdirSync|rmSync|renameSync)/u);
});

test('D24.32 selective mutation refresh runs the exact governed roster and fails closed on drift', () => {
  const policy = JSON.parse(
    readFileSync(resolve(repoRoot, 'law/policy/stynx-1.1.1-mutation-reuse.json'), 'utf8'),
  );
  const { roster, failures } = discoverMutationRoster(repoRoot);
  const rosterNames = roster.map(({ packageName }) => packageName).sort();
  assert.deepEqual(failures, []);
  assert.equal(policy.kind, 'stynx-1.1.1-mutation-reuse-policy-v1');
  assert.equal(policy.freshPackages.length, 38);
  assert.equal(policy.reusedPackages.length, 0);
  assert.equal(policy.requiredFreshCount, 38);
  assert.equal(policy.requiredReusedCount, 0);
  assert.equal(new Set([...policy.freshPackages, ...policy.reusedPackages]).size, 38);
  assert.deepEqual(policy.freshPackages, rosterNames);
  assert.deepEqual(policy.candidateRebind.refreshPackages, rosterNames);
  assert.equal(policy.composedSummaryKind, 'mutation-composed-report-set-v1');

  const runnerSource = readFileSync(resolve(repoRoot, 'scripts/run-mutation-evidence.mjs'), 'utf8');
  const compositionSource = runnerSource.slice(
    runnerSource.indexOf('\n  if (policy) {'),
    runnerSource.indexOf(
      '\n  if (!normalizeExisting) {',
      runnerSource.indexOf('\n  if (policy) {'),
    ),
  );
  for (const required of [
    'stynx-1.1.1-mutation-reuse.json',
    'mutation-composed-report-set-v1',
    'freshPackages',
    'reusedPackages',
    'allowedChangedPaths',
    'summarySha256',
    'summaryBytes',
    'inputProjectionDigest',
    'baselineCommit',
    'baselineTree',
    'provenance',
  ]) {
    assert.match(runnerSource, new RegExp(required, 'u'));
  }
  assert.match(runnerSource, /git[^\n]*(?:diff|status)/u);
  assert.match(runnerSource, /canonicalize\([^)]*report/u);
  assert.match(runnerSource, /canonicalize\([^)]*result/u);
  assert.match(compositionSource, /policy\.freshPackages\.map\(\(packageName\)/u);
  assert.match(compositionSource, /freshRoster\.map\(runPackage\)/u);
  assert.doesNotMatch(compositionSource, /selectedRoster\.map\(runPackage\)/u);
  assert.match(runnerSource, /requiredFreshCount/u);
  assert.match(runnerSource, /requiredReusedCount/u);
  assert.match(runnerSource, /requiredRosterCount/u);
  assert.match(runnerSource, /process\.exit\(1\)/u);
  assert.doesNotMatch(
    runnerSource,
    /(?:skipReuseValidation|allowFifthPackage|fallbackFullRoster)/u,
  );

  const restorationSource = runnerSource.slice(
    runnerSource.indexOf('function restoreOwnedStrykerSetup'),
    runnerSource.indexOf(
      '\nfunction runPackage',
      runnerSource.indexOf('function restoreOwnedStrykerSetup'),
    ),
  );
  assert.match(
    restorationSource,
    /11ea94ed9ba49a916fb0f6cbb365e896f4ce67958009f7a4320ceebaba14febb/u,
  );
  assert.match(restorationSource, /\^stryker-setup-\\d\+\\\.js\$/u);
  assert.match(restorationSource, /stryker-setup\.js\.map/u);
  assert.match(restorationSource, /unlinkSync/u);
  assert.doesNotMatch(restorationSource, /recursive|glob|rmSync|\.stryker-tmp|coverage|dist/u);

  const packageRootStrykerHelpers = ['packages', 'packages-web'].flatMap((packageRoot) =>
    readdirSync(resolve(repoRoot, packageRoot), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) =>
        readdirSync(resolve(repoRoot, packageRoot, entry.name))
          .filter((name) => /^stryker-setup-\d+\.js$/u.test(name))
          .map((name) => `${packageRoot}/${entry.name}/${name}`),
      ),
  );
  assert.deepEqual(packageRootStrykerHelpers, []);
});

test('D24.36 protected source preserves historical inputs before exact selective refresh', () => {
  const policy = JSON.parse(
    readFileSync(resolve(repoRoot, 'law/policy/stynx-1.1.1-mutation-reuse.json'), 'utf8'),
  );
  assert.equal(policy.candidateRebind.kind, 'protected-source-selective-refresh-v1');
  assert.deepEqual(policy.candidateRebind.sourceCandidate, {
    commit: 'f8a3521a944abc4b5c8a07e1ebae8d349e549fd7',
    tree: '32a3a8fd59afcd500f9d67552081f819cba9b4d7',
  });
  assert.deepEqual(policy.candidateRebind.historicalInputCandidate, {
    commit: '6754d65f89cc9c2f23ab82f61a4b68c543f0bef4',
    tree: 'fa3f2a43eeb89e73dff04074d021e2ba1783cf84',
  });
  assert.deepEqual(
    {
      path: policy.candidateRebind.sourceSummary.path,
      bytes: policy.candidateRebind.sourceSummary.bytes,
      sha256: policy.candidateRebind.sourceSummary.sha256,
      packageCount: policy.candidateRebind.sourceSummary.packageCount,
      artifactBindingCount: policy.candidateRebind.sourceSummary.artifactBindingCount,
    },
    {
      path: '.devai/state/check-cache/v1/artifacts/mutation/summary.json',
      bytes: 37_433,
      sha256: 'd86162cf5e2055dbea7e418c18de0904bcc2d077f25def95b32e2c71a147cf70',
      packageCount: 38,
      artifactBindingCount: 76,
    },
  );
  assert.equal(
    policy.candidateRebind.sourceInputProjection.sha256,
    'f9222176e2fcde022dae67e8a776fb7de4cfb9e0eb4f85d5c0a1f2c36a86b674',
  );
  assert.equal(policy.candidateRebind.semanticRebindComparison.allowedScriptTransitions.length, 0);
  assert.deepEqual(
    policy.candidateRebind.semanticRebindComparison.sourceRootManifest,
    policy.candidateRebind.semanticRebindComparison.targetRootManifest,
  );
  assert.deepEqual(policy.candidateRebind.refreshPackages, policy.freshPackages);
  assert.equal(policy.candidateRebind.nonBehavioralPaths.length, 37);
  assert.equal(new Set(policy.candidateRebind.nonBehavioralPaths).size, 37);
  assert.equal(
    policy.candidateRebind.nonBehavioralPaths.every((path) =>
      /^(?:packages|packages-web)\/[a-z0-9-]+\/README\.md$/u.test(path),
    ),
    true,
  );
  assert.equal(policy.candidateRebind.mutationSubprocesses, 38);
  assert.equal(policy.candidateRebind.packageStarts, 38);
  assert.equal(policy.candidateRebind.sourceMaterialization.mutationSubprocesses, 0);
  assert.equal(policy.candidateRebind.sourceMaterialization.packageStarts, 0);

  const runnerSource = readFileSync(resolve(repoRoot, 'scripts/run-mutation-evidence.mjs'), 'utf8');
  const rebindStart = runnerSource.indexOf('export async function rebindCandidateComposition');
  const directStart = runnerSource.indexOf('\nif (isDirectInvocation) {', rebindStart);
  assert.notEqual(rebindStart, -1);
  assert.notEqual(directStart, -1);
  const rebindSource = runnerSource.slice(rebindStart, directStart);
  for (const required of [
    'historicalInputCandidate',
    'historicalMutationInputTreeEntries',
    'sourceRootManifest',
    'targetRootManifest',
    'sourceInputProjection',
    'artifactBindingCount',
    'publishComposedDirectory',
  ]) {
    assert.match(rebindSource, new RegExp(required, 'u'));
  }
  assert.doesNotMatch(
    rebindSource,
    /(?:preflightFullMutationInfrastructure|runPackage|stryker|freshRoster\.map|selectedRoster\.map)/iu,
  );

  const directSource = runnerSource.slice(directStart);
  const rebindCall = directSource.indexOf('await rebindCandidateComposition');
  const preflightCall = directSource.indexOf('preflightFullMutationInfrastructure(');
  const packageCall = directSource.indexOf('freshRoster.map(runPackage)');
  assert.notEqual(rebindCall, -1);
  assert.notEqual(preflightCall, -1);
  assert.notEqual(packageCall, -1);
  assert.equal(rebindCall < preflightCall, true);
  assert.equal(preflightCall < packageCall, true);
  assert.match(
    directSource.slice(rebindCall, preflightCall),
    /validationOnly: policy\.candidateRebind\.kind === 'protected-source-selective-refresh-v1'/u,
  );
  assert.doesNotMatch(
    directSource.slice(rebindCall, preflightCall),
    /validateCheapGateMarker/u,
    'protected selective refresh cannot depend on the ambient D24.32 marker',
  );
  assert.doesNotMatch(directSource.slice(rebindCall, preflightCall), /runPackage/u);
  assert.match(
    directSource.slice(packageCall),
    /validateCheapGateMarker/u,
    'the legacy D24.32 composition branch must retain its marker validator',
  );
});

test('D24.22 filesystem URLs preserve decoded space-bearing engine and Playwright paths', async () => {
  const fixtureParent = mkdtempSync(join(realpathSync(tmpdir()), 'stynx-d24-22-'));
  const engineRoot = join(fixtureParent, 'engine fixture with space');
  const playwrightRoot = join(fixtureParent, 'playwright fixture with space');
  const engineSource = readFileSync(join(repoRoot, 'scripts/check-engines.mjs'));
  const playwrightSource = readFileSync(join(repoRoot, 'reference/web/playwright.config.mjs'));
  const priorOidc = process.env.PLAYWRIGHT_USE_REAL_OIDC;
  const hadPriorOidc = Object.hasOwn(process.env, 'PLAYWRIGHT_USE_REAL_OIDC');
  let engineResult;
  let oidcOff;
  let oidcOn;

  try {
    mkdirSync(join(engineRoot, 'scripts'), { recursive: true });
    const enginePath = join(engineRoot, 'scripts/check-engines.mjs');
    writeFileSync(enginePath, engineSource);
    writeFileSync(
      join(engineRoot, 'package.json'),
      `${JSON.stringify({
        engines: { node: '>=24 <25', pnpm: '>=9 <10' },
        packageManager: 'pnpm@9.15.0',
      })}\n`,
    );
    const engineImports = [
      ...engineSource.toString('utf8').matchAll(/\bfrom\s+['"]([^'"]+)['"]/gu),
    ].map((match) => match[1]);
    assert.equal(engineImports.length > 0, true);
    assert.equal(
      engineImports.every(
        (specifier) =>
          specifier.startsWith('node:') && ['node:fs', 'node:path', 'node:url'].includes(specifier),
      ),
      true,
    );
    engineResult = spawnSync(process.execPath, [enginePath], {
      cwd: engineRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    mkdirSync(join(playwrightRoot, 'node_modules/@playwright/test'), { recursive: true });
    const playwrightPath = join(playwrightRoot, 'playwright.config.mjs');
    writeFileSync(playwrightPath, playwrightSource);
    writeFileSync(
      join(playwrightRoot, 'node_modules/@playwright/test/package.json'),
      `${JSON.stringify({
        name: '@playwright/test',
        type: 'module',
        exports: './index.mjs',
      })}\n`,
    );
    writeFileSync(
      join(playwrightRoot, 'node_modules/@playwright/test/index.mjs'),
      'export const defineConfig = (value) => value;\n',
    );
    const oidcOffUrl = pathToFileURL(playwrightPath);
    oidcOffUrl.searchParams.set('d24_22', 'oidc-off');
    const oidcOnUrl = pathToFileURL(playwrightPath);
    oidcOnUrl.searchParams.set('d24_22', 'oidc-on');
    delete process.env.PLAYWRIGHT_USE_REAL_OIDC;
    oidcOff = (await import(oidcOffUrl.href)).default;
    process.env.PLAYWRIGHT_USE_REAL_OIDC = '1';
    oidcOn = (await import(oidcOnUrl.href)).default;
  } finally {
    if (hadPriorOidc) process.env.PLAYWRIGHT_USE_REAL_OIDC = priorOidc;
    else delete process.env.PLAYWRIGHT_USE_REAL_OIDC;
    rmSync(fixtureParent, { recursive: true, force: false });
  }

  assert.equal(existsSync(fixtureParent), false, 'D24.22 fixture root must be removed');
  assert.equal(
    hadPriorOidc
      ? process.env.PLAYWRIGHT_USE_REAL_OIDC === priorOidc
      : Object.hasOwn(process.env, 'PLAYWRIGHT_USE_REAL_OIDC') === false,
    true,
    'D24.22 must restore PLAYWRIGHT_USE_REAL_OIDC',
  );
  const decodedPlaywrightRoot = fileURLToPath(
    new URL('.', pathToFileURL(join(playwrightRoot, 'playwright.config.mjs'))),
  );
  const projectServer = (entry) => ({
    keys: Object.keys(entry).sort(),
    command: entry.command,
    cwd: entry.cwd === decodedPlaywrightRoot ? 'decoded-fixture-directory' : 'not-decoded',
    url: entry.url ?? null,
    port: entry.port ?? null,
    wait:
      entry.wait === undefined
        ? null
        : {
            keys: Object.keys(entry.wait).sort(),
            stderrSource: entry.wait.stderr?.source ?? null,
            stderrFlags: entry.wait.stderr?.flags ?? null,
          },
    reuseExistingServer: entry.reuseExistingServer,
    timeout: entry.timeout,
  });
  const oidcServer = {
    keys: ['command', 'cwd', 'reuseExistingServer', 'timeout', 'url'],
    command: 'node scripts/serve-fake-oidc.mjs',
    cwd: 'decoded-fixture-directory',
    url: 'http://127.0.0.1:3200/readyz',
    port: null,
    wait: null,
    reuseExistingServer: true,
    timeout: 30_000,
  };
  const apiServer = {
    keys: ['command', 'cwd', 'reuseExistingServer', 'timeout', 'url', 'wait'],
    command: 'node scripts/serve-reference-api-stack.mjs',
    cwd: 'decoded-fixture-directory',
    url: 'http://127.0.0.1:3000/readyz',
    port: null,
    wait: {
      keys: ['stderr'],
      stderrSource: playwrightApiReadyWaitSource,
      stderrFlags: 'm',
    },
    reuseExistingServer: true,
    timeout: 300_000,
  };
  const staticServer = {
    keys: ['command', 'cwd', 'port', 'reuseExistingServer', 'timeout'],
    command: 'pnpm build:web && PORT=3100 node scripts/serve-static.mjs',
    cwd: 'decoded-fixture-directory',
    url: null,
    port: 3100,
    wait: null,
    reuseExistingServer: true,
    timeout: 120_000,
  };
  const compensatingDecoder = /(?:decodeURI(?:Component)?|replace(?:All)?\([^)]*%20)/u;
  const engineText = engineSource.toString('utf8');
  const playwrightText = playwrightSource.toString('utf8');
  assert.deepEqual(
    {
      engine: {
        copiedBytesExact: readFileSync(join(repoRoot, 'scripts/check-engines.mjs')).equals(
          engineSource,
        ),
        errorAbsent: engineResult.error === undefined,
        status: engineResult.status,
        signal: engineResult.signal,
        stderrEmpty: engineResult.stderr === '',
        stdoutExact:
          engineResult.stdout ===
          `[engines][ok] node ${process.versions.node}; pnpm >=9 <10; Angular 21.2.19; NestJS ^11.1.19; TypeScript ^6.0.3/5.9.3\n`,
      },
      playwright: {
        copiedBytesExact: readFileSync(
          join(repoRoot, 'reference/web/playwright.config.mjs'),
        ).equals(playwrightSource),
        oidcOffPopulation: oidcOff.webServer.length,
        oidcOff: oidcOff.webServer.map(projectServer),
        oidcOnPopulation: oidcOn.webServer.length,
        oidcOn: oidcOn.webServer.map(projectServer),
      },
      staticSafety: {
        enginePathnameCount: engineText.match(/\.pathname\b/gu)?.length ?? 0,
        playwrightPathnameCount: playwrightText.match(/\.pathname\b/gu)?.length ?? 0,
        engineCompensatingDecoder: compensatingDecoder.test(engineText),
        playwrightCompensatingDecoder: compensatingDecoder.test(playwrightText),
      },
    },
    {
      engine: {
        copiedBytesExact: true,
        errorAbsent: true,
        status: 0,
        signal: null,
        stderrEmpty: true,
        stdoutExact: true,
      },
      playwright: {
        copiedBytesExact: true,
        oidcOffPopulation: 2,
        oidcOff: [apiServer, staticServer],
        oidcOnPopulation: 3,
        oidcOn: [oidcServer, apiServer, staticServer],
      },
      staticSafety: {
        enginePathnameCount: 0,
        playwrightPathnameCount: 0,
        engineCompensatingDecoder: false,
        playwrightCompensatingDecoder: false,
      },
    },
  );
});

test('notifications keeps the exact roster membership, break floor, and mutate population', async () => {
  const { roster, failures } = discoverMutationRoster(repoRoot);
  assert.deepEqual(failures, []);
  assert.equal(roster.length, 38);
  const notifications = roster.find(
    ({ packageName }) => packageName === '@stynx-nyx/notifications',
  );
  assert.ok(notifications);
  assert.equal(notifications.thresholds.break, 90);
  assert.equal(
    roster.filter(({ packageName }) => packageName === notifications.packageName).length,
    1,
  );
  const config = (await import('../../packages/notifications/stryker.conf.mjs')).default;
  assert.deepEqual(config.mutate, expectedNotificationsMutate);
});
