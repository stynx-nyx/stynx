#!/usr/bin/env node
// Lints STYNX's own migrations against their merge base: the base revision of every migration
// is written to a scratch --base-dir, so applied history (including the permanent duplicate
// 0012/0018 prefixes, D-059) never trips LINT010 while newly added files do. Extra arguments
// are passed through to stynx-migration-lint.
//
// Base resolution, first match wins (fails closed with exit 2 when none resolves):
//   1. STYNX_MIGRATION_BASE_REF (any commit-ish);
//   2. git merge-base HEAD origin/main;
//   3. after `git fetch --depth=1 origin main` (shallow CI checkouts): git merge-base HEAD
//      FETCH_HEAD, else FETCH_HEAD itself — on a pull_request merge ref that is the base tip.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '..', '..');
const migrationRoot = 'packages/data/migrations';
const cliPath = join(packageRoot, 'dist', 'src', 'cli.js');

function git(args, options = {}) {
  return spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function revision(args) {
  const result = git(args);
  return result.status === 0 ? result.stdout.toString('utf8').trim() || null : null;
}

function resolveBase() {
  const explicit = process.env.STYNX_MIGRATION_BASE_REF;
  if (explicit) {
    const sha = revision(['rev-parse', '--verify', `${explicit}^{commit}`]);
    if (!sha) throw new Error(`STYNX_MIGRATION_BASE_REF ${explicit} does not resolve to a commit.`);
    return { sha, how: `STYNX_MIGRATION_BASE_REF=${explicit}` };
  }
  const local = revision(['merge-base', 'HEAD', 'origin/main']);
  if (local) return { sha: local, how: 'merge-base HEAD origin/main' };

  const fetched = git(['fetch', '--no-tags', '--depth=1', 'origin', 'main'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  if (fetched.status !== 0) {
    throw new Error(
      `cannot resolve the merge base: git fetch origin main failed: ${fetched.stderr.toString('utf8').trim()}`,
    );
  }
  const mergeBase = revision(['merge-base', 'HEAD', 'FETCH_HEAD']);
  if (mergeBase) return { sha: mergeBase, how: 'merge-base HEAD FETCH_HEAD' };
  const tip = revision(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
  if (!tip) throw new Error('cannot resolve the merge base: FETCH_HEAD is not a commit.');
  return { sha: tip, how: 'origin/main tip (shallow checkout)' };
}

function materialize(sha, baseDir) {
  const listed = git(['ls-tree', '-r', '-z', '--name-only', sha, '--', migrationRoot]);
  if (listed.status !== 0)
    throw new Error(`git ls-tree ${sha} failed: ${listed.stderr.toString('utf8').trim()}`);
  const paths = listed.stdout.toString('utf8').split('\0').filter(Boolean);
  for (const path of paths) {
    const blob = git(['show', `${sha}:${path}`]);
    if (blob.status !== 0) throw new Error(`git show ${sha}:${path} failed`);
    mkdirSync(dirname(join(baseDir, path)), { recursive: true });
    writeFileSync(join(baseDir, path), blob.stdout);
  }
  return paths.length;
}

let baseDir = null;
try {
  const base = resolveBase();
  baseDir = mkdtempSync(join(tmpdir(), 'stynx-migration-base-'));
  const count = materialize(base.sha, baseDir);
  console.error(
    `[lint:repo] base ${base.sha.slice(0, 12)} (${base.how}): ${count} file(s) under ${migrationRoot}`,
  );
  const run = spawnSync(
    process.execPath,
    [cliPath, migrationRoot, '--base-dir', baseDir, ...process.argv.slice(2)],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  );
  process.exitCode = run.status ?? 2;
} catch (error) {
  console.error(`[lint:repo] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
} finally {
  if (baseDir) rmSync(baseDir, { recursive: true, force: true });
}
