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
});
