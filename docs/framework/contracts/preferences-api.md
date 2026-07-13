# Preferences API Contract

**Authority:** Architect (DEVAI Constitution Article 6).
**Decision:** [ADR-PREFERENCES-0001](../../meta/adr/ADR-PREFERENCES-0001-tenant-subject-preferences.md).
**Target package:** `@stynx-nyx/preferences`.

This is the normative R21 contract. Keywords MUST, MUST NOT, SHOULD, and MAY are
requirements for implementations and adapters.

## Identity and trusted context

The resource key is `(tenantId, subjectId)`. Both values MUST come from the
authenticated STYNX request context after membership/tenant validation.
Requests containing `tenantId`, `tenant_id`, `subjectId`, `subject_id`,
`userId`, or `user_id` in a body, query, or route parameter MUST be rejected as
`PREFERENCES_CONTEXT_OVERRIDE` (400), even when the value matches context.
Storage methods receive a trusted context object; public DTOs do not contain
scope identifiers. Missing authentication is 401 and invalid tenant membership
is 403. A different tenant's row is never returned and MUST appear absent at
the RLS/storage boundary.

`subjectId` is an opaque non-empty UTF-8 string of 1–255 bytes. `tenantId` is
the existing STYNX tenant UUID. Implementations MUST NOT assume the subject is a
UUID or expose a lookup by subject without tenant context.

## Closed wire schemas

Unknown categories and unknown keys MUST be rejected; they are never ignored.
All JSON objects MUST be plain objects with no duplicate keys. Strings are
trimmed only where explicitly stated. The serialized preference document MUST
be no larger than 16 KiB UTF-8, and an individual string MUST be no larger than
255 UTF-8 bytes unless a smaller limit follows.

```ts
type LocalePreferences = {
  locale: string; // BCP 47, 2..35 ASCII chars; adopter-supported value
  timezone: string; // IANA time-zone identifier, 1..100 ASCII chars
};

type ThemePreferences = {
  colorScheme: 'system' | 'light' | 'dark';
  contrast: 'standard' | 'more';
  density: 'comfortable' | 'compact';
};

type AccessibilityPreferences = {
  reduceMotion: boolean;
  largeText: boolean;
  screenReaderOptimized: boolean;
};

type NotificationDeliveryPreferences = {
  email: boolean;
  push: boolean;
  inApp: boolean;
};

type PreferenceValues = {
  locale: LocalePreferences;
  theme: ThemePreferences;
  accessibility: AccessibilityPreferences;
  notificationDelivery: NotificationDeliveryPreferences;
};

type PreferencesDocument = {
  values: PreferenceValues;
  revision: number; // safe integer >= 0
  updatedAt: string | null; // RFC 3339 UTC; null when revision is 0
};
```

Defaults MUST produce a complete `PreferenceValues`. Platform defaults are:

```json
{
  "locale": { "locale": "en-US", "timezone": "UTC" },
  "theme": { "colorScheme": "system", "contrast": "standard", "density": "comfortable" },
  "accessibility": { "reduceMotion": false, "largeText": false, "screenReaderOptimized": false },
  "notificationDelivery": { "email": true, "push": true, "inApp": true }
}
```

An adopter MAY replace default values or constrain the accepted locale/timezone
sets at module registration. It MUST supply the complete same schema and MUST
NOT add keys. Stored values override defaults at key granularity. A reset
removes the stored override and reveals the current configured default.

## Profile compatibility projection

```ts
type PlatformProfile = {
  subjectId: string;
  displayName: string | null; // trimmed, 1..120 chars when non-null
  avatarDocumentId: string | null; // opaque storage document id, <=255 bytes
  avatarUrl: string | null; // read-only, derived short-lived URL
  preferences: PreferencesDocument;
  revision: number;
  updatedAt: string | null;
};
```

`PATCH /profile` accepts only `displayName` and `avatarDocumentId`; `null`
resets either field. `subjectId`, `avatarUrl`, `preferences`, revision fields,
email, name parts, and every unknown key are read-only or forbidden. Generic
profile storage MUST NOT contain email, CPF/legal identifiers, birth data,
addresses, employment, payroll, benefits, compensation, personnel records, or
adopter/product-domain data.

## HTTP operations

All successful GET/write responses set `ETag: "<revision>"`. JSON responses use
`application/json`; all writes require `Content-Type: application/json`.

| Operation                               | Semantics                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /profile/preferences`              | Return complete effective values. With no row, return defaults, revision `0`, `updatedAt: null`, ETag `"0"`.                                                                                      |
| `PUT /profile/preferences`              | Body is exactly `PreferenceValues`. Replace all stored overrides atomically. Require matching `If-Match`. Return 200 document.                                                                    |
| `PATCH /profile/preferences`            | Body is a non-empty closed partial tree. Omitted keys are unchanged; a leaf `null` resets that override; a category `null` resets the category. Require matching `If-Match`. Return 200 document. |
| `DELETE /profile/preferences`           | Remove all overrides, preserving profile metadata. Require matching `If-Match`. Return 200 default document at the next revision. Idempotent only when the supplied revision matches.             |
| `DELETE /profile/preferences/:category` | Category is one of the four names. Reset that category. Require matching `If-Match`; return 200 document.                                                                                         |
| `GET /profile`                          | Return the narrow profile projection and effective preferences.                                                                                                                                   |
| `PATCH /profile`                        | Closed partial metadata body. Require matching profile `If-Match`; return 200 projection.                                                                                                         |

PUT persists only deviations from defaults, but its semantic result is a full
replacement. PATCH is atomic: any invalid member rejects the whole request.
Empty PATCH, arrays, nested objects where scalars are required, `NaN`/infinite
numbers, duplicate JSON keys, prototype keys (`__proto__`, `prototype`,
`constructor`), and oversized input are invalid. A valid write increments the
resource revision exactly once, even when it resets to defaults. Implementations
MAY return the current revision for an exact no-op without audit mutation, but
must make that behavior deterministic and test it; the reference implementation
MUST treat an exact no-op as no change.

`If-Match` MUST contain exactly one strong quoted integer ETag. Missing is
`PREFERENCES_PRECONDITION_REQUIRED` (428); weak, wildcard, multiple, malformed,
or stale values are `PREFERENCES_REVISION_CONFLICT` (412). Revision comparison
and mutation occur in one transaction/compare-and-swap.

## Errors

Errors use the repository standard error envelope. The stable codes are:

| Code                                | HTTP | Condition                                                        |
| ----------------------------------- | ---: | ---------------------------------------------------------------- |
| `PREFERENCES_INVALID`               |  400 | schema, duplicate key, empty patch, unsupported configured value |
| `PREFERENCES_CONTEXT_OVERRIDE`      |  400 | caller supplied tenant/subject identity                          |
| `PREFERENCES_FORBIDDEN_FIELD`       |  400 | HR, legal identity, product-domain, or read-only profile field   |
| `PREFERENCES_UNAUTHENTICATED`       |  401 | no trusted subject context                                       |
| `PREFERENCES_FORBIDDEN`             |  403 | tenant membership/context is not authorized                      |
| `PREFERENCES_CATEGORY_NOT_FOUND`    |  404 | reset path names a non-allowlisted category                      |
| `PREFERENCES_REVISION_CONFLICT`     |  412 | invalid or nonmatching strong ETag                               |
| `PREFERENCES_PRECONDITION_REQUIRED` |  428 | write omitted `If-Match`                                         |
| `PREFERENCES_TOO_LARGE`             |  413 | body or serialized document exceeds limits                       |

Validation errors MUST include only safe field paths and constraint identifiers,
not rejected values. Cross-tenant probes MUST NOT disclose whether a row exists.

## Storage port and Postgres reference model

The package exposes a port with these semantic operations:

```ts
interface PreferencesStore {
  read(scope: TrustedPreferenceScope): Promise<StoredSubjectPreferences | null>;
  compareAndSet(input: PreferenceMutation): Promise<StoredSubjectPreferences | 'conflict'>;
}

type TrustedPreferenceScope = Readonly<{ tenantId: string; subjectId: string }>;
```

The port MUST NOT expose unscoped reads, lists, or caller-selected tenant
arguments. `PreferenceMutation` contains the expected revision and normalized
closed overrides. The service owns default resolution and validation; adapters
persist only canonical JSON.

Reference Postgres table:

```sql
CREATE SCHEMA IF NOT EXISTS profile;
CREATE TABLE profile.subject_preferences (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  subject_id varchar(255) NOT NULL,
  display_name varchar(120),
  avatar_document_id varchar(255),
  preference_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, subject_id),
  CHECK (octet_length(subject_id) BETWEEN 1 AND 255),
  CHECK (octet_length(preference_overrides::text) <= 16384)
);
```

The migration MUST enable and force RLS. SELECT/INSERT/UPDATE/DELETE policies
MUST require `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`
in both `USING` and `WITH CHECK` where applicable. The primary key is the only
subject lookup index; any future index MUST lead with `tenant_id`. The table is
not a child of `tenant_settings`. Mutation uses `UPDATE ... WHERE revision =`
or an equivalent transaction-safe UPSERT/CAS. JSON is serialized with fixed
category/key order, no `null` leaves, no unknown members, and only deviations
from configured defaults. Timestamps are database UTC instants; `created_at`
never changes and `updated_at` changes only on a semantic mutation.

The reference migration belongs in the ordered platform migrations and MUST be
covered by idempotence, forced-RLS, same-tenant, cross-tenant, and missing-context
database integration tests. Retain rows until tenant deletion, an authenticated
subject-erasure workflow, or adopter-configured account-retention cleanup.
Erasure deletes profile metadata and preferences together and emits redacted
audit metadata. No independent history of preference values is retained.

## Audit contract

Emit `preferences.read` only when host audit policy requests read auditing, and
always emit semantic mutations as `preferences.updated`,
`preferences.category_reset`, `preferences.reset`, or `profile.updated`.
Audit metadata is limited to tenant ID, subject ID, actor ID, request ID,
operation, changed category/key names, previous/new revision, outcome, and
timestamp. Values, defaults, rejected input, display name, avatar URL/document
ID, email, tokens, and authorization headers MUST NOT be logged.

## Verification and abuse matrix

| Evidence            | Required assertion                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| schema/unit         | every exact schema/default; unknown category/key and forbidden profile/domain fields fail          |
| context/unit+wiring | subject/tenant come only from trusted context; spoof fields fail before store call                 |
| service/unit        | GET/default, full PUT, partial PATCH, null reset, category/all reset, exact no-op, error mapping   |
| concurrency/unit+DB | stale/malformed/missing ETag fails; two same-revision writers yield one success and one 412        |
| DB integration      | composite uniqueness, CAS, timestamps, serialization, migration idempotence, forced RLS            |
| tenant negative     | tenant A cannot read/update/delete tenant B; missing context cannot access rows; no existence leak |
| audit               | correct event/revision/key names; values and forbidden data absent from event and captured logs    |
| limits/security     | 16 KiB document, string limits, deep/array/prototype/duplicate-key payloads rejected safely        |
| HTTP/OpenAPI        | all routes, ETags, status/codes, content types, closed schemas and no writable identity fields     |
| Angular contract    | typed forms and adapter parse document, send `If-Match`, handle 412, and never send arbitrary keys |
| reference E2E       | real API routes exercise load/edit/reset/conflict; browser tests do not intercept `/profile*`      |
| mutation/release    | affected package mutation lanes, API baselines, dry packs and consumer fixtures include exports    |

Threat cases include a valid user replaying another tenant's subject, a caller
adding a matching tenant ID, mass-assignment of payroll/CPF fields, oversized
or prototype-polluting JSON, concurrent tabs, malicious audit values, and an
adopter attempting to register a fifth category. Every case MUST fail closed.

## W03 implementation checklist

1. Add `packages/preferences` as publishable `@stynx-nyx/preferences` with
   closed schemas, service, Nest module/options, controllers, storage port,
   deterministic in-memory adapter, Postgres adapter, and public barrel.
2. Add the ordered `profile.subject_preferences` migration, data schema mapping,
   forced RLS/CAS policies, and migration/RLS integration coverage.
3. Derive scope exclusively from authenticated request context; reject all
   identity override spellings before invoking the service/store.
4. Implement exact GET/PUT/PATCH/DELETE/profile routes, ETag rules, reset/no-op
   semantics, limits, error codes, and redacted audit hooks in this contract.
5. Narrow `@stynx-nyx/angular-profile` types/forms/service; preserve route URLs,
   carry ETags, surface 412 conflicts, and remove arbitrary index signatures.
6. Wire the reference API module and reference web to the real routes; remove
   `/profile*` network interception from preference E2E coverage.
7. Add unit, wiring, DB integration, tenant-negative, concurrency, audit,
   payload-abuse, Angular contract, and real reference E2E tests from the matrix.
8. Update OpenAPI generation/coverage, package docs and docs navigation, public
   API baselines, mutation configuration, dry-pack/consumer fixtures, and add
   required changesets for every changed public package.
9. Run focused package/DB/reference/API gates, then the live `ci:stynx` gate;
   report commands, counts, and any baseline changes without weakening security.
