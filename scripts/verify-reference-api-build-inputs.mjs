#!/usr/bin/env node

import { createRequire } from 'node:module';
import { open, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const referenceApiManifest = resolve(repoRoot, 'reference/api/package.json');
const preferencesRoot = resolve(repoRoot, 'packages/preferences');
const expectedRuntime = resolve(preferencesRoot, 'dist/preferences/src/index.js');
const expectedDeclaration = resolve(preferencesRoot, 'dist/preferences/src/index.d.ts');
const requireFromReferenceApi = createRequire(referenceApiManifest);

async function requireRegularFile(path, label) {
  let handle;
  try {
    handle = await open(path, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error(`${label} is not a regular file`);
  } catch (error) {
    throw new Error(`${label} is unavailable`, { cause: error });
  } finally {
    await handle?.close();
  }
}

const manifest = JSON.parse(await readFile(resolve(preferencesRoot, 'package.json'), 'utf8'));
if (
  manifest.main !== 'dist/preferences/src/index.js' ||
  manifest.types !== 'dist/preferences/src/index.d.ts' ||
  manifest.exports?.['.']?.types !== './dist/preferences/src/index.d.ts' ||
  manifest.exports?.['.']?.default !== './dist/preferences/src/index.js'
) {
  throw new Error(
    '@stynx-nyx/preferences manifest outputs do not match the reference API contract',
  );
}

await requireRegularFile(expectedRuntime, '@stynx-nyx/preferences runtime output');
await requireRegularFile(expectedDeclaration, '@stynx-nyx/preferences declaration output');

const resolvedRuntime = requireFromReferenceApi.resolve('@stynx-nyx/preferences');
if (resolvedRuntime !== expectedRuntime) {
  throw new Error('@stynx-nyx/preferences does not resolve to the verified runtime output');
}
