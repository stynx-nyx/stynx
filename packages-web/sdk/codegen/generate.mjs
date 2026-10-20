import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseOpenApi } from './parse.mjs';
import { renderClientFiles } from './render.mjs';

const compositionIdentity = /^[a-z][a-z0-9-]*$/u;

function namespaceOf(compositionId) {
  return compositionId
    .split('-')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join('');
}

/**
 * Renders the SDK for `input` (an OpenAPI 3.x document) in memory, keyed by the path relative
 * to the output directory. Operations whose `x-stynx-operation-variants` select another
 * composition get a namespace client generated from `<input dir>/openapi-compositions/<id>.json`
 * (`OfflineCtg9` for `offline-ctg9`), restricted to that composition's operations.
 */
export function renderSdk({ input }) {
  const inputPath = resolve(input);
  const contract = JSON.parse(readFileSync(inputPath, 'utf8'));
  const files = renderClientFiles(parseOpenApi(contract), 'GeneratedStynxSdk');

  const alternateCompositions = new Set();
  for (const item of Object.values(contract.paths ?? {})) {
    for (const operation of Object.values(item)) {
      for (const variant of operation['x-stynx-operation-variants'] ?? []) {
        if (variant['x-stynx-composition'] !== operation['x-stynx-composition'])
          alternateCompositions.add(variant['x-stynx-composition']);
      }
    }
  }
  let index = files.get('index.ts');
  for (const compositionId of [...alternateCompositions].sort()) {
    if (typeof compositionId !== 'string' || !compositionIdentity.test(compositionId))
      throw new Error('Invalid alternate SDK composition identity');
    const composition = JSON.parse(
      readFileSync(
        join(dirname(inputPath), 'openapi-compositions', `${compositionId}.json`),
        'utf8',
      ),
    );
    if (composition['x-stynx-composition'] !== compositionId)
      throw new Error(`SDK composition identity mismatch: ${compositionId}`);
    if (!isDeepStrictEqual(composition.components, contract.components))
      throw new Error(`SDK composition schema components mismatch: ${compositionId}`);
    // Keep real paths and contracts. The separate namespace represents a consumer selecting
    // the alternative controller, without merging incompatible bodies.
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
    const namespace = namespaceOf(compositionId);
    const nested = renderClientFiles(
      parseOpenApi({ ...composition, paths }),
      `Generated${namespace}Sdk`,
    );
    for (const [path, content] of nested)
      files.set(`compositions/${compositionId}/${path}`, content);
    index = `${index}\nexport * as ${namespace} from './compositions/${compositionId}';\n`;
  }
  files.set('index.ts', index);
  return files;
}

/** Formats every rendered file with the Prettier configuration that governs `output`. */
export async function formatSdk(files, output) {
  let prettier;
  try {
    prettier = await import('prettier');
  } catch {
    const error = new Error(
      'stynx-sdk-codegen needs prettier (^3) installed next to @stynx-nyx/sdk',
    );
    error.code = 'tooling-missing';
    throw error;
  }
  const outputPath = resolve(output);
  const configuration = (await prettier.resolveConfig(join(outputPath, 'index.ts'))) ?? {};
  const formatted = new Map();
  for (const [path, content] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    const filepath = join(outputPath, ...path.split('/'));
    formatted.set(path, await prettier.format(content, { ...configuration, filepath }));
  }
  return formatted;
}

export const toPortable = (path) => path.split(sep).join('/');

function listFiles(root, dir = root) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(root, path);
    return [toPortable(relative(root, path))];
  });
}

/** `<path>:1 <reason>` per generated file that is missing, differs, or is not generated. */
export function checkSdk(files, output) {
  const outputPath = resolve(output);
  const findings = [];
  const present = new Set(listFiles(outputPath));
  for (const [path, content] of files) {
    if (!present.has(path)) findings.push(`${path}:1 generated file is missing`);
    else if (readFileSync(join(outputPath, path), 'utf8') !== content)
      findings.push(`${path}:1 differs from regeneration`);
    present.delete(path);
  }
  for (const path of [...present].sort()) findings.push(`${path}:1 is not a generated file`);
  return findings;
}

/** Replaces `output` with `files` through a sibling staging directory. */
export function writeSdk(files, output) {
  const outputPath = resolve(output);
  const staging = join(dirname(outputPath), `.stynx-sdk-codegen-${process.pid}-${Date.now()}`);
  rmSync(staging, { recursive: true, force: true });
  try {
    for (const [path, content] of files) {
      const target = join(staging, ...path.split('/'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    rmSync(outputPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    renameSync(staging, outputPath);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
