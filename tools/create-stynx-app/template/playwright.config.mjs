export default {
  testDir: './test/e2e',
  use: {
    baseURL: 'http://127.0.0.1:4200',
  },
  webServer: {
    command: 'pnpm start -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
};
