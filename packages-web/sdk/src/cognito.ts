export interface CognitoLoginUrlOptions {
  domain: string;
  clientId: string;
  redirectUri: string;
  responseType?: 'token' | 'code';
  scopes?: string[];
  identityProvider?: string;
}

const trimProtocol = (value: string): string => value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

export const buildCognitoHostedUiLoginUrl = (options: CognitoLoginUrlOptions): string => {
  const protocolDomain = `https://${trimProtocol(options.domain)}`;
  const params = new URLSearchParams({
    client_id: options.clientId,
    response_type: options.responseType ?? 'token',
    redirect_uri: options.redirectUri,
    scope: (options.scopes ?? ['openid', 'email', 'profile']).join(' '),
  });

  if (options.identityProvider) {
    params.set('identity_provider', options.identityProvider);
  }

  return `${protocolDomain}/login?${params.toString()}`;
};
