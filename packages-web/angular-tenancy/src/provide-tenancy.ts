import { APP_INITIALIZER } from '@angular/core';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { TenantContextService } from './tenant-context.service';
import { TenantInterceptor } from './tenant.interceptor';
import { STYNX_TENANCY_OPTIONS, STYNX_TENANCY_WINDOW } from './tokens';
import type { Provider } from '@angular/core';
import type { TenancyOptions } from './types';

function initializeTenantContext(service: TenantContextService): () => Promise<void> {
  return () => service.initialize();
}

export function provideTenancy(options: TenancyOptions = {}): Provider[] {
  return [
    {
      provide: STYNX_TENANCY_OPTIONS,
      useValue: options,
    },
    {
      provide: STYNX_TENANCY_WINDOW,
      useFactory: () => (typeof window === 'undefined' ? null : window),
    },
    TenantContextService,
    {
      provide: APP_INITIALIZER,
      useFactory: initializeTenantContext,
      deps: [TenantContextService],
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: TenantInterceptor,
      multi: true,
    },
  ];
}
