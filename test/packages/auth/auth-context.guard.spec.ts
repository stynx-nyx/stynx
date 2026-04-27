import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type {
  AuthVerificationResult,
  TenantEntitlementPolicy,
  TenantResolver,
  TokenVerifier,
} from '@stynx/contracts';
import { AuthContextGuard } from '../../../packages/backend/src/auth/auth-context.guard';

function createExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

const verified: AuthVerificationResult = {
  token: 'token',
  principal: {
    id: 'user-1',
    roles: ['admin'],
    permissions: ['users:read'],
    tenants: ['tenant-a'],
    claims: { email: 'admin@example.com' },
    email: 'admin@example.com',
    username: 'admin',
  },
};

describe('AuthContextGuard', () => {
  it('attaches principal, req.user and request.actor compatibility shapes', async () => {
    const tokenVerifier: TokenVerifier = {
      verifyAuthorizationHeader: jest.fn(async () => verified),
    };
    const guard = new AuthContextGuard(tokenVerifier);
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer token' },
      correlationId: 'corr-1',
    };

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

    expect(request.principal).toMatchObject({
      id: 'user-1',
      roles: ['admin'],
      permissions: ['users:read'],
      tenants: ['tenant-a'],
    });
    expect(request.user).toMatchObject({
      id: 'user-1',
      sub: 'user-1',
      roles: ['admin'],
      permissions: ['users:read'],
      tenants: ['tenant-a'],
    });
    expect(request.actor).toMatchObject({
      id: 'user-1',
      sub: 'user-1',
      roles: ['admin'],
      groups: ['admin'],
    });
    expect(request.tenantId).toBe('tenant-a');
  });

  it('uses tenant resolver and entitlement policy when present', async () => {
    const tokenVerifier: TokenVerifier = {
      verifyAuthorizationHeader: jest.fn(async () => ({
        ...verified,
        principal: {
          ...verified.principal,
          tenants: ['tenant-a', 'tenant-b'],
        },
      })),
    };
    const tenantResolver: TenantResolver = {
      resolve: jest.fn(async () => 'tenant-b'),
    };
    const entitlement: TenantEntitlementPolicy = {
      isEntitled: jest.fn(async ({ tenantId }) => tenantId === 'tenant-b'),
    };

    const guard = new AuthContextGuard(tokenVerifier, undefined, tenantResolver, entitlement);
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer token', 'x-tenant-id': 'tenant-b' },
    };

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);
    expect(request.tenantId).toBe('tenant-b');
    expect(entitlement.isEntitled).toHaveBeenCalled();
  });

  it('throws forbidden when tenant entitlement fails', async () => {
    const tokenVerifier: TokenVerifier = {
      verifyAuthorizationHeader: jest.fn(async () => ({
        ...verified,
        principal: {
          ...verified.principal,
          tenants: ['tenant-a', 'tenant-b'],
        },
      })),
    };
    const tenantResolver: TenantResolver = {
      resolve: jest.fn(async () => 'tenant-b'),
    };
    const entitlement: TenantEntitlementPolicy = {
      isEntitled: jest.fn(async () => false),
    };

    const guard = new AuthContextGuard(tokenVerifier, undefined, tenantResolver, entitlement);
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer token', 'x-tenant-id': 'tenant-b' },
    };

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws unauthorized when verifier returns no principal', async () => {
    const tokenVerifier: TokenVerifier = {
      verifyAuthorizationHeader: jest.fn(async () => ({ token: 'token' } as never)),
    };
    const guard = new AuthContextGuard(tokenVerifier);
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer token' },
    };

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
