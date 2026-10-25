import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { parseNestControllerDeclarations } from './nest-route-declarations.mjs';

/** @typedef {{ name: string, shortName: string, dir: string }} PackageInfo */
/** @typedef {ReturnType<typeof parseControllerFile>[number]} Route */
/** @typedef {ReturnType<typeof parseNestControllerDeclarations>[number]['decorators'][number]} DeclaredDecorator */

const ignoredDirs = new Set(['.git', '.turbo', 'coverage', 'dist', 'node_modules']);
const ignoredFileParts = new Set(['test', 'tests', '__tests__', 'fixtures', '__fixtures__']);

/**
 * Declared Nest routes under `scanRoots`; the first unreadable declaration throws.
 * @param {{ repoRoot: string, scanRoots: readonly string[], packageFilter?: string | null,
 * controllerFilter?: string | null }} options
 */
export function collectRoutes(options) {
  const root = resolve(options.repoRoot);
  const packageFilter = normalizeFilter(options.packageFilter);
  const controllerFilter = normalizeFilter(options.controllerFilter);
  const routes = [];

  for (const scanRoot of options.scanRoots) {
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

/**
 * Census form for `stynx list-routes`: every controller file under the roots is
 * scanned; a declaration that is not statically readable is a finding with its
 * locator instead of aborting the walk.
 * @param {{ repoRoot: string, scanRoots: readonly string[] }} options
 */
export function inventoryRoutes({ repoRoot, scanRoots }) {
  const root = resolve(repoRoot);
  /** @type {string[]} */
  const scanned = [];
  const routes = [];
  const findings = [];
  for (const scanRoot of scanRoots) {
    const absoluteScanRoot = join(root, scanRoot);
    if (!existsSync(absoluteScanRoot)) continue;
    for (const file of walkControllerFiles(absoluteScanRoot, root)) {
      const relativeFile = portable(relative(root, file));
      if (scanned.includes(relativeFile)) continue;
      scanned.push(relativeFile);
      try {
        routes.push(...parseControllerFile(file, resolvePackageInfo(file, root), root));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const located = message.match(/^(.*?):(\d+):(\d+): (.*)$/su);
        const locatedFile = located?.[1];
        findings.push(
          located && locatedFile !== undefined
            ? {
                locator: `${portable(relative(root, locatedFile))}:${located[2]}`,
                message: `${located[4]} (not statically readable)`,
              }
            : { locator: `${relativeFile}:1`, message },
        );
      }
    }
  }
  return {
    scanned: scanned.sort((left, right) => left.localeCompare(right)),
    routes: routes.sort(compareRoutes),
    findings,
  };
}

/** @param {string} file
 * @param {PackageInfo | null | undefined} packageInfo
 * @param {string} root
 */
export function parseControllerFile(file, packageInfo, root) {
  const source = readFileSync(file, 'utf8');
  const routes = [];
  for (const declaration of parseNestControllerDeclarations(source, { file })) {
    /** @param {DeclaredDecorator} decorator */
    const asText = (decorator) =>
      `@${decorator.name ?? decorator.localName}(${decorator.arguments.join(', ')})`;
    for (const controllerPath of declaration.paths) {
      const controller = {
        name: declaration.name,
        controllerPath,
        decorators: declaration.decorators.map(asText),
      };
      for (const member of declaration.methods) {
        for (const registration of member.registrations) {
          const route = buildRoute({
            file,
            method: registration.method,
            routePath: registration.path,
            methodName: member.name,
            controller,
            methodDecorators: member.decorators.map(asText),
            packageInfo: packageInfo ?? resolvePackageInfo(file, root),
            root,
          });
          routes.push({
            ...route,
            declarationId: `${route.file}:${declaration.name}.${member.name}:${registration.method}:${route.path}`,
            controllerOptions: declaration.options,
            inheritance: declaration.extends,
            classDecorators: declaration.decorators,
            methodDecorators: member.decorators,
            position: member.position,
          });
        }
      }
    }
  }
  return routes;
}

/** @param {readonly Route[]} routes */
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

/** @param {readonly Route[]} routes */
export function formatReport(routes) {
  /** @type {Map<string, number>} */
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

  for (const [packageName, count] of [...byPackage.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    lines.push(`${packageName}: ${count}`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * @param {string} dir
 * @param {string} root
 * @returns {string[]}
 */
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

/**
 * @param {string} file
 * @param {string} root
 */
function hasIgnoredFilePart(file, root) {
  return relative(root, file)
    .split(sep)
    .some((part) => ignoredFileParts.has(part) || part.endsWith('.generated.ts'));
}

/**
 * @param {string} file
 * @param {string} root
 */
function resolvePackageInfo(file, root) {
  // The nearest package.json at or below the root names the route's package.
  const parts = relative(root, file).split(sep);
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const rel = relative(root, dir);
    if (rel.startsWith('..')) break;
    const manifest = join(dir, 'package.json');
    if (rel && existsSync(manifest)) {
      const shortName = portable(rel);
      return { name: packageName(manifest) ?? shortName, shortName, dir: shortName };
    }
    if (!rel) break;
  }
  return {
    name: parts[0] ?? basename(dirname(file)),
    shortName: parts[0] ?? basename(dirname(file)),
    dir: parts[0] ?? '.',
  };
}

/**
 * @param {string} manifestPath
 */
function packageName(manifestPath) {
  try {
    /** @type {unknown} */
    const payload = JSON.parse(readFileSync(manifestPath, 'utf8'));
    // Native JSON.parse without a reviver creates data properties, not accessors.
    if (typeof payload !== 'object' || payload === null) return null;
    /** @type {unknown} */
    const name = Reflect.get(payload, 'name');
    return typeof name === 'string' ? name : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} path
 */
function portable(path) {
  return path.split(sep).join('/');
}

/**
 * @param {string} decorator
 */
function decoratorName(decorator) {
  return decorator.match(/^@([A-Za-z_$][\w$]*)/)?.[1] ?? '';
}

/**
 * @param {string} decorator
 */
function decoratorArgs(decorator) {
  const start = decorator.indexOf('(');
  const end = decorator.lastIndexOf(')');
  if (start === -1 || end === -1 || end <= start) return '';
  return decorator.slice(start + 1, end);
}

/**
 * @param {string} text
 */
function firstStringLiteral(text) {
  const match = text.match(/(['"`])((?:\\.|(?!\1).)*)\1/s);
  const literal = match?.[2];
  return literal === undefined ? null : unescapeLiteral(literal);
}

/**
 * @param {string} value
 */
function unescapeLiteral(value) {
  return value.replace(/\\(['"`\\])/g, '$1');
}

/**
 * @param {{ file: string, method: string, routePath: string, methodName: string,
 * controller: { name: string, controllerPath: string, decorators: string[] },
 * methodDecorators: string[], packageInfo: PackageInfo, root: string }} options
 */
function buildRoute({
  file,
  method,
  routePath,
  methodName,
  controller,
  methodDecorators,
  packageInfo,
  root,
}) {
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

/**
 * @param {readonly string[]} decorators
 */
function collectPermissions(decorators) {
  const permissions = decorators
    .filter((decorator) => decoratorName(decorator) === 'Permission')
    .map((decorator) => firstStringLiteral(decoratorArgs(decorator)))
    .filter(Boolean);
  for (const marker of ['Public', 'System', 'ReadOnly', 'PublicTenantRoute']) {
    if (decorators.some((decorator) => decoratorName(decorator) === marker)) {
      permissions.push(marker === 'PublicTenantRoute' ? 'public-tenant' : marker.toLowerCase());
    }
  }
  return [...new Set(permissions)].join(';');
}

/**
 * @param {readonly string[]} decorators
 */
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

/**
 * @param {string} text
 * @param {string} key
 */
function objectProperty(text, key) {
  const match = text.match(new RegExp(`\\b${key}\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`, 's'));
  const literal = match?.[2];
  return literal === undefined ? null : unescapeLiteral(literal);
}

/**
 * @param {unknown} basePath
 * @param {unknown} routePath
 */
function joinRoutePath(basePath, routePath) {
  const parts = [basePath, routePath]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ''));
  return `/${parts.join('/')}`.replace(/\/+/g, '/');
}

/**
 * @param {unknown} value
 */
function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * @param {string | null | undefined} value
 */
function normalizeFilter(value) {
  return value ? value.toLowerCase() : null;
}

/**
 * @param {PackageInfo} packageInfo
 * @param {string} filter
 */
function matchesPackageFilter(packageInfo, filter) {
  return (
    packageInfo.name.toLowerCase() === filter ||
    packageInfo.shortName.toLowerCase() === filter ||
    packageInfo.dir.toLowerCase() === filter ||
    packageInfo.name.toLowerCase().endsWith(`/${filter}`) ||
    packageInfo.name.toLowerCase().endsWith(`-${filter}`)
  );
}

/**
 * @param {Route} left
 * @param {Route} right
 */
function compareRoutes(left, right) {
  return (
    left.package.localeCompare(right.package) ||
    left.controller.localeCompare(right.controller) ||
    left.path.localeCompare(right.path) ||
    left.method.localeCompare(right.method)
  );
}
