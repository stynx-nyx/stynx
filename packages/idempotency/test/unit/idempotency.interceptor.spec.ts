import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { STYNX_IDEMPOTENT_ROUTE, STYNX_NO_IDEMPOTENT_ROUTE } from '../../src/constants';
import { IdempotencyInterceptor } from '../../src/idempotency.interceptor';
import type {
  IdempotencyBackend,
  IdempotencyDecisionContext,
  IdempotencyStore,
  IdempotencyStoredEntry,
} from '../../src/types';
import type { Mock } from 'vitest';

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
    status: vi.fn(function status(this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    setHeader: vi.fn(function setHeader(
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

function createDefaultHeaderReflector(): Reflector {
  const handler = function defaultHeaderHandler() {
    return undefined;
  };
  Reflect.defineMetadata(STYNX_IDEMPOTENT_ROUTE, {}, handler);
  const reflector = new Reflector();
  Reflect.defineProperty(reflector, '__handler__', { value: handler, configurable: true });
  return reflector;
}

function createNoIdempotentReflector(): Reflector {
  const handler = function noIdempotencyHandler() {
    return undefined;
  };
  Reflect.defineMetadata(STYNX_NO_IDEMPOTENT_ROUTE, true, handler);
  const reflector = new Reflector();
  Reflect.defineProperty(reflector, '__handler__', { value: handler, configurable: true });
  return reflector;
}

function createBackend(initialEntry?: IdempotencyStoredEntry | null): IdempotencyBackend {
  let entry = initialEntry ?? null;
  let lockToken: string | null = null;
  return {
    get: vi.fn(async () => entry),
    set: vi.fn(async (_context, next) => {
      entry = next;
    }),
    acquireLock: vi.fn(async (_context, token) => {
      if (lockToken) {
        return false;
      }
      lockToken = token;
      return true;
    }),
    releaseLock: vi.fn(async (_context, token) => {
      if (lockToken === token) {
        lockToken = null;
      }
    }),
    isLocked: vi.fn(async () => lockToken !== null),
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

  it('uses the default header name and rejects blank header values', async () => {
    const reflector = createDefaultHeaderReflector();
    const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, createBackend());

    expect(() =>
      interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': '   ' } },
          createResponseStub(),
          annotatedHandler(reflector),
        ),
        { handle: () => of({ ok: true }) },
      ),
    ).toThrow(BadRequestException);

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'default-key' } },
          createResponseStub(),
          annotatedHandler(reflector),
        ),
        { handle: () => of({ ok: true }) },
      )),
    ).resolves.toEqual({ ok: true });
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

  it('bypasses routes explicitly marked as non-idempotent', async () => {
    const reflector = createNoIdempotentReflector();
    const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, createBackend());
    const next: CallHandler = { handle: () => of({ skipped: true }) };

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext({ method: 'POST', url: '/v1/items', headers: {} }, createResponseStub(), annotatedHandler(reflector)),
        next,
      )),
    ).resolves.toEqual({ skipped: true });
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

  it('replays backend entries with the default status code', async () => {
    const reflector = createReflector();
    const backend: IdempotencyBackend = {
      get: vi.fn(async (ctx: IdempotencyDecisionContext) => ({
        requestFingerprint: ctx.requestFingerprint,
        body: { replayed: true },
        headers: {},
        expiresAt: Date.now() + 1000,
        status: 'completed' as const,
      })),
      set: vi.fn(async () => undefined),
      acquireLock: vi.fn(async () => true),
      releaseLock: vi.fn(async () => undefined),
      isLocked: vi.fn(async () => false),
    };
    const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, backend);
    const response = createResponseStub();

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'k-default-status' }, body: { a: 1 } },
          response,
          annotatedHandler(reflector),
        ),
        { handle: () => of({ fresh: true }) },
      )),
    ).resolves.toEqual({ replayed: true });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('accepts canonical lower-case array headers and user principal fallbacks', async () => {
    const reflector = createReflector();
    const backend = createBackend();
    const metrics = { incrementReplay: vi.fn() };
    const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, backend, metrics);
    const request = {
      method: 'post',
      originalUrl: '/v1/items?debug=true',
      principal: { id: 'principal-user' },
      headers: { 'idempotency-key': ['array-key'] },
      body: ['a', { z: 2, a: 1 }],
    };
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await lastValueFrom(interceptor.intercept(createExecutionContext(request, createResponseStub(), annotatedHandler(reflector)), next));
    const replayResponse = createResponseStub();
    await expect(
      lastValueFrom(interceptor.intercept(createExecutionContext(request, replayResponse, annotatedHandler(reflector)), next)),
    ).resolves.toEqual({ ok: true });

    const firstContext = (backend.get as Mock).mock.calls[0]?.[0] as IdempotencyDecisionContext;
    const expectedCompositeKey = createHash('sha256')
      .update(JSON.stringify({
        tenantId: null,
        userId: 'principal-user',
        routeKey: 'POST:/v1/items',
        headerValue: 'array-key',
      }))
      .digest('hex');
    expect(firstContext).toMatchObject({
      headerName: 'Idempotency-Key',
      headerValue: 'array-key',
      routeKey: 'POST:/v1/items',
      userId: 'principal-user',
      ttlMs: 86_400_000,
    });
    expect(firstContext.tenantId).toBe(undefined);
    expect(firstContext.compositeKey).toBe(expectedCompositeKey);
    expect(metrics.incrementReplay).toHaveBeenCalledTimes(1);
    expect(replayResponse.setHeader).toHaveBeenCalledWith('X-Idempotency-Key', 'array-key');
  });

  it('continues without durable ownership when no backend is configured and strict mode is off', async () => {
    const reflector = createReflector();
    const interceptor = new IdempotencyInterceptor(reflector);
    const request = {
      headers: { 'Idempotency-Key': 'k-defaults' },
      user: { id: 'user-fallback' },
    };
    const response = {
      status: vi.fn(),
      setHeader: vi.fn(),
    };

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(request, response, annotatedHandler(reflector)),
        { handle: () => of({ ok: true }) },
      )),
    ).resolves.toEqual({ ok: true });
    expect(response.setHeader).toHaveBeenCalledWith('X-Stynx-Idempotency-Lookup-Ms', expect.any(String));
  });

  it('falls through pending backend and durable entries before executing the request', async () => {
    const reflector = createReflector();
    const backend: IdempotencyBackend = {
      get: vi.fn(async (ctx: IdempotencyDecisionContext) => ({
        requestFingerprint: ctx.requestFingerprint,
        statusCode: 202,
        body: { pending: true },
        headers: {},
        expiresAt: Date.now() + 1000,
        status: 'pending' as never,
      })),
      set: vi.fn(async () => undefined),
      acquireLock: vi.fn(async () => true),
      releaseLock: vi.fn(async () => undefined),
      isLocked: vi.fn(async () => false),
    };
    const store: IdempotencyStore = {
      lookup: vi.fn(async (ctx: IdempotencyDecisionContext) => ({
        requestFingerprint: ctx.requestFingerprint,
        statusCode: 202,
        body: { pending: true },
        headers: {},
        expiresAt: Date.now() + 1000,
        status: 'pending' as never,
      })),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => undefined),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(reflector, {}, store, backend);
    const request = {
      method: 'POST',
      url: '/v1/items',
      headers: { 'Idempotency-Key': 'k-pending' },
      body: null,
    };

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(request, createResponseStub(), annotatedHandler(reflector)),
        { handle: () => of({ fresh: true }) },
      )),
    ).resolves.toEqual({ fresh: true });
    expect(store.persistResponse).toHaveBeenCalledTimes(1);
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
      lookup: vi.fn(async (_ctx: IdempotencyDecisionContext) => null),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
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
      lookup: vi.fn(async (_ctx: IdempotencyDecisionContext) => null),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
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
    expect(store.clearReservation).toHaveBeenCalledWith(expect.objectContaining({
      headerValue: 'k1',
      routeKey: 'POST:/v1/items',
    }));
  });

  it('throws service unavailable when lock cannot be obtained in strict mode', async () => {
    const reflector = createReflector();
    const backend: IdempotencyBackend = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
      acquireLock: vi.fn(async () => false),
      releaseLock: vi.fn(async () => undefined),
      isLocked: vi.fn(async () => false),
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

  it('waits for a completed backend entry when lock ownership is already held', async () => {
    const reflector = createReflector();
    let getCalls = 0;
    const backend: IdempotencyBackend = {
      get: vi.fn(async (ctx: IdempotencyDecisionContext) => {
        getCalls += 1;
        return getCalls === 1
          ? null
          : {
              requestFingerprint: ctx.requestFingerprint,
              statusCode: 202,
              body: { replayed: true },
              headers: { 'x-replay': 'backend' },
              expiresAt: Date.now() + 1000,
              status: 'completed' as const,
            };
      }),
      set: vi.fn(async () => undefined),
      acquireLock: vi.fn(async () => false),
      releaseLock: vi.fn(async () => undefined),
      isLocked: vi.fn(async () => true),
    };
    const interceptor = new IdempotencyInterceptor(
      reflector,
      { waitAttempts: 2, waitIntervalMs: 1 },
      undefined,
      backend,
    );
    const request = {
      method: 'POST',
      url: '/v1/items',
      headers: { 'Idempotency-Key': 'k-wait' },
      body: { a: 1 },
    };
    const response = createResponseStub();

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(request, response, annotatedHandler(reflector)),
        { handle: () => of({ fresh: true }) },
      )),
    ).resolves.toEqual({ replayed: true });
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.setHeader).toHaveBeenCalledWith('x-replay', 'backend');
  });

  it('records metrics when waiting returns a completed backend entry', async () => {
    const reflector = createReflector();
    let getCalls = 0;
    const backend: IdempotencyBackend = {
      get: vi.fn(async (ctx: IdempotencyDecisionContext) => {
        getCalls += 1;
        return getCalls === 1
          ? null
          : {
              requestFingerprint: ctx.requestFingerprint,
              statusCode: 200,
              body: { replayed: 'waited' },
              headers: {},
              expiresAt: Date.now() + 1000,
              status: 'completed' as const,
            };
      }),
      set: vi.fn(async () => undefined),
      acquireLock: vi.fn(async () => false),
      releaseLock: vi.fn(async () => undefined),
      isLocked: vi.fn(async () => true),
    };
    const metrics = { incrementReplay: vi.fn() };
    const interceptor = new IdempotencyInterceptor(
      reflector,
      { waitAttempts: 1, waitIntervalMs: 1 },
      undefined,
      backend,
      metrics,
    );

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'k-wait-metrics' }, body: { a: 1 } },
          createResponseStub(),
          annotatedHandler(reflector),
        ),
        { handle: () => of({ fresh: true }) },
      )),
    ).resolves.toEqual({ replayed: 'waited' });
    expect(metrics.incrementReplay).toHaveBeenCalledTimes(1);
  });

  it('waits for a completed durable entry and applies default replay headers', async () => {
    const reflector = createReflector();
    const backend: IdempotencyBackend = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
      acquireLock: vi.fn(async () => false),
      releaseLock: vi.fn(async () => undefined),
      isLocked: vi.fn(async () => true),
    };
    const store: IdempotencyStore = {
      lookup: vi.fn(async (ctx: IdempotencyDecisionContext) => ({
        requestFingerprint: ctx.requestFingerprint,
        body: { replayed: 'durable' },
        headers: undefined as never,
        expiresAt: Date.now() + 1000,
        status: 'completed' as const,
      })),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => undefined),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(
      reflector,
      { waitAttempts: 1, waitIntervalMs: 1 },
      store,
      backend,
    );
    const response = createResponseStub();

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'k-durable-wait' }, body: { a: 1 } },
          response,
          annotatedHandler(reflector),
        ),
        { handle: () => of({ fresh: true }) },
      )),
    ).resolves.toEqual({ replayed: 'durable' });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('records metrics when replaying a completed durable entry', async () => {
    const reflector = createReflector();
    const metrics = { incrementReplay: vi.fn() };
    const store: IdempotencyStore = {
      lookup: vi.fn(async (ctx: IdempotencyDecisionContext) => ({
        requestFingerprint: ctx.requestFingerprint,
        statusCode: 207,
        body: { replayed: 'durable-hit' },
        headers: {},
        expiresAt: Date.now() + 1000,
        status: 'completed',
      })),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => undefined),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(reflector, {}, store, createBackend(), metrics);

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'k-durable-metrics' }, body: { a: 1 } },
          createResponseStub(),
          annotatedHandler(reflector),
        ),
        { handle: () => of({ fresh: true }) },
      )),
    ).resolves.toEqual({ replayed: 'durable-hit' });
    expect(metrics.incrementReplay).toHaveBeenCalledTimes(1);
  });

  it('continues waiting over pending durable entries until a completed one is ready', async () => {
    const reflector = createReflector();
    const backend: IdempotencyBackend = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
      acquireLock: vi.fn(async () => false),
      releaseLock: vi.fn(async () => undefined),
      isLocked: vi.fn(async () => true),
    };
    let lookupCalls = 0;
    const store: IdempotencyStore = {
      lookup: vi.fn(async (ctx: IdempotencyDecisionContext) => {
        lookupCalls += 1;
        if (lookupCalls === 1) {
          return null;
        }
        return {
          requestFingerprint: ctx.requestFingerprint,
          body: lookupCalls === 2 ? { pending: true } : { replayed: 'ready' },
          headers: {},
          expiresAt: Date.now() + 1000,
          status: lookupCalls === 2 ? 'pending' as never : 'completed' as const,
        };
      }),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => undefined),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(
      reflector,
      { waitAttempts: 2, waitIntervalMs: 1 },
      store,
      backend,
    );

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'k-durable-ready' }, body: { a: 1 } },
          createResponseStub(),
          annotatedHandler(reflector),
        ),
        { handle: () => of({ fresh: true }) },
      )),
    ).resolves.toEqual({ replayed: 'ready' });
  });

  it('continues past pending backend entries while waiting for ownership', async () => {
    const reflector = createReflector();
    let getCalls = 0;
    const backend: IdempotencyBackend = {
      get: vi.fn(async (ctx: IdempotencyDecisionContext) => {
        getCalls += 1;
        return getCalls === 2
          ? {
              requestFingerprint: ctx.requestFingerprint,
              statusCode: 202,
              body: { pending: true },
              headers: {},
              expiresAt: Date.now() + 1000,
              status: 'pending' as never,
            }
          : null;
      }),
      set: vi.fn(async () => undefined),
      acquireLock: vi.fn(async () => false),
      releaseLock: vi.fn(async () => undefined),
      isLocked: vi.fn(async () => false),
    };
    const interceptor = new IdempotencyInterceptor(
      reflector,
      { waitAttempts: 1, waitIntervalMs: 1 },
      undefined,
      backend,
    );

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'k-backend-pending' }, body: { a: 1 } },
          createResponseStub(),
          annotatedHandler(reflector),
        ),
        { handle: () => of({ fresh: true }) },
      )),
    ).resolves.toEqual({ fresh: true });
  });

  it('executes the request after wait attempts are exhausted in non-strict mode', async () => {
    const reflector = createReflector();
    const backend: IdempotencyBackend = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
      acquireLock: vi.fn(async () => false),
      releaseLock: vi.fn(async () => undefined),
      isLocked: vi.fn(async () => true),
    };
    const interceptor = new IdempotencyInterceptor(
      reflector,
      { waitAttempts: 1, waitIntervalMs: 1 },
      undefined,
      backend,
    );

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'k-timeout' }, body: { a: 1 } },
          createResponseStub(),
          annotatedHandler(reflector),
        ),
        { handle: () => of({ fresh: true }) },
      )),
    ).resolves.toEqual({ fresh: true });
    expect(backend.isLocked).toHaveBeenCalledTimes(1);
  });

  it('fails strict mode when durable reservation is refused and releases the lock', async () => {
    const reflector = createReflector();
    const backend = createBackend();
    const store: IdempotencyStore = {
      lookup: vi.fn(async () => null),
      reserve: vi.fn(async () => false),
      persistResponse: vi.fn(async () => undefined),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(reflector, { durableStrict: true }, store, backend);
    const request = {
      method: 'POST',
      url: '/v1/items',
      headers: { 'Idempotency-Key': 'k-reserve' },
      body: { a: 1 },
    };

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(request, createResponseStub(), annotatedHandler(reflector)),
        { handle: () => of({ ok: true }) },
      )),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(backend.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('persists 4xx HTTP exception responses for replay', async () => {
    const reflector = createReflector();
    const backend = createBackend();
    const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, backend);
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: 'tenant-a',
      actor: { id: 'user-a' },
      headers: { 'Idempotency-Key': 'k-4xx' },
      body: { a: 1 },
    };
    const response = createResponseStub();
    const next: CallHandler = {
      handle: () =>
        throwError(() => new BadRequestException({ statusCode: 400, message: 'validation failed' })),
    };

    await expect(
      lastValueFrom(interceptor.intercept(createExecutionContext(request, response, annotatedHandler(reflector)), next)),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(backend.set).toHaveBeenCalledTimes(1);
    const [, persisted] = (backend.set as Mock).mock.calls[0];
    expect(persisted.statusCode).toBe(400);
    expect(persisted.status).toBe('completed');
  });

  it('persists 4xx HTTP exception responses to the durable store', async () => {
    const reflector = createReflector();
    const store: IdempotencyStore = {
      lookup: vi.fn(async () => null),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(reflector, {}, store, createBackend());

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'k-4xx-durable' }, body: { a: 1 } },
          createResponseStub(),
          annotatedHandler(reflector),
        ),
        { handle: () => throwError(() => new BadRequestException({ message: 'validation failed' })) },
      )),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.persistResponse).toHaveBeenCalledWith(
      expect.objectContaining({ headerValue: 'k-4xx-durable' }),
      400,
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('does not persist 5xx HTTP exception responses (allows retry)', async () => {
    const reflector = createReflector();
    const backend = createBackend();
    const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, backend);
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: 'tenant-a',
      actor: { id: 'user-a' },
      headers: { 'Idempotency-Key': 'k-5xx' },
      body: { a: 1 },
    };
    const response = createResponseStub();
    const next: CallHandler = {
      handle: () =>
        throwError(() => new ServiceUnavailableException('upstream timeout')),
    };

    await expect(
      lastValueFrom(interceptor.intercept(createExecutionContext(request, response, annotatedHandler(reflector)), next)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(backend.set).not.toHaveBeenCalled();
  });

  it('clears durable reservations for normal 5xx responses and non-HTTP errors', async () => {
    const reflector = createReflector();
    const store: IdempotencyStore = {
      lookup: vi.fn(async () => null),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => undefined),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(reflector, {}, store, createBackend());
    const request = {
      method: 'POST',
      url: '/v1/items',
      headers: { 'Idempotency-Key': 'k-5xx-body' },
      body: { a: 1 },
    };
    const response = createResponseStub();
    response.statusCode = 503;

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(request, response, annotatedHandler(reflector)),
        { handle: () => of({ failed: true }) },
      )),
    ).resolves.toEqual({ failed: true });
    expect(store.clearReservation).toHaveBeenCalledTimes(1);

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext({ ...request, headers: { 'Idempotency-Key': 'k-error' } }, createResponseStub(), annotatedHandler(reflector)),
        { handle: () => throwError(() => new Error('plain failure')) },
      )),
    ).rejects.toThrow('plain failure');
    expect(store.clearReservation).toHaveBeenCalledTimes(2);
  });

  it('releases the lock when the handler throws synchronously', async () => {
    const reflector = createReflector();
    const backend = createBackend();
    const store: IdempotencyStore = {
      lookup: vi.fn(async () => null),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => undefined),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(reflector, {}, store, backend);

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'k-sync-error' }, body: { a: 1 } },
          createResponseStub(),
          annotatedHandler(reflector),
        ),
        { handle: () => { throw new Error('sync failure'); } },
      )),
    ).rejects.toThrow('sync failure');
    expect(store.clearReservation).toHaveBeenCalledTimes(1);
    expect(backend.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('does not release a backend lock that was never acquired after a handler failure', async () => {
    const reflector = createReflector();
    const backend: IdempotencyBackend = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
      acquireLock: vi.fn(async () => false),
      releaseLock: vi.fn(async () => undefined),
      isLocked: vi.fn(async () => false),
    };
    const store: IdempotencyStore = {
      lookup: vi.fn(async () => null),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => undefined),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(reflector, { waitAttempts: 1, waitIntervalMs: 1 }, store, backend);

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'k-unowned-error' }, body: { a: 1 } },
          createResponseStub(),
          annotatedHandler(reflector),
        ),
        { handle: () => throwError(() => new Error('unowned failure')) },
      )),
    ).rejects.toThrow('unowned failure');
    expect(store.clearReservation).toHaveBeenCalledTimes(1);
    expect(backend.releaseLock).not.toHaveBeenCalled();
  });

  it('clears durable reservations after a handler failure without a backend', async () => {
    const reflector = createReflector();
    const store: IdempotencyStore = {
      lookup: vi.fn(async () => null),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => undefined),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(reflector, {}, store);

    await expect(
      lastValueFrom(interceptor.intercept(
        createExecutionContext(
          { method: 'POST', url: '/v1/items', headers: { 'Idempotency-Key': 'k-no-backend-error' }, body: { a: 1 } },
          createResponseStub(),
          annotatedHandler(reflector),
        ),
        { handle: () => throwError(() => new Error('no backend failure')) },
      )),
    ).rejects.toThrow('no backend failure');
    expect(store.clearReservation).toHaveBeenCalledTimes(1);
  });

  it('replays cached responses from the durable store after a backend miss', async () => {
    const reflector = createReflector();
    const backend = createBackend();
    // Fingerprint is sha256(method:path:body); the durable mock
    // returns whatever fingerprint the sensor computes so the
    // assertFingerprintMatches guard passes.
    const durable: IdempotencyStore = {
      lookup: vi.fn(async (ctx: IdempotencyDecisionContext) => {
        return {
          requestFingerprint: ctx.requestFingerprint,
          statusCode: 201,
          body: { id: 'durable-cached' },
          headers: {},
          expiresAt: Date.now() + 60_000,
          status: 'completed' as const,
        };
      }),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => undefined),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor(reflector, {}, durable, backend);
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: 'tenant-a',
      actor: { id: 'user-a' },
      headers: { 'Idempotency-Key': 'k-durable' },
      body: { a: 1 },
    };
    const response = createResponseStub();
    const next: CallHandler = { handle: () => of({ id: 'fresh' }) };

    const result = await lastValueFrom(
      interceptor.intercept(createExecutionContext(request, response, annotatedHandler(reflector)), next),
    );
    expect(result).toEqual({ id: 'durable-cached' });
    expect(backend.set).toHaveBeenCalledTimes(1); // cache promotion
    expect(durable.lookup).toHaveBeenCalledTimes(1);
  });

  // ===========================================================================
  // WAVE-05A targeted mutation kills.
  // ===========================================================================

  describe('expiresAt arithmetic (kills ArithmeticOperator at L304, L325)', () => {
    it('persists expiresAt = Date.now() + ttlMs on a successful response', async () => {
      const reflector = createReflector();
      const backend = createBackend();
      const durable: IdempotencyStore = {
        lookup: vi.fn(async () => null), reserve: vi.fn(async () => true),
        persistResponse: vi.fn(async () => undefined), clearReservation: vi.fn(async () => undefined),
      };
      const interceptor = new IdempotencyInterceptor(reflector, { ttlMs: 60_000 }, durable, backend);
      const request = { method: 'POST', url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k-arith' }, body: { a: 1 } };
      const response = createResponseStub();
      const before = Date.now();
      await lastValueFrom(interceptor.intercept(createExecutionContext(request, response, annotatedHandler(reflector)), { handle: () => of({ id: 'ok' }) } as CallHandler));
      const after = Date.now();
      const stored = (backend.set as Mock).mock.calls[0]![1] as IdempotencyStoredEntry;
      expect(stored.expiresAt).toBeGreaterThanOrEqual(before + 60_000);
      expect(stored.expiresAt).toBeLessThanOrEqual(after + 60_000);
    });

    it('persists expiresAt = Date.now() + ttlMs on a 4xx HttpException error path', async () => {
      const reflector = createReflector();
      const backend = createBackend();
      const durable: IdempotencyStore = {
        lookup: vi.fn(async () => null), reserve: vi.fn(async () => true),
        persistResponse: vi.fn(async () => undefined), clearReservation: vi.fn(async () => undefined),
      };
      const interceptor = new IdempotencyInterceptor(reflector, { ttlMs: 30_000 }, durable, backend);
      const request = { method: 'POST', url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k-arith-err' }, body: { a: 1 } };
      const response = createResponseStub();
      const before = Date.now();
      await expect(lastValueFrom(interceptor.intercept(createExecutionContext(request, response, annotatedHandler(reflector)), { handle: () => throwError(() => new HttpException('bad', 400)) } as CallHandler))).rejects.toBeInstanceOf(HttpException);
      const after = Date.now();
      const stored = (backend.set as Mock).mock.calls[0]![1] as IdempotencyStoredEntry;
      expect(stored.statusCode).toBe(400);
      expect(stored.expiresAt).toBeGreaterThanOrEqual(before + 30_000);
      expect(stored.expiresAt).toBeLessThanOrEqual(after + 30_000);
    });

    it('defaults ttlMs to 86_400_000 ms (24 * 60 * 60 * 1000) when omitted', async () => {
      const reflector = createReflector();
      const backend = createBackend();
      const durable: IdempotencyStore = {
        lookup: vi.fn(async () => null), reserve: vi.fn(async () => true),
        persistResponse: vi.fn(async () => undefined), clearReservation: vi.fn(async () => undefined),
      };
      const interceptor = new IdempotencyInterceptor(reflector, {}, durable, backend);
      const request = { method: 'POST', url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k-default' }, body: { a: 1 } };
      const response = createResponseStub();
      const before = Date.now();
      await lastValueFrom(interceptor.intercept(createExecutionContext(request, response, annotatedHandler(reflector)), { handle: () => of({ id: 'ok' }) } as CallHandler));
      const after = Date.now();
      const stored = (backend.set as Mock).mock.calls[0]![1] as IdempotencyStoredEntry;
      const oneDayMs = 24 * 60 * 60 * 1000;
      expect(stored.expiresAt).toBeGreaterThanOrEqual(before + oneDayMs);
      expect(stored.expiresAt).toBeLessThanOrEqual(after + oneDayMs);
    });
  });

  describe('status-code boundary (kills EqualityOperator at L307)', () => {
    function fixtures() {
      const reflector = createReflector();
      const backend = createBackend();
      const durable: IdempotencyStore = {
        lookup: vi.fn(async () => null), reserve: vi.fn(async () => true),
        persistResponse: vi.fn(async () => undefined), clearReservation: vi.fn(async () => undefined),
      };
      const interceptor = new IdempotencyInterceptor(reflector, {}, durable, backend);
      return { reflector, backend, durable, interceptor };
    }

    it('on 200, persists to durable AND sets backend', async () => {
      const { reflector, backend, durable, interceptor } = fixtures();
      const response = createResponseStub();
      response.statusCode = 200;
      await lastValueFrom(interceptor.intercept(createExecutionContext(
        { method: 'POST', url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k-ok' }, body: { a: 1 } },
        response, annotatedHandler(reflector),
      ), { handle: () => of({ id: 'ok' }) } as CallHandler));
      expect(backend.set).toHaveBeenCalledTimes(1);
      expect(durable.persistResponse).toHaveBeenCalledTimes(1);
      expect(durable.clearReservation).not.toHaveBeenCalled();
    });

    it('on statusCode === 500 boundary, clears reservation and does NOT persist (kills `< 500` → `<= 500`)', async () => {
      const { reflector, backend, durable, interceptor } = fixtures();
      const response = createResponseStub();
      response.statusCode = 500;
      await lastValueFrom(interceptor.intercept(createExecutionContext(
        { method: 'POST', url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k-500' }, body: { a: 1 } },
        response, annotatedHandler(reflector),
      ), { handle: () => of({ id: 'failed' }) } as CallHandler));
      expect(durable.clearReservation).toHaveBeenCalledTimes(1);
      expect(backend.set).not.toHaveBeenCalled();
      expect(durable.persistResponse).not.toHaveBeenCalled();
    });
  });

  describe('header value rejection (kills ConditionalExpression at L147)', () => {
    function build(headers: Record<string, unknown>) {
      const reflector = createReflector();
      const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, createBackend());
      const request = { method: 'POST', url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers, body: { a: 1 } };
      const response = createResponseStub();
      // intercept() throws synchronously on missing/empty key — wrap in fn.
      return () => interceptor.intercept(createExecutionContext(request, response, annotatedHandler(reflector)), { handle: () => of('x') } as CallHandler);
    }

    it('rejects empty-string Idempotency-Key as missing', () => {
      expect(build({ 'Idempotency-Key': '' })).toThrow(BadRequestException);
    });

    it('rejects whitespace-only Idempotency-Key after trim', () => {
      expect(build({ 'Idempotency-Key': '   ' })).toThrow(BadRequestException);
    });

    it('BadRequest message names the header (kills StringLiteral on L129)', () => {
      expect(build({})).toThrow(/Idempotency-Key header is required/);
    });
  });

  describe('user-id precedence (kills LogicalOperator at L78)', () => {
    async function captureContext(request: Record<string, unknown>) {
      const reflector = createReflector();
      const backend = createBackend();
      const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, backend);
      await lastValueFrom(interceptor.intercept(createExecutionContext(request, createResponseStub(), annotatedHandler(reflector)), { handle: () => of('x') } as CallHandler));
      return (backend.set as Mock).mock.calls[0]![0] as IdempotencyDecisionContext;
    }

    it('uses principal.id when present (precedence: principal > actor > user)', async () => {
      const ctx = await captureContext({
        method: 'POST', url: '/v1/items', tenantId: 't',
        principal: { id: 'P' }, actor: { id: 'A' }, user: { id: 'U' },
        headers: { 'Idempotency-Key': 'k' }, body: {},
      });
      expect(ctx.userId).toBe('P');
    });

    it('falls through to actor.id when principal is absent', async () => {
      const ctx = await captureContext({
        method: 'POST', url: '/v1/items', tenantId: 't',
        actor: { id: 'A' }, user: { id: 'U' },
        headers: { 'Idempotency-Key': 'k' }, body: {},
      });
      expect(ctx.userId).toBe('A');
    });

    it('falls through to user.id when both principal and actor are absent', async () => {
      const ctx = await captureContext({
        method: 'POST', url: '/v1/items', tenantId: 't',
        user: { id: 'U' },
        headers: { 'Idempotency-Key': 'k' }, body: {},
      });
      expect(ctx.userId).toBe('U');
    });
  });

  describe('method + path normalization (kills MethodExpression at L74, StringLiterals at L84-85)', () => {
    async function captureRouteKey(request: Record<string, unknown>) {
      const reflector = createReflector();
      const backend = createBackend();
      const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, backend);
      await lastValueFrom(interceptor.intercept(createExecutionContext(request, createResponseStub(), annotatedHandler(reflector)), { handle: () => of('x') } as CallHandler));
      return ((backend.set as Mock).mock.calls[0]![0] as IdempotencyDecisionContext).routeKey;
    }

    it('normalizes lowercase method to uppercase (kills toLowerCase mutation)', async () => {
      expect(await captureRouteKey({ method: 'post', url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k' }, body: {} })).toBe('POST:/v1/items');
    });

    it('strips query string from the route key (kills StringLiteral on "?")', async () => {
      expect(await captureRouteKey({ method: 'POST', url: '/v1/items?x=1', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k' }, body: {} })).toBe('POST:/v1/items');
    });

    it('prefers originalUrl over url', async () => {
      expect(await captureRouteKey({ method: 'POST', originalUrl: '/proxied', url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k' }, body: {} })).toBe('POST:/proxied');
    });

    it('defaults to empty path when both originalUrl and url are absent', async () => {
      expect(await captureRouteKey({ method: 'POST', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k' }, body: {} })).toBe('POST:');
    });

    it('defaults to empty method when method is not a string', async () => {
      expect(await captureRouteKey({ url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k' }, body: {} })).toBe(':/v1/items');
    });
  });

  describe('stableStringify determinism (kills StringLiteral/BlockStatement at L158-172)', () => {
    async function captureFingerprint(body: unknown) {
      const reflector = createReflector();
      const backend = createBackend();
      const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, backend);
      await lastValueFrom(interceptor.intercept(createExecutionContext(
        { method: 'POST', url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k' }, body },
        createResponseStub(), annotatedHandler(reflector),
      ), { handle: () => of('x') } as CallHandler));
      return ((backend.set as Mock).mock.calls[0]![0] as IdempotencyDecisionContext).requestFingerprint;
    }

    it('produces identical fingerprint for reversed object key order', async () => {
      expect(await captureFingerprint({ z: 1, a: 2 })).toBe(await captureFingerprint({ a: 2, z: 1 }));
    });

    it('produces DIFFERENT fingerprints for array element order swaps (array order matters)', async () => {
      expect(await captureFingerprint({ items: [1, 2, 3] })).not.toBe(await captureFingerprint({ items: [3, 2, 1] }));
    });

    it('treats null and undefined as equivalent ("null")', async () => {
      expect(await captureFingerprint(null)).toBe(await captureFingerprint(undefined));
    });
  });

  describe('replay headers (kills StringLiteral survivors on header names + values at L218)', () => {
    it('on cache replay emits X-Stynx-Idempotency-Lookup-Ms + X-Idempotency-Key + Idempotency-Replayed=true', async () => {
      const reflector = createReflector();
      const backend = createBackend();
      (backend.get as Mock).mockImplementation(async (ctx: IdempotencyDecisionContext) => ({
        requestFingerprint: ctx.requestFingerprint, statusCode: 201, body: { id: 'cached' }, headers: {},
        expiresAt: Date.now() + 60_000, status: 'completed' as const,
      }));
      const interceptor = new IdempotencyInterceptor(reflector, {}, undefined, backend);
      const response = createResponseStub();
      await lastValueFrom(interceptor.intercept(createExecutionContext(
        { method: 'POST', url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k-replay' }, body: { a: 1 } },
        response, annotatedHandler(reflector),
      ), { handle: () => of('fresh') } as CallHandler));
      const headerCalls = (response.setHeader as Mock).mock.calls.map((c) => c[0]);
      expect(headerCalls).toContain('X-Stynx-Idempotency-Lookup-Ms');
      expect((response.setHeader as Mock).mock.calls).toContainEqual(['X-Idempotency-Key', 'k-replay']);
      expect((response.setHeader as Mock).mock.calls).toContainEqual(['Idempotency-Replayed', 'true']);
    });
  });

  describe('captureReplayableHeaders (kills BlockStatement at L374-375)', () => {
    it('copies the response headers object verbatim into the stored entry (subset assertion since interceptor itself adds timing header)', async () => {
      const reflector = createReflector();
      const backend = createBackend();
      const durable: IdempotencyStore = {
        lookup: vi.fn(async () => null), reserve: vi.fn(async () => true),
        persistResponse: vi.fn(async () => undefined), clearReservation: vi.fn(async () => undefined),
      };
      const interceptor = new IdempotencyInterceptor(reflector, {}, durable, backend);
      const response = createResponseStub();
      response.headers = { 'X-Custom': 'value', 'X-Request-ID': 'r-1' };
      await lastValueFrom(interceptor.intercept(createExecutionContext(
        { method: 'POST', url: '/v1/items', tenantId: 't', actor: { id: 'u' }, headers: { 'Idempotency-Key': 'k-hdr' }, body: { a: 1 } },
        response, annotatedHandler(reflector),
      ), { handle: () => of('x') } as CallHandler));
      const stored = (backend.set as Mock).mock.calls[0]![1] as IdempotencyStoredEntry;
      // BlockStatement {} mutation on captureReplayableHeaders would store {}
      // (no keys at all). Subset match still detects the missing custom keys.
      expect(stored.headers).toMatchObject({ 'X-Custom': 'value', 'X-Request-ID': 'r-1' });
    });
  });
});
