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
    provideStynxEventStream({ url: '/stream', pollingIntervalMs: 15_000, sessionActive: signal(true).asReadonly(), transport, clock, ...overrides }),
  ] });
  const stream = TestBed.inject(StynxEventStreamService);
  let ticks = 0;
  stream.tick$.subscribe(() => ticks++);
  return { stream, clock, transport, ticks: () => ticks };
}

describe('UPS-NGSSE-11 reopen when entering polling', () => {
  it('schedules the polling-entry reopen on the backoff compass with reopenOnPollingEntry backoff', () => {
    const { stream, clock, transport, ticks } = setup({ reopenOnPollingEntry: 'backoff' });
    stream.start();
    transport.error(500);
    expect(clock.nextTimeoutDelay()).toBe(1_000);
    clock.advanceBy(1_000);
    expect(transport.connections).toHaveLength(2);
    transport.error(500);
    expect(stream.polling()).toBe(true);
    expect(transport.connections).toHaveLength(2);
    expect(clock.nextTimeoutDelay()).toBe(2_000);
    clock.advanceBy(1_999);
    expect(transport.connections).toHaveLength(2);
    clock.advanceBy(1);
    expect(transport.connections).toHaveLength(3);
    expect(stream.status()).toBe('polling');
    transport.error(500);
    expect(clock.nextTimeoutDelay()).toBe(4_000);
    clock.advanceBy(4_000);
    expect(transport.connections).toHaveLength(4);
    expect(ticks()).toBe(0);
    clock.advanceBy(9_000);
    expect(ticks()).toBe(1);
    clock.advanceBy(15_000);
    expect(ticks()).toBe(2);
  });

  it('makes no request before a fixed 60 s compass when the first failure enters polling', () => {
    const { stream, clock, transport, ticks } = setup({
      reopenOnPollingEntry: 'backoff', failuresBeforePolling: 1, retryMode: 'fixed', initialMs: 60_000, pollingIntervalMs: 60_000,
    });
    stream.start();
    transport.error(503);
    expect(stream.polling()).toBe(true);
    clock.advanceBy(59_999);
    expect(transport.connections).toHaveLength(1);
    expect(ticks()).toBe(0);
    clock.advanceBy(1);
    expect(transport.connections).toHaveLength(2);
    expect(ticks()).toBe(1);
  });

  it('uses the larger of backoff and Retry-After on polling entry in backoff mode', () => {
    const { stream, clock, transport } = setup({ reopenOnPollingEntry: 'backoff' });
    stream.start();
    transport.error(500);
    clock.advanceBy(1_000);
    transport.error(429, { 'Retry-After': '5' });
    expect(stream.polling()).toBe(true);
    expect(clock.nextTimeoutDelay()).toBe(5_000);
  });

  it('keeps authorization stops ahead of the polling-entry policy', () => {
    const { stream, clock, transport } = setup({ reopenOnPollingEntry: 'backoff', failuresBeforePolling: 1 });
    stream.start();
    transport.error(403);
    expect(stream.status()).toBe('stopped');
    clock.advanceBy(60_000);
    expect(transport.connections).toHaveLength(1);
  });

  it('keeps the 1.5.0 immediate reopen by default and with reopenOnPollingEntry immediate', () => {
    for (const overrides of [{}, { reopenOnPollingEntry: 'immediate' as const }]) {
      const { stream, clock, transport } = setup(overrides);
      stream.start();
      transport.error(500);
      clock.advanceBy(1_000);
      transport.error(500);
      expect(stream.polling()).toBe(true);
      expect(transport.connections).toHaveLength(3);
      TestBed.resetTestingModule();
    }
  });
});
