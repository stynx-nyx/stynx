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

// GitHub Packages publishes are restricted and do not support npm provenance.
// Force false so an ambient runner setting cannot recreate the known EUSAGE
// failure. The release verifier keeps this exception aligned with policy.
const result = spawnSync('pnpm', ['release'], {
  env: {
    ...process.env,
    NPM_CONFIG_PROVENANCE: 'false',
    NODE_AUTH_TOKEN: token,
    NPM_TOKEN: token,
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
