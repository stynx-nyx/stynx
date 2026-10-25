import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { normalizePublicApiDeclaration } from './public-api-declaration.mjs';

/** @typedef {{name: string, dir: string}} PackageSpec */
/** @typedef {{exports: unknown, declarationHashes: Record<string, string>}} PackageBaseline */
/** @typedef {{schemaVersion: string, packages: Record<string, PackageBaseline>}} Baselines */

/**
 * Public-API baselines: per publishable package, its manifest `exports` and the
 * sha256 of every emitted `.d.ts` under `dist`. Read-only: building is the
 * caller's step (the repository script builds first; `stynx` never does).
 */
/** @param {string} root @param {PackageSpec[]} packageSpecs @returns {Baselines} */
export function currentBaselines(root, packageSpecs) {
  return {
    schemaVersion: '1',
    packages: Object.fromEntries(
      packageSpecs.map((/** @type {PackageSpec} */ spec) => [spec.name, packageBaseline(resolve(root), spec)]),
    ),
  };
}

/** Repository wording, one line per drift; `expected` is the committed baseline document. */
/** @param {unknown} expected @param {Baselines} current @param {PackageSpec[]} packageSpecs */
export function compareBaselines(expected, current, packageSpecs) {
  const failures = [];
  for (const spec of packageSpecs) {
    const expectedPkg = optionalField(field(expected, 'packages'), spec.name);
    const actualPkg = current.packages[spec.name];
    if (!expectedPkg) {
      failures.push(`${spec.name}: missing baseline entry`);
      continue;
    }
    for (const [file, actualHash] of entries(field(actualPkg, 'declarationHashes'))) {
      const expectedHash = optionalField(field(expectedPkg, 'declarationHashes'), file);
      if (!expectedHash) failures.push(`${spec.name}: new public declaration ${file}`);
      else if (expectedHash !== actualHash)
        failures.push(`${spec.name}: public declaration changed ${file}`);
    }
    for (const file of Object.keys(object(field(expectedPkg, 'declarationHashes') ?? {}))) {
      if (!field(field(actualPkg, 'declarationHashes'), file))
        failures.push(`${spec.name}: removed public declaration ${file}`);
    }
    const expectedExports = JSON.stringify(field(expectedPkg, 'exports') ?? {});
    const actualExports = JSON.stringify(field(actualPkg, 'exports') ?? {});
    if (expectedExports !== actualExports) failures.push(`${spec.name}: package exports changed`);
  }
  return failures;
}

/**
 * Consumer discovery: every non-private package with a name directly under one
 * of `packageRoots`, sorted by name.
 */
/** @param {string} root @param {string[]} packageRoots @returns {PackageSpec[]} */
export function discoverPackages(root, packageRoots) {
  const specs = [];
  for (const packageRoot of packageRoots) {
    const absoluteRoot = resolve(root, packageRoot);
    if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) continue;
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dirPath = resolve(absoluteRoot, entry.name);
      const manifestPath = resolve(dirPath, 'package.json');
      if (!existsSync(manifestPath)) continue;
      /** @type {unknown} */
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (field(manifest, 'private') === true) continue;
      const name = field(manifest, 'name');
      if (typeof name !== 'string') continue;
      specs.push({ name, dir: relative(root, dirPath).split(sep).join('/') });
    }
  }
  return specs.sort((left, right) => left.name.localeCompare(right.name));
}

/** @param {string} root @param {PackageSpec} spec @returns {PackageBaseline} */
function packageBaseline(root, spec) {
  /** @type {unknown} */
  const manifest = JSON.parse(readFileSync(resolve(root, spec.dir, 'package.json'), 'utf8'));
  const distDir = resolve(root, spec.dir, 'dist');
  // Unbuilt config packages (tsconfig presets, ESLint profiles) publish their
  // sources as-is; their baseline is the bytes of each published preset.
  if (typeof optionalField(field(manifest, 'scripts'), 'build') !== 'string' && !existsSync(distDir))
    return sourceBaseline(root, spec, manifest);
  const declarationFiles = walk(distDir)
    .filter((file) => file.endsWith('.d.ts'))
    .sort((left, right) => left.localeCompare(right));
  if (declarationFiles.length === 0) {
    const error = Object.assign(new Error(
      `${spec.name}: build emitted no public declaration files under ${spec.dir}/dist`,
    ), { code: 'declarations-missing', locator: `${spec.dir}/package.json:1` });
    throw error;
  }
  const declarationHashes = Object.fromEntries(
    declarationFiles.map((file) => {
      const relativeFile = relative(distDir, file);
      const normalized = normalizePublicApiDeclaration({
        packageName: spec.name,
        declarationPath: relativeFile,
        packageVersion: field(manifest, 'version'),
        source: readFileSync(file, 'utf8'),
      });
      return [relativeFile, createHash('sha256').update(normalized).digest('hex')];
    }),
  );
  return {
    exports: field(manifest, 'exports') ?? {},
    declarationHashes,
  };
}

/** @param {string} root @param {PackageSpec} spec @param {unknown} manifest @returns {PackageBaseline} */
function sourceBaseline(root, spec, manifest) {
  const packageDir = resolve(root, spec.dir);
  const presetFiles = readdirSync(packageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:mjs|json)$/u.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => name !== 'package.json')
    .sort((left, right) => left.localeCompare(right));
  if (presetFiles.length === 0) {
    const error = Object.assign(new Error(`${spec.name}: unbuilt package publishes no preset files`), { code: 'declarations-missing', locator: `${spec.dir}/package.json:1` });
    throw error;
  }
  return {
    exports: field(manifest, 'exports') ?? {},
    declarationHashes: Object.fromEntries(
      presetFiles.map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(join(packageDir, name)))
          .digest('hex'),
      ]),
    ),
  };
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

// Fresh native JSON data only; no full-manifest or full-baseline type claim.
/** @param {unknown} value @returns {object} */
function object(value) {
  if (value == null) throw new TypeError('Cannot convert undefined or null to object');
  /** @type {unknown} */
  const boxed = Object(value);
  if ((typeof boxed !== 'object' || boxed === null) && typeof boxed !== 'function') throw new TypeError('Invalid native Object result');
  return boxed;
}
/** @param {unknown} value @param {string} name @returns {unknown} */
function field(value, name) {
  if (value == null) throw new TypeError(`Cannot read properties of ${value} (reading '${name}')`);
  return Reflect.get(object(value), name, value);
}
/** @param {unknown} value @param {string} name @returns {unknown} */
function optionalField(value, name) { return value == null ? undefined : field(value, name); }
/** @param {unknown} value @returns {[string, unknown][]} */
function entries(value) { return Object.entries(object(value)); }
