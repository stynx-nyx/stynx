import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { STYNX_ERROR_TRANSLATOR } from '@stynx/core';
import { CatalogService } from './catalog.service';
import { ErrorTranslatorService } from './error-translator.service';
import { I18nAdminService } from './i18n-admin.service';
import { I18nController } from './i18n.controller';
import { LocalizedErrorFilter } from './localized-error.filter';
import { LocaleInterceptor } from './locale.interceptor';
import { LocaleService } from './locale.service';
import { STYNX_I18N_OPTIONS } from './tokens';
import type { StynxI18nModuleOptions } from './types';

@Module({})
export class StynxI18nModule {
  static forRoot(options: StynxI18nModuleOptions = {}): DynamicModule {
    return {
      module: StynxI18nModule,
      controllers: [I18nController],
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
