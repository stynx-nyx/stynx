import { Inject, Injectable } from '@nestjs/common';
import { STYNX_AUTH_OPTIONS } from './tokens';
import { headerToString } from './utils';
import type { CognitoAccessTokenClaims, ResolvedStynxAuthModuleOptions } from './types';

export const joseLoader = {
  load: () => import('jose'),
};

@Injectable()
export class CognitoJwtValidator {
  constructor(
    @Inject(STYNX_AUTH_OPTIONS)
    private readonly authOptions: ResolvedStynxAuthModuleOptions,
  ) {}

  async validateAccessToken(token: string): Promise<CognitoAccessTokenClaims> {
    const options = this.authOptions.cognito;
    if (!options) {
      throw new Error('Cognito auth is not configured');
    }
    const { createRemoteJWKSet, jwtVerify } = await joseLoader.load();
    const jwks = createRemoteJWKSet(
      new URL(options.jwksUri ?? `${options.issuer}/.well-known/jwks.json`),
      { cacheMaxAge: 12 * 60 * 60 * 1000 },
    );
    const verification = await jwtVerify(token, jwks, {
      issuer: options.issuer,
      ...(options.audience ? { audience: options.audience } : {}),
    });
    const payload = verification.payload as Record<string, unknown>;
    const tokenUse = typeof payload.token_use === 'string' ? payload.token_use : undefined;
    if (tokenUse && tokenUse !== 'access') {
      throw new Error('Cognito token_use must be access');
    }

    return {
      sub: String(payload.sub ?? ''),
      ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
      ...(typeof payload.username === 'string'
        ? { username: payload.username }
        : typeof payload['cognito:username'] === 'string'
          ? { username: String(payload['cognito:username']) }
          : {}),
      ...(tokenUse ? { tokenUse } : {}),
      claims: payload,
    };
  }

  async validateAuthorizationHeader(value: string | string[] | undefined): Promise<CognitoAccessTokenClaims> {
    const authorization = headerToString(value);
    if (!authorization?.startsWith('Bearer ')) {
      throw new Error('Missing bearer token');
    }
    return this.validateAccessToken(authorization.slice('Bearer '.length).trim());
  }
}
