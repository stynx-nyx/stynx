import 'reflect-metadata';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { STYNX_AUDIT_METADATA } from '../../src/audit/constants';
import { Audit } from '../../src/audit/decorators';
import { STYNX_AUTHZ_METADATA } from '../../src/authorization/constants';
import { RequirePermissions, RequireRoles } from '../../src/authorization/decorators';
import { CurrentPrincipal } from '../../src/auth/current-principal.decorator';

describe('backend decorators', () => {
  it('attaches authorization and audit metadata', () => {
    class Controller {
      byRole(): void {}
      byPermission(): void {}
      audited(): void {}
    }

    RequireRoles(['admin'], 'any')(Controller.prototype, 'byRole', Object.getOwnPropertyDescriptor(Controller.prototype, 'byRole')!);
    RequirePermissions(['records:read'], 'all')(Controller.prototype, 'byPermission', Object.getOwnPropertyDescriptor(Controller.prototype, 'byPermission')!);
    Audit({ action: 'read' })(Controller.prototype, 'audited', Object.getOwnPropertyDescriptor(Controller.prototype, 'audited')!);

    expect(Reflect.getMetadata(STYNX_AUTHZ_METADATA, Controller.prototype.byRole)).toEqual({
      roles: { roles: ['admin'], mode: 'any' },
    });
    expect(Reflect.getMetadata(STYNX_AUTHZ_METADATA, Controller.prototype.byPermission)).toEqual({
      permissions: { permissions: ['records:read'], mode: 'all' },
    });
    expect(Reflect.getMetadata(STYNX_AUDIT_METADATA, Controller.prototype.audited)).toEqual({
      action: 'read',
    });
  });

  it('exports the current-principal decorator factory', () => {
    expect(CurrentPrincipal()).toBeTypeOf('function');
  });

  it('resolves the current principal from request metadata', () => {
    class Controller {
      handler(_principal?: unknown): void {}
    }
    const principal = { id: 'p-1', roles: [], permissions: [], tenants: [], claims: {} };
    CurrentPrincipal()(Controller.prototype, 'handler', 0);
    const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Controller, 'handler') as Record<
      string,
      { factory: (data: unknown, context: unknown) => unknown }
    >;
    const entry = Object.values(metadata)[0]!;

    expect(entry.factory(undefined, {
      switchToHttp: () => ({
        getRequest: () => ({ principal }),
      }),
    })).toEqual(principal);
  });
});
