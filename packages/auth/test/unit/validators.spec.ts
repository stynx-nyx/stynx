import { createSign, generateKeyPairSync } from 'node:crypto';
import type { ModuleRef } from '@nestjs/core';
import type { Mock } from 'vitest';
import { InvalidCredentialError } from '@stynx-nyx/contracts';
import * as contracts from '@stynx-nyx/contracts';

vi.mock('../../src/utils', async () => {
  const actual = await vi.importActual('../../src/utils');
  return {
    ...actual,
    verifyJwtWithJwk: vi.fn(),
  };
});

import { CognitoJwtValidator, joseLoader } from '../../src/cognito-jwt.validator';
import { StynxJwtValidator } from '../../src/stynx-jwt.validator';
import { base64UrlEncode, decodeJwtClaims, verifyJwtWithJwk } from '../../src/utils';

function usableJwk(kid: string): Record<string, string> {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  return { ...(publicKey.export({ format: 'jwk' }) as Record<string, string>), kid, alg: 'RS256', use: 'sig' };
}

const STRUCTURAL_TOKEN = `${base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64UrlEncode(JSON.stringify({ sub: 'fixture' }))}.signature`;

async function signedStynxToken(privateKey: CryptoKey, kid: string): Promise<string> {
  const { SignJWT } = await import('jose');
  return new SignJWT({ sub: 'user-1', sid: 'sid-1', tenant_id: 'tenant-1' })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer('https://stynx.test')
    .setExpirationTime('1h')
    .sign(privateKey);
}

describe('auth validators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads jose through the default lazy loader', async () => {
    vi.spyOn(joseLoader, 'load').mockRestore();
    await expect(joseLoader.load()).resolves.toMatchObject({
      createRemoteJWKSet: expect.any(Function),
      jwtVerify: expect.any(Function),
    });
  });

  it('classifies definitive STYNX credential failures separately from JWKS configuration failures', async () => {
    const InvalidCredentialError = (contracts as Record<string, unknown>).InvalidCredentialError as (new (message: string) => Error) | undefined;
    expect(InvalidCredentialError).toBeTypeOf('function');
    const noJwks = new StynxJwtValidator({ get: vi.fn(() => undefined) } as unknown as ModuleRef, {
      stynx: { issuer: 'https://stynx.test' }, permissions: { dbFallbackOnRedisDown: true },
    } as never);
    await expect(noJwks.validate(STRUCTURAL_TOKEN)).rejects.not.toBeInstanceOf(InvalidCredentialError!);
    const emptyKeySource = new StynxJwtValidator({ get: vi.fn(() => ({ getJwks: async () => ({ keys: [] }) })) } as unknown as ModuleRef, {
      stynx: { issuer: 'https://stynx.test' }, permissions: { dbFallbackOnRedisDown: true },
    } as never);
    await expect(emptyKeySource.validate(STRUCTURAL_TOKEN)).rejects.not.toBeInstanceOf(InvalidCredentialError!);
  });

  it('treats missing, non-array, empty, and unusable signing-service key sets as infrastructure failures', async () => {
    for (const jwks of [{}, { keys: 'not-an-array' }, { keys: [] }, { keys: [{ kid: 'unusable' }] }]) {
      const validator = new StynxJwtValidator({ get: vi.fn(() => ({ getJwks: async () => jwks })) } as unknown as ModuleRef, {
        stynx: { issuer: 'https://stynx.test' }, permissions: { dbFallbackOnRedisDown: true },
      } as never);
      await expect(validator.validate(STRUCTURAL_TOKEN)).rejects.not.toBeInstanceOf(InvalidCredentialError);
    }
  });

  it('refreshes a stale signing-service key set once so a rotated valid token succeeds, while refresh failure propagates', async () => {
    const { generateKeyPair } = await import('jose');
    const actual = await vi.importActual<typeof import('../../src/utils')>('../../src/utils');
    const old = await generateKeyPair('RS256');
    const fresh = await generateKeyPair('RS256');
    const oldJwk = { ...(await crypto.subtle.exportKey('jwk', old.publicKey)), kid: 'old', alg: 'RS256', use: 'sig' } as Record<string, string>;
    const freshJwk = { ...(await crypto.subtle.exportKey('jwk', fresh.publicKey)), kid: 'fresh', alg: 'RS256', use: 'sig' } as Record<string, string>;
    const verifyMock = verifyJwtWithJwk as Mock;
    verifyMock.mockImplementation((token: string, key: Record<string, string>) => actual.verifyJwtWithJwk(token, key));
    const service = { getJwks: vi.fn().mockResolvedValueOnce({ keys: [oldJwk] }).mockResolvedValueOnce({ keys: [freshJwk] }) };
    const validator = new StynxJwtValidator({ get: vi.fn(() => service) } as unknown as ModuleRef, { stynx: { issuer: 'https://stynx.test' }, permissions: { dbFallbackOnRedisDown: true } } as never);
    await expect(validator.validate(await signedStynxToken(old.privateKey, 'old'))).resolves.toMatchObject({ sub: 'user-1' });
    await expect(validator.validate(await signedStynxToken(fresh.privateKey, 'fresh'))).resolves.toMatchObject({ sub: 'user-1' });
    expect(service.getJwks).toHaveBeenCalledTimes(2);

    const failedRefresh = { getJwks: vi.fn().mockResolvedValueOnce({ keys: [oldJwk] }).mockRejectedValueOnce(new Error('JWKS refresh failed')) };
    const failing = new StynxJwtValidator({ get: vi.fn(() => failedRefresh) } as unknown as ModuleRef, { stynx: { issuer: 'https://stynx.test' }, permissions: { dbFallbackOnRedisDown: true } } as never);
    await expect(failing.validate(await signedStynxToken(old.privateKey, 'old'))).resolves.toMatchObject({ sub: 'user-1' });
    await expect(failing.validate(await signedStynxToken(fresh.privateKey, 'fresh'))).rejects.toThrow('JWKS refresh failed');
  });

  it('classifies a bad signature against a usable RSA JWK as InvalidCredentialError', async () => {
    const { generateKeyPair } = await import('jose');
    const actual = await vi.importActual<typeof import('../../src/utils')>('../../src/utils');
    const pair = await generateKeyPair('RS256');
    const wrong = await generateKeyPair('RS256');
    const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'usable', alg: 'RS256', use: 'sig' } as Record<string, string>;
    (verifyJwtWithJwk as Mock).mockImplementation((token: string, key: Record<string, string>) => actual.verifyJwtWithJwk(token, key));
    const validator = new StynxJwtValidator({ get: vi.fn(() => ({ getJwks: async () => ({ keys: [jwk] }) })) } as unknown as ModuleRef, { stynx: { issuer: 'https://stynx.test' }, permissions: { dbFallbackOnRedisDown: true } } as never);
    await expect(validator.validate(await signedStynxToken(wrong.privateKey, 'wrong'))).rejects.toBeInstanceOf(InvalidCredentialError);
  });

  it('refreshes a stale jwksUri cache once for a rotated valid token', async () => {
    const { generateKeyPair } = await import('jose');
    const actual = await vi.importActual<typeof import('../../src/utils')>('../../src/utils');
    const old = await generateKeyPair('RS256');
    const fresh = await generateKeyPair('RS256');
    const oldJwk = { ...(await crypto.subtle.exportKey('jwk', old.publicKey)), kid: 'old', alg: 'RS256', use: 'sig' } as Record<string, string>;
    const freshJwk = { ...(await crypto.subtle.exportKey('jwk', fresh.publicKey)), kid: 'fresh', alg: 'RS256', use: 'sig' } as Record<string, string>;
    (verifyJwtWithJwk as Mock).mockImplementation((token: string, key: Record<string, string>) => actual.verifyJwtWithJwk(token, key));
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [oldJwk] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [freshJwk] }) });
    try {
      global.fetch = fetchMock as never;
      const validator = new StynxJwtValidator({ get: vi.fn(() => undefined) } as unknown as ModuleRef, { stynx: { issuer: 'https://stynx.test', jwksUri: 'https://jwks.test' }, permissions: { dbFallbackOnRedisDown: true } } as never);
      await expect(validator.validate(await signedStynxToken(old.privateKey, 'old'))).resolves.toMatchObject({ sub: 'user-1' });
      await expect(validator.validate(await signedStynxToken(fresh.privateKey, 'fresh'))).resolves.toMatchObject({ sub: 'user-1' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('propagates a jwksUri forced-refresh failure after warming its cache', async () => {
    const { generateKeyPair } = await import('jose');
    const actual = await vi.importActual<typeof import('../../src/utils')>('../../src/utils');
    const old = await generateKeyPair('RS256');
    const rotated = await generateKeyPair('RS256');
    const oldJwk = { ...(await crypto.subtle.exportKey('jwk', old.publicKey)), kid: 'old', alg: 'RS256', use: 'sig' } as Record<string, string>;
    (verifyJwtWithJwk as Mock).mockImplementation((token: string, key: Record<string, string>) => actual.verifyJwtWithJwk(token, key));
    const failure = new Error('remote JWKS refresh unavailable');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [oldJwk] }) })
      .mockRejectedValueOnce(failure);
    const originalFetch = global.fetch;
    try {
      global.fetch = fetchMock as never;
      const validator = new StynxJwtValidator({ get: vi.fn(() => undefined) } as unknown as ModuleRef, { stynx: { issuer: 'https://stynx.test', jwksUri: 'https://jwks.test' }, permissions: { dbFallbackOnRedisDown: true } } as never);
      await expect(validator.validate(await signedStynxToken(old.privateKey, 'old'))).resolves.toMatchObject({ sub: 'user-1' });
      await expect(validator.validate(await signedStynxToken(rotated.privateKey, 'rotated'))).rejects.toBe(failure);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('coalesces concurrent forced refreshes and suppresses another ambiguous refresh for 30 seconds', async () => {
    const { generateKeyPair } = await import('jose');
    const actual = await vi.importActual<typeof import('../../src/utils')>('../../src/utils');
    const old = await generateKeyPair('RS256');
    const fresh = await generateKeyPair('RS256');
    const unknown = await generateKeyPair('RS256');
    const oldJwk = { ...(await crypto.subtle.exportKey('jwk', old.publicKey)), kid: 'old', alg: 'RS256', use: 'sig' } as Record<string, string>;
    const freshJwk = { ...(await crypto.subtle.exportKey('jwk', fresh.publicKey)), kid: 'fresh', alg: 'RS256', use: 'sig' } as Record<string, string>;
    (verifyJwtWithJwk as Mock).mockImplementation((token: string, key: Record<string, string>) => actual.verifyJwtWithJwk(token, key));
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const service = {
      getJwks: vi.fn()
        .mockResolvedValueOnce({ keys: [oldJwk] })
        .mockImplementation(async () => { await delayed; return { keys: [freshJwk] }; }),
    };
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const validator = new StynxJwtValidator({ get: vi.fn(() => service) } as unknown as ModuleRef, { stynx: { issuer: 'https://stynx.test' }, permissions: { dbFallbackOnRedisDown: true } } as never);
      await validator.validate(await signedStynxToken(old.privateKey, 'old'));
      const freshToken = await signedStynxToken(fresh.privateKey, 'fresh');
      const both = Promise.all([validator.validate(freshToken), validator.validate(freshToken)]);
      await Promise.resolve();
      release();
      await expect(both).resolves.toHaveLength(2);
      expect(service.getJwks).toHaveBeenCalledTimes(2);

      const unknownToken = await signedStynxToken(unknown.privateKey, 'unknown');
      await expect(validator.validate(unknownToken)).rejects.toBeInstanceOf(InvalidCredentialError);
      expect(service.getJwks).toHaveBeenCalledTimes(2);

      now.mockReturnValue(1_030_001);
      const retried = validator.validate(unknownToken);
      await Promise.resolve();
      expect(service.getJwks).toHaveBeenCalledTimes(3);
      release();
      await expect(retried).rejects.toBeInstanceOf(InvalidCredentialError);
    } finally {
      now.mockRestore();
    }
  });

  it('keeps a failed refresh and its suppressed retry as key-source failures', async () => {
    const { generateKeyPair } = await import('jose');
    const actual = await vi.importActual<typeof import('../../src/utils')>('../../src/utils');
    const old = await generateKeyPair('RS256');
    const unknown = await generateKeyPair('RS256');
    const oldJwk = { ...(await crypto.subtle.exportKey('jwk', old.publicKey)), kid: 'old', alg: 'RS256', use: 'sig' } as Record<string, string>;
    (verifyJwtWithJwk as Mock).mockImplementation((token: string, key: Record<string, string>) => actual.verifyJwtWithJwk(token, key));
    const refreshFailure = new Error('JWKS refresh unavailable');
    const service = { getJwks: vi.fn().mockResolvedValueOnce({ keys: [oldJwk] }).mockRejectedValue(refreshFailure) };
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const validator = new StynxJwtValidator({ get: vi.fn(() => service) } as unknown as ModuleRef, { stynx: { issuer: 'https://stynx.test' }, permissions: { dbFallbackOnRedisDown: true } } as never);
      await validator.validate(await signedStynxToken(old.privateKey, 'old'));
      const unknownToken = await signedStynxToken(unknown.privateKey, 'unknown');
      await expect(validator.validate(unknownToken)).rejects.toBe(refreshFailure);
      await expect(validator.validate(unknownToken)).rejects.not.toBeInstanceOf(InvalidCredentialError);
      expect(service.getJwks).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('treats malformed, empty, and unusable jwksUri responses as infrastructure failures', async () => {
    const originalFetch = global.fetch;
    try {
      for (const body of [{}, { keys: 'not-an-array' }, { keys: [] }, { keys: [{ kid: 'unusable' }] }]) {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body }) as never;
        const validator = new StynxJwtValidator({ get: vi.fn(() => undefined) } as unknown as ModuleRef, { stynx: { issuer: 'https://stynx.test', jwksUri: 'https://jwks.test' }, permissions: { dbFallbackOnRedisDown: true } } as never);
        await expect(validator.validate(STRUCTURAL_TOKEN)).rejects.not.toBeInstanceOf(InvalidCredentialError);
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('validates cognito access tokens and authorization headers', async () => {
    const jwtVerify = vi.fn().mockResolvedValue({
      payload: {
        sub: 'user-1',
        email: 'user@example.com',
        token_use: 'access',
        'cognito:username': 'cognito-user',
      },
    });
    vi.spyOn(joseLoader, 'load').mockResolvedValue({
      createRemoteJWKSet: vi.fn(() => 'jwks'),
      jwtVerify,
    } as never);

    const validator = new CognitoJwtValidator({
      cognito: { issuer: 'https://issuer.test', audience: 'client-id' },
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validateAccessToken('token')).resolves.toMatchObject({
      sub: 'user-1',
      email: 'user@example.com',
      username: 'cognito-user',
      tokenUse: 'access',
    });
    await expect(validator.validateAuthorizationHeader('Bearer token')).resolves.toMatchObject({
      sub: 'user-1',
    });
    expect(jwtVerify).toHaveBeenCalledWith('token', 'jwks', {
      issuer: 'https://issuer.test',
      audience: 'client-id',
    });
    await expect(validator.validateAuthorizationHeader(undefined)).rejects.toThrow('Missing bearer token');
  });

  it('accepts bearer header arrays and preserves optional cognito username/email claims', async () => {
    const createRemoteJWKSet = vi.fn(() => 'jwks');
    const jwtVerify = vi.fn().mockResolvedValue({
      payload: {
        sub: 'user-2',
        username: 'preferred-name',
        email: 'user2@example.com',
      },
    });
    vi.spyOn(joseLoader, 'load').mockResolvedValue({
      createRemoteJWKSet,
      jwtVerify,
    } as never);
    const validator = new CognitoJwtValidator({
      cognito: { issuer: 'https://issuer.test' },
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validateAuthorizationHeader(['Bearer token-2'])).resolves.toMatchObject({
      sub: 'user-2',
      username: 'preferred-name',
      email: 'user2@example.com',
    });
    expect(createRemoteJWKSet).toHaveBeenCalledWith(
      new URL('https://issuer.test/.well-known/jwks.json'),
      { cacheMaxAge: 12 * 60 * 60 * 1000 },
    );
    expect(jwtVerify).toHaveBeenCalledWith('token-2', 'jwks', { issuer: 'https://issuer.test' });
  });

  it('trims cognito bearer tokens before validation', async () => {
    const validator = new CognitoJwtValidator({
      cognito: { issuer: 'https://issuer.test' },
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);
    const validateAccessToken = vi.spyOn(validator, 'validateAccessToken').mockResolvedValue({
      sub: 'user-3',
      claims: {},
    });

    await expect(validator.validateAuthorizationHeader('Bearer token-3  ')).resolves.toMatchObject({ sub: 'user-3' });
    expect(validateAccessToken).toHaveBeenCalledWith('token-3');
  });

  it('returns empty cognito sub and omits username when optional identity claims are absent', async () => {
    vi.spyOn(joseLoader, 'load').mockResolvedValue({
      createRemoteJWKSet: vi.fn(() => 'jwks'),
      jwtVerify: vi.fn().mockResolvedValue({ payload: {} }),
    } as never);
    const validator = new CognitoJwtValidator({
      cognito: { issuer: 'https://issuer.test' },
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    const claims = await validator.validateAccessToken('token');

    expect(claims).toMatchObject({ sub: '', claims: {} });
    expect(Object.prototype.hasOwnProperty.call(claims, 'username')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(claims, 'tokenUse')).toBe(false);
  });

  it('rejects invalid cognito token_use values and missing configuration', async () => {
    vi.spyOn(joseLoader, 'load').mockResolvedValue({
      createRemoteJWKSet: vi.fn(() => 'jwks'),
      jwtVerify: vi.fn().mockResolvedValue({
        payload: {
          sub: 'user-1',
          token_use: 'id',
        },
      }),
    } as never);

    const validator = new CognitoJwtValidator({
      cognito: { issuer: 'https://issuer.test' },
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validateAccessToken('token')).rejects.toThrow('Cognito token_use must be access');
    await expect(
      new CognitoJwtValidator({
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      } as never).validateAccessToken('token'),
    ).rejects.toThrow('Cognito auth is not configured');
    await expect(validator.validateAuthorizationHeader('Basic token')).rejects.toThrow('Missing bearer token');
  });

  it('validates stynx jwt claims using the injected signing service and remote jwks fallback', async () => {
    const signingService = {
      getJwks: vi.fn().mockResolvedValue({
        keys: [usableJwk('key-1')],
      }),
    };
    const moduleRef = {
      get: vi.fn(() => signingService),
    } as unknown as ModuleRef;
    const verifyJwtWithJwkMock = verifyJwtWithJwk as Mock;
    verifyJwtWithJwkMock.mockImplementation((_token: string, key: Record<string, unknown>) => {
      if (key.kid === 'key-1') {
        return {
          iss: 'https://stynx.test',
          aud: 'aud-1',
          sub: 'user-1',
          sid: 'sid-1',
          tenant_id: 'tenant-1',
          perms_hash: 'hash-1',
          cognito_sub: 'cognito-1',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60,
        };
      }
      throw new InvalidCredentialError('invalid');
    });

    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test', audience: 'aud-1', jwksUri: 'https://jwks.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({
      sub: 'user-1',
      sid: 'sid-1',
      tenantId: 'tenant-1',
      permsHash: 'hash-1',
      cognitoSub: 'cognito-1',
    });

    verifyJwtWithJwkMock.mockReturnValue({
      iss: 'https://stynx.test',
      aud: 'wrong',
      sub: 'user-1',
      sid: 'sid-1',
      tenant_id: 'tenant-1',
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    await expect(validator.validate(STRUCTURAL_TOKEN)).rejects.toThrow('STYNX token audience mismatch');
  });

  it('falls back to remote jwks and rejects inactive or expired tokens', async () => {
    const moduleRef = {
      get: vi.fn(() => undefined),
    } as unknown as ModuleRef;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [usableJwk('remote')] }),
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as never;

    const verifyJwtWithJwkMock = verifyJwtWithJwk as Mock;
    verifyJwtWithJwkMock.mockReturnValue({
      iss: 'https://stynx.test',
      aud: 'aud-1',
      sub: 'user-1',
      sid: 'sid-1',
      tenant_id: 'tenant-1',
      nbf: Math.floor(Date.now() / 1000) + 60,
      exp: Math.floor(Date.now() / 1000) + 120,
    });

    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test', audience: 'aud-1', jwksUri: 'https://jwks.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate(STRUCTURAL_TOKEN)).rejects.toThrow('STYNX token not active yet');

    verifyJwtWithJwkMock.mockReturnValue({
      iss: 'https://stynx.test',
      aud: 'aud-1',
      sub: 'user-1',
      sid: 'sid-1',
      tenant_id: 'tenant-1',
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    await expect(validator.validate(STRUCTURAL_TOKEN)).rejects.toThrow('STYNX token expired');

    global.fetch = originalFetch;
  });

  it('forces a signing-service key refresh after an initial verification failure', async () => {
    const signingService = {
      getJwks: vi
        .fn()
        .mockResolvedValueOnce({ keys: [usableJwk('stale')] })
        .mockResolvedValueOnce({ keys: [usableJwk('fresh')] }),
    };
    const moduleRef = {
      get: vi.fn(() => signingService),
    } as unknown as ModuleRef;
    const verifyJwtWithJwkMock = verifyJwtWithJwk as Mock;
    verifyJwtWithJwkMock.mockImplementation((_token: string, key: Record<string, unknown>) => {
      if (key.kid === 'fresh') {
        return {
          iss: 'https://stynx.test',
          sub: 'user-1',
          sid: 'sid-1',
          tenant_id: 'tenant-1',
          exp: Math.floor(Date.now() / 1000) + 60,
        };
      }
      throw new InvalidCredentialError('invalid');
    });

    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({ sub: 'user-1' });
    expect(signingService.getJwks).toHaveBeenCalledTimes(2);
  });

  it('tries later jwks keys before refreshing and preserves empty stynx claim defaults', async () => {
    const signingService = {
      getJwks: vi.fn().mockResolvedValue({ keys: [usableJwk('bad'), usableJwk('good')] }),
    };
    const moduleRef = {
      get: vi.fn(() => signingService),
    } as unknown as ModuleRef;
    const verifyJwtWithJwkMock = verifyJwtWithJwk as Mock;
    verifyJwtWithJwkMock.mockImplementation((_token: string, key: Record<string, unknown>) => {
      if (key.kid === 'good') {
        return { iss: 'https://stynx.test' };
      }
      throw new InvalidCredentialError('invalid key');
    });
    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({
      sub: '',
      sid: '',
      tenantId: '',
      claims: { iss: 'https://stynx.test' },
    });
    expect(signingService.getJwks).toHaveBeenCalledTimes(1);
  });

  it('reuses cached jwks until refresh is forced and rejects failed remote jwks loads', async () => {
    const moduleRef = {
      get: vi.fn(() => undefined),
    } as unknown as ModuleRef;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [usableJwk('remote-1')] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as never;

    const verifyJwtWithJwkMock = verifyJwtWithJwk as Mock;
    verifyJwtWithJwkMock.mockImplementation((_token: string, key: Record<string, unknown>) => ({
      iss: 'https://stynx.test',
      aud: 'aud-1',
      sub: String(key.kid),
      sid: 'sid-1',
      tenant_id: 'tenant-1',
      exp: Math.floor(Date.now() / 1000) + 60,
    }));

    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test', audience: 'aud-1', jwksUri: 'https://jwks.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({ sub: 'remote-1' });
    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({ sub: 'remote-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cache = (validator as unknown as { cache?: { expiresAt: number } }).cache;
    if (cache) {
      cache.expiresAt = Date.now() - 1;
    }

    await expect(validator.validate(STRUCTURAL_TOKEN)).rejects.toThrow('Failed to load STYNX JWKS: 503');
    global.fetch = originalFetch;
  });

  it('rejects issuer mismatches and missing jwks configuration for stynx tokens', async () => {
    const moduleRef = {
      get: vi.fn(() => undefined),
    } as unknown as ModuleRef;
    const verifyJwtWithJwkMock = verifyJwtWithJwk as Mock;
    verifyJwtWithJwkMock.mockReturnValue({
      iss: 'https://wrong-issuer.test',
      sub: 'user-1',
      sid: 'sid-1',
      tenant_id: 'tenant-1',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const issuerValidator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test', jwksUri: 'https://jwks.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [usableJwk('remote')] }),
    }) as never;

    await expect(issuerValidator.validate(STRUCTURAL_TOKEN)).rejects.toThrow('STYNX token issuer mismatch');

    const missingJwksValidator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);
    await expect(missingJwksValidator.validate(STRUCTURAL_TOKEN)).rejects.toThrow('No STYNX JWKS source configured');
    global.fetch = originalFetch;
  });

  it('rejects an initial empty key set as a source failure', async () => {
    const signingService = { getJwks: vi.fn().mockResolvedValue({ keys: [] }) };
    const validator = new StynxJwtValidator({ get: vi.fn(() => signingService) } as unknown as ModuleRef, {
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate(STRUCTURAL_TOKEN)).rejects.not.toBeInstanceOf(InvalidCredentialError);
    expect(signingService.getJwks).toHaveBeenCalledTimes(1);
  });

  it('supports tokens without optional stynx claims when the initial key set is usable', async () => {
    const signingService = { getJwks: vi.fn().mockResolvedValue({ keys: [usableJwk('key-optional')] }) };
    const moduleRef = {
      get: vi.fn(() => signingService),
    } as unknown as ModuleRef;
    const verifyJwtWithJwkMock = verifyJwtWithJwk as Mock;
    verifyJwtWithJwkMock.mockReturnValue({
      iss: 'https://stynx.test',
      sub: 'user-optional',
      sid: 'sid-optional',
      tenant_id: 'tenant-optional',
    });
    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({
      sub: 'user-optional',
      sid: 'sid-optional',
      tenantId: 'tenant-optional',
      claims: expect.objectContaining({ sub: 'user-optional' }),
    });
    expect(signingService.getJwks).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid signatures from verifyJwtWithJwk', async () => {
    // Get the un-mocked verifyJwtWithJwk — bypasses the module-level vi.mock.
    const { verifyJwtWithJwk: actualVerifyJwtWithJwk } =
      await vi.importActual<typeof import('../../src/utils')>('../../src/utils');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64UrlEncode(JSON.stringify({ sub: 'user-1' }));
    const signingInput = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(privateKey).toString('base64url');
    const token = `${signingInput}.${signature}`;
    const jwk = publicKey.export({ format: 'jwk' }) as Record<string, string | undefined>;
    const tamperedToken = `${signingInput}.${Buffer.from('tampered-signature', 'utf8').toString('base64url')}`;

    expect(() => decodeJwtClaims(token)).not.toThrow();
    expect(() => actualVerifyJwtWithJwk(tamperedToken, jwk)).toThrow('JWT signature verification failed');
  });

  it('enforces stynx token time boundaries and refreshes expired remote jwks cache', async () => {
    const nowSeconds = 1_800_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowSeconds * 1000);
    const moduleRef = {
      get: vi.fn(() => undefined),
    } as unknown as ModuleRef;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [usableJwk('remote-a')] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [usableJwk('remote-b')] }),
      });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as never;
    const verifyJwtWithJwkMock = verifyJwtWithJwk as Mock;
    verifyJwtWithJwkMock.mockImplementation((_token: string, key: Record<string, unknown>) => ({
      iss: 'https://stynx.test',
      sub: String(key.kid),
      sid: 'sid-1',
      tenant_id: 'tenant-1',
      nbf: nowSeconds + 5,
      exp: nowSeconds + 1,
    }));
    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test', jwksUri: 'https://jwks.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({
      sub: 'remote-a',
      expiresAt: nowSeconds + 1,
    });
    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({ sub: 'remote-a' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    (validator as unknown as { cache: { expiresAt: number } }).cache.expiresAt = Date.now();
    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({ sub: 'remote-b' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    verifyJwtWithJwkMock.mockReturnValue({
      iss: 'https://stynx.test',
      sub: 'expired',
      sid: 'sid-1',
      tenant_id: 'tenant-1',
      exp: nowSeconds,
    });
    await expect(validator.validate(STRUCTURAL_TOKEN)).rejects.toThrow('STYNX token expired');
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('keeps signing-service jwks cached for the full configured lifetime', async () => {
    const startedAt = 5_000_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
    const signingService = {
      getJwks: vi
        .fn()
        .mockResolvedValueOnce({ keys: [usableJwk('cached-a')] })
        .mockResolvedValueOnce({ keys: [usableJwk('cached-b')] }),
    };
    const moduleRef = {
      get: vi.fn(() => signingService),
    } as unknown as ModuleRef;
    const verifyJwtWithJwkMock = verifyJwtWithJwk as Mock;
    verifyJwtWithJwkMock.mockImplementation((_token: string, key: Record<string, unknown>) => ({
      iss: 'https://stynx.test',
      sub: String(key.kid),
      sid: 'sid-1',
      tenant_id: 'tenant-1',
      exp: Math.floor(Date.now() / 1000) + 60,
    }));
    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({ sub: 'cached-a' });
    nowSpy.mockReturnValue(startedAt + (12 * 60 * 60 * 1000) - 1);
    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({ sub: 'cached-a' });
    expect(signingService.getJwks).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(startedAt + (12 * 60 * 60 * 1000) + 1);
    await expect(validator.validate(STRUCTURAL_TOKEN)).resolves.toMatchObject({ sub: 'cached-b' });
    expect(signingService.getJwks).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });
});
