# `@stynx-web/angular-i18n` — Angular i18n: translate pipe, ICU pipes, locale switcher

`@stynx-web/angular-i18n` is the Angular-side internationalization package. It provides a `translate` pipe for template translation, ICU MessageFormat pipes (plural / number / date), a locale-switcher component, and an `I18nService` that loads catalogs and resolves the active locale. Pairs with the backend's [`@stynx/i18n`](/docs/packages/i18n/) so frontend + backend share the same locale + catalog conventions per ADR-FE-ICU-i18n-0002.

## Purpose

Angular apps need template translation with ICU formatting (plurals, dates, numbers per locale), runtime locale switching, and catalog loading. Angular's built-in i18n is compile-time; STYNX apps often need runtime locale changes. `@stynx-web/angular-i18n` provides runtime translation aligned with the backend catalogs.

You reach for it whenever your STYNX frontend serves more than one language.

What it does NOT do: it doesn't replace Angular's `$localize` for compile-time strings (you can use both). It doesn't machine-translate.

## Audience

Angular frontend developers building multi-locale UIs.

## Install

```bash
pnpm add @stynx-web/angular-i18n
```

**Peer dependencies:** `@angular/core` `^18`, `@stynx-web/angular` `^1`, `intl-messageformat` `^10`.

## Quick start

```ts
import { StynxI18nModule } from '@stynx-web/angular-i18n';

// NgModule path
@NgModule({ imports: [StynxI18nModule.forRoot({ defaultLocale: 'pt-BR', catalogs })] })
export class AppModule {}
```

```html
<!-- Template usage -->
<h1>{{ 'home.title' | translate }}</h1>
<p>{{ 'inbox.count' | translate:{ count: messages.length } }}</p>
```

## Public API surface

### Module

| Export            | Signature                            | Description                                         |
| ----------------- | ------------------------------------ | --------------------------------------------------- |
| `StynxI18nModule` | `.forRoot(options: StynxI18nConfig)` | Registers the i18n service, pipes, locale switcher. |

### Pipes

| Pipe         | Usage                             | Description                                                  |
| ------------ | --------------------------------- | ------------------------------------------------------------ |
| `translate`  | `{{ key \| translate:params }}`   | Look up + ICU-format a translation key in the active locale. |
| `intlNumber` | `{{ value \| intlNumber }}`       | Locale-aware number formatting.                              |
| `intlDate`   | `{{ date \| intlDate:format }}`   | Locale-aware date formatting.                                |
| `intlPlural` | `{{ count \| intlPlural:forms }}` | ICU plural selection.                                        |

### Components

| Selector                  | Component                 | Description                                      |
| ------------------------- | ------------------------- | ------------------------------------------------ |
| `<stynx-locale-switcher>` | `LocaleSwitcherComponent` | Dropdown to change the active locale at runtime. |

### Services

| Export        | Description                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `I18nService` | `translate(key, params)`, `setLocale(locale)`, `currentLocale` signal. Programmatic translation + locale control. |

### Types

| Export            | Description                 |
| ----------------- | --------------------------- |
| `StynxI18nConfig` | `forRoot()` config.         |
| `Catalog`         | A locale's translation map. |

## Configuration

| Option          | Type                           | Default           | Description                                   |
| --------------- | ------------------------------ | ----------------- | --------------------------------------------- |
| `defaultLocale` | `string`                       | `'en'`            | Initial locale.                               |
| `fallbackChain` | `string[]`                     | `[defaultLocale]` | Missing-key fallback order.                   |
| `catalogs`      | `Record<locale, Catalog>`      | `{}`              | Inline catalogs, or load via `catalogLoader`. |
| `catalogLoader` | `(locale) => Promise<Catalog>` | none              | Lazy catalog loader (HTTP / package).         |

## Examples

### Example 1 — runtime locale switch

```html
<stynx-locale-switcher [locales]="['en', 'pt-BR', 'es']" />
```

### Example 2 — ICU plural in a template

```html
<!-- catalog: "inbox.count": "{count, plural, one {# message} other {# messages}}" -->
{{ 'inbox.count' | translate:{ count: 3 } }}
<!-- → "3 messages" -->
```

### Example 3 — programmatic translation

```ts
import { I18nService } from '@stynx-web/angular-i18n';

@Component({
  /* ... */
})
export class Notifier {
  private readonly i18n = inject(I18nService);
  notify() {
    const msg = this.i18n.translate('toast.saved');
    // ...
  }
}
```

## Common pitfalls

- **Missing key renders the key** — `'home.title' | translate` shows `home.title` literally if the key is absent. Audit catalogs for completeness.
- **ICU syntax error** — surfaces at render time, not load time. Validate catalogs in CI.
- **Locale switch not propagating to the backend** — switching the frontend locale doesn't change the backend's `Accept-Language`. Wire the `I18nService` locale into `@stynx-web/angular`'s header interceptor if you need backend error messages localized too.

## Related packages

- [`@stynx-web/angular`](/docs/packages-web/angular/) — the foundation.
- [`@stynx/i18n`](/docs/packages/i18n/) — the backend counterpart; shares catalog conventions.
- [STYNX framework — ADR-FE-ICU-i18n-0002](/docs/meta/adr/ADR-FE-ICU-i18n-0002-package-catalogs-and-icu/) — the catalog + ICU decision.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-i18n/`](/docs/api-reference/stynx-web-angular-i18n/)
