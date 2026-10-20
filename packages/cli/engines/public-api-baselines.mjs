import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { normalizePublicApiDeclaration } from './public-api-declaration.mjs';

/**
 * Public-API baselines: per publishable package, its manifest `exports` and the
 * sha256 of every emitted `.d.ts` under `dist`. Read-only: building is the
 * caller's step (the repository script builds first; `stynx` never does).
 */
export function currentBaselines(root, packageSpecs) {
  return {
    schemaVersion: '1',
    packages: Object.fromEntries(
      packageSpecs.map((spec) => [spec.name, packageBaseline(resolve(root), spec)]),
    ),
  };
}

/** Repository wording, one line per drift; `expected` is the committed baseline document. */
export function compareBaselines(expected, current, packageSpecs) {
  const failures = [];
  for (const spec of packageSpecs) {
    const expectedPkg = expected.packages?.[spec.name];
    const actualPkg = current.packages[spec.name];
    if (!expectedPkg) {
      failures.push(`${spec.name}: missing baseline entry`);
      continue;
    }
    for (const [file, actualHash] of Object.entries(actualPkg.declarationHashes)) {
      const expectedHash = expectedPkg.declarationHashes?.[file];
      if (!expectedHash) failures.push(`${spec.name}: new public declaration ${file}`);
      else if (expectedHash !== actualHash)
        failures.push(`${spec.name}: public declaration changed ${file}`);
    }
    for (const file of Object.keys(expectedPkg.declarationHashes ?? {})) {
      if (!actualPkg.declarationHashes[file])
        failures.push(`${spec.name}: removed public declaration ${file}`);
    }
    const expectedExports = JSON.stringify(expectedPkg.exports ?? {});
    const actualExports = JSON.stringify(actualPkg.exports ?? {});
    if (expectedExports !== actualExports) failures.push(`${spec.name}: package exports changed`);
  }
  return failures;
}

/**
 * Consumer discovery: every non-private package with a name directly under one
 * of `packageRoots`, sorted by name.
 */
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
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest.private === true || typeof manifest.name !== 'string') continue;
      specs.push({ name: manifest.name, dir: relative(root, dirPath).split(sep).join('/') });
    }
  }
  return specs.sort((left, right) => left.name.localeCompare(right.name));
}

function packageBaseline(root, spec) {
  const manifest = JSON.parse(readFileSync(resolve(root, spec.dir, 'package.json'), 'utf8'));
  const distDir = resolve(root, spec.dir, 'dist');
  const declarationFiles = walk(distDir)
    .filter((file) => file.endsWith('.d.ts'))
    .sort((left, right) => left.localeCompare(right));
  if (declarationFiles.length === 0) {
    const error = new Error(
      `${spec.name}: build emitted no public declaration files under ${spec.dir}/dist`,
    );
    error.code = 'declarations-missing';
    error.locator = `${spec.dir}/package.json:1`;
    throw error;
  }
  const declarationHashes = Object.fromEntries(
    declarationFiles.map((file) => {
      const relativeFile = relative(distDir, file);
      const normalized = normalizePublicApiDeclaration({
        packageName: spec.name,
        declarationPath: relativeFile,
        packageVersion: manifest.version,
        source: readFileSync(file, 'utf8'),
      });
      return [relativeFile, createHash('sha256').update(normalized).digest('hex')];
    }),
  );
  return {
    exports: manifest.exports ?? {},
    declarationHashes,
  };
}

function walk(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
