#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = process.cwd();
const policy = JSON.parse(
  readFileSync(resolve(repoRoot, 'docs/meta/security/license-policy.json'), 'utf8'),
);
const allowed = new Set(policy.allowedLicenses ?? []);
const denied = new Set(policy.deniedLicenses ?? []);
const failures = [];
const checked = new Set();
const manifests = discoverPackageManifests(repoRoot).map((path) => ({
  path,
  manifest: readJson(path),
}));
const workspaceNames = new Set(
  manifests
    .map(({ manifest }) => manifest.name)
    .filter((name) => typeof name === 'string' && name.length > 0),
);
const releaseManifests = manifests.filter(
  ({ path, manifest }) =>
    path === resolve(repoRoot, 'package.json') ||
    (!manifest.private &&
      typeof manifest.name === 'string' &&
      (manifest.name.startsWith('@stynx-nyx/') || manifest.name.startsWith('@stynx-nyx/'))),
);

for (const { manifest } of releaseManifests) {
  for (const dependencyName of dependencyNames(manifest)) {
    if (workspaceNames.has(dependencyName)) continue;
    if (checked.has(dependencyName)) continue;
    checked.add(dependencyName);
    const dependencyManifest = resolveInstalledManifest(dependencyName);
    if (!dependencyManifest) {
      failures.push(`${dependencyName}: dependency manifest not found in node_modules`);
      continue;
    }
    const licenses = extractLicenseIds(dependencyManifest.license);
    if (licenses.length === 0) {
      failures.push(`${dependencyName}: missing license metadata`);
      continue;
    }
    const allowedMatch = licenses.find((license) => allowed.has(license));
    if (allowedMatch) {
      continue;
    }
    const deniedMatch = licenses.find((license) => denied.has(license));
    if (deniedMatch) {
      failures.push(`${dependencyName}: denied license ${deniedMatch}`);
    } else {
      failures.push(
        `${dependencyName}: license ${licenses.join(' OR ')} is not in policy allowlist`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('[license-policy] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `[license-policy] OK: ${checked.size} direct external dependencies checked across ${releaseManifests.length} release manifests`,
);

function discoverPackageManifests(root) {
  const results = [];
  walk(root, results);
  return results.sort((left, right) => left.localeCompare(right));
}

function walk(dir, results) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name.startsWith('.') ||
      ['coverage', 'dist', 'node_modules', 'tmp'].includes(entry.name)
    ) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, results);
    } else if (entry.isFile() && entry.name === 'package.json') {
      results.push(path);
    }
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function dependencyNames(manifest) {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ].sort((left, right) => left.localeCompare(right));
}

function resolveInstalledManifest(packageName) {
  const candidates = [
    resolve(repoRoot, 'node_modules', packageName, 'package.json'),
    resolve(repoRoot, 'node_modules/.pnpm/node_modules', packageName, 'package.json'),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  return path ? readJson(path) : null;
}

function extractLicenseIds(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[()]/gu, '')
      .split(/\s+(?:OR|AND)\s+/u)
      .map((license) => license.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractLicenseIds(entry?.type ?? entry));
  }
  return [];
}
