import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import YAML from 'yaml';

const ignoredDirectories = new Set(['node_modules', 'dist']);

function workspacePatterns(root) {
  const path = resolve(root, 'pnpm-workspace.yaml');
  const document = YAML.parseDocument(readFileSync(path, 'utf8'), { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`${path} is invalid: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  const patterns = document.toJS()?.packages;
  if (!Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== 'string')) {
    throw new Error(`${path} must declare package globs`);
  }
  return patterns;
}

function matchingDirectories(root, pattern) {
  const segments = pattern.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' ||
      (segment.includes('*') && segment !== '*'))) {
    throw new Error(`unsupported workspace package glob: ${pattern}`);
  }
  let paths = [root];
  for (const segment of segments) {
    const next = [];
    for (const path of paths) {
      if (!existsSync(path)) continue;
      if (segment === '*') {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
          if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) next.push(join(path, entry.name));
        }
      } else if (!ignoredDirectories.has(segment)) {
        const child = join(path, segment);
        if (existsSync(child)) next.push(child);
      }
    }
    paths = next;
  }
  return paths;
}

function display(root, path) {
  return relative(root, path).split(sep).join('/');
}

export function snapshotPrivateWorkspacePackages(root) {
  const absoluteRoot = resolve(root);
  const packages = new Map();
  for (const pattern of workspacePatterns(absoluteRoot)) {
    const requiredManifest = pattern.split('/').at(-1) !== '*';
    for (const directory of matchingDirectories(absoluteRoot, pattern)) {
      if (directory === absoluteRoot || packages.has(directory)) continue;
      const manifestPath = join(directory, 'package.json');
      if (!existsSync(manifestPath)) {
        if (requiredManifest) throw new Error(`workspace manifest is missing: ${display(absoluteRoot, manifestPath)}`);
        continue;
      }
      const manifestBytes = readFileSync(manifestPath);
      let manifest;
      try {
        manifest = JSON.parse(manifestBytes.toString('utf8'));
      } catch (error) {
        throw new Error(`${display(absoluteRoot, manifestPath)} is invalid JSON: ${error.message}`);
      }
      if (manifest.private !== true) continue;
      const changelogPath = join(directory, 'CHANGELOG.md');
      packages.set(directory, [
        { path: manifestPath, bytes: manifestBytes },
        { path: changelogPath, bytes: existsSync(changelogPath) ? readFileSync(changelogPath) : null },
      ]);
    }
  }
  return { root: absoluteRoot, files: [...packages.values()].flat() };
}

export function restorePrivateWorkspacePackages(snapshot) {
  const errors = [];
  for (const file of snapshot.files) {
    try {
      if (file.bytes === null) {
        rmSync(file.path, { force: true });
      } else {
        writeFileSync(file.path, file.bytes);
      }
    } catch (error) {
      errors.push(new Error(`${display(snapshot.root, file.path)}: ${error.message}`, { cause: error }));
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'private workspace package restoration failed');
}
