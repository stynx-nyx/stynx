import { createSign, generateKeyPairSync } from 'node:crypto';
import type { ModuleRef } from '@nestjs/core';
import type { Mock } from 'vitest';

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

describe('auth validators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        keys: [{ kid: 'key-1' }],
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
      throw new Error('invalid');
    });

    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test', audience: 'aud-1', jwksUri: 'https://jwks.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate('token')).resolves.toMatchObject({
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
    await expect(validator.validate('token')).rejects.toThrow('STYNX token audience mismatch');
  });

  it('falls back to remote jwks and rejects inactive or expired tokens', async () => {
    const moduleRef = {
      get: vi.fn(() => undefined),
    } as unknown as ModuleRef;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [{ kid: 'remote' }] }),
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

    await expect(validator.validate('token')).rejects.toThrow('STYNX token not active yet');

    verifyJwtWithJwkMock.mockReturnValue({
      iss: 'https://stynx.test',
      aud: 'aud-1',
      sub: 'user-1',
      sid: 'sid-1',
      tenant_id: 'tenant-1',
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    await expect(validator.validate('token')).rejects.toThrow('STYNX token expired');

    global.fetch = originalFetch;
  });

  it('forces a signing-service key refresh after an initial verification failure', async () => {
    const signingService = {
      getJwks: vi
        .fn()
        .mockResolvedValueOnce({ keys: [{ kid: 'stale' }] })
        .mockResolvedValueOnce({ keys: [{ kid: 'fresh' }] }),
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
      throw new Error('invalid');
    });

    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate('token')).resolves.toMatchObject({ sub: 'user-1' });
    expect(signingService.getJwks).toHaveBeenCalledTimes(2);
  });

  it('tries later jwks keys before refreshing and preserves empty stynx claim defaults', async () => {
    const signingService = {
      getJwks: vi.fn().mockResolvedValue({ keys: [{ kid: 'bad' }, { kid: 'good' }] }),
    };
    const moduleRef = {
      get: vi.fn(() => signingService),
    } as unknown as ModuleRef;
    const verifyJwtWithJwkMock = verifyJwtWithJwk as Mock;
    verifyJwtWithJwkMock.mockImplementation((_token: string, key: Record<string, unknown>) => {
      if (key.kid === 'good') {
        return { iss: 'https://stynx.test' };
      }
      throw new Error('invalid key');
    });
    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);

    await expect(validator.validate('token')).resolves.toMatchObject({
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
        json: async () => ({ keys: [{ kid: 'remote-1' }] }),
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

    await expect(validator.validate('token-1')).resolves.toMatchObject({ sub: 'remote-1' });
    await expect(validator.validate('token-2')).resolves.toMatchObject({ sub: 'remote-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cache = (validator as unknown as { cache?: { expiresAt: number } }).cache;
    if (cache) {
      cache.expiresAt = Date.now() - 1;
    }

    await expect(validator.validate('token-3')).rejects.toThrow('Failed to load STYNX JWKS: 503');
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
      json: async () => ({ keys: [{ kid: 'remote' }] }),
    }) as never;

    await expect(issuerValidator.validate('token')).rejects.toThrow('STYNX token issuer mismatch');

    const missingJwksValidator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer: 'https://stynx.test' },
      permissions: { dbFallbackOnRedisDown: true },
    } as never);
    await expect(missingJwksValidator.validate('token')).rejects.toThrow('No STYNX JWKS source configured');
    global.fetch = originalFetch;
  });

  it('rejects empty key sets and supports tokens without optional stynx claims', async () => {
    const signingService = {
      getJwks: vi.fn().mockResolvedValueOnce({ keys: [] }).mockResolvedValueOnce({ keys: [{ kid: 'key-optional' }] }),
    };
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

    await expect(validator.validate('token')).resolves.toMatchObject({
      sub: 'user-optional',
      sid: 'sid-optional',
      tenantId: 'tenant-optional',
      claims: expect.objectContaining({ sub: 'user-optional' }),
    });
    expect(signingService.getJwks).toHaveBeenCalledTimes(2);
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
        json: async () => ({ keys: [{ kid: 'remote-a' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [{ kid: 'remote-b' }] }),
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

    await expect(validator.validate('token-a')).resolves.toMatchObject({
      sub: 'remote-a',
      expiresAt: nowSeconds + 1,
    });
    await expect(validator.validate('token-b')).resolves.toMatchObject({ sub: 'remote-a' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    (validator as unknown as { cache: { expiresAt: number } }).cache.expiresAt = Date.now();
    await expect(validator.validate('token-c')).resolves.toMatchObject({ sub: 'remote-b' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    verifyJwtWithJwkMock.mockReturnValue({
      iss: 'https://stynx.test',
      sub: 'expired',
      sid: 'sid-1',
      tenant_id: 'tenant-1',
      exp: nowSeconds,
    });
    await expect(validator.validate('token-expired')).rejects.toThrow('STYNX token expired');
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('keeps signing-service jwks cached for the full configured lifetime', async () => {
    const startedAt = 5_000_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
    const signingService = {
      getJwks: vi
        .fn()
        .mockResolvedValueOnce({ keys: [{ kid: 'cached-a' }] })
        .mockResolvedValueOnce({ keys: [{ kid: 'cached-b' }] }),
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

    await expect(validator.validate('token-a')).resolves.toMatchObject({ sub: 'cached-a' });
    nowSpy.mockReturnValue(startedAt + (12 * 60 * 60 * 1000) - 1);
    await expect(validator.validate('token-b')).resolves.toMatchObject({ sub: 'cached-a' });
    expect(signingService.getJwks).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(startedAt + (12 * 60 * 60 * 1000) + 1);
    await expect(validator.validate('token-c')).resolves.toMatchObject({ sub: 'cached-b' });
    expect(signingService.getJwks).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });
});
