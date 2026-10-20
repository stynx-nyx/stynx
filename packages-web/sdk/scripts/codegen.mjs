import { spawnSync } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatSdk, renderSdk, writeSdk } from '../codegen/generate.mjs';

// Workspace write form of `stynx-sdk-codegen` (the bin's check form is
// `stynx-sdk-codegen --check --input <openapi.json> --output <dir>`). It keeps the build's lock,
// so parallel builds never interleave writes, and regenerates a missing OpenAPI document first.
const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');
const workspaceRoot = resolve(packageRoot, '../..');
const inputPath = resolve(workspaceRoot, 'docs/framework/contracts/openapi.json');
const outputPath = resolve(packageRoot, 'src/generated');
const lockPath = resolve(packageRoot, '.codegen.lock');

function wait(ms) {
  return new Promise((resolveWait) => {
    setTimeout(resolveWait, ms);
  });
}

async function acquireLock() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      await mkdir(lockPath);
      return;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
        throw error;
      }
      await wait(250);
    }
  }
  throw new Error(`Timed out waiting for SDK codegen lock at ${lockPath}`);
}

async function releaseLock() {
  await rm(lockPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

async function ensureOpenApiInput() {
  try {
    await access(inputPath, constants.F_OK);
  } catch {
    const result = spawnSync('pnpm', ['api:docs:write'], {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error('Failed to generate OpenAPI docs before SDK codegen');
    }
    await access(inputPath, constants.F_OK);
  }
}

await ensureOpenApiInput();
await acquireLock();
try {
  writeSdk(await formatSdk(renderSdk({ input: inputPath }), outputPath), outputPath);
} finally {
  await releaseLock();
}
