import type { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { generateClientRequestId } from './request-id';

@Injectable()
export class RequestIdInterceptor implements HttpInterceptor {
  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (request.headers.has('X-Request-Id')) {
      return next.handle(request);
    }

    return next.handle(
      request.clone({
        setHeaders: {
          'X-Request-Id': generateClientRequestId(),
        },
      }),
    );
  }
}
