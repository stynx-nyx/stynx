import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(scriptDir, '..');
const repoRoot = resolve(siteRoot, '..', '..');
const apiOutDir = resolve(siteRoot, '.generated/site-docs/api-reference');

/** @param {unknown} value @param {string} key @returns {unknown} */
function readJsonProperty(value, key) {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`);
  }
  /** @type {unknown} */
  const boxed = Object(value);
  if (typeof boxed !== 'object' || boxed === null) {
    throw new TypeError('Object conversion did not produce an object');
  }
  /** @type {unknown} */
  const result = Reflect.get(boxed, key, value);
  return result;
}

/** @param {unknown} manifest @returns {string} */
function selectedPackageName(manifest) {
  const name = readJsonProperty(manifest, 'name');
  if (typeof name !== 'string') {
    throw new TypeError('Selected package name is not a string');
  }
  return name;
}

/**
 * @param {string} baseDir
 * @param {(name: unknown) => boolean} matcher
 */
function collectPackages(baseDir, matcher) {
  const resolvedBase = resolve(repoRoot, baseDir);
  return readdirSync(resolvedBase)
    .map((entry) => resolve(resolvedBase, entry))
    .filter((dirPath) => existsSync(resolve(dirPath, 'package.json')))
    .filter((dirPath) => isTrackedFile(resolve(dirPath, 'package.json')))
    .map((dirPath) => {
      /** @type {unknown} */
      const manifest = JSON.parse(readFileSync(resolve(dirPath, 'package.json'), 'utf8'));
      return { dirPath, manifest };
    })
    .filter(({ manifest }) => matcher(readJsonProperty(manifest, 'name')))
    .filter(({ dirPath }) => existsSync(resolve(dirPath, 'src/index.ts')));
}

/**
 * @param {string} filePath
 */
function isTrackedFile(filePath) {
  const relativePath = relative(repoRoot, filePath).split(sep).join('/');
  const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  return result.status === 0;
}

const packages = [
  ...collectPackages('packages', (name) => typeof name === 'string' && name.startsWith('@stynx-nyx/')),
  ...collectPackages('packages-web', (name) => typeof name === 'string' && name.startsWith('@stynx-nyx/')),
];

const missing = [];
for (const pkg of packages) {
  const slug = selectedPackageName(pkg.manifest).replace(/^@/u, '').replace(/\//gu, '-');
  const indexPath = resolve(apiOutDir, slug, 'index.md');
  if (!existsSync(indexPath)) {
    missing.push(`${selectedPackageName(pkg.manifest)} -> ${indexPath}`);
  }
}

if (missing.length > 0) {
  console.error('Missing generated API reference output for:');
  for (const entry of missing) {
    console.error(`- ${entry}`);
  }
  process.exit(1);
}

console.log(`Verified generated API reference coverage for ${packages.length} packages.`);
