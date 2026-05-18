import type { ExecutionContext } from '@nestjs/common';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { RateLimitGuard } from '../../../packages/backend/src/rate-limit/rate-limit.guard';
import type { RateLimitStore } from '../../../packages/backend/src/rate-limit/types';

function createExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  it('bypasses health-check path', async () => {
    const store: RateLimitStore = {
      increment: vi.fn(async () => 999),
    };
    const guard = new RateLimitGuard(
      {
        distributedStrict: true,
        healthCheckPathPrefixes: ['/api/v1/system/health'],
      },
      store,
    );
    const request = {
      headers: {},
      method: 'GET',
      path: '/api/v1/system/health',
      ip: '127.0.0.1',
      tenantId: 'tenant-a',
    };

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);
    expect(store.increment).not.toHaveBeenCalled();
  });

  it('enforces in-memory limit when distributed path is unavailable', async () => {
    const guard = new RateLimitGuard({ limit: 2, ttlSeconds: 60 });
    const request = {
      headers: {},
      method: 'POST',
      path: '/api/v1/users',
      ip: '127.0.0.1',
    };

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);
    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);
    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(guard.canActivate(createExecutionContext(request))).rejects.toMatchObject({
      status: 429,
    });
  });

  it('uses distributed store when tenant is present', async () => {
    const store: RateLimitStore = {
      increment: vi
        .fn<Promise<number | null>, [unknown]>()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2),
      cleanup: vi.fn(async () => undefined),
    };
    const guard = new RateLimitGuard({ limit: 2, cleanupEvery: 1 }, store);
    const request = {
      headers: {},
      method: 'POST',
      path: '/api/v1/users',
      ip: '127.0.0.1',
      tenantId: '11111111-1111-1111-1111-111111111111',
    };

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);
    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);
    expect(store.increment).toHaveBeenCalledTimes(2);
    expect(store.cleanup).toHaveBeenCalled();
  });

  it('throws 429 when distributed hits exceed limit', async () => {
    const store: RateLimitStore = {
      increment: vi.fn(async () => 3),
    };
    const guard = new RateLimitGuard({ limit: 2 }, store);
    const request = {
      headers: {},
      method: 'POST',
      path: '/api/v1/users',
      ip: '127.0.0.1',
      tenantId: '11111111-1111-1111-1111-111111111111',
    };

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toMatchObject({
      status: 429,
    });
  });

  it('throws service unavailable when strict distributed mode fails', async () => {
    const store: RateLimitStore = {
      increment: vi.fn(async () => {
        throw new Error('db down');
      }),
    };
    const guard = new RateLimitGuard({ distributedStrict: true }, store);
    const request = {
      headers: {},
      method: 'POST',
      path: '/api/v1/users',
      ip: '127.0.0.1',
      tenantId: '11111111-1111-1111-1111-111111111111',
    };

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
