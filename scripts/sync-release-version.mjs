#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncReleaseVersion, validateReleaseVersionPolicy } from './lib/release-version-policy.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const changesetConfig = JSON.parse(
  readFileSync(resolve(repoRoot, '.changeset/config.json'), 'utf8'),
);

if (process.argv.includes('--check')) {
  const errors = validateReleaseVersionPolicy(repoRoot, changesetConfig);
  if (errors.length > 0) {
    console.error('Release version synchronization failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log('Root and public package versions are synchronized.');
} else {
  const result = syncReleaseVersion(repoRoot);
  console.log(`Synchronized root and ${result.packageCount} public packages at ${result.version}.`);
}
