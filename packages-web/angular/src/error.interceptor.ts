import { HttpErrorResponse } from '@angular/common/http';
import type { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { createStynxSdkError } from '@stynx-nyx/sdk';
import type { Observable } from 'rxjs';
import { catchError, throwError } from 'rxjs';
import { ErrorBannerService } from './error-banner.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private readonly errorBanner = inject(ErrorBannerService);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          const mapped = createStynxSdkError(error.status, error.error);
          this.errorBanner.show({
            message: mapped.message,
            ...(mapped.code ? { code: mapped.code } : {}),
            ...(mapped.status ? { status: mapped.status } : {}),
            ...(mapped.context ? { context: mapped.context } : {}),
          });
          return throwError(() => mapped);
        }
        return throwError(() => error);
      }),
    );
  }
}
