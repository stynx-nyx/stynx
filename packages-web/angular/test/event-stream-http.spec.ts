import '@angular/compiler';
import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  HttpEventType,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { TestRequest } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  STYNX_SSE_REQUEST,
  StynxEventStreamService,
  ErrorBannerService,
  provideStynxDefaults,
  provideStynxEventStream,
} from '@stynx-nyx/angular';
import { TenantContextService } from '@stynx-nyx/angular-tenancy';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

function configure(sessionActive = signal(true)) {
  let token = 'expired';
  const refresh = vi.fn(async () => {
    token = 'fresh';
    return token;
  });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting(),
      provideStynxDefaults({
        angular: {
          apiBaseUrl: '/api',
          sessionMode: 'bearer',
          authProvider: { getAccessToken: async () => token, refresh },
        },
        tenancy: { defaultTenantResolver: async () => 'tenant-a' },
      }),
      provideStynxEventStream({
        url: '/api/stream',
        pollingIntervalMs: 5_000,
        sessionActive: sessionActive.asReadonly(),
      }),
    ],
  });
  const tenants = TestBed.inject(TenantContextService);
  tenants.setTenant('tenant-a');
  return {
    stream: TestBed.inject(StynxEventStreamService),
    http: TestBed.inject(HttpTestingController),
    banner: TestBed.inject(ErrorBannerService),
    refresh,
    sessionActive,
  };
}

async function expectRequest(http: HttpTestingController, url: string): Promise<TestRequest> {
  let request: TestRequest | undefined;
  await vi.waitFor(() => {
    request = http.expectOne(url);
  });
  return request!;
}

describe('StynxEventStreamService HTTP transport', () => {
  it('uses intercepted HttpClient progress requests, never native EventSource, and parses cumulative text once', async () => {
    const eventSource = globalThis.EventSource;
    const EventSourceSpy = vi.fn();
    Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: EventSourceSpy });
    try {
      const { stream, http } = configure();
      const received: unknown[] = [];
      stream.events$.subscribe((event) => received.push(event));
      stream.start();

      const request = await expectRequest(http, '/api/stream');
      expect(request.request.context.get(STYNX_SSE_REQUEST)).toBe(true);
      expect(request.request.headers.get('Authorization')).toBe('Bearer expired');
      expect(request.request.headers.get('X-Tenant-Id')).toBe('tenant-a');
      expect(request.request.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/iu);
      request.event({ type: HttpEventType.DownloadProgress, partialText: 'id: 1\r\nevent: audit\r\ndata: {\r\ndata: "ok"' } as never);
      request.event({ type: HttpEventType.DownloadProgress, partialText: 'id: 1\r\nevent: audit\r\ndata: {\r\ndata: "ok": true\r\ndata: }\r\n\r\n: heartbeat\r\n\r\n' } as never);

      expect(received).toEqual([{ id: '1', event: 'audit', data: { ok: true } }]);
      expect(stream.lastEventId()).toBe('1');
      expect(stream.status()).toBe('live');
      expect(EventSourceSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: eventSource });
    }
  });

  it('keeps the SSE context through 401 refresh/replay and suppresses banners while preserving Retry-After', async () => {
    const { stream, http, banner, refresh } = configure();
    stream.start();
    const first = await expectRequest(http, '/api/stream');
    first.flush({ errorCode: 'AUTH:UNAUTHENTICATED:expired', message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    const replay = await expectRequest(http, '/api/stream');
    expect(refresh).toHaveBeenCalledOnce();
    expect(replay.request.context.get(STYNX_SSE_REQUEST)).toBe(true);
    expect(replay.request.headers.get('Authorization')).toBe('Bearer fresh');
    replay.flush({ errorCode: 'RATELIMIT:THROTTLED:stream', message: 'wait' }, {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '7' },
    });

    expect(stream.status()).toBe('reconnecting');
    expect(banner.current()).toBeNull();
    expect(() => http.verify()).not.toThrow();
  });

  it('rethrows the original SSE HttpErrorResponse so Retry-After survives the real error interceptor', async () => {
    const { http, banner } = configure();
    const client = TestBed.inject(HttpClient);
    const pending = firstValueFrom(
      client.get('/api/stream-probe', {
        context: new HttpContext().set(STYNX_SSE_REQUEST, true),
      }),
    );
    const request = await expectRequest(http, '/api/stream-probe');
    request.flush({ errorCode: 'RATELIMIT:THROTTLED:stream', message: 'wait' }, {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '7' },
    });

    const error = await pending.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).headers.get('Retry-After')).toBe('7');
    expect(banner.current()).toBeNull();
  });

  it('stops after terminal authorization and when the application logout signal turns false', async () => {
    const terminal = configure();
    terminal.stream.start();
    (await expectRequest(terminal.http, '/api/stream')).flush(null, { status: 401, statusText: 'Unauthorized' });
    const replay = await expectRequest(terminal.http, '/api/stream');
    expect(terminal.refresh).toHaveBeenCalledOnce();
    replay.flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(terminal.stream.status()).toBe('stopped');

    TestBed.resetTestingModule();
    const logout = configure();
    logout.stream.start();
    const request = await expectRequest(logout.http, '/api/stream');
    logout.sessionActive.set(false);
    expect(logout.stream.status()).toBe('stopped');
    expect(request.cancelled).toBe(true);
  });

  it('cancels and reopens on tenant changes without carrying a cross-tenant cursor', async () => {
    const { stream, http } = configure();
    const tenants = TestBed.inject(TenantContextService);
    stream.start();
    const first = await expectRequest(http, '/api/stream');
    first.event({ type: HttpEventType.DownloadProgress, partialText: 'id: a\nevent: audit\ndata: {}\n\n' } as never);
    expect(stream.lastEventId()).toBe('a');

    tenants.setTenant('tenant-b');
    expect(first.cancelled).toBe(true);
    const second = await expectRequest(http, '/api/stream');
    expect(second.request.headers.get('X-Tenant-Id')).toBe('tenant-b');
    expect(second.request.headers.has('Last-Event-ID')).toBe(false);
    expect(stream.lastEventId()).toBeNull();
  });
});
