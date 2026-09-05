const {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = join(__dirname, '..', '..');
const scriptsDir = join(__dirname, '..', '..', 'scripts');
const failures = [];

for (const file of readdirSync(scriptsDir)) {
  if (!file.endsWith('.sh')) continue;
  const fullPath = join(scriptsDir, file);
  const stat = statSync(fullPath);
  if ((stat.mode & 0o111) === 0) {
    failures.push(`${file} is not executable`);
  }
  const head = readFileSync(fullPath, 'utf8').split('\n')[0];
  if (!head.startsWith('#!/usr/bin/env bash')) {
    failures.push(`${file} missing bash shebang`);
  }
}

if (failures.length) {
  console.error('Script validation failed:\n' + failures.join('\n'));
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const expectedStatus = options.status ?? 0;

  if (result.status !== expectedStatus) {
    throw new Error(
      [
        `Expected ${command} ${args.join(' ')} to exit ${expectedStatus}, got ${result.status}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return result.stdout.trim();
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`${label} missing expected text: ${expected}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertThrowsCode(callback, expectedCode, forbiddenText, label) {
  try {
    callback();
  } catch (error) {
    if (error.code !== expectedCode) {
      throw new Error(`${label}: expected ${expectedCode}, got ${String(error.code)}`, {
        cause: error,
      });
    }
    if (forbiddenText && String(error.message).includes(forbiddenText)) {
      throw new Error(`${label}: diagnostic disclosed rejected content`, { cause: error });
    }
    return;
  }
  throw new Error(`${label}: expected ${expectedCode}`);
}

function prepareVerifierRepo(config) {
  const root = mkdtempSync(join(tmpdir(), 'stynx-verifier-'));
  writeJson(join(root, 'package.json'), {
    stynx: config,
  });
  return root;
}

function runVerifierTests() {
  const apiRoot = prepareVerifierRepo({
    apiCoverage: {
      openapiPath: 'docs/framework/contracts/openapi.json',
      sourceRoots: ['src'],
      routePrefix: '',
    },
  });
  try {
    mkdirSync(join(apiRoot, 'docs', 'framework', 'contracts'), { recursive: true });
    mkdirSync(join(apiRoot, 'src'), { recursive: true });
    writeJson(join(apiRoot, 'docs', 'framework', 'contracts', 'openapi.json'), {
      paths: {
        '/v1/aits/{id}/': {},
      },
    });
    writeFileSync(
      join(apiRoot, 'src', 'ait.controller.ts'),
      [
        "import { Controller, Get } from '@nestjs/common';",
        "@Controller('/v1/aits')",
        'export class AitController {',
        "  @Get(':id')",
        '  get() {}',
        '}',
        '',
      ].join('\n'),
    );
    const strict = run(
      'node',
      [join(repoRoot, 'scripts', 'verify-api-coverage.mjs'), '--strict', '--json'],
      {
        cwd: apiRoot,
      },
    );
    assertIncludes(strict, '"parameterNameMismatches": []', 'api strict output');
    assertIncludes(strict, '"missingInCode": []', 'api strict output');

    writeJson(join(apiRoot, 'docs', 'framework', 'contracts', 'openapi.json'), {
      paths: {
        '/v1/aits/{id}/events': {},
      },
    });
    const failed = run(
      'node',
      [join(repoRoot, 'scripts', 'verify-api-coverage.mjs'), '--strict', '--json'],
      {
        cwd: apiRoot,
        status: 1,
      },
    );
    assertIncludes(failed, '"path": "/v1/aits/{id}/events"', 'api strict failure');
    assertIncludes(failed, '"normalized": "/v1/aits/{}/events"', 'api strict failure');
  } finally {
    rmSync(apiRoot, { recursive: true, force: true });
  }

  const dbRoot = prepareVerifierRepo({
    dbAcceptance: {
      ddlPaths: ['database/ddl/*.sql'],
      seedPaths: ['database/seed/*.sql'],
      seedGroups: {
        base: ['database/seed/base/*.sql'],
      },
      requiredSchemas: ['audit'],
      requireSeeds: true,
    },
  });
  try {
    mkdirSync(join(dbRoot, 'database', 'ddl'), { recursive: true });
    mkdirSync(join(dbRoot, 'database', 'seed', 'base'), { recursive: true });
    writeFileSync(join(dbRoot, 'database', 'ddl', '001.sql'), 'create schema audit;\n');
    writeFileSync(join(dbRoot, 'database', 'seed', '001.sql'), 'select 1;\n');
    writeFileSync(join(dbRoot, 'database', 'seed', 'base', '001.sql'), 'select 1;\n');
    const ok = run('node', [join(repoRoot, 'scripts', 'verify-db-acceptance.mjs'), '--json'], {
      cwd: dbRoot,
    });
    assertIncludes(ok, '"seedFiles": [', 'db acceptance output');
    assertIncludes(ok, '"name": "base"', 'db acceptance output');

    rmSync(join(dbRoot, 'database', 'seed'), { recursive: true, force: true });
    const failed = run('node', [join(repoRoot, 'scripts', 'verify-db-acceptance.mjs'), '--json'], {
      cwd: dbRoot,
      status: 1,
    });
    assertIncludes(failed, 'no seed files matched', 'db acceptance failure');
    assertIncludes(failed, 'no seed files matched for group base', 'db acceptance failure');
  } finally {
    rmSync(dbRoot, { recursive: true, force: true });
  }
}

async function runMutationEvidenceTests() {
  const mutationEvidence = await import('../../scripts/lib/mutation-evidence.mjs');
  const mutationRoster = await import('../../scripts/lib/mutation-roster.mjs');

  const syntheticToken = `ghp_${'A'.repeat(36)}`;
  const childEnvironment = mutationEvidence.buildMutationEnvironment({
    PATH: '/usr/bin:/bin',
    HOME: '/tmp/stynx-inspector-home',
    CI: 'true',
    NO_COLOR: '1',
    DATABASE_URL: 'postgresql://localhost/stynx',
    STYNX_TEST_PG_PORT: '5432',
    NODE_AUTH_TOKEN: syntheticToken,
    NPM_TOKEN: syntheticToken,
    GITHUB_TOKEN: syntheticToken,
    DEVAI_SIGNING_PRIVATE_KEY: 'synthetic-private-key',
  });
  assertEqual(childEnvironment.PATH, '/usr/bin:/bin', 'mutation PATH bootstrap');
  assertEqual(childEnvironment.CI, 'true', 'mutation CI bootstrap');
  assertEqual(
    childEnvironment.DATABASE_URL,
    'postgresql://localhost/stynx',
    'mutation database allowlist',
  );
  assertEqual(childEnvironment.STYNX_TEST_PG_PORT, '5432', 'mutation PostgreSQL allowlist');
  assertEqual(childEnvironment.STRYKER_INCREMENTAL, 'false', 'mutation incremental mode');
  assertEqual(
    childEnvironment.NODE_AUTH_TOKEN,
    undefined,
    'mutation registry credential isolation',
  );
  assertEqual(childEnvironment.NPM_TOKEN, undefined, 'mutation npm credential isolation');
  assertEqual(childEnvironment.GITHUB_TOKEN, undefined, 'mutation GitHub credential isolation');
  assertEqual(
    childEnvironment.DEVAI_SIGNING_PRIVATE_KEY,
    undefined,
    'mutation signing-key isolation',
  );

  const thresholds = { break: 90, high: 95, low: 85 };
  const baseReport = {
    config: { testRunner: 'vitest' },
    files: { 'packages/example/src/index.ts': { mutants: [] } },
    framework: { name: 'Stryker', version: '9.6.1' },
    projectRoot: repoRoot,
    testFiles: { 'packages/example/test/index.spec.ts': {} },
    thresholds,
  };
  const normalized = mutationEvidence.normalizeMutationReport(
    baseReport,
    thresholds,
    'packages/example',
    repoRoot,
  );
  assertEqual(normalized.projectRoot, '.', 'exact repository-root normalization');

  const diagnosticReport = structuredClone(baseReport);
  diagnosticReport.files['packages/example/src/index.ts'].source =
    "export const fixture = '/tmp/domain-fixture';";
  diagnosticReport.testFiles['packages/example/test/index.spec.ts'] = {
    source: "expect(value).toBe('/Users/T/domain-fixture');",
    tests: [{ id: 'test-1', name: 'domain fixture' }],
  };
  diagnosticReport.files['packages/example/src/index.ts'].mutants.push({
    id: '1',
    replacement: "'/tmp/domain-fixture'",
    status: 'Killed',
    statusReason: 'expected /Users/T/log_2025_01.sql.gz to be rejected by the domain',
  });
  const normalizedDiagnosticReport = mutationEvidence.normalizeMutationReport(
    diagnosticReport,
    thresholds,
    'packages/example',
    repoRoot,
  );
  assertEqual(
    normalizedDiagnosticReport.files['packages/example/src/index.ts'].mutants[0].statusReason,
    undefined,
    'non-evidentiary mutation diagnostic exclusion',
  );
  assertEqual(
    normalizedDiagnosticReport.files['packages/example/src/index.ts'].source,
    undefined,
    'non-evidentiary mutated-source exclusion',
  );
  assertEqual(
    normalizedDiagnosticReport.files['packages/example/src/index.ts'].mutants[0].replacement,
    undefined,
    'non-evidentiary mutation replacement exclusion',
  );
  assertEqual(
    normalizedDiagnosticReport.testFiles['packages/example/test/index.spec.ts'].source,
    undefined,
    'non-evidentiary test-source exclusion',
  );
  assertEqual(
    normalizedDiagnosticReport.testFiles['packages/example/test/index.spec.ts'].tests[0].id,
    'test-1',
    'portable test identity retention',
  );

  const credentialDiagnosticReport = structuredClone(baseReport);
  credentialDiagnosticReport.files['packages/example/src/index.ts'].mutants.push({
    id: '2',
    status: 'Killed',
    statusReason: `unexpected child output ${syntheticToken}`,
  });
  assertThrowsCode(
    () =>
      mutationEvidence.normalizeMutationReport(
        credentialDiagnosticReport,
        thresholds,
        'packages/example',
        repoRoot,
      ),
    'MUTATION_REPORT_CREDENTIAL_MATERIAL',
    syntheticToken,
    'mutation diagnostic credential rejection',
  );

  const credentialReport = structuredClone(baseReport);
  credentialReport.framework.detail = { token: syntheticToken };
  assertThrowsCode(
    () =>
      mutationEvidence.normalizeMutationReport(
        credentialReport,
        thresholds,
        'packages/example',
        repoRoot,
      ),
    'MUTATION_REPORT_CREDENTIAL_MATERIAL',
    syntheticToken,
    'nested mutation credential rejection',
  );

  const hostPath = '/Users/inspector/private/stynx/report.json';
  const hostPathReport = structuredClone(baseReport);
  hostPathReport.framework.detail = { reportPath: hostPath };
  assertThrowsCode(
    () =>
      mutationEvidence.normalizeMutationReport(
        hostPathReport,
        thresholds,
        'packages/example',
        repoRoot,
      ),
    'MUTATION_REPORT_HOST_PATH',
    hostPath,
    'nested mutation host-path rejection',
  );

  const cleanupRoot = mkdtempSync(join(tmpdir(), 'stynx-mutation-cleanup-'));
  const rawReportDirectory = join(cleanupRoot, 'packages', 'example', 'reports', 'mutation');
  try {
    mkdirSync(rawReportDirectory, { recursive: true });
    writeFileSync(join(rawReportDirectory, 'mutation.json'), '{}\n');
    mutationEvidence.withMutationReportCleanup(cleanupRoot, 'packages/example', () => 'ok');
    assertEqual(existsSync(rawReportDirectory), false, 'raw report cleanup after success');

    mkdirSync(rawReportDirectory, { recursive: true });
    writeFileSync(join(rawReportDirectory, 'index.html'), '<html></html>\n');
    assertThrowsCode(
      () =>
        mutationEvidence.withMutationReportCleanup(cleanupRoot, 'packages/example', () => {
          const error = new Error('synthetic mutation failure');
          error.code = 'SYNTHETIC_MUTATION_FAILURE';
          throw error;
        }),
      'SYNTHETIC_MUTATION_FAILURE',
      undefined,
      'mutation failure propagation',
    );
    assertEqual(existsSync(rawReportDirectory), false, 'raw report cleanup after failure');
  } finally {
    rmSync(cleanupRoot, { recursive: true, force: true });
  }

  const { roster, failures: rosterFailures } = mutationRoster.discoverMutationRoster(repoRoot);
  assertEqual(rosterFailures.length, 0, 'mutation roster failures');
  assertEqual(roster.length, 38, 'mutation package roster');
  const thresholdBytes = mutationRoster.canonicalize(
    roster.map(({ packageName, thresholds: packageThresholds }) => ({
      packageName,
      thresholds: packageThresholds,
    })),
  );
  assertEqual(
    createHash('sha256').update(thresholdBytes).digest('hex'),
    '4d1117ee6c016a812cd1af77442cede5adcf5e1a1f88440cc488c5e18c6becfd',
    'mutation package and threshold contract',
  );

  const workflowRoot = mkdtempSync(join(tmpdir(), 'stynx-workflow-guard-'));
  try {
    mkdirSync(join(workflowRoot, '.github', 'workflows'), { recursive: true });
    writeJson(join(workflowRoot, 'package.json'), {
      scripts: {
        'ci:remote': 'pnpm run verify:safe',
        'verify:safe': 'node scripts/verify-safe.mjs',
        'test:mutation': 'node scripts/run-mutation-evidence.mjs',
      },
    });
    writeFileSync(
      join(workflowRoot, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  verify:\n    steps:\n      - run: pnpm run ci:remote\n',
    );
    const safeResult = mutationRoster.verifyNoRemoteMutationWorkflows(workflowRoot);
    assertEqual(safeResult.workflowCount, 1, 'remote mutation workflow guard safe fixture');

    writeJson(join(workflowRoot, 'package.json'), {
      scripts: {
        'ci:remote': 'pnpm run verify:safe',
        'verify:safe': 'pnpm run test:mutation',
        'test:mutation': 'node scripts/run-mutation-evidence.mjs',
      },
    });
    assertThrowsCode(
      () => mutationRoster.verifyNoRemoteMutationWorkflows(workflowRoot),
      'REMOTE_LOCAL_ONLY_NODE',
      undefined,
      'indirect remote mutation rejection',
    );
  } finally {
    rmSync(workflowRoot, { recursive: true, force: true });
  }

  mutationRoster.verifyNoRemoteMutationWorkflows(repoRoot);
}

const forbiddenId = 'FORBID-MUTATE-INVARIANTS';
const authorizationLedgerPath = 'law/policy/forbidden-action-authorizations.json';
const priorReceipt = {
  forbidden_id: forbiddenId,
  commit: 'a'.repeat(40),
  authorized_by: 'Owner',
  reason: 'Preserves one exact historical authorization receipt.',
};
const secondPriorReceipt = {
  forbidden_id: forbiddenId,
  commit: 'c'.repeat(40),
  authorized_by: 'Owner',
  reason: 'Preserves a second exact historical authorization receipt.',
};

function createForbiddenFixture() {
  const root = mkdtempSync(join(tmpdir(), 'stynx-forbidden-actions-'));
  mkdirSync(join(root, '.devai'), { recursive: true });
  cpSync(join(repoRoot, '.devai', 'config'), join(root, '.devai', 'config'), {
    recursive: true,
  });
  cpSync(join(repoRoot, '.devai', 'pin'), join(root, '.devai', 'pin'), { recursive: true });
  mkdirSync(join(root, 'law', 'policy'), { recursive: true });
  writeJson(join(root, authorizationLedgerPath), {
    schemaVersion: '1.0.0',
    authorizations: [priorReceipt, secondPriorReceipt],
  });
  run('git', ['init', '--quiet'], { cwd: root });
  run('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  run('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: root });
  run('git', ['add', '--all'], { cwd: root });
  run('git', ['commit', '--quiet', '--message', 'baseline'], { cwd: root });
  return { root, base: run('git', ['rev-parse', 'HEAD'], { cwd: root }) };
}

function commitFixture(root, subject, author = 'Fixture') {
  run('git', ['add', '--all'], { cwd: root });
  run(
    'git',
    [
      '-c',
      `user.name=${author}`,
      '-c',
      `user.email=${author.toLowerCase().replaceAll(' ', '-')}@example.invalid`,
      'commit',
      '--quiet',
      '--message',
      subject,
    ],
    { cwd: root },
  );
  return run('git', ['rev-parse', 'HEAD'], { cwd: root });
}

function writeOrdinaryLawCommit(root) {
  mkdirSync(join(root, 'law', 'adr'), { recursive: true });
  writeFileSync(join(root, 'law', 'adr', 'ordinary-policy.md'), '# Ordinary policy\n');
  return commitFixture(root, 'docs: ordinary law policy');
}

function receipt(commit, overrides = {}) {
  return {
    forbidden_id: forbiddenId,
    commit,
    authorized_by: 'Owner',
    reason: 'Authorizes the exact independently detected historical finding.',
    ...overrides,
  };
}

function writeLedger(root, authorizations) {
  writeJson(join(root, authorizationLedgerPath), {
    schemaVersion: '1.0.0',
    authorizations,
  });
}

function forbiddenReport(root, sinceRef, expectedStatus) {
  const result = spawnSync(
    join(repoRoot, 'node_modules', '.bin', 'devai'),
    [
      'check',
      '--repo-root',
      root,
      '--only',
      'forbidden-actions',
      '--strict',
      '--since-ref',
      sinceRef,
      '--format',
      'json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const output = result.stdout.trim() || result.stderr.trim();
  if (!output) throw new Error('forbidden-action detector emitted no JSON');
  const envelope = JSON.parse(output);
  const report = envelope.ok
    ? envelope.result.value
    : (envelope.error?.context?.payload ?? JSON.parse(envelope.error.message));
  if (result.status !== expectedStatus) {
    throw new Error(
      `forbidden-action detector exit: expected ${expectedStatus}, got ${result.status}; findings=${JSON.stringify(report.findings ?? [])}`,
    );
  }
  return report;
}

function assertMutateFinding(report, label) {
  if (!report.findings.some((finding) => finding.forbidden_id === forbiddenId)) {
    throw new Error(`${label}: missing ${forbiddenId} finding`);
  }
}

function runForbiddenActionTests() {
  {
    const fixture = createForbiddenFixture();
    try {
      writeOrdinaryLawCommit(fixture.root);
      assertMutateFinding(forbiddenReport(fixture.root, fixture.base, 2), 'ordinary law commit');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  for (const scenario of [
    {
      label: 'extra path',
      mutate(root, target) {
        writeLedger(root, [priorReceipt, secondPriorReceipt, receipt(target)]);
        writeFileSync(join(root, 'extra.txt'), 'mixed commit\n');
      },
    },
    {
      label: 'modified prior receipt',
      mutate(root, target) {
        writeLedger(root, [
          { ...priorReceipt, reason: 'Changed historical receipt bytes are forbidden.' },
          secondPriorReceipt,
          receipt(target),
        ]);
      },
    },
    {
      label: 'deleted prior receipt',
      mutate(root, target) {
        writeLedger(root, [secondPriorReceipt, receipt(target)]);
      },
    },
    {
      label: 'reordered prior receipts',
      mutate(root, target) {
        writeLedger(root, [secondPriorReceipt, priorReceipt, receipt(target)]);
      },
    },
    {
      label: 'unmatched receipt',
      mutate(root, target) {
        writeLedger(root, [
          priorReceipt,
          secondPriorReceipt,
          receipt(target),
          receipt('b'.repeat(40)),
        ]);
      },
    },
    {
      label: 'missing exact receipt',
      mutate(root) {
        writeLedger(root, [priorReceipt, secondPriorReceipt, receipt('d'.repeat(40))]);
      },
    },
  ]) {
    const fixture = createForbiddenFixture();
    try {
      const target = writeOrdinaryLawCommit(fixture.root);
      scenario.mutate(fixture.root, target);
      commitFixture(fixture.root, `chore: ${scenario.label}`);
      assertMutateFinding(forbiddenReport(fixture.root, fixture.base, 2), scenario.label);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  for (const scenario of [
    {
      label: 'non-Owner receipt',
      entry(target) {
        return receipt(target, { authorized_by: 'Architect' });
      },
    },
    {
      label: 'malformed receipt',
      entry() {
        return receipt('abc123');
      },
    },
    {
      label: 'unknown receipt',
      entry(target) {
        return receipt(target, { forbidden_id: 'FORBID-UNKNOWN' });
      },
    },
  ]) {
    const fixture = createForbiddenFixture();
    try {
      const target = writeOrdinaryLawCommit(fixture.root);
      writeLedger(fixture.root, [priorReceipt, secondPriorReceipt, scenario.entry(target)]);
      commitFixture(fixture.root, `chore: ${scenario.label}`);
      const report = forbiddenReport(fixture.root, fixture.base, 2);
      assertEqual(
        report.findings[0].forbidden_id,
        'FORBIDDEN-AUTHORIZATION-INVALID',
        scenario.label,
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  {
    const fixture = createForbiddenFixture();
    try {
      const target = writeOrdinaryLawCommit(fixture.root);
      writeLedger(fixture.root, [
        priorReceipt,
        secondPriorReceipt,
        receipt(target),
        receipt(target, { reason: 'Conflicts with the first receipt for the same pair.' }),
      ]);
      commitFixture(fixture.root, 'chore: conflicting receipts');
      const report = forbiddenReport(fixture.root, fixture.base, 2);
      assertEqual(
        report.findings[0].forbidden_id,
        'FORBIDDEN-AUTHORIZATION-INVALID',
        'conflicting receipts',
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  {
    const fixture = createForbiddenFixture();
    try {
      const target = writeOrdinaryLawCommit(fixture.root);
      writeLedger(fixture.root, [priorReceipt, secondPriorReceipt, receipt(target)]);
      const ownerReceipt = commitFixture(
        fixture.root,
        'chore(owner): record exact target authorization',
        'DEVAI Owner',
      );
      writeLedger(fixture.root, [
        priorReceipt,
        secondPriorReceipt,
        receipt(target),
        receipt(ownerReceipt, {
          reason: 'Closes the exact Owner receipt mutation through an Architect binding.',
        }),
      ]);
      commitFixture(fixture.root, 'chore(architect): bind exact Owner receipt', 'DEVAI Architect');
      const report = forbiddenReport(fixture.root, fixture.base, 0);
      assertEqual(
        report.findings.length,
        0,
        'target to Owner receipt to Architect binding findings',
      );
      assertIncludes(
        JSON.stringify(report.authorization_receipts.applied),
        `${forbiddenId}@${target}`,
        'exact target authorization application',
      );
      assertIncludes(
        JSON.stringify(report.authorization_receipts.applied),
        `${forbiddenId}@${ownerReceipt}`,
        'exact Owner receipt closure application',
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
}

function runDoctorAdopterPolicyPrecedenceTest() {
  const exactVersion = '1.4.5';
  const exactTarball =
    'https://npm.pkg.github.com/download/@aarusso-nyx/devai/1.4.5/1d5aa3fc8748a3ac7c2150750f60803c0b357b86';
  const exactIntegrity =
    'sha512-5XuNGqbiqRGx+3MJOlO9VdJoKwX5MZ9a1BxdX/APUeD/j48CgtLwf5hNyxDkujxexekNn5TGSLUmU7aki2LTeQ==';
  // The 1.1.1 campaign policy was retired with the DEVAI adoption migration.
  // Its still-valid DEVAI dependency pin now lives in the STYNX-owned identity
  // policy, which remains the exact adopted package identity.
  const campaign = {
    devai: JSON.parse(
      readFileSync(join(repoRoot, 'law', 'policy', 'devai-package-identity.json'), 'utf8'),
    ),
  };
  assertEqual(campaign.devai.version, exactVersion, 'adopted DEVAI version');
  assertEqual(campaign.devai.tarball, exactTarball, 'adopted DEVAI tarball');
  assertEqual(campaign.devai.integrity, exactIntegrity, 'adopted DEVAI integrity');
  assertEqual(
    campaign.devai.shasum,
    '1d5aa3fc8748a3ac7c2150750f60803c0b357b86',
    'adopted DEVAI shasum',
  );
  assertEqual(
    campaign.devai.sha256,
    'f5fa97bb2c0d7b81487de6c13eac1d78bcb1fdaa8021a051d0c4c9f7e7371d26',
    'adopted DEVAI sha256',
  );
  assertEqual(
    campaign.devai.source_commit,
    '5461ba55d8fba23d8e0a310480eb62d1e3c6c52c',
    'adopted DEVAI source commit',
  );
  assertEqual(
    campaign.devai.source_tree,
    'b339fa7fb13b0792ac929b5f3f57f4b84366b649',
    'adopted DEVAI source tree',
  );
  assertEqual(
    campaign.devai.signed_tag_object,
    '11eaeaf34b4aad76565ae1adc0fb1abf0ad37ae9',
    'adopted DEVAI signed tag object',
  );

  const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assertEqual(rootManifest.devDependencies['@aarusso-nyx/devai'], exactVersion, 'root DEVAI pin');
  const lockfile = readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
  assertIncludes(lockfile, `'@aarusso-nyx/devai@${exactVersion}'`, 'lockfile DEVAI identity');
  assertIncludes(lockfile, exactTarball, 'lockfile DEVAI tarball');
  assertIncludes(lockfile, exactIntegrity, 'lockfile DEVAI integrity');

  const installedManifest = JSON.parse(
    readFileSync(join(repoRoot, 'node_modules', '@aarusso-nyx', 'devai', 'package.json'), 'utf8'),
  );
  assertEqual(installedManifest.version, exactVersion, 'installed DEVAI version');

  const adopterPolicyPath = join(repoRoot, 'law', 'policy', 'devai-adoption.json');
  const adopterPolicy = JSON.parse(readFileSync(adopterPolicyPath, 'utf8'));
  assertEqual(
    JSON.stringify(adopterPolicy.domains.client),
    JSON.stringify(['COVERAGE', 'ERROR', 'FLOW', 'PRIVACY', 'RBAC']),
    'accepted adopter domains',
  );
  const binding = JSON.parse(
    readFileSync(join(repoRoot, '.devai', 'config', 'adopter-policy-binding.json'), 'utf8'),
  );
  assertEqual(binding.source_path, 'law/policy/devai-adoption.json', 'adopter policy source');
  assertEqual(
    createHash('sha256').update(readFileSync(adopterPolicyPath)).digest('hex'),
    binding.source_digest_sha256,
    'adopter policy source digest',
  );
  for (const [path, expectedDigest] of Object.entries(binding.materialized)) {
    const actualDigest = createHash('sha256')
      .update(readFileSync(join(repoRoot, path)))
      .digest('hex');
    assertEqual(actualDigest, expectedDigest, `adopter-policy materialization ${path}`);
  }
  const domains = JSON.parse(
    readFileSync(join(repoRoot, '.devai', 'config', 'domains.json'), 'utf8'),
  );
  assertEqual(
    JSON.stringify(domains.client),
    JSON.stringify(adopterPolicy.domains.client),
    'materialized adopter domains',
  );

  const result = spawnSync(
    join(repoRoot, 'node_modules', '.bin', 'devai'),
    ['doctor', '--repo-root', repoRoot, '--format', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (!result.stdout.trim()) throw new Error('DEVAI Doctor emitted no JSON');
  const envelope = JSON.parse(result.stdout);
  const policyCheck = envelope.result?.value?.checks?.find(
    (check) => check.name === 'policy-materialization-current',
  );
  assertEqual(result.status, 0, 'DEVAI Doctor exit');
  assertEqual(policyCheck?.ok, true, 'Doctor adopter-policy precedence');
  assertEqual(policyCheck?.info?.mismatches?.length, 0, 'Doctor adopter-policy mismatches');
}

async function main() {
  runVerifierTests();
  await runMutationEvidenceTests();
  runForbiddenActionTests();
  runDoctorAdopterPolicyPrecedenceTest();

  console.log('All scripts validated');
  console.log('Tests: 4 passed, 4 total');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
