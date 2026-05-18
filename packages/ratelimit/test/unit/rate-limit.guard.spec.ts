import type { ExecutionContext } from '@nestjs/common';
import { HttpException, ServiceUnavailableException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STYNX_SYSTEM_ROUTE } from '@stynx/auth';
import { STYNX_RATE_LIMIT_ROUTE } from '../../src/constants';
import { InMemoryRateLimitMetrics } from '../../src/metrics';
import { RateLimitGuard } from '../../src/rate-limit.guard';
import type { RateLimitPolicyResolver, RateLimitStore } from '../../src/types';

interface ResponseStub {
  headers: Record<string, string>;
  setHeader(name: string, value: string): void;
}

function createResponse(): ResponseStub {
  return {
    headers: {},
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}

function createExecutionContext(
  request: Record<string, unknown>,
  handler: Function,
  controller: Function,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

class TestController {}

describe('RateLimitGuard', () => {
  const reflector = new Reflector();

  it('bypasses health-check routes without touching the store', async () => {
    const store: RateLimitStore = {
      consume: vi.fn(async () => {
        throw new Error('should not run');
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 'ignored', cost: 1, limit: 5, windowSeconds: 60 })),
    };
    const handler = () => undefined;
    const request = {
      headers: {},
      method: 'GET',
      path: '/api/v1/system/health',
      ip: '127.0.0.1',
      res: createResponse(),
    };

    const guard = new RateLimitGuard(reflector, { healthCheckPathPrefixes: ['/api/v1/system/health'] }, store, policyResolver);
    await expect(guard.canActivate(createExecutionContext(request, handler, TestController))).resolves.toBe(true);
    expect(store.consume).not.toHaveBeenCalled();
  });

  it('bypasses routes marked as @System()', async () => {
    const handler = function systemHandler() {
      return undefined;
    };
    SetMetadata(STYNX_SYSTEM_ROUTE, true)(handler, undefined as never, undefined as never);
    const guard = new RateLimitGuard(reflector, {}, undefined, undefined);

    await expect(
      guard.canActivate(
        createExecutionContext(
          { headers: {}, method: 'POST', path: '/internal', res: createResponse() },
          handler,
          TestController,
        ),
      ),
    ).resolves.toBe(true);
  });

  it('applies headers and allows when the store accepts the request', async () => {
    const handler = function rateLimitedHandler() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 'documents.write', cost: 1 }, handler);
    const response = createResponse();
    const store: RateLimitStore = {
      consume: vi.fn(async (context) => {
        expect(context.bucketKey).toBe('documents.write:tenant:tenant-a');
        return {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAtEpochMs: 1_700_000_000_000,
          retryAfterSeconds: 60,
          used: 1,
        };
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 'documents.write', cost: 1, limit: 10, windowSeconds: 60 })),
    };
    const metrics = new InMemoryRateLimitMetrics();
    const guard = new RateLimitGuard(reflector, {}, store, policyResolver, metrics);

    await expect(
      guard.canActivate(
        createExecutionContext(
          {
            headers: {},
            method: 'POST',
            path: '/documents',
            ip: '127.0.0.1',
            tenantId: 'tenant-a',
            res: response,
          },
          handler,
          TestController,
        ),
      ),
    ).resolves.toBe(true);

    expect(response.headers['X-RateLimit-Limit']).toBe('10');
    expect(response.headers['X-RateLimit-Remaining']).toBe('9');
    expect(response.headers['X-RateLimit-Reset']).toBe(String(Math.ceil(1_700_000_000_000 / 1000)));
    expect(metrics.histogramSnapshot()['documents.write']?.count).toBe(1);
  });

  it('throws 429, emits Retry-After, and increments metrics on block', async () => {
    const handler = function blockedHandler() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'route', scope: 'documents.write', cost: 5 }, handler);
    const response = createResponse();
    const metrics = new InMemoryRateLimitMetrics();
    const store: RateLimitStore = {
      consume: vi.fn(async () => ({
        allowed: false,
        limit: 10,
        remaining: 0,
        resetAtEpochMs: 1_700_000_010_000,
        retryAfterSeconds: 10,
        used: 10,
      })),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'route', scope: 'documents.write', cost: 5, limit: 10, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(reflector, {}, store, policyResolver, metrics);

    await expect(
      guard.canActivate(
        createExecutionContext(
          {
            headers: {},
            method: 'POST',
            path: '/documents',
            ip: '127.0.0.1',
            tenantId: 'tenant-a',
            res: response,
          },
          handler,
          TestController,
        ),
      ),
    ).rejects.toBeInstanceOf(HttpException);

    expect(response.headers['Retry-After']).toBe('10');
    expect(metrics.snapshot()).toEqual({ 'documents.write': 1 });
  });

  it('allows the request when no rate-limit metadata is set on the handler', async () => {
    const handler = function unmetered() {
      return undefined;
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(),
    };
    const guard = new RateLimitGuard(reflector, {}, undefined, policyResolver);
    await expect(
      guard.canActivate(
        createExecutionContext(
          { headers: {}, method: 'GET', path: '/x', res: createResponse() },
          handler,
          TestController,
        ),
      ),
    ).resolves.toBe(true);
    expect(policyResolver.resolve).not.toHaveBeenCalled();
  });

  it('uses default options when only the reflector is provided', async () => {
    const handler = function defaultOptions() {
      return undefined;
    };
    const guard = new RateLimitGuard(reflector);

    await expect(
      guard.canActivate(
        createExecutionContext(
          { headers: {}, method: 'GET', path: '/unmetered', res: createResponse() },
          handler,
          TestController,
        ),
      ),
    ).resolves.toBe(true);
  });

  it('allows the request when no policyResolver is wired even if metadata is set', async () => {
    const handler = function noResolver() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    const guard = new RateLimitGuard(reflector, {}, undefined, undefined);
    await expect(
      guard.canActivate(
        createExecutionContext(
          { headers: {}, method: 'GET', path: '/x', res: createResponse() },
          handler,
          TestController,
        ),
      ),
    ).resolves.toBe(true);
  });

  it('open-circuits to allow when the store is missing', async () => {
    const handler = function noStore() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 5, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(reflector, {}, undefined, policyResolver);
    await expect(
      guard.canActivate(
        createExecutionContext(
          { headers: {}, method: 'GET', path: '/x', tenantId: 't1', res: createResponse() },
          handler,
          TestController,
        ),
      ),
    ).resolves.toBe(true);
  });

  it('open-circuits to allow when the store throws a non-Http error', async () => {
    const handler = function storeBoom() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    const store: RateLimitStore = {
      consume: vi.fn(async () => {
        throw new Error('redis down');
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 5, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(reflector, {}, store, policyResolver);
    await expect(
      guard.canActivate(
        createExecutionContext(
          { headers: {}, method: 'GET', path: '/x', tenantId: 't1', res: createResponse() },
          handler,
          TestController,
        ),
      ),
    ).resolves.toBe(true);
  });

  it('rethrows when the store throws ServiceUnavailableException', async () => {
    const handler = function storeUnavailable() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    const store: RateLimitStore = {
      consume: vi.fn(async () => {
        throw new ServiceUnavailableException('down');
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 5, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(reflector, {}, store, policyResolver);
    await expect(
      guard.canActivate(
        createExecutionContext(
          { headers: {}, method: 'GET', path: '/x', tenantId: 't1', res: createResponse() },
          handler,
          TestController,
        ),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws 503 under distributedStrict when the store returns null (resolver missing)', async () => {
    const handler = function strictBackend() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    const store: RateLimitStore = {
      consume: vi.fn(async () => {
        throw new Error('transient');
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 5, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(
      reflector,
      { distributedStrict: true },
      store,
      policyResolver,
    );
    await expect(
      guard.canActivate(
        createExecutionContext(
          { headers: {}, method: 'GET', path: '/x', tenantId: 't1', res: createResponse() },
          handler,
          TestController,
        ),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('open-circuits on backend errors when distributedStrict is explicitly false', async () => {
    const handler = function strictDisabled() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    const store: RateLimitStore = {
      consume: vi.fn(async () => {
        throw new Error('transient');
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 5, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(
      reflector,
      { distributedStrict: false, healthCheckPathPrefixes: [] },
      store,
      policyResolver,
    );

    await expect(
      guard.canActivate(
        createExecutionContext(
          { headers: {}, method: 'GET', path: '/x', tenantId: 't1', res: createResponse() },
          handler,
          TestController,
        ),
      ),
    ).resolves.toBe(true);
  });

  it('builds bucket keys for ip / user / route buckets', async () => {
    const cases = [
      { bucket: 'ip' as const, expectedKey: 's:ip:9.9.9.9' },
      { bucket: 'user' as const, expectedKey: 's:user:user-x' },
      { bucket: 'route' as const, expectedKey: 's:route:tenant-a:POST:/x' },
    ];
    for (const { bucket, expectedKey } of cases) {
      const handler = function h() {
        return undefined;
      };
      Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket, scope: 's', cost: 1 }, handler);
      let observedKey: string | undefined;
      const store: RateLimitStore = {
        consume: vi.fn(async (ctx) => {
          observedKey = ctx.bucketKey;
          return { allowed: true, limit: 1, remaining: 1, resetAtEpochMs: 0, retryAfterSeconds: 0, used: 1 };
        }),
      };
      const policyResolver: RateLimitPolicyResolver = {
        resolve: vi.fn(async () => ({ bucket, scope: 's', cost: 1, limit: 1, windowSeconds: 60 })),
      };
      const guard = new RateLimitGuard(reflector, {}, store, policyResolver);
      await guard.canActivate(
        createExecutionContext(
          {
            headers: {},
            method: 'POST',
            path: '/x',
            ip: '9.9.9.9',
            tenantId: 'tenant-a',
            user: { id: 'user-x' },
            res: createResponse(),
          },
          handler,
          TestController,
        ),
      );
      expect(observedKey).toBe(expectedKey);
    }
  });

  it('builds fallback bucket keys from originalUrl, url, defaults, and alternate principals', async () => {
    const cases = [
      {
        bucket: 'ip' as const,
        request: { headers: {}, originalUrl: '/from-original' },
        expectedKey: 's:ip:unknown',
      },
      {
        bucket: 'route' as const,
        request: { headers: {}, url: '/from-url', tenantId: 'tenant-url' },
        expectedKey: 's:route:tenant-url:GET:/from-url',
      },
      {
        bucket: 'route' as const,
        request: { headers: {} },
        expectedKey: 's:route:public:GET:/',
      },
      {
        bucket: 'user' as const,
        request: { headers: {}, principal: { id: 'principal-user' } },
        expectedKey: 's:user:principal-user',
      },
      {
        bucket: 'user' as const,
        request: { headers: {}, actor: { id: 'actor-user' } },
        expectedKey: 's:user:actor-user',
      },
      {
        bucket: 'user' as const,
        request: { headers: {}, stynxClaims: { sub: 'claims-user', tenantId: 'claims-tenant' } },
        expectedKey: 's:user:claims-user',
      },
      {
        bucket: 'tenant' as const,
        request: { headers: {}, stynxClaims: { tenantId: 'claims-tenant' } },
        expectedKey: 's:tenant:claims-tenant',
      },
      {
        bucket: 'user' as const,
        request: { headers: {} },
        expectedKey: 's:user:anonymous',
      },
    ];

    for (const { bucket, request, expectedKey } of cases) {
      const handler = function fallbackBucket() {
        return undefined;
      };
      Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket, scope: 's', cost: 1 }, handler);
      let observedKey: string | undefined;
      const store: RateLimitStore = {
        consume: vi.fn(async (ctx) => {
          observedKey = ctx.bucketKey;
          return { allowed: true, limit: 1, remaining: 1, resetAtEpochMs: 0, retryAfterSeconds: 0, used: 1 };
        }),
      };
      const policyResolver: RateLimitPolicyResolver = {
        resolve: vi.fn(async () => ({ bucket, scope: 's', cost: 1, limit: 1, windowSeconds: 60 })),
      };
      const guard = new RateLimitGuard(reflector, {}, store, policyResolver);

      await guard.canActivate(createExecutionContext(request, handler, TestController));
      expect(observedKey).toBe(expectedKey);
    }
  });

  it('allows requests without a response object while still consuming the store', async () => {
    const handler = function noResponseObject() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    const store: RateLimitStore = {
      consume: vi.fn(async () => ({
        allowed: true,
        limit: 1,
        remaining: 0,
        resetAtEpochMs: 0,
        retryAfterSeconds: 0,
        used: 1,
      })),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 1, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(reflector, {}, store, policyResolver);

    await expect(
      guard.canActivate(createExecutionContext({ headers: {}, tenantId: 'tenant-a' }, handler, TestController)),
    ).resolves.toBe(true);
    expect(store.consume).toHaveBeenCalledTimes(1);
  });

  it('extracts tenantId + userId from a Bearer JWT payload as fallback', async () => {
    const handler = function jwtFallback() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    const claims = { sub: 'user-jwt', tenant_id: 'tenant-jwt' };
    const fakeJwt = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
    let observedKey: string | undefined;
    const store: RateLimitStore = {
      consume: vi.fn(async (ctx) => {
        observedKey = ctx.bucketKey;
        return { allowed: true, limit: 1, remaining: 1, resetAtEpochMs: 0, retryAfterSeconds: 0, used: 1 };
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 1, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(reflector, {}, store, policyResolver);
    await guard.canActivate(
      createExecutionContext(
        {
          headers: { authorization: `Bearer ${fakeJwt}` },
          method: 'GET',
          path: '/x',
          res: createResponse(),
        },
        handler,
        TestController,
      ),
    );
    expect(observedKey).toBe('s:tenant:tenant-jwt');
  });

  it('ignores malformed Bearer tokens silently', async () => {
    const handler = function malformedJwt() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    let observedKey: string | undefined;
    const store: RateLimitStore = {
      consume: vi.fn(async (ctx) => {
        observedKey = ctx.bucketKey;
        return { allowed: true, limit: 1, remaining: 1, resetAtEpochMs: 0, retryAfterSeconds: 0, used: 1 };
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 1, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(reflector, {}, store, policyResolver);
    await guard.canActivate(
      createExecutionContext(
        {
          headers: { authorization: 'Bearer not-a-jwt' },
          method: 'GET',
          path: '/x',
          res: createResponse(),
        },
        handler,
        TestController,
      ),
    );
    expect(observedKey).toBe('s:tenant:public');
  });

  it('ignores Bearer tokens whose payload is not valid JSON', async () => {
    const handler = function invalidJwtPayload() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    let observedKey: string | undefined;
    const store: RateLimitStore = {
      consume: vi.fn(async (ctx) => {
        observedKey = ctx.bucketKey;
        return { allowed: true, limit: 1, remaining: 1, resetAtEpochMs: 0, retryAfterSeconds: 0, used: 1 };
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 1, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(reflector, {}, store, policyResolver);
    await guard.canActivate(
      createExecutionContext(
        {
          headers: { authorization: `Bearer h.${Buffer.from('not json').toString('base64url')}.s` },
          method: 'GET',
          path: '/x',
          res: createResponse(),
        },
        handler,
        TestController,
      ),
    );
    expect(observedKey).toBe('s:tenant:public');
  });

  it('ignores non-string JWT subject and tenant claims', async () => {
    const handler = function numericJwtClaims() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    const fakeJwt = `h.${Buffer.from(JSON.stringify({ sub: 1, tenant_id: 2 })).toString('base64url')}.s`;
    let observedKey: string | undefined;
    const store: RateLimitStore = {
      consume: vi.fn(async (ctx) => {
        observedKey = ctx.bucketKey;
        return { allowed: true, limit: 1, remaining: 1, resetAtEpochMs: 0, retryAfterSeconds: 0, used: 1 };
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 1, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(reflector, {}, store, policyResolver);

    await guard.canActivate(
      createExecutionContext(
        { headers: { authorization: `Bearer ${fakeJwt}` }, method: 'GET', path: '/x', res: createResponse() },
        handler,
        TestController,
      ),
    );

    expect(observedKey).toBe('s:tenant:public');
  });

  it('ignores non-Bearer and non-string authorization headers', async () => {
    const cases = [
      'Basic abc',
      [42],
    ];
    for (const authorization of cases) {
      const handler = function nonBearerAuth() {
        return undefined;
      };
      Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
      let observedKey: string | undefined;
      const store: RateLimitStore = {
        consume: vi.fn(async (ctx) => {
          observedKey = ctx.bucketKey;
          return { allowed: true, limit: 1, remaining: 1, resetAtEpochMs: 0, retryAfterSeconds: 0, used: 1 };
        }),
      };
      const policyResolver: RateLimitPolicyResolver = {
        resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 1, windowSeconds: 60 })),
      };
      const guard = new RateLimitGuard(reflector, {}, store, policyResolver);
      await guard.canActivate(
        createExecutionContext(
          { headers: { authorization }, method: 'GET', path: '/x', response: createResponse() },
          handler,
          TestController,
        ),
      );
      expect(observedKey).toBe('s:tenant:public');
    }
  });

  it('accepts authorization header passed as an array (takes first element)', async () => {
    const handler = function arrayAuth() {
      return undefined;
    };
    Reflect.defineMetadata(STYNX_RATE_LIMIT_ROUTE, { bucket: 'tenant', scope: 's', cost: 1 }, handler);
    const claims = { sub: 'u', tenant_id: 'tenant-arr' };
    const fakeJwt = `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
    let observedKey: string | undefined;
    const store: RateLimitStore = {
      consume: vi.fn(async (ctx) => {
        observedKey = ctx.bucketKey;
        return { allowed: true, limit: 1, remaining: 1, resetAtEpochMs: 0, retryAfterSeconds: 0, used: 1 };
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: vi.fn(async () => ({ bucket: 'tenant', scope: 's', cost: 1, limit: 1, windowSeconds: 60 })),
    };
    const guard = new RateLimitGuard(reflector, {}, store, policyResolver);
    await guard.canActivate(
      createExecutionContext(
        {
          headers: { authorization: [`Bearer ${fakeJwt}`, 'Bearer second'] },
          method: 'GET',
          path: '/x',
          res: createResponse(),
        },
        handler,
        TestController,
      ),
    );
    expect(observedKey).toBe('s:tenant:tenant-arr');
  });
});
