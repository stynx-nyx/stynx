import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import { provideStynxI18nTesting } from '@stynx-nyx/angular-i18n/testing';

describe('@stynx-nyx/angular-i18n/testing', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('provides the real service without app bootstrap and exposes explicit initialization', async () => {
    const catalogs = {
      en: { greeting: 'Hello, {name}', missingFallback: 'Fallback' },
      'pt-BR': { greeting: 'Olá, {name}', missingFallback: 'Alternativa' },
    };
    TestBed.configureTestingModule({
      providers: [provideStynxI18nTesting(catalogs)],
    });
    const service = TestBed.inject(StynxI18nService);

    expect(service.locale()).toBe('en');
    await service.initialize();
    expect(service.translate('greeting', { name: 'Ana' })).toBe('Hello, Ana');
    await service.use('pt-BR');
    expect(service.translate('greeting', { name: 'Ana' })).toBe('Olá, Ana');
    expect(service.translate('unknown.key')).toBe('unknown.key');
  });

  it('uses an explicitly selected default locale and rejects empty catalogs', async () => {
    TestBed.configureTestingModule({
      providers: [provideStynxI18nTesting({ en: { label: 'English' }, 'pt-BR': { label: 'Português' } }, 'pt-BR')],
    });
    const service = TestBed.inject(StynxI18nService);
    await service.initialize();
    expect(service.locale()).toBe('pt-BR');
    expect(service.translate('label')).toBe('Português');

    expect(() => provideStynxI18nTesting({})).toThrow();
  });
});
