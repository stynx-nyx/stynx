import '@angular/compiler';
import { HttpEventType } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  StynxEventStreamService, provideStynxEventStream,
  type StynxEventStreamConfig, type StynxEventStreamEvent, type StynxEventStreamResync, type StynxEventStreamTransport,
} from '@stynx-nyx/angular';
import { FakeStynxEventStreamClock, FakeStynxEventStreamTransport } from '@stynx-nyx/angular/testing';

// UPS-NGSSE-12 (#321): server close as end of stream, with the published fake transport and clock.

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

const frame = (id: string) => `id: ${id}\ndata: {}\n\n`;

function setup(overrides: Partial<StynxEventStreamConfig> = {}) {
  const clock = new FakeStynxEventStreamClock();
  const transport = new FakeStynxEventStreamTransport();
  TestBed.configureTestingModule({ providers: [
    provideStynxEventStream({ url: '/stream', pollingIntervalMs: 15_000, sessionActive: signal(true).asReadonly(), transport, clock, ...overrides }),
  ] });
  const stream = TestBed.inject(StynxEventStreamService);
  const events: StynxEventStreamEvent[] = [];
  const resyncs: { resync: StynxEventStreamResync; connections: number; cursor: string | null }[] = [];
  let ticks = 0;
  stream.events$.subscribe((event) => events.push(event));
  stream.resync$.subscribe((resync) => resyncs.push({ resync, connections: transport.connections.length, cursor: stream.lastEventId() }));
  stream.tick$.subscribe(() => ticks++);
  return { stream, clock, transport, events, resyncs, ticks: () => ticks };
}

describe('UPS-NGSSE-12 server close as end of stream', () => {
  it('reopens a 200 that ends at once, without Last-Event-ID and without a counted failure, under end-of-stream, discard, immediate', () => {
    const { stream, clock, transport, events, resyncs } = setup({
      serverClose: { ok: 'end-of-stream', cursor: 'discard', reopen: 'immediate' },
    });
    stream.start();
    transport.emitProgress(frame('a'));
    expect(stream.lastEventId()).toBe('a');
    transport.respond(200);
    // No clock advance: the next request is already open, from a fresh cursor.
    expect(clock.now()).toBe(0);
    expect(transport.connections).toHaveLength(2);
    expect(transport.lastRequest().lastEventId).toBe(null);
    expect(resyncs).toEqual([{ resync: { reason: 'server-close' }, connections: 1, cursor: null }]);
    expect(stream.status()).toBe('live');
    expect(stream.lastError()).toBe(null);
    // A second close without any frame is also immediate and still counts no failure.
    transport.respond(200);
    expect(transport.connections).toHaveLength(3);
    expect(stream.status()).toBe('live');
    expect(stream.polling()).toBe(false);
    expect(resyncs).toHaveLength(1);
    // The next real failure is the first of its window: it waits initialMs and does not enter polling.
    transport.error(503);
    expect(stream.status()).toBe('reconnecting');
    expect(clock.nextTimeoutDelay()).toBe(1_000);
    // Nothing was synthesized: only the delivered frame reached events$.
    expect(events.map((event) => event.id)).toEqual(['a']);
  });

  it('reopens at once after a connection that delivered a frame and after the backoff otherwise with immediate-after-frame', () => {
    const { stream, clock, transport, events, resyncs } = setup({
      serverClose: { ok: 'end-of-stream', cursor: 'discard', reopen: 'immediate-after-frame' },
    });
    stream.start();
    transport.emitProgress(': connected\n');
    transport.emitProgress(frame('a'));
    transport.respond(200);
    expect(transport.connections).toHaveLength(2);
    expect(transport.lastRequest().lastEventId).toBe(null);
    expect(resyncs).toEqual([{ resync: { reason: 'server-close' }, connections: 1, cursor: null }]);
    // This connection only carried a comment, which is not a delivered frame.
    transport.emitProgress(': heartbeat\n');
    transport.respond(200);
    expect(transport.connections).toHaveLength(2);
    expect(stream.status()).toBe('reconnecting');
    expect(stream.polling()).toBe(false);
    expect(clock.nextTimeoutDelay()).toBe(1_000);
    clock.advanceBy(999);
    expect(transport.connections).toHaveLength(2);
    clock.advanceBy(1);
    expect(transport.connections).toHaveLength(3);
    // No cursor was held at the second close, so resync$ stayed silent.
    expect(resyncs).toHaveLength(1);
    expect(events.map((event) => event.id)).toEqual(['a']);
  });

  it('reopens a 204 at once when immediate reopen is configured and keeps the backoff after a frameless 204 otherwise', () => {
    const immediate = setup({ serverClose: { reopen: 'immediate' } });
    immediate.stream.start();
    immediate.transport.emitProgress(frame('a'));
    immediate.transport.respond(204);
    expect(immediate.clock.now()).toBe(0);
    expect(immediate.transport.connections).toHaveLength(2);
    expect(immediate.transport.lastRequest().lastEventId).toBe(null);
    expect(immediate.resyncs).toEqual([{ resync: { reason: 'no-content' }, connections: 1, cursor: null }]);
    expect(immediate.stream.polling()).toBe(false);
    expect(immediate.events.map((event) => event.id)).toEqual(['a']);
    TestBed.resetTestingModule();

    const afterFrame = setup({ serverClose: { reopen: 'immediate-after-frame' } });
    afterFrame.stream.start();
    afterFrame.transport.respond(204);
    expect(afterFrame.transport.connections).toHaveLength(1);
    expect(afterFrame.clock.nextTimeoutDelay()).toBe(1_000);
    afterFrame.clock.advanceBy(1_000);
    afterFrame.transport.emitProgress(frame('b'));
    afterFrame.transport.respond(204);
    expect(afterFrame.transport.connections).toHaveLength(3);
    expect(afterFrame.resyncs.map((entry) => entry.resync.reason)).toEqual(['no-content']);
    expect(afterFrame.events.map((event) => event.id)).toEqual(['b']);
  });

  it('keeps the cursor and never enters polling when 200s end as end-of-stream with the default backoff reopen', () => {
    const { stream, clock, transport, events, resyncs, ticks } = setup({ serverClose: { ok: 'end-of-stream' } });
    stream.start();
    transport.emitProgress(frame('a'));
    for (let close = 0; close < 4; close++) {
      transport.respond(200);
      expect(stream.status()).toBe('reconnecting');
      expect(stream.polling()).toBe(false);
      // Not a failure: the delay never grows beyond initialMs.
      expect(clock.nextTimeoutDelay()).toBe(1_000);
      clock.advanceBy(1_000);
      expect(transport.connections).toHaveLength(close + 2);
      expect(transport.lastRequest().lastEventId).toBe('a');
    }
    clock.advanceBy(60_000);
    expect(ticks()).toBe(0);
    expect(resyncs).toEqual([]);
    expect(events.map((event) => event.id)).toEqual(['a']);
  });

  it('gives the 1.5.0 result with the failure, keep policy and without the option', () => {
    for (const overrides of [{}, { serverClose: {} }, { serverClose: { ok: 'failure', cursor: 'keep', reopen: 'backoff' } }] as Partial<StynxEventStreamConfig>[]) {
      const { stream, clock, transport, events, resyncs, ticks } = setup(overrides);
      stream.start();
      transport.emitProgress(frame('a'));
      transport.respond(200);
      // The 200 that ends is a failure that keeps the cursor and waits the backoff.
      expect(stream.status()).toBe('reconnecting');
      expect(transport.connections).toHaveLength(1);
      expect(clock.nextTimeoutDelay()).toBe(1_000);
      clock.advanceBy(1_000);
      expect(transport.lastRequest().lastEventId).toBe('a');
      // A second one inside the window enters polling and reopens at once, as in 1.5.0.
      transport.respond(200);
      expect(stream.polling()).toBe(true);
      expect(transport.connections).toHaveLength(3);
      expect(transport.lastRequest().lastEventId).toBe('a');
      // The reopened connection stays open: only its 40 s silence timer is pending, not a retry.
      expect(clock.nextTimeoutDelay()).toBe(40_000);
      clock.advanceBy(15_000);
      expect(ticks()).toBe(1);
      expect(resyncs).toEqual([]);
      expect(events.map((event) => event.id)).toEqual(['a']);
      TestBed.resetTestingModule();
    }
  });

  it('keeps the 204 on the backoff with a discarded cursor when only the 200 policy is configured', () => {
    const { stream, clock, transport, resyncs } = setup({ serverClose: { ok: 'end-of-stream', cursor: 'keep' } });
    stream.start();
    transport.emitProgress(frame('a'));
    transport.respond(204);
    expect(resyncs).toEqual([{ resync: { reason: 'no-content' }, connections: 1, cursor: null }]);
    expect(transport.connections).toHaveLength(1);
    expect(clock.nextTimeoutDelay()).toBe(1_000);
    clock.advanceBy(1_000);
    expect(transport.lastRequest().lastEventId).toBe(null);
  });

  it('counts a 200 as a failure and still discards the cursor once under the failure, discard policy', () => {
    const { stream, clock, transport, resyncs } = setup({ serverClose: { cursor: 'discard', reopen: 'immediate' } });
    stream.start();
    transport.emitProgress(frame('a'));
    transport.respond(200);
    // A counted failure follows the ordinary retry schedule; reopen applies only to closes that are not failures.
    expect(stream.status()).toBe('reconnecting');
    expect(transport.connections).toHaveLength(1);
    expect(resyncs).toEqual([{ resync: { reason: 'server-close' }, connections: 1, cursor: null }]);
    clock.advanceBy(1_000);
    expect(transport.lastRequest().lastEventId).toBe(null);
    transport.respond(200);
    expect(stream.polling()).toBe(true);
    expect(resyncs).toHaveLength(1);
  });

  it('treats a completion without a response like a 200 that ends', () => {
    const { stream, transport, resyncs } = setup({ serverClose: { ok: 'end-of-stream', cursor: 'discard', reopen: 'immediate' } });
    stream.start();
    transport.emitProgress(frame('a'));
    transport.close();
    expect(transport.connections).toHaveLength(2);
    expect(transport.lastRequest().lastEventId).toBe(null);
    expect(resyncs.map((entry) => entry.resync.reason)).toEqual(['server-close']);
    expect(stream.polling()).toBe(false);
  });

  it('does not reopen when a subscriber stops the stream from the server-close resync', () => {
    const { stream, clock, transport } = setup({ serverClose: { ok: 'end-of-stream', cursor: 'discard', reopen: 'immediate' } });
    stream.resync$.subscribe(() => stream.stop());
    stream.start();
    transport.emitProgress(frame('a'));
    transport.respond(200);
    expect(stream.status()).toBe('stopped');
    expect(transport.connections).toHaveLength(1);
    expect(clock.nextTimeoutDelay()).toBe(null);
  });

  it('ignores a late completion from a connection that was already replaced', () => {
    const observers: { next: (event: unknown) => void; complete: () => void }[] = [];
    const cursors: (string | null)[] = [];
    // A transport that keeps notifying after unsubscription.
    const lateTransport = {
      connect: (request: { lastEventId: string | null }) => {
        cursors.push(request.lastEventId);
        return { subscribe: (observer: { next: (event: unknown) => void; complete: () => void }) => {
          observers.push(observer);
          return { unsubscribe: () => undefined };
        } };
      },
    } as unknown as StynxEventStreamTransport;
    const { stream, resyncs } = setup({ transport: lateTransport, serverClose: { ok: 'end-of-stream', cursor: 'discard', reopen: 'immediate' } });
    stream.start();
    observers[0]!.next({ type: HttpEventType.DownloadProgress, partialText: frame('a') });
    observers[0]!.complete();
    expect(cursors).toEqual([null, null]);
    observers[1]!.next({ type: HttpEventType.DownloadProgress, partialText: frame('b') });
    observers[0]!.complete();
    // The stale completion neither discards the new cursor nor opens a third request.
    expect(stream.lastEventId()).toBe('b');
    expect(cursors).toHaveLength(2);
    expect(resyncs.map((entry) => entry.resync.reason)).toEqual(['server-close']);
    stream.stop();
    observers[1]!.complete();
    expect(stream.lastEventId()).toBe('b');
    expect(stream.status()).toBe('stopped');
    expect(cursors).toHaveLength(2);
  });

  it('keeps authorization stops and ordinary errors outside the server-close policy', () => {
    const { stream, clock, transport, resyncs } = setup({ serverClose: { ok: 'end-of-stream', cursor: 'discard', reopen: 'immediate' } });
    stream.start();
    transport.emitProgress(frame('a'));
    transport.error(503);
    // An error is not a server close: it counts, keeps the cursor and waits the backoff.
    expect(transport.connections).toHaveLength(1);
    expect(stream.status()).toBe('reconnecting');
    clock.advanceBy(1_000);
    expect(transport.lastRequest().lastEventId).toBe('a');
    expect(resyncs).toEqual([]);
    transport.error(401);
    expect(stream.status()).toBe('stopped');
    expect(transport.connections).toHaveLength(2);
  });
});
