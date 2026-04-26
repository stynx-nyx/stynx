import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantInterceptor implements HttpInterceptor {
  constructor(@Inject(TenantContextService) private readonly tenantContext: TenantContextService) {}

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
