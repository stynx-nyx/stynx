import '@angular/compiler';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { StynxI18nService } from '../src/i18n.service';
import {
  StynxIntlCurrencyPipe,
  StynxIntlDatePipe,
  StynxIntlNumberPipe,
} from '../src/intl.pipes';
import { LocaleSwitcherComponent } from '../src/locale-switcher.component';
import { STYNX_I18N_OPTIONS } from '../src/tokens';
import { StynxTranslatePipe } from '../src/translate.pipe';
import type { StynxI18nModuleOptions } from '../src/types';

function createI18nService(options: StynxI18nModuleOptions): StynxI18nService {
  const injector = Injector.create({
    providers: [{ provide: STYNX_I18N_OPTIONS, useValue: options }],
  });
  return runInInjectionContext(injector, () => new StynxI18nService());
}

describe('@stynx-nyx/angular-i18n', () => {
  it('switches locale at runtime and updates translations', async () => {
    const service = createI18nService({
      defaultLocale: 'en-US',
      supportedLocales: ['en-US', 'pt-BR'],
      loadCatalog: async (locale) =>
        locale === 'pt-BR'
          ? { greeting: 'Ola, {name}!' }
          : { greeting: 'Hello, {name}!' },
    });

    await service.initialize();
    expect(service.translate('greeting', { name: 'Ana' })).toBe('Hello, Ana!');

    await service.use('pt-BR');
    expect(service.locale()).toBe('pt-BR');
    expect(service.translate('greeting', { name: 'Ana' })).toBe('Ola, Ana!');
  });

  it('uses default supported locale and missing interpolation values', async () => {
    const service = createI18nService({
      defaultLocale: 'en-US',
      loadCatalog: async () => ({ greeting: 'Hello, {name}!' }),
    });

    expect(service.locale()).toBe('en-US');

    await service.initialize();

    expect(service.catalog()).toEqual({ greeting: 'Hello, {name}!' });
    expect(service.supportedLocales).toEqual(['en-US']);
    expect(service.translate('greeting')).toBe('Hello, !');
    expect(service.translate('missing.key')).toBe('missing.key');
  });

  it('formats ICU plural messages through the active locale catalog', async () => {
    const service = createI18nService({
      defaultLocale: 'en-US',
      supportedLocales: ['en-US', 'pt-BR'],
      loadCatalog: async (locale) =>
        locale === 'pt-BR'
          ? { tasks: 'Voce tem {count, plural, one {1 tarefa} other {# tarefas}}.' }
          : { tasks: 'You have {count, plural, one {1 task} other {# tasks}}.' },
    });

    await service.initialize();

    expect(service.translate('tasks', { count: 1 })).toBe('You have 1 task.');
    expect(service.translate('tasks', { count: 3 })).toBe('You have 3 tasks.');

    await service.use('pt-BR');

    expect(service.translate('tasks', { count: 1 })).toBe('Voce tem 1 tarefa.');
    expect(service.translate('tasks', { count: 3 })).toBe('Voce tem 3 tarefas.');
  });

  it('detects ICU messages with flexible whitespace around arguments and types', async () => {
    const service = createI18nService({
      defaultLocale: 'en-US',
      loadCatalog: async () => ({
        compact: '{count,plural,one {# compact task} other {# compact tasks}}',
        spaced: '{ count , plural , one {# spaced task} other {# spaced tasks}}',
      }),
    });

    await service.initialize();

    expect(service.translate('compact', { count: 2 })).toBe('2 compact tasks');
    expect(service.translate('spaced', { count: 1 })).toBe('1 spaced task');
    expect(service.translate('spaced', { count: 4 })).toBe('4 spaced tasks');
  });

  it('refreshes cached ICU formatters when a locale catalog is reloaded', async () => {
    let version = 0;
    const service = createI18nService({
      defaultLocale: 'en-US',
      loadCatalog: async () => {
        version += 1;
        return version === 1
          ? { tasks: '{count, plural, one {# open task} other {# open tasks}}' }
          : { tasks: '{count, plural, one {# closed task} other {# closed tasks}}' };
      },
    });

    await service.initialize();
    expect(service.translate('tasks', { count: 2 })).toBe('2 open tasks');

    await service.use('en-US');
    expect(service.translate('tasks', { count: 2 })).toBe('2 closed tasks');
  });

  it('uses cached ICU formatters until the catalog is reloaded', async () => {
    const service = createI18nService({
      defaultLocale: 'en-US',
      loadCatalog: async () => ({
        tasks: '{count, plural, one {# task} other {# tasks}}',
      }),
    });

    await service.initialize();
    expect(service.translate('tasks', { count: 2 })).toBe('2 tasks');

    const formatterCache = (service as unknown as {
      formatterCache: Map<string, { format: () => string }>;
    }).formatterCache;
    expect(formatterCache.size).toBe(1);
    formatterCache.set('en-US\u0000tasks', { format: () => 'cached formatter' });

    expect(service.translate('tasks', { count: 3 })).toBe('cached formatter');

    await service.use('en-US');
    expect(formatterCache.size).toBe(0);
    expect(service.translate('tasks', { count: 1 })).toBe('1 task');
  });

  it('switches locale through the component and marks the translate pipe for check on locale changes', async () => {
    const service = createI18nService({
      defaultLocale: 'en-US',
      supportedLocales: ['en-US', 'pt-BR'],
      loadCatalog: async (locale) =>
        locale === 'pt-BR'
          ? { greeting: 'Ola, {name}!' }
          : { greeting: 'Hello, {name}!' },
    });
    await service.initialize();

    const component = runInInjectionContext(
      Injector.create({ providers: [{ provide: StynxI18nService, useValue: service }] }),
      () => new LocaleSwitcherComponent(),
    );
    expect(component.locales).toEqual([]);
    component.locales = ['en-US', 'pt-BR'];
    await component.switchLocale('pt-BR');
    expect(service.locale()).toBe('pt-BR');
    expect(component.locales).toEqual(['en-US', 'pt-BR']);

    const markForCheck = vi.fn();
    const injector = Injector.create({
      providers: [
        { provide: StynxI18nService, useValue: service },
        { provide: ChangeDetectorRef, useValue: { markForCheck } },
      ],
    });
    const pipe = runInInjectionContext(injector, () => new StynxTranslatePipe());

    expect(pipe.transform('greeting', { name: 'Ana' })).toBe('Ola, Ana!');
    expect(pipe.transform('greeting', { name: 'Bia' })).toBe('Ola, Bia!');
    expect(markForCheck).not.toHaveBeenCalledTimes(1);
    await service.use('en-US');
    expect(pipe.transform('greeting', { name: 'Ana' })).toBe('Hello, Ana!');
    expect(markForCheck).toHaveBeenCalledTimes(1);
  });

  it('formats dates, numbers, and currencies through the active locale', async () => {
    const service = createI18nService({
      defaultLocale: 'en-US',
      supportedLocales: ['en-US', 'pt-BR'],
      loadCatalog: async () => ({}),
    });
    await service.initialize();

    const markForCheck = vi.fn();
    const injector = Injector.create({
      providers: [
        { provide: StynxI18nService, useValue: service },
        { provide: ChangeDetectorRef, useValue: { markForCheck } },
      ],
    });
    const datePipe = runInInjectionContext(injector, () => new StynxIntlDatePipe());
    const numberPipe = runInInjectionContext(injector, () => new StynxIntlNumberPipe());
    const currencyPipe = runInInjectionContext(injector, () => new StynxIntlCurrencyPipe());
    const date = new Date(Date.UTC(2026, 4, 19, 12));
    const dateOptions: Intl.DateTimeFormatOptions = {
      month: 'short',
      timeZone: 'UTC',
      year: 'numeric',
    };

    expect(datePipe.transform(date, dateOptions)).toBe(
      new Intl.DateTimeFormat('en-US', dateOptions).format(date),
    );
    expect(numberPipe.transform(1234.5, { maximumFractionDigits: 1 })).toBe(
      new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(1234.5),
    );
    expect(currencyPipe.transform(1234.5, 'BRL')).toBe(
      new Intl.NumberFormat('en-US', { currency: 'BRL', style: 'currency' }).format(1234.5),
    );
    expect(currencyPipe.transform(1)).toBe(
      new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(1),
    );
    expect(markForCheck).not.toHaveBeenCalledTimes(1);

    await service.use('pt-BR');

    expect(datePipe.transform(date, dateOptions)).toBe(
      new Intl.DateTimeFormat('pt-BR', dateOptions).format(date),
    );
    expect(numberPipe.transform(1234.5, { maximumFractionDigits: 1 })).toBe(
      new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(1234.5),
    );
    expect(currencyPipe.transform(1234.5, 'BRL')).toBe(
      new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(1234.5),
    );
    expect(markForCheck).toHaveBeenCalledTimes(3);
  });

  it('returns an empty string for empty and invalid Intl pipe inputs', async () => {
    const service = createI18nService({
      defaultLocale: 'en-US',
      loadCatalog: async () => ({}),
    });
    await service.initialize();

    const injector = Injector.create({
      providers: [
        { provide: StynxI18nService, useValue: service },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } },
      ],
    });
    const datePipe = runInInjectionContext(injector, () => new StynxIntlDatePipe());
    const numberPipe = runInInjectionContext(injector, () => new StynxIntlNumberPipe());
    const currencyPipe = runInInjectionContext(injector, () => new StynxIntlCurrencyPipe());

    expect(datePipe.transform(undefined)).toBe('');
    expect(datePipe.transform('')).toBe('');
    expect(datePipe.transform(null)).toBe('');
    expect(datePipe.transform('not-a-date')).toBe('');
    expect(numberPipe.transform(null)).toBe('');
    expect(numberPipe.transform(undefined)).toBe('');
    expect(numberPipe.transform('')).toBe('');
    expect(numberPipe.transform('not-a-number')).toBe('');
    expect(currencyPipe.transform(null, 'USD')).toBe('');
    expect(currencyPipe.transform('', 'USD')).toBe('');
    expect(currencyPipe.transform('not-a-number', 'USD')).toBe('');
  });

  it('caches Intl formatters by locale and options', async () => {
    const service = createI18nService({
      defaultLocale: 'en-US',
      loadCatalog: async () => ({}),
    });
    await service.initialize();

    const originalDateTimeFormat = Intl.DateTimeFormat;
    const originalNumberFormat = Intl.NumberFormat;
    const dateConstructors: string[] = [];
    const numberConstructors: string[] = [];
    Object.defineProperty(Intl, 'DateTimeFormat', {
      configurable: true,
      value: function DateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions) {
        dateConstructors.push(`${locale}:${JSON.stringify(options)}`);
        return new originalDateTimeFormat(locale, options);
      },
    });
    Object.defineProperty(Intl, 'NumberFormat', {
      configurable: true,
      value: function NumberFormat(locale: string, options: Intl.NumberFormatOptions) {
        numberConstructors.push(`${locale}:${JSON.stringify(options)}`);
        return new originalNumberFormat(locale, options);
      },
    });

    try {
      const injector = Injector.create({
        providers: [
          { provide: StynxI18nService, useValue: service },
          { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } },
        ],
      });
      const datePipe = runInInjectionContext(injector, () => new StynxIntlDatePipe());
      const numberPipe = runInInjectionContext(injector, () => new StynxIntlNumberPipe());
      const currencyPipe = runInInjectionContext(injector, () => new StynxIntlCurrencyPipe());
      const date = new Date(Date.UTC(2026, 4, 19, 12));
      const dateOptions: Intl.DateTimeFormatOptions = { month: 'short', timeZone: 'UTC' };
      const numberOptions: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

      datePipe.transform(date, dateOptions);
      datePipe.transform(date, dateOptions);
      datePipe.transform(date, { ...dateOptions, year: 'numeric' });
      numberPipe.transform(1.23, numberOptions);
      numberPipe.transform(4.56, numberOptions);
      currencyPipe.transform(7.89, 'USD');
      currencyPipe.transform(8.9, 'USD');

      expect(dateConstructors).toHaveLength(2);
      expect(numberConstructors).toHaveLength(2);
    } finally {
      Object.defineProperty(Intl, 'DateTimeFormat', {
        configurable: true,
        value: originalDateTimeFormat,
      });
      Object.defineProperty(Intl, 'NumberFormat', {
        configurable: true,
        value: originalNumberFormat,
      });
    }
  });
});
