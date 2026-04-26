import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';
import { StynxAngularModule } from '@stynx-web/angular';
import { StynxAngularAuthModule, STYNX_AUTH_BACKEND, STYNX_OIDC_ADAPTER } from '@stynx-web/angular-auth';
import { StynxI18nModule } from '@stynx-web/angular-i18n';
import { DocumentService, STYNX_UPLOAD_EXECUTOR, XhrUploadExecutor } from '@stynx-web/angular-storage';
import { AppComponent } from './app.component';
import { APP_ROUTES } from './app.routes';
import { ReferenceWebApiService } from './core/reference-web-api.service';
import { ReferenceWebDevAuthBackend } from './core/reference-web-dev-auth.backend';
import { ReferenceWebDevOidcAdapter } from './core/reference-web-dev-oidc.adapter';
import { ReferenceWebI18nService } from './core/reference-web-i18n.service';
import { ReferenceWebShellService } from './core/reference-web-shell.service';
import { environment } from '../environments/environment';

function initializeShell(shell: ReferenceWebShellService): () => Promise<void> {
  return () => shell.initialize();
}

@NgModule({
  imports: [
    BrowserModule,
    RouterModule.forRoot(APP_ROUTES),
    AppComponent,
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
  ],
  providers: [
    ReferenceWebApiService,
    ReferenceWebDevOidcAdapter,
    ReferenceWebDevAuthBackend,
    ReferenceWebI18nService,
    ReferenceWebShellService,
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
  bootstrap: [AppComponent],
})
export class ReferenceWebModule {}
