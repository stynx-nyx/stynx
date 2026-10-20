import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { STYNX_ERROR_TRANSLATOR } from '@stynx-nyx/core';
import { CatalogService } from './catalog.service.js';
import { ErrorTranslatorService } from './error-translator.service.js';
import { I18nAdminService } from './i18n-admin.service.js';
import { I18nController } from './i18n.controller.js';
import { LocalizedErrorFilter } from './localized-error.filter.js';
import { LocaleInterceptor } from './locale.interceptor.js';
import { LocaleService } from './locale.service.js';
import { STYNX_I18N_OPTIONS } from './tokens.js';
import type { StynxI18nModuleOptions } from './types.js';

@Module({ controllers: [I18nController] })
export class StynxI18nModule {
  static forRoot(options: StynxI18nModuleOptions = {}): DynamicModule {
    return {
      module: StynxI18nModule,
      providers: [
        {
          provide: STYNX_I18N_OPTIONS,
          useValue: options,
        },
        CatalogService,
        LocaleService,
        ErrorTranslatorService,
        I18nAdminService,
        {
          provide: STYNX_ERROR_TRANSLATOR,
          useExisting: ErrorTranslatorService,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: LocaleInterceptor,
        },
        {
          provide: APP_FILTER,
          useClass: LocalizedErrorFilter,
        },
      ],
      exports: [
        STYNX_I18N_OPTIONS,
        CatalogService,
        LocaleService,
        ErrorTranslatorService,
        I18nAdminService,
      ],
    };
  }
}
