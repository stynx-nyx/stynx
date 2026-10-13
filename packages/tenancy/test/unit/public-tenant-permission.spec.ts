import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, PermissionGuard, PublicTenantRoute } from '@stynx-nyx/auth';

@PublicTenantRoute({ optionalAuth: true })
@Permission('records:read:*')
class PermissionedPublicTenantController {
  handler(): void {}
}

function executionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => PermissionedPublicTenantController.prototype.handler,
    getClass: () => PermissionedPublicTenantController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard on public tenant routes', () => {
  it('denies a nominal public actor when the route explicitly requires a permission', () => {
    const guard = new PermissionGuard(new Reflector());

    expect(() => guard.canActivate(executionContext({ principal: { permissions: [] } }))).toThrow(
      new ForbiddenException('Missing permission records:read:*'),
    );
  });
});
