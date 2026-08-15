#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const outputPath = resolve(repoRoot, 'docs/meta/security/sbom.cdx.json');
await verifyLocalImageSizeFork();
const packageManifests = discoverPackageManifests(repoRoot);
const rootManifest = readJson(resolve(repoRoot, 'package.json'));
const lockPath = resolve(repoRoot, 'pnpm-lock.yaml');
const lockHash = createHash('sha256').update(readFileSync(lockPath)).digest('hex');
const componentIndex = new Map();

for (const manifestPath of packageManifests) {
  const manifest = readJson(manifestPath);
  if (manifest.name) {
    componentIndex.set(manifest.name, workspaceComponent(manifest, manifestPath));
  }
  for (const dependencyName of dependencyNames(manifest)) {
    if (dependencyName.startsWith('@stynx-nyx/') || dependencyName.startsWith('@stynx-nyx/'))
      continue;
    const dependencyManifest = resolveInstalledManifest(dependencyName);
    if (!dependencyManifest || componentIndex.has(dependencyName)) continue;
    componentIndex.set(dependencyName, externalComponent(dependencyName, dependencyManifest));
  }
}

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${uuidFromHash(lockHash)}`,
  version: 1,
  metadata: {
    timestamp: '2026-05-29T00:00:00.000Z',
    tools: [
      {
        vendor: 'stynx',
        name: 'scripts/generate-sbom.mjs',
        version: rootManifest.version ?? '0.0.0',
      },
    ],
    component: {
      type: 'application',
      name: rootManifest.name,
      version: rootManifest.version,
      licenses: licenseRefs(rootManifest.license),
    },
    properties: [
      { name: 'stynx:pnpm-lock-sha256', value: lockHash },
      { name: 'stynx:package-manager', value: rootManifest.packageManager ?? 'pnpm' },
    ],
  },
  components: [...componentIndex.values()].sort((left, right) =>
    `${left.name}@${left.version ?? ''}`.localeCompare(`${right.name}@${right.version ?? ''}`),
  ),
};

const next = `${JSON.stringify(sbom, null, 2)}\n`;

if (args.has('--check')) {
  if (!existsSync(outputPath)) {
    console.error('[sbom] missing docs/meta/security/sbom.cdx.json; run pnpm security:sbom');
    process.exit(1);
  }
  const current = readFileSync(outputPath, 'utf8');
  if (current !== next) {
    console.error('[sbom] docs/meta/security/sbom.cdx.json is stale; run pnpm security:sbom');
    process.exit(1);
  }
  console.log(`[sbom] OK: ${sbom.components.length} components verified`);
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, next);
  console.log(
    `[sbom] wrote ${relative(repoRoot, outputPath)} with ${sbom.components.length} components`,
  );
}

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

function workspaceComponent(manifest, manifestPath) {
  return {
    type: 'library',
    name: manifest.name,
    version: manifest.version ?? '0.0.0',
    scope: manifest.private ? 'excluded' : 'required',
    licenses: licenseRefs(manifest.license),
    purl: manifest.private ? undefined : npmPurl(manifest.name, manifest.version ?? '0.0.0'),
    properties: [{ name: 'stynx:workspacePath', value: relative(repoRoot, dirname(manifestPath)) }],
  };
}

function externalComponent(packageName, manifest) {
  return {
    type: 'library',
    name: packageName,
    version: manifest.version ?? '0.0.0',
    scope: 'required',
    licenses: licenseRefs(manifest.license),
    purl: npmPurl(packageName, manifest.version ?? '0.0.0'),
  };
}

function licenseRefs(license) {
  if (!license || typeof license !== 'string') return [];
  return [{ license: { id: license.replace(/[()]/gu, '').split(/\s+(?:OR|AND)\s+/u)[0] } }];
}

function npmPurl(packageName, version) {
  const encodedName = packageName.startsWith('@') ? packageName.replace('/', '%2f') : packageName;
  return `pkg:npm/${encodedName}@${version}`;
}

function uuidFromHash(hash) {
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

async function verifyLocalImageSizeFork() {
  const forkRoot = resolve(repoRoot, 'tools/image-size-safe');
  const forkManifest = readJson(resolve(forkRoot, 'package.json'));
  assert.equal(forkManifest.name, 'image-size');
  assert.equal(forkManifest.version, '2.0.3-stynx.1');

  const [{ HEIF }, { ICNS }, { JXL }] = await Promise.all([
    import(resolve(forkRoot, 'dist/types/heif.mjs')),
    import(resolve(forkRoot, 'dist/types/icns.mjs')),
    import(resolve(forkRoot, 'dist/types/jxl.mjs')),
  ]);
  const writeAscii = (target, offset, value) => target.set(Buffer.from(value, 'ascii'), offset);
  const writeUint32 = (target, offset, value) =>
    new DataView(target.buffer).setUint32(offset, value, false);

  const icns = new Uint8Array(16);
  writeAscii(icns, 0, 'icns');
  writeUint32(icns, 4, icns.length);
  writeAscii(icns, 8, 'ic07');
  assert.throws(() => ICNS.calculate(icns), /entry length/);

  const jxl = new Uint8Array(8);
  writeAscii(jxl, 4, 'jxlp');
  assert.throws(() => JXL.calculate(jxl), /No codestream/);

  const heif = new Uint8Array(40);
  writeUint32(heif, 0, 40);
  writeAscii(heif, 4, 'meta');
  writeUint32(heif, 12, 28);
  writeAscii(heif, 16, 'iprp');
  writeUint32(heif, 20, 20);
  writeAscii(heif, 24, 'ipco');
  writeAscii(heif, 32, 'ispe');
  assert.throws(() => HEIF.calculate(heif), /no sizes/);
}
