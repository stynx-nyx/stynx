import '@angular/compiler';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { StynxI18nService } from '../src/i18n.service';
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
});
