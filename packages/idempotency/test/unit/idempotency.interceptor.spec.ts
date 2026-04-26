import type { CallHandler, ExecutionContext } from '@nestjs/common';
import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { STYNX_IDEMPOTENT_ROUTE } from '../../src/constants';
import { IdempotencyInterceptor } from '../../src/idempotency.interceptor';
import type {
  IdempotencyBackend,
  IdempotencyDecisionContext,
  IdempotencyStore,
  IdempotencyStoredEntry,
} from '../../src/types';

function createExecutionContext(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
  handler: Function,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => handler,
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

function createResponseStub() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status: jest.fn(function status(this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    setHeader: jest.fn(function setHeader(
      this: { headers: Record<string, string> },
      name: string,
      value: string,
    ) {
      this.headers[name] = value;
    }),
  };
}

function createReflector(): Reflector {
  const handler = function annotatedHandler() {
    return undefined;
  };
  Reflect.defineMetadata(STYNX_IDEMPOTENT_ROUTE, { headerName: 'Idempotency-Key' }, handler);
  const reflector = new Reflector();
  Reflect.defineProperty(reflector, '__handler__', { value: handler, configurable: true });
  return reflector;
}

function annotatedHandler(reflector: Reflector): Function {
  return (reflector as Reflector & { __handler__?: Function }).__handler__!;
}

function createBackend(initialEntry?: IdempotencyStoredEntry | null): IdempotencyBackend {
  let entry = initialEntry ?? null;
  let lockToken: string | null = null;
  return {
    get: jest.fn(async () => entry),
    set: jest.fn(async (_context, next) => {
      entry = next;
    }),
    acquireLock: jest.fn(async (_context, token) => {
      if (lockToken) {
        return false;
      }
      lockToken = token;
      return true;
    }),
    releaseLock: jest.fn(async (_context, token) => {
      if (lockToken === token) {
        lockToken = null;
      }
    }),
    isLocked: jest.fn(async () => lockToken !== null),
  };
}

describe('IdempotencyInterceptor', () => {
  it('rejects annotated routes without the configured header', async () => {
    const reflector = createReflector();
    const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, createBackend());
    const request = {
      method: 'POST',
      url: '/v1/items',
      headers: {},
      body: { a: 1 },
      tenantId: 'tenant-a',
    };
    const response = createResponseStub();
    const next: CallHandler = { handle: () => of({ ok: true }) };
    expect(() =>
      interceptor.intercept(createExecutionContext(request, response, annotatedHandler(reflector)), next),
    ).toThrow(BadRequestException);
  });

  it('bypasses non-annotated routes', async () => {
    const reflector = new Reflector();
    const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, createBackend());
    const request = {
      method: 'POST',
      url: '/v1/items',
      headers: {},
    };
    const response = createResponseStub();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await expect(
      lastValueFrom(interceptor.intercept(createExecutionContext(request, response, function plain() {}), next)),
    ).resolves.toEqual({ ok: true });
  });

  it('replays cached responses for the same key and payload', async () => {
    const reflector = createReflector();
    const backend = createBackend();
    const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, backend);
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: 'tenant-a',
      actor: { id: 'user-a' },
      headers: { 'Idempotency-Key': 'k1' },
      body: { a: 1 },
    };
    const response1 = createResponseStub();
    const response2 = createResponseStub();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const first = await lastValueFrom(
      interceptor.intercept(createExecutionContext(request, response1, annotatedHandler(reflector)), next),
    );
    const second = await lastValueFrom(
      interceptor.intercept(createExecutionContext(request, response2, annotatedHandler(reflector)), next),
    );

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(response2.status).toHaveBeenCalledWith(200);
    expect(response2.setHeader).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
  });

  it('returns 422 when the same key is reused with a different body', async () => {
    const reflector = createReflector();
    const backend = createBackend();
    const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, backend);
    const requestA = {
      method: 'POST',
      url: '/v1/items',
      tenantId: 'tenant-a',
      actor: { id: 'user-a' },
      headers: { 'Idempotency-Key': 'k1' },
      body: { a: 1 },
    };
    const requestB = {
      ...requestA,
      body: { a: 2 },
    };
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await lastValueFrom(
      interceptor.intercept(createExecutionContext(requestA, createResponseStub(), annotatedHandler(reflector)), next),
    );

    await expect(
      lastValueFrom(
        interceptor.intercept(createExecutionContext(requestB, createResponseStub(), annotatedHandler(reflector)), next),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('uses the durable store when configured', async () => {
    const reflector = createReflector();
    const store: IdempotencyStore = {
      lookup: jest.fn(async (_ctx: IdempotencyDecisionContext) => null),
      reserve: jest.fn(async () => true),
      persistResponse: jest.fn(async () => true),
      clearReservation: jest.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(reflector, {}, store, createBackend());
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: 'tenant-a',
      actor: { id: 'user-a' },
      headers: { 'Idempotency-Key': 'k1' },
      body: { a: 1 },
    };
    const response = createResponseStub();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await expect(
      lastValueFrom(interceptor.intercept(createExecutionContext(request, response, annotatedHandler(reflector)), next)),
    ).resolves.toEqual({ ok: true });
    expect(store.reserve).toHaveBeenCalledTimes(1);
    expect(store.persistResponse).toHaveBeenCalledTimes(1);
  });

  it('does not persist 5xx responses and allows retry', async () => {
    const reflector = createReflector();
    const store: IdempotencyStore = {
      lookup: jest.fn(async (_ctx: IdempotencyDecisionContext) => null),
      reserve: jest.fn(async () => true),
      persistResponse: jest.fn(async () => true),
      clearReservation: jest.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(reflector, {}, store, createBackend());
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: 'tenant-a',
      actor: { id: 'user-a' },
      headers: { 'Idempotency-Key': 'k1' },
      body: { a: 1 },
    };
    const response = createResponseStub();
    const next: CallHandler = {
      handle: () =>
        throwError(() => new HttpException({ message: 'boom' }, 500)),
    };

    await expect(
      lastValueFrom(interceptor.intercept(createExecutionContext(request, response, annotatedHandler(reflector)), next)),
    ).rejects.toBeInstanceOf(HttpException);

    expect(store.persistResponse).not.toHaveBeenCalled();
    expect(store.clearReservation).toHaveBeenCalled();
  });

  it('throws service unavailable when lock cannot be obtained in strict mode', async () => {
    const reflector = createReflector();
    const backend: IdempotencyBackend = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
      acquireLock: jest.fn(async () => false),
      releaseLock: jest.fn(async () => undefined),
      isLocked: jest.fn(async () => false),
    };
    const interceptor = new IdempotencyInterceptor(
      reflector,
      { durableStrict: true, waitAttempts: 1, waitIntervalMs: 1 },
      undefined,
      backend,
    );
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: 'tenant-a',
      actor: { id: 'user-a' },
      headers: { 'Idempotency-Key': 'k1' },
      body: { a: 1 },
    };
    const response = createResponseStub();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await expect(
      lastValueFrom(interceptor.intercept(createExecutionContext(request, response, annotatedHandler(reflector)), next)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
