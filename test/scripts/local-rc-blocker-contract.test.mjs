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
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  buildMutationEnvironment,
  classifyMutationOutcome,
  normalizeMutationReport,
  withMutationReportCleanup,
} from '../../scripts/lib/mutation-evidence.mjs';
import { discoverMutationRoster } from '../../scripts/lib/mutation-roster.mjs';

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

function fixedStartupOutput(code) {
  assert.ok(
    [
      ...helperSuccessStates,
      ...startupSuccessStates,
      ...startupFailureReasons.map((reason) => `bootstrap-failed:${reason}`),
      ...startupChildTerminals,
      ...runtimeRouteTableStates,
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
      expectedCodes: ['helper-entered'],
      expectedDockerActions: ['up', 'down'],
    },
    {
      name: 'redis-mapping',
      expectedCodes: ['helper-entered', 'compose-ready'],
      expectedDockerActions: ['up', 'port', 'down'],
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
  const childActions = ['up', 'port', 'verify', 'api', 'watchdog'];
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
      actions: ['up', 'port', 'verify', 'down'],
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
  const childActions = ['up', 'port', 'verify', 'api', 'watchdog'];
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

test('D16.1 freezes main, Playwright, tasks, manifests, ports, timeouts, and D14', () => {
  const frozen = {
    'reference/api/src/main.ts': 'c6175bfa1f231730a0c339a8f48fd28a7a04c1c3f6f60de643ae4b767bf7c7a9',
    'reference/web/playwright.config.mjs':
      'af051b2fdaf1223c03d3a73fe621b9a389dd3158908648f0164c7544f565be5b',
    'package.json': '07f672f29660f90cb9480a7ff395463f5ccb08ecd5f74e61869391ef1653b47c',
    'reference/api/package.json':
      'bffedbee254dde969ae2a2a77689587fa9f553f0b9df2b869bd2b8fe910a5b64',
    'reference/web/package.json':
      'b1e3b617a0db97bc380dc7577700460e6fa1bbe1e64f54146e0e80943df37b0c',
    'turbo.json': 'd32a54129f37eb21a86d346cfcf09eb914cda06ebdc5166c432a9f23c67db467',
  };
  for (const [path, digest] of Object.entries(frozen)) {
    const source = readFileSync(join(repoRoot, path), 'utf8');
    assert.equal(
      createHash('sha256')
        .update(
          path === 'reference/api/src/main.ts'
            ? frozenMainWithoutRuntimeRouteTableInspection(source)
            : source,
        )
        .digest('hex'),
      digest,
    );
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
