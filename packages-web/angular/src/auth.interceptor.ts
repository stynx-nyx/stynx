import { HttpErrorResponse } from '@angular/common/http';
import type { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { ApplicationRef, Injectable, NgZone, inject } from '@angular/core';
import { UnauthorizedError, type AuthProvider } from '@stynx-web/sdk';
import { Observable, catchError, from, switchMap } from 'rxjs';
import { STYNX_ANGULAR_OPTIONS, STYNX_AUTH_PROVIDER } from './tokens';
import type { StynxAngularModuleOptions } from './types';
import { ErrorBannerService } from './error-banner.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly options = inject<StynxAngularModuleOptions>(STYNX_ANGULAR_OPTIONS);
  private readonly authProvider = inject<AuthProvider | null>(STYNX_AUTH_PROVIDER);
  private readonly errorBanner = inject(ErrorBannerService, { optional: true });
  private readonly zone = inject(NgZone, { optional: true });
  private readonly appRef = inject(ApplicationRef, { optional: true });

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const authProvider = this.authProvider;
    if (this.options.sessionMode !== 'bearer' || !authProvider) {
      return next.handle(request);
    }

    return from(Promise.resolve(authProvider.getAccessToken())).pipe(
      switchMap((token) => {
        const originalBearerAuth = hasBearerAuthorization(request);
        const attemptedBearerRequest = originalBearerAuth || Boolean(token);
        const initialRequest = token && !request.headers.has('Authorization')
          ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
          : request;

        if (!attemptedBearerRequest) {
          return next.handle(initialRequest).pipe(
            catchError((error: unknown) => this.rethrowInZone(error)),
          );
        }

        return next.handle(initialRequest).pipe(
          catchError((error: unknown) => {
            if (!isUnauthorized(error) || initialRequest.headers.has('x-stynx-auth-retried')) {
              return this.rethrowInZone(error);
            }

            return from(Promise.resolve(authProvider.refresh())).pipe(
              switchMap((refreshedToken) => {
                if (!refreshedToken) {
                  this.showReloginBanner(authProvider);
                  return from(Promise.resolve(authProvider.onAuthFailure?.(error))).pipe(
                    switchMap(() => this.rethrowInZone(error)),
                  );
                }

                const replay = request.clone({
                  setHeaders: {
                    Authorization: `Bearer ${refreshedToken}`,
                    'x-stynx-auth-retried': 'true',
                  },
                });
                return next.handle(replay);
              }),
            );
          }),
        );
      }),
    );
  }

  private showReloginBanner(authProvider: AuthProvider): void {
    this.errorBanner?.show({
      message: 'Your session expired. Please log in again.',
      tone: 'error',
      actionLabel: 'log in',
      action: () => Promise.resolve(authProvider.loginRedirect?.()),
    });
  }

  private rethrowInZone(error: unknown): Observable<never> {
    return new Observable<never>((subscriber) => {
      const emit = () => {
        subscriber.error(error);
        setTimeout(() => {
          if (!this.appRefDestroyed()) {
            this.appRef?.tick();
          }
        }, 0);
      };
      if (this.zone) {
        this.zone.run(emit);
        return;
      }
      emit();
    });
  }

  private appRefDestroyed(): boolean {
    return Boolean((this.appRef as { destroyed?: boolean } | null)?.destroyed);
  }
}

function isUnauthorized(error: unknown): boolean {
  return (
    (error instanceof HttpErrorResponse && error.status === 401)
    || error instanceof UnauthorizedError
  );
}

function hasBearerAuthorization(request: HttpRequest<unknown>): boolean {
  return /^Bearer\s+/iu.test(request.headers.get('Authorization') ?? '');
}
