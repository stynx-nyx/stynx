import type { ExecutionContext } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { SessionService } from '@stynx/sessions';
import { STYNX_PUBLIC_ROUTE, STYNX_READONLY_ROUTE, STYNX_SYSTEM_ROUTE } from '../../src/decorators';
import { StynxAuthGuard } from '../../src/stynx-auth.guard';

function createExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: jest.fn(() => 'handler'),
    getClass: jest.fn(() => 'controller'),
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
    activeSession?: boolean;
    sessionProvider?: boolean;
  } = {}) {
    const sessionService = {
      get: jest.fn().mockResolvedValue(options.activeSession === false ? null : { sid: 'sid-1' }),
    };
    const moduleRef = {
      get: jest.fn((token: unknown) => {
        if (token === SessionService) {
          return options.sessionProvider === false ? undefined : sessionService;
        }
        return undefined;
      }),
    } as unknown as ModuleRef;
    const reflector = {
      getAllAndOverride: jest.fn((key: symbol) => {
        if (key === STYNX_PUBLIC_ROUTE) return Boolean(options.publicRoute);
        if (key === STYNX_SYSTEM_ROUTE) return Boolean(options.systemRoute);
        if (key === STYNX_READONLY_ROUTE) return Boolean(options.readonlyRoute);
        return false;
      }),
    };
    const validator = {
      validate: jest.fn().mockResolvedValue({
        sid: 'sid-1',
        sub: 'user-1',
        tenantId: 'tenant-1',
        claims: { scope: 'sample' },
      }),
    };
    const permissionCache = {
      getForSession: jest.fn().mockResolvedValue({
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
    const response = { setHeader: jest.fn() };
    const request = {
      headers: { authorization: 'Bearer token-with-trailing-space  ' },
      res: response,
    };
    const nowSpy = jest
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
    const response = { setHeader: jest.fn() };
    const request = {
      headers: { authorization: ['Bearer array-token'] },
      response,
    };

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

    expect(validator.validate).toHaveBeenCalledWith('array-token');
    expect(sessionService.get).not.toHaveBeenCalled();
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
