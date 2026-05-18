#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const separator = args.indexOf('--');

if (args.length < 3 || separator <= 0 || separator === args.length - 1) {
  process.stderr.write('Usage: node scripts/record-test-artifact.mjs <log-name> -- <command> [args...]\n');
  process.exit(2);
}

const logName = args[0];
const command = args[separator + 1];
const commandArgs = args.slice(separator + 2);
const turboDir = join(process.cwd(), '.turbo');
const logPath = join(turboDir, logName);
const metaPath = `${logPath}.meta.json`;
const startedAt = new Date();
const startedAtMs = Date.now();
let output = '';

mkdirSync(turboDir, { recursive: true });

const child = spawn(command, commandArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});

child.stderr.on('data', (chunk) => {
  output += chunk;
  process.stderr.write(chunk);
});

child.on('error', (error) => {
  output += `${error.stack ?? error.message}\n`;
  writeFileSync(logPath, output);
  writeMeta({
    endedAt: new Date(),
    exitCode: null,
    signal: null,
    error: error.message,
  });
  process.exit(1);
});

child.on('close', (code, signal) => {
  writeFileSync(logPath, output);
  writeMeta({
    endedAt: new Date(),
    exitCode: code,
    signal,
  });
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

function writeMeta({ endedAt, exitCode, signal, error }) {
  const payload = {
    logName,
    command,
    args: commandArgs,
    cwd: process.cwd(),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Date.now() - startedAtMs,
    exitCode,
    signal,
  };
  if (error) payload.error = error;
  writeFileSync(metaPath, `${JSON.stringify(payload, null, 2)}\n`);
}
