#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const config = readConfig().apiCoverage ?? {};
const openapiPath = resolve(repoRoot, config.openapiPath ?? 'docs/contracts/openapi.json');
const sourceRoots = config.sourceRoots ?? ['reference/api/src', 'packages'];
const routePrefix = config.routePrefix ?? '';
const openapiPaths = readOpenApiPaths(openapiPath);
const routePaths = discoverNestRoutes(
  sourceRoots.map((root) => resolve(repoRoot, root)),
  routePrefix,
);
const missingInCode = [...openapiPaths].filter((path) => !routePaths.has(path)).sort();
const missingInOpenApi = [...routePaths].filter((path) => !openapiPaths.has(path)).sort();

const summary = {
  schemaVersion: '1',
  openapiPath: existsSync(openapiPath) ? relative(repoRoot, openapiPath) : null,
  openapiPaths: openapiPaths.size,
  implementedRoutes: routePaths.size,
  missingInCode,
  missingInOpenApi,
};

if (args.has('--json')) console.log(JSON.stringify(summary, null, 2));
else
  console.log(
    `API coverage: ${openapiPaths.size} OpenAPI paths, ${routePaths.size} implemented routes.`,
  );
if (strict && (missingInCode.length > 0 || missingInOpenApi.length > 0)) {
  throw new Error(`API coverage drift detected:\n${JSON.stringify(summary, null, 2)}`);
}

function readConfig() {
  const rc = join(repoRoot, '.stynxrc.json');
  if (existsSync(rc)) return JSON.parse(readFileSync(rc, 'utf8'));
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).stynx ?? {};
}

function readOpenApiPaths(file) {
  if (!existsSync(file)) return new Set();
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return new Set(Object.keys(parsed.paths ?? {}).map(normalizePath));
}

function discoverNestRoutes(roots, prefix) {
  const routes = new Set();
  for (const file of roots.flatMap(walk).filter((path) => path.endsWith('.controller.ts'))) {
    const text = readFileSync(file, 'utf8');
    const controller = text.match(/@Controller\(([^)]*)\)/u)?.[1] ?? "''";
    const base = literal(controller);
    for (const match of text.matchAll(/@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/gu)) {
      routes.add(normalizePath(`${prefix}/${base}/${literal(match[2])}`));
    }
  }
  return routes;
}

function walk(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', 'dist', 'coverage'].includes(entry.name))
      return walk(path);
    return entry.isFile() ? [path] : [];
  });
}

function literal(value = '') {
  return value
    .trim()
    .replace(/^['"`]|['"`]$/gu, '')
    .replace(/^\//u, '')
    .replace(/\/$/u, '');
}

function normalizePath(path) {
  return `/${path}`.replace(/\/+/gu, '/').replace(/\/$/u, '') || '/';
}
