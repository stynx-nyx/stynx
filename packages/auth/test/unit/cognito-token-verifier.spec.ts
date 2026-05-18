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
});
