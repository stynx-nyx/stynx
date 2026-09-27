import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { TenantContextService } from '@stynx-nyx/angular-tenancy';
import { Subject } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  StynxEventStreamService,
  provideStynxEventStream,
  type StynxEventStreamConfig,
} from '@stynx-nyx/angular';
import {
  FakeStynxEventStreamClock,
  FakeStynxEventStreamTransport,
} from '@stynx-nyx/angular/testing';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

class ObservedClock extends FakeStynxEventStreamClock {
  activeTimeouts = 0;

  override setTimeout(fn: () => void, delayMs: number): { cancel(): void } {
    this.activeTimeouts++;
    let active = true;
    const task = super.setTimeout(() => {
      if (active) { active = false; this.activeTimeouts--; }
      fn();
    }, delayMs);
    return { cancel: () => {
      if (active) { active = false; this.activeTimeouts--; }
      task.cancel();
    } };
  }
}

function createStream(
  overrides: Partial<StynxEventStreamConfig> = {},
  tenant?: { tenantId: () => string | null; tenantChanged$: Subject<void> },
) {
  const sessionActive = signal(true);
  const transport = new FakeStynxEventStreamTransport();
  const clock = new ObservedClock();
  TestBed.configureTestingModule({
    providers: [
      ...(tenant ? [{ provide: TenantContextService, useValue: tenant }] : []),
      provideStynxEventStream({
        url: '/stream',
        pollingIntervalMs: 10_000,
        sessionActive: sessionActive.asReadonly(),
        transport,
        clock,
        ...overrides,
      }),
    ],
  });
  return { stream: TestBed.inject(StynxEventStreamService), transport, clock, sessionActive };
}

describe('StynxEventStreamService lifecycle with the published test double', () => {
  it('ignores the rest of a progress suffix when a subscriber stops on its first frame', () => {
    const { stream, transport, clock } = createStream();
    const received: string[] = [];
    stream.events$.subscribe(({ id }) => { received.push(id); stream.stop(); });
    stream.start();

    transport.emitProgress('id: first\ndata: {}\n\nid: second\ndata: {}\n\n');

    expect(received).toEqual(['first']);
    expect(stream.lastEventId()).toBe('first');
    expect(stream.status()).toBe('stopped');
    expect(transport.connections).toHaveLength(1);
    expect(transport.cancelled()).toBe(true);
    expect(clock.activeTimeouts).toBe(0);
    clock.advanceBy(40_000);
    expect(transport.connections).toHaveLength(1);
  });

  it('ignores old progress frames and timers after a subscriber changes tenant', () => {
    const tenantChanged$ = new Subject<void>();
    let tenantId: string | null = 'tenant-a';
    const { stream, transport, clock } = createStream({}, { tenantId: () => tenantId, tenantChanged$ });
    const received: string[] = [];
    stream.events$.subscribe(({ id }) => {
      received.push(id);
      tenantId = 'tenant-b';
      tenantChanged$.next();
    });
    stream.start();

    transport.emitProgress('id: first\ndata: {}\n\nid: second\ndata: {}\n\n');

    expect(received).toEqual(['first']);
    expect(transport.connections).toHaveLength(2);
    expect(transport.connections[0]?.cancelled).toBe(true);
    expect(transport.lastRequest().lastEventId).toBe(null);
    expect(stream.lastEventId()).toBe(null);
    expect(stream.status()).toBe('live');
    expect(clock.activeTimeouts).toBe(2);
  });

  it('requires application polling and session configuration', () => {
    expect(() =>
      TestBed.configureTestingModule({
        providers: [provideStynxEventStream({ url: '/stream' } as StynxEventStreamConfig)],
      }),
    ).toThrow();
  });

  it('deduplicates IDs, filters names before emission, and resets the cursor after 204', () => {
    const { stream, transport, clock } = createStream({ types: ['audit'], eventPrefix: 'domain.' });
    const events: unknown[] = [];
    stream.events$.subscribe((event) => events.push(event));
    stream.start();
    transport.emitProgress('id: 1\nevent: domain.audit\ndata: {"ok":true}\n\n');
    transport.emitProgress('id: 1\nevent: domain.audit\ndata: {"ok":true}\n\nid: 2\nevent: domain.skip\ndata: {}\n\n');
    transport.emitProgress('id: 2\nevent: domain.audit\ndata: {"unexpected":true}\n\n');

    expect(events).toEqual([{ id: '1', event: 'audit', data: { ok: true } }]);
    expect(stream.lastEventId()).toBe('2');
    transport.respond(204);
    expect(stream.lastEventId()).toBe(null);
    expect(clock.nextTimeoutDelay()).toBe(1_000);
    clock.advanceBy(1_000);
    expect(transport.lastRequest().lastEventId).toBe(null);
  });

  it('keeps deduplication bounded to 1024 IDs across reconnects', () => {
    const { stream, transport, clock } = createStream({ failuresBeforePolling: 100 });
    const received: string[] = [];
    stream.events$.subscribe((event) => received.push(event.id));
    stream.start();
    transport.emitProgress('id: oldest\nevent: audit\ndata: {}\n\n');

    transport.error(500);
    clock.advanceBy(1_000);
    transport.emitProgress('id: oldest\nevent: audit\ndata: {}\n\n');
    expect(received).toEqual(['oldest']);

    const newerFrames = Array.from({ length: 1_024 }, (_, index) =>
      `id: newer-${index}\nevent: audit\ndata: {}\n\n`,
    ).join('');
    transport.emitProgress(newerFrames);
    transport.emitProgress('id: oldest\nevent: audit\ndata: {}\n\n');

    expect(received).toHaveLength(1_026);
    expect(received.at(-1)).toBe('oldest');
  });

  it('uses the configured initial delay as the minimum delay after a 204', () => {
    const { stream, transport, clock } = createStream({ initialMs: 2_500 });
    stream.start();
    transport.respond(204);
    expect(clock.nextTimeoutDelay()).toBe(2_500);
  });

  it('counts cumulative progress bytes once when a multibyte character crosses chunks', () => {
    const frame = 'id: emoji\nevent: audit\ndata: {"value":"💩"}\n\n';
    const maxConnectionBytes = new TextEncoder().encode(frame).length + 1;
    const { stream, transport } = createStream({ maxConnectionBytes });
    const received: unknown[] = [];
    stream.events$.subscribe((event) => received.push(event));
    stream.start();

    const highSurrogateEnd = frame.indexOf('💩') + 1;
    transport.emitProgress(frame.slice(0, highSurrogateEnd));
    transport.emitProgress(frame.slice(highSurrogateEnd));

    expect(received).toEqual([{ id: 'emoji', event: 'audit', data: { value: '💩' } }]);
    expect(transport.connections).toHaveLength(1);
  });

  it('parses a completed frame in the chunk that crosses the byte ceiling before reopening', () => {
    // UPS-NGSSE-04/05: a frame in the crossing progress suffix advances the reconnect cursor.
    const accepted = 'id: within-limit\nevent: audit\ndata: {"ok":true}\n\n';
    const { stream, transport, clock } = createStream({
      maxConnectionBytes: new TextEncoder().encode(accepted).length + 1,
    });
    const events: unknown[] = [];
    stream.events$.subscribe((event) => events.push(event));
    stream.start();

    transport.emitProgress(`${accepted}: ${'x'.repeat(32)}\n`);

    expect(events).toEqual([{ id: 'within-limit', event: 'audit', data: { ok: true } }]);
    expect(stream.lastEventId()).toBe('within-limit');
    expect(transport.connections).toHaveLength(2);
    expect(transport.lastRequest().lastEventId).toBe('within-limit');
    expect(stream.status()).toBe('live');
    expect(stream.polling()).toBe(false);
    expect(clock.nextTimeoutDelay()).toBe(40_000);
  });

  it('advances the cursor for valid client-filtered frames without emitting them', () => {
    // UPS-NGSSE-09: client name filters affect events$, not replay progress.
    const filtered = 'id: filtered\nevent: domain.skip\ndata: {"ok":true}\n\n';
    const { stream, transport } = createStream({
      types: ['audit'],
      eventPrefix: 'domain.',
      maxConnectionBytes: new TextEncoder().encode(filtered).length + 1,
    });
    const events: unknown[] = [];
    stream.events$.subscribe((event) => events.push(event));
    stream.start();

    transport.emitProgress(`${filtered}: ${'x'.repeat(32)}\n`);

    expect(events).toEqual([]);
    expect(stream.lastEventId()).toBe('filtered');
    expect(transport.connections).toHaveLength(2);
    expect(transport.lastRequest().lastEventId).toBe('filtered');
    expect(stream.status()).toBe('live');
  });

  it('counts a byte ceiling without a valid identified JSON frame as a failure', () => {
    const { stream, transport, clock } = createStream({ maxConnectionBytes: 40 });
    const events: unknown[] = [];
    stream.events$.subscribe((event) => events.push(event));
    stream.start();

    transport.emitProgress('id: invalid\ndata: not-json\n\ndata: {}\n\n: padding padding padding\n');

    expect(events).toEqual([]);
    expect(stream.lastEventId()).toBe(null);
    expect(stream.status()).toBe('reconnecting');
    expect(transport.connections).toHaveLength(1);
    expect(clock.nextTimeoutDelay()).toBe(1_000);
  });

  it('backs off when an oversized frame cannot advance the cursor and falls back to polling', () => {
    // UPS-NGSSE-04: a connection that cannot accept a frame must count toward recovery fallback.
    const frame = `id: oversized\nevent: audit\ndata: ${JSON.stringify({ value: 'x'.repeat(64) })}\n`;
    const { stream, transport, clock } = createStream({
      maxConnectionBytes: 32,
      failuresBeforePolling: 2,
      initialMs: 1_000,
    });
    const events: unknown[] = [];
    stream.events$.subscribe((event) => events.push(event));
    stream.start();

    transport.emitProgress(frame);
    expect(events).toEqual([]);
    expect(stream.lastEventId()).toBe(null);
    expect(transport.connections).toHaveLength(1);
    expect(transport.cancelled()).toBe(true);
    expect(stream.status()).toBe('reconnecting');
    expect(clock.nextTimeoutDelay()).toBe(1_000);

    clock.advanceBy(999);
    expect(transport.connections).toHaveLength(1);
    clock.advanceBy(1);
    expect(transport.connections).toHaveLength(2);
    expect(transport.lastRequest().lastEventId).toBe(null);

    transport.emitProgress(frame);
    expect(stream.status()).toBe('polling');
    expect(stream.polling()).toBe(true);
    expect(transport.connections).toHaveLength(3);

    transport.emitProgress(frame);
    expect(transport.connections).toHaveLength(3);
    expect(clock.nextTimeoutDelay()).toBe(4_000);
  });

  it('uses exponential capped and fixed retries, then polling, and recovers on the first complete frame', () => {
    const { stream, transport, clock } = createStream({ failuresBeforePolling: 2, initialMs: 1_000, maxMs: 30_000 });
    const ticks: number[] = [];
    stream.tick$.subscribe(() => ticks.push(clock.now()));
    stream.start();
    clock.advanceBy(10_000);
    expect(ticks).toEqual([]);
    transport.error(0);
    expect(stream.status()).toBe('reconnecting');
    expect(clock.nextTimeoutDelay()).toBe(1_000);
    clock.advanceBy(1_000);
    transport.error(503);
    expect(stream.status()).toBe('polling');
    expect(stream.polling()).toBe(true);
    clock.advanceBy(10_000);
    expect(ticks).toHaveLength(1);
    transport.emitProgress('id: 3\nevent: audit\ndata: {}\n\n');
    expect(stream.status()).toBe('live');
    expect(stream.polling()).toBe(false);
    clock.advanceBy(10_000);
    expect(ticks).toHaveLength(1);

    TestBed.resetTestingModule();
    const fixed = createStream({ retryMode: 'fixed', initialMs: 4_000, maxMs: 30_000 });
    fixed.stream.start();
    fixed.transport.error(500);
    expect(fixed.clock.nextTimeoutDelay()).toBe(4_000);

    TestBed.resetTestingModule();
    const capped = createStream({ failuresBeforePolling: 100, initialMs: 1_000, maxMs: 30_000 });
    capped.stream.start();
    for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000]) {
      capped.transport.error(500);
      expect(capped.clock.nextTimeoutDelay()).toBe(delay);
      capped.clock.advanceBy(delay);
    }
    capped.transport.error(500);
    expect(capped.clock.nextTimeoutDelay()).toBe(30_000);
    capped.clock.advanceBy(30_000);
    capped.transport.emitProgress('id: recovered\nevent: audit\ndata: {}\n\n');
    capped.transport.error(500);
    expect(capped.clock.nextTimeoutDelay()).toBe(1_000);
  });

  it('honors Retry-After, stale/byte/age ceilings, tenant changes, close, and logout without treating planned reconnects as failures', () => {
    const { stream, transport, clock, sessionActive } = createStream({
      heartbeatMs: 20_000,
      staleFactor: 2,
      maxConnectionBytes: 32,
      maxConnectionAgeMs: 5_000,
    });
    stream.start();
    transport.error(429, { 'Retry-After': '7' });
    expect(clock.nextTimeoutDelay()).toBe(7_000);
    clock.advanceBy(7_000);
    transport.emitProgress('id: 9\nevent: audit\ndata: {}\n\n');
    expect(stream.lastEventId()).toBe('9');

    clock.advanceBy(40_000);
    expect(transport.lastRequest().lastEventId).toBe('9');
    transport.emitProgress('id: 10\nevent: audit\ndata: {}\n\n');
    expect(stream.lastEventId()).toBe('10');
    const beforeByteCeiling = transport.connections.length;
    transport.emitProgress('id: ten\nevent: audit\ndata: {"oversized":true}\n\n');
    expect(transport.connections).toHaveLength(beforeByteCeiling + 1);
    expect(stream.lastEventId()).toBe('ten');
    expect(transport.lastRequest().lastEventId).toBe('ten');
    expect(stream.status()).toBe('live');
    clock.advanceBy(5_000);
    expect(transport.connections).toHaveLength(beforeByteCeiling + 2);
    expect(transport.lastRequest().lastEventId).toBe('ten');

    transport.close();
    expect(stream.status()).toBe('reconnecting');
    sessionActive.set(false);
    TestBed.flushEffects();
    expect(stream.status()).toBe('stopped');
    expect(transport.cancelled()).toBe(true);
  });
});
