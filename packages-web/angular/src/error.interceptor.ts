import { HttpErrorResponse } from '@angular/common/http';
import type { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { createStynxSdkError } from '@stynx-nyx/sdk';
import type { Observable } from 'rxjs';
import { catchError, throwError } from 'rxjs';
import { ErrorBannerService } from './error-banner.service';
import { classifyStynxError } from './error-classification';
import { STYNX_SSE_REQUEST } from './event-stream';
import { STYNX_ANGULAR_OPTIONS } from './tokens';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private readonly errorBanner = inject(ErrorBannerService);
  private readonly options = inject(STYNX_ANGULAR_OPTIONS, { optional: true });

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          if (request.context?.get(STYNX_SSE_REQUEST)) {
            return throwError(() => error);
          }
          const mapped = createStynxSdkError(error.status, error.error);
          const boundary = this.options?.errorBoundary;
          if (boundary) {
            if (!boundary.exclude?.(request, error)) {
              const classification = classifyStynxError(mapped, boundary);
              this.errorBanner.show({
                message: mapped.message,
                messageKey: classification.messageKey,
                ...(mapped.code ? { code: mapped.code } : {}),
                status: mapped.status,
                ...(mapped.context ? { context: mapped.context } : {}),
              });
            }
            return throwError(() => mapped);
          }
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
