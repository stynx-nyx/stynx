import {
  BrowserLocalStorageTokenStore,
  FrontendSessionManager,
  buildCognitoHostedUiLoginUrl,
} from '@stech/stynx-frontend-client';

import { environment } from '../environments/environment';

const resolveCognitoDomain = (): string => {
  const config = environment.cognito as {
    domain?: string;
    userPoolId?: string;
    region?: string;
  };

  if (config.domain) {
    return config.domain;
  }
  if (config.userPoolId && config.region) {
    return `${config.userPoolId}.auth.${config.region}.amazoncognito.com`;
  }
  return 'example.auth.us-east-1.amazoncognito.com';
};

const render = (): void => {
  const root = document.getElementById('app');
  if (!root) {
    return;
  }

  const tokenStore = new BrowserLocalStorageTokenStore('stynx.reference.tokens');
  const manager = new FrontendSessionManager(tokenStore);
  const state = manager.hydrate();

  const loginUrl = buildCognitoHostedUiLoginUrl({
    domain: resolveCognitoDomain(),
    clientId: environment.cognito.clientId,
    redirectUri: (environment.cognito as { redirectUrl?: string; redirectUri?: string }).redirectUrl
      ?? (environment.cognito as { redirectUrl?: string; redirectUri?: string }).redirectUri
      ?? `${window.location.origin}/login/callback`,
    scopes: (environment.cognito as { scopes?: string[] }).scopes ?? ['openid', 'email', 'profile'],
    responseType: 'token',
  });

  root.innerHTML = `
    <section>
      <h1>stynx Reference Frontend (Static)</h1>
      <p>This static build exists for bootstrap S3/CloudFront deployment validation.</p>
      <p><strong>API base:</strong> ${environment.apiBaseUrl}</p>
      <p><strong>Preferred tenant:</strong> ${manager.getTenantId() ?? '(none)'}</p>
      <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <h2>Hydrated Principal</h2>
      <pre>${JSON.stringify(state.principal, null, 2)}</pre>
    </section>
  `;
};

render();
