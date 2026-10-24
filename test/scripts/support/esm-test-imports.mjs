import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const resolutions = new Map();

// Node's explicit parentURL resolver preserves the owning package's pnpm graph.
// The flag is confined to this resolution-only child; imports run in the test
// host with ordinary ESM semantics and never evaluate the resolution anchor.
export function resolveTestImport(specifier, parentURL) {
  const parent = parentURL instanceof URL ? parentURL.href
    : parentURL.startsWith('file:') ? parentURL : pathToFileURL(parentURL).href;
  const key = JSON.stringify([specifier, parent]);
  if (!resolutions.has(key)) {
    const url = execFileSync(process.execPath, [
      '--experimental-import-meta-resolve', '--input-type=module', '-e',
      'process.stdout.write(import.meta.resolve(process.argv[1], process.argv[2]));',
      specifier, parent,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
    resolutions.set(key, url);
  }
  return resolutions.get(key);
}

export function resolveTestImportPath(specifier, parentURL) {
  return fileURLToPath(resolveTestImport(specifier, parentURL));
}
