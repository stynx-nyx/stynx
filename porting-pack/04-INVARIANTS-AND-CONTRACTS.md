# 04 — Invariants and Contracts

The non-negotiable rules. A port that violates an invariant is not a
port; it's a fork. Every claim cites a source.

## Why this document exists

STYNX is unusually opinionated. The eight invariants below are the
spec's letter; the cross-cutting contracts are what they look like
in practice. A consuming agent reading this file should be able to
(a) state every invariant, (b) detect a violation in a foreign
codebase via grep or lint, (c) rewrite the violation to comply.

## The invariants (I1–I8)

Verbatim spec text in [`16-SPEC-EXCERPTS/invariants.md`](16-SPEC-EXCERPTS/invariants.md).
Source: `specs/STYNX-SPEC-v0.6.md` §1.3 lines 57–70.

### I1 — No raw DB connection

**Statement:** All DB access goes through STYNX's connection
manager, which sets `app.tenant_id`, `app.actor_id`, `app.request_id`,
`app.session_id` GUCs on every transaction.

**Why it exists:** RLS depends on those GUCs being set; a raw
connection silently disables tenant isolation.

**Detection:** every DB call routes through `Database.tx(...)` from
`@stynx/data` (`packages/data/src/database.ts`). The runtime check
is `TenantContextMissingError` raised at `tx()` entry. The lint
companion `[GAP — verify ESLint `no-restricted-imports`rule in`tools/eslint-config/`blocks`pg`and`pg-pool`outside`packages/data/`and`packages/cli/`]`.

**Common violations to grep for in the foreign codebase:**

| Grep pattern                                        | Rewrite as                                         |
| --------------------------------------------------- | -------------------------------------------------- |
| `from ['"]pg['"]`                                   | Use `Database.tx(async trx => { ... })`            |
| `new Pool(`                                         | Inject `Database` from `@stynx/data`               |
| `client\.query\(` (where `client` is a pg `Client`) | `trx.execute(sql\`...\`)` or Drizzle query builder |
| `pgPromise(`                                        | replace with `@stynx/data`                         |

### I2 — No query outside a request context

**Statement:** Background work obtains an explicit `TenantContext`
via `withSystemContext(reason, fn)`.

**Why it exists:** GUCs are set per transaction; without a context,
RLS predicates evaluate against `NULL` and either leak or fail
silently.

**Detection:** runtime — `TenantContextMissingError`
(`packages/data/src/errors.ts`) thrown at `tx()` entry when
`nestjs-cls`'s `TenantContext` is missing.

**Common violations:**

| Pattern                                                     | Rewrite                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| Cron handlers / queue workers calling `db.tx(...)` directly | Wrap in `withSystemContext('cron-name', async () => { ... })` |
| Boot-time seeding outside a request                         | Same                                                          |
| Health-check probes that hit the DB                         | Same, or use `Database.withReplica` for read-only probes      |

### I3 — No direct S3 client

**Statement:** All object operations go through `@stynx/storage`.

**Why it exists:** `@stynx/storage` enforces tenant prefix, KMS
envelope encryption, and presigned-URL tenant-claim checks.

**Detection:** grep `@aws-sdk/client-s3` outside
`packages/storage/`. Audit FIND-010 noted a violation in
`packages/privacy/`; verify whether AUDIT-REMEDIATION-05 has landed.

**Common violations:**

| Pattern                                         | Rewrite                                           |
| ----------------------------------------------- | ------------------------------------------------- |
| `import { S3Client } from '@aws-sdk/client-s3'` | Inject `ObjectStoreService` from `@stynx/storage` |
| `getSignedUrl(...)` directly                    | `documentsService.getPresignedUploadUrl(...)`     |
| `multer-s3` upload handlers                     | Replace with the `@stynx/storage` upload flow     |

### I4 — Every HTTP route has a permission

**Statement:** Routes without `@Permission(...)`, `@Public()`, or
`@System()` fail CI.

**Why it exists:** Default-deny is the only safe stance for an
RBAC-only system; an unguarded route is a tenant boundary leak.

**Detection:** `stynx doctor` (`packages/cli/src/doctor.ts`) walks
controllers and reports unguarded methods. Audit FIND-011 flagged
empty doctor output — verify before relying on it. Manual fallback:

```sh
grep -rE '@(Get|Post|Put|Delete|Patch|All)\(' apps/<your-app>/src --include='*.controller.ts' \
  | while read line; do <inspect adjacent decorators for @Permission|@Public|@System>; done
```

**Common violations:**

| Pattern                                                          | Rewrite                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Controller method with `@Get(':id')` and no permission decorator | Add `@Permission('<resource>:read:*')`                              |
| `@UseGuards(AuthGuard)` only                                     | Replace with `@stynx/auth` guards (auto-wired by `StynxAuthModule`) |
| Health-style routes meant to be public                           | Add `@Public()` explicitly                                          |

### I5 — Every tenant-scoped table has `tenant_id` and an RLS policy

**Statement:** `tenant_id uuid NOT NULL` plus an RLS policy keyed
on `current_setting('app.tenant_id', true)::uuid`.

**Why it exists:** Pool + RLS is the entire tenancy model; a missing
policy is a single SQL away from cross-tenant disclosure.

**Detection:** `tools/migration-linter` rules `LINT001`–`LINT009`
(see [`08-MIGRATION-PATTERNS.md`](08-MIGRATION-PATTERNS.md)). Audit
FIND-004 noted the linter test failing on repo migrations —
re-verify before declaring this gate green.

**Common violations:**

| Pattern                                                  | Rewrite                                                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Hand-written `CREATE TABLE` with no `tenant_id`          | Use `data.create_soft_deletable_table($$ ... $$)`                                                                             |
| `tenant_id` present but no `ENABLE ROW LEVEL SECURITY`   | Use the helper, or add `ALTER TABLE … ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY` plus the `tenant_isolation` policy |
| `WHERE tenant_id = $1` predicates in application queries | Delete them — RLS does it                                                                                                     |

### I6 — Every mutation is audited

**Statement:** Unless annotated `@NoAudit('reason')`.

**Why it exists:** Compliance and incident forensics; the audit
trail is the system's source-of-truth on "what changed and when."

**Detection:**

- Controller-level: `@Audit({ entity, op })` on every mutation.
- DB-level: trigger `audit.fn_row_change()` on every opted-in table
  (set up via `audit.enable_for(...)` — automatic when using
  `data.create_soft_deletable_table`).

**Common violations:**

| Pattern                                               | Rewrite                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| Controller method without `@Audit`                    | Add `@Audit({ entity: 'thing', op: 'create' })` |
| `audit.enable_for` not called for a hand-rolled table | Add it; include `archive.*` mirror too          |

### I7 — Read-only clients use the RO role

**Statement:** `@ReadOnly()` routes connect via `stynx_reader`.

**Why it exists:** Defense in depth — a SQL injection on a
`@ReadOnly` route hits a role with no INSERT/UPDATE/DELETE grants.

**Detection:** `Database.tx({ role: 'reader', readonly: true })`
sets `app.role = 'reader'` GUC; `ensureWritableRole()` raises
`ReadOnlyViolationError` on attempted writes.

**Common violations:**

| Pattern                                                         | Rewrite                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Read-only reporting route with `@Permission` only               | Add `@ReadOnly()`                                                 |
| Read-only route accidentally mutating (e.g. last-seen tracking) | Move side-effect to a separate route, or accept the writable role |

### I8 — Every tenant-scoped table is soft-deletable

**Statement:** Unless annotated `@NoSoftDelete('reason')`.
Soft-deletable tables MUST have a corresponding
`archive.{schema}_{table}` mirror declared **in the same migration**.
Live tables must not carry `deleted_at`/`deleted_by`.

**Why it exists:** Recoverable-by-default deletes plus clean live
tables (no partial indexes, no `WHERE deleted_at IS NULL` everywhere).

**Detection:** `data.create_soft_deletable_table(...)` emits the
mirror atomically; the migration linter rejects:

- Soft-deletable live tables without a mirror.
- Live tables carrying `deleted_at` / `deleted_by`.
- Mirror schema drift between live and archive.
- `@NoSoftDelete` without a reason.

**Common violations:**

| Pattern                               | Rewrite                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `deleted_at timestamp` on live table  | Remove the column; use `data.create_soft_deletable_table`                                         |
| Hand-written archive mirror           | Either use the helper or accept the linter's drift detection                                      |
| `WHERE deleted_at IS NULL` in queries | Delete the clause; default queries hit live only                                                  |
| Hard delete for everything            | Keep `softDelete` for user-driven removes; reserve `hardDelete` for compliance / explicit erasure |

## Cross-cutting contracts

### HTTP route contract

- Every controller method has `@Permission(...)`, `@Public()`, or `@System()`.
- Every mutation method has `@Audit(...)` (or `@NoAudit('reason')`).
- Idempotent mutations carry `@Idempotent('Idempotency-Key')`.
- Rate-limited mutations carry `@RateLimit({ bucket, scope })`.
- `@ReadOnly()` switches the route to `stynx_reader`.
- Errors bubble to the global filter wired by
  `@stynx/backend`'s `StynxPlatformPipelineModule`
  (`apps/reference-api/src/app.module.ts:13`).

### Database access contract

- All app-level access via `Database.tx(...)` (or
  `Database.withSystemContext` / `Database.withReplica`).
- No deep imports from `@stynx/data/internal/...` in app code.
- No raw `pg.Pool`. No other ORM.
- Application code never imports `archive.*` Drizzle types — use
  `withDeleted()` / `onlyDeleted()`.

### Audit contract

- DB triggers on every opted-in live + archive table.
- `app.archive_move` GUC suppresses duplicate audit rows during
  archive moves (see [`audit-model.md`](16-SPEC-EXCERPTS/audit-model.md)).
- LGPD-tagged partitions retained 5 years hot; general 90 days hot.
- `audit.system_op` records cross-tenant operations.

### Soft-delete contract

- `data.create_soft_deletable_table(...)` is the default authoring
  surface.
- Every FK to a soft-deletable parent is annotated
  `-- @softdelete_fk: hide | cascade | block` (no default).
- Cascade depth limit 4, row limit 100 (overridable per call).
- `restoreWithCascade` matches by `deleted_at` timestamp equality.

### LGPD contract

- PII map populated in `@stynx/privacy`; entries name strategy
  (`nullify`, `hash_with_salt`, `tombstone_row`, `delete_row`).
- Erasure pipeline processes both live and archive in one call.
- Audit row written with `tags = { lgpd_erasure: true, strategy }`.
- Metric `lgpd_erasure_total{table, strategy}` incremented per
  erasure write.

## Detection summary

```sh
# I1: raw pg outside @stynx/data
rg -nE "from ['\"]pg['\"]|new Pool\(" --type ts | rg -v 'packages/data|packages/cli|test'

# I3: direct S3 outside @stynx/storage
rg -n "@aws-sdk/client-s3" --type ts | rg -v 'packages/storage'

# I5: tables without RLS (in app migrations)
rg -nE 'CREATE TABLE\s+\w+\.\w+' apps/*/migrations | xargs -I{} grep -L 'ENABLE ROW LEVEL SECURITY' {}

# I8: live tables with deleted_at
rg -n 'deleted_at\s+timestamp' apps/*/migrations packages/*/migrations
```

If any of these returns lines, address them per the rewrite tables
above.
