// Central Stryker factory for stynx packages.
//
// Threshold resolution
// --------------------
// `threshold` argument is optional. When absent, resolves from
// scripts/test-matrix.config.json via getMutationThresholds(packageName).
// Policies may be a number (legacy single-floor) or an object {break, high}
// (tiered floor + target). The resolved triplet drives Stryker's
// thresholds.{high, low, break}.
//
// CI / PR split modes (see docs/meta/adr/2026-05-21-mutation-thresholds-tiered.md)
// --------------------------------------------------------------------------
// `STRYKER_INCREMENTAL` (env) is the split-mode knob:
//   - unset / 'true'  → incremental: true.  Use for local dev iteration and
//                       (later) the per-PR scoped gate. Cache file lives at
//                       reports/stryker-incremental.json; persist across CI
//                       runs via actions/cache.
//   - 'false'         → incremental: false. Use for the weekly Monday cron
//                       (.github/workflows/hardening.yml) and any monthly
//                       baseline-refresh job. Full runs are the only way to
//                       catch cross-file drift in a monorepo.
// Dashboard publishing was removed by operator decision 2026-06-11; see git history.
//
// Default concurrency
// -------------------
// The factory default stays at 2. W05 sampled @stynx-web/angular-trash
// full-mode on the 4-vCPU ubuntu-latest hardening runner class: concurrency 4
// was slower locally and introduced timeout kills, so packages that are proven
// stable at higher process counts should keep explicit per-package overrides.
//
// Per-PR mutation gating is intentionally deferred (see ADR). When adopted,
// the gate runs the PR-mode factory with `STRYKER_INCREMENTAL=true` and the
// `actions/cache` step keyed on src+test hashes; the weekly cron continues to
// emit the authoritative score with `STRYKER_INCREMENTAL=false`.
//
// Default mutate exclusions
// -------------------------
// `*.controller.ts` files are excluded by default. Nest controllers in stynx
// are thin HTTP → service forwarders; their literal route paths and
// permission strings are exercised by integration tests via supertest, not
// by unit specs. Mutating them under unit mocks produces low-signal
// survivors and dilutes the report (see audit MUTATION_AUDIT_2026-05-19.md
// finding #11). Packages that genuinely have branching logic inside a
// controller may opt back in by overriding `mutate`.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { getMutationThresholds } from '../repo-config/test-thresholds.mjs';

function cleanStrykerBackups(tempDirName) {
  const tempDir = join(process.cwd(), tempDirName);
  if (!existsSync(tempDir)) {
    return;
  }

  for (const entry of readdirSync(tempDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('backup-')) {
      rmSync(join(tempDir, entry.name), { recursive: true, force: true });
    }
  }
}

export function createStrykerConfig({
  packageName,
  threshold,
  checkers = ['typescript'],
  concurrency = 2,
  vitestConfig = './vitest.config.ts',
  mutate = ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.controller.ts'],
  timeoutMS,
  ignoreStatic = false,
  incremental = process.env.STRYKER_INCREMENTAL !== 'false',
}) {
  const tempDirName = '.stryker-tmp';
  cleanStrykerBackups(tempDirName);

  const resolved = typeof threshold === 'number'
    ? { break: threshold, high: threshold, low: Math.max(60, threshold - 10) }
    : getMutationThresholds(packageName);

  return {
    packageManager: 'pnpm',
    plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'],
    testRunner: 'vitest',
    coverageAnalysis: 'perTest',
    mutate,
    checkers,
    tsconfigFile: 'tsconfig.json',
    tempDirName,
    cleanTempDir: true,
    inPlace: true,
    concurrency,
    incremental,
    ignoreStatic,
    ...(timeoutMS ? { timeoutMS } : {}),
    vitest: {
      configFile: vitestConfig,
    },
    reporters: [
      'clear-text',
      'progress',
      'html',
      'json',
    ],
    thresholds: {
      high: resolved.high,
      low: resolved.low,
      break: resolved.break,
    },
    htmlReporter: {
      fileName: `reports/mutation/${packageName.replace(/[@/]/g, '-')}/index.html`,
    },
    jsonReporter: {
      fileName: 'reports/mutation/mutation.json',
    },
  };
}
