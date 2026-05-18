import type { CallHandler, ExecutionContext } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { of } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from '../../../packages/backend/src/idempotency/idempotency.interceptor';
import type {
  IdempotencyDecisionContext,
  IdempotencyStore,
} from '../../../packages/backend/src/idempotency/types';

function createExecutionContext(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => function handler() {},
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

describe('IdempotencyInterceptor', () => {
  it('rejects write request without idempotency key when required', async () => {
    const interceptor = new IdempotencyInterceptor();
    const request = {
      method: 'POST',
      url: '/v1/items',
      headers: {},
      body: { a: 1 },
    };
    const response = createResponseStub();
    const next: CallHandler = { handle: () => of({ ok: true }) };
    expect(() =>
      interceptor.intercept(createExecutionContext(request, response), next),
    ).toThrow(BadRequestException);
  });

  it('allows GET without idempotency key', async () => {
    const interceptor = new IdempotencyInterceptor();
    const request = {
      method: 'GET',
      url: '/v1/items',
      headers: {},
    };
    const response = createResponseStub();
    const next: CallHandler = { handle: () => of({ ok: true }) };
    await expect(
      lastValueFrom(
        interceptor.intercept(createExecutionContext(request, response), next),
      ),
    ).resolves.toEqual({ ok: true });
  });

  it('replays in-memory cached response for same key/fingerprint', async () => {
    const interceptor = new IdempotencyInterceptor({ durableStrict: false });
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: 'tenant-a',
      headers: { 'x-idempotency-key': 'k1' },
      body: { a: 1 },
    };
    const response1 = createResponseStub();
    const response2 = createResponseStub();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const first = await lastValueFrom(
      interceptor.intercept(createExecutionContext(request, response1), next),
    );
    const second = await lastValueFrom(
      interceptor.intercept(createExecutionContext(request, response2), next),
    );

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(response2.status).toHaveBeenCalledWith(200);
    expect(response2.setHeader).toHaveBeenCalledWith(
      'X-Idempotency-Replay',
      'true',
    );
  });

  it('throws conflict when same key is reused with different payload', async () => {
    const interceptor = new IdempotencyInterceptor({ durableStrict: false });
    const requestA = {
      method: 'POST',
      url: '/v1/items',
      tenantId: 'tenant-a',
      headers: { 'x-idempotency-key': 'k1' },
      body: { a: 1 },
    };
    const requestB = {
      ...requestA,
      body: { a: 2 },
    };
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await lastValueFrom(
      interceptor.intercept(
        createExecutionContext(requestA, createResponseStub()),
        next,
      ),
    );

    expect(() =>
      interceptor.intercept(
        createExecutionContext(requestB, createResponseStub()),
        next,
      ),
    ).toThrow(ConflictException);
  });

  it('uses durable store when configured and tenant exists', async () => {
    const store: IdempotencyStore = {
      lookup: vi.fn(async (_ctx: IdempotencyDecisionContext) => null),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
    };
    const interceptor = new IdempotencyInterceptor({}, store);
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: '11111111-1111-1111-1111-111111111111',
      headers: { 'x-idempotency-key': 'k1' },
      body: { a: 1 },
    };
    const response = createResponseStub();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await expect(
      lastValueFrom(
        interceptor.intercept(createExecutionContext(request, response), next),
      ),
    ).resolves.toEqual({ ok: true });
    expect(store.reserve).toHaveBeenCalledTimes(1);
    expect(store.persistResponse).toHaveBeenCalledTimes(1);
  });

  it('throws service unavailable when durableStrict and no durable store path', async () => {
    const interceptor = new IdempotencyInterceptor({ durableStrict: true });
    const request = {
      method: 'POST',
      url: '/v1/items',
      tenantId: 'tenant-a',
      headers: { 'x-idempotency-key': 'k1' },
      body: { a: 1 },
    };
    const response = createResponseStub();
    const next: CallHandler = { handle: () => of({ ok: true }) };
    expect(() =>
      interceptor.intercept(createExecutionContext(request, response), next),
    ).toThrow(ServiceUnavailableException);
  });
});
