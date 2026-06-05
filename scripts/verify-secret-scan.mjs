#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const allowlistPath = resolve(repoRoot, 'docs/meta/security/secret-scan-allowlist.json');
const allowlist = new Set(
  JSON.parse(readFileSync(allowlistPath, 'utf8')).allowedFindings.map(
    (entry) => `${entry.file}:${entry.label}`,
  ),
);
const excludedDirs = new Set(['.git', '.turbo', 'coverage', 'dist', 'node_modules', 'tmp']);
const excludedFiles = new Set(['pnpm-lock.yaml', 'sbom.cdx.json']);
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.scss',
  '.sh',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u],
  ['aws access key id', /(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])/u],
  ['github token', /gh[pousr]_[A-Za-z0-9_]{36,}/u],
  ['npm token', /npm_[A-Za-z0-9]{36,}/u],
  ['slack token', /xox[baprs]-[A-Za-z0-9-]{20,}/u],
];
const findings = [];

for (const file of walk(repoRoot)) {
  const relativePath = relative(repoRoot, file);
  const content = readFileSync(file, 'utf8');
  for (const [label, pattern] of patterns) {
    const match = content.match(pattern);
    if (match) {
      const line = content.slice(0, match.index).split('\n').length;
      if (allowlist.has(`${relativePath}:${label}`)) continue;
      findings.push(`${relativePath}:${line}: ${label}`);
    }
  }
}

if (findings.length > 0) {
  console.error('[secret-scan] failed');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log('[secret-scan] OK: high-confidence secret patterns not found');

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name) && !entry.name.startsWith('.devai')) {
        files.push(...walk(join(dir, entry.name)));
      }
      continue;
    }
    if (!entry.isFile() || excludedFiles.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (shouldRead(path)) files.push(path);
  }
  return files;
}

function shouldRead(path) {
  const lastDot = path.lastIndexOf('.');
  const extension = lastDot === -1 ? '' : path.slice(lastDot);
  if (!textExtensions.has(extension)) return false;
  return statSync(path).size <= 1024 * 1024;
}
