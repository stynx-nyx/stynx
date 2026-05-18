import '@angular/compiler';
import {
  LocaleSwitcherComponent,
  StynxI18nModule,
  StynxI18nService,
  StynxTranslatePipe,
} from '../../src';

describe('@stynx-web/angular-i18n consumer E2E', () => {
  it('exposes i18n module, service, pipe, and locale switcher', () => {
    expect(StynxI18nModule).toBeDefined();
    expect(StynxI18nService).toBeDefined();
    expect(StynxTranslatePipe).toBeDefined();
    expect(LocaleSwitcherComponent).toBeDefined();
  });
});
