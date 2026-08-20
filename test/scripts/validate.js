const {
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
  assertEqual(roster.length, 32, 'mutation package roster');
  const thresholdBytes = mutationRoster.canonicalize(
    roster.map(({ packageName, thresholds: packageThresholds }) => ({
      packageName,
      thresholds: packageThresholds,
    })),
  );
  assertEqual(
    createHash('sha256').update(thresholdBytes).digest('hex'),
    'f827ddb2a9725846f4860e149ac404a608a3b96faa6a8e53b9b928fdf5135824',
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

async function runLocalRcAdapterTests() {
  const { unwrapDevaiCheckReport } = await import('../../scripts/lib/devai-local-rc.mjs');
  const report = {
    receipt: {
      digest: 'a'.repeat(64),
      path: '/tmp/devai-receipt.json',
    },
  };

  assertEqual(
    unwrapDevaiCheckReport({
      action_id: 'check',
      ok: true,
      result: {
        media_type: 'application/json',
        value: report,
        verdict: 'pass',
      },
      schemaVersion: '1.0.0',
    }),
    report,
    'DEVAI authority-envelope check report',
  );
  assertEqual(unwrapDevaiCheckReport(report), report, 'legacy top-level DEVAI check report');
}

async function main() {
  runVerifierTests();
  await runMutationEvidenceTests();
  await runLocalRcAdapterTests();

  console.log('All scripts validated');
  console.log('Tests: 3 passed, 3 total');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
