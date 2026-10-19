// Import resolver (eslint-module-utils interface v2) for the strict profiles.
//
// eslint-plugin-boundaries classifies a dependency only after the import
// resolves to a file. Under NodeNext, TypeScript sources import siblings by
// their emitted `.js` name, which the default `node` resolver cannot map back
// to the `.ts` source, so element-to-element edges were never checked. This
// resolver handles relative specifiers only; bare specifiers fall through to
// the `node` resolver listed after it.
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

export function resolve(source, file) {
  if (!isRelative(source)) {
    return { found: false };
  }

  const target = resolvePath(dirname(file), source);
  const extension = extname(target);
  const candidates = [
    target,
    ...(emittedToSource[extension] ?? []).map(
      (sourceExtension) => `${target.slice(0, -extension.length)}${sourceExtension}`,
    ),
    ...sourceExtensions.map((sourceExtension) => `${target}${sourceExtension}`),
    ...sourceExtensions.map((sourceExtension) => join(target, `index${sourceExtension}`)),
  ];
  const path = candidates.find(isFile);
  return path === undefined ? { found: false } : { found: true, path };
}
