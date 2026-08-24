import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  if (readFileSync(path, 'utf8') !== next) writeFileSync(path, next);
}

function collectPackages(repoRoot, directory) {
  const base = resolve(repoRoot, directory);
  return readdirSync(base)
    .map((entry) => resolve(base, entry, 'package.json'))
    .filter((manifestPath) => existsSync(manifestPath))
    .map((manifestPath) => ({ manifestPath, manifest: readJson(manifestPath) }))
    .filter(
      ({ manifest }) =>
        manifest.private !== true &&
        typeof manifest.name === 'string' &&
        manifest.name.startsWith('@stynx-nyx/'),
    );
}

export function collectPublicPackages(repoRoot) {
  return [
    ...collectPackages(repoRoot, 'packages'),
    ...collectPackages(repoRoot, 'packages-web'),
  ].sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
}

export function publicPackageNames(repoRoot) {
  return collectPublicPackages(repoRoot).map(({ manifest }) => manifest.name);
}

export function validateReleaseVersionPolicy(repoRoot, changesetConfig, options = {}) {
  const rootPath = resolve(repoRoot, 'package.json');
  const rootManifest = readJson(rootPath);
  const packages = collectPublicPackages(repoRoot);
  const packageNames = packages.map(({ manifest }) => manifest.name);
  const errors = [];
  const expectedVersion = options.expectedVersion;

  if (packages.length === 0) errors.push('release version policy found no public packages');

  const versions = new Set(packages.map(({ manifest }) => manifest.version));
  if (versions.size !== 1 || !versions.has(rootManifest.version)) {
    errors.push(
      `root and public package versions must be identical; root=${rootManifest.version}, packages=${[
        ...versions,
      ].join(',')}`,
    );
  }
  if (expectedVersion !== undefined && rootManifest.version !== expectedVersion) {
    errors.push(`root package version must be exactly ${expectedVersion}`);
  }
  if (expectedVersion !== undefined) {
    for (const { manifest } of packages) {
      if (manifest.version !== expectedVersion) {
        errors.push(`${manifest.name}: version must be exactly ${expectedVersion}`);
      }
    }
  }

  const fixed = changesetConfig.fixed;
  if (
    !Array.isArray(fixed) ||
    fixed.length !== 1 ||
    JSON.stringify([...fixed[0]].sort()) !== JSON.stringify(packageNames)
  ) {
    errors.push('Changesets fixed group must contain exactly the complete public package roster');
  }

  for (const { manifest } of packages) {
    for (const section of dependencySections) {
      for (const [name, range] of Object.entries(manifest[section] ?? {})) {
        if (!packageNames.includes(name)) continue;
        if (String(range).startsWith('workspace:')) {
          if (expectedVersion !== undefined && range !== 'workspace:*') {
            errors.push(
              `${manifest.name}: ${section}.${name} must be workspace:* for exact ${expectedVersion} publication`,
            );
          }
          continue;
        }
        if (range !== `^${rootManifest.version}`) {
          errors.push(`${manifest.name}: ${section}.${name} must be ^${rootManifest.version}`);
        }
      }
    }
  }

  const templatePath = resolve(repoRoot, 'tools/create-stynx-app/template/package.json');
  const template = readJson(templatePath);
  for (const [name, range] of Object.entries(template.dependencies ?? {})) {
    if (packageNames.includes(name) && range !== `^${rootManifest.version}`) {
      errors.push(`create-stynx-app template dependency ${name} must be ^${rootManifest.version}`);
    }
  }

  return errors;
}

export function syncReleaseVersion(repoRoot) {
  const packages = collectPublicPackages(repoRoot);
  const versions = new Set(packages.map(({ manifest }) => manifest.version));
  if (versions.size !== 1) {
    throw new Error(`public package versions are not unified: ${[...versions].join(', ')}`);
  }
  const [version] = versions;
  const packageNames = new Set(packages.map(({ manifest }) => manifest.name));

  const rootPath = resolve(repoRoot, 'package.json');
  const rootManifest = readJson(rootPath);
  rootManifest.version = version;
  writeJson(rootPath, rootManifest);

  for (const { manifestPath, manifest } of packages) {
    for (const section of dependencySections) {
      for (const [name, range] of Object.entries(manifest[section] ?? {})) {
        if (!packageNames.has(name) || String(range).startsWith('workspace:')) continue;
        manifest[section][name] = `^${version}`;
      }
    }
    writeJson(manifestPath, manifest);
  }

  const templatePath = resolve(repoRoot, 'tools/create-stynx-app/template/package.json');
  const template = readJson(templatePath);
  for (const name of Object.keys(template.dependencies ?? {})) {
    if (packageNames.has(name)) template.dependencies[name] = `^${version}`;
  }
  writeJson(templatePath, template);

  return { packageCount: packages.length, version };
}
