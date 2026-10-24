# `@stynx-nyx/i18n` — server-side translation, locale resolution, ICU MessageFormat

`@stynx-nyx/i18n` is STYNX's server-side internationalization substrate. It resolves the request's locale (from header / actor preference / fallback chain), looks up translations from a catalog, formats them with ICU MessageFormat (plurals, gender, nested), and translates error envelopes so `StynxError` responses come back in the caller's language. Paired with [`@stynx-nyx/angular-i18n`](/docs/packages-web/angular-i18n/) for the frontend.

## Purpose

Multi-locale apps need consistent server-side translation: localized error messages, localized notification text, locale resolved per request rather than per deployment. Doing this ad-hoc means error messages leak in the wrong language. `@stynx-nyx/i18n` centralises catalog lookup + locale resolution + ICU formatting.

You reach for it whenever your app serves users in more than one language, or when you need localized error envelopes.

What it does NOT do: it doesn't translate your frontend templates (that's `@stynx-nyx/angular-i18n`). It doesn't auto-translate (no machine translation — you author catalogs). It doesn't handle RTL layout (presentation concern).

## Audience

Backend developers building multi-locale apps.

## Install

```bash
pnpm add @stynx-nyx/i18n
```

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference).

## Quick start

```ts
import { StynxI18nModule } from '@stynx-nyx/i18n';

StynxI18nModule.forRoot({
  // Default locale is en-US; opt in to pt-BR explicitly.
  defaultLocale: 'pt-BR',
});

// A feature module registers its own catalog; nothing scans the filesystem.
@Injectable()
export class NotesI18n implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}
  onModuleInit() {
    const catalog = this.moduleRef.get(CatalogService, { strict: false });
    catalog.registerCatalog('en-US', { 'notes.missing': 'Note not found.' });
    catalog.registerCatalog('pt-BR', { 'notes.missing': 'Nota não encontrada.' });
  }
}
```

```ts
import { LocaleService } from '@stynx-nyx/i18n';

@Injectable()
export class NotificationService {
  constructor(private readonly locale: LocaleService) {}

  async notify(userId: string, count: number) {
    // ICU plural: "{count, plural, one {# message} other {# messages}}"
    const text = this.locale.t('inbox.summary', { count });
    // ... send
  }
}
```

## Public API surface

### Modules

| Export            | Signature                                    | Description                                                                              |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `StynxI18nModule` | `.forRoot(options?: StynxI18nModuleOptions)` | Registers catalog service, locale resolver, error translator, protected admin endpoints. |

### Services / Injectables

| Export                   | Description                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CatalogService`         | `translate(key, locale, vars?, tenantId?)` — synchronously look up and ICU-format a message; `registerCatalog(locale, messages)`; `defaultLocale()`.                                                                     |
| `LocaleService`          | Resolve / read the active locale.                                                                                                                                                                                        |
| `LocaleInterceptor`      | Resolves the request's locale and writes it to `RequestContext`.                                                                                                                                                         |
| `ErrorTranslatorService` | Translates a `StynxError`'s `messageKey` into the caller's locale for the response envelope.                                                                                                                             |
| `I18nAdminService`       | `listTenantOverrides` / `updateTenantOverrides` use admitted tenant/actor context and restricted reader/app transactions. Existing `listOverrides` / `updateOverrides` require an already active internal SystemContext. |

### Endpoints (1 controller)

| Method | Path                       | Auth                  | Description                                                       |
| ------ | -------------------------- | --------------------- | ----------------------------------------------------------------- |
| `GET`  | `/_tenancy/i18n/overrides` | bearer + `i18n:read`  | Read the admitted tenant's override entries.                      |
| `PUT`  | `/_tenancy/i18n/overrides` | bearer + `i18n:write` | Merge `{ locale, catalog }` into the admitted tenant's overrides. |

Install the normal STYNX authentication and actor-context pipeline and grant the
explicit permissions through tenant role bindings. Administration uses the
verified request tenant and audit actor. Supplied tenant mismatches are refused
before cache access or SQL. Tenant SQL uses independent transactions and refuses
an existing held transaction; cache updates become visible after actual commit.
Internal administration requires the caller to establish SystemContext first
outside HTTP processing and to supply a compatible active tenant frame, if any.
Public bootstrap locale resolution uses header/catalog/default fallback without
tenant-specific SQL or cached overrides until the canonical tenancy proof port
reports verified or protected admission for the actual request and matching actor.
A nominal public tenant context does not qualify. Mount the canonical tenancy
interceptor before locale resolution to make admitted tenant preferences available.

### Types / Interfaces

| Export                      | Description                                            |
| --------------------------- | ------------------------------------------------------ |
| `StynxI18nModuleOptions`    | Workspace and locale options for `forRoot()`.          |
| `TenantOverrideUpdateInput` | `{ locale: string; catalog: Record<string, string> }`. |

## Configuration

| Option          | Type                                     | Default   | Description                                                                                                                                      |
| --------------- | ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `defaultLocale` | `string`                                 | `'en-US'` | Default locale; `pt-BR` applies only when configured here. Always present in the catalog alongside `en-US`.                                      |
| `catalogs`      | `Record<string, Record<string, string>>` | `{}`      | Catalogs registered at boot, keyed by locale. Modules can add more with `CatalogService.registerCatalog(locale, messages)`.                      |
| `workspaceRoot` | `string`                                 | unset     | Opt-in only: scans `<workspaceRoot>/{packages,packages-web}/<name>/i18n/<locale>.json`. When unset, no filesystem scan happens (not even `cwd`). |

Resolution preserves an active request locale, then a supported Accept-Language
entry, then the admitted tenant's stored locale, then `defaultLocale` (`en-US`
unless configured). Translation falls back to `en-US`, then the key.

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
// packages/my-feature/i18n/pt-BR.json
{ "inbox.summary": "{count, plural, one {# mensagem} other {# mensagens}}" }
```

```ts
this.locale.t('inbox.summary', { count: 3 }, 'pt-BR');
// → "3 mensagens"
```

### Example 3 — opt-in package-catalog scan per ADR-FE-ICU-i18n-0002

```ts
StynxI18nModule.forRoot({
  workspaceRoot: process.cwd(), // explicit: scanning is never implicit
  defaultLocale: 'pt-BR',
});
```

## Common pitfalls

- **Missing key with no fallback** — `translate()` returns the key itself (not an error). Audit your catalogs for completeness; consider a CI gate.
- **ICU syntax error in a catalog** — fails at format time (runtime), not load time. Validate catalogs in CI.
- **Locale not resolved** — header missing + no actor preference → `defaultLocale`. If users see English unexpectedly, check the locale source order.

## Related packages

- [`@stynx-nyx/core`](/docs/packages/core/) — provides `RequestContext` where the resolved locale is written.
- [`@stynx-nyx/angular-i18n`](/docs/packages-web/angular-i18n/) — the Angular pair: ICU in templates + catalog loader.
- [STYNX framework — ADR-FE-ICU-i18n-0002](/docs/meta/adr/ADR-FE-ICU-i18n-0002-package-catalogs-and-icu/) — the catalog + ICU decision.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-i18n/`](/docs/api-reference/stynx-i18n/)

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/auth`: `workspace:*`
- `@stynx-nyx/contracts`: `workspace:*`
- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`
- `@stynx-nyx/idempotency`: `workspace:*`
- `intl-messageformat`: `^11.2.8`
- `zod`: `^4.6.6`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@nestjs/platform-express`: `^11.1.26`
- `@nestjs/testing`: `^11.1.26`
- `@stynx-nyx/tenancy`: `workspace:*`
- `@stynx-nyx/testing`: `workspace:*`
- `@types/node`: `24.13.4`
- `@types/supertest`: `^7.2.0`
- `supertest`: `^7.2.2`
- `ts-node`: `^10.9.2`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
