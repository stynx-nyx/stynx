import {
  APP_INITIALIZER,
  CSP_NONCE,
  ModuleWithProviders,
  NgModule,
} from '@angular/core';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { EmptyStateComponent } from './empty-state.component';
import { ErrorBannerService } from './error-banner.service';
import { AuthInterceptor } from './auth.interceptor';
import { ErrorInterceptor } from './error.interceptor';
import { RequestIdInterceptor } from './request-id.interceptor';
import { TenantInterceptor } from './tenant.interceptor';
import { TenantContextService } from './tenant-context.service';
import { STYNX_ANGULAR_OPTIONS, STYNX_AUTH_PROVIDER, STYNX_WINDOW } from './tokens';
import { ToastService } from './toast.service';
import type { StynxAngularModuleOptions } from './types';

function initializeTenantContext(service: TenantContextService): () => Promise<void> {
  return () => service.initialize();
}

@NgModule({
  imports: [CommonModule, HttpClientModule, EmptyStateComponent],
  exports: [EmptyStateComponent],
})
export class StynxAngularModule {
  static forRoot(options: StynxAngularModuleOptions): ModuleWithProviders<StynxAngularModule> {
    return {
      ngModule: StynxAngularModule,
      providers: [
        {
          provide: STYNX_ANGULAR_OPTIONS,
          useValue: options,
        },
        {
          provide: STYNX_AUTH_PROVIDER,
          useValue: options.authProvider ?? null,
        },
        {
          provide: STYNX_WINDOW,
          useFactory: () => (typeof window === 'undefined' ? null : window),
        },
        ...(options.cspNonce ? [{
          provide: CSP_NONCE,
          useValue: options.cspNonce,
        }] : []),
        TenantContextService,
        ErrorBannerService,
        ToastService,
        {
          provide: APP_INITIALIZER,
          useFactory: initializeTenantContext,
          deps: [TenantContextService],
          multi: true,
        },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: RequestIdInterceptor,
          multi: true,
        },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: TenantInterceptor,
          multi: true,
        },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: AuthInterceptor,
          multi: true,
        },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: ErrorInterceptor,
          multi: true,
        },
      ],
    };
  }
}
