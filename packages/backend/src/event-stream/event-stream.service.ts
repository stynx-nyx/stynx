import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { STYNX_SSE_CONTEXT_RUNNER, STYNX_SSE_METRICS, STYNX_SSE_SCHEDULER } from './tokens';
import type {
  EventStreamContextRunner, EventStreamCursor, EventStreamMetricsSink, EventStreamRow,
  EventStreamScheduler, EventStreamSource, StynxEventStreamOptions, StynxSseRequest,
  StynxSseResponse, StynxSseScope,
} from './types';

const DEFAULT_HEARTBEAT_MS = 20_000;
const DEFAULT_REPLAY_WINDOW_MS = 86_400_000;
const DEFAULT_TICK_MS = 1_000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_RETRY_AFTER_SECONDS = 1;
const MAX_ID_LENGTH = 4_096;

function positive(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) throw new RangeError(`${name} must be finite and positive`);
  return resolved;
}

function safeLine(value: string): boolean {
  return value.length > 0 && value.length <= MAX_ID_LENGTH && !/[\r\n\0]/u.test(value);
}

function header(request: StynxSseRequest, name: string): { present: boolean; value?: string } {
  const entries = Object.entries(request.headers).filter(([key]) => key.toLowerCase() === name);
  if (entries.length === 0) return { present: false };
  if (entries.length !== 1) return { present: true };
  const value = entries[0]![1];
  if (typeof value === 'string') return { present: true, value };
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
    return { present: true, value: value[0] };
  }
  return { present: true };
}

function reject(response: StynxSseResponse, status: number, code?: string, retryAfter?: number): void {
  response.statusCode = status;
  if (code) response.setHeader('X-Stynx-Error-Code', code);
  if (retryAfter !== undefined) response.setHeader('Retry-After', String(Math.ceil(retryAfter)));
  response.end();
}

@Injectable()
export class StynxEventStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(StynxEventStreamService.name);
  private readonly slots = new Map<string, number>();
  private readonly connectionClosers = new Set<() => void>();
  private active = 0;
  private opened = 0;
  private frames = 0;
  private drops = 0;
  private closed = 0;

  constructor(
    @Inject(STYNX_SSE_CONTEXT_RUNNER) private readonly contextRunner: EventStreamContextRunner,
    @Inject(STYNX_SSE_SCHEDULER) private readonly scheduler: EventStreamScheduler,
    @Inject(STYNX_SSE_METRICS) private readonly metrics?: EventStreamMetricsSink,
  ) {}

  counters(): Readonly<{ active: number; opened: number; frames: number; drops: number; closed: number }> {
    return { active: this.active, opened: this.opened, frames: this.frames, drops: this.drops, closed: this.closed };
  }

  onModuleDestroy(): void {
    for (const close of this.connectionClosers) close();
  }

  async open<TRow extends EventStreamRow, TScope extends StynxSseScope, TPayload>(
    request: StynxSseRequest,
    response: StynxSseResponse,
    source: EventStreamSource<TRow, TScope>,
    options: StynxEventStreamOptions<TRow, TScope, TPayload>,
  ): Promise<void> {
    const scope = Object.freeze({ ...options.scope }) as TScope;
    if (!scope.tenantId?.trim()) { reject(response, 400, 'SSE_TENANT_REQUIRED'); return; }
    if (!scope.actorId?.trim()) { reject(response, 401, 'SSE_ACTOR_REQUIRED'); return; }

    const heartbeatMs = positive(options.heartbeatMs, DEFAULT_HEARTBEAT_MS, 'heartbeatMs');
    const replayWindowMs = positive(options.replayWindowMs, DEFAULT_REPLAY_WINDOW_MS, 'replayWindowMs');
    const tickMs = positive(options.tickMs, DEFAULT_TICK_MS, 'tickMs');
    const batchSize = positive(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize');
    const retryAfterSeconds = positive(options.retryAfterSeconds, DEFAULT_RETRY_AFTER_SECONDS, 'retryAfterSeconds');
    const retryMs = options.retryMs === undefined ? undefined : positive(options.retryMs, 1, 'retryMs');
    const maxPayloadBytes = options.maxPayloadBytes === undefined ? undefined : positive(options.maxPayloadBytes, 1, 'maxPayloadBytes');
    const maxConnectionsPerActor = options.maxConnectionsPerActor === undefined
      ? undefined : positive(options.maxConnectionsPerActor, 1, 'maxConnectionsPerActor');
    if (!Number.isInteger(batchSize) || (maxConnectionsPerActor !== undefined && !Number.isInteger(maxConnectionsPerActor))) {
      throw new RangeError('batchSize and maxConnectionsPerActor must be integers');
    }

    const slotKey = JSON.stringify([scope.tenantId, scope.actorId]);
    if (maxConnectionsPerActor !== undefined && (this.slots.get(slotKey) ?? 0) >= maxConnectionsPerActor) {
      reject(response, 429, 'SSE_CONNECTION_LIMIT', retryAfterSeconds);
      return;
    }
    this.slots.set(slotKey, (this.slots.get(slotKey) ?? 0) + 1);
    let reserved = true;
    const release = () => {
      if (!reserved) return;
      reserved = false;
      const remaining = (this.slots.get(slotKey) ?? 1) - 1;
      if (remaining > 0) this.slots.set(slotKey, remaining);
      else this.slots.delete(slotKey);
    };
    let disconnected = false;
    const markDisconnected = () => { disconnected = true; release(); };
    // Node's IncomingMessage also emits "close" after a normal GET request is
    // fully read. In that case the outgoing SSE response is still live.
    const requestClosed = () => {
      const incoming = request as StynxSseRequest & { complete?: boolean; aborted?: boolean };
      if (incoming.complete && !incoming.aborted) return;
      markDisconnected();
    };
    request.on('close', requestClosed);
    response.on('close', markDisconnected);

    const lastHeader = header(request, 'last-event-id');
    const lastId = lastHeader.value;
    if (lastHeader.present && (lastId === undefined || !safeLine(lastId))) {
      release(); reject(response, 400, 'SSE_INVALID_LAST_EVENT_ID'); return;
    }
    let cursor: EventStreamCursor;
    try {
      const visible = lastId === undefined ? null : await this.contextRunner.withRequestContext(scope, () => source.findById(lastId, scope));
      const now = await this.contextRunner.withRequestContext(scope, () => source.now(scope));
      if (visible) {
        if (now.getTime() - visible.createdAt.getTime() > replayWindowMs) {
          release(); if (!disconnected) reject(response, 204); return;
        }
        cursor = { createdAt: visible.createdAt, id: visible.id };
      } else {
        cursor = { createdAt: now, id: '' };
      }
    } catch {
      release();
      this.logger.warn('SSE cursor preflight failed');
      if (!disconnected) reject(response, 503, 'SSE_SOURCE_UNAVAILABLE');
      return;
    }
    if (disconnected) return;

    let closed = false;
    let running = false;
    const schedules: Array<{ cancel(): void }> = [];
    const metric = (send: (sink: EventStreamMetricsSink) => void) => {
      try { if (this.metrics) send(this.metrics); } catch { this.logger.warn('SSE metrics sink failed'); }
    };
    const close = () => {
      if (closed) return;
      closed = true;
      for (const schedule of schedules) schedule.cancel();
      release();
      this.connectionClosers.delete(close);
      this.active -= 1;
      this.closed += 1;
      metric((sink) => sink.closed(scope));
    };

    const write = (chunk: string) => {
      if (closed) return;
      response.write(chunk);
      response.flush?.();
    };

    const tick = async () => {
      if (running || closed) return;
      running = true;
      try {
        // Every invocation enters a new request context. No timer-local ALS is trusted.
        await this.contextRunner.withRequestContext(scope, async () => {
          const rows = await source.listSince(cursor, scope, batchSize);
          for (const row of rows) {
            if (closed) break;
            if (!safeLine(row.id) || !safeLine(row.event)) throw new Error('Invalid SSE source frame field');
            if (await options.filter?.(row, scope) === false) {
              cursor = { createdAt: row.createdAt, id: row.id };
              continue;
            }
            const payload = JSON.stringify(await options.project(row, scope));
            if (payload === undefined) throw new Error('SSE projection is not JSON serializable');
            if (maxPayloadBytes !== undefined && Buffer.byteLength(payload, 'utf8') > maxPayloadBytes) {
              write(`: dropped ${row.id}\n\n`);
              this.drops += 1;
              metric((sink) => sink.dropped(scope, row.id));
            } else {
              write(`id: ${row.id}\nevent: ${row.event}\ndata: ${payload}\n\n`);
              this.frames += 1;
              metric((sink) => sink.frame(scope));
            }
            cursor = { createdAt: row.createdAt, id: row.id };
          }
        });
      } catch {
        this.logger.warn('SSE tick failed; connection remains open');
      } finally {
        running = false;
      }
    };

    try {
      this.active += 1;
      this.opened += 1;
      this.connectionClosers.add(close);
      request.on('close', () => { if (disconnected) close(); });
      response.on('close', close);
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Cache-Control', 'no-cache');
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders?.();
      metric((sink) => sink.opened(scope));
      if (retryMs !== undefined) write(`retry: ${retryMs}\n\n`);
      write(': connected\n\n');
      schedules.push(this.scheduler.every(heartbeatMs, () => write(': heartbeat\n\n')));
      schedules.push(this.scheduler.every(tickMs, () => { void tick(); }));
      if (lastId !== undefined) await tick();
    } catch {
      close();
      response.end();
    }
  }
}
