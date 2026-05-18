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
      high: threshold,
      low: Math.max(60, threshold - 10),
      break: threshold,
    },
    htmlReporter: {
      fileName: `reports/mutation/${packageName.replace(/[@/]/g, '-')}/index.html`,
    },
    jsonReporter: {
      fileName: 'reports/mutation/mutation.json',
    },
  };
}
