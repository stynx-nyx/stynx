import { Controller, Get, HttpException, Module, SetMetadata } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StynxCoreModule } from '@stynx-nyx/core';
import { PermissionCache, StynxAuthGuard, StynxJwtValidator } from '@stynx-nyx/auth';
import { SessionService } from '@stynx-nyx/sessions';
import { APP_GUARD as NEST_APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { z } from 'zod';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';
import { RequirePermissions } from '../../src/authorization/decorators';
import { StynxAuthorizationModule } from '../../src/authorization/authorization.module';
import { AuthorizationGuard } from '../../src/authorization/authorization.guard';

const PUBLIC_KEY = Symbol('consumer-public-route');
const TARGET_KEY = Symbol('consumer-authorization-target');
const actor = {
  id: 'actor-1', roles: ['reader'], permissions: ['records:read'], tenants: ['tenant-verified'],
  claims: { sid: 'sid-1', custom: 'claim-kept' },
};

@Controller('/authorization-matrix')
@SetMetadata(TARGET_KEY, { resource: 'class-resource', action: 'class-action' })
class AuthorizationMatrixController {
  @Get('/plain')
  plain() { return { route: 'plain' }; }

  @Get('/decorated')
  @RequirePermissions(['records:read'])
  decorated() { return { route: 'decorated' }; }

  @Get('/denied')
  @RequirePermissions(['records:write'])
  denied() { return { route: 'denied' }; }

  @Get('/public')
  @SetMetadata(PUBLIC_KEY, true)
  @RequirePermissions(['records:write'])
  publicRoute() { return { route: 'public' }; }

  @Get('/method-target')
  @SetMetadata(TARGET_KEY, { resource: 'method-resource', action: 'method-action' })
  methodTarget() { return { route: 'method-target' }; }

  @Get('/class-target')
  classTarget() { return { route: 'class-target' }; }

  @Get('/empty-target')
  @SetMetadata(TARGET_KEY, {})
  emptyTarget() { return { route: 'empty-target' }; }

  @Get('/undefined-target')
  undefinedTarget() { return { route: 'undefined-target' }; }

  @Get('/partial-target')
  @SetMetadata(TARGET_KEY, { resource: 'partial-resource' })
  partialTarget() { return { route: 'partial-target' }; }
}

function authorizationOptions(evaluate: (context: Record<string, unknown>) => boolean, overrides: Record<string, unknown> = {}) {
  return {
    global: true,
    policyEvaluator: { evaluate: vi.fn(evaluate) },
    publicMetadataKey: PUBLIC_KEY,
    resolveTarget: (context: { getHandler(): Function; getClass(): Function }) => {
      const handler = context.getHandler();
      const controller = context.getClass();
      return Reflect.getMetadata(TARGET_KEY, handler) ?? Reflect.getMetadata(TARGET_KEY, controller);
    },
    onDeny: (_context: unknown, target: unknown, principal: unknown) => {
      const hasPrincipal = Boolean(principal);
      return new HttpException(
        {
          statusCode: hasPrincipal ? 403 : 401,
          errorCode: hasPrincipal ? 'AUTHZ:DENIED:policy' : 'AUTH:UNAUTHENTICATED:missing-principal',
          message: hasPrincipal ? 'Access denied by policy.' : 'Authentication is required.',
          target,
        },
        hasPrincipal ? 403 : 401,
      );
    },
    ...overrides,
  } as never;
}

function authorizationAppGuard(evaluate: (context: Record<string, unknown>) => boolean, overrides: Record<string, unknown> = {}) {
  const options = { ...authorizationOptions(evaluate, overrides), global: false } as never;
  @Module({
    imports: [StynxAuthorizationModule.forRoot(options)],
    providers: [{ provide: NEST_APP_GUARD, useExisting: AuthorizationGuard }],
  })
  class AuthorizationAppGuardModule {}
  return AuthorizationAppGuardModule;
}

const tokenVerifier = {
  verifyAuthorizationHeader: vi.fn(async (header: string | string[] | undefined) => {
    if (header === 'Bearer verified') return { principal: actor };
    return null;
  }),
};
const jwtValidator = {
  validate: vi.fn(async (token: string) => ({
    sid: 'sid-1', sub: 'actor-1', tenantId: token === 'verified' ? 'tenant-from-token' : 'tenant-from-token',
    claims: { sid: 'sid-1', custom: 'claim-kept' },
  })),
};
const permissionCache = { getForSession: vi.fn(async () => ({ permissions: ['records:read'] })) };
const sessionService = { get: vi.fn(async () => ({ active: true })) };

@Module({
  imports: [StynxAuthModule.forRoot({ tokenVerifier })],
  providers: [{ provide: NEST_APP_GUARD, useExisting: AuthContextGuard }],
})
class AuthContextAppGuardModule {}

@Module({
  providers: [
    StynxAuthGuard,
    { provide: StynxJwtValidator, useValue: jwtValidator },
    { provide: PermissionCache, useValue: permissionCache },
    { provide: SessionService, useValue: sessionService },
    { provide: NEST_APP_GUARD, useExisting: StynxAuthGuard },
  ],
})
class StynxAuthAppGuardModule {}

async function createApp(imports: unknown[]): Promise<INestApplication> {
  @Module({ imports: imports as never, controllers: [AuthorizationMatrixController] })
  class MatrixModule {}
  const testing = await Test.createTestingModule({
    imports: [StynxCoreModule.forRoot({ appName: 'authorization-matrix', schema: z.object({}) }), MatrixModule],
  }).compile();
  const app = testing.createNestApplication();
  await app.init();
  return app;
}

describe('authorization APP_GUARD HTTP contract', () => {
  let app: INestApplication;
  let targetApp: INestApplication;
  const evaluator = { evaluate: vi.fn((context: Record<string, unknown>) => {
    const requirements = context.requirements as { permissions?: { permissions?: string[] } } | undefined;
    return !requirements?.permissions?.permissions?.includes('records:write');
  }) };

  beforeAll(async () => {
    app = await createApp([authorizationAppGuard(evaluator.evaluate)]);
    targetApp = await createApp([
      AuthContextAppGuardModule,
      authorizationAppGuard(evaluator.evaluate),
    ]);
  });
  afterAll(async () => { await Promise.all([app?.close(), targetApp?.close()]); });

  it('passes undecorated and public routes without a principal, and never evaluates either', async () => {
    await request(app.getHttpServer()).get('/authorization-matrix/plain').expect(200).expect({ route: 'plain' });
    await request(app.getHttpServer()).get('/authorization-matrix/public').expect(200).expect({ route: 'public' });
    expect(evaluator.evaluate).not.toHaveBeenCalled();
  });

  it('returns exact custom 401 status and body when a decorated route has no principal', async () => {
    await request(app.getHttpServer()).get('/authorization-matrix/decorated')
      .expect(401).expect({
        statusCode: 401, errorCode: 'AUTH:UNAUTHENTICATED:missing-principal',
        message: 'Authentication is required.', target: { resource: 'class-resource', action: 'class-action' },
      });
    expect(evaluator.evaluate).not.toHaveBeenCalled();
  });

  it('returns the custom 401 denial envelope for a missing principal on another decorated route', async () => {
    await request(app.getHttpServer()).get('/authorization-matrix/denied')
      .expect(401).expect({
        statusCode: 401, errorCode: 'AUTH:UNAUTHENTICATED:missing-principal',
        message: 'Authentication is required.', target: { resource: 'class-resource', action: 'class-action' },
      });
  });

  it('prefers method targets over class targets and passes decorated requirements', async () => {
    await request(targetApp.getHttpServer()).get('/authorization-matrix/method-target').set('authorization', 'Bearer verified').expect(200);
    expect(evaluator.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      resource: 'method-resource', action: 'method-action', requirements: {},
    }));
    await request(targetApp.getHttpServer()).get('/authorization-matrix/class-target').set('authorization', 'Bearer verified').expect(200);
    expect(evaluator.evaluate).toHaveBeenLastCalledWith(expect.objectContaining({
      resource: 'class-resource', action: 'class-action', requirements: {},
    }));
    await request(targetApp.getHttpServer()).get('/authorization-matrix/decorated').set('authorization', 'Bearer verified').expect(200);
    expect(evaluator.evaluate).toHaveBeenLastCalledWith(expect.objectContaining({
      requirements: { permissions: { permissions: ['records:read'], mode: 'all' } },
    }));
  });

  it('passes partial resolver targets unchanged and treats undefined and empty targets as absent', async () => {
    await request(targetApp.getHttpServer()).get('/authorization-matrix/partial-target').set('authorization', 'Bearer verified').expect(200);
    const partialContext = evaluator.evaluate.mock.calls.at(-1)?.[0];
    expect(partialContext).toMatchObject({ resource: 'partial-resource', requirements: {} });
    expect(partialContext).not.toHaveProperty('action');
    const calls = evaluator.evaluate.mock.calls.length;
    await request(targetApp.getHttpServer()).get('/authorization-matrix/empty-target').set('authorization', 'Bearer verified').expect(200);
    await request(targetApp.getHttpServer()).get('/authorization-matrix/undefined-target')
      .set('authorization', 'Bearer verified').set('x-resource', 'untrusted').expect(200);
    expect(evaluator.evaluate).toHaveBeenCalledTimes(calls);
  });
});

describe('real authentication APP_GUARD ordering', () => {
  let authContextFirst: INestApplication;
  let authzFirst: INestApplication;
  let stynxAuthFirst: INestApplication;
  let stynxAuthzFirst: INestApplication;
  let deniedWithPrincipal: INestApplication;
  let evaluatorThrows: INestApplication;
  let denyFactoryThrows: INestApplication;
  const observed: Record<string, unknown>[] = [];
  const captureEvaluator = { evaluate: vi.fn((context: Record<string, unknown>) => { observed.push(context); return true; }) };

  beforeAll(async () => {
    const authz = () => authorizationAppGuard(captureEvaluator.evaluate);
    authContextFirst = await createApp([AuthContextAppGuardModule, authz()]);
    authzFirst = await createApp([authz(), AuthContextAppGuardModule]);
    stynxAuthFirst = await createApp([StynxAuthAppGuardModule, authz()]);
    stynxAuthzFirst = await createApp([authz(), StynxAuthAppGuardModule]);
    const denyEvaluator = { evaluate: vi.fn(() => false) };
    deniedWithPrincipal = await createApp([
      AuthContextAppGuardModule,
      authorizationAppGuard(denyEvaluator.evaluate),
    ]);
    const evaluatorError = new HttpException({ statusCode: 422, errorCode: 'AUTHZ:EVALUATOR:unavailable', message: 'Evaluator unavailable.' }, 422);
    evaluatorThrows = await createApp([
      AuthContextAppGuardModule,
      authorizationAppGuard(() => { throw evaluatorError; }),
    ]);
    const factoryError = new HttpException({ statusCode: 418, errorCode: 'AUTHZ:DENY_FACTORY:failed', message: 'Deny factory failed.' }, 418);
    denyFactoryThrows = await createApp([
      authorizationAppGuard(() => true, {
        onDeny: () => { throw factoryError; },
      }),
    ]);
  });
  afterAll(async () => {
    await Promise.all([
      authContextFirst, authzFirst, stynxAuthFirst, stynxAuthzFirst, deniedWithPrincipal,
      evaluatorThrows, denyFactoryThrows,
    ].map((instance) => instance?.close()));
  });

  it('uses AuthContextGuard identity before global authorization and denies when order is reversed', async () => {
    await request(authContextFirst.getHttpServer()).get('/authorization-matrix/decorated').set('authorization', 'Bearer verified').expect(200);
    expect(tokenVerifier.verifyAuthorizationHeader).toHaveBeenCalledWith('Bearer verified');
    expect(observed.at(-1)).toMatchObject({
      principal: actor,
      tenantId: 'tenant-verified',
      requirements: { permissions: { permissions: ['records:read'], mode: 'all' } },
    });
    await request(authzFirst.getHttpServer()).get('/authorization-matrix/decorated').set('authorization', 'Bearer verified')
      .expect(401).expect({
        statusCode: 401, errorCode: 'AUTH:UNAUTHENTICATED:missing-principal',
        message: 'Authentication is required.', target: { resource: 'class-resource', action: 'class-action' },
      });
  });

  it('preserves the exact custom 403 status and body returned by onDeny', async () => {
    await request(deniedWithPrincipal.getHttpServer()).get('/authorization-matrix/denied').set('authorization', 'Bearer verified')
      .expect(403).expect({
        statusCode: 403, errorCode: 'AUTHZ:DENIED:policy', message: 'Access denied by policy.',
        target: { resource: 'class-resource', action: 'class-action' },
      });
  });

  it('propagates custom evaluator and onDeny exceptions unchanged through the HTTP filter', async () => {
    await request(evaluatorThrows.getHttpServer()).get('/authorization-matrix/decorated').set('authorization', 'Bearer verified')
      .expect(422).expect({
        statusCode: 422, errorCode: 'AUTHZ:EVALUATOR:unavailable', message: 'Evaluator unavailable.',
      });
    await request(denyFactoryThrows.getHttpServer()).get('/authorization-matrix/denied')
      .expect(418).expect({
        statusCode: 418, errorCode: 'AUTHZ:DENY_FACTORY:failed', message: 'Deny factory failed.',
      });
  });

  it('uses StynxAuthGuard verified claims and tenant before global authorization and denies in reverse order', async () => {
    await request(stynxAuthFirst.getHttpServer()).get('/authorization-matrix/decorated')
      .set('authorization', 'Bearer verified').set('x-tenant-id', 'unverified-header-tenant').expect(200);
    expect(jwtValidator.validate).toHaveBeenCalledWith('verified');
    expect(observed.at(-1)).toMatchObject({
      principal: expect.objectContaining({ id: 'actor-1', claims: { sid: 'sid-1', custom: 'claim-kept' } }),
      tenantId: 'tenant-from-token',
    });
    await request(stynxAuthzFirst.getHttpServer()).get('/authorization-matrix/decorated')
      .set('authorization', 'Bearer verified').expect(401).expect({
        statusCode: 401, errorCode: 'AUTH:UNAUTHENTICATED:missing-principal',
        message: 'Authentication is required.', target: { resource: 'class-resource', action: 'class-action' },
      });
  });
});
