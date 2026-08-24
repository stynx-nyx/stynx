import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const packageRoots = ['packages', 'packages-web'];
const publicScope = '@stynx-nyx/';

export function discoverPublishablePackages(repoRoot) {
  const packages = [];

  for (const packageRoot of packageRoots) {
    const absoluteRoot = resolve(repoRoot, packageRoot);
    if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) {
      throw new Error(`publishable package root is missing: ${packageRoot}`);
    }

    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (!entry.isDirectory()) continue;
      const dirPath = resolve(absoluteRoot, entry.name);
      const manifestPath = resolve(dirPath, 'package.json');
      if (!existsSync(manifestPath)) continue;

      let manifest;
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      } catch (error) {
        throw new Error(
          `${portableRelative(repoRoot, manifestPath)} is not valid JSON: ${error.message}`,
        );
      }

      if (manifest.private === true) continue;
      if (typeof manifest.name !== 'string' || !manifest.name.startsWith(publicScope)) {
        throw new Error(
          `${portableRelative(repoRoot, manifestPath)} is publishable but has no ${publicScope} name`,
        );
      }

      packages.push({
        name: manifest.name,
        dir: portableRelative(repoRoot, dirPath),
        dirPath,
        manifestPath,
        manifest,
      });
    }
  }

  packages.sort((left, right) => left.name.localeCompare(right.name));
  const seen = new Set();
  for (const entry of packages) {
    if (seen.has(entry.name)) throw new Error(`duplicate publishable package name: ${entry.name}`);
    seen.add(entry.name);
  }
  if (packages.length === 0) throw new Error('publishable package discovery found no packages');
  return packages;
}

export function publishablePackageNames(repoRoot) {
  return discoverPublishablePackages(repoRoot).map(({ name }) => name);
}

function portableRelative(repoRoot, path) {
  return relative(repoRoot, path).split(sep).join('/');
}
