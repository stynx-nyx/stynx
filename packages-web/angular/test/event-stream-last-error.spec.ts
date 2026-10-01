import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { TenantContextService } from '@stynx-nyx/angular-tenancy';
import { UnauthorizedError } from '@stynx-nyx/sdk';
import { Subject, throwError } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  StynxEventStreamService,
  provideStynxEventStream,
  type StynxEventStreamConfig,
  type StynxEventStreamTransport,
} from '@stynx-nyx/angular';
import { FakeStynxEventStreamClock, FakeStynxEventStreamTransport } from '@stynx-nyx/angular/testing';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

const contextRetryAfter = (_error: HttpErrorResponse, body: unknown): number | null => {
  const seconds = (body as { context?: { retryAfter?: number } } | null)?.context?.retryAfter;
  return typeof seconds === 'number' ? seconds * 1_000 : null;
};

function setup(overrides: Partial<StynxEventStreamConfig> = {}, transport: StynxEventStreamTransport = new FakeStynxEventStreamTransport()) {
  const clock = new FakeStynxEventStreamClock();
  let tenantId = 'tenant-a';
  const tenant = { tenantId: () => tenantId, tenantChanged$: new Subject<void>() };
  TestBed.configureTestingModule({ providers: [
    { provide: TenantContextService, useValue: tenant },
    provideStynxEventStream({ url: '/stream', pollingIntervalMs: 60_000, sessionActive: signal(true).asReadonly(), transport, clock, ...overrides }),
  ] });
  const switchTenant = (next: string) => { tenantId = next; tenant.tenantChanged$.next(); };
  return { stream: TestBed.inject(StynxEventStreamService), clock, transport: transport as FakeStynxEventStreamTransport, switchTenant };
}

describe('UPS-NGSSE-15 retry delay from the error body', () => {
  it('waits for the delay read from the body by retryAfterFrom', () => {
    const { stream, clock, transport } = setup({ retryAfterFrom: contextRetryAfter });
    stream.start();
    transport.error(429, {}, { context: { retryAfter: 45 } });
    expect(clock.nextTimeoutDelay()).toBe(45_000);
    clock.advanceBy(44_999);
    expect(transport.connections).toHaveLength(1);
    clock.advanceBy(1);
    expect(transport.connections).toHaveLength(2);
  });

  it('enters polling and waits for a body delay longer than the fixed compass', () => {
    const { stream, clock, transport } = setup({
      retryAfterFrom: contextRetryAfter, failuresBeforePolling: 1, retryMode: 'fixed', initialMs: 60_000,
    });
    stream.start();
    transport.error(429, {}, { errorCode: 'PORTAL.RATE_LIMITED', context: { retryAfter: 120 } });
    expect(stream.polling()).toBe(true);
    expect(stream.lastError()).toMatchObject({ status: 429, outcome: 'polling', at: 0, body: { errorCode: 'PORTAL.RATE_LIMITED' } });
    clock.advanceBy(60_000);
    expect(transport.connections).toHaveLength(1);
    clock.advanceBy(60_000);
    expect(transport.connections).toHaveLength(2);
  });

  it('uses the larger of the Retry-After header and the body delay', () => {
    const header = setup({ retryAfterFrom: contextRetryAfter });
    header.stream.start();
    header.transport.error(429, { 'Retry-After': '10' }, { context: { retryAfter: 3 } });
    expect(header.clock.nextTimeoutDelay()).toBe(10_000);
    TestBed.resetTestingModule();

    const body = setup({ retryAfterFrom: contextRetryAfter });
    body.stream.start();
    body.transport.error(429, { 'Retry-After': '2' }, { context: { retryAfter: 8 } });
    expect(body.clock.nextTimeoutDelay()).toBe(8_000);
  });

  it('ignores extractor results that are absent, invalid or thrown', () => {
    for (const retryAfterFrom of [() => null, () => Number.NaN, () => -5, () => { throw new Error('bad body'); }]) {
      const { stream, clock, transport } = setup({ retryAfterFrom });
      stream.start();
      transport.error(429, {}, { context: { retryAfter: 45 } });
      expect(clock.nextTimeoutDelay()).toBe(1_000);
      TestBed.resetTestingModule();
    }
  });

  it('does not call the extractor for non-HTTP failures', () => {
    const retryAfterFrom = vi.fn(() => 45_000);
    const { stream, clock, transport } = setup({ retryAfterFrom });
    stream.start();
    transport.close();
    expect(retryAfterFrom).not.toHaveBeenCalled();
    expect(clock.nextTimeoutDelay()).toBe(1_000);
    expect(stream.lastError()).toBe(null);
  });
});

describe('UPS-NGSSE-15 lastError signal', () => {
  it('records 429 and 5xx errors with decoded JSON bodies and the outcome', () => {
    const { stream, clock, transport } = setup();
    expect(stream.lastError()).toBe(null);
    stream.start();
    transport.error(429, { 'Retry-After': '1' }, '{"errorCode":"RATE"}');
    expect(stream.lastError()).toMatchObject({ status: 429, body: { errorCode: 'RATE' }, at: 0, outcome: 'retry' });
    expect(stream.lastError()?.error).toBeInstanceOf(HttpErrorResponse);
    clock.advanceBy(1_000);
    transport.error(502, {}, 'Bad gateway');
    expect(stream.lastError()).toMatchObject({ status: 502, body: 'Bad gateway', at: 1_000, outcome: 'polling' });
    transport.error(500);
    expect(stream.lastError()).toMatchObject({ status: 500, body: null });
  });

  it('clears lastError when a frame or a live comment returns the stream to live', () => {
    const frame = setup();
    frame.stream.start();
    frame.transport.error(500);
    frame.clock.advanceBy(1_000);
    frame.transport.emitProgress(': heartbeat\n\n');
    expect(frame.stream.lastError()).not.toBe(null);
    frame.transport.emitProgress('id: a\ndata: {}\n\n');
    expect(frame.stream.status()).toBe('live');
    expect(frame.stream.lastError()).toBe(null);
    TestBed.resetTestingModule();

    const comment = setup({ commentActivity: 'live' });
    comment.stream.start();
    comment.transport.error(500);
    comment.clock.advanceBy(1_000);
    comment.transport.emitProgress(': heartbeat\n\n');
    expect(comment.stream.status()).toBe('live');
    expect(comment.stream.lastError()).toBe(null);
  });

  it('keeps a terminal 401 after stop and clears it on restart or tenant change', () => {
    const { stream, transport, switchTenant } = setup();
    stream.start();
    transport.error(401, {}, { errorCode: 'AUTH' });
    expect(stream.status()).toBe('stopped');
    expect(stream.lastError()).toMatchObject({ status: 401, body: { errorCode: 'AUTH' }, outcome: 'stopped' });
    stream.start();
    expect(stream.lastError()).toBe(null);
    transport.error(503);
    expect(stream.lastError()?.status).toBe(503);
    switchTenant('tenant-b');
    expect(stream.lastError()).toBe(null);
  });

  it('records non-HTTP transport errors without a status or body', () => {
    const failure = new Error('network down');
    const generic = setup({}, { connect: () => throwError(() => failure) });
    generic.stream.start();
    expect(generic.stream.lastError()).toEqual({ status: null, body: null, error: failure, at: 0, outcome: 'retry' });
    TestBed.resetTestingModule();

    const unauthorized = new UnauthorizedError('expired', 401);
    const terminal = setup({}, { connect: () => throwError(() => unauthorized) });
    terminal.stream.start();
    expect(terminal.stream.status()).toBe('stopped');
    expect(terminal.stream.lastError()).toMatchObject({ status: null, error: unauthorized, outcome: 'stopped' });
  });
});
