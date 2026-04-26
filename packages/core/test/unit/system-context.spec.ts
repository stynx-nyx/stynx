import { RequestContext, RequestContextMutator } from '../../src/request-context';
import { SystemContext } from '../../src/system-context';
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
});
