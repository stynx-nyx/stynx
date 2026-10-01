import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { StynxEventStreamService, provideStynxEventStream, type StynxEventStreamConfig } from '@stynx-nyx/angular';
import { FakeStynxEventStreamClock, FakeStynxEventStreamTransport } from '@stynx-nyx/angular/testing';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

function setup(overrides: Partial<StynxEventStreamConfig> = {}) {
  const clock = new FakeStynxEventStreamClock();
  const transport = new FakeStynxEventStreamTransport();
  TestBed.configureTestingModule({ providers: [
    provideStynxEventStream({ url: '/stream', pollingIntervalMs: 10_000, sessionActive: signal(true).asReadonly(), transport, clock, ...overrides }),
  ] });
  const stream = TestBed.inject(StynxEventStreamService);
  const received: string[] = [];
  stream.events$.subscribe(({ id }) => received.push(id));
  let ticks = 0;
  stream.tick$.subscribe(() => ticks++);
  return { stream, clock, transport, received, ticks: () => ticks };
}

function enterPolling({ stream, clock, transport }: ReturnType<typeof setup>): void {
  stream.start();
  transport.emitProgress('id: a\ndata: {}\n\n');
  transport.error(500);
  clock.advanceBy(1_000);
  transport.error(500);
  expect(stream.polling()).toBe(true);
  expect(transport.connections).toHaveLength(3);
  expect(transport.lastRequest().lastEventId).toBe('a');
}

describe('UPS-NGSSE-13 comment lines as live activity', () => {
  it('returns to live and clears failure counters on a heartbeat with commentActivity live', () => {
    const context = setup({ commentActivity: 'live' });
    const { stream, clock, transport, received, ticks } = context;
    enterPolling(context);
    transport.emitProgress(': heartbeat\n\n');
    expect(stream.status()).toBe('live');
    expect(stream.polling()).toBe(false);
    expect(received).toEqual(['a']);
    expect(stream.lastEventId()).toBe('a');
    clock.advanceBy(10_000);
    expect(ticks()).toBe(0);
    transport.error(500);
    expect(stream.status()).toBe('reconnecting');
    expect(clock.nextTimeoutDelay()).toBe(1_000);
  });

  it('counts silence after the last comment as a failure', () => {
    const { stream, clock, transport } = setup({ commentActivity: 'live' });
    stream.start();
    transport.emitProgress(': connected\n\n');
    clock.advanceBy(30_000);
    transport.emitProgress(': heartbeat\n\n');
    clock.advanceBy(39_999);
    expect(stream.status()).toBe('live');
    expect(transport.cancelled()).toBe(false);
    clock.advanceBy(1);
    expect(transport.cancelled()).toBe(true);
    expect(stream.status()).toBe('reconnecting');
    expect(clock.nextTimeoutDelay()).toBe(1_000);
  });

  it('ignores a comment from a generation a subscriber already stopped', () => {
    const { stream, transport } = setup({ commentActivity: 'live' });
    stream.events$.subscribe(() => stream.stop());
    stream.start();
    transport.emitProgress('id: a\ndata: {}\n\n: heartbeat\n\n');
    expect(stream.status()).toBe('stopped');
  });

  it('keeps the 1.5.0 stale-only behavior by default', () => {
    for (const overrides of [{}, { commentActivity: 'stale-only' as const }]) {
      const context = setup(overrides);
      enterPolling(context);
      context.transport.emitProgress(': heartbeat\n\n');
      expect(context.stream.status()).toBe('polling');
      expect(context.stream.polling()).toBe(true);
      TestBed.resetTestingModule();
    }
  });
});
