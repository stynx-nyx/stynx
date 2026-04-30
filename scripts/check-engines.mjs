#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expectedNode = manifest.engines?.node;
const expectedPnpm = manifest.engines?.pnpm;
const nodeMajor = Number(process.versions.node.split('.')[0]);

const failures = [];
if (expectedNode !== '>=24 <25' || nodeMajor !== 24) {
  failures.push(`node ${process.versions.node} does not satisfy ${expectedNode ?? '(missing)'}`);
}

if (expectedPnpm !== '>=9 <10') {
  failures.push(`pnpm engine must be >=9 <10, got ${expectedPnpm ?? '(missing)'}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[engines][fail] ${failure}`);
  }
  process.exit(1);
}

console.log(`[engines][ok] node ${process.versions.node}; pnpm ${expectedPnpm}`);
