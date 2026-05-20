import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { getMutationThreshold } from '../repo-config/test-thresholds.mjs';

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
  mutate = ['src/**/*.ts', '!src/**/*.d.ts'],
  timeoutMS,
  ignoreStatic = false,
  incremental = process.env.STRYKER_INCREMENTAL !== 'false',
}) {
  const tempDirName = '.stryker-tmp';
  cleanStrykerBackups(tempDirName);

  // `threshold` argument is optional — resolves from
  // scripts/test-matrix.config.json via test-thresholds.mjs when absent.
  const resolvedThreshold = typeof threshold === 'number'
    ? threshold
    : getMutationThreshold(packageName);
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
    reporters: ['clear-text', 'progress', 'html', 'json'],
    thresholds: {
      high: resolvedThreshold,
      low: Math.max(60, resolvedThreshold - 10),
      break: resolvedThreshold,
    },
    htmlReporter: {
      fileName: `reports/mutation/${packageName.replace(/[@/]/g, '-')}/index.html`,
    },
    jsonReporter: {
      fileName: 'reports/mutation/mutation.json',
    },
  };
}
