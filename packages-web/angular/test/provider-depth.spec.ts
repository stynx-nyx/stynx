import '@angular/compiler';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import type { HttpHandler, HttpRequest } from '@angular/common/http';
import { CSP_NONCE } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ValidationError, type AuthProvider } from '@stynx-web/sdk';
import { firstValueFrom, throwError } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ErrorBannerService } from '../src/error-banner.service';
import { ErrorInterceptor } from '../src/error.interceptor';
import { provideStynxDefaults } from '../src/provide-defaults';
import { AuthInterceptor } from '../src/auth.interceptor';
import { ErrorInterceptor as ProvidedErrorInterceptor } from '../src/error.interceptor';
import { RequestIdInterceptor } from '../src/request-id.interceptor';
import { STYNX_ANGULAR_OPTIONS, STYNX_AUTH_PROVIDER } from '../src/tokens';

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-web/angular provider depth', () => {
  it('maps backend StynxError envelopes to typed client errors and banner state', async () => {
    TestBed.configureTestingModule({
      providers: [ErrorBannerService, ErrorInterceptor],
    });
    const interceptor = TestBed.inject(ErrorInterceptor);
    const banner = TestBed.inject(ErrorBannerService);
    const next: HttpHandler = {
      handle: () => throwError(() => new HttpErrorResponse({
        error: {
          code: 'FORM_VALIDATION_ERROR',
          context: { field: 'email' },
          message: 'Email is invalid',
        },
        status: 422,
      })),
    };

    await expect(firstValueFrom(interceptor.intercept({} as HttpRequest<unknown>, next))).rejects.toBeInstanceOf(
      ValidationError,
    );
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
    expect(TestBed.inject(HTTP_INTERCEPTORS)).toEqual(expect.arrayContaining([
      expect.any(RequestIdInterceptor),
      expect.any(AuthInterceptor),
      expect.any(ProvidedErrorInterceptor),
    ]));
  });
});
