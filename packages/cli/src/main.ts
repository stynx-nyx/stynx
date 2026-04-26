#!/usr/bin/env node
import { buildProgram } from './cli';

async function main(): Promise<void> {
  await buildProgram().parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
