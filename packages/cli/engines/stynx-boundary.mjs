import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Boundary configuration: `.stynxrc.json` `boundary`, else (only when
 * `allowPackageJson`) `package.json` `stynx.boundary`. `null` when neither
 * source exists; `stynx verify-stynx-boundary` treats that as a failure.
 * @param {string} root
 * @param {{allowPackageJson?: boolean}} [options]
 */
export function readBoundaryConfig(root, { allowPackageJson = false } = {}) {
  const stynxrc = join(root, '.stynxrc.json');
  if (existsSync(stynxrc))
    return {
      source: '.stynxrc.json',
      config: field(parseJson(readFileSync(stynxrc, 'utf8')), 'boundary') ?? {},
    };
  if (!allowPackageJson) return null;
  const pkg = readPackageJson(root);
  return {
    source: 'package.json',
    config: optionalField(optionalField(pkg, 'stynx'), 'boundary') ?? {},
  };
}

/**
 * Scans `*.ts`/`*.mts`/`*.cts`/`*.tsx` under the roots; every file read is in `scanned`.
 * @param {string} root
 * @param {unknown} config
 */
export function verifyStynxBoundary(root, config) {
  const repoRoot = resolve(root);
  const roots = field(config, 'roots') ?? ['reference', 'domain', 'packages', 'packages-web'];
  const allowed = field(config, 'allowedPackages') ?? ['@stynx-nyx/'];
  const forbidden = field(config, 'forbiddenImports') ?? [];
  const required = field(config, 'requireStynxPackages') ?? [];
  const files = arrayInput(roots)
    .flatMap((scanRoot) => walk(joinScanRoot(repoRoot, scanRoot)))
    .filter((file) => /\.[cm]?tsx?$/u.test(file));
  const packageJson = readPackageJson(repoRoot) ?? {};
  const deps = {
    ...spreadFields(field(packageJson, 'dependencies') ?? {}),
    ...spreadFields(field(packageJson, 'devDependencies') ?? {}),
  };
  /** @type {Set<string>} */
  const imported = new Set();
  /** @type {Array<{kind: string, file: string, line: number, specifier: unknown, message: string}>} */
  const violations = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const name = relative(repoRoot, file);
    for (const { specifier, line } of importSpecifiers(text)) {
      if (specifier.startsWith('@stynx-nyx/'))
        imported.add(specifier.split('/').slice(0, 2).join('/'));
      if (
        arrayInput(forbidden).some(
          (prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`),
        )
      ) {
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
        !arrayInput(allowed).some((entry) =>
          textInput(entry).endsWith('/')
            ? specifier.startsWith(textInput(entry))
            : specifier === entry,
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

  for (const pkg of iterableInput(required)) {
    if (!deps[propertyKey(pkg)] && !hasImported(imported, pkg))
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

/** @param {string} root */
function readPackageJson(root) {
  const path = join(root, 'package.json');
  return existsSync(path) ? parseJson(readFileSync(path, 'utf8')) : null;
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', 'dist', 'coverage'].includes(entry.name))
      return walk(path);
    return entry.isFile() ? [path] : [];
  });
}

/** @param {string} text */
function importSpecifiers(text) {
  const matches = text.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/gu);
  return [...matches]
    .filter((match) => Boolean(match[1]))
    .map((match) => ({
      specifier: requiredCapture(match),
      line: text.slice(0, match.index).split('\n').length,
    }));
}

/** @param {string} text @returns {unknown} */
function parseJson(text) {
  return JSON.parse(text);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function objectValue(value) {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/** @param {unknown} value @param {string} key @returns {unknown} */
function field(value, key) {
  if (value === null || value === undefined)
    throw new TypeError('Cannot read boundary field from nullish value');
  /** @type {unknown} */
  const target = Object(value);
  if (!objectValue(target)) throw new TypeError('Native object boxing returned a primitive');
  return Reflect.get(target, key, value);
}

/** @param {unknown} value @param {string} key @returns {unknown} */
function optionalField(value, key) {
  return value === null || value === undefined ? undefined : field(value, key);
}

/** @param {unknown} value @returns {Record<PropertyKey, unknown>} */
function spreadFields(value) {
  /** @type {unknown} */
  const target = Object(value);
  if (!objectValue(target)) throw new TypeError('Native object boxing returned a primitive');
  return target;
}

/** @param {unknown} value @returns {unknown[]} */
function arrayInput(value) {
  if (!Array.isArray(value)) throw new TypeError('Boundary array method requires an array');
  return value;
}

/** @param {unknown} value @returns {string | unknown[]} */
function iterableInput(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    /** @type {unknown[]} */
    const values = value;
    return values;
  }
  throw new TypeError('Boundary required packages must be iterable');
}

/** @param {unknown} value */
function textInput(value) {
  if (typeof value !== 'string') throw new TypeError('Boundary text method requires a string');
  return value;
}

/** @param {unknown} value */
function propertyKey(value) {
  return typeof value === 'symbol' ? value : `${value}`;
}

/** @param {string} root @param {unknown} scanRoot */
function joinScanRoot(root, scanRoot) {
  /** @type {unknown} */
  const result = Reflect.apply(join, undefined, [root, scanRoot]);
  if (typeof result !== 'string') throw new TypeError('Native path join returned a non-string');
  return result;
}

/** @param {RegExpMatchArray} match */
function requiredCapture(match) {
  const value = match[1];
  if (value === undefined) throw new TypeError('Native import expression capture is missing');
  return value;
}

/** @param {ReadonlySet<unknown>} values @param {unknown} value */
function hasImported(values, value) {
  return values.has(value);
}
