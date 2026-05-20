export const environment = {
  production: true,
  apiBaseUrl: 'http://127.0.0.1:3000',
  appBaseUrl: 'http://127.0.0.1:3100',
  oidcBaseUrl: 'http://127.0.0.1:3200',
  useRealOidc: process.env.PLAYWRIGHT_USE_REAL_OIDC === '1',
};
