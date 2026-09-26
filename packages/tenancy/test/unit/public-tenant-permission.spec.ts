import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STYNX_PUBLIC_TENANT_ROUTE } from '@stynx-nyx/contracts';
import {
  PermissionGuard,
  STYNX_PERMISSION_ROUTE,
  STYNX_PUBLIC_ROUTE,
} from '@stynx-nyx/auth';

function executionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'controller',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard on public tenant routes', () => {
  it('denies a nominal public actor when the route explicitly requires a permission', () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: symbol) => {
        if (key === STYNX_PUBLIC_ROUTE) return true;
        if (key === STYNX_PUBLIC_TENANT_ROUTE) return { optionalAuth: true };
        if (key === STYNX_PERMISSION_ROUTE) return 'records:read:*';
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    expect(() => guard.canActivate(executionContext({ principal: { permissions: [] } }))).toThrow(
      new ForbiddenException('Missing permission records:read:*'),
    );
  });
});
