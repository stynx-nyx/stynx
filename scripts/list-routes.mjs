#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectRoutes as collectDeclaredRoutes,
  formatCsv,
  formatReport,
  parseControllerFile as parseDeclaredControllerFile,
} from '../packages/cli/engines/list-routes.mjs';

// The engine ships in @stynx-nyx/cli (`stynx list-routes --json --roots`, SM-07);
// this script keeps the repository's fixed roots and its CSV/report output.
const defaultScanRoots = ['packages', 'reference/api/src', 'domain/demo-bookmark/api/src'];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export { formatCsv, formatReport };

export function collectRoutes(options = {}) {
  return collectDeclaredRoutes({
    ...options,
    repoRoot: options.repoRoot ?? repoRoot,
    scanRoots: options.scanRoots ?? defaultScanRoots,
  });
}

export function parseControllerFile(file, packageInfo = null, root = repoRoot) {
  return parseDeclaredControllerFile(file, packageInfo, root);
}

if (isMain()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const routes = collectRoutes({
      repoRoot,
      packageFilter: args.package,
      controllerFilter: args.controller,
    });
    if (args.output === 'report') {
      process.stdout.write(formatReport(routes));
    } else {
      process.stdout.write(formatCsv(routes));
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}
function parseArgs(values) {
  const parsed = { output: 'csv', package: null, controller: null };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--csv') parsed.output = 'csv';
    else if (value === '--report') parsed.output = 'report';
    else if (value === '--package') {
      parsed.package = requireValue(values, index, value);
      index += 1;
    } else if (value.startsWith('--package=')) {
      parsed.package = value.slice('--package='.length);
    } else if (value === '--controller') {
      parsed.controller = requireValue(values, index, value);
      index += 1;
    } else if (value.startsWith('--controller=')) {
      parsed.controller = value.slice('--controller='.length);
    } else if (value === '--help' || value === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }
  return parsed;
}

function printUsage(stream = process.stdout) {
  stream.write(`Usage: node scripts/list-routes.mjs [--csv|--report] [--package <name>] [--controller <ControllerName>]

Walks NestJS controllers under packages/*/src, reference/api/src, and
domain/demo-bookmark/api/src and emits route metadata.

Columns:
  package, controller, method, path, permissions, rate-limit-class
`);
}

function requireValue(values, index, flag) {
  const value = values[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
