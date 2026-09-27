import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
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

function createStream(overrides: Partial<StynxEventStreamConfig> = {}) {
  const sessionActive = signal(true);
  const transport = new FakeStynxEventStreamTransport();
  const clock = new FakeStynxEventStreamClock();
  TestBed.configureTestingModule({
    providers: [
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

    expect(events).toEqual([{ id: '1', event: 'audit', data: { ok: true } }]);
    expect(stream.lastEventId()).toBe('1');
    transport.respond(204);
    expect(stream.lastEventId()).toBeNull();
    clock.advanceBy(1_000);
    expect(transport.lastRequest().lastEventId).toBeNull();
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
    transport.emitProgress('id: ten\nevent: audit\ndata: {"oversized":true}\n\n');
    expect(transport.lastRequest().lastEventId).toBe('9');
    clock.advanceBy(5_000);
    expect(transport.lastRequest().lastEventId).toBe('9');

    transport.close();
    expect(stream.status()).toBe('reconnecting');
    sessionActive.set(false);
    expect(stream.status()).toBe('stopped');
    expect(transport.cancelled()).toBe(true);
  });
});
