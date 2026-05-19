#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const httpDecorators = new Map([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Patch', 'PATCH'],
  ['Delete', 'DELETE'],
]);

const defaultScanRoots = ['packages', 'reference/api/src', 'domain/demo-bookmark/api/src'];
const ignoredDirs = new Set(['.git', '.turbo', 'coverage', 'dist', 'node_modules']);
const ignoredFileParts = new Set(['test', 'tests', '__tests__', 'fixtures', '__fixtures__']);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (isMain()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const routes = collectRoutes({ repoRoot, packageFilter: args.package, controllerFilter: args.controller });
    if (args.output === 'report') {
      process.stdout.write(formatReport(routes));
    } else {
      process.stdout.write(formatCsv(routes));
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

export function collectRoutes(options = {}) {
  const root = resolve(options.repoRoot ?? repoRoot);
  const packageFilter = normalizeFilter(options.packageFilter);
  const controllerFilter = normalizeFilter(options.controllerFilter);
  const routes = [];

  for (const scanRoot of options.scanRoots ?? defaultScanRoots) {
    const absoluteScanRoot = join(root, scanRoot);
    if (!existsSync(absoluteScanRoot)) continue;
    for (const file of walkControllerFiles(absoluteScanRoot, root)) {
      const packageInfo = resolvePackageInfo(file, root);
      if (packageFilter && !matchesPackageFilter(packageInfo, packageFilter)) continue;

      const parsedRoutes = parseControllerFile(file, packageInfo, root);
      for (const route of parsedRoutes) {
        if (controllerFilter && route.controller.toLowerCase() !== controllerFilter) continue;
        routes.push(route);
      }
    }
  }

  return routes.sort(compareRoutes);
}

export function parseControllerFile(file, packageInfo = null, root = repoRoot) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  const controllerDecorators = [];
  const routes = [];
  let pendingDecorators = [];
  let currentClass = null;
  let braceDepth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!currentClass && trimmed.startsWith('@')) {
      const { decorator, endIndex } = readDecorator(lines, index);
      controllerDecorators.push(decorator);
      index = endIndex;
      continue;
    }

    const classMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)\b/);
    if (!currentClass && classMatch) {
      const controllerPath = firstDecoratorArg(controllerDecorators, 'Controller');
      if (controllerPath === null) {
        controllerDecorators.length = 0;
        continue;
      }
      currentClass = {
        name: classMatch[1],
        controllerPath: controllerPath ?? '',
        decorators: [...controllerDecorators],
      };
      controllerDecorators.length = 0;
      braceDepth += countBraces(line);
      continue;
    }

    if (!currentClass) {
      if (trimmed && !trimmed.startsWith('@') && !trimmed.startsWith('import ')) {
        controllerDecorators.length = 0;
      }
      continue;
    }

    if (trimmed.startsWith('@')) {
      const { decorator, endIndex } = readDecorator(lines, index);
      pendingDecorators.push(decorator);
      for (let decoratorIndex = index; decoratorIndex <= endIndex; decoratorIndex += 1) {
        braceDepth += countBraces(lines[decoratorIndex]);
      }
      index = endIndex;
      continue;
    }

    const methodName = methodNameFromLine(trimmed);
    if (methodName && pendingDecorators.length > 0) {
      for (const [decoratorName, method] of httpDecorators.entries()) {
        const routePath = firstDecoratorArg(pendingDecorators, decoratorName);
        if (routePath === null) continue;
        routes.push(buildRoute({
          file,
          method,
          routePath: routePath ?? '',
          methodName,
          controller: currentClass,
          methodDecorators: pendingDecorators,
          packageInfo: packageInfo ?? resolvePackageInfo(file, root),
          root,
        }));
      }
      pendingDecorators = [];
    } else if (trimmed && !trimmed.startsWith('//')) {
      pendingDecorators = [];
    }

    braceDepth += countBraces(line);
    if (braceDepth <= 0) {
      currentClass = null;
      pendingDecorators = [];
      braceDepth = 0;
    }
  }

  return routes;
}

export function formatCsv(routes) {
  const header = ['package', 'controller', 'method', 'path', 'permissions', 'rate-limit-class'];
  const rows = routes.map((route) => [
    route.package,
    route.controller,
    route.method,
    route.path,
    route.permissions,
    route.rateLimitClass,
  ]);
  return `${[header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

export function formatReport(routes) {
  const byPackage = new Map();
  const controllers = new Set();
  let withPermissions = 0;
  let withRateLimit = 0;

  for (const route of routes) {
    byPackage.set(route.package, (byPackage.get(route.package) ?? 0) + 1);
    controllers.add(`${route.package}:${route.controller}`);
    if (route.permissions) withPermissions += 1;
    if (route.rateLimitClass) withRateLimit += 1;
  }

  const lines = [
    'Route inventory summary',
    `total-routes: ${routes.length}`,
    `controllers: ${controllers.size}`,
    `routes-with-permissions: ${withPermissions}`,
    `routes-with-rate-limit: ${withRateLimit}`,
    '',
    'routes-by-package:',
  ];

  for (const [packageName, count] of [...byPackage.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`${packageName}: ${count}`);
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(values) {
  const parsed = { output: 'csv', package: null, controller: null };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--csv') parsed.output = 'csv';
    else if (value === '--report') parsed.output = 'report';
    else if (value === '--package') {
      parsed.package = requireValue(values, index, value);
      index += 1;
    } else if (value.startsWith('--package=')) {
      parsed.package = value.slice('--package='.length);
    } else if (value === '--controller') {
      parsed.controller = requireValue(values, index, value);
      index += 1;
    } else if (value.startsWith('--controller=')) {
      parsed.controller = value.slice('--controller='.length);
    } else if (value === '--help' || value === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }
  return parsed;
}

function printUsage(stream = process.stdout) {
  stream.write(`Usage: node scripts/list-routes.mjs [--csv|--report] [--package <name>] [--controller <ControllerName>]

Walks NestJS controllers under packages/*/src, reference/api/src, and
domain/demo-bookmark/api/src and emits route metadata.

Columns:
  package, controller, method, path, permissions, rate-limit-class
`);
}

function requireValue(values, index, flag) {
  const value = values[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function walkControllerFiles(dir, root) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      results.push(...walkControllerFiles(fullPath, root));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;
    if (!entry.name.includes('.controller.')) continue;
    if (hasIgnoredFilePart(fullPath, root)) continue;
    results.push(fullPath);
  }
  return results;
}

function hasIgnoredFilePart(file, root) {
  return relative(root, file)
    .split(sep)
    .some((part) => ignoredFileParts.has(part) || part.endsWith('.generated.ts'));
}

function resolvePackageInfo(file, root) {
  const relativePath = relative(root, file);
  const parts = relativePath.split(sep);
  if (parts[0] === 'packages' && parts[1]) {
    const packageDir = join(root, 'packages', parts[1]);
    return packageInfoFromDir(packageDir, `@stynx/${parts[1]}`, `packages/${parts[1]}`);
  }
  if (parts[0] === 'reference' && parts[1] === 'api') {
    return packageInfoFromDir(join(root, 'reference', 'api'), '@stynx/reference-api', 'reference/api');
  }
  if (parts[0] === 'domain' && parts[1] === 'demo-bookmark' && parts[2] === 'api') {
    return packageInfoFromDir(
      join(root, 'domain', 'demo-bookmark', 'api'),
      '@stynx-domain/demo-bookmark-api',
      'domain/demo-bookmark/api',
    );
  }
  return { name: parts[0] ?? basename(dirname(file)), shortName: parts[0] ?? basename(dirname(file)), dir: parts[0] ?? '.' };
}

function packageInfoFromDir(packageDir, fallbackName, shortName) {
  const packageJsonPath = join(packageDir, 'package.json');
  if (!existsSync(packageJsonPath)) return { name: fallbackName, shortName, dir: shortName };
  try {
    const payload = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return { name: payload.name ?? fallbackName, shortName, dir: shortName };
  } catch {
    return { name: fallbackName, shortName, dir: shortName };
  }
}

function readDecorator(lines, startIndex) {
  let text = lines[startIndex].trim();
  let depth = parenthesisDelta(text);
  let endIndex = startIndex;
  while (depth > 0 && endIndex + 1 < lines.length) {
    endIndex += 1;
    text += ` ${lines[endIndex].trim()}`;
    depth += parenthesisDelta(lines[endIndex]);
  }
  return { decorator: text, endIndex };
}

function methodNameFromLine(trimmed) {
  if (!trimmed || trimmed.startsWith('@') || trimmed.startsWith('//')) return null;
  const match = trimmed.match(/^(?:public\s+|protected\s+|private\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/);
  return match?.[1] ?? null;
}

function firstDecoratorArg(decorators, name) {
  const decorator = decorators.find((candidate) => decoratorName(candidate) === name);
  if (!decorator) return null;
  const args = decoratorArgs(decorator);
  if (args.trim() === '') return undefined;
  return firstStringLiteral(args) ?? undefined;
}

function decoratorName(decorator) {
  return decorator.match(/^@([A-Za-z_$][\w$]*)/)?.[1] ?? '';
}

function decoratorArgs(decorator) {
  const start = decorator.indexOf('(');
  const end = decorator.lastIndexOf(')');
  if (start === -1 || end === -1 || end <= start) return '';
  return decorator.slice(start + 1, end);
}

function firstStringLiteral(text) {
  const match = text.match(/(['"`])((?:\\.|(?!\1).)*)\1/s);
  return match ? unescapeLiteral(match[2]) : null;
}

function unescapeLiteral(value) {
  return value.replace(/\\(['"`\\])/g, '$1');
}

function buildRoute({ file, method, routePath, methodName, controller, methodDecorators, packageInfo, root }) {
  const decorators = [...controller.decorators, ...methodDecorators];
  return {
    package: packageInfo.name,
    controller: controller.name,
    method,
    path: joinRoutePath(controller.controllerPath, routePath),
    permissions: collectPermissions(decorators),
    rateLimitClass: collectRateLimit(methodDecorators) || collectRateLimit(controller.decorators),
    file: relative(root, file),
    handler: methodName,
  };
}

function collectPermissions(decorators) {
  const permissions = decorators
    .filter((decorator) => decoratorName(decorator) === 'Permission')
    .map((decorator) => firstStringLiteral(decoratorArgs(decorator)))
    .filter(Boolean);
  for (const marker of ['Public', 'System', 'ReadOnly']) {
    if (decorators.some((decorator) => decoratorName(decorator) === marker)) {
      permissions.push(marker.toLowerCase());
    }
  }
  return [...new Set(permissions)].join(';');
}

function collectRateLimit(decorators) {
  const decorator = decorators.find((candidate) => decoratorName(candidate) === 'RateLimit');
  if (!decorator) return '';
  const args = decoratorArgs(decorator).trim().replace(/\s+/g, ' ');
  if (!args) return 'rate-limit';
  const scope = objectProperty(args, 'scope');
  const bucket = objectProperty(args, 'bucket');
  if (scope && bucket) return `${bucket}:${scope}`;
  if (scope) return scope;
  if (bucket) return bucket;
  return args;
}

function objectProperty(text, key) {
  const match = text.match(new RegExp(`\\b${key}\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`, 's'));
  return match ? unescapeLiteral(match[2]) : null;
}

function joinRoutePath(basePath, routePath) {
  const parts = [basePath, routePath]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ''));
  return `/${parts.join('/')}`.replace(/\/+/g, '/');
}

function countBraces(line) {
  const withoutStrings = line
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '')
    .replace(/\/\/.*$/, '');
  return (withoutStrings.match(/{/g)?.length ?? 0) - (withoutStrings.match(/}/g)?.length ?? 0);
}

function parenthesisDelta(line) {
  const withoutStrings = line.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
  return (withoutStrings.match(/\(/g)?.length ?? 0) - (withoutStrings.match(/\)/g)?.length ?? 0);
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function normalizeFilter(value) {
  return value ? value.toLowerCase() : null;
}

function matchesPackageFilter(packageInfo, filter) {
  return packageInfo.name.toLowerCase() === filter
    || packageInfo.shortName.toLowerCase() === filter
    || packageInfo.dir.toLowerCase() === filter
    || packageInfo.name.toLowerCase().endsWith(`/${filter}`)
    || packageInfo.name.toLowerCase().endsWith(`-${filter}`);
}

function compareRoutes(left, right) {
  return left.package.localeCompare(right.package)
    || left.controller.localeCompare(right.controller)
    || left.path.localeCompare(right.path)
    || left.method.localeCompare(right.method);
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
