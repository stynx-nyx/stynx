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

describe('@stynx-web/angular-i18n', () => {
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
    expect(markForCheck).not.toHaveBeenCalled();

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
    expect(datePipe.transform('not-a-date')).toBe('');
    expect(numberPipe.transform(null)).toBe('');
    expect(numberPipe.transform(undefined)).toBe('');
    expect(numberPipe.transform('')).toBe('');
    expect(numberPipe.transform('not-a-number')).toBe('');
    expect(currencyPipe.transform(null, 'USD')).toBe('');
    expect(currencyPipe.transform('', 'USD')).toBe('');
    expect(currencyPipe.transform('not-a-number', 'USD')).toBe('');
  });
});
