import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodeProject from './tsconfig.workspace-node-implementation.json' with { type: 'json' };
import imageSizeProject from './tsconfig.workspace-image-size.json' with { type: 'json' };

const root = fileURLToPath(new URL('../../', import.meta.url));
const eslintBin = resolve(
  dirname(fileURLToPath(import.meta.resolve('eslint/package.json'))),
  'bin/eslint.js',
);
// Preserve the existing canonical command population without loading any ESLint
// configuration before the native CLI handles help, version, or option errors.
const paths = [
  'tools/eslint-config/*.mjs',
  'packages-web/sdk/codegen/*.mjs',
  'packages-web/sdk/scripts/*.mjs',
  'packages/cli/engines/*.mjs',
  ...[...nodeProject.files, ...imageSizeProject.files].map((file) =>
    relative(root, resolve(dirname(fileURLToPath(import.meta.url)), file)).replaceAll('\\', '/'),
  ),
];
const result = spawnSync(
  process.execPath,
  [
    eslintBin,
    '--config',
    'tools/eslint-config/workspace-maintained.mjs',
    '--max-warnings=0',
    ...paths,
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.signal) process.kill(process.pid, result.signal);
else process.exitCode = result.status ?? 1;
