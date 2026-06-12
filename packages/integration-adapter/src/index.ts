/**
 * Public integration adapter framework exports.
 *
 * @packageDocumentation
 */
import type {
  CircuitBreaker,
  CircuitBreakerPolicy,
  CircuitSnapshot,
  IdempotencyStore,
  IntegrationAdapterOptions,
  IntegrationContext,
  IntegrationTelemetryEvent,
  RetryPolicy,
} from './types';

export * from './types';

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 1,
  baseDelayMs: 0,
};

const DEFAULT_CIRCUIT_POLICY: CircuitBreakerPolicy = {
  failureThreshold: 3,
  openAfterMs: 0,
  halfOpenAfterMs: 30_000,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldRetry(policy: RetryPolicy, error: unknown, attempt: number): boolean {
  if (attempt >= policy.maxAttempts) {
    return false;
  }
  return policy.retryable ? policy.retryable(error, attempt) : true;
}

function delayForAttempt(policy: RetryPolicy, attempt: number): number {
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exponential, policy.maxDelayMs ?? exponential);
  if (!policy.jitterRatio) {
    return capped;
  }
  return Math.round(capped + capped * policy.jitterRatio * 0.5);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Integration request timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

/**
 * Process-local idempotency store for adapter tests and lightweight consumers.
 */
export class InMemoryIdempotencyStore<TRes> implements IdempotencyStore<TRes> {
  private readonly values = new Map<string, TRes>();

  async get(key: string): Promise<TRes | undefined> {
    return this.values.get(key);
  }

  async set(key: string, value: TRes): Promise<void> {
    this.values.set(key, value);
  }
}

/**
 * Process-local circuit breaker that tracks failures per integration key.
 */
export class InMemoryCircuitBreaker implements CircuitBreaker {
  private readonly snapshots = new Map<string, CircuitSnapshot>();

  constructor(
    private readonly policy: CircuitBreakerPolicy = DEFAULT_CIRCUIT_POLICY,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async beforeRequest(key: string): Promise<CircuitSnapshot> {
    const snapshot = this.snapshot(key);
    if (snapshot.state !== 'open') {
      return snapshot;
    }
    const openedAt = snapshot.openedAt ?? 0;
    if (this.now() - openedAt >= this.policy.halfOpenAfterMs) {
      const halfOpen = { ...snapshot, state: 'half-open' as const };
      this.snapshots.set(key, halfOpen);
      return halfOpen;
    }
    throw new Error(`Circuit breaker is open for ${key}`);
  }

  async recordSuccess(key: string): Promise<void> {
    this.snapshots.set(key, {
      key,
      state: 'closed',
      failures: 0,
    });
  }

  async recordFailure(key: string): Promise<CircuitSnapshot> {
    const current = this.snapshot(key);
    const failures = current.failures + 1;
    const shouldOpen = failures >= this.policy.failureThreshold;
    const next: CircuitSnapshot = {
      key,
      state: shouldOpen ? 'open' : 'closed',
      failures,
      openedAt: shouldOpen ? this.now() + this.policy.openAfterMs : undefined,
    };
    this.snapshots.set(key, next);
    return next;
  }

  snapshot(key: string): CircuitSnapshot {
    return (
      this.snapshots.get(key) ?? {
        key,
        state: 'closed',
        failures: 0,
      }
    );
  }
}

/**
 * Executes integration calls with retry, timeout, idempotency, and circuit-breaker controls.
 */
export class IntegrationAdapter<TReq, TRaw, TRes> {
  private readonly retryPolicy: RetryPolicy;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly idempotencyStore: IdempotencyStore<TRes>;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly options: IntegrationAdapterOptions<TReq, TRaw, TRes>) {
    this.retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.now = options.now ?? (() => Date.now());
    this.circuitBreaker =
      options.circuitBreaker ?? new InMemoryCircuitBreaker(DEFAULT_CIRCUIT_POLICY, this.now);
    this.idempotencyStore = options.idempotencyStore ?? new InMemoryIdempotencyStore<TRes>();
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async execute(input: TReq, context: IntegrationContext = {}): Promise<TRes> {
    const started = this.now();
    const idempotencyKey = this.options.idempotencyKey?.(input, context);
    const circuitBreakerKey = this.options.circuitBreakerKey?.(input, context);
    if (idempotencyKey) {
      const existing = await this.idempotencyStore.get(idempotencyKey);
      if (existing !== undefined) {
        await this.emit({
          phase: 'idempotency-hit',
          attempt: 0,
          idempotencyKey,
          circuitBreakerKey,
          context,
        });
        return existing;
      }
    }
    if (circuitBreakerKey) {
      try {
        await this.circuitBreaker.beforeRequest(circuitBreakerKey);
      } catch (error) {
        await this.emit({
          phase: 'circuit-open',
          attempt: 0,
          idempotencyKey,
          circuitBreakerKey,
          error,
          context,
        });
        throw error;
      }
    }

    let attempt = 1;
    let lastError: unknown;
    while (attempt <= this.retryPolicy.maxAttempts) {
      await this.emit({ phase: 'start', attempt, idempotencyKey, circuitBreakerKey, context });
      try {
        const raw = await withTimeout(this.options.request(input, context), this.options.timeoutMs);
        const parsed = await this.options.parseResponse(raw, input, context);
        if (idempotencyKey) {
          await this.idempotencyStore.set(idempotencyKey, parsed);
        }
        if (circuitBreakerKey) {
          await this.circuitBreaker.recordSuccess(circuitBreakerKey);
        }
        await this.emit({
          phase: 'success',
          attempt,
          idempotencyKey,
          circuitBreakerKey,
          durationMs: this.now() - started,
          context,
        });
        return parsed;
      } catch (error) {
        lastError = error;
        if (circuitBreakerKey) {
          await this.circuitBreaker.recordFailure(circuitBreakerKey);
        }
        if (!shouldRetry(this.retryPolicy, error, attempt)) {
          await this.emit({
            phase: 'failure',
            attempt,
            idempotencyKey,
            circuitBreakerKey,
            error,
            durationMs: this.now() - started,
            context,
          });
          break;
        }
        await this.emit({
          phase: 'retry',
          attempt,
          idempotencyKey,
          circuitBreakerKey,
          error,
          context,
        });
        await this.sleep(delayForAttempt(this.retryPolicy, attempt));
        attempt += 1;
      }
    }
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error(`Integration ${this.options.name} failed: ${errorMessage(lastError)}`);
  }

  private async emit(event: Omit<IntegrationTelemetryEvent, 'adapter'>): Promise<void> {
    await this.options.telemetry?.emit({
      adapter: this.options.name,
      ...event,
    });
  }
}
