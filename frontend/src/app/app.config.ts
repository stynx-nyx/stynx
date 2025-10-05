import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
  withFetch,
} from '@angular/common/http';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { routes } from './app.routes';
import { authInterceptor } from '@core/auth/auth.interceptor';

export function httpLoaderFactory(http: HttpClient): TranslateLoader {
  return new TranslateHttpLoader(http, '/assets/i18n/', '.json');
}

const initI18n = (service: I18nService) => () => service.init();

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    provideRouter(routes, withEnabledBlockingInitialNavigation()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    importProvidersFrom(
      TranslateModule.forRoot({
        defaultLanguage: "en",
        loader: { provide: TranslateLoader, useFactory: httpLoaderFactory, deps: [HttpClient] },
      }),
    ),
    { provide: APP_INITIALIZER, useFactory: initI18n, deps: [I18nService], multi: true },
  ],
};
