#!/usr/bin/env node
/**
 * Prepare the migrated template database for the integration tier
 * (ADR-CI-ECONOMY Decision 6a — per-suite ephemeral databases cloned from
 * a migrated template).
 *
 * The tier gate runs every package's test:int concurrently against one
 * Postgres server. Each suite creates its own ephemeral database via
 * packages/data/test/support/postgres.ts; without a template, every suite
 * then replays the full platform migration set into its fresh database,
 * and N concurrent migration runs contend on the shared server (the
 * soft-delete 30s-timeout flake class). This script runs the migrations
 * exactly once, into a dedicated template database; the test harness then
 * clones it per suite with `CREATE DATABASE <db> TEMPLATE <tpl>` (a cheap
 * file-level copy) when STYNX_TEST_PG_TEMPLATE is set.
 *
 * Usage:
 *   node scripts/ci-local/prepare-int-template.mjs [--template <name>] [--github-env <path>]
 *
 * Connection resolution mirrors the test harness: STYNX_TEST_PG_HOST /
 * STYNX_TEST_PG_PORT / STYNX_TEST_PG_USER / STYNX_TEST_PG_PASSWORD when a
 * host is set, otherwise the local Unix socket (STYNX_TEST_PG_SOCKET_DIR,
 * default /tmp) as the OS user.
 *
 * With --github-env <path> (pass "$GITHUB_ENV" in workflows) the script
 * appends STYNX_TEST_PG_TEMPLATE=<name> so later steps in the same job
 * inherit the template automatically.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Resolve `pg` through @stynx-nyx/data's dependency tree (no root dep needed).
const requireFromData = createRequire(
  new URL('../../packages/data/package.json', import.meta.url),
);
const { Client } = requireFromData('pg');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI_MAIN = resolve(repoRoot, 'packages/cli/dist/cli/src/main.js');
const DEFAULT_TEMPLATE = 'stynx_int_tpl';

function parseArgs(argv) {
  const args = { template: DEFAULT_TEMPLATE, githubEnv: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--template') {
      args.template = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--github-env') {
      args.githubEnv = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(args.template)) {
    throw new Error(`Invalid template database name: ${args.template}`);
  }
  return args;
}

function connectionSettings() {
  const host = process.env.STYNX_TEST_PG_HOST;
  if (host) {
    return {
      host,
      port: Number(process.env.STYNX_TEST_PG_PORT ?? '5432'),
      user: process.env.STYNX_TEST_PG_USER ?? userInfo().username,
      password: process.env.STYNX_TEST_PG_PASSWORD,
      socket: undefined,
    };
  }
  return {
    host: undefined,
    port: Number(process.env.STYNX_TEST_PG_PORT ?? '5432'),
    user: process.env.STYNX_TEST_PG_USER ?? userInfo().username,
    password: process.env.STYNX_TEST_PG_PASSWORD,
    socket: process.env.STYNX_TEST_PG_SOCKET_DIR ?? '/tmp',
  };
}

function adminClientConfig(settings, database) {
  if (settings.host) {
    return {
      host: settings.host,
      port: settings.port,
      user: settings.user,
      password: settings.password,
      database,
    };
  }
  return { host: settings.socket, user: settings.user, database };
}

function databaseUrl(settings, database) {
  if (settings.host) {
    const url = new URL(
      `postgresql://${encodeURIComponent(settings.user)}@${settings.host}:${settings.port}/${database}`,
    );
    if (settings.password) url.password = settings.password;
    return url.toString();
  }
  return `postgresql://${encodeURIComponent(settings.user)}@/${encodeURIComponent(database)}?host=${encodeURIComponent(settings.socket)}`;
}

function ensureCliBuilt() {
  if (existsSync(CLI_MAIN)) return;
  console.log('CLI dist missing; building @stynx-nyx/cli ...');
  const result = spawnSync('pnpm', ['--filter', '@stynx-nyx/cli', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0 || !existsSync(CLI_MAIN)) {
    throw new Error('Failed to build @stynx-nyx/cli for template migration');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const settings = connectionSettings();

  ensureCliBuilt();

  const admin = new Client(adminClientConfig(settings, 'postgres'));
  await admin.connect();
  try {
    await admin.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
        where datname = $1 and pid <> pg_backend_pid()`,
      [args.template],
    );
    await admin.query(`drop database if exists "${args.template}"`);
    await admin.query(`create database "${args.template}"`);
  } finally {
    await admin.end();
  }

  const started = Date.now();
  const migrate = spawnSync(
    'node',
    [CLI_MAIN, 'migrate', 'up', '--database-url', databaseUrl(settings, args.template)],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (migrate.status !== 0) {
    throw new Error(`Platform migration into template "${args.template}" failed`);
  }
  console.log(
    `Template database "${args.template}" migrated in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  if (args.githubEnv) {
    appendFileSync(args.githubEnv, `STYNX_TEST_PG_TEMPLATE=${args.template}\n`);
    console.log(`Exported STYNX_TEST_PG_TEMPLATE=${args.template} via --github-env`);
  } else {
    console.log(`Run tests with: STYNX_TEST_PG_TEMPLATE=${args.template} pnpm test:int`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
