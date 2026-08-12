const {
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

runVerifierTests();

console.log('All scripts validated');
console.log('Tests: 1 passed, 1 total');
