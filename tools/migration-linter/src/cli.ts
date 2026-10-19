#!/usr/bin/env node
import { lintSqlTargets } from './lint.js';
import type { LintOptions } from './types.js';

type OutputFormat = 'human' | 'json';

const USAGE =
  'Usage: stynx-migration-lint <migration-file-or-dir>... [--format=json|human] [--fix-suggestions] [--lgpd] [--base-dir <dir>] [--manifest <path>]';

interface CliArgs {
  targets: string[];
  format: OutputFormat;
  options: LintOptions;
}

function parseArgs(argv: string[]): CliArgs {
  const targets: string[] = [];
  let format: OutputFormat = 'human';
  const options: LintOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const [flag, inlineValue] = arg.startsWith('--') && arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, undefined];
    const value = (): string => {
      const candidate = inlineValue ?? argv[(index += 1)];
      if (candidate === undefined || candidate.length === 0) {
        throw new Error(`${flag} requires a value.`);
      }
      return candidate;
    };

    switch (flag) {
      case '--format': {
        const candidate = value();
        if (candidate !== 'json' && candidate !== 'human') {
          throw new Error(`Unsupported format: ${candidate}`);
        }
        format = candidate;
        continue;
      }
      case '--fix-suggestions':
        options.includeFixSuggestions = true;
        continue;
      case '--lgpd':
        options.lgpd = true;
        continue;
      case '--base-dir':
        options.baseDir = value();
        continue;
      case '--manifest':
        options.manifest = value();
        continue;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown flag: ${arg}`);
        }
        targets.push(arg);
    }
  }

  if (targets.length === 0) {
    throw new Error(USAGE);
  }

  return { targets, format, options };
}

function printHuman(result: Awaited<ReturnType<typeof lintSqlTargets>>): void {
  if (result.parserIssues.length > 0) {
    console.error('Parser errors:');
    for (const issue of result.parserIssues) {
      console.error(`- ${issue.file}: ${issue.message}`);
    }
  }

  if (result.issues.length > 0) {
    console.error('Lint failures:');
    for (const issue of result.issues) {
      console.error(`- ${issue.file}:${issue.line} ${issue.code} ${issue.message}`);
      if (issue.suggestion) {
        console.error('  fix suggestion:');
        for (const line of issue.suggestion.split('\n')) {
          console.error(`    ${line}`);
        }
      }
    }
  }

  if (result.parserIssues.length === 0 && result.issues.length === 0) {
    console.log(`clean (${result.files.length} file${result.files.length === 1 ? '' : 's'})`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await lintSqlTargets(args.targets, args.options);

  if (args.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  if (result.parserIssues.length > 0) {
    process.exitCode = 2;
    return;
  }

  if (result.issues.length > 0) {
    process.exitCode = 1;
    return;
  }

  process.exitCode = 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
