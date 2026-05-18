import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';
import { ClaimFirstTenantEntitlementPolicy } from '../../src/auth/claim-first-tenant-entitlement.policy';
import { RequiredTenantHeaderResolver } from '../../src/auth/required-tenant-header.resolver';
import { getPrincipalFromRequest } from '../../src/common/request-context';
import { StynxAuditModule } from '../../src/audit/audit.module';
import { AuthorizationGuard } from '../../src/authorization/authorization.guard';
import { StynxAuthorizationModule } from '../../src/authorization/authorization.module';
import { DefaultPolicyEvaluator } from '../../src/authorization/default-policy-evaluator';
import { StynxDbContextModule } from '../../src/db-context/db-context.module';
import { StynxPlatformPipelineModule } from '../../src/pipeline/platform-pipeline.module';
import { DefaultSlaCategoryResolver } from '../../src/sla/default-sla-category.resolver';
import { LoggerSlaEventSink } from '../../src/sla/logger-sla-event.sink';
import { StynxSlaModule } from '../../src/sla/sla.module';
import { SlaMonitorInterceptor } from '../../src/sla/sla-monitor.interceptor';
import {
  STYNX_SLA_CATEGORY_RESOLVER,
  STYNX_SLA_EVENT_SINK,
  STYNX_SLA_OPTIONS,
} from '../../src/sla/constants';

function httpContext(request: Record<string, unknown>, handlerName = 'handler') {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({ name: handlerName }),
    getClass: () => ({ name: 'ControllerClass' }),
  };
}

describe('backend SLA behavior', () => {
  it('resolves URL categories and falls back to NONE', () => {
    const resolver = new DefaultSlaCategoryResolver();
    expect(resolver.resolve({ headers: {}, originalUrl: '/api/biometrics/1' })).toBe('BIOMETRIC');
    expect(resolver.resolve({ headers: {}, url: '/transmissions/renach' })).toBe('RENACH');
    expect(resolver.resolve({ headers: {}, url: '/documents/sign' })).toBe('SIGNATURE');
    expect(resolver.resolve({ headers: {}, url: '/health' })).toBe('NONE');
  });

  it('samples requests, skips NONE categories, aggregates by window, and records errors', async () => {
    const sink = {
      sample: vi.fn(),
      aggregate: vi.fn(),
    };
    let now = 1_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 20;
      return now;
    });
    const interceptor = new SlaMonitorInterceptor(
      {
        thresholdsMs: { CUSTOM: 10 },
        aggregateEvery: 2,
        windowSize: 2,
      },
      { resolve: vi.fn(() => 'CUSTOM') },
      sink,
    );

    try {
      await lastValueFrom(interceptor.intercept(httpContext({ headers: {} }) as never, {
        handle: () => of('ok'),
      }));
      await lastValueFrom(interceptor.intercept(httpContext({ headers: {} }) as never, {
        handle: () => of('ok'),
      }));
      await expect(lastValueFrom(interceptor.intercept(httpContext({ headers: {} }) as never, {
        handle: () => throwError(() => new Error('boom')),
      }))).rejects.toThrow('boom');

      const none = new SlaMonitorInterceptor({}, { resolve: vi.fn(() => 'NONE') }, sink);
      await lastValueFrom(none.intercept(httpContext({ headers: {} }) as never, {
        handle: () => of('ok'),
      }));
    } finally {
      nowSpy.mockRestore();
    }

    expect(sink.sample).toHaveBeenCalledTimes(3);
    expect(sink.sample).toHaveBeenCalledWith(expect.objectContaining({
      category: 'CUSTOM',
      breach: true,
      requestError: true,
    }));
    expect(sink.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      samples: 2,
      breachP95: true,
    }));
  });

  it('wires SLA module defaults and logger sink warning branch', () => {
    const module = StynxSlaModule.forRoot();
    expect(module.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: STYNX_SLA_OPTIONS }),
      expect.objectContaining({ provide: STYNX_SLA_CATEGORY_RESOLVER }),
      expect.objectContaining({ provide: STYNX_SLA_EVENT_SINK }),
      expect.objectContaining({ provide: SlaMonitorInterceptor }),
    ]));

    const sink = new LoggerSlaEventSink();
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
    };
    Object.defineProperty(sink, 'logger', { value: logger });
    sink.sample({ category: 'BIOMETRIC', thresholdMs: 1, durationMs: 2, breach: true, requestError: false, timestamp: 't' });
    sink.aggregate({ category: 'BIOMETRIC', samples: 2, p50Ms: 1, p95Ms: 3, p99Ms: 3, thresholdMs: 2, breachP95: true, timestamp: 't' });
    sink.aggregate({ category: 'RENACH', samples: 1, p50Ms: 1, p95Ms: 1, p99Ms: 1, thresholdMs: 2, breachP95: false, timestamp: 't' });
    expect(logger.log).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('backend authorization and auth behavior', () => {
  const principal = {
    id: 'user-1',
    roles: ['admin'],
    permissions: ['records:read'],
    tenants: ['tenant-1'],
    claims: {},
  };

  it('evaluates role and permission policies with all/any modes', () => {
    const evaluator = new DefaultPolicyEvaluator();
    expect(evaluator.evaluate({ principal, requirements: {} })).toBe(true);
    expect(evaluator.evaluate({ principal, requirements: { roles: { roles: [] } } })).toBe(true);
    expect(evaluator.evaluate({ principal, requirements: { roles: { roles: ['ADMIN'] } } })).toBe(true);
    expect(evaluator.evaluate({ principal, requirements: { roles: { roles: ['missing'], mode: 'any' } } })).toBe(false);
    expect(evaluator.evaluate({ principal, requirements: { permissions: { permissions: ['records:read'] } } })).toBe(true);
    expect(evaluator.evaluate({ principal, requirements: { permissions: { permissions: ['records:write'] } } })).toBe(false);
  });

  it('guards authorization metadata with default and injected evaluators', async () => {
    const reflector = {
      getAllAndOverride: vi.fn(),
    };
    const allowGuard = new AuthorizationGuard(reflector as unknown as Reflector, {
      evaluate: vi.fn(async () => true),
    });
    reflector.getAllAndOverride.mockReturnValueOnce(undefined);
    await expect(allowGuard.canActivate(httpContext({ headers: {} }) as never)).resolves.toBe(true);

    reflector.getAllAndOverride.mockReturnValue({ permissions: { permissions: ['records:read'] } });
    await expect(allowGuard.canActivate(httpContext({ headers: {}, principal }) as never)).resolves.toBe(true);

    const denyGuard = new AuthorizationGuard(reflector as unknown as Reflector, {
      evaluate: vi.fn(async () => false),
    });
    await expect(denyGuard.canActivate(httpContext({ headers: {}, principal }) as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(denyGuard.canActivate(httpContext({ headers: {} }) as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('maps principals from request compatibility locations', () => {
    expect(getPrincipalFromRequest({ headers: {}, principal })).toBe(principal);
    expect(getPrincipalFromRequest({ headers: {}, principalContext: { principal } })).toBe(principal);
    expect(getPrincipalFromRequest({
      headers: {},
      user: { id: 'u', roles: ['r'], permissions: ['p'], tenants: ['t'], claims: { c: true }, email: 'e', username: 'n' },
    })).toMatchObject({ id: 'u', email: 'e', username: 'n' });
    expect(getPrincipalFromRequest({
      headers: {},
      actor: { id: 'a', roles: [], permissions: [], tenants: [], claims: {} },
    })).toMatchObject({ id: 'a' });
    expect(getPrincipalFromRequest({ headers: {}, user: {}, actor: {} })).toBeUndefined();
  });

  it('resolves tenant headers and claim-first entitlement branches', async () => {
    const resolver = new RequiredTenantHeaderResolver();
    expect(resolver.resolve({ principal, headerTenantId: ' 00000000-0000-0000-0000-000000000001 ' })).toBe('00000000-0000-0000-0000-000000000001');
    expect(() => resolver.resolve({ principal })).toThrow(BadRequestException);
    expect(() => resolver.resolve({ principal, headerTenantId: 'not-uuid' })).toThrow(BadRequestException);
    expect(new RequiredTenantHeaderResolver({ headerName: 'x-org', requireUuid: false }).resolve({
      principal,
      headerTenantId: 'org-1',
    })).toBe('org-1');

    await expect(new ClaimFirstTenantEntitlementPolicy().isEntitled({
      principal: { ...principal, claims: { tenants: [' tenant-1 ', 1] } },
      tenantId: 'tenant-1',
    })).resolves.toBe(true);
    await expect(new ClaimFirstTenantEntitlementPolicy().isEntitled({
      principal: { ...principal, claims: { tenants: 'tenant-2, tenant-3' } },
      tenantId: 'tenant-1',
    })).resolves.toBe(false);
    await expect(new ClaimFirstTenantEntitlementPolicy().isEntitled({
      principal: { ...principal, claims: { tenants: '["tenant-1"]' } },
      tenantId: 'tenant-1',
    })).resolves.toBe(true);
    await expect(new ClaimFirstTenantEntitlementPolicy({
      fallback: { isEntitled: vi.fn(async () => true) },
    }).isEntitled({ principal, tenantId: 'tenant-1' })).resolves.toBe(true);
  });

  it('auth guard attaches principal context and resolves tenant paths', async () => {
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async () => ({ principal, token: 't' })),
    };
    const mapper = { map: vi.fn(() => principal) };
    const entitlement = { isEntitled: vi.fn(async () => true) };
    const guard = new AuthContextGuard(verifier, mapper, undefined, entitlement);
    const request = { headers: { authorization: 'Bearer t' }, correlationId: 'c-1' };
    await expect(guard.canActivate(httpContext(request) as never)).resolves.toBe(true);
    expect(request).toMatchObject({ tenantId: 'tenant-1' });

    const headerGuard = new AuthContextGuard(verifier, mapper, {
      resolve: vi.fn(() => 'tenant-2'),
    }, { isEntitled: vi.fn(async () => false) });
    await expect(headerGuard.canActivate(httpContext({
      headers: { authorization: ['Bearer t'], 'x-tenant-id': ' tenant-2 ' },
    }) as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('backend module wiring branches', () => {
  it('wires optional module providers and disabled platform pipeline features', () => {
    expect(StynxAuthModule.forRoot({
      tokenVerifier: {} as never,
      principalMapper: {} as never,
      tenantResolver: {} as never,
      tenantEntitlementPolicy: {} as never,
    }).providers).toHaveLength(5);
    expect(StynxAuthorizationModule.forRoot({ policyEvaluator: {} as never }).providers).toHaveLength(2);
    expect(StynxAuditModule.forRoot({ sink: {} as never, metadataRedactionPolicy: {} as never }).providers).toHaveLength(3);

    const pipelineAll = StynxPlatformPipelineModule.forRoot();
    expect(pipelineAll.imports).toHaveLength(3);
    expect(pipelineAll.providers).toHaveLength(3);
    const pipelineNone = StynxPlatformPipelineModule.forRoot({
      rateLimit: false,
      sla: false,
      idempotency: false,
    });
    expect(pipelineNone.imports).toHaveLength(0);
    expect(pipelineNone.providers).toHaveLength(0);
  });

  it('wires db-context variants and validates missing applier config', () => {
    expect(() => StynxDbContextModule.forRoot({})).toThrow('requires either');
    expect(StynxDbContextModule.forRoot({
      applier: {} as never,
      clientResolver: {} as never,
      requestDbClientLifecycle: {} as never,
    }).providers).toHaveLength(4);
    expect(StynxDbContextModule.forRoot({
      pgSessionApplier: { mode: 'local' } as never,
    }).providers).toHaveLength(2);
  });
});
