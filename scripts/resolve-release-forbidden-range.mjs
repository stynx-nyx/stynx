#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function resolveReleaseForbiddenRange({
  repoRoot = process.cwd(),
  candidate = 'HEAD',
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
  apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com',
} = {}) {
  const candidateSha = git(repoRoot, ['rev-parse', `${candidate}^{commit}`]);
  if (!/^[0-9a-f]{40}$/u.test(candidateSha))
    throw new Error('candidate did not resolve to a commit');

  const resolvedRepository = repository || repositoryFromOrigin(repoRoot);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(resolvedRepository)) {
    throw new Error('GITHUB_REPOSITORY must be an owner/repository pair');
  }
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('release-range resolution requires an authenticated GitHub token');
  }

  const tags = git(repoRoot, ['tag', '--merged', candidateSha, '--list', 'v*'])
    .split('\n')
    .filter(Boolean)
    .map((tag) => ({ tag, version: parseStableVersionTag(tag) }))
    .sort((left, right) => compareVersions(right.version, left.version));
  if (tags.length === 0) throw new Error('no reachable stable v<semver> release tag exists');

  const releases = [];
  for (const entry of tags) {
    const objectType = git(repoRoot, ['cat-file', '-t', `refs/tags/${entry.tag}`]);
    if (objectType !== 'tag') throw new Error(`${entry.tag} is not an annotated release tag`);
    const sinceRef = git(repoRoot, ['rev-parse', `refs/tags/${entry.tag}^{commit}`]);
    const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', sinceRef, candidateSha], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (ancestry.status !== 0) throw new Error(`${entry.tag} is not an ancestor of the candidate`);

    const release = await githubRelease(apiUrl, resolvedRepository, entry.tag, token);
    if (release.draft === true || release.prerelease === true || !release.published_at) {
      throw new Error(`${entry.tag} is not a published stable GitHub Release`);
    }
    if (release.tag_name !== entry.tag)
      throw new Error(`${entry.tag} release metadata is malformed`);
    releases.push({ ...entry, sinceRef, publishedAt: release.published_at });
  }

  const selected = releases[0];
  return {
    ok: true,
    candidate: candidateSha,
    repository: resolvedRepository,
    tag: selected.tag,
    sinceRef: selected.sinceRef,
    publishedAt: selected.publishedAt,
  };
}

export function parseStableVersionTag(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(tag);
  if (!match) throw new Error(`malformed stable release tag: ${tag}`);
  return match.slice(1).map((part) => BigInt(part));
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

async function githubRelease(apiUrl, repository, tag, token) {
  const response = await fetch(
    `${apiUrl.replace(/\/$/u, '')}/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub Release lookup for ${tag} failed with HTTP ${response.status}`);
  }
  return response.json();
}

function repositoryFromOrigin(repoRoot) {
  const origin = git(repoRoot, ['remote', 'get-url', 'origin']);
  const match = /github\.com(?::|\/)([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(origin);
  if (!match) throw new Error('origin is not a supported GitHub repository URL');
  return `${match[1]}/${match[2]}`;
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed with exit ${String(result.status)}`);
  }
  return result.stdout.trim();
}

async function main() {
  const args = process.argv.slice(2);
  let candidate = 'HEAD';
  let githubOutput;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--candidate') candidate = args[++index];
    else if (args[index] === '--github-output') githubOutput = args[++index];
    else throw new Error(`unknown argument: ${args[index]}`);
  }
  if (!candidate) throw new Error('--candidate requires a value');
  if (args.includes('--github-output') && !githubOutput) {
    throw new Error('--github-output requires a value');
  }

  const result = await resolveReleaseForbiddenRange({ candidate });
  if (githubOutput) {
    appendFileSync(
      resolve(githubOutput),
      `tag=${result.tag}\nsince_ref=${result.sinceRef}\ncandidate=${result.candidate}\n`,
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`release forbidden-action range failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
