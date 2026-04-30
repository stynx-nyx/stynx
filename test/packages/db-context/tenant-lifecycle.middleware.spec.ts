import { BadRequestException } from '@nestjs/common';
import {
  createTenantLifecycleMiddleware,
  TenantLifecycleMiddleware,
  type TenantLifecycleNext,
} from '../../../packages/backend/src/db-context/tenant-lifecycle.middleware';
import type { ResponseLike } from '../../../packages/backend/src/db-context/request-db-client-lifecycle';

function createResponseStub() {
  const listeners: Record<'finish' | 'close', Array<() => void>> = {
    finish: [],
    close: [],
  };
  const response: ResponseLike = {
    once: jest.fn((event: 'finish' | 'close', listener: () => void) => {
      listeners[event].push(listener);
      return response;
    }),
  };

  return {
    response,
    emit(event: 'finish' | 'close') {
      for (const listener of listeners[event]) {
        listener();
      }
    },
  };
}

describe('TenantLifecycleMiddleware', () => {
  it('sets tenantId and releases tenant-bound client on response events', () => {
    const middleware = new TenantLifecycleMiddleware();
    const release = jest.fn(() => undefined);
    const request: Record<string, unknown> = {
      headers: {
        'x-tenant-id': '11111111-1111-1111-1111-111111111111',
      },
      pgClient: { release },
    };
    const { response, emit } = createResponseStub();
    const next = jest.fn((_error?: unknown) => undefined) as TenantLifecycleNext;

    middleware.use(request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(request.tenantId).toBe('11111111-1111-1111-1111-111111111111');

    emit('finish');
    emit('close');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('throws when required tenant header is missing', () => {
    const middleware = new TenantLifecycleMiddleware();
    const request: Record<string, unknown> = {
      headers: {},
    };

    expect(() =>
      middleware.use(request, undefined, () => undefined),
    ).toThrow(BadRequestException);
  });

  it('throws when tenant header is not a UUID', () => {
    const middleware = new TenantLifecycleMiddleware();
    const request: Record<string, unknown> = {
      headers: {
        'x-tenant-id': 'tenant-a',
      },
    };

    expect(() =>
      middleware.use(request, undefined, () => undefined),
    ).toThrow(BadRequestException);
  });

  it('allows missing tenant header when requirement is disabled', () => {
    const middleware = new TenantLifecycleMiddleware({
      requireTenantHeader: false,
    });
    const request: Record<string, unknown> = {
      headers: {},
    };
    const next = jest.fn((_error?: unknown) => undefined) as TenantLifecycleNext;

    middleware.use(request, undefined, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(request.tenantId).toBeUndefined();
  });

  it('exposes factory helper for middleware-consumer use', () => {
    const handler = createTenantLifecycleMiddleware({
      requireTenantHeader: false,
      enforceTenantUuid: false,
    });
    const request: Record<string, unknown> = { headers: {} };
    const next = jest.fn((_error?: unknown) => undefined) as TenantLifecycleNext;

    handler(request, undefined, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
