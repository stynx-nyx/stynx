export function createStrykerConfig({
  packageName,
  threshold,
  checkers = ['typescript'],
  jestConfig = './jest.config.cjs',
  mutate = ['src/**/*.ts', '!src/**/*.d.ts'],
}) {
  const incremental = process.env.STRYKER_INCREMENTAL !== 'false';
  return {
    packageManager: 'pnpm',
    plugins: ['@stryker-mutator/jest-runner', '@stryker-mutator/typescript-checker'],
    testRunner: 'jest',
    coverageAnalysis: 'perTest',
    mutate,
    checkers,
    tsconfigFile: 'tsconfig.json',
    tempDirName: '.stryker-tmp',
    cleanTempDir: true,
    inPlace: true,
    concurrency: 2,
    incremental,
    jest: {
      projectType: 'custom',
      configFile: jestConfig,
      enableFindRelatedTests: true,
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
