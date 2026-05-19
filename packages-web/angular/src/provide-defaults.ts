import { CSP_NONCE, importProvidersFrom, makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { provideTenancy } from '@stynx-web/angular-tenancy';
import type { TenancyOptions } from '@stynx-web/angular-tenancy';
import { AuthInterceptor } from './auth.interceptor';
import { ErrorBannerService } from './error-banner.service';
import { ErrorInterceptor } from './error.interceptor';
import { RequestIdInterceptor } from './request-id.interceptor';
import { STYNX_ANGULAR_OPTIONS, STYNX_AUTH_PROVIDER, STYNX_WINDOW } from './tokens';
import { ToastService } from './toast.service';
import type { StynxAngularModuleOptions } from './types';

export type StynxAngularConfig = StynxAngularModuleOptions;
export type StynxTenancyConfig = TenancyOptions;
export type StynxDefaultFeatureProviders =
  | EnvironmentProviders
  | Provider
  | ReadonlyArray<Provider | EnvironmentProviders>;
export type StynxAuthConfig = StynxDefaultFeatureProviders;
export type StynxI18nConfig = StynxDefaultFeatureProviders;
export type StynxFlowConfig = StynxDefaultFeatureProviders;
export type StynxIamConfig = StynxDefaultFeatureProviders;
export type StynxAuditConfig = StynxDefaultFeatureProviders;
export type StynxUiConfig = StynxDefaultFeatureProviders;

export interface StynxDefaultsConfig {
  angular?: StynxAngularConfig;
  auth?: StynxAuthConfig;
  tenancy?: StynxTenancyConfig;
  i18n?: StynxI18nConfig;
  flow?: StynxFlowConfig;
  iam?: StynxIamConfig;
  audit?: StynxAuditConfig;
  ui?: StynxUiConfig;
}

function tenancyOptionsFor(
  angular: StynxAngularConfig,
  tenancy: StynxTenancyConfig | undefined,
): StynxTenancyConfig {
  if (tenancy) {
    return tenancy;
  }

  return angular.defaultTenantResolver
    ? { defaultTenantResolver: angular.defaultTenantResolver }
    : {};
}

function featureProviders(
  config: StynxDefaultFeatureProviders | undefined,
): Array<Provider | EnvironmentProviders> {
  if (!config) {
    return [];
  }

  return Array.isArray(config) ? [...config] : [config as Provider | EnvironmentProviders];
}

export function provideStynxAngular(
  config: StynxAngularConfig,
  tenancy?: StynxTenancyConfig,
): EnvironmentProviders {
  const providers: Array<Provider | EnvironmentProviders> = [
    importProvidersFrom(HttpClientModule),
    {
      provide: STYNX_ANGULAR_OPTIONS,
      useValue: config,
    },
    {
      provide: STYNX_AUTH_PROVIDER,
      useValue: config.authProvider ?? null,
    },
    {
      provide: STYNX_WINDOW,
      useFactory: () => (typeof window === 'undefined' ? null : window),
    },
    ...provideTenancy(tenancyOptionsFor(config, tenancy)),
    ErrorBannerService,
    ToastService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: RequestIdInterceptor,
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
  ];

  if (config.cspNonce) {
    providers.push({
      provide: CSP_NONCE,
      useValue: config.cspNonce,
    });
  }

  return makeEnvironmentProviders(providers);
}

export function provideStynxDefaults(config: StynxDefaultsConfig = {}): EnvironmentProviders {
  const providers: Array<Provider | EnvironmentProviders> = [
    ...(config.angular
      ? [provideStynxAngular(config.angular, config.tenancy)]
      : config.tenancy
        ? provideTenancy(config.tenancy)
        : []),
    ...featureProviders(config.auth),
    ...featureProviders(config.i18n),
    ...featureProviders(config.flow),
    ...featureProviders(config.iam),
    ...featureProviders(config.audit),
    ...featureProviders(config.ui),
  ];

  return makeEnvironmentProviders(providers);
}
