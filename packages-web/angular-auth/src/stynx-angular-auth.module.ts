import { NgModule } from '@angular/core';
import type { ModuleWithProviders } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { provideAuth } from 'angular-auth-oidc-client';
import { STYNX_AUTH_PROVIDER } from '@stynx-nyx/angular';
import { StynxHasPermissionDirective } from './has-permission.directive';
import { HttpAuthBackend } from './http-auth.backend';
import { StynxLoginRedirectComponent } from './login-redirect.component';
import { StynxLogoutButtonComponent } from './logout-button.component';
import { OidcClientAdapter } from './oidc-client.adapter';
import { StynxPermissionDeniedComponent } from './permission-denied.component';
import { StynxSessionService } from './session.service';
import {
  STYNX_ANGULAR_AUTH_OPTIONS,
  STYNX_AUTH_BACKEND,
  STYNX_OIDC_ADAPTER,
} from './tokens';
import type { StynxAngularAuthModuleOptions } from './types';

@NgModule({
  imports: [
    CommonModule,
    HttpClientModule,
    StynxHasPermissionDirective,
    StynxLoginRedirectComponent,
    StynxLogoutButtonComponent,
    StynxPermissionDeniedComponent,
  ],
  exports: [
    StynxHasPermissionDirective,
    StynxLoginRedirectComponent,
    StynxLogoutButtonComponent,
    StynxPermissionDeniedComponent,
  ],
})
export class StynxAngularAuthModule {
  static forRoot(options: StynxAngularAuthModuleOptions): ModuleWithProviders<StynxAngularAuthModule> {
    return {
      ngModule: StynxAngularAuthModule,
      providers: [
        provideAuth({
          config: options.oidc,
        }),
        {
          provide: STYNX_ANGULAR_AUTH_OPTIONS,
          useValue: options,
        },
        {
          provide: STYNX_OIDC_ADAPTER,
          useClass: OidcClientAdapter,
        },
        {
          provide: STYNX_AUTH_BACKEND,
          useClass: HttpAuthBackend,
        },
        StynxSessionService,
        {
          provide: STYNX_AUTH_PROVIDER,
          useExisting: StynxSessionService,
        },
      ],
    };
  }
}
