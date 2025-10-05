const { readdirSync, statSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const scriptsDir = join(__dirname, '..', '..', 'scripts');
const failures = [];

for (const file of readdirSync(scriptsDir)) {
  if (!file.endsWith('.sh')) continue;
  const fullPath = join(scriptsDir, file);
  const stat = statSync(fullPath);
  if ((stat.mode & 0o111) === 0) {
    failures.push(`${file} is not executable`);
  }
  const head = readFileSync(fullPath, 'utf8').split('\n')[0];
  if (!head.startsWith('#!/usr/bin/env bash')) {
    failures.push(`${file} missing bash shebang`);
  }
}

if (failures.length) {
  console.error('Script validation failed:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('All scripts validated');
