import { getMutationThreshold } from '../repo-config/test-thresholds.mjs';

export function createStrykerConfig({
  packageName,
  threshold,
  checkers = ['typescript'],
  concurrency = 2,
  vitestConfig = './vitest.config.ts',
  mutate = ['src/**/*.ts', '!src/**/*.d.ts'],
  timeoutMS,
}) {
  const incremental = process.env.STRYKER_INCREMENTAL !== 'false';
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
    tempDirName: '.stryker-tmp',
    cleanTempDir: true,
    inPlace: true,
    concurrency,
    incremental,
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
