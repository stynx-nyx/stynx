export interface IntegrationContext {
  tenantId?: string;
  actorId?: string;
  correlationId?: string;
  deadline?: Date;
  metadata?: Record<string, string>;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  retryable?: (error: unknown, attempt: number) => boolean;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerPolicy {
  failureThreshold: number;
  openAfterMs: number;
  halfOpenAfterMs: number;
}

export interface CircuitSnapshot {
  key: string;
  state: CircuitState;
  failures: number;
  openedAt?: number | undefined;
}

export interface IntegrationTelemetryEvent {
  adapter: string;
  phase: 'start' | 'success' | 'retry' | 'failure' | 'circuit-open' | 'idempotency-hit';
  attempt: number;
  idempotencyKey?: string | undefined;
  circuitBreakerKey?: string | undefined;
  durationMs?: number;
  error?: unknown;
  context: IntegrationContext;
}

export interface IntegrationTelemetry {
  emit(event: IntegrationTelemetryEvent): void | Promise<void>;
}

export interface IdempotencyStore<TRes> {
  get(key: string): Promise<TRes | undefined>;
  set(key: string, value: TRes): Promise<void>;
}

export interface CircuitBreaker {
  beforeRequest(key: string): Promise<CircuitSnapshot>;
  recordSuccess(key: string): Promise<void>;
  recordFailure(key: string): Promise<CircuitSnapshot>;
  snapshot(key: string): CircuitSnapshot;
}

export interface IntegrationAdapterOptions<TReq, TRaw, TRes> {
  name: string;
  request: (input: TReq, context: IntegrationContext) => Promise<TRaw>;
  parseResponse: (raw: TRaw, input: TReq, context: IntegrationContext) => Promise<TRes> | TRes;
  idempotencyKey?: (input: TReq, context: IntegrationContext) => string | undefined;
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
  circuitBreakerKey?: (input: TReq, context: IntegrationContext) => string | undefined;
  circuitBreaker?: CircuitBreaker;
  idempotencyStore?: IdempotencyStore<TRes>;
  telemetry?: IntegrationTelemetry;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}
