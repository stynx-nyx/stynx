#!/usr/bin/env node
// stynx-sdk-codegen [--check] --input <openapi.json> --output <dir>
//
// Generation/check pair for the STYNX SDK (DEVAI v3 08 B.16; D-059 P-7-06). Without --check it
// replaces <dir> with the regenerated SDK. With --check it renders in memory and compares the
// file set and bytes under <dir>; it writes nothing. Exit 0: identical (or written); 1: drift,
// one `<path>:1` line per differing, missing or unlisted file; 2: could not run.
import { existsSync, statSync } from 'node:fs';
import { checkSdk, formatSdk, renderSdk, toPortable, writeSdk } from './generate.mjs';

const usage = 'usage: stynx-sdk-codegen [--check] --input <openapi.json> --output <dir>';

/** @param {string[]} argv @returns {{check: boolean, input: string, output: string}} */
function parseArgs(argv) {
  /** @type {{check: boolean, input: string | null, output: string | null}} */
  const options = { check: false, input: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--check') options.check = true;
    else if (value === '--input' || value === '--output') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new UsageError(`missing value for ${value}`);
      options[value === '--input' ? 'input' : 'output'] = next;
      index += 1;
    } else if (value === '--help' || value === '-h') {
      process.stdout.write(`${usage}\n`);
      process.exit(0);
    } else throw new UsageError(`unknown option ${value}`);
  }
  if (!options.input || !options.output) throw new UsageError('--input and --output are required');
  return { check: options.check, input: options.input, output: options.output };
}

class UsageError extends Error {}

/** @param {unknown} error @returns {unknown} */
function failureMessage(error) {
  if (error === null || error === undefined)
    throw new TypeError(`Cannot read properties of ${error} (reading 'message')`);
  /** @type {unknown} */
  const boxed = Object(error);
  if ((typeof boxed !== 'object' || boxed === null) && typeof boxed !== 'function')
    throw new TypeError('Native Object boxing returned a non-object');
  return Reflect.get(boxed, 'message', error);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`stynx-sdk-codegen: ${failureMessage(error)}\n${usage}\n`);
    return 2;
  }
  if (!existsSync(options.input) || !statSync(options.input).isFile()) {
    process.stderr.write(`stynx-sdk-codegen: input not found: ${options.input}\n`);
    return 2;
  }
  let files;
  try {
    files = await formatSdk(renderSdk({ input: options.input }), options.output);
  } catch (error) {
    process.stderr.write(`stynx-sdk-codegen: ${failureMessage(error)}\n`);
    return 2;
  }
  if (!options.check) {
    writeSdk(files, options.output);
    process.stdout.write(`stynx-sdk-codegen: wrote ${files.size} files to ${options.output}\n`);
    return 0;
  }
  const findings = checkSdk(files, options.output);
  const prefix = toPortable(options.output).replace(/\/+$/u, '');
  for (const finding of findings) process.stdout.write(`${prefix}/${finding}\n`);
  process.stdout.write(
    findings.length
      ? `stynx-sdk-codegen: ${findings.length} of ${files.size} generated files drifted\n`
      : `stynx-sdk-codegen: ${files.size} generated files match\n`,
  );
  return findings.length ? 1 : 0;
}

process.exitCode = await main();
