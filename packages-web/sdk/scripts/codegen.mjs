import { spawnSync } from 'node:child_process';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generate } from 'openapi-typescript-codegen';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');
const workspaceRoot = resolve(packageRoot, '../..');
const inputPath = resolve(workspaceRoot, 'packages/core/dist/openapi/openapi.json');
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

async function replaceGeneratedOutput() {
  const tempOutputPath = resolve(
    tmpdir(),
    `stynx-sdk-codegen-${process.pid}-${Date.now()}`,
  );

  await rm(tempOutputPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  await mkdir(tempOutputPath, { recursive: true });

  await generate({
    input: inputPath,
    output: tempOutputPath,
    httpClient: 'fetch',
    useUnionTypes: true,
    useOptions: true,
    exportSchemas: true,
    clientName: 'GeneratedStynxSdk',
  });

  await rm(outputPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  await rename(tempOutputPath, outputPath);
}

async function ensureOpenApiInput() {
  try {
    await access(inputPath, constants.F_OK);
  } catch {
    const result = spawnSync('pnpm', ['--filter', '@stynx/core', 'build'], {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error('Failed to build @stynx/core before SDK codegen');
    }
    await access(inputPath, constants.F_OK);
  }
}

await ensureOpenApiInput();
await acquireLock();
try {
  await replaceGeneratedOutput();
} finally {
  await releaseLock();
}
