import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { TenantContextService } from '@stynx-nyx/angular-tenancy';
import { Subject } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { StynxEventStreamService, provideStynxEventStream, type StynxEventStreamResync } from '@stynx-nyx/angular';
import { FakeStynxEventStreamClock, FakeStynxEventStreamTransport } from '@stynx-nyx/angular/testing';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

function setup(withTenant = false) {
  const clock = new FakeStynxEventStreamClock();
  const transport = new FakeStynxEventStreamTransport();
  let tenantId: string | null = 'tenant-a';
  const tenant = { tenantId: () => tenantId, tenantChanged$: new Subject<void>() };
  TestBed.configureTestingModule({ providers: [
    ...(withTenant ? [{ provide: TenantContextService, useValue: tenant }] : []),
    provideStynxEventStream({ url: '/stream', pollingIntervalMs: 10_000, sessionActive: signal(true).asReadonly(), transport, clock }),
  ] });
  const stream = TestBed.inject(StynxEventStreamService);
  const resyncs: { resync: StynxEventStreamResync; connections: number; cursor: string | null }[] = [];
  stream.resync$.subscribe((resync) => resyncs.push({ resync, connections: transport.connections.length, cursor: stream.lastEventId() }));
  const switchTenant = (next: string | null) => { tenantId = next; tenant.tenantChanged$.next(); };
  return { stream, clock, transport, resyncs, switchTenant };
}

describe('UPS-NGSSE-14 resync signal', () => {
  it('emits no-content once when a 204 discards a held cursor, before the cursorless reopen', () => {
    const { stream, clock, transport, resyncs } = setup();
    stream.start();
    expect(resyncs).toEqual([]);
    transport.emitProgress('id: a\ndata: {}\n\n');
    transport.respond(204);
    expect(resyncs).toEqual([{ resync: { reason: 'no-content' }, connections: 1, cursor: null }]);
    clock.advanceBy(1_000);
    expect(transport.connections).toHaveLength(2);
    expect(transport.lastRequest().lastEventId).toBe(null);
    transport.respond(204);
    expect(resyncs).toHaveLength(1);
  });

  it('emits tenant-change once when a tenant switch discards a held cursor, before the new tenant opens', () => {
    const { stream, transport, resyncs, switchTenant } = setup(true);
    stream.start();
    switchTenant('tenant-b');
    expect(resyncs).toEqual([]);
    transport.emitProgress('id: a\ndata: {}\n\n');
    switchTenant('tenant-c');
    expect(resyncs).toEqual([{ resync: { reason: 'tenant-change' }, connections: 2, cursor: null }]);
    expect(transport.connections).toHaveLength(3);
    expect(transport.lastRequest().lastEventId).toBe(null);
  });

  it('never emits for an ordinary failure that keeps the cursor', () => {
    const { stream, clock, transport, resyncs } = setup();
    stream.start();
    transport.emitProgress('id: a\ndata: {}\n\n');
    transport.error(503);
    clock.advanceBy(1_000);
    transport.close();
    clock.advanceBy(2_000);
    expect(transport.lastRequest().lastEventId).toBe('a');
    expect(resyncs).toEqual([]);
  });

  it('honors a subscriber that stops the stream from the resync signal', () => {
    const tenantCase = setup(true);
    tenantCase.stream.resync$.subscribe(() => tenantCase.stream.stop());
    tenantCase.stream.start();
    tenantCase.transport.emitProgress('id: a\ndata: {}\n\n');
    tenantCase.switchTenant('tenant-b');
    expect(tenantCase.stream.status()).toBe('stopped');
    expect(tenantCase.transport.connections).toHaveLength(1);
    TestBed.resetTestingModule();

    const noContent = setup();
    noContent.stream.resync$.subscribe(() => noContent.stream.stop());
    noContent.stream.start();
    noContent.transport.emitProgress('id: a\ndata: {}\n\n');
    noContent.transport.respond(204);
    noContent.clock.advanceBy(60_000);
    expect(noContent.stream.status()).toBe('stopped');
    expect(noContent.transport.connections).toHaveLength(1);
  });
});
