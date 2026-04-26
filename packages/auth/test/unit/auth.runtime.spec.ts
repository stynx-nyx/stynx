import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InMemoryPermissionCacheBackend } from '../../src/in-memory-permission-cache-backend';
import { PermissionCacheMetrics } from '../../src/permission-cache-metrics';
import { PermissionGuard } from '../../src/permission.guard';
import { StynxAuthGuard } from '../../src/stynx-auth.guard';
import { ActorContextInterceptor } from '../../src/actor-context.interceptor';
import {
  STYNX_PERMISSION_ROUTE,
  STYNX_PUBLIC_ROUTE,
  STYNX_READONLY_ROUTE,
  STYNX_SYSTEM_ROUTE,
} from '../../src/decorators';
import {
  base64UrlDecode,
  base64UrlEncode,
  computePermissionsHash,
  decodeJwtClaims,
  expandPermissionWildcards,
  headerToString,
} from '../../src/utils';

function createExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => 'handler',
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

describe('auth runtime helpers', () => {
  it('patches actor context only when stynx claims are present', () => {
    const patch = jest.fn();
    const interceptor = new ActorContextInterceptor({ patch } as never);
    const next: CallHandler = {
      handle: jest.fn(() => 'handled'),
    };

    interceptor.intercept(
      createExecutionContext({
        stynxClaims: { tenantId: 'tenant-1', sub: 'user-1', sid: 'sid-1' },
      }),
      next,
    );
    expect(patch).toHaveBeenCalledWith({ tenantId: 'tenant-1', actorId: 'user-1', sessionId: 'sid-1' });

    patch.mockClear();
    interceptor.intercept(createExecutionContext({}), next);
    expect(patch).not.toHaveBeenCalled();
  });

  it('allows public and system routes and enforces permission membership otherwise', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: symbol) => {
        if (key === STYNX_PUBLIC_ROUTE) return false;
        if (key === STYNX_SYSTEM_ROUTE) return false;
        if (key === STYNX_PERMISSION_ROUTE) return 'document:read:*';
        return undefined;
      }),
    } as unknown as Reflector;

    const guard = new PermissionGuard(reflector);
    const request = {
      principal: { permissions: ['document:read:*'] },
    };

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);

    expect(() =>
      guard.canActivate(createExecutionContext({ principal: { permissions: [] } })),
    ).toThrow(ForbiddenException);
  });

  it('hydrates request auth context and readonly state from a valid bearer token', async () => {
    const moduleRef = {
      get: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ sid: 'sid-1' }),
      })),
    };
    const reflector = {
      getAllAndOverride: jest.fn((key: symbol) => key === STYNX_READONLY_ROUTE),
    } as unknown as Reflector;
    const validator = {
      validate: jest.fn().mockResolvedValue({
        sub: 'user-1',
        sid: 'sid-1',
        tenantId: 'tenant-1',
        claims: { scope: 'read' },
      }),
    };
    const permissionCache = {
      getForSession: jest.fn().mockResolvedValue({
        permissions: ['document:read:*'],
      }),
    };

    const guard = new StynxAuthGuard(moduleRef as never, reflector, validator as never, permissionCache as never);
    const request = {
      headers: {
        authorization: 'Bearer access-token',
      },
    };

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      tenantId: 'tenant-1',
      stynxReadonly: true,
      principal: { id: 'user-1', permissions: ['document:read:*'] },
      user: { id: 'user-1', permissions: ['document:read:*'] },
    });
  });

  it('rejects missing bearer tokens and inactive sessions', async () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => false),
    } as unknown as Reflector;
    const moduleRef = {
      get: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(null),
      })),
    };
    const validator = {
      validate: jest.fn().mockResolvedValue({
        sub: 'user-1',
        sid: 'sid-1',
        tenantId: 'tenant-1',
        claims: {},
      }),
    };
    const permissionCache = {
      getForSession: jest.fn(),
    };
    const guard = new StynxAuthGuard(moduleRef as never, reflector, validator as never, permissionCache as never);

    await expect(guard.canActivate(createExecutionContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      guard.canActivate(createExecutionContext({ headers: { authorization: 'Bearer token' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('manages in-memory permission cache records and metrics snapshots', async () => {
    const backend = new InMemoryPermissionCacheBackend();
    const metrics = new PermissionCacheMetrics();

    await backend.set({
      sid: 'sid-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      permissions: ['document:read:*'],
      hash: 'hash-1',
      generation: 1,
      computedAt: Date.now(),
    });
    expect(await backend.get('sid-1')).toMatchObject({ tenantId: 'tenant-1' });

    await backend.invalidateScope('user-1:tenant-1');
    expect(await backend.get('sid-1')).toBeNull();

    metrics.increment('in_memory');
    metrics.increment('redis');
    expect(metrics.snapshot()).toEqual({ in_memory: 1, redis: 1, db: 0 });
  });

  it('handles jwt and permission utility helpers deterministically', () => {
    const payload = base64UrlEncode(JSON.stringify({ sub: 'user-1' }));
    expect(base64UrlDecode(payload)).toContain('"user-1"');

    const token = `${base64UrlEncode(JSON.stringify({ alg: 'none' }))}.${payload}.${base64UrlEncode('sig')}`;
    expect(decodeJwtClaims(token).payload).toEqual({ sub: 'user-1' });
    expect(() => decodeJwtClaims('broken')).toThrow('JWT is malformed');

    expect(
      expandPermissionWildcards(['document:*:*', 'document:read:*'], ['document:read:*', 'document:write:*', 'other']),
    ).toEqual(['document:*:*', 'document:read:*', 'document:write:*']);
    expect(computePermissionsHash(['b', 'a', 'a'])).toHaveLength(16);
    expect(headerToString(['tenant-1'])).toBe('tenant-1');
    expect(headerToString({})).toBeUndefined();
  });
});
