import '@angular/compiler';
import { HttpContext, HttpEventType } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { UnauthorizedError } from '@stynx-nyx/sdk';
import { Subject } from 'rxjs';
import type { StynxEventStreamTransport } from '@stynx-nyx/angular';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { STYNX_SSE_REQUEST, StynxEventStreamService, provideStynxEventStream, type StynxEventStreamConfig } from '@stynx-nyx/angular';
import { TenantContextService } from '@stynx-nyx/angular-tenancy';
import { FakeStynxEventStreamClock, FakeStynxEventStreamTransport } from '@stynx-nyx/angular/testing';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });

function setup(overrides: Partial<StynxEventStreamConfig> = {}, tenant?: { tenantId: () => string | null; tenantChanged$: Subject<void> }, useSystemClock = false) {
  const sessionActive = signal(true);
  const clock = new FakeStynxEventStreamClock();
  const transport = new FakeStynxEventStreamTransport();
  TestBed.configureTestingModule({ providers: [
    ...(tenant ? [{ provide: TenantContextService, useValue: tenant }] : []),
    provideStynxEventStream({ url: '/stream', pollingIntervalMs: 1_000, sessionActive: sessionActive.asReadonly(), transport, ...(useSystemClock ? {} : { clock }), ...overrides }),
  ] });
  return { stream: TestBed.inject(StynxEventStreamService), clock, transport, sessionActive };
}

const frame = (id: string, value = '{}') => `id: ${id}\ndata: ${value}\n\n`;

describe('event stream boundary behavior', () => {
  it('rejects absent URL, polling period, and every invalid positive setting', () => {
    const sessionActive = signal(true).asReadonly();
    expect(() => provideStynxEventStream({ url: '', pollingIntervalMs: 1, sessionActive })).toThrow('url is required');
    expect(() => provideStynxEventStream({ url: '/s', sessionActive } as StynxEventStreamConfig)).toThrow('pollingIntervalMs is required');
    for (const field of ['pollingIntervalMs', 'initialMs', 'maxMs', 'failuresBeforePolling', 'failureWindowMs', 'heartbeatMs', 'staleFactor', 'maxConnectionBytes', 'maxConnectionAgeMs'] as const) {
      for (const value of [0, -1, Infinity, NaN]) {
        expect(() => provideStynxEventStream({ url: '/s', pollingIntervalMs: 1, sessionActive, [field]: value })).toThrow(`${field} must be finite and positive`);
      }
    }
  });

  it('does not connect for an inactive session and makes repeated start and stop safe', () => {
    const inactive = signal(false);
    const { stream, transport } = setup({ sessionActive: inactive.asReadonly() });
    stream.start();
    expect(stream.status()).toBe('stopped');
    expect(transport.connections).toHaveLength(0);
    inactive.set(true);
    stream.start();
    stream.start();
    expect(transport.connections).toHaveLength(1);
    stream.stop();
    stream.stop();
    expect(stream.status()).toBe('stopped');
    expect(transport.cancelled()).toBe(true);
  });

  it('parses bare fields, comments, invalid ids and JSON, and drops frames without ids', () => {
    const { stream, transport } = setup();
    const events: unknown[] = [];
    stream.events$.subscribe((event) => events.push(event));
    stream.start();
    transport.emitProgress('data: {}\n\n: keepalive\nid: invalid\u0000id\ndata: {}\n\nid: good\ndata: broken\n\nid: bare\nevent\ndata: {}\n\n');
    expect(events).toEqual([{ id: 'bare', event: '', data: {} }]);
    expect(stream.lastEventId()).toBe('bare');
    transport.emitProgress('id: another\ndata\n\n');
    expect(events).toHaveLength(1);
  });

  it('resets progress offsets after a truncated cumulative response and ignores non-text progress', () => {
    const { stream, transport } = setup();
    const ids: string[] = [];
    stream.events$.subscribe(({ id }) => ids.push(id));
    stream.start();
    transport.emitProgress(frame('first-with-a-long-identifier'));
    const connection = transport.connections[0]!;
    connection.subject.next({ type: HttpEventType.DownloadProgress, loaded: 1 } as never);
    connection.subject.next({ type: HttpEventType.DownloadProgress, loaded: frame('second').length, partialText: frame('second') } as never);
    expect(ids).toEqual(['first-with-a-long-identifier', 'second']);
  });

  it('handles non-204 HTTP completion and ignores stale transport notifications after reconnection', () => {
    const { stream, transport, clock } = setup();
    stream.start();
    const old = transport.connections[0]!;
    transport.respond(200);
    expect(stream.status()).toBe('reconnecting');
    clock.advanceBy(1_000);
    const current = transport.connections[1]!;
    old.subject.next({ type: HttpEventType.DownloadProgress, partialText: frame('stale') } as never);
    old.subject.error(new Error('stale'));
    current.subject.next({ type: HttpEventType.DownloadProgress, partialText: frame('fresh') } as never);
    expect(stream.lastEventId()).toBe('fresh');
    expect(transport.connections).toHaveLength(2);
  });

  it('expires stale connections, resets old failures outside the window, and honors Retry-After dates', () => {
    const { stream, transport, clock } = setup({ heartbeatMs: 100, staleFactor: 2, failureWindowMs: 300, failuresBeforePolling: 2 });
    stream.start();
    clock.advanceBy(200);
    expect(stream.status()).toBe('reconnecting');
    clock.advanceBy(1_000);
    expect(transport.connections).toHaveLength(2);
    expect(stream.status()).toBe('reconnecting');
    transport.error(429, { 'Retry-After': new Date(clock.now() + 5_000).toUTCString() });
    expect(clock.nextTimeoutDelay()).toBeGreaterThanOrEqual(1_000);
    expect(stream.polling()).toBe(false);
  });

  it('stops on forbidden and mapped unauthorized errors, including during polling', () => {
    const forbidden = setup();
    forbidden.stream.start();
    forbidden.transport.error(403);
    expect(forbidden.stream.status()).toBe('stopped');
    TestBed.resetTestingModule();
    const unauthorized = setup();
    unauthorized.stream.start();
    unauthorized.transport.connections[0]!.subject.error(new UnauthorizedError('denied', 401));
    expect(unauthorized.stream.status()).toBe('stopped');
  });

  it('pauses without a tenant, ignores same-tenant notices, and resumes with a fresh cursor', () => {
    const changed = new Subject<void>();
    let id: string | null = null;
    const tenant = { tenantId: () => id, tenantChanged$: changed };
    const { stream, transport } = setup({}, tenant);
    stream.start();
    expect(transport.connections).toHaveLength(0);
    id = 'a'; changed.next();
    expect(transport.connections).toHaveLength(1);
    transport.emitProgress(frame('cursor'));
    changed.next();
    expect(transport.connections).toHaveLength(1);
    id = null; changed.next();
    expect(stream.status()).toBe('idle');
    expect(stream.lastEventId()).toBe(null);
    id = 'b'; changed.next();
    expect(transport.lastRequest().lastEventId).toBe(null);
    expect(transport.connections).toHaveLength(2);
  });

  it('uses the system clock for timeout and polling and cancels it after recovery', () => {
    vi.useFakeTimers();
    const { stream, transport } = setup({ failuresBeforePolling: 1, initialMs: 10, pollingIntervalMs: 20, heartbeatMs: 1_000 }, undefined, true);
    const ticks: number[] = [];
    stream.tick$.subscribe(() => ticks.push(Date.now()));
    stream.start();
    transport.error(500);
    expect(stream.status()).toBe('polling');
    expect(transport.connections).toHaveLength(2);
    vi.advanceTimersByTime(20);
    expect(ticks).toHaveLength(1);
    transport.emitProgress(frame('ok'));
    vi.advanceTimersByTime(40);
    expect(ticks).toHaveLength(1);
    stream.stop();
  });

  it('honors session loss inside the polling interval', () => {
    const { stream, transport, clock, sessionActive } = setup({ failuresBeforePolling: 1 });
    stream.start();
    transport.error(500);
    sessionActive.set(false);
    clock.advanceBy(1_000);
    expect(stream.status()).toBe('stopped');
  });

  it('retries a Retry-After HTTP date when it exceeds the exponential delay', () => {
    const { stream, transport, clock } = setup({ initialMs: 100, failureWindowMs: 10_000 });
    stream.start();
    transport.error(429, { 'Retry-After': new Date(10_000).toUTCString() });
    expect(clock.nextTimeoutDelay()).toBe(10_000);
  });

  it('uses the SSE context token default for ordinary requests', () => {
    expect(new HttpContext().get(STYNX_SSE_REQUEST)).toBe(false);
  });

  it('ignores notifications from a transport after its connection is cancelled', () => {
    let oldNext: ((event: unknown) => void) | undefined;
    const transport = {
      connect: () => ({
        subscribe: (observer: { next: (event: unknown) => void }) => {
          oldNext = observer.next;
          return { unsubscribe: () => undefined };
        },
      }),
    } as unknown as StynxEventStreamTransport;
    const { stream } = setup({ transport });
    stream.start();
    stream.stop();
    oldNext?.({ type: HttpEventType.DownloadProgress, partialText: frame('too-late') });
    expect(stream.lastEventId()).toBe(null);
    expect(stream.status()).toBe('stopped');
  });

  it('guards stale recovery callbacks after cancellation and session loss', () => {
    const { stream, transport, sessionActive } = setup();
    const recovery = stream as unknown as {
      generation: number; open(): void; reopenPlanned(generation: number): void;
      failed(generation: number): void;
    };
    stream.start();
    const generation = recovery.generation;
    recovery.reopenPlanned(generation - 1);
    recovery.failed(generation - 1);
    expect(transport.connections).toHaveLength(1);
    sessionActive.set(false);
    recovery.failed(generation);
    expect(stream.status()).toBe('stopped');
    recovery.reopenPlanned(recovery.generation);
    recovery.failed(recovery.generation);
    recovery.open();
    expect(transport.connections).toHaveLength(1);
    expect(stream.status()).toBe('stopped');
  });

  it('does not open a stream if the tenant disappears between notifications', () => {
    const changed = new Subject<void>();
    let tenantId: string | null = 'tenant-a';
    const { stream, transport } = setup({}, { tenantId: () => tenantId, tenantChanged$: changed });
    stream.start();
    tenantId = null;
    (stream as unknown as { open(): void }).open();
    expect(stream.status()).toBe('idle');
    expect(transport.connections).toHaveLength(1);
  });

  it('continues delivery if the bounded ID cache cannot yield an eviction candidate', () => {
    const { stream, transport } = setup();
    const received: string[] = [];
    stream.events$.subscribe(({ id }) => received.push(id));
    stream.start();
    for (let index = 0; index <= 1_024; index++) {
      if (index === 1_024) {
        const seen = (stream as unknown as { seen: Set<string> }).seen;
        vi.spyOn(seen, 'values').mockReturnValue({ next: () => ({ value: undefined, done: true }) } as SetIterator<string>);
      }
      transport.emitProgress(frame(String(index)));
    }
    expect(received).toHaveLength(1_025);
    expect(stream.lastEventId()).toBe('1024');
  });

  it('rejects unrelated event names before parsing or advancing the cursor', () => {
    const { stream, transport } = setup({ eventPrefix: 'domain.' });
    const received: unknown[] = [];
    stream.events$.subscribe((event) => received.push(event));
    stream.start();
    transport.emitProgress('id: unrelated\nevent: system.audit\ndata: {}\n\n');
    expect(received).toEqual([]);
    expect(stream.lastEventId()).toBe(null);
  });
});
