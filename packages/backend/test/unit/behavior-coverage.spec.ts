import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom, of, throwError } from 'rxjs';
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
import { IdempotencyInterceptor } from '../../src/idempotency/idempotency.interceptor';
import type { IdempotencyStore } from '../../src/idempotency/types';
import { StynxPlatformPipelineModule } from '../../src/pipeline/platform-pipeline.module';
import { RateLimitGuard } from '../../src/rate-limit/rate-limit.guard';
import type { RateLimitStore } from '../../src/rate-limit/types';
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

function httpContextWithResponse(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => ({ name: 'handler' }),
    getClass: () => ({ name: 'ControllerClass' }),
  };
}

function responseStub(statusCode = 200) {
  return {
    statusCode,
    status: vi.fn(function status(this: { statusCode: number }, nextStatus: number) {
      this.statusCode = nextStatus;
      return this;
    }),
    setHeader: vi.fn(),
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

describe('backend idempotency behavior', () => {
  it('bypasses read methods and optional write keys', async () => {
    const readNext = { handle: vi.fn(() => of({ read: true })) };
    const read = new IdempotencyInterceptor();
    await expect(lastValueFrom(read.intercept(
      httpContextWithResponse({ method: 'GET', headers: {}, url: '/items' }, responseStub()) as never,
      readNext,
    ))).resolves.toEqual({ read: true });

    const optional = new IdempotencyInterceptor({ requireKeyOnWrite: () => false });
    const writeNext = { handle: vi.fn(() => of({ write: true })) };
    await expect(lastValueFrom(optional.intercept(
      httpContextWithResponse({ method: 'POST', headers: {}, url: '/items' }, responseStub()) as never,
      writeNext,
    ))).resolves.toEqual({ write: true });
  });

  it('rejects missing keys and strict non-durable writes', () => {
    expect(() => new IdempotencyInterceptor().intercept(
      httpContextWithResponse({ method: 'POST', headers: {}, url: '/items' }, responseStub()) as never,
      { handle: () => of({}) },
    )).toThrow(BadRequestException);

    expect(() => new IdempotencyInterceptor({ durableStrict: true }).intercept(
      httpContextWithResponse({
        method: 'POST',
        headers: { 'x-idempotency-key': 'k1' },
        url: '/items',
      }, responseStub()) as never,
      { handle: () => of({}) },
    )).toThrow(ServiceUnavailableException);
  });

  it('caches in-memory writes, replays them, and detects payload conflicts', async () => {
    const interceptor = new IdempotencyInterceptor({ ttlMs: 10_000, cacheCleanupMs: 10_000 });
    const next = { handle: vi.fn(() => of({ ok: true })) };
    const firstResponse = responseStub(201);
    const baseRequest = {
      method: 'POST',
      tenantId: 'tenant-1',
      headers: { 'x-idempotency-key': 'k1' },
      url: '/items?ignored=true',
      body: { b: 2, a: 1 },
    };

    await expect(lastValueFrom(interceptor.intercept(
      httpContextWithResponse(baseRequest, firstResponse) as never,
      next,
    ))).resolves.toEqual({ ok: true });
    expect(firstResponse.setHeader).toHaveBeenCalledWith('X-Idempotency-Key', 'k1');

    const replayResponse = responseStub();
    await expect(lastValueFrom(interceptor.intercept(
      httpContextWithResponse({ ...baseRequest, body: { a: 1, b: 2 } }, replayResponse) as never,
      next,
    ))).resolves.toEqual({ ok: true });
    expect(replayResponse.status).toHaveBeenCalledWith(201);
    expect(replayResponse.setHeader).toHaveBeenCalledWith('X-Idempotency-Replay', 'true');
    expect(next.handle).toHaveBeenCalledTimes(1);

    expect(() => interceptor.intercept(
      httpContextWithResponse({ ...baseRequest, body: { a: 99 } }, responseStub()) as never,
      next,
    )).toThrow(ConflictException);
    interceptor.onModuleDestroy();
  });

  it('waits on in-flight in-memory work for concurrent matching writes', async () => {
    let resolveBody!: (body: unknown) => void;
    const bodyPromise = new Promise((resolve) => {
      resolveBody = resolve;
    });
    const interceptor = new IdempotencyInterceptor({ ttlMs: 10_000, cacheCleanupMs: 10_000 });
    const next = { handle: vi.fn(() => from(bodyPromise)) };
    const request = {
      method: 'POST',
      tenantId: 'tenant-1',
      headers: { 'x-idempotency-key': 'k2' },
      url: '/slow',
      body: ['stable'],
    };

    const first = lastValueFrom(interceptor.intercept(
      httpContextWithResponse(request, responseStub(202)) as never,
      next,
    ));
    const secondResponse = responseStub();
    const second = lastValueFrom(interceptor.intercept(
      httpContextWithResponse(request, secondResponse) as never,
      next,
    ));
    resolveBody({ complete: true });

    await expect(first).resolves.toEqual({ complete: true });
    await expect(second).resolves.toEqual({ complete: true });
    expect(secondResponse.status).toHaveBeenCalledWith(202);
    expect(next.handle).toHaveBeenCalledTimes(1);
    interceptor.onModuleDestroy();
  });

  it('uses durable entries, reservations, races, fallbacks, and cleanup branches', async () => {
    const contextSnapshots: unknown[] = [];
    const store: IdempotencyStore = {
      lookup: vi
        .fn()
        .mockImplementationOnce(async (ctx) => {
          contextSnapshots.push(ctx);
          return {
            requestFingerprint: ctx.requestFingerprint,
            statusCode: null,
            body: null,
            expiresAt: Date.now() + 1000,
          };
        })
        .mockImplementationOnce(async (ctx) => ({
          requestFingerprint: ctx.requestFingerprint,
          statusCode: 202,
          body: { ready: true },
          expiresAt: Date.now() + 1000,
        }))
        .mockImplementationOnce(async () => null)
        .mockImplementationOnce(async (ctx) => ({
          requestFingerprint: ctx.requestFingerprint,
          statusCode: 203,
          body: { raced: true },
          expiresAt: Date.now() + 1000,
        }))
        .mockImplementationOnce(async () => null)
        .mockImplementationOnce(async () => null),
      reserve: vi.fn(async () => false),
      persistResponse: vi.fn(async () => false),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor({
      waitAttempts: 1,
      waitIntervalMs: 0,
      ttlMs: 10_000,
      cacheCleanupMs: 10_000,
    }, store);
    const request = {
      method: 'POST',
      tenantId: 'tenant-1',
      headers: { 'x-idempotency-key': 'durable' },
      originalUrl: '/durable?x=1',
      body: { a: 1 },
    };

    await expect(lastValueFrom(interceptor.intercept(
      httpContextWithResponse(request, responseStub()) as never,
      { handle: () => of({ unused: true }) },
    ))).resolves.toEqual({ ready: true });
    expect(contextSnapshots[0]).toMatchObject({ tenantId: 'tenant-1', idempotencyKey: 'durable' });

    await expect(lastValueFrom(interceptor.intercept(
      httpContextWithResponse({ ...request, headers: { 'x-idempotency-key': 'race' } }, responseStub()) as never,
      { handle: () => of({ unused: true }) },
    ))).resolves.toEqual({ raced: true });

    const fallbackResponse = responseStub(204);
    await expect(lastValueFrom(interceptor.intercept(
      httpContextWithResponse({ ...request, headers: { 'x-idempotency-key': 'fallback' } }, fallbackResponse) as never,
      { handle: () => of({ fallback: true }) },
    ))).resolves.toEqual({ fallback: true });
    expect(fallbackResponse.setHeader).toHaveBeenCalledWith('X-Idempotency-Key', 'fallback');

    const readyRaceStore: IdempotencyStore = {
      lookup: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockImplementationOnce(async (ctx) => ({
          requestFingerprint: ctx.requestFingerprint,
          statusCode: 206,
          body: { becameReady: true },
          expiresAt: Date.now() + 1000,
        })),
      reserve: vi.fn(async () => false),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
    };
    const readyRaceResponse = responseStub();
    await expect(lastValueFrom(new IdempotencyInterceptor({
      waitAttempts: 1,
      waitIntervalMs: 0,
    }, readyRaceStore).intercept(
      httpContextWithResponse({ ...request, headers: { 'x-idempotency-key': 'ready-race' } }, readyRaceResponse) as never,
      { handle: () => of({ unused: true }) },
    ))).resolves.toEqual({ becameReady: true });
    expect(readyRaceResponse.status).toHaveBeenCalledWith(206);
    interceptor.onModuleDestroy();
  });

  it('clears durable reservations on handler errors and enforces strict race failure', async () => {
    const strictStore: IdempotencyStore = {
      lookup: vi.fn(async () => null),
      reserve: vi.fn(async () => false),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
    };
    await expect(lastValueFrom(new IdempotencyInterceptor({
      durableStrict: true,
      waitAttempts: 1,
      waitIntervalMs: 0,
    }, strictStore).intercept(
      httpContextWithResponse({
        method: 'POST',
        tenantId: 'tenant-1',
        headers: { 'x-idempotency-key': 'strict' },
        url: '/strict',
      }, responseStub()) as never,
      { handle: () => of({}) },
    ))).rejects.toBeInstanceOf(ServiceUnavailableException);

    const errorStore: IdempotencyStore = {
      lookup: vi.fn(async () => null),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
    };
    await expect(lastValueFrom(new IdempotencyInterceptor({}, errorStore).intercept(
      httpContextWithResponse({
        method: 'POST',
        tenantId: 'tenant-1',
        headers: { 'x-idempotency-key': 'error' },
        url: '/error',
      }, responseStub()) as never,
      { handle: () => throwError(() => new Error('handler failed')) },
    ))).rejects.toThrow('handler failed');
    expect(errorStore.clearReservation).toHaveBeenCalled();
  });

  it('covers durable direct replay, conflict, wait timeout, and cache cleanup', async () => {
    const directStore: IdempotencyStore = {
      lookup: vi.fn(async (ctx) => ({
        requestFingerprint: ctx.requestFingerprint,
        statusCode: 207,
        body: { direct: true },
        expiresAt: Date.now() + 1000,
      })),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
    };
    const directResponse = responseStub();
    await expect(lastValueFrom(new IdempotencyInterceptor({}, directStore).intercept(
      httpContextWithResponse({
        method: 'POST',
        tenantId: 'tenant-1',
        headers: { 'x-idempotency-key': 'direct' },
        url: '/direct',
        body: { a: 1 },
      }, directResponse) as never,
      { handle: () => of({ unused: true }) },
    ))).resolves.toEqual({ direct: true });
    expect(directResponse.status).toHaveBeenCalledWith(207);

    const conflictStore: IdempotencyStore = {
      lookup: vi.fn(async () => ({
        requestFingerprint: 'different',
        statusCode: 200,
        body: { direct: true },
        expiresAt: Date.now() + 1000,
      })),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
    };
    await expect(lastValueFrom(new IdempotencyInterceptor({}, conflictStore).intercept(
      httpContextWithResponse({
        method: 'POST',
        tenantId: 'tenant-1',
        headers: { 'x-idempotency-key': 'direct' },
        url: '/direct',
        body: { a: 1 },
      }, responseStub()) as never,
      { handle: () => of({ unused: true }) },
    ))).rejects.toBeInstanceOf(ConflictException);

    const timeoutStore: IdempotencyStore = {
      lookup: vi.fn(async () => null),
      reserve: vi.fn(async () => false),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
    };
    await expect(lastValueFrom(new IdempotencyInterceptor({
      waitAttempts: 2,
      waitIntervalMs: 0,
    }, timeoutStore).intercept(
      httpContextWithResponse({
        method: 'POST',
        tenantId: 'tenant-1',
        headers: { 'x-idempotency-key': 'timeout' },
        url: '/timeout',
      }, responseStub()) as never,
      { handle: () => of({ afterTimeout: true }) },
    ))).resolves.toEqual({ afterTimeout: true });
    expect(timeoutStore.lookup).toHaveBeenCalledTimes(3);

    const conflictInFlightStore: IdempotencyStore = {
      lookup: vi
        .fn()
        .mockImplementationOnce(async (ctx) => ({
          requestFingerprint: ctx.requestFingerprint,
          statusCode: null,
          body: null,
          expiresAt: Date.now() + 1000,
        }))
        .mockImplementation(async (ctx) => ({
          requestFingerprint: ctx.requestFingerprint,
          statusCode: null,
          body: null,
          expiresAt: Date.now() + 1000,
        })),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
    };
    await expect(lastValueFrom(new IdempotencyInterceptor({
      waitAttempts: 2,
      waitIntervalMs: 0,
    }, conflictInFlightStore).intercept(
      httpContextWithResponse({
        method: 'POST',
        tenantId: 'tenant-1',
        headers: { 'x-idempotency-key': 'busy' },
        url: '/busy',
      }, responseStub()) as never,
      { handle: () => of({ unused: true }) },
    ))).rejects.toBeInstanceOf(ConflictException);

    const persistFallbackStore: IdempotencyStore = {
      lookup: vi.fn(async () => null),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => false),
      clearReservation: vi.fn(async () => undefined),
    };
    const persistFallbackResponse = responseStub(undefined);
    await expect(lastValueFrom(new IdempotencyInterceptor({}, persistFallbackStore).intercept(
      httpContextWithResponse({
        method: 'POST',
        tenantId: 'tenant-1',
        headers: { 'x-idempotency-key': 'persist-fallback' },
        url: '/persist-fallback',
      }, persistFallbackResponse) as never,
      { handle: () => of({ persisted: false }) },
    ))).resolves.toEqual({ persisted: false });
    expect(persistFallbackResponse.setHeader).toHaveBeenCalledWith('X-Idempotency-Key', 'persist-fallback');

    const strictPersistStore: IdempotencyStore = {
      lookup: vi.fn(async () => null),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => false),
      clearReservation: vi.fn(async () => undefined),
    };
    await expect(lastValueFrom(new IdempotencyInterceptor({ durableStrict: true }, strictPersistStore).intercept(
      httpContextWithResponse({
        method: 'POST',
        tenantId: 'tenant-1',
        headers: { 'x-idempotency-key': 'strict-persist' },
        url: '/strict-persist',
      }, responseStub()) as never,
      { handle: () => of({ persisted: false }) },
    ))).rejects.toBeInstanceOf(ServiceUnavailableException);

    const interceptor = new IdempotencyInterceptor({ cacheCleanupMs: 10_000 });
    const cache = (interceptor as unknown as { cache: Map<string, { expiresAt: number }> }).cache;
    cache.set('expired', { expiresAt: Date.now() - 1 });
    cache.set('fresh', { expiresAt: Date.now() + 10_000 });
    (interceptor as unknown as { cleanup: () => void }).cleanup();
    expect([...cache.keys()]).toEqual(['fresh']);
    interceptor.onModuleDestroy();
  });
});

describe('backend rate-limit behavior', () => {
  it('bypasses health checks and enforces in-memory buckets', async () => {
    const guard = new RateLimitGuard({ limit: 1, ttlSeconds: 60 });
    await expect(guard.canActivate(httpContext({
      headers: {},
      path: '/api/v1/system/health/ready',
    }) as never)).resolves.toBe(true);

    const request = { headers: {}, ip: '127.0.0.1', method: 'POST', url: '/items' };
    await expect(guard.canActivate(httpContext(request) as never)).resolves.toBe(true);
    await expect(guard.canActivate(httpContext(request) as never)).rejects.toBeInstanceOf(HttpException);
  });

  it('resets expired buckets and prunes overflow entries', async () => {
    let now = 1_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const guard = new RateLimitGuard({ limit: 1, ttlSeconds: 1, cleanupEvery: 1, maxBuckets: 1 });
      await expect(guard.canActivate(httpContext({
        headers: {},
        ip: 'a',
        method: 'GET',
        originalUrl: '/one',
      }) as never)).resolves.toBe(true);
      now = 3_000;
      await expect(guard.canActivate(httpContext({
        headers: {},
        ip: 'a',
        method: 'GET',
        originalUrl: '/one',
      }) as never)).resolves.toBe(true);
      await expect(guard.canActivate(httpContext({
        headers: {},
        ip: 'b',
        method: 'GET',
        originalUrl: '/two',
      }) as never)).resolves.toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('uses distributed stores, cleanup, fallback, and strict failures', async () => {
    const store: RateLimitStore = {
      increment: vi.fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('store down')),
      cleanup: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('cleanup down')),
    };
    const guard = new RateLimitGuard({ limit: 1, cleanupEvery: 1 }, store);
    const request = { headers: {}, ip: 'ip', method: 'GET', url: '/distributed', tenantId: 'tenant-1' };

    await expect(guard.canActivate(httpContext(request) as never)).resolves.toBe(true);
    expect(store.cleanup).toHaveBeenCalledTimes(1);
    await expect(guard.canActivate(httpContext(request) as never)).rejects.toBeInstanceOf(HttpException);
    await expect(guard.canActivate(httpContext({ ...request, url: '/fallback-null' }) as never)).resolves.toBe(true);
    await expect(guard.canActivate(httpContext({ ...request, url: '/fallback-error' }) as never)).resolves.toBe(true);

    const strict = new RateLimitGuard({ distributedStrict: true }, {
      increment: vi.fn(async () => {
        throw new Error('store down');
      }),
    });
    await expect(strict.canActivate(httpContext(request) as never)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const delayedCleanupStore: RateLimitStore = {
      increment: vi.fn(async () => 1),
      cleanup: vi.fn(async () => undefined),
    };
    const delayedCleanup = new RateLimitGuard({ cleanupEvery: 2 }, delayedCleanupStore);
    await expect(delayedCleanup.canActivate(httpContext({ ...request, url: '/delayed-1' }) as never)).resolves.toBe(true);
    expect(delayedCleanupStore.cleanup).not.toHaveBeenCalled();
    await expect(delayedCleanup.canActivate(httpContext({ ...request, url: '/delayed-2' }) as never)).resolves.toBe(true);
    expect(delayedCleanupStore.cleanup).toHaveBeenCalledTimes(1);
  });

  it('covers in-memory bucket increment, cleanup no-op, cleanup error, and overflow deletion', async () => {
    const guard = new RateLimitGuard({ limit: 3, ttlSeconds: 60, cleanupEvery: 10, maxBuckets: 1 });
    const request = { headers: {}, ip: 'ip', method: 'GET', url: '/bucket' };
    await expect(guard.canActivate(httpContext(request) as never)).resolves.toBe(true);
    await expect(guard.canActivate(httpContext(request) as never)).resolves.toBe(true);

    const buckets = (guard as unknown as { buckets: Map<string, { resetAt: number; count: number }> }).buckets;
    (guard as unknown as { maybeCleanupInMemory: () => void }).maybeCleanupInMemory();
    buckets.set('old', { count: 1, resetAt: Date.now() - 1 });
    (guard as unknown as { maybeCleanupInMemory: () => void }).maybeCleanupInMemory();
    expect(buckets.has('old')).toBe(false);
    buckets.set('one', { count: 1, resetAt: Date.now() + 1000 });
    buckets.set('two', { count: 1, resetAt: Date.now() + 1000 });
    (guard as unknown as { maybeCleanupInMemory: () => void }).maybeCleanupInMemory();
    expect(buckets.size).toBe(1);

    const cleanupFail = new RateLimitGuard({ cleanupEvery: 1 }, {
      increment: vi.fn(async () => 1),
      cleanup: vi.fn(async () => {
        throw new Error('cleanup failed');
      }),
    });
    await expect(cleanupFail.canActivate(httpContext({
      headers: {},
      ip: 'ip',
      method: 'GET',
      url: '/x',
      tenantId: 'tenant-1',
    }) as never))
      .resolves.toBe(true);
  });
});
