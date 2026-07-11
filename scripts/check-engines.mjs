#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const manifest = readJson(join(repoRoot, 'package.json'));
const expectedNode = manifest.engines?.node;
const expectedPnpm = manifest.engines?.pnpm;
const nodeMajor = Number(process.versions.node.split('.')[0]);
const packageManager = manifest.packageManager;

const supported = {
  angularPeer: '>=20.3.0 <22',
  angularBuild: '21.2.18',
  ngPackagr: '21.2.3',
  nestPeer: '^11.1.19',
  node: '>=24 <25',
  nodeTypes: '24.12.4',
  pnpm: '>=9 <10',
  packageManager: 'pnpm@9.15.0',
  tsAngular: '5.9.3',
  tsNode: '^6.0.3',
};

// Reference apps and standalone test harnesses are not part of the
// publishable dependency graph (packages/, packages-web/) and are allowed to
// run ahead of the workspace-pinned @types/node / Angular TypeScript
// versions so they can exercise forward compatibility. 2026-07 dependency
// round: @types/node 25.6.0, reference/web TypeScript 6.0.2 (within
// @angular/compiler-cli@21.2.18's supported >=5.9 <6.1 peer range).
const NODE_TYPES_EXCEPTIONS = {
  'reference/api/package.json': '25.6.0',
  'test/db/package.json': '25.6.0',
  'test/packages/package.json': '25.6.0',
};
const TS_ANGULAR_EXCEPTIONS = {
  'reference/web/package.json': '6.0.2',
};

const failures = [];
if (expectedNode !== supported.node || nodeMajor !== 24) {
  failures.push(`node ${process.versions.node} does not satisfy ${expectedNode ?? '(missing)'}`);
}

if (expectedPnpm !== supported.pnpm) {
  failures.push(`pnpm engine must be >=9 <10, got ${expectedPnpm ?? '(missing)'}`);
}

if (packageManager !== supported.packageManager) {
  failures.push(`packageManager must be ${supported.packageManager}, got ${packageManager ?? '(missing)'}`);
}

for (const packagePath of discoverPackageJsons()) {
  const pkg = readJson(packagePath);
  const rel = relative(repoRoot, packagePath);
  const sections = ['dependencies', 'devDependencies', 'peerDependencies'];

  for (const section of sections) {
    for (const [name, version] of Object.entries(pkg[section] ?? {})) {
      if (name === '@types/node') {
        const expectedNodeTypes = NODE_TYPES_EXCEPTIONS[rel] ?? supported.nodeTypes;
        if (version !== expectedNodeTypes) {
          failures.push(`${rel}: ${section}.${name} must be ${expectedNodeTypes}, got ${version}`);
        }
      }
    }
  }

  if (isAngularPackage(packagePath)) {
    for (const [name, version] of Object.entries(pkg.peerDependencies ?? {})) {
      if (name.startsWith('@angular/') && version !== supported.angularPeer) {
        failures.push(`${rel}: ${name} peer must be ${supported.angularPeer}, got ${version}`);
      }
    }
    for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
      if (name.startsWith('@angular/') && version !== supported.angularBuild) {
        failures.push(`${rel}: ${name} build dependency must be ${supported.angularBuild}, got ${version}`);
      }
    }
    if (pkg.devDependencies?.['ng-packagr'] && pkg.devDependencies['ng-packagr'] !== supported.ngPackagr) {
      failures.push(`${rel}: ng-packagr must be ${supported.ngPackagr}, got ${pkg.devDependencies['ng-packagr']}`);
    }
    const expectedTsAngular = TS_ANGULAR_EXCEPTIONS[rel] ?? supported.tsAngular;
    if (pkg.devDependencies?.typescript && pkg.devDependencies.typescript !== expectedTsAngular) {
      failures.push(`${rel}: Angular TypeScript must be ${expectedTsAngular}, got ${pkg.devDependencies.typescript}`);
    }
  }

  if (rel === 'domain/demo-bookmark/web/package.json' && Object.keys(pkg.dependencies ?? {}).length > 0) {
    failures.push(`${rel}: scaffold-evidence package must not declare production dependencies`);
  }

  if (isBackendPackage(packagePath)) {
    for (const [name, version] of Object.entries(pkg.peerDependencies ?? {})) {
      if (name.startsWith('@nestjs/') && version !== supported.nestPeer) {
        failures.push(`${rel}: ${name} peer must be ${supported.nestPeer}, got ${version}`);
      }
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[engines][fail] ${failure}`);
  }
  process.exit(1);
}

console.log(
  `[engines][ok] node ${process.versions.node}; pnpm ${expectedPnpm}; Angular ${supported.angularBuild}; NestJS ${supported.nestPeer}; TypeScript ${supported.tsNode}/${supported.tsAngular}`,
);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function discoverPackageJsons() {
  return [
    join(repoRoot, 'package.json'),
    ...packageJsonsIn(join(repoRoot, 'packages')),
    ...packageJsonsIn(join(repoRoot, 'packages-web')),
    ...packageJsonsIn(join(repoRoot, 'reference')),
    ...packageJsonsIn(join(repoRoot, 'domain'), 2),
    ...packageJsonsIn(join(repoRoot, 'tools')),
    ...packageJsonsIn(join(repoRoot, 'test')),
    join(repoRoot, 'docs/site/package.json'),
  ].filter((path) => existsSync(path));
}

function packageJsonsIn(root, depth = 1) {
  if (!existsSync(root) || depth < 0) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const direct = entries
    .filter((entry) => entry.isDirectory() && !ignoredPackageDir(entry.name))
    .map((entry) => join(root, entry.name, 'package.json'))
    .filter((path) => existsSync(path));
  const nested = depth === 0
    ? []
    : entries
      .filter((entry) => entry.isDirectory() && !ignoredPackageDir(entry.name))
      .flatMap((entry) => packageJsonsIn(join(root, entry.name), depth - 1));
  return [...direct, ...nested];
}

function ignoredPackageDir(name) {
  return ['dist', 'node_modules', 'coverage', 'build'].includes(name);
}

function isAngularPackage(packagePath) {
  const rel = relative(repoRoot, packagePath);
  return rel.startsWith('packages-web/') || rel === 'reference/web/package.json';
}

function isBackendPackage(packagePath) {
  const rel = relative(repoRoot, packagePath);
  return rel.startsWith('packages/') || rel === 'reference/api/package.json';
}
