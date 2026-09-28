import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import {
  STYNX_I18N_OPTIONS,
  StynxI18nService,
  type StynxCatalog,
  type StynxI18nModuleOptions,
} from '@stynx-nyx/angular-i18n';

export function provideStynxI18nTesting(
  catalogs: Record<string, StynxCatalog>,
  defaultLocale?: string,
): EnvironmentProviders {
  const locales = Object.keys(catalogs);
  if (locales.length === 0) {
    throw new TypeError('At least one i18n testing catalog is required');
  }
  const selectedLocale = defaultLocale ?? locales[0]!;
  if (!Object.prototype.hasOwnProperty.call(catalogs, selectedLocale)) {
    throw new TypeError(`No i18n testing catalog is registered for ${selectedLocale}`);
  }
  const options: StynxI18nModuleOptions = {
    defaultLocale: selectedLocale,
    supportedLocales: locales,
    loadCatalog: async (locale) => {
      const catalog = catalogs[locale];
      if (!catalog) throw new RangeError(`Unsupported i18n testing locale: ${locale}`);
      return catalog;
    },
  };
  return makeEnvironmentProviders([
    { provide: STYNX_I18N_OPTIONS, useValue: options },
    StynxI18nService,
  ]);
}
