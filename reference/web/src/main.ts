import '@angular/compiler';
import 'zone.js';
import { APP_INITIALIZER, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { StynxAngularModule } from '@stynx-web/angular';
import { STYNX_AUTH_BACKEND, STYNX_OIDC_ADAPTER, StynxAngularAuthModule } from '@stynx-web/angular-auth';
import { StynxI18nModule } from '@stynx-web/angular-i18n';
import { DocumentService, STYNX_UPLOAD_EXECUTOR, XhrUploadExecutor } from '@stynx-web/angular-storage';
import { environment } from './environments/environment';
import { AppComponent } from './app/app.component';
import { APP_ROUTES } from './app/app.routes';
import { ReferenceWebApiService } from './app/core/reference-web-api.service';
import { provideReferenceFlowClient } from './app/core/reference-flow-client.provider';
import { ReferenceWebDevAuthBackend } from './app/core/reference-web-dev-auth.backend';
import { ReferenceWebDevOidcAdapter } from './app/core/reference-web-dev-oidc.adapter';
import { ReferenceWebI18nService } from './app/core/reference-web-i18n.service';
import { ReferenceWebShellService } from './app/core/reference-web-shell.service';

function initializeShell(shell: ReferenceWebShellService): () => Promise<void> {
  return () => shell.initialize();
}

void bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(APP_ROUTES),
    importProvidersFrom(
      StynxAngularModule.forRoot({
        apiBaseUrl: environment.apiBaseUrl,
        sessionMode: 'bearer',
        defaultTenantResolver: async () => '01978f4a-32bf-7c27-a131-fd73a9e001a1',
      }),
      StynxAngularAuthModule.forRoot({
        oidc: {
          authority: environment.apiBaseUrl,
          clientId: 'reference-web-dev',
          redirectUrl: `${environment.appBaseUrl}/login`,
          postLogoutRedirectUri: `${environment.appBaseUrl}/login`,
          scope: 'openid profile email',
          responseType: 'code',
          silentRenew: false,
          useRefreshToken: false,
          ignoreNonceAfterRefresh: true,
          secureRoutes: [environment.apiBaseUrl],
        },
        loginRedirectRoute: '/login',
        unauthorizedRoute: '/unauthorized',
      }),
      StynxI18nModule.forRoot({
        defaultLocale: 'en-US',
        supportedLocales: ['en-US', 'pt-BR'],
        loadCatalog: async (locale: string) => ReferenceWebI18nService.catalog(locale),
      }),
    ),
    ReferenceWebApiService,
    ReferenceWebDevOidcAdapter,
    ReferenceWebDevAuthBackend,
    ReferenceWebI18nService,
    ReferenceWebShellService,
    provideReferenceFlowClient(),
    DocumentService,
    XhrUploadExecutor,
    {
      provide: STYNX_OIDC_ADAPTER,
      useExisting: ReferenceWebDevOidcAdapter,
    },
    {
      provide: STYNX_AUTH_BACKEND,
      useExisting: ReferenceWebDevAuthBackend,
    },
    {
      provide: STYNX_UPLOAD_EXECUTOR,
      useExisting: XhrUploadExecutor,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeShell,
      deps: [ReferenceWebShellService],
      multi: true,
    },
  ],
}).catch((error: unknown) => {
  console.error('Failed to bootstrap reference web', error);
});
