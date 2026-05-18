import '@angular/compiler';
import { StynxI18nService } from '../src/i18n.service';

describe('@stynx-web/angular-i18n', () => {
  it('switches locale at runtime and updates translations', async () => {
    const service = new StynxI18nService({
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
    const service = new StynxI18nService({
      defaultLocale: 'en-US',
      loadCatalog: async () => ({ greeting: 'Hello, {name}!' }),
    });

    await service.initialize();

    expect(service.catalog()).toEqual({ greeting: 'Hello, {name}!' });
    expect(service.supportedLocales).toEqual(['en-US']);
    expect(service.translate('greeting')).toBe('Hello, !');
    expect(service.translate('missing.key')).toBe('missing.key');
  });
});
