# `@stynx-nyx/preferences` — closed tenant-and-subject preferences with a narrow profile projection

`@stynx-nyx/preferences` stores user preferences keyed by `(tenantId, subjectId)` and exposes them, together with a small profile projection (display name and avatar reference), through a NestJS service and an optional `/profile` controller. The preference schema is closed: four fixed categories with fixed keys, validated with zod. HTTP writes require a strong `If-Match` ETag and never accept tenant or subject identifiers from callers.

## Purpose

Applications need per-user settings such as locale, theme, accessibility and notification delivery. Left open-ended, such a store becomes a place for arbitrary or sensitive data and for cross-tenant mistakes. This package fixes the schema, takes the tenant and subject only from trusted context, and uses a revision counter for optimistic concurrency.

Stored values are overrides on top of configured defaults, at key granularity. A reset removes the stored override and reveals the current default. Every successful mutation increments the revision once and emits one redacted audit event that names the changed paths, never the values.

What it does not do: it does not accept additional categories or keys, it does not store email, legal identifiers or other personal or product-domain data, it does not authenticate requests (the host applies its own guard), and it does not create its database table.

The normative contract is `docs/framework/contracts/preferences-api.md`; the decision is `law/adr/ADR-PREFERENCES-0001-tenant-subject-preferences.md`.

## Audience

Backend developers adding a "my profile" or settings API to a STYNX application, and frontend developers who need the exact wire schema and ETag rules.

## Install

```bash
pnpm add @stynx-nyx/preferences
```

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference).

**Node:** 24.x.

## Quick start

Mount `StynxPreferencesModule.forRoot()` after the STYNX core, data and auth context modules.

```ts
import { StynxPreferencesModule } from '@stynx-nyx/preferences';

@Module({
  imports: [StynxPreferencesModule.forRoot()],
})
export class AppModule {}
```

This mounts `PreferencesController` at `/profile` and uses `PostgresPreferencesStore`. The reference API instead disables the bundled controller and mounts a guarded subclass:

```ts
import { PreferencesController, StynxPreferencesModule } from '@stynx-nyx/preferences';

@UseGuards(StynxAuthGuard)
class GuardedPreferencesController extends PreferencesController {}

@Module({
  imports: [StynxPreferencesModule.forRoot({ mountController: false })],
  controllers: [GuardedPreferencesController],
})
export class AppModule {}
```

## Public API surface

### Modules

| Export                   | Signature                                           | Description                                                                                                      |
| ------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `StynxPreferencesModule` | `.forRoot(options?: StynxPreferencesModuleOptions)` | Provides `PreferencesService` and the store; mounts `PreferencesController` unless `mountController` is `false`. |
| `StynxPreferencesModule` | `.inMemory(options?)`                               | Same as `forRoot` with a new `InMemoryPreferencesStore`; `options` omits `store`.                                |

The module exports `PreferencesService` and the `STYNX_PREFERENCES_STORE` token.

### Services

`PreferencesService` methods take an optional trailing `scope: TrustedPreferenceScope`. When omitted, the scope is read from the `RequestContext` of [`@stynx-nyx/core`](/docs/packages/core/) (`tenantId` and `actorId`).

| Method                                              | Returns               | Description                                                                                                |
| --------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `getPreferences(scope?)`                            | `PreferencesDocument` | Effective values (defaults merged with overrides). With no row: defaults, revision `0`, `updatedAt: null`. |
| `getProfile(scope?)`                                | `PlatformProfile`     | Profile projection with effective preferences and the resolved `avatarUrl`.                                |
| `putPreferences(raw, expectedRevision, scope?)`     | `PreferencesDocument` | Full replacement. Persists only values that differ from the defaults.                                      |
| `patchPreferences(raw, expectedRevision, scope?)`   | `PreferencesDocument` | Partial update. A leaf `null` resets that key; a category `null` resets the category.                      |
| `reset(category \| null, expectedRevision, scope?)` | `PreferencesDocument` | Resets one category, or all four when `category` is `null`.                                                |
| `patchProfile(raw, expectedRevision, scope?)`       | `PlatformProfile`     | Updates `displayName` and/or `avatarDocumentId`; `null` clears a field.                                    |

### Controller routes

`PreferencesController` is declared with `@Controller('profile')`. Every response sets `ETag: "<revision>"`. The write routes are marked `@NoIdempotent()` from [`@stynx-nyx/idempotency`](/docs/packages/idempotency/).

| Route                                   | Service call                         |
| --------------------------------------- | ------------------------------------ |
| `GET /profile`                          | `getProfile`                         |
| `PATCH /profile`                        | `patchProfile`                       |
| `GET /profile/preferences`              | `getPreferences`                     |
| `PUT /profile/preferences`              | `putPreferences`                     |
| `PATCH /profile/preferences`            | `patchPreferences`                   |
| `DELETE /profile/preferences`           | `reset(null, ...)`, responds 200     |
| `DELETE /profile/preferences/:category` | `reset(category, ...)`, responds 200 |

The controller takes the subject from `request.stynxClaims.sub`, `request.principal.id`, `request.actor.id` or `request.user.id` (first present) and the tenant from `request.tenantId` or `request.stynxClaims.tenantId`.

### Stores

| Export                     | Description                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostgresPreferencesStore` | Default store. Reads and compare-and-sets one row per scope through `Database` from [`@stynx-nyx/data`](/docs/packages/data/), inside a request context built from the scope. |
| `InMemoryPreferencesStore` | Map-backed store with the same compare-and-set semantics, for tests.                                                                                                          |

### Schemas and defaults

| Export                                  | Description                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `localePreferencesSchema`               | `locale` (2–35 printable ASCII characters) and `timezone` (1–100).                                                 |
| `themePreferencesSchema`                | `colorScheme`, `contrast`, `density` enums.                                                                        |
| `accessibilityPreferencesSchema`        | `reduceMotion`, `largeText`, `screenReaderOptimized` booleans.                                                     |
| `notificationDeliveryPreferencesSchema` | `email`, `push`, `inApp` booleans.                                                                                 |
| `preferenceValuesSchema`                | Strict object of the four categories; used for `PUT` and for validating configured defaults.                       |
| `preferencePatchSchema`                 | Non-empty strict partial tree with nullable leaves and categories.                                                 |
| `profilePatchSchema`                    | Non-empty strict object: `displayName` (trimmed, 1–120) and `avatarDocumentId` (at most 255 bytes), both nullable. |
| `PLATFORM_PREFERENCE_DEFAULTS`          | Defaults used when `options.defaults` is absent.                                                                   |

### Tokens

| Export                      | Description                                |
| --------------------------- | ------------------------------------------ |
| `STYNX_PREFERENCES_OPTIONS` | The `StynxPreferencesModuleOptions` value. |
| `STYNX_PREFERENCES_STORE`   | The active `PreferencesStore`.             |
| `STYNX_PREFERENCES_AUDIT`   | The `PreferencesAuditSink`.                |
| `STYNX_PREFERENCES_AVATAR`  | The `PreferencesAvatarResolver`.           |

### Errors

`PreferencesError` extends Nest's `HttpException`, carries `code: PreferencesErrorCode`, and responds with `{ code, message, fields? }`. `fields` holds field paths only, never rejected values.

| Code                                | Status | Condition                                                                                         |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `PREFERENCES_INVALID`               | 400    | Schema violation, empty patch, unsupported configured locale or timezone, subject over 255 bytes. |
| `PREFERENCES_CONTEXT_OVERRIDE`      | 400    | Body or query contains `tenantId`, `tenant_id`, `subjectId`, `subject_id`, `userId` or `user_id`. |
| `PREFERENCES_FORBIDDEN_FIELD`       | 400    | `PATCH /profile` body has a key other than `displayName` or `avatarDocumentId`.                   |
| `PREFERENCES_UNAUTHENTICATED`       | 401    | No trusted subject.                                                                               |
| `PREFERENCES_FORBIDDEN`             | 403    | No trusted tenant.                                                                                |
| `PREFERENCES_CATEGORY_NOT_FOUND`    | 404    | Reset names a category outside the four.                                                          |
| `PREFERENCES_REVISION_CONFLICT`     | 412    | Malformed, weak or stale `If-Match`, or a lost compare-and-set.                                   |
| `PREFERENCES_TOO_LARGE`             | 413    | Serialized input exceeds 16 KiB.                                                                  |
| `PREFERENCES_PRECONDITION_REQUIRED` | 428    | Write without `If-Match`.                                                                         |

### Types

| Export                                                                                                 | Description                                                              |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `StynxPreferencesModuleOptions`                                                                        | Module options.                                                          |
| `PreferenceCategory`                                                                                   | `'locale' \| 'theme' \| 'accessibility' \| 'notificationDelivery'`.      |
| `LocalePreferences`, `ThemePreferences`, `AccessibilityPreferences`, `NotificationDeliveryPreferences` | The four category shapes.                                                |
| `PreferenceValues`, `PreferencesDocument`, `PlatformProfile`                                           | Complete values, the versioned document and the profile projection.      |
| `PreferencePatch`, `ProfilePatch`, `PreferenceOverrides`                                               | Patch bodies and the stored override shape.                              |
| `TrustedPreferenceScope`                                                                               | `Readonly<{ tenantId: string; subjectId: string }>`.                     |
| `PreferencesStore`, `StoredSubjectPreferences`, `PreferenceMutation`                                   | Storage port (`read`, `compareAndSet`) and its record and input types.   |
| `PreferencesAuditSink`, `PreferencesAuditEvent`                                                        | Audit port and event (operation, ids, changed paths, revisions).         |
| `PreferencesAvatarResolver`                                                                            | Resolves an avatar document id to a URL for `PlatformProfile.avatarUrl`. |
| `PreferencesErrorCode`                                                                                 | Union of the error codes above.                                          |
| `AuthenticatedRequest`, `NestResponse`                                                                 | Structural request and response types the controller reads.              |

## Configuration

### `StynxPreferencesModule.forRoot()` options

| Option               | Type                        | Default                        | Description                                                                            |
| -------------------- | --------------------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| `defaults`           | `PreferenceValues`          | `PLATFORM_PREFERENCE_DEFAULTS` | Complete default values. Validated at construction; invalid defaults throw.            |
| `supportedLocales`   | `readonly string[]`         | not constrained                | When set, the effective `locale.locale` of a write must be in the list.                |
| `supportedTimezones` | `readonly string[]`         | not constrained                | When set, the effective `locale.timezone` of a write must be in the list.              |
| `store`              | `PreferencesStore`          | `PostgresPreferencesStore`     | Storage adapter.                                                                       |
| `audit`              | `PreferencesAuditSink`      | no-op sink                     | Receives one `PreferencesAuditEvent` per successful mutation.                          |
| `avatarResolver`     | `PreferencesAvatarResolver` | resolves to `null`             | Derives `avatarUrl` from `avatarDocumentId`.                                           |
| `mountController`    | `boolean`                   | `true`                         | Set `false` to omit `PreferencesController` and mount your own subclass or controller. |

`PLATFORM_PREFERENCE_DEFAULTS`:

```json
{
  "locale": { "locale": "en-US", "timezone": "UTC" },
  "theme": { "colorScheme": "system", "contrast": "standard", "density": "comfortable" },
  "accessibility": { "reduceMotion": false, "largeText": false, "screenReaderOptimized": false },
  "notificationDelivery": { "email": true, "push": true, "inApp": true }
}
```

The package reads no environment variables.

## Examples

### Example 1 — read, then patch with the returned revision

```ts
const current = await preferences.getPreferences();
const updated = await preferences.patchPreferences(
  { theme: { colorScheme: 'dark' }, locale: { timezone: null } },
  current.revision,
);
// updated.revision === current.revision + 1 unless the patch was an exact no-op
```

### Example 2 — the same exchange over HTTP

```http
GET /profile/preferences
→ 200, ETag: "3"

PATCH /profile/preferences
If-Match: "3"
Content-Type: application/json

{ "theme": { "colorScheme": "dark" } }
→ 200, ETag: "4"
```

### Example 3 — constrain locales and capture audit events

```ts
StynxPreferencesModule.forRoot({
  supportedLocales: ['en-US', 'pt-BR'],
  supportedTimezones: ['UTC', 'America/Sao_Paulo'],
  audit: { write: (event) => auditLog.record(event) },
  avatarResolver: { resolve: async (documentId) => (documentId ? signUrl(documentId) : null) },
});
```

### Example 4 — in-memory store for tests

```ts
const moduleRef = await Test.createTestingModule({
  imports: [StynxPreferencesModule.inMemory({ mountController: false })],
}).compile();
```

## Common pitfalls

- **The table is not created by this package.** `PostgresPreferencesStore` reads and writes `profile.subject_preferences`. In this repository the table is created by the reference API migration `reference/api/migrations/0003_preferences.sql`; no migration under `packages/data/migrations/platform` creates it. A host application must ship an equivalent migration with forced RLS.
- **The bundled controller has no guard.** It only reads identity fields that an upstream guard or middleware placed on the request. Mount it behind your authentication guard, as the reference API does.
- **Missing `If-Match` is 428, not 412.** A weak, wildcard, multiple or non-integer tag is 412. The tag must be exactly one strong quoted non-negative integer such as `"3"`.
- **Sending identity fields.** A `tenantId`, `subjectId` or `userId` key (either spelling) in a body or query is rejected as `PREFERENCES_CONTEXT_OVERRIDE` even when the value matches the context.
- **An exact no-op does not bump the revision.** A preference write that leaves the stored overrides unchanged returns the current document and emits no audit event.
- **Profile and preferences share one revision.** `PATCH /profile` and the preference writes compare against and increment the same row revision.
- **Unknown keys are errors.** The schemas are strict; unknown categories or keys are rejected, not ignored.
- **`subjectId` is opaque.** It is a 1–255 byte string, not necessarily a UUID. `PostgresPreferencesStore` passes it as the `actorId` of the request context it opens.

## Related packages

- [`@stynx-nyx/core`](/docs/packages/core/) — `RequestContext`, the source of the default scope.
- [`@stynx-nyx/data`](/docs/packages/data/) — `Database` used by `PostgresPreferencesStore`.
- [`@stynx-nyx/idempotency`](/docs/packages/idempotency/) — `NoIdempotent` decorator applied to the write routes.
- [`@stynx-nyx/auth`](/docs/packages/auth/) — `StynxAuthGuard`, used by the reference API to guard the controller; not a dependency.
- [`@stynx-nyx/angular-profile`](/docs/packages-web/angular-profile/) — Angular profile and preferences UI that consumes these routes.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`
- `@stynx-nyx/idempotency`: `workspace:*`
- `zod`: `^4.3.6`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@types/node`: `24.13.4`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
