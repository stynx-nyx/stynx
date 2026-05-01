import { HttpErrorResponse } from '@angular/common/http';
import type { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import type { AuthProvider } from '@stynx-web/sdk';
import type { Observable } from 'rxjs';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { STYNX_ANGULAR_OPTIONS, STYNX_AUTH_PROVIDER } from './tokens';
import type { StynxAngularModuleOptions } from './types';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    @Inject(STYNX_ANGULAR_OPTIONS)
    private readonly options: StynxAngularModuleOptions,
    @Inject(STYNX_AUTH_PROVIDER)
    private readonly authProvider: AuthProvider | null,
  ) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const authProvider = this.authProvider;
    if (this.options.sessionMode !== 'bearer' || !authProvider) {
      return next.handle(request);
    }

    return from(Promise.resolve(authProvider.getAccessToken())).pipe(
      switchMap((token) => {
        const initialRequest = token && !request.headers.has('Authorization')
          ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
          : request;

        return next.handle(initialRequest).pipe(
          catchError((error: unknown) => {
            if (!(error instanceof HttpErrorResponse) || error.status !== 401 || initialRequest.headers.has('x-stynx-auth-retried')) {
              return throwError(() => error);
            }

            return from(Promise.resolve(authProvider.refresh())).pipe(
              switchMap((refreshedToken) => {
                if (!refreshedToken) {
                  return from(Promise.resolve(authProvider.onAuthFailure?.(error))).pipe(
                    switchMap(() => throwError(() => error)),
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
}
