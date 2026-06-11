// @ts-nocheck
import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/data',
  // data.module.spec.ts is excluded from the MUTATION harness only: under
  // Stryker's perTest coverage instrumentation its migration-runner-heavy
  // fixture exceeds even a 120s per-test timeout on 4-vCPU CI runners
  // (hardening attempts 3-5, 2026-06-11). It still runs in test/test:int
  // gates. R18 follow-up: profile the instrumented fixture cost.
  include: [
    'test/unit/**/*.spec.ts',
    'test/integration/**/*.spec.ts',
    '!test/integration/data.module.spec.ts',
  ],
  coverageThreshold: { statements: 0, branches: 0, functions: 0, lines: 0 },
  singleThread: true,
  patchDrizzle: true,
  alias: {
    '@stynx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx/data': resolve(__dirname, 'src/index.ts'),
  },
});
