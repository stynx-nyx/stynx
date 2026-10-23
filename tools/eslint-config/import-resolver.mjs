// Import resolver (eslint-module-utils interface v2) for the strict profiles.
//
// eslint-plugin-boundaries classifies a dependency only after the import
// resolves to a file. Under NodeNext, TypeScript sources import siblings by
// their emitted `.js` name, which the default `node` resolver cannot map back
// to the `.ts` source, so element-to-element edges were never checked. This
// resolver handles relative specifiers; bare specifiers fall through to the
// `node` resolver listed after it.
//
// The STYNX workspace profile also passes `workspacePackages` (package name ->
// package directory). Workspace packages import each other only by package
// name, which `node` resolves to `dist` outside every boundary element, so
// those specifiers resolve to the package's own source entry instead (SM-12).
// Published profiles pass no map and keep the behaviour above.
import { existsSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve as resolvePath } from 'node:path';

export const interfaceVersion = 2;

const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const emittedToSource = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

const isRelative = (source) =>
  source === '.' || source === '..' || source.startsWith('./') || source.startsWith('../');

const isFile = (path) => existsSync(path) && statSync(path).isFile();

const sourceEntries = ['src/index.ts', 'src/public-api.ts', 'src/main.ts'];

function resolveWorkspacePackage(source, workspacePackages) {
  const name = Object.keys(workspacePackages).find(
    (candidate) => source === candidate || source.startsWith(`${candidate}/`),
  );
  if (name === undefined) {
    return { found: false };
  }
  const packageDir = workspacePackages[name];
  const subpath = source.slice(name.length + 1);
  const subpathCandidates =
    subpath.length > 0
      ? [join(packageDir, subpath), join(packageDir, 'src', subpath)].flatMap(fileCandidates)
      : [];
  // A subpath published from build output has no source twin; the package's
  // entry still places the import in the right element.
  const path = [
    ...subpathCandidates,
    ...sourceEntries.map((entry) => join(packageDir, entry)),
  ].find(isFile);
  return path === undefined ? { found: false } : { found: true, path };
}

function fileCandidates(target) {
  const extension = extname(target);
  return [
    target,
    ...(emittedToSource[extension] ?? []).map(
      (sourceExtension) => `${target.slice(0, -extension.length)}${sourceExtension}`,
    ),
    ...sourceExtensions.map((sourceExtension) => `${target}${sourceExtension}`),
    ...sourceExtensions.map((sourceExtension) => join(target, `index${sourceExtension}`)),
  ];
}

export function resolve(source, file, config = {}) {
  if (!isRelative(source)) {
    return config.workspacePackages
      ? resolveWorkspacePackage(source, config.workspacePackages)
      : { found: false };
  }

  const path = fileCandidates(resolvePath(dirname(file), source)).find(isFile);
  return path === undefined ? { found: false } : { found: true, path };
}
