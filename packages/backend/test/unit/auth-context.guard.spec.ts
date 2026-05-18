import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
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
    const verifier = { verifyAuthorizationHeader: jest.fn(async () => null) };
    const guard = new AuthContextGuard(verifier as never);
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches principal + compatibility user/actor + tenantId on the request', async () => {
    const verifier = {
      verifyAuthorizationHeader: jest.fn(async () => ({ principal: PRINCIPAL })),
    };
    const guard = new AuthContextGuard(verifier as never);
    const request: Record<string, unknown> = { headers: {} };
    await expect(guard.canActivate(ctx(request))).resolves.toBe(true);
    expect(request.principal).toBeDefined();
    expect((request.user as { id: string }).id).toBe('p-1');
    expect((request.actor as { roles: string[] }).roles).toEqual(['admin']);
    expect(request.tenantId).toBe('t-1');
  });

  it('uses tenantResolver when configured and respects its result', async () => {
    const verifier = {
      verifyAuthorizationHeader: jest.fn(async () => ({ principal: PRINCIPAL })),
    };
    const tenantResolver = {
      resolve: jest.fn(async () => 't-resolved'),
    };
    const guard = new AuthContextGuard(verifier as never, undefined, tenantResolver as never);
    const request: Record<string, unknown> = { headers: { 'x-tenant-id': 't-header' } };
    await guard.canActivate(ctx(request));
    expect(tenantResolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ headerTenantId: 't-header' }),
    );
    expect(request.tenantId).toBe('t-resolved');
  });

  it('honors x-tenant-id header when no resolver is configured', async () => {
    const verifier = {
      verifyAuthorizationHeader: jest.fn(async () => ({
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
      verifyAuthorizationHeader: jest.fn(async () => ({ principal: PRINCIPAL })),
    };
    const guard = new AuthContextGuard(verifier as never);
    const request: Record<string, unknown> = { headers: {} };
    await guard.canActivate(ctx(request));
    expect(request.tenantId).toBe('t-1');
  });

  it('leaves tenantId undefined when principal has multiple tenants and no header/resolver', async () => {
    const verifier = {
      verifyAuthorizationHeader: jest.fn(async () => ({
        principal: { ...PRINCIPAL, tenants: ['t-a', 't-b'] },
      })),
    };
    const guard = new AuthContextGuard(verifier as never);
    const request: Record<string, unknown> = { headers: {} };
    await guard.canActivate(ctx(request));
    expect(request.tenantId).toBeUndefined();
  });

  it('throws Forbidden when tenantEntitlementPolicy denies the tenant', async () => {
    const verifier = {
      verifyAuthorizationHeader: jest.fn(async () => ({ principal: PRINCIPAL })),
    };
    const policy = { isEntitled: jest.fn(async () => false) };
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
      verifyAuthorizationHeader: jest.fn(async () => ({ principal: PRINCIPAL })),
    };
    const policy = { isEntitled: jest.fn(async () => true) };
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
      verifyAuthorizationHeader: jest.fn(async () => ({ principal: PRINCIPAL })),
    };
    const mapper = { map: jest.fn(() => ({ ...PRINCIPAL, id: 'mapped' })) };
    const guard = new AuthContextGuard(verifier as never, mapper as never);
    const request: Record<string, unknown> = { headers: {} };
    await guard.canActivate(ctx(request));
    expect(mapper.map).toHaveBeenCalled();
    expect((request.principal as { id: string }).id).toBe('mapped');
  });

  it('accepts array-form authorization header (passed through to verifier)', async () => {
    const verifier = {
      verifyAuthorizationHeader: jest.fn(async () => ({ principal: PRINCIPAL })),
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
      verifyAuthorizationHeader: jest.fn(async () => ({ principal: PRINCIPAL })),
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
