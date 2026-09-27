import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import {
  StynxEventStreamModule,
  StynxEventStreamService,
  type EventStreamContextRunner,
  type EventStreamCursor,
  type EventStreamMetricsSink,
  type EventStreamRow,
  type EventStreamScheduler,
  type EventStreamSource,
  type StynxSseRequest,
  type StynxSseResponse,
} from '@stynx-nyx/backend';
import type { Database } from '@stynx-nyx/data';

type Scope = { tenantId: string; actorId: string; sessionId?: string; policy: 'visible' | 'hidden' };
type Row = EventStreamRow & { body: { message: string; tenant: string }; visible: boolean };

const scope: Scope = {
  tenantId: 'tenant-a',
  actorId: 'actor-a',
  sessionId: 'session-a',
  policy: 'visible',
};

class FakeScheduler implements EventStreamScheduler {
  readonly jobs: Array<{ periodMs: number; tick: () => void; cancelled: boolean }> = [];

  every(periodMs: number, tick: () => void) {
    const job = { periodMs, tick, cancelled: false };
    this.jobs.push(job);
    return { cancel: () => { job.cancelled = true; } };
  }

  async fire(periodMs: number): Promise<void> {
    for (const job of this.jobs.filter((candidate) => candidate.periodMs === periodMs && !candidate.cancelled)) {
      job.tick();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

class FakeContextRunner implements EventStreamContextRunner {
  readonly scopes: Scope[] = [];

  async withRequestContext<T>(captured: Scope, fn: () => Promise<T>): Promise<T> {
    this.scopes.push(structuredClone(captured));
    return fn();
  }
}

class FakeResponse implements StynxSseResponse {
  statusCode = 200;
  readonly headers = new Map<string, string>();
  readonly writes: string[] = [];
  readonly listeners = new Map<'close', Array<() => void>>();
  flushedHeaders = 0;
  flushedFrames = 0;
  ended = 0;

  setHeader(name: string, value: string): void { this.headers.set(name.toLowerCase(), value); }
  write(chunk: string): void { this.writes.push(chunk); }
  end(): void { this.ended += 1; }
  on(event: 'close', listener: () => void): void { this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); }
  flushHeaders(): void { this.flushedHeaders += 1; }
  flush(): void { this.flushedFrames += 1; }
  close(): void { for (const listener of this.listeners.get('close') ?? []) listener(); }
}

class FakeRequest implements StynxSseRequest {
  readonly listeners = new Map<'close', Array<() => void>>();
  constructor(readonly headers: StynxSseRequest['headers'] = {}) {}
  on(event: 'close', listener: () => void): void { this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); }
  close(): void { for (const listener of this.listeners.get('close') ?? []) listener(); }
}

function row(id: string, createdAt: string, visible = true): Row {
  return { id, createdAt: new Date(createdAt), event: 'record.changed', visible, body: { message: id, tenant: 'tenant-a' } };
}

function source(rows: readonly Row[], now = new Date('2026-09-26T12:00:00.000Z')): EventStreamSource<Row, Scope> & {
  calls: string[];
  cursors: EventStreamCursor[];
  failNextList: boolean;
} {
  const state = {
    calls: [] as string[],
    cursors: [] as EventStreamCursor[],
    failNextList: false,
    now: async (captured: Scope) => { state.calls.push(`now:${captured.tenantId}:${captured.policy}`); return now; },
    findById: async (id: string, captured: Scope) => {
      state.calls.push(`find:${id}:${captured.tenantId}:${captured.policy}`);
      return rows.find((candidate) => candidate.id === id && candidate.visible) ?? null;
    },
    listSince: async (cursor: EventStreamCursor, captured: Scope, _limit: number) => {
      state.calls.push(`list:${captured.tenantId}:${captured.policy}`);
      state.cursors.push(cursor);
      if (state.failNextList) { state.failNextList = false; throw new Error('database temporarily unavailable'); }
      return rows.filter((candidate) => candidate.visible && (
        candidate.createdAt > cursor.createdAt || (candidate.createdAt.getTime() === cursor.createdAt.getTime() && candidate.id > cursor.id)
      ));
    },
  };
  return state;
}

async function serviceWith(runner = new FakeContextRunner(), scheduler = new FakeScheduler(), metrics?: EventStreamMetricsSink) {
  const module = await Test.createTestingModule({
    imports: [StynxEventStreamModule.forRoot({ contextRunner: runner, scheduler, ...(metrics ? { metrics } : {}) })],
  }).compile();
  return { service: module.get(StynxEventStreamService), module, runner, scheduler };
}

// The concrete data Database intentionally satisfies this port; core.Database does not.
const structuralDataPort: EventStreamContextRunner = null as unknown as Database;
void structuralDataPort;

describe('StynxEventStreamService (UPS-SSE-01…10)', () => {
  it('opens a flushed, unbuffered SSE stream, emits retry/heartbeat and exposes metrics', async () => {
    const opened: string[] = [];
    const frames: string[] = [];
    const closed: string[] = [];
    const { service, module, scheduler } = await serviceWith(undefined, undefined, {
      opened: (value) => opened.push(value.tenantId),
      frame: (value) => frames.push(value.tenantId),
      dropped: () => undefined,
      closed: (value) => closed.push(value.tenantId),
    });
    const response = new FakeResponse();
    const request = new FakeRequest();
    const events = source([]);

    await service.open(request, response, events, {
      scope,
      tickMs: 1_000,
      batchSize: 10,
      retryMs: 1_500,
      project: (value) => value.body,
    });

    expect(response.headers).toEqual(new Map([
      ['content-type', 'text/event-stream'], ['cache-control', 'no-cache'],
      ['connection', 'keep-alive'], ['x-accel-buffering', 'no'],
    ]));
    expect(response.flushedHeaders).toBe(1);
    expect(response.writes).toEqual(['retry: 1500\n\n', ': connected\n\n']);
    expect(response.flushedFrames).toBeGreaterThanOrEqual(1);
    expect(opened).toEqual(['tenant-a']);
    expect(service.counters()).toMatchObject({ active: 1, opened: 1, frames: 0, drops: 0, closed: 0 });

    await scheduler.fire(20_000);
    expect(response.writes).toContain(': heartbeat\n\n');
    request.close();
    expect(scheduler.jobs.every((job) => job.cancelled)).toBe(true);
    expect(service.counters()).toMatchObject({ active: 0, closed: 1 });
    expect(frames).toEqual([]);
    expect(closed).toEqual(['tenant-a']);
    await module.close();
  });

  it('uses the immutable captured scope for preflight and every timer tick, never inherited ALS', async () => {
    const { service, module, runner, scheduler } = await serviceWith();
    const response = new FakeResponse();
    const events = source([row('a-1', '2026-09-26T12:00:01.000Z')]);
    await service.open(new FakeRequest(), response, events, { scope, tickMs: 1_000, batchSize: 10, project: (value, passedScope) => ({ id: value.id, policy: passedScope.policy }) });

    await scheduler.fire(1_000);
    expect(runner.scopes).toHaveLength(2);
    expect(runner.scopes).toEqual([scope, scope]);
    expect(events.calls).toEqual(['now:tenant-a:visible', 'list:tenant-a:visible']);
    expect(response.writes).toContain('id: a-1\nevent: record.changed\ndata: {"id":"a-1","policy":"visible"}\n\n');
    await module.close();
  });

  it('rejects missing scope before source work or stream headers and validates injected IDs', async () => {
    const { service, module } = await serviceWith();
    const events = source([]);
    const noTenant = new FakeResponse();
    await service.open(new FakeRequest(), noTenant, events, { scope: { ...scope, tenantId: '' }, tickMs: 1, batchSize: 1, project: (value) => value.body });
    expect(noTenant.statusCode).toBe(400);
    expect(noTenant.writes).toEqual([]);
    expect(events.calls).toEqual([]);

    const noActor = new FakeResponse();
    await service.open(new FakeRequest(), noActor, events, { scope: { ...scope, actorId: '' }, tickMs: 1, batchSize: 1, project: (value) => value.body });
    expect(noActor.statusCode).toBe(401);
    expect(noActor.writes).toEqual([]);
    const badHeader = new FakeResponse();
    await service.open(new FakeRequest({ 'last-event-id': 'a\r\nX-Injected: yes' }), badHeader, events, { scope, tickMs: 1, batchSize: 1, project: (value) => value.body });
    expect(badHeader.statusCode).toBe(400);
    expect(badHeader.writes).toEqual([]);
    await module.close();
  });

  it('replays after a visible recent cursor, returns 204 for expired, and treats hidden/unknown IDs alike', async () => {
    const recent = row('a-recent', '2026-09-26T11:59:00.000Z');
    const expired = row('a-expired', '2026-09-25T11:59:59.999Z');
    const hidden = row('b-private', '2026-09-26T11:58:00.000Z', false);
    const events = source([recent, expired, hidden]);
    const { service, module } = await serviceWith();

    const replay = new FakeResponse();
    await service.open(new FakeRequest({ 'last-event-id': recent.id }), replay, events, { scope, tickMs: 1, batchSize: 10, project: (value) => value.body });
    expect(events.cursors.at(-1)).toEqual({ createdAt: recent.createdAt, id: recent.id });

    const expiredResponse = new FakeResponse();
    await service.open(new FakeRequest({ 'last-event-id': expired.id }), expiredResponse, events, { scope, tickMs: 1, batchSize: 10, project: (value) => value.body });
    expect(expiredResponse.statusCode).toBe(204);
    expect(expiredResponse.writes).toEqual([]);
    expect(expiredResponse.headers.size).toBe(0);

    const foreignResponse = new FakeResponse();
    await service.open(new FakeRequest({ 'last-event-id': hidden.id }), foreignResponse, events, { scope, tickMs: 1, batchSize: 10, project: (value) => value.body });
    const unknownResponse = new FakeResponse();
    await service.open(new FakeRequest({ 'last-event-id': 'does-not-exist' }), unknownResponse, events, { scope, tickMs: 1, batchSize: 10, project: (value) => value.body });
    expect(events.cursors.slice(-2)).toEqual([
      { createdAt: new Date('2026-09-26T12:00:00.000Z'), id: '' },
      { createdAt: new Date('2026-09-26T12:00:00.000Z'), id: '' },
    ]);
    expect(foreignResponse.statusCode).toBe(200);
    expect(unknownResponse.statusCode).toBe(200);
    await module.close();
  });

  it('filters before projection, writes a complete frame or a drop marker, serializes ticks and survives a read failure', async () => {
    const first = row('a-1', '2026-09-26T12:00:01.000Z');
    const dropped = row('a-2', '2026-09-26T12:00:02.000Z');
    const events = source([first, dropped]);
    const { service, module, scheduler } = await serviceWith();
    const response = new FakeResponse();
    await service.open(new FakeRequest(), response, events, {
      scope,
      tickMs: 1,
      batchSize: 10,
      maxPayloadBytes: 64,
      filter: (value) => value.id !== 'a-ignored',
      project: (value) => value.id === dropped.id ? { huge: 'x'.repeat(100) } : value.body,
    });
    events.failNextList = true;
    await Promise.all([scheduler.fire(1), scheduler.fire(1)]);
    expect(response.ended).toBe(0);
    expect(events.cursors).toEqual([
      { createdAt: new Date('2026-09-26T12:00:00.000Z'), id: '' },
    ]);
    await scheduler.fire(1);
    expect(events.cursors[1]).toEqual(events.cursors[0]);
    expect(response.writes).toContain(': dropped a-2\n\n');
    expect(response.writes.some((chunk) => chunk.includes('x'.repeat(100)))).toBe(false);
    expect(service.counters()).toMatchObject({ drops: 1 });
    await module.close();
  });

  it('drops deterministic poison rows, advances to later rows, and reports every drop', async () => {
    const rows = [
      row('unsafe\nID', '2026-09-26T12:00:01.000Z'),
      { ...row('bad-event', '2026-09-26T12:00:02.000Z'), event: 'bad\revent' },
      row('projection-throws', '2026-09-26T12:00:03.000Z'),
      row('projection-undefined', '2026-09-26T12:00:04.000Z'),
      row('projection-circular', '2026-09-26T12:00:05.000Z'),
      row('good-after-poison', '2026-09-26T12:00:06.000Z'),
    ];
    const drops: string[] = [];
    const events = source(rows);
    const { service, module, scheduler } = await serviceWith(undefined, undefined, {
      opened: () => undefined,
      frame: () => undefined,
      dropped: (_captured, id) => drops.push(id),
      closed: () => undefined,
    });
    const response = new FakeResponse();
    await service.open(new FakeRequest(), response, events, {
      scope, tickMs: 1, batchSize: 10,
      project: (value) => {
        if (value.id === 'projection-throws') throw new Error('deterministic projection failure');
        if (value.id === 'projection-undefined') return undefined;
        if (value.id === 'projection-circular') { const cycle: { self?: object } = {}; cycle.self = cycle; return cycle; }
        return value.body;
      },
    });
    await scheduler.fire(1);
    await vi.waitFor(() => expect(response.writes.join('')).toContain('id: good-after-poison\n'));
    expect(response.writes.join('')).not.toContain('unsafe\nID');
    expect(response.writes.join('')).not.toContain('bad\revent');
    expect(response.writes).not.toContain(': dropped unsafe\nID\n\n');
    expect(response.writes).toEqual(expect.arrayContaining([
      ': dropped bad-event\n\n',
      ': dropped projection-throws\n\n',
      ': dropped projection-undefined\n\n',
      ': dropped projection-circular\n\n',
    ]));
    expect(drops).toEqual(rows.slice(0, 5).map((value) => value.id));
    expect(service.counters()).toMatchObject({ drops: 5, frames: 1 });
    await scheduler.fire(1);
    expect(events.cursors.at(-1)).toEqual({ createdAt: rows.at(-1)!.createdAt, id: 'good-after-poison' });
    expect(service.counters()).toMatchObject({ drops: 5, frames: 1 });
    await module.close();
  });

  it('ends every open response and releases timers and slots on module shutdown', async () => {
    const { service, module, scheduler } = await serviceWith();
    const events = source([]);
    const responses = [new FakeResponse(), new FakeResponse()];
    for (const response of responses) {
      await service.open(new FakeRequest(), response, events, {
        scope, tickMs: 1, batchSize: 1, maxConnectionsPerActor: 2,
        project: (value) => value.body,
      });
    }
    expect(service.counters()).toMatchObject({ active: 2, opened: 2 });
    await module.close();
    expect(responses.map((response) => response.ended)).toEqual([1, 1]);
    expect(scheduler.jobs.every((job) => job.cancelled)).toBe(true);
    expect(service.counters()).toMatchObject({ active: 0, closed: 2 });
  });

  it('enforces actor quota, releases it exactly once across both close signals, and rejects invalid numeric limits', async () => {
    const { service, module } = await serviceWith();
    const events = source([]);
    const firstRequest = new FakeRequest();
    const first = new FakeResponse();
    await service.open(firstRequest, first, events, { scope, tickMs: 1, batchSize: 1, maxConnectionsPerActor: 1, retryAfterSeconds: 7, project: (value) => value.body });
    const rejected = new FakeResponse();
    await service.open(new FakeRequest(), rejected, events, { scope, tickMs: 1, batchSize: 1, maxConnectionsPerActor: 1, retryAfterSeconds: 7, project: (value) => value.body });
    expect(rejected.statusCode).toBe(429);
    expect(rejected.headers.get('retry-after')).toBe('7');
    expect(rejected.writes).toEqual([]);
    firstRequest.close();
    first.close();
    expect(service.counters().closed).toBe(1);
    await expect(service.open(new FakeRequest(), new FakeResponse(), events, { scope, tickMs: 0, batchSize: 1, project: (value) => value.body })).rejects.toThrow();
    await module.close();
  });
});
