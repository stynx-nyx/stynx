import { RequestContext, RequestContextMutator } from '../../src/request-context';
import { SystemContext, withSystemContext } from '../../src/system-context';
import { SystemContextRequiredError } from '../../src/errors';
import type { SystemOperationRecord, SystemOperationSink } from '../../src/tokens';

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

class RecordingSink implements SystemOperationSink {
  readonly records: SystemOperationRecord[] = [];

  async write(record: SystemOperationRecord): Promise<void> {
    this.records.push(record);
  }
}

describe('SystemContext', () => {
  it('requires a readable reason and records an audit event', async () => {
    const cls = new FakeClsService();
    const sink = new RecordingSink();
    const requestContext = new RequestContext(cls as never);
    const mutator = new RequestContextMutator(cls as never);
    const systemContext = new SystemContext(requestContext, mutator, sink);

    const value = await systemContext.withSystemContext(
      'nightly retention sweep',
      async (context) => context.reason,
    );

    expect(value).toBe('nightly retention sweep');
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.reason).toBe('nightly retention sweep');
  });

  it('records active actor id from the request context when available', async () => {
    const cls = new FakeClsService();
    const sink = new RecordingSink();
    const requestContext = new RequestContext(cls as never);
    const mutator = new RequestContextMutator(cls as never);
    const systemContext = new SystemContext(requestContext, mutator, sink);

    await mutator.runWithRequestContext(
      {
        requestId: '018f5502-9f95-7c6b-8c74-d1173ec95f14',
        actorId: 'actor-a',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      () => systemContext.withSystemContext('actor visible repair', async () => undefined),
    );

    expect(sink.records[0]?.actorId).toBe('actor-a');
  });

  it('rejects reasons shorter than 10 characters', async () => {
    const cls = new FakeClsService();
    const systemContext = new SystemContext(
      new RequestContext(cls as never),
      new RequestContextMutator(cls as never),
    );
    await expect(systemContext.withSystemContext('short', async () => undefined)).rejects.toBeInstanceOf(
      SystemContextRequiredError,
    );
  });

  it('accepts a trimmed 10-character reason and stores the trimmed value', async () => {
    const cls = new FakeClsService();
    const sink = new RecordingSink();
    const systemContext = new SystemContext(
      new RequestContext(cls as never),
      new RequestContextMutator(cls as never),
      sink,
    );

    await expect(
      systemContext.withSystemContext(' 1234567890 ', async (context) => context.reason),
    ).resolves.toBe('1234567890');
    expect(sink.records[0]?.reason).toBe('1234567890');
  });

  it('current() throws SystemContextRequiredError when no system context is active', () => {
    const cls = new FakeClsService();
    const systemContext = new SystemContext(
      new RequestContext(cls as never),
      new RequestContextMutator(cls as never),
    );
    expect(() => systemContext.current()).toThrow(SystemContextRequiredError);
  });

  it('current() returns the active SystemExecutionContext set by withSystemContext', async () => {
    const cls = new FakeClsService();
    const systemContext = new SystemContext(
      new RequestContext(cls as never),
      new RequestContextMutator(cls as never),
    );
    const seen = await systemContext.withSystemContext('valid reason here', async () =>
      systemContext.current(),
    );
    expect(seen.reason).toBe('valid reason here');
  });

  it('defaults to a no-op sink when none is injected', async () => {
    const cls = new FakeClsService();
    const systemContext = new SystemContext(
      new RequestContext(cls as never),
      new RequestContextMutator(cls as never),
    );
    await expect(
      systemContext.withSystemContext('no sink scenario', async () => 'value'),
    ).resolves.toBe('value');
  });

  it('withSystemContext helper delegates to the SystemContext instance', async () => {
    const mock = { withSystemContext: vi.fn().mockResolvedValue('done') };
    const result = await withSystemContext(mock, 'helper invocation here', async () => 'unused');
    expect(result).toBe('done');
    expect(mock.withSystemContext).toHaveBeenCalledWith('helper invocation here', expect.any(Function));
  });
});
