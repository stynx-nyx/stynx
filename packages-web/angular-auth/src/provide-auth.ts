import { makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { ROUTES } from '@angular/router';
import { provideAuth } from 'angular-auth-oidc-client';
import { STYNX_AUTH_PROVIDER } from '@stynx-nyx/angular';
import { HttpAuthBackend } from './http-auth.backend';
import { StynxPermissionDeniedComponent } from './permission-denied.component';
import { OidcClientAdapter } from './oidc-client.adapter';
import { StynxSessionService } from './session.service';
import {
  STYNX_ANGULAR_AUTH_OPTIONS,
  STYNX_AUTH_BACKEND,
  STYNX_OIDC_ADAPTER,
} from './tokens';
import type { StynxAngularAuthModuleOptions } from './types';

export function permissionDeniedPath(options: StynxAngularAuthModuleOptions): string {
  return options.permissionDeniedPath ?? options.unauthorizedRoute ?? '/forbidden';
}

function routePath(path: string): string {
  const normalized = path.replace(/^\/+/u, '').replace(/\/+$/u, '');
  return normalized.length > 0 ? normalized : 'forbidden';
}

export function provideStynxAuth(options: StynxAngularAuthModuleOptions): EnvironmentProviders {
  const providers: Array<Provider | EnvironmentProviders> = [
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
    {
      provide: ROUTES,
      multi: true,
      useValue: [
        {
          path: routePath(permissionDeniedPath(options)),
          component: StynxPermissionDeniedComponent,
        },
      ],
    },
  ];

  return makeEnvironmentProviders(providers);
}
