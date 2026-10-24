// INV-RBAC-001 / S-12 (SM-14): the guard authorizes from verified-token claims only.
const redisCreateClient = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('Redis client created on the request path');
  }),
);
vi.mock('redis', () => ({ createClient: redisCreateClient }));

import { generateKeyPairSync, sign as signData, type KeyObject } from 'node:crypto';
import {
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { InvalidCredentialError, STYNX_PUBLIC_TENANT_ROUTE } from '@stynx-nyx/contracts';
import * as contracts from '@stynx-nyx/contracts';
import { Database } from '@stynx-nyx/data';
import {
  SessionJwtSigningService,
  SessionRevocationList,
  SessionService,
  resolveSessionsOptions,
  type SessionRecord,
  type SessionStore,
} from '@stynx-nyx/sessions';
import { PermissionCache } from '../../src/permission-cache.js';
import { PermissionQueryService } from '../../src/permission-query.service.js';
import { STYNX_PERMISSION_CACHE_BACKEND } from '../../src/tokens.js';
import { STYNX_PUBLIC_ROUTE, STYNX_READONLY_ROUTE, STYNX_SYSTEM_ROUTE } from '../../src/decorators.js';
import { StynxAuthGuard } from '../../src/stynx-auth.guard.js';
import { StynxJwtValidator } from '../../src/stynx-jwt.validator.js';
import { hasVerifiedPrincipal, markVerifiedPrincipal } from '../../src/verified-principal.js';

function createExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: vi.fn(() => 'handler'),
    getClass: vi.fn(() => 'controller'),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

/** Records and refuses any session, database, cache or Redis access. */
function requestPathTraps() {
  const attempts: string[] = [];
  const trap = (name: string) =>
    new Proxy(
      {},
      {
        get(_target, property) {
          if (property === 'then') return undefined;
          attempts.push(`${name}.${String(property)}`);
          throw new Error(`${name}.${String(property)} used on the request path`);
        },
      },
    );
  const traps = new Map<unknown, unknown>([
    [SessionService, trap('SessionService')],
    [Database, trap('Database')],
    [PermissionCache, trap('PermissionCache')],
    [PermissionQueryService, trap('PermissionQueryService')],
    [STYNX_PERMISSION_CACHE_BACKEND, trap('PermissionCacheBackend')],
  ]);
  return { attempts, traps, trap };
}

function futureExp(seconds = 300): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

describe('StynxAuthGuard', () => {
  function createGuard(
    options: {
      publicRoute?: boolean;
      systemRoute?: boolean;
      readonlyRoute?: boolean;
      publicTenantRoute?: boolean | { optionalAuth?: boolean };
      revokedSession?: boolean;
      revocationProvider?: boolean;
    } = {},
  ) {
    const { attempts, traps } = requestPathTraps();
    const revocations = new SessionRevocationList();
    if (options.revokedSession) revocations.add('sid-1');
    vi.spyOn(revocations, 'isRevoked');
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === SessionRevocationList) {
          if (options.revocationProvider === false) throw new Error('Nest: unknown provider');
          return revocations;
        }
        // Session and permission providers exist, but reading them on the request path fails.
        return traps.get(token);
      }),
    } as unknown as ModuleRef;
    const reflector = {
      getAllAndOverride: vi.fn((key: symbol) => {
        if (key === STYNX_PUBLIC_ROUTE) return Boolean(options.publicRoute);
        if (key === STYNX_PUBLIC_TENANT_ROUTE) return options.publicTenantRoute ?? false;
        if (key === STYNX_SYSTEM_ROUTE) return Boolean(options.systemRoute);
        if (key === STYNX_READONLY_ROUTE) return Boolean(options.readonlyRoute);
        return false;
      }),
    };
    const validator = {
      validate: vi.fn().mockResolvedValue({
        sid: 'sid-1',
        sub: 'user-1',
        tenantId: 'tenant-1',
        permissions: ['records:read:*'],
        roles: ['records-reader'],
        expiresAt: futureExp(),
        claims: { scope: 'sample' },
      }),
    };
    const guard = new StynxAuthGuard(moduleRef, reflector as never, validator as never);

    return { guard, moduleRef, revocations, reflector, validator, attempts };
  }

  afterEach(() => {
    expect(redisCreateClient).not.toHaveBeenCalled();
  });

  it('allows public and system routes without reading the request', async () => {
    const publicContext = createExecutionContext({});
    const publicGuard = createGuard({ publicRoute: true });
    await expect(publicGuard.guard.canActivate(publicContext)).resolves.toBe(true);
    expect(publicGuard.reflector.getAllAndOverride).toHaveBeenCalledWith(STYNX_PUBLIC_ROUTE, [
      'handler',
      'controller',
    ]);

    const systemContext = createExecutionContext({});
    const systemGuard = createGuard({ systemRoute: true });
    await expect(systemGuard.guard.canActivate(systemContext)).resolves.toBe(true);
    expect(systemGuard.reflector.getAllAndOverride).toHaveBeenCalledWith(STYNX_SYSTEM_ROUTE, [
      'handler',
      'controller',
    ]);
  });

  it('handles optional public-tenant authentication before the generic public early return', async () => {
    const missing = createGuard({ publicTenantRoute: { optionalAuth: true } });
    const missingRequest = { headers: {} };
    await expect(missing.guard.canActivate(createExecutionContext(missingRequest))).resolves.toBe(
      true,
    );
    expect(missing.validator.validate).not.toHaveBeenCalled();
    expect(missingRequest).not.toHaveProperty('principal');

    const invalid = createGuard({ publicTenantRoute: { optionalAuth: true } });
    invalid.validator.validate.mockRejectedValueOnce(
      new InvalidCredentialError('invalid signature'),
    );
    const invalidRequest = { headers: { authorization: 'Bearer forged-token' } };
    await expect(invalid.guard.canActivate(createExecutionContext(invalidRequest))).resolves.toBe(
      true,
    );
    expect(invalidRequest).not.toHaveProperty('stynxClaims');
    expect(invalidRequest).not.toHaveProperty('principal');

    const verified = createGuard({ publicTenantRoute: { optionalAuth: true } });
    const verifiedRequest = { headers: { authorization: 'Bearer verified-token' } };
    await expect(verified.guard.canActivate(createExecutionContext(verifiedRequest))).resolves.toBe(
      true,
    );
    expect(verified.validator.validate).toHaveBeenCalledWith('verified-token');
    expect(verifiedRequest).toMatchObject({
      stynxClaims: { sub: 'user-1', tenantId: 'tenant-1', sid: 'sid-1' },
      principal: { id: 'user-1' },
    });
  });

  it('fails closed when an optional verified token carries no permission claim', async () => {
    const { guard, validator, attempts } = createGuard({ publicTenantRoute: { optionalAuth: true } });
    validator.validate.mockResolvedValueOnce({
      sid: 'sid-1',
      sub: 'user-1',
      tenantId: 'tenant-1',
      roles: [],
      expiresAt: futureExp(),
      claims: {},
    });
    const request = { headers: { authorization: 'Bearer verified-token' } };

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request).not.toHaveProperty('stynxClaims');
    expect(request).not.toHaveProperty('principal');
    expect(attempts).toEqual([]);
  });

  it('denies verified claims whose exp has already passed, even from a lenient validator', async () => {
    const { guard, validator, attempts } = createGuard();
    validator.validate.mockResolvedValueOnce({
      sid: 'sid-1',
      sub: 'user-1',
      tenantId: 'tenant-1',
      permissions: ['records:read:*'],
      roles: [],
      expiresAt: Math.floor(Date.now() / 1000) - 1,
      claims: {},
    });
    const request = { headers: { authorization: 'Bearer stale-token' } };
    await expect(guard.canActivate(createExecutionContext(request))).rejects.toThrow(
      new UnauthorizedException('STYNX bearer token has expired'),
    );
    expect(request).not.toHaveProperty('principal');
    expect(attempts).toEqual([]);
  });

  it('fails closed when the revocation list is stale after an optional token verifies', async () => {
    const { guard, revocations } = createGuard({ publicTenantRoute: { optionalAuth: true } });
    vi.spyOn(revocations, 'isStale').mockReturnValue(true);
    const request = { headers: { authorization: 'Bearer verified-token' } };

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(request).not.toHaveProperty('stynxClaims');
    expect(request).not.toHaveProperty('principal');
  });

  it('uses a nominal identity for a revoked optional session and clears all prior identity fields', async () => {
    const { guard, attempts } = createGuard({
      publicTenantRoute: { optionalAuth: true },
      revokedSession: true,
    });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer revoked' },
      stynxClaims: { sub: 'stale' },
      principal: { id: 'stale' },
      user: { id: 'stale' },
      actor: { id: 'stale' },
      tenantId: 'stale-tenant',
      verifiedSessionId: 'stale-session',
      verifiedTenantClaim: 'stale-claim',
    };
    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);
    for (const property of [
      'stynxClaims',
      'principal',
      'user',
      'actor',
      'tenantId',
      'verifiedSessionId',
      'verifiedTenantClaim',
    ]) {
      expect(request).not.toHaveProperty(property);
    }
    const marker = (contracts as Record<string, unknown>)
      .STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL as symbol;
    expect(Reflect.get(request, marker)).toBe(undefined);
    expect(attempts).toEqual([]);
  });

  it('clears pre-seeded identity, entitlement, and verification provenance on nominal and nonoptional public-tenant branches', async () => {
    const marker = (contracts as Record<string, unknown>)
      .STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL as symbol;
    const cases: Array<{
      options: Parameters<typeof createGuard>[0];
      headers: Record<string, string>;
      invalidate?: boolean;
    }> = [
      { options: { publicTenantRoute: { optionalAuth: true } }, headers: {} },
      {
        options: { publicTenantRoute: { optionalAuth: true } },
        headers: { authorization: 'Bearer invalid' },
        invalidate: true,
      },
      { options: { publicTenantRoute: true }, headers: { authorization: 'Bearer ignored' } },
    ];

    for (const testCase of cases) {
      const { guard, validator } = createGuard(testCase.options);
      if (testCase.invalidate)
        validator.validate.mockRejectedValueOnce(new InvalidCredentialError('invalid'));
      const request: Record<string | symbol, unknown> = {
        headers: testCase.headers,
        stynxClaims: { sub: 'stale' },
        principal: { id: 'stale' },
        user: { id: 'stale' },
        actor: { id: 'stale' },
        tenantId: 'stale-tenant',
        verifiedSessionId: 'stale-session',
        verifiedTenantClaim: 'stale-claim',
        verifiedTenantEntitlement: { tenantId: 'stale-tenant' },
        principalContext: { stale: true },
      };
      Reflect.set(request, marker, true);
      markVerifiedPrincipal(request);

      await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

      for (const property of [
        'stynxClaims',
        'principal',
        'user',
        'actor',
        'tenantId',
        'verifiedSessionId',
        'verifiedTenantClaim',
        'verifiedTenantEntitlement',
        'principalContext',
      ]) {
        expect(request).not.toHaveProperty(property);
      }
      expect(Reflect.get(request, marker)).toBe(undefined);
      expect(hasVerifiedPrincipal(request)).toBe(false);
    }
  });

  it('propagates an empty actual STYNX JWKS for an optional bearer instead of treating it as nominal', async () => {
    const validator = new StynxJwtValidator(
      {
        get: vi.fn((token: unknown) =>
          token === SessionJwtSigningService ? { getJwks: async () => ({ keys: [] }) } : undefined,
        ),
      } as unknown as ModuleRef,
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      } as never,
    );
    const { moduleRef, reflector } = createGuard({
      publicTenantRoute: { optionalAuth: true },
    });
    const guard = new StynxAuthGuard(moduleRef, reflector as never, validator);
    const token = [
      'eyJhbGciOiJSUzI1NiIsImtpZCI6Im1pc3NpbmcifQ',
      'eyJpc3MiOiJodHRwczovL3N0eW54LnRlc3QiLCJzdWIiOiJ1c2VyLTEiLCJzaWQiOiJzaWQtMSIsInRlbmFudF9pZCI6InRlbmFudC0xIn0',
      'signature',
    ].join('.');

    await expect(
      guard.canActivate(createExecutionContext({ headers: { authorization: `Bearer ${token}` } })),
    ).rejects.not.toBeInstanceOf(InvalidCredentialError);
  });

  it('propagates an optional verifier infrastructure failure instead of downgrading it to nominal', async () => {
    const { guard, validator } = createGuard({ publicTenantRoute: { optionalAuth: true } });
    validator.validate.mockRejectedValueOnce(new Error('JWKS endpoint unavailable'));
    await expect(
      guard.canActivate(createExecutionContext({ headers: { authorization: 'Bearer valid' } })),
    ).rejects.toThrow('JWKS endpoint unavailable');
  });

  it('uses the shared typed credential error and provenance marker only after optional verification', async () => {
    const InvalidCredentialError = (contracts as Record<string, unknown>).InvalidCredentialError as
      (new (message: string) => Error) | undefined;
    const marker = (contracts as Record<string, unknown>).STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL as
      symbol | undefined;
    expect(InvalidCredentialError).toBeTypeOf('function');
    expect(typeof marker).toBe('symbol');
    const invalid = createGuard({ publicTenantRoute: { optionalAuth: true } });
    invalid.validator.validate.mockRejectedValueOnce(new InvalidCredentialError!('bad signature'));
    const invalidRequest = { headers: { authorization: 'Bearer invalid' } };
    await expect(invalid.guard.canActivate(createExecutionContext(invalidRequest))).resolves.toBe(
      true,
    );
    expect(Reflect.get(invalidRequest, marker!)).toBe(undefined);
    const verified = createGuard({ publicTenantRoute: { optionalAuth: true } });
    const verifiedRequest = { headers: { authorization: 'Bearer valid' } };
    await expect(verified.guard.canActivate(createExecutionContext(verifiedRequest))).resolves.toBe(
      true,
    );
    expect(Reflect.get(verifiedRequest, marker!)).toBe(true);
  });

  it('rejects missing bearer tokens and inactive sessions', async () => {
    await expect(
      createGuard().guard.canActivate(createExecutionContext({ headers: {} })),
    ).rejects.toMatchObject({
      message: 'Missing STYNX bearer token',
    });

    const revoked = createGuard({ revokedSession: true });
    await expect(
      revoked.guard.canActivate(
        createExecutionContext({ headers: { authorization: 'Bearer token' } }),
      ),
    ).rejects.toThrow('STYNX session is no longer active');
    expect(revoked.attempts).toEqual([]);
  });

  it('validates bearer tokens, resolves permissions, and writes request principal state', async () => {
    const { guard, validator, revocations, attempts } = createGuard({
      readonlyRoute: true,
    });
    const response = { setHeader: vi.fn() };
    const request = {
      headers: { authorization: 'Bearer token-with-trailing-space  ' },
      res: response,
    };
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(112.345);

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

    expect(validator.validate).toHaveBeenCalledWith('token-with-trailing-space');
    // Revocation is an in-memory check; permissions come from the verified claims.
    expect(revocations.isRevoked).toHaveBeenCalledWith('sid-1');
    expect(attempts).toEqual([]);
    expect(request).toMatchObject({
      stynxClaims: {
        sid: 'sid-1',
        sub: 'user-1',
        tenantId: 'tenant-1',
      },
      tenantId: 'tenant-1',
      stynxReadonly: true,
      principal: {
        id: 'user-1',
        roles: ['records-reader'],
        permissions: ['records:read:*'],
        tenants: ['tenant-1'],
        claims: { scope: 'sample' },
      },
      user: {
        id: 'user-1',
        roles: ['records-reader'],
        permissions: ['records:read:*'],
        tenants: ['tenant-1'],
        claims: { scope: 'sample' },
      },
      actor: {
        id: 'user-1',
        permissions: ['records:read:*'],
        tenants: ['tenant-1'],
        claims: { scope: 'sample' },
      },
    });
    expect(response.setHeader).toHaveBeenCalledWith('X-Stynx-Auth-Verify-Ms', '12.345');
    nowSpy.mockRestore();
  });

  it('accepts authorization header arrays and response aliases without a session provider', async () => {
    const { guard, validator, revocations, attempts } = createGuard({
      revocationProvider: false,
    });
    const response = { setHeader: vi.fn() };
    const request = {
      headers: { authorization: ['Bearer array-token'] },
      response,
    };

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

    expect(validator.validate).toHaveBeenCalledWith('array-token');
    expect(revocations.isRevoked).not.toHaveBeenCalled();
    expect(attempts).toEqual([]);
    expect(request).toMatchObject({
      stynxReadonly: false,
      principal: {
        roles: ['records-reader'],
        permissions: ['records:read:*'],
        tenants: ['tenant-1'],
      },
      user: { tenants: ['tenant-1'] },
      actor: { tenants: ['tenant-1'] },
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Stynx-Auth-Verify-Ms',
      expect.stringMatching(/^\d+\.\d{3}$/u),
    );
  });
  it('maps typed protected credential refusals to 401 before session or permission lookup', async () => {
    const f = createGuard();
    f.validator.validate.mockRejectedValueOnce(
      new InvalidCredentialError('invalid protected signature'),
    );
    const result = f.guard.canActivate(
      createExecutionContext({ headers: { authorization: 'Bearer forged' } }),
    );
    await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(f.revocations.isRevoked).not.toHaveBeenCalled();
    expect(f.attempts).toEqual([]);
  });

  it('propagates protected authentication infrastructure failures without relabeling them as credentials', async () => {
    const f = createGuard();
    const infrastructure = new Error('JWKS service unavailable');
    f.validator.validate.mockRejectedValueOnce(infrastructure);
    await expect(
      f.guard.canActivate(
        createExecutionContext({ headers: { authorization: 'Bearer valid-looking' } }),
      ),
    ).rejects.toBe(infrastructure);
    expect(f.revocations.isRevoked).not.toHaveBeenCalled();
    expect(f.attempts).toEqual([]);
  });

  it.each(['roles', 'permissions'])('refuses sparse %s from a verified result (new malformed-boundary requirement)', async (field) => {
    const { guard, validator, attempts, revocations } = createGuard();
    const sparse: string[] = ['valid']; sparse.length = 2;
    validator.validate.mockResolvedValueOnce({ sid: 'sid-1', sub: 'user-1', tenantId: 'tenant-1', roles: ['role'], permissions: ['read'], expiresAt: futureExp(), claims: {}, [field]: sparse });
    await expect(guard.canActivate(createExecutionContext({ headers: { authorization: 'Bearer token' } }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(revocations.isRevoked).not.toHaveBeenCalled(); expect(attempts).toEqual([]);
  });

  it('reads response setter twice during setup and calls the second with its original receiver', async () => {
    const { guard, validator } = createGuard(); const events: string[] = []; const receivers: unknown[] = [];
    const first = vi.fn(); const second = vi.fn(function (this: unknown) { receivers.push(this); events.push('call'); });
    let reads = 0;
    const response = { get setHeader() { events.push('get'); return ++reads === 1 ? first : second; } };
    const claims = { sid: 'sid-1', sub: 'user-1', tenantId: 'tenant-1', roles: [], permissions: [], expiresAt: futureExp(), claims: {} };
    validator.validate.mockImplementationOnce(async () => { events.push('verify'); return claims; });
    await expect(guard.canActivate(createExecutionContext({ headers: { authorization: 'Bearer token' }, res: response }))).resolves.toBe(true);
    expect(events).toEqual(['get', 'get', 'verify', 'call']); expect(receivers).toEqual([response]);
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledExactlyOnceWith('X-Stynx-Auth-Verify-Ms', expect.any(String));
  });

  it.each([false, 0, null, undefined])('keeps falsy response setter %s a no-op', async (setHeader) => {
    const { guard } = createGuard();
    await expect(guard.canActivate(createExecutionContext({ headers: { authorization: 'Bearer token' }, res: { setHeader } }))).resolves.toBe(true);
  });

  it.each([17, true, 'call'])('fails truthy noncallable response setter %s before verification', async (setHeader) => {
    const { guard, validator } = createGuard();
    await expect(guard.canActivate(createExecutionContext({ headers: { authorization: 'Bearer token' }, res: { setHeader } }))).rejects.toBeInstanceOf(TypeError);
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it('propagates second response getter failure before verification', async () => {
    const { guard, validator } = createGuard(); const failure = new Error('setter accessor'); let reads = 0;
    const res = { get setHeader() { if (++reads === 2) throw failure; return () => undefined; } };
    await expect(guard.canActivate(createExecutionContext({ headers: { authorization: 'Bearer token' }, res }))).rejects.toBe(failure);
    expect(reads).toBe(2); expect(validator.validate).not.toHaveBeenCalled();
  });

  it('writes the public flag before a null metadata property failure', async () => {
    const { guard, reflector, validator } = createGuard(); reflector.getAllAndOverride.mockReturnValueOnce(null as never);
    const request = { headers: {} };
    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(TypeError);
    expect(request).toHaveProperty('publicTenantRoute', true); expect(request).not.toHaveProperty('publicTenantOptionalAuth');
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it('retains inherited metadata getter receiver, two reads and flag ordering', async () => {
    const { guard, reflector, validator } = createGuard(); const request = { headers: {} }; const seen: unknown[] = [];
    const prototype = { get optionalAuth() { seen.push(this); expect(request).toHaveProperty('publicTenantRoute', true); return true; } };
    const metadata = Object.create(prototype);
    reflector.getAllAndOverride.mockReturnValueOnce(metadata);
    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);
    expect(seen).toEqual([metadata, metadata]); expect(request).toHaveProperty('publicTenantOptionalAuth', true);
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it.each(['publicTenantRoute', 'publicTenantOptionalAuth'])('preserves strict failed %s assignment', async (field) => {
    const { guard, validator } = createGuard({ publicTenantRoute: true });
    const request = Object.defineProperty({ headers: {} }, field, { value: false, writable: false, configurable: true });
    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(TypeError);
    expect(validator.validate).not.toHaveBeenCalled(); expect(request[field]).toBe(false);
  });

  it.each(['verifiedSessionId', 'verifiedTenantClaim', 'verifiedTenantEntitlement', 'principalContext'])('preserves strict failed stale %s deletion', async (field) => {
    const { guard, validator } = createGuard({ publicTenantRoute: true });
    const request = Object.defineProperty({ headers: {} }, field, { value: 'stale', configurable: false });
    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(TypeError);
    expect(request[field]).toBe('stale'); expect(request).not.toHaveProperty('publicTenantRoute'); expect(validator.validate).not.toHaveBeenCalled();
  });

});


describe('StynxAuthGuard authorizes from verified-token claims only (S-12, SM-14)', () => {
  const issuer = 'https://stynx.sm14.test';
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keySet = {
    currentKid: 'sm14-key',
    keys: [
      {
        kid: 'sm14-key',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
  const signing = new SessionJwtSigningService(
    resolveSessionsOptions({
      issuer,
      redis: { url: 'redis://unused.invalid:6379' },
      jwt: { keySet },
      timeouts: { accessSeconds: 300 },
    }),
  );

  function sessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
    const now = new Date().toISOString();
    return {
      sid: 'sid-sm14',
      userId: 'user-sm14',
      tenantId: 'tenant-sm14',
      cognitoSub: 'cognito-sm14',
      refreshFamilyId: 'family',
      refreshTokenHash: 'hash',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastTouchedAt: now,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      idleExpiresAt: new Date(Date.now() + 1_800_000).toISOString(),
      permissions: ['records:read', 'records:write'],
      roles: ['editor'],
      ...overrides,
    };
  }

  function rawToken(payload: Record<string, unknown>, key: KeyObject | string = privateKey): string {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = `${encode({ alg: 'RS256', kid: 'sm14-key', typ: 'JWT' })}.${encode(payload)}`;
    return `${input}.${signData('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
  }

  function claimsPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const now = Math.floor(Date.now() / 1000);
    return {
      iss: issuer,
      sub: 'user-sm14',
      sid: 'sid-sm14',
      tenant_id: 'tenant-sm14',
      perms: ['records:read'],
      roles: ['viewer'],
      iat: now,
      exp: now + 300,
      ...overrides,
    };
  }

  function harness(options: { store?: SessionStore } = {}) {
    const { attempts, traps } = requestPathTraps();
    const revocations = new SessionRevocationList(
      resolveSessionsOptions({
        issuer,
        redis: { url: 'redis://unused.invalid:6379' },
        jwt: { keySet },
      }),
      options.store,
    );
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === SessionRevocationList) return revocations;
        if (token === SessionJwtSigningService) return signing;
        return traps.get(token);
      }),
    } as unknown as ModuleRef;
    const validator = new StynxJwtValidator(moduleRef, {
      stynx: { issuer },
      permissions: { dbFallbackOnRedisDown: false },
    } as never);
    const reflector = { getAllAndOverride: vi.fn(() => false) };
    const guard = new StynxAuthGuard(moduleRef, reflector as never, validator);
    const run = (authorization?: string) => {
      const request: Record<string, unknown> = {
        headers: authorization ? { authorization } : {},
      };
      return { request, result: guard.canActivate(createExecutionContext(request)) };
    };
    return { attempts, revocations, run };
  }

  const fetchTrap = vi.fn(() => {
    throw new Error('network call on the request path');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchTrap);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    expect(fetchTrap).not.toHaveBeenCalled();
    expect(redisCreateClient).not.toHaveBeenCalled();
  });

  it('allows a token minted with perms and roles and builds the principal from those claims alone', async () => {
    const { attempts, run } = harness();
    const minted = await signing.signAccessToken(sessionRecord(), new Date());
    const { request, result } = run(`Bearer ${minted.token}`);

    await expect(result).resolves.toBe(true);
    expect(request).toMatchObject({
      tenantId: 'tenant-sm14',
      stynxClaims: { sid: 'sid-sm14', permissions: ['records:read', 'records:write'], roles: ['editor'] },
      principal: {
        id: 'user-sm14',
        permissions: ['records:read', 'records:write'],
        roles: ['editor'],
        tenants: ['tenant-sm14'],
      },
    });
    expect(attempts).toEqual([]);
  });

  it('denies missing, expired, forged, foreign-issuer and claim-less tokens without any lookup', async () => {
    const { attempts, run } = harness();
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const legacy = await signing.signAccessToken(
      sessionRecord({ permissions: undefined, roles: undefined }),
      new Date(),
    );
    const expired = await signing.signAccessToken(sessionRecord(), new Date(Date.now() - 3_600_000));
    const denied = [
      undefined,
      'Basic dXNlcjpwYXNz',
      'Bearer not-a-jwt',
      `Bearer ${expired.token}`,
      `Bearer ${legacy.token}`,
      `Bearer ${rawToken(claimsPayload(), other)}`,
      `Bearer ${rawToken(claimsPayload({ iss: 'https://foreign.test' }))}`,
      `Bearer ${rawToken(claimsPayload({ exp: undefined }))}`,
      `Bearer ${rawToken(claimsPayload({ perms: undefined }))}`,
      `Bearer ${rawToken(claimsPayload({ roles: undefined }))}`,
      `Bearer ${rawToken(claimsPayload({ perms: 'records:read' }))}`,
      `Bearer ${rawToken(claimsPayload({ roles: [42] }))}`,
      `Bearer ${rawToken(claimsPayload({ sid: undefined }))}`,
      `Bearer ${rawToken(claimsPayload({ tenant_id: '' }))}`,
    ];
    for (const authorization of denied) {
      const { request, result } = run(authorization);
      await expect(result, String(authorization)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(request).not.toHaveProperty('principal');
      expect(request).not.toHaveProperty('stynxClaims');
    }
    expect(attempts).toEqual([]);
  });

  it('denies a session id on the in-memory revocation list with no I/O', async () => {
    const { attempts, revocations, run } = harness();
    revocations.add('sid-sm14');
    const minted = await signing.signAccessToken(sessionRecord(), new Date());
    const { request, result } = run(`Bearer ${minted.token}`);

    await expect(result).rejects.toThrow(new UnauthorizedException('STYNX session is no longer active'));
    expect(request).not.toHaveProperty('principal');
    expect(attempts).toEqual([]);

    const other = await signing.signAccessToken(sessionRecord({ sid: 'sid-other' }), new Date());
    await expect(run(`Bearer ${other.token}`).result).resolves.toBe(true);
  });

  it('fails closed while a store-backed revocation list is stale, and never reads the store per request', async () => {
    const listRevokedSessions = vi.fn(async () => [{ sid: 'sid-sm14', revokedAt: new Date().toISOString() }]);
    const store = { listRevokedSessions } as unknown as SessionStore;
    const { attempts, revocations, run } = harness({ store });
    const minted = await signing.signAccessToken(sessionRecord({ sid: 'sid-live' }), new Date());

    await expect(run(`Bearer ${minted.token}`).result).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(listRevokedSessions).not.toHaveBeenCalled();

    await revocations.refresh();
    expect(listRevokedSessions).toHaveBeenCalledTimes(1);
    await expect(run(`Bearer ${minted.token}`).result).resolves.toBe(true);
    const revoked = await signing.signAccessToken(sessionRecord(), new Date());
    await expect(run(`Bearer ${revoked.token}`).result).rejects.toBeInstanceOf(UnauthorizedException);
    expect(listRevokedSessions).toHaveBeenCalledTimes(1);
    expect(attempts).toEqual([]);
  });
});
