import type { ExecutionContext } from '@nestjs/common';
import { HttpException, SetMetadata } from '@nestjs/common';
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
      consume: jest.fn(async () => {
        throw new Error('should not run');
      }),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: jest.fn(async () => ({ bucket: 'tenant', scope: 'ignored', cost: 1, limit: 5, windowSeconds: 60 })),
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
      consume: jest.fn(async (context) => {
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
      resolve: jest.fn(async () => ({ bucket: 'tenant', scope: 'documents.write', cost: 1, limit: 10, windowSeconds: 60 })),
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
      consume: jest.fn(async () => ({
        allowed: false,
        limit: 10,
        remaining: 0,
        resetAtEpochMs: 1_700_000_010_000,
        retryAfterSeconds: 10,
        used: 10,
      })),
    };
    const policyResolver: RateLimitPolicyResolver = {
      resolve: jest.fn(async () => ({ bucket: 'route', scope: 'documents.write', cost: 5, limit: 10, windowSeconds: 60 })),
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
});
