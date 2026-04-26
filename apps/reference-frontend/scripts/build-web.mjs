import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const outDir = path.resolve(appRoot, 'dist/browser');
const entryFile = path.resolve(appRoot, 'src/web/main.ts');
const indexSrc = path.resolve(appRoot, 'src/web/index.html');
const indexDest = path.resolve(outDir, 'index.html');

await mkdir(outDir, { recursive: true });
await build({
  entryPoints: [entryFile],
  outfile: path.resolve(outDir, 'main.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
});

await copyFile(indexSrc, indexDest);
