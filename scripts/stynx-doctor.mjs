#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootDir = process.cwd();
const jsonOutput = process.argv.includes('--json') || !process.stdout.isTTY;
const checks = [];
const todoPermissionSentinel = 'TODO' + '_PERMISSION';
const includeReferenceApps =
  process.env.STYNX_DOCTOR_INCLUDE_REFERENCE_APPS === 'true' ||
  process.argv.includes('--include-reference-apps');

function runCheck(name, fn) {
  try {
    fn();
    checks.push({ name, status: 'ok' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name, status: 'failed', message });
  }
}

function skipCheck(name, message) {
  checks.push({ name, status: 'skipped', message });
}

function commandAvailable(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'ignore',
    env: process.env,
  });
  return !result.error && result.status === 0;
}

function walk(dir, visitor) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const relativePath = relative(rootDir, fullPath);
    if (
      entry === '.git' ||
      entry === '.pnpm-store' ||
      entry === '.turbo' ||
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === 'reports' ||
      relativePath.startsWith('docs/') ||
      relativePath.startsWith('specs/') ||
      relativePath.startsWith('audit/') ||
      relativePath.startsWith('.tmp-tsconfig-smoke/')
    ) {
      continue;
    }

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, visitor);
      continue;
    }

    visitor(fullPath, relativePath);
  }
}

const databaseUrl =
  process.env.STYNX_TEST_DATABASE_URL ?? process.env.STYNX_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  skipCheck('rls-smoke', 'not attempted: DATABASE_URL is not configured');
} else if (!commandAvailable('psql')) {
  skipCheck('rls-smoke', 'not attempted: psql is unavailable');
} else {
  runCheck('rls-smoke', () => {
    const result = spawnSync('bash', ['scripts/check-rls-smoke.sh'], {
      cwd: rootDir,
      stdio: jsonOutput ? 'pipe' : 'inherit',
      env: { ...process.env, STYNX_RLS_LIVE_REQUIRED: '1' },
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(
        (result.stderr || result.stdout || 'scripts/check-rls-smoke.sh failed').trim(),
      );
    }
  });
}

runCheck('engine-version', () => {
  const result = spawnSync('node', ['scripts/check-engines.mjs'], {
    cwd: rootDir,
    stdio: jsonOutput ? 'pipe' : 'inherit',
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'scripts/check-engines.mjs failed').trim());
  }
});

runCheck('migration-linter', () => {
  const result = spawnSync('pnpm', ['lint:migrations'], {
    cwd: rootDir,
    stdio: jsonOutput ? 'pipe' : 'inherit',
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'pnpm lint:migrations failed').trim());
  }
});

runCheck('object-operations-through-storage', () => {
  const offenders = [];
  for (const scope of ['apps', 'backend', 'frontend', 'packages', 'packages-web']) {
    const scopePath = join(rootDir, scope);
    try {
      statSync(scopePath);
    } catch {
      continue;
    }
    walk(scopePath, (fullPath, relativePath) => {
      if (!/\.(?:cjs|cts|js|mjs|mts|ts)$/.test(relativePath)) {
        return;
      }
      if (
        relativePath.startsWith('packages/storage/') ||
        relativePath.includes('/test/') ||
        relativePath.endsWith('.spec.ts')
      ) {
        return;
      }
      const content = readFileSync(fullPath, 'utf8');
      if (content.includes('@aws-sdk/client-s3')) {
        offenders.push(relativePath);
      }
    });
  }

  if (offenders.length > 0) {
    throw new Error(`Direct S3 imports outside @stynx-nyx/storage:\n${offenders.join('\n')}`);
  }
});

runCheck('todo-permission-sentinels', () => {
  const matches = [];
  for (const scope of [
    'apps',
    'backend',
    'bootstrap',
    'db',
    'frontend',
    'packages',
    'packages-web',
    'scripts',
    'test',
    'tools',
  ]) {
    const scopePath = join(rootDir, scope);
    try {
      statSync(scopePath);
    } catch {
      continue;
    }
    walk(scopePath, (fullPath, relativePath) => {
      const content = readFileSync(fullPath, 'utf8');
      if (!content.includes(todoPermissionSentinel)) {
        return;
      }

      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes(todoPermissionSentinel)) {
          matches.push(`${relativePath}:${index + 1}`);
        }
      });
    });
  }

  if (matches.length > 0) {
    throw new Error(`Found ${todoPermissionSentinel} sentinels:\n${matches.join('\n')}`);
  }
});

runCheck('package-lock-cleanup', () => {
  const packageLocks = [];
  walk(rootDir, (_fullPath, relativePath) => {
    if (relativePath.endsWith('package-lock.json')) {
      if (relativePath === 'infra/cdk/package-lock.json') {
        return;
      }
      packageLocks.push(relativePath);
    }
  });

  if (packageLocks.length > 0) {
    throw new Error(`Unexpected package-lock.json files:\n${packageLocks.join('\n')}`);
  }
});

if (includeReferenceApps) {
  runCheck('reference-api-runtime-suite', () => {
    const result = spawnSync(
      'pnpm',
      [
        '--filter',
        '@stynx-nyx/reference-api',
        'test',
        '--',
        '--runInBand',
        'test/integration/reference-api.runtime.spec.ts',
      ],
      {
        cwd: rootDir,
        stdio: 'inherit',
        env: process.env,
      },
    );
    if (result.status !== 0) {
      throw new Error('@stynx-nyx/reference-api runtime suite failed');
    }
  });
}

const failures = checks.filter((check) => check.status === 'failed');
if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        checks,
      },
      null,
      2,
    ),
  );
} else {
  for (const check of checks) {
    if (check.status === 'ok') {
      console.log(`[doctor][ok] ${check.name}`);
      continue;
    }
    if (check.status === 'skipped') {
      console.log(`[doctor][skipped] ${check.name}: ${check.message}`);
      continue;
    }
    console.error(`[doctor][fail] ${check.name}`);
    console.error(check.message);
  }
}

if (failures.length > 0) {
  process.exit(1);
}

if (!jsonOutput) {
  const verified = checks.filter((check) => check.status === 'ok').length;
  const skipped = checks.filter((check) => check.status === 'skipped').length;
  console.log(`[doctor] ${verified} checks verified; ${skipped} skipped`);
}
