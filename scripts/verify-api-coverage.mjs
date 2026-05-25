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
const openapiRoutes = readOpenApiPaths(openapiPath);
const implementedRoutes = discoverNestRoutes(
  sourceRoots.map((root) => resolve(repoRoot, root)),
  routePrefix,
);
const openapiByCanonical = groupByCanonical(openapiRoutes);
const implementedByCanonical = groupByCanonical(implementedRoutes);
const missingInCode = [...openapiByCanonical.entries()]
  .filter(([canonical]) => !implementedByCanonical.has(canonical))
  .flatMap(([canonical, routes]) => routes.map((route) => diagnostic(route, canonical)))
  .sort((a, b) => a.path.localeCompare(b.path));
const missingInOpenApi = [...implementedByCanonical.entries()]
  .filter(([canonical]) => !openapiByCanonical.has(canonical))
  .flatMap(([canonical, routes]) => routes.map((route) => diagnostic(route, canonical)))
  .sort((a, b) => a.path.localeCompare(b.path));
const parameterNameMismatches = compareParameterNames(openapiByCanonical, implementedByCanonical);

const summary = {
  schemaVersion: '1',
  openapiPath: existsSync(openapiPath) ? relative(repoRoot, openapiPath) : null,
  openapiPaths: openapiRoutes.length,
  implementedRoutes: implementedRoutes.length,
  parameterNameMismatches,
  missingInCode,
  missingInOpenApi,
};

if (args.has('--json')) console.log(JSON.stringify(summary, null, 2));
else
  console.log(
    `API coverage: ${summary.openapiPaths} OpenAPI paths, ${summary.implementedRoutes} implemented routes.`,
  );
if (
  strict &&
  (missingInCode.length > 0 || missingInOpenApi.length > 0 || parameterNameMismatches.length > 0)
) {
  throw new Error(`API coverage drift detected:\n${JSON.stringify(summary, null, 2)}`);
}

function readConfig() {
  const rc = join(repoRoot, '.stynxrc.json');
  if (existsSync(rc)) return JSON.parse(readFileSync(rc, 'utf8'));
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).stynx ?? {};
}

function readOpenApiPaths(file) {
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return Object.keys(parsed.paths ?? {}).map(normalizePath);
}

function discoverNestRoutes(roots, prefix) {
  const routes = [];
  for (const file of roots.flatMap(walk).filter((path) => path.endsWith('.controller.ts'))) {
    const text = readFileSync(file, 'utf8');
    const controller = text.match(/@Controller\(([^)]*)\)/u)?.[1] ?? "''";
    const base = literal(controller);
    for (const match of text.matchAll(/@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/gu)) {
      routes.push(normalizePath(`${prefix}/${base}/${literal(match[2])}`));
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

function canonicalizePath(path) {
  return normalizePath(path)
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) return '{}';
      if (/^\{[^/{}]+\}$/u.test(segment)) return '{}';
      return segment;
    })
    .join('/');
}

function parameterNames(path) {
  return normalizePath(path)
    .split('/')
    .filter(Boolean)
    .map((segment, index) => {
      if (segment.startsWith(':')) return { index, name: segment.slice(1), syntax: ':' };
      const match = segment.match(/^\{([^/{}]+)\}$/u);
      return match ? { index, name: match[1], syntax: '{}' } : null;
    })
    .filter(Boolean);
}

function groupByCanonical(paths) {
  const grouped = new Map();
  for (const path of paths) {
    const canonical = canonicalizePath(path);
    const routes = grouped.get(canonical) ?? [];
    routes.push(path);
    grouped.set(canonical, routes);
  }
  return grouped;
}

function diagnostic(path, canonical) {
  return { path, normalized: canonical };
}

function compareParameterNames(expected, actual) {
  const mismatches = [];
  for (const [canonical, expectedPaths] of expected.entries()) {
    const actualPaths = actual.get(canonical);
    if (!actualPaths) continue;
    const expectedNames = parameterNames(expectedPaths[0] ?? '');
    const actualNames = parameterNames(actualPaths[0] ?? '');
    for (const [index, expectedParam] of expectedNames.entries()) {
      const actualParam = actualNames[index];
      if (actualParam && actualParam.name !== expectedParam.name) {
        mismatches.push({
          normalized: canonical,
          openapiPath: expectedPaths[0],
          routePath: actualPaths[0],
          segment: expectedParam.index,
          openapiParam: expectedParam.name,
          routeParam: actualParam.name,
        });
      }
    }
  }
  return mismatches;
}
