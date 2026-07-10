import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const workspaceRoot = path.resolve(appRoot, '..', '..');
const outDir = path.resolve(appRoot, 'dist/browser');
const entryFile = path.resolve(appRoot, 'src/main.ts');
const indexSrc = path.resolve(appRoot, 'src/web/index.html');
const indexDest = path.resolve(outDir, 'index.html');

await mkdir(outDir, { recursive: true });
await build({
  absWorkingDir: workspaceRoot,
  entryPoints: [entryFile],
  outfile: path.resolve(outDir, 'main.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
  alias: {
    '@stynx-nyx/angular': path.resolve(workspaceRoot, 'packages-web/angular/src/index.ts'),
    '@stynx-nyx/angular-auth': path.resolve(workspaceRoot, 'packages-web/angular-auth/src/index.ts'),
    '@stynx-nyx/angular-flow': path.resolve(workspaceRoot, 'packages-web/angular-flow/src/index.ts'),
    '@stynx-nyx/angular-iam': path.resolve(workspaceRoot, 'packages-web/angular-iam/src/index.ts'),
    '@stynx-nyx/angular-tenancy': path.resolve(workspaceRoot, 'packages-web/angular-tenancy/src/index.ts'),
    '@stynx-nyx/angular-ui': path.resolve(workspaceRoot, 'packages-web/angular-ui/src/index.ts'),
    '@stynx-nyx/angular-i18n': path.resolve(workspaceRoot, 'packages-web/angular-i18n/src/index.ts'),
    '@stynx-nyx/angular-trash': path.resolve(workspaceRoot, 'packages-web/angular-trash/src/index.ts'),
    '@stynx-nyx/angular-storage': path.resolve(workspaceRoot, 'packages-web/angular-storage/src/index.ts'),
    '@stynx-nyx/angular-sessions': path.resolve(workspaceRoot, 'packages-web/angular-sessions/src/index.ts'),
    '@stynx-nyx/angular-profile': path.resolve(workspaceRoot, 'packages-web/angular-profile/src/index.ts'),
    '@stynx-nyx/sdk': path.resolve(workspaceRoot, 'packages-web/sdk/src/index.ts'),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'process.env.PLAYWRIGHT_USE_REAL_OIDC': JSON.stringify(process.env.PLAYWRIGHT_USE_REAL_OIDC ?? ''),
  },
});

await copyFile(indexSrc, indexDest);
