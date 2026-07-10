import '@angular/compiler';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { StynxI18nService } from '../src/i18n.service';
import { LocaleSwitcherComponent } from '../src/locale-switcher.component';
import { STYNX_I18N_OPTIONS } from '../src/tokens';
import { StynxTranslatePipe } from '../src/translate.pipe';
import { renderComponent } from './support/test-bed';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StynxTranslatePipe],
  template: `<p data-testid="message">{{ 'inbox.summary' | stynxTranslate: { count: count, gender: gender } }}</p>`,
})
class TranslationHostComponent {
  count = 3;
  gender = 'female';
}

const catalogs = {
  'en-US': {
    'i18n.localeSwitcher.label': 'Locale',
    'inbox.summary': '{gender, select, female {{count, plural, one {She has one message} other {She has # messages}}} other {{count, plural, one {They have one message} other {They have # messages}}}}',
  },
  'pt-BR': {
    'i18n.localeSwitcher.label': 'Idioma',
    'inbox.summary': '{count, plural, one {Uma mensagem} other {# mensagens}}',
  },
};

function i18nProviders() {
  return [
    {
      provide: STYNX_I18N_OPTIONS,
      useValue: {
        defaultLocale: 'en-US',
        loadCatalog: async (locale: 'en-US' | 'pt-BR') => catalogs[locale],
        supportedLocales: ['en-US', 'pt-BR'],
      },
    },
    StynxI18nService,
  ];
}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-nyx/angular-i18n rendering depth', () => {
  it('renders ICU select/plural output and propagates locale switches to the DOM', async () => {
    TestBed.configureTestingModule({ providers: i18nProviders() });
    const service = TestBed.inject(StynxI18nService);
    await service.initialize();

    const fixture = await renderComponent(TranslationHostComponent, {
      providers: [{ provide: StynxI18nService, useValue: service }],
    });
    expect(service.translate('inbox.summary', { count: 1, gender: 'female' })).toBe('She has one message');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('She has 3 messages');

    await service.use('pt-BR');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('3 mensagens');
  });

  it('drives locale switcher changes and falls back to missing keys', async () => {
    TestBed.configureTestingModule({ providers: i18nProviders() });
    const service = TestBed.inject(StynxI18nService);
    await service.initialize();

    const fixture = await renderComponent(LocaleSwitcherComponent, {
      inputs: { locales: ['en-US', 'pt-BR'] },
      providers: [{ provide: StynxI18nService, useValue: service }],
    });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Locale');
    expect(Array.from(host.querySelectorAll('option')).map((option) => option.value)).toEqual([
      'en-US',
      'pt-BR',
    ]);

    const select = host.querySelector<HTMLSelectElement>('[data-testid="locale-switcher-select"]');
    expect(select?.value).toBe('en-US');
    select!.value = 'pt-BR';
    select!.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.locale()).toBe('pt-BR');
    expect(host.textContent).toContain('Idioma');
    expect(service.translate('missing.key')).toBe('missing.key');
  });
});
