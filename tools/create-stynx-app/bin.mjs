#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(cliDir, 'template');

function usage() {
  return `Usage:
  create-stynx-app <app-name> [--no-install] [--dry-run] [--force]

Options:
  --no-install  Scaffold files without running pnpm install.
  --dry-run     Print the target directory and exit without writing files.
  --force       Allow scaffolding into an existing directory.
  --help        Show this help text.
`;
}

function parseArgs(argv) {
  const flags = new Set();
  const positional = [];

  for (const arg of argv) {
    if (arg.startsWith('-')) {
      flags.add(arg);
    } else {
      positional.push(arg);
    }
  }

  return {
    appName: positional[0],
    help: flags.has('--help') || flags.has('-h'),
    noInstall: flags.has('--no-install'),
    dryRun: flags.has('--dry-run'),
    force: flags.has('--force'),
    unknownFlags: [...flags].filter((flag) => !['--help', '-h', '--no-install', '--dry-run', '--force'].includes(flag)),
  };
}

function packageNameFor(appName) {
  const baseName = path.basename(appName);
  return baseName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '') || 'stynx-app';
}

async function exists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function replacePlaceholders(content, values) {
  return content
    .replaceAll('__APP_NAME__', values.appName)
    .replaceAll('__PACKAGE_NAME__', values.packageName);
}

async function copyTemplate(fromDir, toDir, values) {
  await mkdir(toDir, { recursive: true });
  const entries = await readdir(fromDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(fromDir, entry.name);
    const targetPath = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      await copyTemplate(sourcePath, targetPath, values);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const template = await readFile(sourcePath, 'utf8');
    await writeFile(targetPath, replacePlaceholders(template, values), 'utf8');
  }
}

function runInstall(targetDir) {
  const result = spawnSync('pnpm', ['install'], {
    cwd: targetDir,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

async function assertTarget(targetDir, force) {
  if (!(await exists(targetDir))) {
    return;
  }

  const targetStat = await stat(targetDir);
  if (!targetStat.isDirectory()) {
    throw new Error(`Target exists and is not a directory: ${targetDir}`);
  }

  if (!force) {
    const entries = await readdir(targetDir);
    if (entries.length > 0) {
      throw new Error(`Target directory is not empty: ${targetDir}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  if (args.unknownFlags.length > 0) {
    throw new Error(`Unknown option: ${args.unknownFlags.join(', ')}`);
  }

  if (!args.appName) {
    process.stderr.write(usage());
    process.exitCode = 1;
    return;
  }

  const targetDir = path.resolve(process.cwd(), args.appName);
  const values = {
    appName: path.basename(targetDir),
    packageName: packageNameFor(args.appName),
  };

  if (args.dryRun) {
    process.stdout.write(`Would scaffold ${values.packageName} at ${targetDir}\n`);
    return;
  }

  await assertTarget(targetDir, args.force);
  await copyTemplate(templateDir, targetDir, values);

  process.stdout.write(`Scaffolded ${values.packageName} at ${targetDir}\n`);

  if (args.noInstall) {
    process.stdout.write('Skipped pnpm install because --no-install was provided.\n');
    return;
  }

  runInstall(targetDir);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
