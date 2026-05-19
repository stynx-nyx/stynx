import { Injectable, inject } from '@angular/core';
import { TenantContextService } from './tenant-context.service';
import type { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import type { Observable } from 'rxjs';

@Injectable()
export class TenantInterceptor implements HttpInterceptor {
  private readonly tenantContext = inject(TenantContextService);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const tenantId = this.tenantContext.tenantId();
    if (!tenantId || request.headers.has('X-Tenant-Id')) {
      return next.handle(request);
    }

    return next.handle(
      request.clone({
        setHeaders: {
          'X-Tenant-Id': tenantId,
        },
      }),
    );
  }
}
