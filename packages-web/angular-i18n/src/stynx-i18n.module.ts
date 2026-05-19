import { APP_INITIALIZER, NgModule } from '@angular/core';
import type { ModuleWithProviders } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocaleSwitcherComponent } from './locale-switcher.component';
import { StynxI18nService } from './i18n.service';
import { StynxIntlCurrencyPipe, StynxIntlDatePipe, StynxIntlNumberPipe } from './intl.pipes';
import { STYNX_I18N_OPTIONS } from './tokens';
import type { StynxI18nModuleOptions } from './types';

function initializeI18n(service: StynxI18nService): () => Promise<void> {
  return () => service.initialize();
}

@NgModule({
  imports: [
    CommonModule,
    LocaleSwitcherComponent,
    StynxIntlCurrencyPipe,
    StynxIntlDatePipe,
    StynxIntlNumberPipe,
  ],
  exports: [
    LocaleSwitcherComponent,
    StynxIntlCurrencyPipe,
    StynxIntlDatePipe,
    StynxIntlNumberPipe,
  ],
})
export class StynxI18nModule {
  static forRoot(options: StynxI18nModuleOptions): ModuleWithProviders<StynxI18nModule> {
    return {
      ngModule: StynxI18nModule,
      providers: [
        {
          provide: STYNX_I18N_OPTIONS,
          useValue: options,
        },
        StynxI18nService,
        {
          provide: APP_INITIALIZER,
          useFactory: initializeI18n,
          deps: [StynxI18nService],
          multi: true,
        },
      ],
    };
  }
}
