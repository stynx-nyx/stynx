import { RequestContext, RequestContextMutator } from '../../src/request-context';
import { RequestContextMissingError, RequestContextMutationError } from '../../src/errors';

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
        expect(requestContext.tenantId).toBe(undefined);
        expect(requestContext.startedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
        expect(requestContext.hasActiveContext()).toBe(true);
        const initialSnapshot = requestContext.snapshot();
        expect(initialSnapshot).toEqual({
          requestId: '018f5502-9f95-7c6b-8c74-d1173ec95f14',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
        });
        expect(initialSnapshot.startedAt).not.toBe(requestContext.startedAt);

        mutator.patch({
          tenantId: 'tenant-a',
          actorId: 'actor-a',
          sessionId: 'session-a',
          locale: 'pt-BR',
        });
        mutator.patch({
          tenantId: 'tenant-b',
        });
        mutator.patch({
          actorId: 'actor-b',
        });

        expect(requestContext.tenantId).toBe('tenant-b');
        expect(requestContext.actorId).toBe('actor-b');
        expect(requestContext.sessionId).toBe('session-a');
        expect(requestContext.locale).toBe('pt-BR');
        expect(requestContext.snapshot()).toEqual({
          requestId: '018f5502-9f95-7c6b-8c74-d1173ec95f14',
          tenantId: 'tenant-b',
          actorId: 'actor-b',
          sessionId: 'session-a',
          locale: 'pt-BR',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
        });
      },
    );
  });

  it('throws when patching outside an active request context', () => {
    const cls = new FakeClsService();
    const mutator = new RequestContextMutator(cls as never);

    expect(() => mutator.patch({ locale: 'en-US' })).toThrow(RequestContextMutationError);
  });

  it('reports inactive state and opens system context without inherited actor', async () => {
    const cls = new FakeClsService();
    const requestContext = new RequestContext(cls as never);
    const mutator = new RequestContextMutator(cls as never);

    expect(requestContext.hasActiveContext()).toBe(false);
    const seen = await mutator.runWithSystemContext('scheduled repair', async (context) => context);
    expect(seen.actorId).toBe(undefined);
    expect(seen).toEqual(expect.objectContaining({
      reason: 'scheduled repair',
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      startedAt: expect.any(Date),
    }));
  });

  it('inherits actor id when opening a system context from an active request', async () => {
    const cls = new FakeClsService();
    const mutator = new RequestContextMutator(cls as never);

    await mutator.runWithRequestContext(
      {
        requestId: '018f5502-9f95-7c6b-8c74-d1173ec95f14',
        actorId: 'actor-a',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      async () => {
        const seen = await mutator.runWithSystemContext('system repair task', async (context) => {
          expect(mutator.getSystemContext()?.reason).toBe('system repair task');
          return context;
        });
        expect(seen.actorId).toBe('actor-a');
        expect(mutator.getSystemContext()).toBe(undefined);
      },
    );
  });
});
