#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

type BoundaryConfig = {
  roots?: string[];
  allowedPackages?: string[];
  forbiddenImports?: string[];
  requireStynxPackages?: string[];
};

const repoRoot = process.cwd();
const config = readBoundaryConfig();
const roots = config.roots ?? ['reference', 'domain', 'packages', 'packages-web'];
const allowed = config.allowedPackages ?? ['@stynx/', '@stynx-web/'];
const forbidden = config.forbiddenImports ?? [];
const required = config.requireStynxPackages ?? [];
const files = roots
  .flatMap((root) => walk(join(repoRoot, root)))
  .filter((file) => /\.[cm]?tsx?$/u.test(file));
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const deps = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
const imported = new Set<string>();
const violations: string[] = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const specifier of importSpecifiers(text)) {
    if (specifier.startsWith('@stynx/')) imported.add(specifier.split('/').slice(0, 2).join('/'));
    if (specifier.startsWith('@stynx-web/'))
      imported.add(specifier.split('/').slice(0, 2).join('/'));
    if (forbidden.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`))) {
      violations.push(`${relative(repoRoot, file)} imports forbidden ${specifier}`);
    }
    if (specifier.startsWith('@stynx') && !allowed.some((prefix) => specifier.startsWith(prefix))) {
      violations.push(`${relative(repoRoot, file)} imports undeclared STYNX seam ${specifier}`);
    }
  }
}

for (const pkg of required) {
  if (!deps[pkg] && !imported.has(pkg))
    violations.push(`required STYNX package seam is absent: ${pkg}`);
}
if (violations.length > 0) throw new Error(`STYNX boundary violations:\n${violations.join('\n')}`);
console.log(
  `STYNX boundary verification passed: ${files.length} files, ${imported.size} STYNX seams.`,
);

function readBoundaryConfig(): BoundaryConfig {
  const stynxrc = join(repoRoot, '.stynxrc.json');
  if (existsSync(stynxrc)) return JSON.parse(readFileSync(stynxrc, 'utf8')).boundary ?? {};
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  return pkg.stynx?.boundary ?? {};
}

function walk(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', 'dist', 'coverage'].includes(entry.name))
      return walk(path);
    return entry.isFile() ? [path] : [];
  });
}

function importSpecifiers(text: string): string[] {
  const matches = text.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/gu);
  return [...matches].map((match) => match[1]).filter(Boolean);
}
