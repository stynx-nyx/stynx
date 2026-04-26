#!/usr/bin/env node
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { lintSqlTarget } from './lint.js';

type OutputFormat = 'human' | 'json';

function parseArgs(argv: string[]): { target: string; format: OutputFormat; includeFixSuggestions: boolean } {
  const positionals: string[] = [];
  let format: OutputFormat = 'human';
  let includeFixSuggestions = false;

  for (const arg of argv) {
    if (arg.startsWith('--format=')) {
      const candidate = arg.slice('--format='.length);
      if (candidate === 'json' || candidate === 'human') {
        format = candidate;
        continue;
      }
      throw new Error(`Unsupported format: ${candidate}`);
    }
    if (arg === '--fix-suggestions') {
      includeFixSuggestions = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new Error('Usage: stynx-migration-lint <migration-file-or-dir> [--format=json|human] [--fix-suggestions]');
  }

  const target = positionals[0];
  if (!target) {
    throw new Error('Missing migration target.');
  }

  return {
    target,
    format,
    includeFixSuggestions,
  };
}

function printHuman(result: Awaited<ReturnType<typeof lintSqlTarget>>): void {
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
  const target = resolve(args.target);
  statSync(target);

  const result = await lintSqlTarget(target, {
    includeFixSuggestions: args.includeFixSuggestions,
  });

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
