import {
  Controller,
  ForbiddenException,
  Get,
  Module,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ModulesContainer, Reflector } from '@nestjs/core';
import type { ModuleRef } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RequestContext } from '@stynx-nyx/core';
import request from 'supertest';
import { SessionService } from '@stynx-nyx/sessions';
import { STYNX_PUBLIC_TENANT_OPTIONS, STYNX_PUBLIC_TENANT_ROUTE } from '@stynx-nyx/contracts';
import { PermissionGuard } from '../../src/permission.guard.js';
import { StynxAuthGuard } from '../../src/stynx-auth.guard.js';
import {
  STYNX_PERMISSION_ROUTE,
  STYNX_PUBLIC_ROUTE,
  STYNX_READONLY_ROUTE,
  STYNX_SYSTEM_ROUTE,
} from '../../src/decorators.js';
import { PublicTenantRoute } from '../../src/decorators.js';
import { StynxAuthModule } from '../../src/auth.module.js';
import { PermissionCache } from '../../src/permission-cache.js';
import { StynxJwtValidator } from '../../src/stynx-jwt.validator.js';
import { PublicTenantBootstrap } from '../../src/public-tenant-bootstrap.js';

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'controller',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

class InheritedPublicTenantHandler {
  @Get('/inherited')
  @PublicTenantRoute()
  route() {
    return { status: 'unreachable' };
  }
}

@Controller('/inherited-public-tenant')
class InheritedPublicTenantController extends InheritedPublicTenantHandler {}

@Controller('/auth-only')
@UseGuards(StynxAuthGuard)
class AuthOnlyController {
  constructor(private readonly context: RequestContext) {}
  @Get('/verified')
  verified() {
    return {
      actorId: this.context.actorId,
      tenantId: this.context.tenantId,
      sessionId: this.context.sessionId,
    };
  }
}

@Controller('/declared-public-tenant')
class DeclaredPublicTenantController {
  @Get('/lookup')
  @PublicTenantRoute({ optionalAuth: true })
  lookup() {
    return { status: 'ok' };
  }
}

function modulesWith(metatypes: Array<unknown>): ModulesContainer {
  const controllers = new Map(
    metatypes.map((metatype, index) => [`controller-${index}`, { metatype }]),
  );
  return new Map([['module', { controllers }]]) as unknown as ModulesContainer;
}

@Module({
  controllers: [AuthOnlyController],
  providers: [
    {
      // S-12: the guard must not read the session store on the request path.
      provide: SessionService,
      useValue: {
        getActive: async () => {
          throw new Error('session store read on the request path');
        },
      },
    },
  ],
})
class AuthOnlyControllerModule {}

describe('public tenant guard boundaries', () => {
  it('marks ReadOnly public-tenant requests before optional authentication, including nominal and verified branches', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: symbol) => {
        if (key === STYNX_PUBLIC_TENANT_ROUTE) return { optionalAuth: true };
        if (key === STYNX_READONLY_ROUTE) return true;
        return false;
      }),
    } as unknown as Reflector;
    const guard = new StynxAuthGuard(
      { get: () => undefined } as never,
      reflector,
      {
        validate: vi.fn(async () => ({
          sid: 'sid',
          sub: 'actor',
          tenantId: 'tenant',
          permissions: [],
          roles: [],
          expiresAt: Math.floor(Date.now() / 1000) + 300,
          claims: {},
        })),
      } as never,
    );
    const nominal = { headers: {} };
    const verified = { headers: { authorization: 'Bearer valid' } };
    await expect(guard.canActivate(context(nominal))).resolves.toBe(true);
    await expect(guard.canActivate(context(verified))).resolves.toBe(true);
    expect(nominal).toMatchObject({ stynxReadonly: true });
    expect(verified).toMatchObject({ stynxReadonly: true, principal: { id: 'actor' } });
  });

  it('denies a nominal public-tenant actor when the handler requires a permission', () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: symbol) => {
        if (key === STYNX_PUBLIC_TENANT_ROUTE) return { optionalAuth: true };
        if (key === STYNX_PUBLIC_ROUTE) return true;
        if (key === STYNX_PERMISSION_ROUTE) return 'records:read';
        return false;
      }),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    expect(() =>
      guard.canActivate(context({ headers: {}, principal: { permissions: [] } })),
    ).toThrow(ForbiddenException);
  });

  it('denies a nominal public-tenant actor even when System metadata is also present', () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: symbol) => {
        if (key === STYNX_PUBLIC_TENANT_ROUTE) return { optionalAuth: true };
        if (key === STYNX_PUBLIC_ROUTE || key === STYNX_SYSTEM_ROUTE) return true;
        if (key === STYNX_PERMISSION_ROUTE) return 'records:read';
        return false;
      }),
    } as unknown as Reflector;

    expect(() => new PermissionGuard(reflector).canActivate(context({ headers: {} }))).toThrow(
      new ForbiddenException('Missing permission records:read'),
    );
  });

  it('keeps simple Public routes permissive even when they declare a permission', () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: symbol) => {
        if (key === STYNX_PUBLIC_ROUTE) return true;
        if (key === STYNX_PUBLIC_TENANT_ROUTE) return false;
        if (key === STYNX_PERMISSION_ROUTE) return 'records:read';
        return false;
      }),
    } as unknown as Reflector;
    expect(new PermissionGuard(reflector).canActivate(context({ headers: {} }))).toBe(true);
  });

  it('rejects bootstrap when an inherited PublicTenantRoute handler has no tenancy module', async () => {
    const testing = await Test.createTestingModule({
      imports: [StynxAuthModule.forRoot({})],
      controllers: [InheritedPublicTenantController],
    }).compile();
    const app = testing.createNestApplication();
    await expect(app.init()).rejects.toThrow(/PublicTenantRoute.*StynxTenancyModule/i);
    await app.close();
  });

  it('patches verified actor, tenant, and session in an auth-only HTTP application', async () => {
    const testing = await Test.createTestingModule({
      imports: [StynxAuthModule.forRoot({}), AuthOnlyControllerModule],
    })
      .overrideProvider(StynxJwtValidator)
      .useValue({
        validate: async () => ({
          sid: 'auth-only-session',
          sub: 'auth-only-actor',
          tenantId: '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
          permissions: ['records:read'],
          roles: [],
          expiresAt: Math.floor(Date.now() / 1000) + 300,
          claims: {},
        }),
      })
      .overrideProvider(PermissionCache)
      .useValue({
        getForSession: async () => {
          throw new Error('permission cache read on the request path');
        },
      })
      .compile();
    const app: INestApplication = testing.createNestApplication();
    await app.init();
    await request(app.getHttpServer())
      .get('/auth-only/verified')
      .set('authorization', 'Bearer verified')
      .expect(200)
      .expect({
        actorId: 'auth-only-actor',
        tenantId: '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
        sessionId: 'auth-only-session',
      });
    await app.close();
  });

  it('lets a public-tenant Public route without a permission requirement through', () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: symbol) => {
        if (key === STYNX_PUBLIC_TENANT_ROUTE) return { optionalAuth: true };
        if (key === STYNX_PUBLIC_ROUTE) return true;
        return undefined;
      }),
    } as unknown as Reflector;
    const request = { headers: {} };
    expect(new PermissionGuard(reflector).canActivate(context(request))).toBe(true);
    expect(reflector.getAllAndOverride).not.toHaveBeenCalledWith(STYNX_SYSTEM_ROUTE, [
      'handler',
      'controller',
    ]);
  });

  it('rejects malformed verified claims on an optional-auth public-tenant route without attaching a principal', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: symbol) =>
        key === STYNX_PUBLIC_TENANT_ROUTE ? { optionalAuth: true } : false,
      ),
    } as unknown as Reflector;
    const lookups = { get: vi.fn(() => undefined) };
    for (const claims of [
      null,
      { sid: '', sub: 'actor', tenantId: 'tenant', claims: {} },
      { sid: 'sid', sub: 'actor', tenantId: 42, claims: {} },
      // A verified token without the S-12 `perms` claim is malformed, not looked up.
      { sid: 'sid', sub: 'actor', tenantId: 'tenant', roles: [], expiresAt: 4_102_444_800, claims: {} },
    ]) {
      const guard = new StynxAuthGuard(
        lookups as never,
        reflector,
        { validate: vi.fn(async () => claims) } as never,
      );
      const verified: Record<string, unknown> = { headers: { authorization: 'Bearer malformed' } };
      await expect(guard.canActivate(context(verified))).rejects.toThrow(
        new UnauthorizedException('Token verification returned malformed claims'),
      );
      expect(verified.principal).toBe(undefined);
      expect(verified.publicTenantOptionalAuth).toBe(true);
    }
    // Malformed claims are refused before the revocation list is even consulted.
    expect(lookups.get).toHaveBeenCalledTimes(0);
  });

  it('skips controller wrappers without a metatype and accepts public-tenant controllers when tenancy options exist', () => {
    const moduleRef = {
      get: vi.fn((token: unknown) =>
        token === STYNX_PUBLIC_TENANT_OPTIONS ? { resolveTenant: 'fixture' } : undefined,
      ),
    } as unknown as ModuleRef;
    const bootstrap = new PublicTenantBootstrap(
      modulesWith([undefined, DeclaredPublicTenantController]),
      moduleRef,
    );
    expect(bootstrap.onApplicationBootstrap()).toBe(undefined);
    expect(moduleRef.get).toHaveBeenCalledTimes(1);
    expect(moduleRef.get).toHaveBeenCalledWith(STYNX_PUBLIC_TENANT_OPTIONS, { strict: false });

    const unconfigured = new PublicTenantBootstrap(
      modulesWith([undefined, DeclaredPublicTenantController]),
      {
        get: vi.fn(() => {
          throw new Error('absent');
        }),
      } as unknown as ModuleRef,
    );
    expect(() => unconfigured.onApplicationBootstrap()).toThrow(
      'PublicTenantRoute requires StynxTenancyModule publicTenant options',
    );
  });
});
