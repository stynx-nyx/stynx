#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const publishEnabled = process.env.STYNX_ENABLE_REGISTRY_PUBLISH === 'true';
const token = process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN;

if (!publishEnabled) {
  console.log(
    'Registry publish is disabled. Set STYNX_ENABLE_REGISTRY_PUBLISH=true and provide NPM_TOKEN to publish packages.',
  );
  process.exit(0);
}

if (!token) {
  console.error('Registry publish is enabled, but NPM_TOKEN/NODE_AUTH_TOKEN is not configured.');
  process.exit(1);
}

// No NPM_CONFIG_PROVENANCE here: npm provenance requires public access,
// and GitHub Packages publishes are always "restricted" — with the flag
// set, every `npm publish` fails with EUSAGE ("Can't generate provenance
// for new or private package") and nothing reaches the registry.
const result = spawnSync('pnpm', ['release'], {
  env: {
    ...process.env,
    NODE_AUTH_TOKEN: token,
    NPM_TOKEN: token,
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
