import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(scriptDir, '..');
const repoRoot = resolve(siteRoot, '..', '..');
const apiOutDir = resolve(siteRoot, '.generated/site-docs/api-reference');

function collectPackages(baseDir, matcher) {
  const resolvedBase = resolve(repoRoot, baseDir);
  return readdirSync(resolvedBase)
    .map((entry) => resolve(resolvedBase, entry))
    .filter((dirPath) => existsSync(resolve(dirPath, 'package.json')))
    .filter((dirPath) => isTrackedFile(resolve(dirPath, 'package.json')))
    .map((dirPath) => ({
      dirPath,
      manifest: JSON.parse(readFileSync(resolve(dirPath, 'package.json'), 'utf8')),
    }))
    .filter(({ manifest }) => matcher(manifest.name))
    .filter(({ dirPath }) => existsSync(resolve(dirPath, 'src/index.ts')));
}

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
  const slug = pkg.manifest.name.replace(/^@/u, '').replace(/[\/]/gu, '-');
  const indexPath = resolve(apiOutDir, slug, 'index.md');
  if (!existsSync(indexPath)) {
    missing.push(`${pkg.manifest.name} -> ${indexPath}`);
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
