export interface StynxSseScope {
  tenantId: string;
  actorId: string;
  sessionId?: string;
}

export interface EventStreamContextRunner {
  withRequestContext<T>(scope: StynxSseScope, fn: () => Promise<T>): Promise<T>;
}

export interface EventStreamCursor {
  createdAt: Date;
  id: string;
}

export interface EventStreamRow extends EventStreamCursor {
  event: string;
}

export interface EventStreamSource<
  TRow extends EventStreamRow,
  TScope extends StynxSseScope = StynxSseScope,
> {
  now(scope: TScope): Promise<Date>;
  findById(id: string, scope: TScope): Promise<TRow | null>;
  listSince(cursor: EventStreamCursor, scope: TScope, limit: number): Promise<readonly TRow[]>;
}

export interface EventStreamScheduler {
  every(periodMs: number, tick: () => void): { cancel(): void };
}

export interface EventStreamMetricsSink {
  opened(scope: StynxSseScope): void;
  frame(scope: StynxSseScope): void;
  dropped(scope: StynxSseScope, id: string): void;
  closed(scope: StynxSseScope): void;
}

export interface StynxSseRequest {
  headers: Record<string, string | readonly string[] | undefined>;
  on(event: 'close', listener: () => void): unknown;
}

export interface StynxSseResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  write(chunk: string): unknown;
  end(): unknown;
  on(event: 'close', listener: () => void): unknown;
  flushHeaders?(): void;
  flush?(): void;
}

export interface StynxEventStreamOptions<
  TRow extends EventStreamRow,
  TScope extends StynxSseScope = StynxSseScope,
  TPayload = unknown,
> {
  scope: TScope;
  filter?: (row: TRow, scope: TScope) => boolean | Promise<boolean>;
  project: (row: TRow, scope: TScope) => TPayload | Promise<TPayload>;
  heartbeatMs?: number;
  replayWindowMs?: number;
  tickMs?: number;
  batchSize?: number;
  retryMs?: number;
  maxConnectionsPerActor?: number;
  retryAfterSeconds?: number;
  maxPayloadBytes?: number;
}
