#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyReleaseContext,
  releaseContextConstants,
  ReleaseContextError,
} from './lib/release-context.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(code, message) {
  console.error(`[release-preparation] ${code}: ${message}`);
  process.exit(1);
}

function run(executable, args, { capture = false } = {}) {
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    shell: false,
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    const detail = result.error?.message ?? result.signal ?? `exit ${result.status}`;
    fail('RELEASE_PREPARATION_COMMAND', `${executable} ${args.join(' ')} failed (${detail})`);
  }
  return String(result.stdout ?? '').trim();
}

function git(args) {
  return run('git', ['-C', repoRoot, ...args], { capture: true });
}

function parseChanges(baseCommit, headCommit) {
  const output = git(['diff', '--name-status', '--no-renames', baseCommit, headCommit]);
  if (output === '') return [];
  return output.split('\n').map((line) => {
    const [status, path, extra] = line.split('\t');
    if (!['A', 'M', 'D'].includes(status) || !path || extra !== undefined) {
      fail('RELEASE_CONTEXT_DIFF_FORMAT', 'candidate contains an unsupported diff entry');
    }
    return { status, path };
  });
}

function readGitJson(revision, path) {
  return JSON.parse(git(['show', `${revision}:${path}`]));
}

function rootManifestFollowUpValid(versionCommit) {
  const before = readGitJson(versionCommit, 'package.json');
  const after = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
  const expected = structuredClone(before);
  expected.scripts['ci:stynx:release'] = releaseContextConstants.releasePreparationCommand;
  return JSON.stringify(expected) === JSON.stringify(after);
}

function releaseContext() {
  const baseCommit = git(['rev-parse', 'origin/main']);
  const headCommit = git(['rev-parse', 'HEAD']);
  const commitShas = git([
    'rev-list',
    '--first-parent',
    '--reverse',
    `${baseCommit}..${headCommit}`,
  ]);
  const commits =
    commitShas === ''
      ? []
      : commitShas.split('\n').map((sha) => ({
          sha,
          subject: git(['show', '-s', '--format=%s', sha]),
        }));
  const marker = commits.find(
    (commit) => commit.subject === releaseContextConstants.versionCommitSubject,
  );

  return classifyReleaseContext({
    baseCommit,
    headCommit,
    commits,
    versionParent: marker ? git(['rev-parse', `${marker.sha}^`]) : null,
    versionChanges: marker ? parseChanges(baseCommit, marker.sha) : [],
    followUpChanges: marker ? parseChanges(marker.sha, headCommit) : [],
    rootManifestFollowUpValid: marker ? rootManifestFollowUpValid(marker.sha) : false,
  });
}

for (const command of [
  'security:release',
  'release:provenance',
  'release:policy',
  'api:baselines',
  'release:consumer-fixtures',
]) {
  run('pnpm', ['run', command]);
}

try {
  const context = releaseContext();
  if (context.kind === 'ordinary') {
    run('pnpm', ['run', 'release:drafts']);
  } else {
    console.log(
      `[release-preparation] validated version candidate ${context.versionCommit}: ` +
        `${context.packageCount} packages, ${context.changesetCount} consumed changesets; ` +
        'release draft generation is not applicable',
    );
  }
} catch (error) {
  if (error instanceof ReleaseContextError) fail(error.code, error.message);
  throw error;
}
