import '@angular/compiler';
import { HttpEventType, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { TestRequest } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StynxEventStreamService, provideStynxDefaults, provideStynxEventStream } from '@stynx-nyx/angular';
import { TenantContextService } from '@stynx-nyx/angular-tenancy';
import { FakeStynxEventStreamClock } from '@stynx-nyx/angular/testing';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

function configure() {
  const clock = new FakeStynxEventStreamClock();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptorsFromDi()),
      provideStynxDefaults({
        angular: { apiBaseUrl: '/api', sessionMode: 'bearer', authProvider: { getAccessToken: async () => 'token', refresh: async () => 'token' } },
        tenancy: { defaultTenantResolver: async () => 'tenant-a' },
      }),
      provideStynxEventStream({
        url: '/api/stream',
        pollingIntervalMs: 5_000,
        sessionActive: signal(true).asReadonly(),
        clock,
        retryAfterFrom: (_error, body) => (body as { retryAfter?: number } | null)?.retryAfter ?? null,
      }),
      provideHttpClientTesting(),
    ],
  });
  TestBed.inject(TenantContextService).setTenant('tenant-a');
  return { stream: TestBed.inject(StynxEventStreamService), http: TestBed.inject(HttpTestingController), clock };
}

async function expectRequest(http: HttpTestingController): Promise<TestRequest> {
  let request: TestRequest | undefined;
  await vi.waitFor(() => { request = http.expectOne('/api/stream'); });
  return request!;
}

describe('StynxEventStreamService HTTP transport headers and error bodies', () => {
  it('sends Accept text/event-stream with and without Last-Event-ID', async () => {
    const { stream, http, clock } = configure();
    stream.start();
    const first = await expectRequest(http);
    expect(first.request.headers.get('Accept')).toBe('text/event-stream');
    expect(first.request.headers.has('Last-Event-ID')).toBe(false);
    first.event({ type: HttpEventType.DownloadProgress, partialText: 'id: saved\ndata: {}\n\n' } as never);
    first.flush('', { status: 200, statusText: 'OK' });
    clock.advanceBy(1_000);
    const next = await expectRequest(http);
    expect(next.request.headers.get('Accept')).toBe('text/event-stream');
    expect(next.request.headers.get('Last-Event-ID')).toBe('saved');
  });

  it('exposes the error body through the real interceptor chain and reads its retry delay', async () => {
    const { stream, http, clock } = configure();
    stream.start();
    (await expectRequest(http)).flush({ errorCode: 'RATELIMIT:THROTTLED:stream', retryAfter: 9_000 }, { status: 429, statusText: 'Too Many Requests' });
    await vi.waitFor(() => expect(stream.lastError()?.status).toBe(429));
    expect(stream.lastError()?.body).toEqual({ errorCode: 'RATELIMIT:THROTTLED:stream', retryAfter: 9_000 });
    expect(clock.nextTimeoutDelay()).toBe(9_000);
    clock.advanceBy(8_999);
    http.expectNone('/api/stream');
    clock.advanceBy(1);
    await expectRequest(http);
  });
});
