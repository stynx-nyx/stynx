// Unit tests for CognitoTokenVerifier constructor + header validation paths.
//
// verifyAuthorizationHeader uses `await import('jose')` (dynamic) which
// can't be intercepted by vi.mock under the current Vitest config.
// The dynamic-import paths are covered by integration tests against a
// real Cognito (or a local jose-signed JWT). Here we cover:
//   - constructor defaults
//   - constructor overrides
//   - early-throw header-shape validation

import { CognitoTokenVerifier } from '../../src/cognito-token-verifier';

describe('CognitoTokenVerifier — constructor', () => {
  it('defaults jwksUri to <issuer>/.well-known/jwks.json', () => {
    const v = new CognitoTokenVerifier({ issuer: 'https://cognito.example.com/pool' });
    expect((v as unknown as { jwksUri: string }).jwksUri).toBe(
      'https://cognito.example.com/pool/.well-known/jwks.json',
    );
  });

  it('honors explicit jwksUri override', () => {
    const v = new CognitoTokenVerifier({
      issuer: 'https://cognito.example.com/pool',
      jwksUri: 'https://override.example/keys',
    });
    expect((v as unknown as { jwksUri: string }).jwksUri).toBe('https://override.example/keys');
  });

  it('uses default claim names when none provided', () => {
    const v = new CognitoTokenVerifier({ issuer: 'https://i' });
    const priv = v as unknown as {
      roleClaims: string[];
      permissionClaims: string[];
      tenantClaims: string[];
    };
    expect(priv.roleClaims).toEqual(['cognito:groups', 'roles']);
    expect(priv.permissionClaims).toEqual(['permissions']);
    expect(priv.tenantClaims).toEqual(['tenants', 'custom:tenant_id', 'https://stynx.dev/tenant']);
  });

  it('honors custom claim names', () => {
    const v = new CognitoTokenVerifier({
      issuer: 'https://i',
      roleClaims: ['my-roles'],
      permissionClaims: ['my-perms'],
      tenantClaims: ['my-tenant'],
    });
    const priv = v as unknown as {
      roleClaims: string[];
      permissionClaims: string[];
      tenantClaims: string[];
    };
    expect(priv.roleClaims).toEqual(['my-roles']);
    expect(priv.permissionClaims).toEqual(['my-perms']);
    expect(priv.tenantClaims).toEqual(['my-tenant']);
  });
});

describe('CognitoTokenVerifier — header-shape early validation', () => {
  const v = new CognitoTokenVerifier({ issuer: 'https://i' });

  it('throws on undefined header', async () => {
    await expect(v.verifyAuthorizationHeader(undefined)).rejects.toThrow('Missing bearer token');
  });

  it('throws on header without Bearer prefix', async () => {
    await expect(v.verifyAuthorizationHeader('Token abc')).rejects.toThrow('Missing bearer token');
  });

  it('throws on empty array', async () => {
    await expect(v.verifyAuthorizationHeader([])).rejects.toThrow('Missing bearer token');
  });

  it('throws on array whose first element lacks Bearer prefix', async () => {
    await expect(v.verifyAuthorizationHeader(['raw-token'])).rejects.toThrow('Missing bearer token');
  });

  it('verifies a signed bearer token and maps principal metadata', async () => {
    const { SignJWT, generateKeyPair } = await import('jose');
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub: 'subject-1',
      email: 'user@example.test',
      username: 'user-1',
      permissions: ['Records:Read', 'records:read'],
      tenants: ['Tenant-A'],
      roles: ['Admin'],
      token_use: 'access',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://issuer.example.test')
      .setAudience('client-1')
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3_600)
      .sign(privateKey);
    const verifier = new CognitoTokenVerifier({
      issuer: 'https://issuer.example.test',
      audience: 'client-1',
      enforceTokenUse: 'access',
    });
    (verifier as unknown as { jwks: () => Promise<unknown> }).jwks = async () => publicKey;

    await expect(verifier.verifyAuthorizationHeader([`Bearer ${token}`])).resolves.toMatchObject({
      token,
      issuedAt,
      expiresAt: issuedAt + 3_600,
      tokenUse: 'access',
      principal: {
        id: 'subject-1',
        username: 'user-1',
        email: 'user@example.test',
        roles: ['admin'],
        permissions: ['records:read'],
        tenants: ['tenant-a'],
      },
    });
  });

  it('omits optional principal and timestamp metadata when claims are absent', async () => {
    const { SignJWT, generateKeyPair } = await import('jose');
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const token = await new SignJWT({ sub: 'subject-1' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://issuer.example.test')
      .sign(privateKey);
    const verifier = new CognitoTokenVerifier({ issuer: 'https://issuer.example.test' });
    (verifier as unknown as { jwks: () => Promise<unknown> }).jwks = async () => publicKey;

    await expect(verifier.verifyAuthorizationHeader(`Bearer ${token}`)).resolves.toEqual({
      token,
      principal: {
        id: 'subject-1',
        roles: [],
        permissions: [],
        tenants: [],
        claims: expect.objectContaining({ sub: 'subject-1' }),
      },
    });
  });
});

describe('CognitoTokenVerifier — payload branch helpers', () => {
  it('resolves principals, optional profile claims, and de-duplicated authorization claims', () => {
    const v = new CognitoTokenVerifier({
      issuer: 'https://i',
      roleClaims: ['roles', 'groups'],
      permissionClaims: ['permissions'],
      tenantClaims: ['tenants'],
    });
    const privateVerifier = v as unknown as {
      resolvePrincipalId(payload: Record<string, unknown>): string;
      resolveClaims(payload: Record<string, unknown>, claimKeys: string[]): string[];
      readString(payload: Record<string, unknown>, key: string): string | null;
    };

    expect(privateVerifier.resolvePrincipalId({ sub: 'subject-1' })).toBe('subject-1');
    expect(privateVerifier.resolvePrincipalId({ 'cognito:username': ' user-1 ' })).toBe('user-1');
    expect(privateVerifier.resolvePrincipalId({ username: 'user-2' })).toBe('user-2');
    expect(() => privateVerifier.resolvePrincipalId({})).toThrow('Token missing principal identifier');
    expect(privateVerifier.readString({ email: '  ' }, 'email')).toBeNull();
    expect(privateVerifier.readString({ email: 123 }, 'email')).toBeNull();
    expect(privateVerifier.resolveClaims({
      roles: ['Admin', '', 123, 'admin'],
      groups: 'Reviewer',
      permissions: ['Docs:Read', 'docs:read'],
      tenants: undefined,
    }, ['roles', 'groups', 'permissions', 'tenants'])).toEqual(['admin', 'reviewer', 'docs:read']);
  });

  it('accepts audience matches through aud, client_id, or azp and rejects mismatches', () => {
    const v = new CognitoTokenVerifier({ issuer: 'https://i', audience: 'app-1' });
    const privateVerifier = v as unknown as {
      assertAudience(payload: Record<string, unknown>): void;
    };

    expect(() => privateVerifier.assertAudience({ aud: 'app-1' })).not.toThrow();
    expect(() => privateVerifier.assertAudience({ aud: ['other', 'app-1'] })).not.toThrow();
    expect(() => privateVerifier.assertAudience({ client_id: 'app-1' })).not.toThrow();
    expect(() => privateVerifier.assertAudience({ azp: 'app-1' })).not.toThrow();
    expect(() => privateVerifier.assertAudience({ aud: 'other' })).toThrow('Token audience mismatch');
    expect(
      () =>
        (new CognitoTokenVerifier({ issuer: 'https://i' }) as unknown as {
          assertAudience(payload: Record<string, unknown>): void;
        }).assertAudience({ aud: 'other' }),
    ).not.toThrow();
  });

  it('enforces token_use only when configured', () => {
    const loose = new CognitoTokenVerifier({ issuer: 'https://i' }) as unknown as {
      assertTokenUse(payload: Record<string, unknown>): void;
    };
    const strict = new CognitoTokenVerifier({
      issuer: 'https://i',
      enforceTokenUse: 'access',
    }) as unknown as {
      assertTokenUse(payload: Record<string, unknown>): void;
    };

    expect(() => loose.assertTokenUse({ token_use: 'id' })).not.toThrow();
    expect(() => strict.assertTokenUse({ token_use: 'access' })).not.toThrow();
    expect(() => strict.assertTokenUse({ token_use: 'id' })).toThrow('Token use mismatch');
    expect(() => strict.assertTokenUse({})).toThrow('Token use mismatch');
  });

  it('creates and reuses the remote JWKS resolver', async () => {
    const verifier = new CognitoTokenVerifier({
      issuer: 'https://issuer.example.test',
      jwksUri: 'https://issuer.example.test/custom/jwks.json',
    }) as unknown as {
      resolveJwks(): Promise<unknown>;
    };

    const first = await verifier.resolveJwks();
    await expect(verifier.resolveJwks()).resolves.toBe(first);
  });
});
