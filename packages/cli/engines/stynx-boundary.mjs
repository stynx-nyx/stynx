import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Boundary configuration: `.stynxrc.json` `boundary`, else (only when
 * `allowPackageJson`) `package.json` `stynx.boundary`. `null` when neither
 * source exists; `stynx verify-stynx-boundary` treats that as a failure.
 */
export function readBoundaryConfig(root, { allowPackageJson = false } = {}) {
  const stynxrc = join(root, '.stynxrc.json');
  if (existsSync(stynxrc))
    return {
      source: '.stynxrc.json',
      config: JSON.parse(readFileSync(stynxrc, 'utf8')).boundary ?? {},
    };
  if (!allowPackageJson) return null;
  const pkg = readPackageJson(root);
  return { source: 'package.json', config: pkg?.stynx?.boundary ?? {} };
}

/** Scans `*.ts`/`*.mts`/`*.cts`/`*.tsx` under the roots; every file read is in `scanned`. */
export function verifyStynxBoundary(root, config) {
  const repoRoot = resolve(root);
  const roots = config.roots ?? ['reference', 'domain', 'packages', 'packages-web'];
  const allowed = config.allowedPackages ?? ['@stynx-nyx/'];
  const forbidden = config.forbiddenImports ?? [];
  const required = config.requireStynxPackages ?? [];
  const files = roots
    .flatMap((scanRoot) => walk(join(repoRoot, scanRoot)))
    .filter((file) => /\.[cm]?tsx?$/u.test(file));
  const packageJson = readPackageJson(repoRoot) ?? {};
  const deps = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
  const imported = new Set();
  const violations = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const name = relative(repoRoot, file);
    for (const { specifier, line } of importSpecifiers(text)) {
      if (specifier.startsWith('@stynx-nyx/'))
        imported.add(specifier.split('/').slice(0, 2).join('/'));
      if (forbidden.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`))) {
        violations.push({
          kind: 'forbidden',
          file: name,
          line,
          specifier,
          message: `${name} imports forbidden ${specifier}`,
        });
      }
      if (
        specifier.startsWith('@stynx') &&
        !allowed.some((entry) =>
          entry.endsWith('/') ? specifier.startsWith(entry) : specifier === entry,
        )
      ) {
        violations.push({
          kind: 'undeclared-seam',
          file: name,
          line,
          specifier,
          message: `${name} imports undeclared STYNX seam ${specifier}`,
        });
      }
    }
  }

  for (const pkg of required) {
    if (!deps[pkg] && !imported.has(pkg))
      violations.push({
        kind: 'required-seam-absent',
        file: 'package.json',
        line: 1,
        specifier: pkg,
        message: `required STYNX package seam is absent: ${pkg}`,
      });
  }
  return {
    roots,
    scanned: files.map((file) => relative(repoRoot, file).split(sep).join('/')),
    seams: [...imported].sort((left, right) => left.localeCompare(right)),
    violations,
  };
}

function readPackageJson(root) {
  const path = join(root, 'package.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
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

function importSpecifiers(text) {
  const matches = text.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/gu);
  return [...matches]
    .filter((match) => Boolean(match[1]))
    .map((match) => ({
      specifier: match[1],
      line: text.slice(0, match.index).split('\n').length,
    }));
}
