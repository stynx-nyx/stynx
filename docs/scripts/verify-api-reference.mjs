import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsDir = resolve(scriptDir, '..');
const repoRoot = resolve(docsDir, '..');
const apiOutDir = resolve(docsDir, '.generated/site-docs/api-reference');

function collectPackages(baseDir, matcher) {
  const resolvedBase = resolve(repoRoot, baseDir);
  return readdirSync(resolvedBase)
    .map((entry) => resolve(resolvedBase, entry))
    .filter((dirPath) => existsSync(resolve(dirPath, 'package.json')))
    .map((dirPath) => ({
      dirPath,
      manifest: JSON.parse(readFileSync(resolve(dirPath, 'package.json'), 'utf8')),
    }))
    .filter(({ manifest }) => matcher(manifest.name))
    .filter(({ dirPath }) => existsSync(resolve(dirPath, 'src/index.ts')));
}

const packages = [
  ...collectPackages('packages', (name) => typeof name === 'string' && name.startsWith('@stynx/')),
  ...collectPackages('packages-web', (name) => typeof name === 'string' && name.startsWith('@stynx-web/')),
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
