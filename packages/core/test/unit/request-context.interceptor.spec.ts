import { BadRequestException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { RequestContextInterceptor } from '../../src/request-context.interceptor';
import {
  RequestContextMutator,
  type RequestContextState,
} from '../../src/request-context';
import type { Mock } from 'vitest';

class FakeClsService {
  public store = new Map<PropertyKey, unknown>();

  get<T>(key: PropertyKey): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set(key: PropertyKey, value: unknown): void {
    this.store.set(key, value);
  }

  runWith<T>(store: Record<PropertyKey, unknown>, fn: () => Promise<T> | T): Promise<T> | T {
    const previous = this.store;
    this.store = new Map(
      Reflect.ownKeys(store).map((key) => [key, (store as Record<PropertyKey, unknown>)[key]]),
    );
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result.finally(() => {
          this.store = previous;
        });
      }
      this.store = previous;
      return result;
    } catch (error) {
      this.store = previous;
      throw error;
    }
  }
}

function makeContext(
  headers: Record<string, unknown> = {},
  extras: Record<string, unknown> = {},
): {
  context: ExecutionContext;
  response: { setHeader: Mock };
} {
  const request = { headers, ...extras } as Record<string, unknown>;
  const response = { setHeader: vi.fn() };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, response };
}

function makeHandler(value: unknown = 'ok'): CallHandler {
  return { handle: () => of(value) };
}

function run(observable: Observable<unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    observable.subscribe({ next: resolve, error: reject });
  });
}

describe('RequestContextInterceptor', () => {
  let cls: FakeClsService;
  let mutator: RequestContextMutator;
  let interceptor: RequestContextInterceptor;

  beforeEach(() => {
    cls = new FakeClsService();
    mutator = new RequestContextMutator(cls as never);
    interceptor = new RequestContextInterceptor(mutator);
  });

  it('generates a UUIDv7 request id when none provided and sets X-Request-Id', async () => {
    const { context, response } = makeContext({});
    const value = await run(interceptor.intercept(context, makeHandler('result')));
    expect(value).toBe('result');
    const id = response.setHeader.mock.calls[0]?.[1] as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('honors a valid X-Request-Id header from the caller', async () => {
    const requestedId = '0190abcd-1234-7abc-89ab-0123456789ab';
    const { context, response } = makeContext({ 'x-request-id': requestedId });
    await run(interceptor.intercept(context, makeHandler()));
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', requestedId);
  });

  it('throws BadRequestException when X-Request-Id is provided but invalid', () => {
    const { context } = makeContext({ 'x-request-id': 'not-a-uuid' });
    expect(() => interceptor.intercept(context, makeHandler())).toThrow(BadRequestException);
  });

  it('extracts header from first element when value is an array', async () => {
    const requestedId = '0190abcd-1234-7abc-89ab-0123456789ab';
    const { context, response } = makeContext({ 'x-request-id': [requestedId, 'second'] });
    await run(interceptor.intercept(context, makeHandler()));
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', requestedId);
  });

  it('extracts the first locale from Accept-Language header', async () => {
    const { context } = makeContext({ 'accept-language': 'pt-BR, en;q=0.9' });
    const spy = vi.spyOn(mutator, 'runWithRequestContext');
    await run(interceptor.intercept(context, makeHandler()));
    const seed = spy.mock.calls[0]?.[0] as RequestContextState;
    expect(seed.locale).toBe('pt-BR');
  });

  it('ignores Accept-Language when only whitespace', async () => {
    const { context } = makeContext({ 'accept-language': '   ' });
    const spy = vi.spyOn(mutator, 'runWithRequestContext');
    await run(interceptor.intercept(context, makeHandler()));
    const seed = spy.mock.calls[0]?.[0] as RequestContextState;
    expect(seed.locale).toBeUndefined();
  });

  it('ignores Accept-Language when the first language segment is empty', async () => {
    const { context } = makeContext({ 'accept-language': ', en;q=0.9' });
    const spy = vi.spyOn(mutator, 'runWithRequestContext');
    await run(interceptor.intercept(context, makeHandler()));
    const seed = spy.mock.calls[0]?.[0] as RequestContextState;
    expect(seed.locale).toBeUndefined();
  });

  it('binds tenantId from request.tenantId when present', async () => {
    const { context } = makeContext({}, { tenantId: 'tenant-42' });
    const spy = vi.spyOn(mutator, 'runWithRequestContext');
    await run(interceptor.intercept(context, makeHandler()));
    expect((spy.mock.calls[0]?.[0] as RequestContextState).tenantId).toBe('tenant-42');
  });

  it('falls back to stynxClaims.tenantId when request.tenantId absent', async () => {
    const { context } = makeContext({}, { stynxClaims: { tenantId: 'tenant-99' } });
    const spy = vi.spyOn(mutator, 'runWithRequestContext');
    await run(interceptor.intercept(context, makeHandler()));
    expect((spy.mock.calls[0]?.[0] as RequestContextState).tenantId).toBe('tenant-99');
  });

  it('resolves actorId from stynxClaims.sub first and sessionId from sid', async () => {
    const { context } = makeContext({}, {
      stynxClaims: { sub: 'sub-1', sid: 'sid-1' },
      principal: { id: 'principal-1' },
      actor: { id: 'actor-1' },
      user: { id: 'user-1' },
    });
    const spy = vi.spyOn(mutator, 'runWithRequestContext');
    await run(interceptor.intercept(context, makeHandler()));
    const seed = spy.mock.calls[0]?.[0] as RequestContextState;
    expect(seed.actorId).toBe('sub-1');
    expect(seed.sessionId).toBe('sid-1');
  });

  it('falls back to principal.id, then actor.id, then user.id', async () => {
    const cases: Array<{ extras: Record<string, unknown>; expected: string }> = [
      { extras: { principal: { id: 'p' } }, expected: 'p' },
      { extras: { actor: { id: 'a' } }, expected: 'a' },
      { extras: { user: { id: 'u' } }, expected: 'u' },
    ];
    for (const { extras, expected } of cases) {
      const { context } = makeContext({}, extras);
      const localMutator = new RequestContextMutator(new FakeClsService() as never);
      const local = new RequestContextInterceptor(localMutator);
      const spy = vi.spyOn(localMutator, 'runWithRequestContext');
      await run(local.intercept(context, makeHandler()));
      expect((spy.mock.calls[0]?.[0] as RequestContextState).actorId).toBe(expected);
    }
  });

  it('propagates handler errors through the observable', async () => {
    const { context } = makeContext({});
    const errHandler: CallHandler = {
      handle: () => throwError(() => new Error('downstream failure')),
    };
    await expect(run(interceptor.intercept(context, errHandler))).rejects.toThrow(
      'downstream failure',
    );
  });

  it('unsubscribes the downstream subscription on teardown', () => {
    const { context } = makeContext({});
    const unsubscribe = vi.fn();
    const inner = new Observable<unknown>(() => unsubscribe);
    const handler: CallHandler = { handle: () => inner };
    const subscription = interceptor.intercept(context, handler).subscribe();
    subscription.unsubscribe();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('exposes seed state inside the CLS scope during handler execution', async () => {
    const { context } = makeContext({}, { tenantId: 'tenant-x' });
    let observedTenant: string | undefined;
    const handler: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          for (const value of cls.store.values()) {
            if (value && typeof value === 'object' && 'tenantId' in (value as object)) {
              observedTenant = (value as RequestContextState).tenantId;
            }
          }
          subscriber.next(null);
          subscriber.complete();
        }),
    };
    await run(interceptor.intercept(context, handler));
    expect(observedTenant).toBe('tenant-x');
  });

  it('does not set tenantId/actorId/locale/sessionId when none are derivable', async () => {
    const { context } = makeContext({});
    const spy = vi.spyOn(mutator, 'runWithRequestContext');
    await run(interceptor.intercept(context, makeHandler()));
    const seed = spy.mock.calls[0]?.[0] as RequestContextState;
    expect(seed.tenantId).toBeUndefined();
    expect(seed.actorId).toBeUndefined();
    expect(seed.locale).toBeUndefined();
    expect(seed.sessionId).toBeUndefined();
    expect(seed.startedAt).toBeInstanceOf(Date);
  });
});
