import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { InvalidCredentialError, STYNX_PUBLIC_TENANT_ROUTE, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL } from '@stynx-nyx/contracts';
import * as contracts from '@stynx-nyx/contracts';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';

function ctx(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const PRINCIPAL = {
  id: 'p-1',
  roles: ['admin'],
  permissions: ['doc:read'],
  tenants: ['t-1'],
  claims: { sub: 'p-1' },
  email: 'a@b.test',
  username: 'alice',
};

describe('AuthContextGuard', () => {
  it('throws Unauthorized when verifier returns no principal', async () => {
    const verifier = { verifyAuthorizationHeader: vi.fn(async () => null) };
    const guard = new AuthContextGuard(verifier as never);
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('fails closed when principal mapping fails after an optional public-tenant token verifies', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({ principal: PRINCIPAL })),
    };
    const mapper = { map: vi.fn(() => { throw new Error('principal mapping failed'); }) };
    const reflector = {
      getAllAndOverride: vi.fn((token: symbol) =>
        token === STYNX_PUBLIC_TENANT_ROUTE ? { optionalAuth: true } : undefined,
      ),
    };
    const guard = new AuthContextGuard(
      verifier as never,
      mapper as never,
      undefined,
      undefined,
      reflector as never,
    );
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer verified-token' } };
    const context = {
      getHandler: () => class Handler {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow('principal mapping failed');
    expect(request).not.toHaveProperty('principal');
  });

  it('clears identity seeded before optional authentication when the bearer is absent or invalid', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((token: symbol) =>
        token === STYNX_PUBLIC_TENANT_ROUTE ? { optionalAuth: true } : undefined,
      ),
    };
    for (const [headers, verifier] of [
      [{}, { verifyAuthorizationHeader: vi.fn(async () => null) }],
      [{ authorization: 'Bearer invalid' }, { verifyAuthorizationHeader: vi.fn(async () => { throw new InvalidCredentialError('invalid'); }) }],
    ]) {
      const request: Record<string, unknown> = {
        headers,
        stynxClaims: { sub: 'stale-claim-actor', tenantId: 'stale-claim-tenant', sid: 'stale-claim-session' },
        principal: PRINCIPAL,
        user: { id: 'stale-user' },
        actor: { id: 'stale-actor' },
        tenantId: 'stale-tenant',
        verifiedSessionId: 'stale-session',
        verifiedTenantClaim: 'stale-claim',
        verifiedTenantEntitlement: vi.fn(),
        principalContext: { principal: PRINCIPAL },
      };
      Reflect.set(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL, true);
      const context = {
        getHandler: () => class Handler {},
        getClass: () => class Controller {},
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      const guard = new AuthContextGuard(verifier as never, undefined, undefined, undefined, reflector as never);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      for (const property of ['stynxClaims', 'principal', 'user', 'actor', 'tenantId', 'verifiedSessionId', 'verifiedTenantClaim', 'verifiedTenantEntitlement', 'principalContext']) {
        expect(request).not.toHaveProperty(property);
      }
      expect(Reflect.get(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL)).toBe(undefined);
    }
  });

  it('clears pre-seeded identity and shared provenance for a nonoptional public-tenant route', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((token: symbol) => token === STYNX_PUBLIC_TENANT_ROUTE ? true : undefined),
    };
    const verifier = { verifyAuthorizationHeader: vi.fn() };
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer ignored' },
      stynxClaims: { sub: 'stale' }, principal: PRINCIPAL, user: { id: 'stale' }, actor: { id: 'stale' },
      tenantId: 'stale-tenant', verifiedSessionId: 'stale-session', verifiedTenantClaim: 'stale-claim',
      verifiedTenantEntitlement: vi.fn(), principalContext: { principal: PRINCIPAL },
    };
    Reflect.set(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL, true);
    const context = {
      getHandler: () => class Handler {}, getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const guard = new AuthContextGuard(verifier as never, undefined, undefined, undefined, reflector as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(verifier.verifyAuthorizationHeader).not.toHaveBeenCalled();
    for (const property of ['stynxClaims', 'principal', 'user', 'actor', 'tenantId', 'verifiedSessionId', 'verifiedTenantClaim', 'verifiedTenantEntitlement', 'principalContext']) {
      expect(request).not.toHaveProperty(property);
    }
    expect(Reflect.get(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL)).toBe(undefined);
  });

  it('treats null optional verification as nominal but fails closed for undefined or malformed results and infrastructure errors', async () => {
    const reflector = { getAllAndOverride: vi.fn((token: symbol) => token === STYNX_PUBLIC_TENANT_ROUTE ? { optionalAuth: true } : undefined) };
    const context = {
      getHandler: () => class Handler {}, getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer token' } }) }),
    } as unknown as ExecutionContext;
    await expect(new AuthContextGuard({ verifyAuthorizationHeader: async () => null } as never, undefined, undefined, undefined, reflector as never).canActivate(context)).resolves.toBe(true);
    for (const verifier of [
      { verifyAuthorizationHeader: async () => undefined },
      { verifyAuthorizationHeader: async () => ({}) },
      { verifyAuthorizationHeader: async () => { throw new Error('JWKS unavailable'); } },
    ]) {
      await expect(new AuthContextGuard(verifier as never, undefined, undefined, undefined, reflector as never).canActivate(context)).rejects.toThrow();
    }
  });

  it('uses the contracts provenance marker only for a verified optional principal', async () => {
    const marker = (contracts as Record<string, unknown>).STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL as symbol | undefined;
    expect(typeof marker).toBe('symbol');
    const reflector = { getAllAndOverride: vi.fn((token: symbol) => token === STYNX_PUBLIC_TENANT_ROUTE ? { optionalAuth: true } : undefined) };
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer verified' } };
    const context = { getHandler: () => class Handler {}, getClass: () => class Controller {}, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    await expect(new AuthContextGuard({ verifyAuthorizationHeader: async () => ({ principal: PRINCIPAL }) } as never, undefined, undefined, undefined, reflector as never).canActivate(context)).resolves.toBe(true);
    expect(Reflect.get(request, marker!)).toBe(true);
  });

  it('attaches principal + compatibility user/actor + tenantId on the request', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({ principal: PRINCIPAL })),
    };
    const guard = new AuthContextGuard(verifier as never);
    const request: Record<string, unknown> = { headers: {} };
    await expect(guard.canActivate(ctx(request))).resolves.toBe(true);
    expect(request.principal).toEqual(expect.anything());
    expect((request.user as { id: string }).id).toBe('p-1');
    expect((request.actor as { roles: string[] }).roles).toEqual(['admin']);
    expect(request.tenantId).toBe('t-1');
  });

  it('uses tenantResolver when configured and respects its result', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({ principal: PRINCIPAL })),
    };
    const tenantResolver = {
      resolve: vi.fn(async () => 't-resolved'),
    };
    const guard = new AuthContextGuard(verifier as never, undefined, tenantResolver as never);
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': 't-header', host: 'a.portal.test' },
      originalUrl: '/portal/records?view=current',
    };
    await guard.canActivate(ctx(request));
    expect(tenantResolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        headerTenantId: 't-header',
        host: 'a.portal.test',
        path: '/portal/records',
      }),
    );
    expect(request.tenantId).toBe('t-resolved');
  });

  it('honors x-tenant-id header when no resolver is configured', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({
        principal: { ...PRINCIPAL, tenants: ['t-1', 't-2'] },
      })),
    };
    const guard = new AuthContextGuard(verifier as never);
    const request: Record<string, unknown> = { headers: { 'x-tenant-id': 't-header' } };
    await guard.canActivate(ctx(request));
    expect(request.tenantId).toBe('t-header');
  });

  it('selects the single principal tenant when no header and resolver absent', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({ principal: PRINCIPAL })),
    };
    const guard = new AuthContextGuard(verifier as never);
    const request: Record<string, unknown> = { headers: {} };
    await guard.canActivate(ctx(request));
    expect(request.tenantId).toBe('t-1');
  });

  it('leaves tenantId undefined when principal has multiple tenants and no header/resolver', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({
        principal: { ...PRINCIPAL, tenants: ['t-a', 't-b'] },
      })),
    };
    const guard = new AuthContextGuard(verifier as never);
    const request: Record<string, unknown> = { headers: {} };
    await guard.canActivate(ctx(request));
    expect(request.tenantId).toBe(undefined);
  });

  it('throws Forbidden when tenantEntitlementPolicy denies the tenant', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({ principal: PRINCIPAL })),
    };
    const policy = { isEntitled: vi.fn(async () => false) };
    const guard = new AuthContextGuard(
      verifier as never,
      undefined,
      undefined,
      policy as never,
    );
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('passes through when tenantEntitlementPolicy approves', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({ principal: PRINCIPAL })),
    };
    const policy = { isEntitled: vi.fn(async () => true) };
    const guard = new AuthContextGuard(
      verifier as never,
      undefined,
      undefined,
      policy as never,
    );
    const request: Record<string, unknown> = { headers: {} };
    await expect(guard.canActivate(ctx(request))).resolves.toBe(true);
    expect(request.tenantId).toBe('t-1');
  });

  it('honors a custom principalMapper when provided', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({ principal: PRINCIPAL })),
    };
    const mapper = { map: vi.fn(() => ({ ...PRINCIPAL, id: 'mapped' })) };
    const guard = new AuthContextGuard(verifier as never, mapper as never);
    const request: Record<string, unknown> = { headers: {} };
    await guard.canActivate(ctx(request));
    expect(mapper.map).toHaveBeenCalledTimes(1);
    expect((request.principal as { id: string }).id).toBe('mapped');
  });

  it('accepts array-form authorization header (passed through to verifier)', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({ principal: PRINCIPAL })),
    };
    const guard = new AuthContextGuard(verifier as never);
    const request: Record<string, unknown> = {
      headers: { authorization: ['Bearer one', 'Bearer two'] },
    };
    await guard.canActivate(ctx(request));
    expect(verifier.verifyAuthorizationHeader).toHaveBeenCalledWith([
      'Bearer one',
      'Bearer two',
    ]);
  });

  it('preserves correlationId in principalContext when present', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({ principal: PRINCIPAL })),
    };
    const guard = new AuthContextGuard(verifier as never);
    const request: Record<string, unknown> = {
      headers: {},
      correlationId: 'corr-99',
    };
    await guard.canActivate(ctx(request));
    expect((request.principalContext as { correlationId: string }).correlationId).toBe('corr-99');
  });
});
