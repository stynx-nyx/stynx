const {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs');
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
      openapiPath: 'docs/contracts/openapi.json',
      sourceRoots: ['src'],
      routePrefix: '',
    },
  });
  try {
    mkdirSync(join(apiRoot, 'docs', 'contracts'), { recursive: true });
    mkdirSync(join(apiRoot, 'src'), { recursive: true });
    writeJson(join(apiRoot, 'docs', 'contracts', 'openapi.json'), {
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

    writeJson(join(apiRoot, 'docs', 'contracts', 'openapi.json'), {
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

function metadata(job) {
  return [
    `job=${job}`,
    'utc=2026-05-01T00:00:00Z',
    'workspace=/workspace',
    `artifact_host_dir=artifacts/${job}`,
    'platform=linux/arm64',
    'git_head=0123456789abcdef0123456789abcdef01234567',
    'git_status=0',
    'node=v24.14.1',
    'pnpm=9.15.0',
    'docker=Docker version 29.4.1, build 055a478',
    'docker_compose=Docker Compose version v5.1.3',
    'uname=Linux test aarch64',
    '',
  ].join('\n');
}

function prepareEvidenceRepo() {
  const root = mkdtempSync(join(tmpdir(), 'stynx-evidence-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, '.ci'), { recursive: true });
  cpSync(join(__dirname, '..', '..', 'scripts', 'evidence'), join(root, 'scripts', 'evidence'), {
    recursive: true,
  });
  cpSync(join(__dirname, '..', '..', '.ci', 'evidence'), join(root, '.ci', 'evidence'), {
    recursive: true,
  });
  writeJson(join(root, 'package.json'), {
    packageManager: 'pnpm@9.15.0',
    engines: {
      node: '>=24 <25',
    },
  });
  writeFileSync(join(root, 'src.txt'), 'alpha\n');
  run('git', ['-c', 'init.defaultBranch=main', 'init'], { cwd: root });
  run('git', ['add', 'package.json', 'src.txt'], { cwd: root });
  return root;
}

function runEvidenceTests() {
  const root = prepareEvidenceRepo();

  try {
    const sourceHash = ['scripts/evidence/source-hash.mjs'];
    const firstHash = run('node', sourceHash, { cwd: root });
    writeFileSync(join(root, '.ci', 'evidence', 'local-ci.json'), '{"ignored":true}\n');
    run('git', ['add', '.ci/evidence/local-ci.json'], { cwd: root });
    const evidenceOnlyHash = run('node', sourceHash, { cwd: root });
    if (firstHash !== evidenceOnlyHash) {
      throw new Error('source-hash changed for .ci/evidence-only changes');
    }

    writeFileSync(join(root, 'src.txt'), 'beta\n');
    const changedSourceHash = run('node', sourceHash, { cwd: root });
    if (firstHash === changedSourceHash) {
      throw new Error('source-hash did not change after tracked source changed');
    }

    mkdirSync(join(root, 'artifacts', 'all-linux'), { recursive: true });
    mkdirSync(join(root, 'artifacts', 'stynx-release'), { recursive: true });
    writeFileSync(join(root, 'artifacts', 'all-linux', 'metadata.txt'), metadata('all-linux'));
    writeFileSync(join(root, 'artifacts', 'all-linux', 'log.txt'), 'ok\n');
    writeFileSync(
      join(root, 'artifacts', 'stynx-release', 'metadata.txt'),
      metadata('stynx-release'),
    );
    writeFileSync(join(root, 'artifacts', 'stynx-release', 'log.txt'), 'ok\n');

    run(
      'node',
      [
        'scripts/evidence/collect-local-evidence.mjs',
        '--all-linux',
        'artifacts/all-linux',
        '--stynx-release',
        'artifacts/stynx-release',
        '--output',
        '.ci/evidence/local-ci.json',
      ],
      { cwd: root },
    );

    const verify = [
      'scripts/evidence/verify-local-evidence.mjs',
      '--mode',
      'strict',
      '--actor',
      'maintainer',
      '--trusted-actors',
      'maintainer',
    ];
    run('node', verify, { cwd: root });

    const benignChangedFilesPath = join(root, 'benign-changed-files.txt');
    writeFileSync(benignChangedFilesPath, 'src.txt\n.ci/evidence/local-ci.json\n');
    run(
      'node',
      [
        'scripts/evidence/verify-local-evidence.mjs',
        '--mode',
        'auto',
        '--event-name',
        'push',
        '--ref',
        'refs/heads/main',
        '--head-message',
        'test\n\nLocal-CI-Evidence: .ci/evidence/local-ci.json',
        '--actor',
        'maintainer',
        '--trusted-actors',
        'maintainer',
        '--changed-files',
        benignChangedFilesPath,
      ],
      { cwd: root },
    );

    run(
      'node',
      [
        'scripts/evidence/verify-local-evidence.mjs',
        '--mode',
        'strict',
        '--manifest',
        'missing.json',
      ],
      {
        cwd: root,
        status: 1,
      },
    );

    const manifestPath = join(root, '.ci', 'evidence', 'local-ci.json');
    const validManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    const staleManifest = { ...validManifest, generatedAt: '2000-01-01T00:00:00.000Z' };
    writeJson(manifestPath, staleManifest);
    run('node', verify, { cwd: root, status: 1 });

    const wrongHashManifest = {
      ...validManifest,
      sourceHash: { ...validManifest.sourceHash, value: '0'.repeat(64) },
    };
    writeJson(manifestPath, wrongHashManifest);
    run('node', verify, { cwd: root, status: 1 });

    const wrongVersionManifest = { ...validManifest, schemaVersion: 2 };
    writeJson(manifestPath, wrongVersionManifest);
    run('node', verify, { cwd: root, status: 1 });

    const wrongJobManifest = {
      ...validManifest,
      jobs: {
        ...validManifest.jobs,
        'all-linux': { ...validManifest.jobs['all-linux'], result: 'failure' },
      },
    };
    writeJson(manifestPath, wrongJobManifest);
    run('node', verify, { cwd: root, status: 1 });

    const wrongToolManifest = {
      ...validManifest,
      tools: {
        ...validManifest.tools,
        pnpm: { ...validManifest.tools.pnpm, observed: ['9.14.0'] },
      },
    };
    writeJson(manifestPath, wrongToolManifest);
    run('node', verify, { cwd: root, status: 1 });

    writeJson(manifestPath, validManifest);
    run(
      'node',
      [
        'scripts/evidence/verify-local-evidence.mjs',
        '--mode',
        'strict',
        '--actor',
        'intruder',
        '--trusted-actors',
        'maintainer',
      ],
      { cwd: root, status: 1 },
    );

    const changedFilesPath = join(root, 'changed-files.txt');
    writeFileSync(changedFilesPath, 'scripts/evidence/source-hash.mjs\n');
    run('node', [...verify, '--changed-files', changedFilesPath], { cwd: root, status: 1 });

    run(
      'node',
      [
        'scripts/evidence/verify-local-evidence.mjs',
        '--mode',
        'auto',
        '--event-name',
        'pull_request',
        '--head-message',
        'Local-CI-Evidence: .ci/evidence/local-ci.json',
      ],
      { cwd: root },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

runEvidenceTests();
runVerifierTests();

console.log('All scripts validated');
console.log('Tests: 2 passed, 2 total');
