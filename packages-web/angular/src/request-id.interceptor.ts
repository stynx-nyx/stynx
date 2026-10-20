import type {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { generateClientRequestId } from './request-id';

/**
 * Functional interceptor that sends a UUIDv7 `X-Request-Id` on every request
 * that does not already carry one. `provideStynxAngular()` registers it with
 * `provideHttpClient(withInterceptors([...]))`.
 */
export const requestIdInterceptor: HttpInterceptorFn = (request, next) =>
  request.headers.has('X-Request-Id')
    ? next(request)
    : next(request.clone({ setHeaders: { 'X-Request-Id': generateClientRequestId() } }));

/**
 * Class adapter over {@link requestIdInterceptor} for `HTTP_INTERCEPTORS`
 * consumers and the `StynxAngularModule.forRoot()` NgModule path.
 *
 * @deprecated Use the functional {@link requestIdInterceptor} with
 * `withInterceptors([...])`; kept because it is part of the published API.
 */
@Injectable()
export class RequestIdInterceptor implements HttpInterceptor {
  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return requestIdInterceptor(request, (forwarded) => next.handle(forwarded));
  }
}
