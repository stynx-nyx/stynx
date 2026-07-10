# `@stynx-nyx/privacy` — LGPD/GDPR primitives: PII registry, erasure workflow, ROPA generator

`@stynx-nyx/privacy` provides three concerns: (1) a runtime PII column registry that captures which columns hold PII, the legal basis, and retention; (2) erasure-workflow orchestration that walks the registry to redact + delete the subject's data; (3) ROPA (Record-of-Processing-Activities) JSON generation from the registry for compliance audits. Exposed via three controller endpoints (`/privacy/exports`, `/privacy/erasures`, `/privacy/retention`).

## Purpose

Privacy laws (LGPD in Brazil, GDPR in EU) require: knowing which columns hold PII (registry), supporting data-export + deletion requests (subject-rights endpoints), and producing a ROPA on demand. Without explicit tooling, this lives as scattered scripts. `@stynx-nyx/privacy` centralises the substrate.

You reach for it when your app is subject to LGPD/GDPR and stores user PII.

What it does NOT do: it doesn't claim to be a compliance solution (it's the runtime substrate; legal review still required). It doesn't anonymise quasi-identifiers (k-anonymity etc.) — its erasure is row-level. It doesn't audit access — that's `@stynx-nyx/audit`.

## Audience

Backend developers in regulated apps (financial, healthcare, public-payroll, etc.). Also relevant for compliance officers using `stynx privacy ropa` for periodic reports.

## Install

```bash
pnpm add @stynx-nyx/privacy
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx-nyx/core` `^1`, `@stynx-nyx/data` `^1`, `@stynx-nyx/storage` `^1` (for export packaging).

## Quick start

```ts
import { StynxPrivacyModule, PiiColumn } from '@stynx-nyx/privacy';

StynxPrivacyModule.forRoot({
  defaultLegalBasis: 'consent',
  defaultRetentionDays: 365 * 5,
});
```

Register PII columns:

```ts
import { PiiColumn } from '@stynx-nyx/privacy';

@PiiColumn({ legalBasis: 'contract', retentionDays: 365 * 7, category: 'identifier' })
email: string;
```

```bash
# Generate a ROPA snapshot
pnpm exec stynx privacy ropa --out ./ropa.json
```

## Public API surface

### Modules

| Export               | Signature                                | Description                                                             |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `StynxPrivacyModule` | `.forRoot(options: StynxPrivacyOptions)` | Registers controller, PII map service, erasure service, ROPA generator. |

### Services / Injectables

| Export                      | Description                                           |
| --------------------------- | ----------------------------------------------------- |
| `StynxPrivacyService`       | Top-level: export, erase, get retention status.       |
| `PiiMapService`             | Reads + writes the runtime PII registry.              |
| `PrivacyObjectStoreService` | Bridges to `@stynx-nyx/storage` for export packaging. |
| `RopaGenerator`             | Produces the ROPA JSON.                               |

### Decorators

| Export                 | Targets          | Description                                                                                   |
| ---------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `@PiiColumn(metadata)` | Class properties | Mark a column as PII. `metadata`: `{ legalBasis, retentionDays, category, redactStrategy? }`. |

### Endpoints (1 controller)

| Method | Path                 | Auth                              | Description                                                                                           |
| ------ | -------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST` | `/privacy/exports`   | bearer + `privacy:subject-rights` | Initiate a data-export request for a subject. Returns a presigned download URL when ready.            |
| `POST` | `/privacy/erasures`  | bearer + `privacy:subject-rights` | Initiate an erasure request. Walks the PII registry, applies redact strategy, returns a confirmation. |
| `GET`  | `/privacy/retention` | bearer + `privacy:read`           | Snapshot of retention status across registered PII columns.                                           |

### Types / Interfaces

| Export                | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `StynxPrivacyOptions` | `forRoot()` options.                                                            |
| `PiiColumnMetadata`   | Decorator metadata: `{ legalBasis, retentionDays, category, redactStrategy? }`. |
| `RedactStrategy`      | `'null' \| 'hash' \| 'mask'` or a custom function.                              |

### Errors

| Export               | Code                    | Description                                    |
| -------------------- | ----------------------- | ---------------------------------------------- |
| `SubjectRightsError` | `SUBJECT_RIGHTS_FAILED` | Erasure / export hit an unrecoverable failure. |

## Configuration

### `StynxPrivacyModule.forRoot()` options

| Option                  | Type              | Default     | Description                                       |
| ----------------------- | ----------------- | ----------- | ------------------------------------------------- |
| `defaultLegalBasis`     | `string`          | `'consent'` | Fallback when a `@PiiColumn` doesn't declare one. |
| `defaultRetentionDays`  | `number`          | `1825` (5y) | Fallback retention.                               |
| `defaultRedactStrategy` | `RedactStrategy`  | `'null'`    | Default redaction.                                |
| `export.format`         | `'json' \| 'csv'` | `'json'`    | Export packaging format.                          |
| `export.presignTtl`     | `string`          | `'24h'`     | TTL for the export download URL.                  |

## Examples

### Example 1 — column-level PII annotation

```ts
class User {
  @PiiColumn({ category: 'identifier', legalBasis: 'contract', retentionDays: 365 * 7 })
  email!: string;

  @PiiColumn({
    category: 'sensitive',
    legalBasis: 'consent',
    retentionDays: 365,
    redactStrategy: 'hash',
  })
  cpf!: string;
}
```

### Example 2 — erasure flow

```bash
curl -X POST /privacy/erasures \
  -H "Authorization: Bearer <token>" \
  -d '{"subjectId": "user-123"}'
```

Walks all `@PiiColumn`-marked columns referencing `user-123` and applies the column's redact strategy.

### Example 3 — ROPA from CI

```bash
pnpm exec stynx privacy ropa --out ./compliance/ropa-2026-q2.json
```

## Common pitfalls

- **Missing `@PiiColumn` on a PII column** — erasure misses it. The ROPA also won't list it. Periodically audit the schema for unannotated PII; consider a CI gate.
- **Redact strategy `'null'` on a NOT NULL column** — write fails. Use `'hash'` or `'mask'` for required PII columns.
- **Long export jobs blocking the request** — exports run async; the endpoint returns a job id. Don't expect the response to contain the data.
- **Subject-id mismatch across tables** — your erasure must walk every table that references the subject. The PII registry helps but doesn't enforce — model your subject FKs consistently.

## Related packages

- [`@stynx-nyx/core`](/docs/packages/core/) — provides `RequestContext` for subject-rights endpoint auth.
- [`@stynx-nyx/data`](/docs/packages/data/) — owns the schema where PII columns live.
- [`@stynx-nyx/storage`](/docs/packages/storage/) — provides the bucket used for export packaging.
- [`@stynx-nyx/audit`](/docs/packages/audit/) — every subject-rights operation emits an audit event.
- [`@stynx-nyx/angular-profile`](/docs/packages-web/angular-profile/) — Angular pair: subject-rights UI (account-deletion).
- [`@stynx-nyx/cli`](/docs/packages/cli/) — `stynx privacy ropa` verb generates ROPA from this package's registry.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-privacy/`](/docs/api-reference/stynx-privacy/)
