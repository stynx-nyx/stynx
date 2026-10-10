import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { generate } from 'openapi-typescript-codegen';

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

async function replaceGeneratedOutput() {
  const outputParentPath = dirname(outputPath);
  const tempOutputPath = resolve(outputParentPath, `.generated-${process.pid}-${Date.now()}`);

  await rm(tempOutputPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  await mkdir(tempOutputPath, { recursive: true });

  try {
    await generate({
      input: inputPath,
      output: tempOutputPath,
      httpClient: 'fetch',
      useUnionTypes: true,
      useOptions: true,
      exportSchemas: true,
      clientName: 'GeneratedStynxSdk',
    });

    const contract = JSON.parse(await readFile(inputPath, 'utf8'));
    const alternateCompositions = new Set();
    for (const item of Object.values(contract.paths ?? {})) {
      for (const operation of Object.values(item)) {
        for (const variant of operation['x-stynx-operation-variants'] ?? []) {
          if (variant['x-stynx-composition'] !== operation['x-stynx-composition'])
            alternateCompositions.add(variant['x-stynx-composition']);
        }
      }
    }
    for (const compositionId of [...alternateCompositions].sort()) {
      if (typeof compositionId !== 'string' || !/^[a-z][a-z0-9-]*$/u.test(compositionId))
        throw new Error('Invalid alternate SDK composition identity');
      const compositionPath = resolve(
        workspaceRoot,
        'docs/framework/contracts/openapi-compositions',
        `${compositionId}.json`,
      );
      const composition = JSON.parse(await readFile(compositionPath, 'utf8'));
      if (composition['x-stynx-composition'] !== compositionId)
        throw new Error(`SDK composition identity mismatch: ${compositionId}`);
      if (!isDeepStrictEqual(composition.components, contract.components))
        throw new Error(`SDK composition schema components mismatch: ${compositionId}`);
      // Keep real paths and contracts. The separate namespace represents a consumer
      // selecting the alternative controller, without merging incompatible bodies.
      const paths = Object.fromEntries(
        Object.entries(composition.paths ?? {})
          .map(([path, item]) => [
            path,
            Object.fromEntries(
              Object.entries(item).filter(
                ([, operation]) => operation['x-stynx-composition'] === compositionId,
              ),
            ),
          ])
          .filter(([, item]) => Object.keys(item).length),
      );
      for (const [path, item] of Object.entries(contract.paths ?? {})) {
        for (const [method, operation] of Object.entries(item)) {
          for (const variant of operation['x-stynx-operation-variants'] ?? []) {
            if (
              variant['x-stynx-composition'] === compositionId &&
              !isDeepStrictEqual(paths[path]?.[method], variant)
            )
              throw new Error(`SDK alternate operation contract mismatch: ${method} ${path}`);
          }
        }
      }
      const namespace = compositionId
        .split('-')
        .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
        .join('');
      await generate({
        input: { ...composition, paths },
        output: resolve(tempOutputPath, 'compositions', compositionId),
        httpClient: 'fetch',
        useUnionTypes: true,
        useOptions: true,
        exportSchemas: true,
        clientName: `Generated${namespace}Sdk`,
      });
      const indexPath = resolve(tempOutputPath, 'index.ts');
      await writeFile(
        indexPath,
        `${await readFile(indexPath, 'utf8')}\nexport * as ${namespace} from './compositions/${compositionId}';\n`,
      );
    }

    await rm(outputPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    await rename(tempOutputPath, outputPath);
  } catch (error) {
    await rm(tempOutputPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    throw error;
  }
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
  await replaceGeneratedOutput();
} finally {
  await releaseLock();
}
