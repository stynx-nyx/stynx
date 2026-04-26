import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsDir = resolve(scriptDir, '..');
const repoRoot = resolve(docsDir, '..');
const apiOutDir = resolve(docsDir, '.generated/site-docs/api-reference');
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

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

function renderIndex(packages) {
  const lines = [
    '---',
    'title: API Reference',
    '---',
    '',
    '# API Reference',
    '',
    'Generated API reference for every `@stynx/*` and `@stynx-web/*` package.',
    '',
  ];

  for (const pkg of packages) {
    const slug = pkg.manifest.name.replace(/^@/u, '').replace(/[\/]/gu, '-');
    lines.push(`- [${pkg.manifest.name}](./${slug}/)`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function collectMarkdownFiles(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }
  return files;
}

function normalizePackageIndex(targetDir) {
  const readmePath = resolve(targetDir, 'README.md');
  const indexPath = resolve(targetDir, 'index.md');
  if (existsSync(readmePath)) {
    renameSync(readmePath, indexPath);
  }
}

function rewriteReadmeLinks(targetDir) {
  const files = collectMarkdownFiles(targetDir);
  for (const filePath of files) {
    const original = readFileSync(filePath, 'utf8');
    const updated = original
      .replace(/\(([^)\s]*?)README\.md((?:#[^)]+)?)\)/gu, '($1index.md$2)')
      .replace(/^- \[([^\]]+)\]\(@[^)\s]+\)$/gmu, '- `$1`');
    if (updated !== original) {
      writeFileSync(filePath, updated);
    }
    if (updated.includes('README.md')) {
      throw new Error(`Unrewritten README link remains in ${filePath}`);
    }
  }
}

const packages = [
  ...collectPackages('packages', (name) => typeof name === 'string' && name.startsWith('@stynx/')),
  ...collectPackages('packages-web', (name) => typeof name === 'string' && name.startsWith('@stynx-web/')),
];

rmSync(apiOutDir, { recursive: true, force: true });
mkdirSync(apiOutDir, { recursive: true });

for (const pkg of packages) {
  const slug = pkg.manifest.name.replace(/^@/u, '').replace(/[\/]/gu, '-');
  const targetDir = resolve(apiOutDir, slug);
  mkdirSync(targetDir, { recursive: true });

  const result = spawnSync(
    pnpmBin,
    [
      'exec',
      'typedoc',
      '--plugin',
      'typedoc-plugin-markdown',
      '--entryPoints',
      'src/index.ts',
      '--tsconfig',
      'tsconfig.json',
      '--readme',
      'none',
      '--out',
      targetDir,
    ],
    {
      cwd: pkg.dirPath,
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    throw new Error(`TypeDoc failed for ${pkg.manifest.name}`);
  }

  normalizePackageIndex(targetDir);
  rewriteReadmeLinks(targetDir);
}

writeFileSync(resolve(apiOutDir, 'index.md'), renderIndex(packages));
