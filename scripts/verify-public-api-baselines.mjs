#!/usr/bin/env node
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { discoverPublishablePackages } from './lib/publishable-packages.mjs';
import {
  compareBaselines,
  currentBaselines,
} from '../packages/cli/engines/public-api-baselines.mjs';

// The comparison ships in @stynx-nyx/cli (`stynx verify-public-api-baselines --json`, SM-07);
// this script keeps the repository's clean build and its `--write` pair.
const repoRoot = process.cwd();
const write = process.argv.includes('--write');
const baselinePath = resolve(repoRoot, 'docs/framework/contracts/public-api-baselines.json');
const packageSpecs = discoverPublishablePackages(repoRoot);
const runningInsideTestGraph =
  process.env.npm_lifecycle_event === 'test' && typeof process.env.TURBO_HASH === 'string';
const preverifiedTestGraph = process.env.STYNX_API_BASELINE_MODE === 'preverified-test-graph';

if (preverifiedTestGraph && !runningInsideTestGraph) {
  throw new Error(
    'preverified-test-graph mode is valid only inside the supported Turbo test harness',
  );
}
if (runningInsideTestGraph && !preverifiedTestGraph) {
  throw new Error('public API baselines inside Turbo require the preverified pnpm test harness');
}

if (!preverifiedTestGraph) {
  for (const spec of packageSpecs) {
    rmSync(resolve(repoRoot, spec.dir, 'dist'), { recursive: true, force: true });
  }
  run('pnpm', ['build'], repoRoot);
}

const current = currentBaselines(repoRoot, packageSpecs);

if (write) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`[api-baseline] wrote ${relative(repoRoot, baselinePath)}`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  throw new Error(
    `Missing public API baseline at ${relative(repoRoot, baselinePath)}. Run pnpm api:baselines:write.`,
  );
}

const expected = JSON.parse(readFileSync(baselinePath, 'utf8'));
const failures = compareBaselines(expected, current, packageSpecs);

if (failures.length > 0) {
  console.error('[api-baseline] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[api-baseline] OK: ${packageSpecs.length} package baselines matched`);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`.trim(),
    );
  }
}
