import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectPublicPackages, validateReleaseVersionPolicy } from './release-version-policy.mjs';

export const unifiedRebaselineSource = '0.5.0';
export const unifiedRebaselineTarget = '1.1.1';
export const unifiedRebaselinePackageCount = 38;

const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const rebaselineSection = `### Unified Version Rebaseline

- Re-establish the canonical STYNX 1.x line at exact version 1.1.1 for the complete 38-package fixed group without changing runtime behavior or public contracts.`;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function updateInternalRanges(manifest, packageNames) {
  for (const section of dependencySections) {
    for (const [name, range] of Object.entries(manifest[section] ?? {})) {
      if (!packageNames.has(name) || String(range).startsWith('workspace:')) continue;
      manifest[section][name] = `^${unifiedRebaselineTarget}`;
    }
  }
}

function versionSectionRange(changelog, target) {
  const heading = `## ${target}`;
  const starts = [...changelog.matchAll(/^## .+$/gmu)].map((match) => ({
    heading: match[0],
    start: match.index,
  }));
  const matches = starts.filter((entry) => entry.heading === heading);
  if (matches.length > 1) {
    throw new Error(`changelog contains more than one ${heading} section`);
  }
  if (matches.length === 0) return undefined;
  const match = matches[0];
  const index = starts.findIndex((entry) => entry === match);
  return {
    start: match.start,
    end: starts[index + 1]?.start ?? changelog.length,
  };
}

function stripRebaselineSection(body) {
  const escaped = rebaselineSection.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return body.replace(new RegExp(`(?:^|\\n)${escaped}(?:\\n|$)`, 'u'), '\n').trim();
}

export function expectedRebaselineChangelog(current, packageName) {
  const title = current.split('\n', 1)[0];
  if (!/^# \S/u.test(title)) {
    throw new Error(`${packageName}: changelog must begin with a level-one title`);
  }

  const range = versionSectionRange(current, unifiedRebaselineTarget);
  let priorTargetBody = '';
  let remaining = current;
  if (range) {
    const section = current.slice(range.start, range.end).trim();
    priorTargetBody = stripRebaselineSection(
      section.slice(`## ${unifiedRebaselineTarget}`.length).trim(),
    );
    remaining = `${current.slice(0, range.start).trimEnd()}\n\n${current
      .slice(range.end)
      .trimStart()}`.trimEnd();
  }

  const remainder = remaining.slice(title.length).trim();
  const preservedTargetBody = priorTargetBody ? `\n\n${priorTargetBody}` : '';
  const preservedHistory = remainder ? `\n\n${remainder}` : '';
  return `${title}\n\n## ${unifiedRebaselineTarget}\n\n${rebaselineSection}${preservedTargetBody}${preservedHistory}\n`;
}

function command(repoRoot, args) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function assertCommand(result, label) {
  if (result.status === 0) return;
  const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  throw new Error(`${label} failed${detail ? `:\n${detail}` : ''}`);
}

function validateRosterAndSource(repoRoot, changesetConfig, packages, rootManifest, mode) {
  if (packages.length !== unifiedRebaselinePackageCount) {
    throw new Error(
      `public package roster must contain exactly ${unifiedRebaselinePackageCount}; found ${packages.length}`,
    );
  }
  const versions = new Set(packages.map(({ manifest }) => manifest.version));
  if (versions.size !== 1 || !versions.has(rootManifest.version)) {
    throw new Error('root and all public package versions must be unified before rebaseline');
  }
  const allowed =
    mode === 'write'
      ? new Set([unifiedRebaselineSource, unifiedRebaselineTarget])
      : new Set([unifiedRebaselineTarget]);
  if (!allowed.has(rootManifest.version)) {
    throw new Error(
      `rebaseline ${mode} requires unified ${[...allowed].join(' or ')} input; found ${rootManifest.version}`,
    );
  }
  const errors = validateReleaseVersionPolicy(repoRoot, changesetConfig);
  if (errors.length > 0) {
    throw new Error(`source release-version policy is invalid:\n- ${errors.join('\n- ')}`);
  }
}

function plannedFiles(repoRoot, packages) {
  const packageNames = new Set(packages.map(({ manifest }) => manifest.name));
  const files = [];

  const rootPath = resolve(repoRoot, 'package.json');
  const rootManifest = readJson(rootPath);
  rootManifest.version = unifiedRebaselineTarget;
  files.push({ path: rootPath, expected: serializeJson(rootManifest) });

  for (const { manifestPath, manifest: originalManifest } of packages) {
    const manifest = structuredClone(originalManifest);
    manifest.version = unifiedRebaselineTarget;
    updateInternalRanges(manifest, packageNames);
    files.push({ path: manifestPath, expected: serializeJson(manifest) });

    const changelogPath = resolve(dirname(manifestPath), 'CHANGELOG.md');
    if (!existsSync(changelogPath)) {
      throw new Error(`${relative(repoRoot, changelogPath)} is missing`);
    }
    files.push({
      path: changelogPath,
      expected: expectedRebaselineChangelog(readFileSync(changelogPath, 'utf8'), manifest.name),
    });
  }

  const templatePath = resolve(repoRoot, 'tools/create-stynx-app/template/package.json');
  const template = readJson(templatePath);
  for (const name of Object.keys(template.dependencies ?? {})) {
    if (packageNames.has(name)) template.dependencies[name] = `^${unifiedRebaselineTarget}`;
  }
  files.push({ path: templatePath, expected: serializeJson(template) });

  return files;
}

function validateExpectedFiles(repoRoot, files) {
  const stale = files
    .filter(({ path, expected }) => readFileSync(path, 'utf8') !== expected)
    .map(({ path }) => relative(repoRoot, path));
  if (stale.length > 0) {
    throw new Error(`rebaseline files are stale:\n- ${stale.join('\n- ')}`);
  }
}

export function runUnifiedRebaseline(repoRoot, changesetConfig, mode) {
  const packages = collectPublicPackages(repoRoot);
  const rootManifest = readJson(resolve(repoRoot, 'package.json'));
  validateRosterAndSource(repoRoot, changesetConfig, packages, rootManifest, mode);
  const files = plannedFiles(repoRoot, packages);

  if (mode === 'check') {
    validateExpectedFiles(repoRoot, files);
    const policyErrors = validateReleaseVersionPolicy(repoRoot, changesetConfig, {
      expectedVersion: unifiedRebaselineTarget,
    });
    if (policyErrors.length > 0) {
      throw new Error(
        `rebaseline release-version policy is invalid:\n- ${policyErrors.join('\n- ')}`,
      );
    }
    assertCommand(
      command(repoRoot, ['scripts/generate-sbom.mjs', '--check']),
      'rebaseline SBOM check',
    );
    return { packageCount: packages.length, changedFiles: 0 };
  }

  const sbomPath = resolve(repoRoot, 'docs/meta/security/sbom.cdx.json');
  const originals = new Map(
    [...files.map(({ path }) => path), sbomPath].map((path) => [path, readFileSync(path, 'utf8')]),
  );
  try {
    for (const { path, expected } of files) {
      if (readFileSync(path, 'utf8') !== expected) writeFileSync(path, expected);
    }
    const policyErrors = validateReleaseVersionPolicy(repoRoot, changesetConfig, {
      expectedVersion: unifiedRebaselineTarget,
    });
    if (policyErrors.length > 0) {
      throw new Error(
        `rebaseline release-version policy is invalid:\n- ${policyErrors.join('\n- ')}`,
      );
    }
    assertCommand(
      command(repoRoot, ['scripts/generate-sbom.mjs', '--write']),
      'rebaseline SBOM generation',
    );
    assertCommand(
      command(repoRoot, ['scripts/generate-sbom.mjs', '--check']),
      'rebaseline SBOM check',
    );
    const changedFiles = [...originals].filter(
      ([path, original]) => readFileSync(path, 'utf8') !== original,
    ).length;
    return { packageCount: packages.length, changedFiles };
  } catch (error) {
    for (const [path, original] of originals) writeFileSync(path, original);
    throw error;
  }
}
