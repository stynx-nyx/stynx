// Unit tests for CognitoTokenVerifier constructor + header validation paths.
//
// verifyAuthorizationHeader uses `await import('jose')` (dynamic) which
// can't be intercepted by jest.mock with the current ts-jest config.
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
