import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
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
        'packages',
        'reference/api/package.json',
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
  const fixturePreferencesDist = join(fixtureRoot, 'packages/preferences/dist');
  const fixturePreferencesRuntime = join(fixturePreferencesDist, 'preferences/src/index.js');
  const fixturePreferencesDeclaration = join(fixturePreferencesDist, 'preferences/src/index.d.ts');
  const fixtureVerifier = join(fixtureRoot, 'scripts/verify-reference-api-build-inputs.mjs');
  for (const [target, label] of [
    [fixturePreferencesDist, 'preferences output directory'],
    [fixturePreferencesRuntime, 'preferences runtime output'],
    [fixturePreferencesDeclaration, 'preferences declaration output'],
    [fixtureVerifier, 'reference API verifier'],
  ]) {
    assert.equal(assertInsideFixture(fixtureRoot, target, label), resolve(target));
  }
  try {
    const installed = spawnInFixture(
      fixture,
      'pnpm',
      [
        'install',
        '--offline',
        '--frozen-lockfile',
        '--ignore-scripts',
        '--filter',
        '@stynx-nyx/preferences...',
        '--filter',
        '@stynx-nyx/reference-api',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    assert.ifError(installed.error);
    assert.equal(installed.status, 0, installed.stderr);
    removeInsideFixture(fixture, fixturePreferencesDist, { recursive: true, force: true });
    const built = spawnInFixture(
      fixture,
      'pnpm',
      ['--filter', '@stynx-nyx/preferences', 'run', 'build'],
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
    removeInsideFixture(fixture, fixturePreferencesDeclaration, { force: true });
    const rejected = spawnInFixture(fixture, 'node', [fixtureVerifier], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.ifError(rejected.error);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /declaration output is unavailable/u);
  } finally {
    assert.ok(fixture.subprocessCwds.length >= 6);
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
    removeFixture(fixture);
    assert.equal(existsSync(fixtureRoot), false);
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
