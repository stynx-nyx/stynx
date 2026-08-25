import {
  InMemoryCircuitBreaker,
  InMemoryIdempotencyStore,
  IntegrationAdapter,
  type IntegrationTelemetryEvent,
} from '../../src';

describe('IntegrationAdapter', () => {
  it('executes the happy path and emits success telemetry', async () => {
    const events: IntegrationTelemetryEvent[] = [];
    const adapter = new IntegrationAdapter({
      name: 'provider',
      request: async (input: { id: string }) => ({ providerId: input.id }),
      parseResponse: (raw) => ({ ok: true, providerId: raw.providerId }),
      telemetry: { emit: (event) => events.push(event) },
    });

    const result = await adapter.execute({ id: '1' }, { tenantId: 'tenant-a' });

    expect(result).toEqual({ ok: true, providerId: '1' });
    expect(events.map((event) => event.phase)).toEqual(['start', 'success']);
  });

  it('retries retryable failures', async () => {
    let attempts = 0;
    const adapter = new IntegrationAdapter({
      name: 'provider',
      request: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('temporary');
        }
        return { ok: true };
      },
      parseResponse: (raw) => raw,
      retryPolicy: { maxAttempts: 2, baseDelayMs: 0 },
      sleep: async () => undefined,
    });

    await expect(adapter.execute({})).resolves.toEqual({ ok: true });
    expect(attempts).toBe(2);
  });

  it('rethrows the terminal provider error after retry exhaustion', async () => {
    const terminal = new Error('provider terminal failure');
    const adapter = new IntegrationAdapter({
      name: 'provider',
      request: vi.fn().mockRejectedValue(terminal),
      parseResponse: (raw) => raw,
      retryPolicy: { maxAttempts: 2, baseDelayMs: 0 },
      sleep: async () => undefined,
    });

    await expect(adapter.execute({})).rejects.toBe(terminal);
  });

  it('opens the circuit after configured failures', async () => {
    const circuitBreaker = new InMemoryCircuitBreaker(
      {
        failureThreshold: 1,
        openAfterMs: 0,
        halfOpenAfterMs: 60_000,
      },
      () => 1000,
    );
    const adapter = new IntegrationAdapter({
      name: 'provider',
      request: async () => {
        throw new Error('provider down');
      },
      parseResponse: (raw) => raw,
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
      circuitBreakerKey: () => 'provider',
      circuitBreaker,
    });

    await expect(adapter.execute({})).rejects.toThrow('provider down');
    await expect(adapter.execute({})).rejects.toThrow('Circuit breaker is open for provider');
    expect(circuitBreaker.snapshot('provider').state).toBe('open');
  });

  it('deduplicates responses by idempotency key', async () => {
    let calls = 0;
    const adapter = new IntegrationAdapter({
      name: 'provider',
      request: async (input: { id: string }) => {
        calls += 1;
        return { id: input.id, calls };
      },
      parseResponse: (raw) => raw,
      idempotencyKey: (input) => input.id,
      idempotencyStore: new InMemoryIdempotencyStore(),
    });

    const first = await adapter.execute({ id: 'same' });
    const second = await adapter.execute({ id: 'same' });

    expect(first).toEqual({ id: 'same', calls: 1 });
    expect(second).toEqual({ id: 'same', calls: 1 });
    expect(calls).toBe(1);
  });

  it('persists and retrieves explicit idempotency values', async () => {
    const store = new InMemoryIdempotencyStore<number>();

    await expect(store.get('missing')).resolves.toBeUndefined();
    await store.set('answer', 42);
    await expect(store.get('answer')).resolves.toBe(42);
  });

  it('moves open circuits through half-open and closed states', async () => {
    let now = 1_000;
    const breaker = new InMemoryCircuitBreaker(
      { failureThreshold: 2, openAfterMs: 10, halfOpenAfterMs: 100 },
      () => now,
    );

    await expect(breaker.beforeRequest('provider')).resolves.toMatchObject({ state: 'closed' });
    await expect(breaker.recordFailure('provider')).resolves.toMatchObject({
      state: 'closed',
      failures: 1,
    });
    await expect(breaker.recordFailure('provider')).resolves.toMatchObject({
      state: 'open',
      failures: 2,
      openedAt: 1_010,
    });
    await expect(breaker.beforeRequest('provider')).rejects.toThrow('Circuit breaker is open');

    now = 1_110;
    await expect(breaker.beforeRequest('provider')).resolves.toMatchObject({ state: 'half-open' });
    await breaker.recordSuccess('provider');
    expect(breaker.snapshot('provider')).toEqual({
      key: 'provider',
      state: 'closed',
      failures: 0,
    });
  });

  it('uses retry predicates, capped jitter delays, timeout failures, and failure telemetry', async () => {
    const events: IntegrationTelemetryEvent[] = [];
    const sleep = vi.fn(async () => undefined);
    let attempts = 0;
    const adapter = new IntegrationAdapter({
      name: 'provider',
      request: async () => {
        attempts += 1;
        throw attempts === 1 ? 'temporary' : new Error('terminal');
      },
      parseResponse: (raw) => raw,
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 20,
        maxDelayMs: 10,
        jitterRatio: 0.4,
        retryable: (_error, attempt) => attempt === 1,
      },
      sleep,
      telemetry: { emit: (event) => events.push(event) },
    });

    await expect(adapter.execute({})).rejects.toThrow('terminal');
    expect(sleep).toHaveBeenCalledWith(12);
    expect(events.map(({ phase }) => phase)).toEqual(['start', 'retry', 'start', 'failure']);

    const timeout = new IntegrationAdapter({
      name: 'slow-provider',
      request: () => new Promise(() => undefined),
      parseResponse: (raw) => raw,
      timeoutMs: 1,
    });
    await expect(timeout.execute({})).rejects.toThrow('timed out after 1ms');
  });

  it('records successful keyed calls and emits circuit-open and idempotency-hit telemetry', async () => {
    const events: IntegrationTelemetryEvent[] = [];
    const breaker = new InMemoryCircuitBreaker(
      { failureThreshold: 1, openAfterMs: 0, halfOpenAfterMs: 60_000 },
      () => 100,
    );
    const store = new InMemoryIdempotencyStore<{ ok: boolean }>();
    const base = {
      name: 'provider',
      request: async () => ({ ok: true }),
      parseResponse: (raw: { ok: boolean }) => raw,
      idempotencyKey: () => 'request-1',
      circuitBreakerKey: () => 'provider-1',
      circuitBreaker: breaker,
      idempotencyStore: store,
      telemetry: { emit: (event: IntegrationTelemetryEvent) => events.push(event) },
      now: () => 100,
    };
    const adapter = new IntegrationAdapter(base);

    await expect(adapter.execute({})).resolves.toEqual({ ok: true });
    await expect(adapter.execute({})).resolves.toEqual({ ok: true });
    expect(events.map(({ phase }) => phase)).toEqual(['start', 'success', 'idempotency-hit']);

    await breaker.recordFailure('blocked');
    const blocked = new IntegrationAdapter({
      ...base,
      idempotencyKey: () => undefined,
      circuitBreakerKey: () => 'blocked',
    });
    await expect(blocked.execute({})).rejects.toThrow('Circuit breaker is open for blocked');
    expect(events.at(-1)?.phase).toBe('circuit-open');
  });

  it('normalizes a non-Error terminal rejection when no attempts are allowed', async () => {
    const adapter = new IntegrationAdapter({
      name: 'disabled-provider',
      request: async () => 'unused',
      parseResponse: (raw) => raw,
      retryPolicy: { maxAttempts: 0, baseDelayMs: 0 },
    });

    await expect(adapter.execute({})).rejects.toThrow('Integration disabled-provider failed');
  });
});
