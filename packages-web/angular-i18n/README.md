# @stynx-web/angular-i18n

Angular 20 runtime internationalization for STYNX apps. It loads catalogs, tracks the active locale, renders translations, and exposes locale-aware date, number, and currency pipes.

## Install

```bash
pnpm add @stynx-web/angular-i18n
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`

## Use

```ts
import { importProvidersFrom } from '@angular/core';
import { provideStynxDefaults } from '@stynx-web/angular';
import { StynxI18nModule } from '@stynx-web/angular-i18n';

bootstrapApplication(AppComponent, {
  providers: [
    provideStynxDefaults({
      i18n: importProvidersFrom(
        StynxI18nModule.forRoot({
          defaultLocale: 'en-US',
          supportedLocales: ['en-US', 'pt-BR'],
          loadCatalog: (locale) => fetch(`/assets/i18n/${locale}.json`).then((r) => r.json()),
        }),
      ),
    }),
  ],
});
```

## Public Surface

- Module/service: `StynxI18nModule`, `StynxI18nService`.
- Components/pipes: `LocaleSwitcherComponent`, `StynxTranslatePipe`, `StynxIntlDatePipe`, `StynxIntlNumberPipe`, `StynxIntlCurrencyPipe`.
- Tokens/types: `STYNX_I18N_OPTIONS`, catalog and module option types.
- Secondary exports: `@stynx-web/angular-i18n/testing`, locale catalogs.

## See Also

- [`@stynx-web/angular`](../angular/README.md)
- [`@stynx-web/angular-ui`](../angular-ui/README.md)
- [Reference app dashboard demo](../../reference/web/README.md#demo-surfaces)
