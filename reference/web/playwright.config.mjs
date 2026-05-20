import { defineConfig } from '@playwright/test';

const useRealOidc = process.env.PLAYWRIGHT_USE_REAL_OIDC === '1';

const ownedCategorySpecs = [
  'auth/**/*.spec.ts',
  'audit/**/*.spec.ts',
  'documents/**/*.spec.ts',
  'flows/**/*.spec.ts',
  'i18n/**/*.spec.ts',
  'iam/**/*.spec.ts',
  'permissions/**/*.spec.ts',
  'profile/**/*.spec.ts',
  'records/**/*.spec.ts',
  'sessions/**/*.spec.ts',
  'smoke/**/*.spec.ts',
  'tenant/**/*.spec.ts',
  'trash/**/*.spec.ts',
  'work-items/**/*.spec.ts',
];

export default defineConfig({
  testDir: './test/e2e',
  globalSetup: './test/e2e/a11y-global-setup.mjs',
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'legacy-api',
      testMatch: ['*.spec.ts'],
    },
    {
      name: 'spa-only',
      testMatch: ownedCategorySpecs,
      grepInvert: /@needs-api/,
    },
    {
      name: 'spa+api',
      testMatch: ['**/*.spec.ts'],
      grep: /@needs-api/,
    },
  ],
  webServer: [
    ...(useRealOidc
      ? [{
          command: 'node scripts/serve-fake-oidc.mjs',
          cwd: new URL('.', import.meta.url).pathname,
          url: 'http://127.0.0.1:3200/readyz',
          reuseExistingServer: true,
          timeout: 30_000,
        }]
      : []),
    {
      command: 'node scripts/serve-reference-api-stack.mjs',
      cwd: new URL('.', import.meta.url).pathname,
      url: 'http://127.0.0.1:3000/readyz',
      reuseExistingServer: true,
      timeout: 300_000,
    },
    {
      command: 'pnpm build:web && PORT=3100 node scripts/serve-static.mjs',
      cwd: new URL('.', import.meta.url).pathname,
      port: 3100,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
