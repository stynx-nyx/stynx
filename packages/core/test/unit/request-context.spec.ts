import { RequestContext, RequestContextMutator } from '../../src/request-context';
import { RequestContextMissingError } from '../../src/errors';

class FakeClsService {
  private store = new Map<PropertyKey, unknown>();

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  runWith<T>(store: Record<string, unknown>, fn: () => Promise<T> | T): Promise<T> | T {
    const previous = this.store;
    this.store = new Map(
      Reflect.ownKeys(store).map((key) => [key, (store as Record<PropertyKey, unknown>)[key]]),
    );
    let isAsync = false;
    try {
      const result = fn();
      if (result instanceof Promise) {
        isAsync = true;
        return result.finally(() => {
          this.store = previous;
        });
      }
      return result;
    } finally {
      if (!isAsync) {
        this.store = previous;
      }
    }
  }
}

describe('RequestContext', () => {
  it('throws when read outside an active request context', () => {
    const cls = new FakeClsService();
    const requestContext = new RequestContext(cls as never);

    expect(() => requestContext.tenantId).toThrow(RequestContextMissingError);
  });

  it('exposes values inside an active request context and allows internal patching', async () => {
    const cls = new FakeClsService();
    const requestContext = new RequestContext(cls as never);
    const mutator = new RequestContextMutator(cls as never);

    await mutator.runWithRequestContext(
      {
        requestId: '018f5502-9f95-7c6b-8c74-d1173ec95f14',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      async () => {
        expect(requestContext.requestId).toBe('018f5502-9f95-7c6b-8c74-d1173ec95f14');
        expect(requestContext.tenantId).toBeUndefined();

        mutator.patch({
          tenantId: 'tenant-a',
          actorId: 'actor-a',
          locale: 'pt-BR',
        });

        expect(requestContext.tenantId).toBe('tenant-a');
        expect(requestContext.actorId).toBe('actor-a');
        expect(requestContext.locale).toBe('pt-BR');
      },
    );
  });
});
