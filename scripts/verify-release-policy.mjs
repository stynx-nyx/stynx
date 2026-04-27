import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const rootManifest = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const expectedLicense = rootManifest.license;

if (typeof expectedLicense !== 'string' || expectedLicense.length === 0) {
  console.error('Root package.json must declare the repository license choice.');
  process.exit(1);
}

function collectPackages(baseDir, matcher) {
  const resolvedBase = resolve(repoRoot, baseDir);
  return readdirSync(resolvedBase)
    .map((entry) => resolve(resolvedBase, entry))
    .filter((dirPath) => existsSync(resolve(dirPath, 'package.json')))
    .map((dirPath) => ({
      dirPath,
      relativeDir: dirPath.replace(`${repoRoot}/`, ''),
      manifest: JSON.parse(readFileSync(resolve(dirPath, 'package.json'), 'utf8')),
    }))
    .filter(({ manifest }) => !manifest.private)
    .filter(({ manifest }) => matcher(manifest.name));
}

const packages = [
  ...collectPackages('packages', (name) => typeof name === 'string' && name.startsWith('@stynx/')),
  ...collectPackages('packages-web', (name) => typeof name === 'string' && name.startsWith('@stynx-web/')),
];

const errors = [];

for (const pkg of packages) {
  const licensePath = resolve(pkg.dirPath, 'LICENSE');
  if (!existsSync(licensePath)) {
    errors.push(`${pkg.manifest.name}: missing LICENSE file`);
  } else {
    const content = readFileSync(licensePath, 'utf8');
    if (!content.includes(expectedLicense)) {
      errors.push(`${pkg.manifest.name}: LICENSE file does not reference ${expectedLicense}`);
    }
  }

  const exportKeys = pkg.manifest.exports && typeof pkg.manifest.exports === 'object'
    ? Object.keys(pkg.manifest.exports)
    : [];
  if (exportKeys.length !== 1 || exportKeys[0] !== '.') {
    errors.push(`${pkg.manifest.name}: exports must contain only the "." barrel entry`);
  }
}

if (errors.length > 0) {
  console.error('Release policy verification failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Verified release policy for ${packages.length} publishable packages.`);
