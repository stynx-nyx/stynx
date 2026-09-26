import type { ExecutionContext } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { STYNX_PUBLIC_TENANT_ROUTE } from '@stynx-nyx/contracts';
import * as contracts from '@stynx-nyx/contracts';
import { SessionService } from '@stynx-nyx/sessions';
import { STYNX_PUBLIC_ROUTE, STYNX_READONLY_ROUTE, STYNX_SYSTEM_ROUTE } from '../../src/decorators';
import { StynxAuthGuard } from '../../src/stynx-auth.guard';

function createExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: vi.fn(() => 'handler'),
    getClass: vi.fn(() => 'controller'),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('StynxAuthGuard', () => {
  function createGuard(options: {
    publicRoute?: boolean;
    systemRoute?: boolean;
    readonlyRoute?: boolean;
    publicTenantRoute?: boolean | { optionalAuth?: boolean };
    activeSession?: boolean;
    sessionProvider?: boolean;
  } = {}) {
    const sessionService = {
      get: vi.fn().mockResolvedValue(options.activeSession === false ? null : { sid: 'sid-1' }),
    };
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === SessionService) {
          return options.sessionProvider === false ? undefined : sessionService;
        }
        return undefined;
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
        claims: { scope: 'sample' },
      }),
    };
    const permissionCache = {
      getForSession: vi.fn().mockResolvedValue({
        permissions: ['records:read:*'],
      }),
    };
    const guard = new StynxAuthGuard(moduleRef, reflector as never, validator as never, permissionCache as never);

    return { guard, moduleRef, sessionService, reflector, validator, permissionCache };
  }

  it('allows public and system routes without reading the request', async () => {
    const publicContext = createExecutionContext({});
    const publicGuard = createGuard({ publicRoute: true });
    await expect(publicGuard.guard.canActivate(publicContext)).resolves.toBe(true);
    expect(publicGuard.reflector.getAllAndOverride).toHaveBeenCalledWith(STYNX_PUBLIC_ROUTE, ['handler', 'controller']);

    const systemContext = createExecutionContext({});
    const systemGuard = createGuard({ systemRoute: true });
    await expect(systemGuard.guard.canActivate(systemContext)).resolves.toBe(true);
    expect(systemGuard.reflector.getAllAndOverride).toHaveBeenCalledWith(STYNX_SYSTEM_ROUTE, ['handler', 'controller']);
  });

  it('handles optional public-tenant authentication before the generic public early return', async () => {
    const missing = createGuard({ publicTenantRoute: { optionalAuth: true } });
    const missingRequest = { headers: {} };
    await expect(missing.guard.canActivate(createExecutionContext(missingRequest))).resolves.toBe(true);
    expect(missing.validator.validate).not.toHaveBeenCalled();
    expect(missingRequest).not.toHaveProperty('principal');

    const invalid = createGuard({ publicTenantRoute: { optionalAuth: true } });
    invalid.validator.validate.mockRejectedValueOnce(new Error('invalid signature'));
    const invalidRequest = { headers: { authorization: 'Bearer forged-token' } };
    await expect(invalid.guard.canActivate(createExecutionContext(invalidRequest))).resolves.toBe(true);
    expect(invalidRequest).not.toHaveProperty('stynxClaims');
    expect(invalidRequest).not.toHaveProperty('principal');

    const verified = createGuard({ publicTenantRoute: { optionalAuth: true } });
    const verifiedRequest = { headers: { authorization: 'Bearer verified-token' } };
    await expect(verified.guard.canActivate(createExecutionContext(verifiedRequest))).resolves.toBe(true);
    expect(verified.validator.validate).toHaveBeenCalledWith('verified-token');
    expect(verifiedRequest).toMatchObject({
      stynxClaims: { sub: 'user-1', tenantId: 'tenant-1', sid: 'sid-1' },
      principal: { id: 'user-1' },
    });
  });

  it('fails closed when permission resolution fails after an optional token verifies', async () => {
    const { guard, permissionCache } = createGuard({ publicTenantRoute: { optionalAuth: true } });
    permissionCache.getForSession.mockRejectedValueOnce(new Error('permission cache unavailable'));
    const request = { headers: { authorization: 'Bearer verified-token' } };

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toThrow('permission cache unavailable');
    expect(request).not.toHaveProperty('stynxClaims');
    expect(request).not.toHaveProperty('principal');
  });

  it('uses a nominal identity for a revoked optional session and clears all prior identity fields', async () => {
    const { guard } = createGuard({ publicTenantRoute: { optionalAuth: true }, activeSession: false });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer revoked' },
      stynxClaims: { sub: 'stale' }, principal: { id: 'stale' }, user: { id: 'stale' }, actor: { id: 'stale' },
      tenantId: 'stale-tenant', verifiedSessionId: 'stale-session', verifiedTenantClaim: 'stale-claim',
    };
    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);
    for (const property of ['stynxClaims', 'principal', 'user', 'actor', 'tenantId', 'verifiedSessionId', 'verifiedTenantClaim']) {
      expect(request).not.toHaveProperty(property);
    }
  });

  it('propagates an optional verifier infrastructure failure instead of downgrading it to nominal', async () => {
    const { guard, validator } = createGuard({ publicTenantRoute: { optionalAuth: true } });
    validator.validate.mockRejectedValueOnce(new Error('JWKS endpoint unavailable'));
    await expect(guard.canActivate(createExecutionContext({ headers: { authorization: 'Bearer valid' } }))).rejects.toThrow('JWKS endpoint unavailable');
  });

  it('uses the shared typed credential error and provenance marker only after optional verification', async () => {
    const InvalidCredentialError = (contracts as Record<string, unknown>).InvalidCredentialError as (new (message: string) => Error) | undefined;
    const marker = (contracts as Record<string, unknown>).STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL as symbol | undefined;
    expect(InvalidCredentialError).toBeTypeOf('function');
    expect(typeof marker).toBe('symbol');
    const invalid = createGuard({ publicTenantRoute: { optionalAuth: true } });
    invalid.validator.validate.mockRejectedValueOnce(new InvalidCredentialError!('bad signature'));
    const invalidRequest = { headers: { authorization: 'Bearer invalid' } };
    await expect(invalid.guard.canActivate(createExecutionContext(invalidRequest))).resolves.toBe(true);
    expect(invalidRequest).not.toHaveProperty(marker!);
    const verified = createGuard({ publicTenantRoute: { optionalAuth: true } });
    const verifiedRequest = { headers: { authorization: 'Bearer valid' } };
    await expect(verified.guard.canActivate(createExecutionContext(verifiedRequest))).resolves.toBe(true);
    expect(verifiedRequest).toHaveProperty(marker!, true);
  });

  it('rejects missing bearer tokens and inactive sessions', async () => {
    await expect(createGuard().guard.canActivate(createExecutionContext({ headers: {} }))).rejects.toMatchObject({
      message: 'Missing STYNX bearer token',
    });

    await expect(
      createGuard({ activeSession: false }).guard.canActivate(
        createExecutionContext({ headers: { authorization: 'Bearer token' } }),
      ),
    ).rejects.toThrow('STYNX session is no longer active');
  });

  it('validates bearer tokens, resolves permissions, and writes request principal state', async () => {
    const { guard, validator, permissionCache, sessionService } = createGuard({ readonlyRoute: true });
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
    expect(sessionService.get).toHaveBeenCalledWith('sid-1');
    expect(permissionCache.getForSession).toHaveBeenCalledWith(expect.objectContaining({ sid: 'sid-1' }));
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
        roles: [],
        permissions: ['records:read:*'],
        tenants: ['tenant-1'],
        claims: { scope: 'sample' },
      },
      user: {
        id: 'user-1',
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
    const { guard, validator, permissionCache, sessionService } = createGuard({ sessionProvider: false });
    const response = { setHeader: vi.fn() };
    const request = {
      headers: { authorization: ['Bearer array-token'] },
      response,
    };

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

    expect(validator.validate).toHaveBeenCalledWith('array-token');
    expect(sessionService.get).not.toHaveBeenCalledTimes(1);
    expect(permissionCache.getForSession).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }));
    expect(request).toMatchObject({
      stynxReadonly: false,
      principal: { roles: [], tenants: ['tenant-1'] },
      user: { tenants: ['tenant-1'] },
      actor: { tenants: ['tenant-1'] },
    });
    expect(response.setHeader).toHaveBeenCalledWith('X-Stynx-Auth-Verify-Ms', expect.stringMatching(/^\d+\.\d{3}$/u));
  });
});
