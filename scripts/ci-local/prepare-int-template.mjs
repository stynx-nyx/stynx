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
 *   node scripts/ci-local/prepare-int-template.mjs [--template <name>] [--github-env <path>] [--maintain]
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
const requireFromData = createRequire(new URL('../../packages/data/package.json', import.meta.url));
const { Client } = requireFromData('pg');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI_MAIN = resolve(repoRoot, 'packages/cli/dist/cli/src/main.js');
const DEFAULT_TEMPLATE = 'stynx_int_tpl';

function parseArgs(argv) {
  const args = { template: DEFAULT_TEMPLATE, githubEnv: undefined, maintain: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--template') {
      args.template = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--github-env') {
      args.githubEnv = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--maintain') {
      args.maintain = true;
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(args.template)) {
    throw new Error(`Invalid template database name: ${args.template}`);
  }
  return args;
}

function utcMonth(offset) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

function postgresTimestamp(date) {
  return date.toISOString().replace('T', ' ').replace('.000Z', '+00');
}

async function maintainAndVerifyTemplate(settings, template) {
  const client = new Client(adminClientConfig(settings, template));
  await client.connect();
  try {
    const functionCheck = await client.query(
      `select to_regprocedure('auth.ensure_current_session_partitions()') is not null as present`,
    );
    if (functionCheck.rows[0]?.present !== true) {
      throw new Error('session template partition horizon drifted: maintenance function missing');
    }
    await client.query('select auth.ensure_current_session_partitions()');

    const expected = [0, 1, 2].map((offset) => {
      const start = utcMonth(offset);
      const end = utcMonth(offset + 1);
      const name = `sessions_${String(start.getUTCFullYear())}_${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
      return {
        name,
        bound: `FOR VALUES FROM ('${postgresTimestamp(start)}') TO ('${postgresTimestamp(end)}')`,
      };
    });
    const names = expected.map(({ name }) => name);
    const partitions = await client.query(
      `select child.relname as name, pg_get_expr(child.relpartbound, child.oid) as bound
       from pg_inherits
       join pg_class child on child.oid = pg_inherits.inhrelid
       join pg_class parent on parent.oid = pg_inherits.inhparent
       join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
       where parent_ns.nspname = 'auth'
         and parent.relname = 'sessions'
         and child.relname = any($1::text[])
       order by child.relname`,
      [names],
    );
    const actual = [...partitions.rows].sort((left, right) => left.name.localeCompare(right.name));
    const sortedExpected = [...expected].sort((left, right) => left.name.localeCompare(right.name));
    if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
      throw new Error('session template partition horizon drifted: monthly bounds mismatch');
    }

    const defaultCheck = await client.query(
      `select to_regclass('auth.sessions_default') is not null as present,
              case when to_regclass('auth.sessions_default') is null
                then null
                else (select count(*)::text from auth.sessions_default)
              end as row_count`,
    );
    if (defaultCheck.rows[0]?.present !== true || defaultCheck.rows[0]?.row_count !== '0') {
      throw new Error(
        'session template partition horizon drifted: auth.sessions_default is not empty',
      );
    }
  } finally {
    await client.end();
  }
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

  if (args.maintain) {
    await maintainAndVerifyTemplate(settings, args.template);
    console.log(`Template database "${args.template}" partition horizon is current`);
    return;
  }

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
  await maintainAndVerifyTemplate(settings, args.template);

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
