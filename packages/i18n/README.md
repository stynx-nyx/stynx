# `@stynx-nyx/i18n` — server-side translation, locale resolution, ICU MessageFormat

`@stynx-nyx/i18n` is STYNX's server-side internationalization substrate. It resolves the request's locale (from header / actor preference / fallback chain), looks up translations from a catalog, formats them with ICU MessageFormat (plurals, gender, nested), and translates error envelopes so `StynxError` responses come back in the caller's language. Paired with [`@stynx-web/angular-i18n`](/docs/packages-web/angular-i18n/) for the frontend.

## Purpose

Multi-locale apps need consistent server-side translation: localized error messages, localized notification text, locale resolved per request rather than per deployment. Doing this ad-hoc means error messages leak in the wrong language. `@stynx-nyx/i18n` centralises catalog lookup + locale resolution + ICU formatting.

You reach for it whenever your app serves users in more than one language, or when you need localized error envelopes.

What it does NOT do: it doesn't translate your frontend templates (that's `@stynx-web/angular-i18n`). It doesn't auto-translate (no machine translation — you author catalogs). It doesn't handle RTL layout (presentation concern).

## Audience

Backend developers building multi-locale apps.

## Install

```bash
pnpm add @stynx-nyx/i18n
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx-nyx/core` `^1`, `intl-messageformat` `^10`.

## Quick start

```ts
import { StynxI18nModule } from '@stynx-nyx/i18n';

StynxI18nModule.forRoot({
  defaultLocale: 'pt-BR',
  fallbackChain: ['pt-BR', 'en'],
  catalogSource: { kind: 'package', path: './catalogs' },
});
```

```ts
import { TranslationService } from '@stynx-nyx/i18n';

@Injectable()
export class NotificationService {
  constructor(private readonly t: TranslationService) {}

  async notify(userId: string, count: number) {
    // ICU plural: "{count, plural, one {# message} other {# messages}}"
    const text = await this.t.translate('inbox.summary', { count });
    // ... send
  }
}
```

## Public API surface

### Modules

| Export            | Signature                             | Description                                                                    |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| `StynxI18nModule` | `.forRoot(options: StynxI18nOptions)` | Registers catalog service, locale resolver, error translator, admin endpoints. |

### Services / Injectables

| Export                                  | Description                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `TranslationService` (`CatalogService`) | `translate(key, params?)` — look up + ICU-format a message in the request's locale.          |
| `LocaleService`                         | Resolve / read the active locale.                                                            |
| `LocaleInterceptor`                     | Resolves the request's locale and writes it to `RequestContext`.                             |
| `ErrorTranslatorService`                | Translates a `StynxError`'s `messageKey` into the caller's locale for the response envelope. |
| `I18nAdminService`                      | Catalog management (used by the admin controller).                                           |

### Endpoints (1 controller)

| Method | Path    | Auth                  | Description                              |
| ------ | ------- | --------------------- | ---------------------------------------- |
| `GET`  | `/i18n` | bearer + `i18n:read`  | Fetch the catalog (or a locale's slice). |
| `PUT`  | `/i18n` | bearer + `i18n:write` | Update catalog entries (admin).          |

### Types / Interfaces

| Export             | Description                                                |
| ------------------ | ---------------------------------------------------------- |
| `StynxI18nOptions` | `forRoot()` options.                                       |
| `CatalogSource`    | `{ kind: 'package' \| 'http' \| 'inline'; ... }`.          |
| `LocaleResolution` | How the locale was determined (header / actor / fallback). |

## Configuration

| Option          | Type                                 | Default               | Description                                                  |
| --------------- | ------------------------------------ | --------------------- | ------------------------------------------------------------ |
| `defaultLocale` | `string`                             | `'en'`                | Used when no locale resolves.                                |
| `fallbackChain` | `string[]`                           | `[defaultLocale]`     | Resolution order when a key is missing in the active locale. |
| `catalogSource` | `CatalogSource`                      | inline empty          | Where catalogs load from.                                    |
| `localeSources` | `('header' \| 'actor' \| 'query')[]` | `['header', 'actor']` | Where the active locale comes from, in priority order.       |

## Examples

### Example 1 — localized error envelope

```ts
throw new StynxError('Order not found', {
  code: 'ORDER_NOT_FOUND',
  status: 404,
  messageKey: 'errors.order.notFound',
});
// ErrorTranslatorService renders messageKey in the caller's locale on the way out
```

### Example 2 — ICU plural

```json
// catalogs/pt-BR.json
{ "inbox.summary": "{count, plural, one {# mensagem} other {# mensagens}}" }
```

```ts
await this.t.translate('inbox.summary', { count: 3 });
// → "3 mensagens"
```

### Example 3 — package-catalog source per ADR-FE-ICU-i18n-0002

```ts
StynxI18nModule.forRoot({
  catalogSource: { kind: 'package', path: './catalogs' },
  fallbackChain: ['pt-BR', 'en'],
});
```

## Common pitfalls

- **Missing key with no fallback** — `translate()` returns the key itself (not an error). Audit your catalogs for completeness; consider a CI gate.
- **ICU syntax error in a catalog** — fails at format time (runtime), not load time. Validate catalogs in CI.
- **Locale not resolved** — header missing + no actor preference → `defaultLocale`. If users see English unexpectedly, check the locale source order.

## Related packages

- [`@stynx-nyx/core`](/docs/packages/core/) — provides `RequestContext` where the resolved locale is written.
- [`@stynx-web/angular-i18n`](/docs/packages-web/angular-i18n/) — the Angular pair: ICU in templates + catalog loader.
- [STYNX framework — ADR-FE-ICU-i18n-0002](/docs/meta/adr/ADR-FE-ICU-i18n-0002-package-catalogs-and-icu/) — the catalog + ICU decision.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-i18n/`](/docs/api-reference/stynx-i18n/)
