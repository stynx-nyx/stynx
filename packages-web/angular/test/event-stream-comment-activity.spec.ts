import '@angular/compiler';
import { signal } from '@angular/core';
import type { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { TenantContextService } from '@stynx-nyx/angular-tenancy';
import { Subject } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { StynxEventStreamService, provideStynxEventStream, type StynxEventStreamConfig } from '@stynx-nyx/angular';
import { FakeStynxEventStreamClock, FakeStynxEventStreamTransport } from '@stynx-nyx/angular/testing';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

function setup(overrides: Partial<StynxEventStreamConfig> = {}, providers: Provider[] = []) {
  const clock = new FakeStynxEventStreamClock();
  const transport = new FakeStynxEventStreamTransport();
  TestBed.configureTestingModule({ providers: [
    ...providers,
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

// UPS-NGSSE-13 (#321) item 3: the status on opening is held until the first line of that connection.
describe('UPS-NGSSE-13 open status held until the first line', () => {
  const connected = ': connected\n\n';

  it('holds idle on the first start and becomes live on the first comment line without an event or cursor move', () => {
    const { stream, transport, received } = setup({ openStatus: 'first-line' });
    stream.start();
    expect(transport.connections).toHaveLength(1);
    expect(stream.status()).toBe('idle');
    expect(stream.polling()).toBe(false);
    transport.emitProgress(connected);
    expect(stream.status()).toBe('live');
    expect(received).toEqual([]);
    expect(stream.lastEventId()).toBe(null);
  });

  it('holds the previous status over an immediate end-of-stream reopen until the first line', () => {
    const { stream, clock, transport, received } = setup({ openStatus: 'first-line', serverClose: { ok: 'end-of-stream', reopen: 'immediate' } });
    stream.start();
    transport.emitProgress('id: a\ndata: {}\n\n');
    expect(stream.status()).toBe('live');
    transport.respond(200);
    expect(clock.now()).toBe(0);
    expect(transport.connections).toHaveLength(2);
    expect(transport.lastRequest().lastEventId).toBe('a');
    expect(stream.status()).toBe('reconnecting');
    expect(stream.polling()).toBe(false);
    transport.emitProgress(': heartbeat\n');
    expect(stream.status()).toBe('live');
    expect(received).toEqual(['a']);
    expect(stream.lastEventId()).toBe('a');
  });

  it('counts silence on a held reopen as a failure after the stale window and backs off', () => {
    const { stream, clock, transport } = setup({ openStatus: 'first-line', failuresBeforePolling: 3 });
    stream.start();
    transport.emitProgress(connected);
    expect(stream.status()).toBe('live');
    transport.error(500);
    expect(stream.status()).toBe('reconnecting');
    expect(clock.nextTimeoutDelay()).toBe(1_000);
    clock.advanceBy(1_000);
    expect(transport.connections).toHaveLength(2);
    expect(stream.status()).toBe('reconnecting');
    clock.advanceBy(39_999);
    expect(transport.cancelled()).toBe(false);
    expect(stream.status()).toBe('reconnecting');
    clock.advanceBy(1);
    expect(transport.cancelled()).toBe(true);
    expect(transport.connections).toHaveLength(2);
    expect(stream.status()).toBe('reconnecting');
    expect(stream.polling()).toBe(false);
    expect(clock.nextTimeoutDelay()).toBe(2_000);
  });

  it('keeps live over a planned age reopen and still counts silence on the reopened connection', () => {
    const { stream, clock, transport } = setup({ openStatus: 'first-line', heartbeatMs: 1_000, maxConnectionAgeMs: 5_000 });
    stream.start();
    for (let beat = 0; beat < 5; beat++) { transport.emitProgress(': heartbeat\n'); clock.advanceBy(1_000); }
    expect(clock.now()).toBe(5_000);
    expect(transport.connections).toHaveLength(2);
    expect(stream.status()).toBe('live');
    clock.advanceBy(1_999);
    expect(transport.cancelled()).toBe(false);
    expect(stream.status()).toBe('live');
    clock.advanceBy(1);
    expect(transport.cancelled()).toBe(true);
    expect(stream.status()).toBe('reconnecting');
    expect(clock.nextTimeoutDelay()).toBe(1_000);
  });

  it('ignores the rest of a chunk after a subscriber stopped and restarted the stream, and holds idle for the new connection', () => {
    const { stream, transport } = setup({ openStatus: 'first-line' });
    stream.events$.subscribe(() => { stream.stop(); stream.start(); });
    stream.start();
    expect(stream.status()).toBe('idle');
    transport.emitProgress('id: a\ndata: {}\n\n: heartbeat\n\n');
    expect(transport.connections).toHaveLength(2);
    expect(transport.lastRequest().lastEventId).toBe('a');
    expect(stream.status()).toBe('idle');
    transport.emitProgress(connected);
    expect(stream.status()).toBe('live');
  });

  it('holds idle after stop and start until the first line of the new connection', () => {
    const { stream, transport } = setup({ openStatus: 'first-line' });
    stream.start();
    transport.emitProgress(connected);
    expect(stream.status()).toBe('live');
    stream.stop();
    expect(stream.status()).toBe('stopped');
    stream.start();
    expect(transport.connections).toHaveLength(2);
    expect(stream.status()).toBe('idle');
    transport.emitProgress('id: a\ndata: {}\n\n');
    expect(stream.status()).toBe('live');
    expect(stream.lastEventId()).toBe('a');
  });

  it('holds the previous status over a tenant change and idle without a tenant', () => {
    let tenantId: string | null = 'tenant-a';
    const tenant = { tenantId: () => tenantId, tenantChanged$: new Subject<void>() };
    const { stream, clock, transport } = setup({ openStatus: 'first-line' }, [{ provide: TenantContextService, useValue: tenant }]);
    const switchTenant = (next: string | null) => { tenantId = next; tenant.tenantChanged$.next(); };
    stream.start();
    expect(stream.status()).toBe('idle');
    transport.emitProgress(connected);
    expect(stream.status()).toBe('live');
    switchTenant('tenant-b');
    expect(transport.connections).toHaveLength(2);
    expect(stream.status()).toBe('live');
    transport.error(500);
    expect(stream.status()).toBe('reconnecting');
    switchTenant('tenant-c');
    expect(clock.now()).toBe(0);
    expect(transport.connections).toHaveLength(3);
    expect(stream.status()).toBe('reconnecting');
    transport.emitProgress(connected);
    expect(stream.status()).toBe('live');
    switchTenant(null);
    expect(stream.status()).toBe('idle');
  });

  it('sets the status on opening by default and with openStatus immediate', () => {
    for (const overrides of [{}, { openStatus: 'immediate' as const }]) {
      const { stream, transport } = setup(overrides);
      stream.start();
      expect(transport.connections).toHaveLength(1);
      expect(stream.status()).toBe('live');
      stream.stop();
      stream.start();
      expect(transport.connections).toHaveLength(2);
      expect(stream.status()).toBe('live');
      TestBed.resetTestingModule();
    }
  });

  it('rejects an unknown openStatus', () => {
    expect(() => provideStynxEventStream({ url: '/s', pollingIntervalMs: 1, sessionActive: signal(true).asReadonly(), openStatus: 'later' as never }))
      .toThrow("openStatus must be 'immediate' or 'first-line'");
  });
});
