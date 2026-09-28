import '@angular/compiler';
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ErrorBannerService, StynxAngularModule, provideStynxDefaults } from '@stynx-nyx/angular';
import { StynxSdkError } from '@stynx-nyx/sdk';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

interface BoundaryOptions {
  messageKeysByCodePrefix: Record<string, string>;
  fallbackMessageKey: string;
  exclude?: (request: unknown, error: HttpErrorResponse) => boolean;
}

const authOptions: {
  apiBaseUrl: string;
  sessionMode: 'cookie';
  errorBoundary: BoundaryOptions;
} = {
  apiBaseUrl: '/api',
  sessionMode: 'cookie' as const,
  errorBoundary: {
    messageKeysByCodePrefix: { SCREEN: 'screen.error' },
    fallbackMessageKey: 'app.error.fallback',
  },
};

function configure(registration: 'provider' | 'module', errorBoundary: BoundaryOptions | null = authOptions.errorBoundary) {
  const legacyOptions = { apiBaseUrl: authOptions.apiBaseUrl, sessionMode: authOptions.sessionMode };
  const angular = errorBoundary === null ? legacyOptions : { ...legacyOptions, errorBoundary };
  TestBed.configureTestingModule({
    imports: registration === 'module' ? [StynxAngularModule.forRoot(angular)] : [],
    providers: [
      ...(registration === 'provider' ? [provideStynxDefaults({ angular })] : []),
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting(),
    ],
  });
  return {
    client: TestBed.inject(HttpClient),
    http: TestBed.inject(HttpTestingController),
    banner: TestBed.inject(ErrorBannerService),
  };
}

describe('ErrorInterceptor errorBoundary', () => {
  it.each(['provider', 'module'] as const)('%s registration maps law envelopes into banner keys', async (registration) => {
    const { client, http, banner } = configure(registration);
    const pending = firstValueFrom(client.get('/api/failure')).catch((error: unknown) => error);
    http.expectOne('/api/failure').flush({
      statusCode: 409,
      errorCode: 'SCREEN:CONFLICT:stale',
      message: 'Server fallback',
      requestId: 'req-9',
      details: { field: 'name' },
    }, { status: 409, statusText: 'Conflict' });

    const error = await pending;
    expect(error).toBeInstanceOf(StynxSdkError);
    expect(error).toMatchObject({ code: 'SCREEN:CONFLICT:stale', status: 409 });
    expect(banner.current()).toMatchObject({
      message: 'Server fallback',
      messageKey: 'screen.error',
      code: 'SCREEN:CONFLICT:stale',
      status: 409,
    });
    expect(banner.current()?.message).not.toBe(banner.current()?.messageKey);
  });

  it('maps a non-SSE excluded local 412 and suppresses only its banner', async () => {
    const exclude = vi.fn((_request: unknown, _error: HttpErrorResponse) => true);
    const { client, http, banner } = configure('provider', {
      ...authOptions.errorBoundary,
      exclude,
    });
    const pending = firstValueFrom(client.get('/api/local-check')).catch((error: unknown) => error);
    http.expectOne('/api/local-check').flush({
      errorCode: 'PRECONDITION:STALE:local', message: 'Changed elsewhere', requestId: 'req-10',
    }, { status: 412, statusText: 'Precondition Failed' });

    const error = await pending;
    expect(exclude).toHaveBeenCalledOnce();
    expect(exclude.mock.calls[0]?.[0]).toMatchObject({ url: '/api/local-check' });
    expect(exclude.mock.calls[0]?.[1]).toBeInstanceOf(HttpErrorResponse);
    expect(error).toBeInstanceOf(StynxSdkError);
    expect(error).toMatchObject({ status: 412, code: 'PRECONDITION:STALE:local' });
    expect(banner.current()).toBe(null);
  });

  it('preserves no-config server-message behavior and mapped error compatibility', async () => {
    const { client, http, banner } = configure('provider', null);
    const pending = firstValueFrom(client.get('/api/legacy')).catch((error: unknown) => error);
    http.expectOne('/api/legacy').flush({ code: 'LEGACY_FAILURE', message: 'Original server copy' }, {
      status: 500, statusText: 'Server Error',
    });

    const error = await pending;
    expect(error).toBeInstanceOf(StynxSdkError);
    expect(error).toMatchObject({ code: 'LEGACY_FAILURE', status: 500, message: 'Original server copy' });
    expect(banner.current()).toEqual({
      message: 'Original server copy', code: 'LEGACY_FAILURE', status: 500,
    });
  });

  it('keeps errorBoundary classification and banner behavior equivalent across registrations', async () => {
    const snapshots = [];
    for (const registration of ['provider', 'module'] as const) {
      TestBed.resetTestingModule();
      const { client, http, banner } = configure(registration);
      const pending = firstValueFrom(client.get('/api/parity')).catch((error: unknown) => error);
      http.expectOne('/api/parity').flush({ errorCode: 'SCREEN:CONFLICT:name', message: 'Conflict' }, {
        status: 409, statusText: 'Conflict',
      });
      const error = await pending;
      snapshots.push({
        error: { code: (error as StynxSdkError).code, status: (error as StynxSdkError).status },
        banner: banner.current(),
      });
    }
    expect(snapshots[0]).toEqual(snapshots[1]);
  });
});
