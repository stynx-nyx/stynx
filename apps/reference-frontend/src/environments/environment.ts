export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
  frontendUrl: 'http://localhost:4200',
  cognito: {
    region: 'us-east-1',
    userPoolId: 'replace-me',
    clientId: 'replace-me',
    redirectUrl: 'http://localhost:4200/login/callback',
    logoutUrl: 'http://localhost:4200/logout',
    scopes: ['openid', 'email', 'profile'],
  },
};
