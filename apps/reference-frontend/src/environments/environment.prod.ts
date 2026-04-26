export const environment = {
  production: true,
  apiBaseUrl: 'https://api.example.invalid',
  frontendUrl: 'https://app.example.invalid',
  cognito: {
    region: 'us-east-1',
    userPoolId: 'replace-me',
    clientId: 'replace-me',
    redirectUrl: 'https://app.example.invalid/login/callback',
    logoutUrl: 'https://app.example.invalid/logout',
    scopes: ['openid', 'email', 'profile'],
  },
};
