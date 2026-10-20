import '@angular/compiler';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import type { HttpHandler, HttpRequest } from '@angular/common/http';
import { CSP_NONCE } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ValidationError, type AuthProvider } from '@stynx-nyx/sdk';
import { firstValueFrom, throwError } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ErrorBannerService } from '../src/error-banner.service';
import { ErrorInterceptor } from '../src/error.interceptor';
import { provideStynxDefaults } from '../src/provide-defaults';
import { AuthInterceptor } from '../src/auth.interceptor';
import { ErrorInterceptor as ProvidedErrorInterceptor } from '../src/error.interceptor';
import { RequestIdInterceptor } from '../src/request-id.interceptor';
import { STYNX_ANGULAR_OPTIONS, STYNX_AUTH_PROVIDER, STYNX_WINDOW } from '../src/tokens';

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-nyx/angular provider depth', () => {
  it('maps backend StynxError envelopes to typed client errors and banner state', async () => {
    TestBed.configureTestingModule({
      providers: [ErrorBannerService, ErrorInterceptor],
    });
    const interceptor = TestBed.inject(ErrorInterceptor);
    const banner = TestBed.inject(ErrorBannerService);
    const next: HttpHandler = {
      handle: () =>
        throwError(
          () =>
            new HttpErrorResponse({
              error: {
                code: 'FORM_VALIDATION_ERROR',
                context: { field: 'email' },
                message: 'Email is invalid',
              },
              status: 422,
            }),
        ),
    };

    await expect(
      firstValueFrom(interceptor.intercept({} as HttpRequest<unknown>, next)),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(banner.current()).toEqual({
      code: 'FORM_VALIDATION_ERROR',
      context: { field: 'email' },
      message: 'Email is invalid',
      status: 422,
    });
  });

  it('registers default tokens, csp nonce, and the HTTP interceptor chain', () => {
    const authProvider: AuthProvider = {
      getAccessToken: vi.fn(async () => 'access-token'),
      refresh: vi.fn(async () => null),
    };

    TestBed.configureTestingModule({
      providers: [
        provideStynxDefaults({
          angular: {
            apiBaseUrl: 'https://api.example.test/',
            authProvider,
            cspNonce: 'nonce-r17',
            sessionMode: 'bearer',
          },
        }),
      ],
    });

    expect(TestBed.inject(STYNX_ANGULAR_OPTIONS)).toMatchObject({
      apiBaseUrl: 'https://api.example.test/',
      cspNonce: 'nonce-r17',
      sessionMode: 'bearer',
    });
    expect(TestBed.inject(STYNX_AUTH_PROVIDER)).toBe(authProvider);
    expect(TestBed.inject(CSP_NONCE)).toBe('nonce-r17');
    expect(TestBed.inject(HTTP_INTERCEPTORS)).toEqual(
      expect.arrayContaining([expect.any(AuthInterceptor), expect.any(ProvidedErrorInterceptor)]),
    );
    // SM-16: request ids come from the functional interceptor, not a DI class.
    expect(
      TestBed.inject(HTTP_INTERCEPTORS).some((entry) => entry instanceof RequestIdInterceptor),
    ).toBe(false);
  });

  it('sends a UUIDv7 X-Request-Id through the functional interceptor before auth (SM-16)', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideStynxDefaults({
          angular: {
            apiBaseUrl: 'https://api.example.test/',
            authProvider: {
              getAccessToken: vi.fn(async () => 'access-token'),
              refresh: vi.fn(async () => null),
            },
            sessionMode: 'bearer',
          },
        }),
        provideHttpClientTesting(),
      ],
    });
    const http = TestBed.inject(HttpClient);
    const controller = TestBed.inject(HttpTestingController);

    const response = firstValueFrom(http.get('https://api.example.test/items'));
    await Promise.resolve();
    await Promise.resolve();
    const pending = controller.expectOne('https://api.example.test/items');
    expect(pending.request.headers.get('X-Request-Id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(pending.request.headers.get('Authorization')).toBe('Bearer access-token');
    pending.flush({ ok: true });
    await expect(response).resolves.toEqual({ ok: true });
    controller.verify();
  });

  it('provides a null window when evaluated outside a browser', () => {
    const browserWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: undefined });
    try {
      TestBed.configureTestingModule({
        providers: [
          provideStynxDefaults({
            angular: { apiBaseUrl: '/api', sessionMode: 'cookie' },
          }),
        ],
      });

      expect(TestBed.inject(STYNX_WINDOW)).toBe(null);
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
    }
  });
});
