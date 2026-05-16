import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm build:web && node scripts/serve-static.mjs',
    cwd: new URL('.', import.meta.url).pathname,
    port: 3100,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
