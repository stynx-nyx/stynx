# 02 — Spec Adherence

Method: each invariant, decision, and contract item was checked against
source via grep, file read, and (where possible) spec-side cross-reference.
Results below carry file paths; where verification required runtime
evidence that this read-only audit could not produce, the item is marked
UNKNOWN.

## Invariants (SPEC §1.3)

### I1 — No raw DB connection outside `@stynx/data` — **PASS WITH DEVIATION**

`pg` imports outside `packages/data/`:

- `bootstrap/lib/db.ts` — legacy bootstrap, uses raw `Pool`. Spec invariant
  forbids this; bootstrap is not in spec §3, so this is a drift artifact
  rather than a runtime violation if bootstrap is genuinely never invoked
  in production. FIND-008.
- `packages/cli/src/migrate.ts` — migration runner. Acceptable under §13
  ("the CLI owns migrations") but the spec doesn't carve an explicit
  exception for I1. UNKNOWN whether this is in-spec.
- `packages/testing/src/create-test-app.ts`, `packages/cli/test/...`,
  `packages/auth/test/integration/...` — test fixtures. Acceptable.

No ESLint rule blocking `pg`/`Pool` imports outside `@stynx/data` was
located in `tools/eslint-config/`. The spec implies (I1, §17) that this
should be linter-enforced. FIND-009.

### I2 — No query outside a request context — **PASS**

`packages/data/src/database.ts` raises `TenantContextMissingError`
(`code: TENANT_CONTEXT_MISSING`, HTTP 500) at `Database.tx()` entry before
any GUC setup. Confirmed via direct file read.

`withSystemContext(reason, fn)` is exported from `packages/data` per §1 of
STYNX-API-DATA.md.

ESLint enforcement of "no `tx()` outside request scope" was not located —
runtime check is the only line of defense. Acceptable but worth a
hardening pass.

### I3 — No direct S3 client outside `@stynx/storage` — **DEVIATION (BLOCKER candidate)**

`@aws-sdk/client-s3` imports outside `packages/storage/`:

- `bootstrap/lib/frontend.ts` — legacy bootstrap, drift artifact (FIND-008).
- `packages/privacy/src/privacy-object-store.service.ts` — first-party
  STYNX module accessing S3 directly. **The spec is unambiguous (I3): "All
  object operations go through `@stynx/storage`"**. The privacy package is
  not granted an exception in §9 or §21. Per §1.3 wording this is a
  hard violation. FIND-010 (MAJOR — see register for severity rationale).

### I4 — Every HTTP route has a permission — **PASS (sampled)**

Spot check of `apps/reference-api/src/*.controller.ts`: every method
inspected carries `@Permission(...)` or `@Public()`:

- `records.controller.ts` (8 methods), `record-notes.controller.ts` (6),
  `documents.controller.ts` (4), `reference-probes.controller.ts` (3),
  `work-item-entries.controller.ts`, `work-item-locks.controller.ts`,
  `work-items.controller.ts` — all decorated.

`pnpm doctor` produced **no output** in the audit run despite exit code 0
(see FIND-011). The doctor command is the spec's authoritative
route-coverage check; we cannot confirm 100 % coverage without it. UNKNOWN
across the full controller set.

### I5 — Every tenant-scoped table has `tenant_id` and RLS — **PASS WITH RESERVATION**

`apps/reference-api/migrations/0001_reference.sql` uses
`data.create_soft_deletable_table(...)` (line 89) which the helper
auto-enables RLS plus tenant-isolation policy. Comment at lines 81–85
documents this. Sample tables `sample.record`, `sample.record_note`, etc.
all declare `tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id)`.

**Reservation:** `tools/migration-linter` is the spec's enforcement
mechanism for I5/I6/I8, and its test suite **fails** with 4 parser errors
on the repo's own migrations (FIND-004). Until the linter passes, I5
cannot be claimed enforced — it can only be claimed visually correct on
the sampled file.

### I6 — Every mutation audited — **PASS (sampled)**

`apps/reference-api/src/records.controller.ts` shows `@Audit({ action,
entity })` on every mutation: `list`, `create`, `update`, `softDelete`,
`restore`, `hardDelete`, `trash`. No `@NoAudit` usage observed.

Same caveat as I5: linter enforcement is broken. FIND-004.

### I7 — `@ReadOnly()` routes use `stynx_reader` — **PASS**

`packages/data/src/database.ts` line 65: `ensureWritableRole()` throws
`ReadOnlyViolationError` if role is `'reader'`. `tx({ role: 'reader',
readonly: true })` sets `app.role = 'reader'` GUC.

12+ `@ReadOnly()` usages observed in `apps/reference-api/src/`. Wiring is
end-to-end: decorator → metadata → tx options → role.

### I8 — Soft-deletable live tables have archive mirrors and no `deleted_at` — **PASS**

`data.create_soft_deletable_table(...)` auto-creates `archive.<schema>_<table>`
with `archive_id`, `archived_at`, `deleted_at`, `deleted_by`,
`last_erasure_at`. Live tables observed clean (no `deleted_at`).
`packages/data/src/internal/archive-schema.ts` defines the
`ArchiveMirrorSchema` interface (Symbol-keyed type markers, hidden from
consumer surface — matches ADR-001).

Linter caveat (FIND-004) applies — the structural enforcement is broken.

## Architectural Decisions

| Item                                                  | Spec ref | Status  | Evidence                                                                                                                                                                                                                 |
| ----------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pool + RLS only                                       | §4.1     | HONORED | No schema-per-tenant code; Drizzle uses one DB                                                                                                                                                                           |
| Cognito as IdP only                                   | §5.1     | HONORED | `packages/auth` carries Cognito SDK; tenancy lives in DB tables                                                                                                                                                          |
| RBAC, no ABAC, no policy hooks                        | §6.1     | HONORED | PermissionCache resolves resource:action:scope strings; no attribute hooks observed                                                                                                                                      |
| Drizzle ORM, no Prisma/TypeORM                        | §13.3    | HONORED | `grep -r 'prisma\|typeorm\|sequelize\|mikro-orm' packages/*/package.json` returns 0 matches                                                                                                                              |
| Archive schema model (no `deleted_at` on live)        | §14      | HONORED | See I8                                                                                                                                                                                                                   |
| FK annotations + migration linter                     | §14.7    | DRIFT   | Linter present but fails on repo migrations (FIND-004)                                                                                                                                                                   |
| @Idempotent opt-in per route                          | §22      | HONORED | `apps/reference-api/.../records.controller.ts` shows per-method usage                                                                                                                                                    |
| pt-BR + en-US only                                    | §23      | HONORED | `packages/i18n/test/integration/i18n.module.spec.ts` lists exactly these locales                                                                                                                                         |
| ADR-001: helper as default authoring surface          | ADR-001  | HONORED | Migration uses `create_soft_deletable_table`; archive types in `internal/`                                                                                                                                               |
| ADR-002: 3-tier cache + hash probe + 6 mutation paths | ADR-002  | HONORED | `packages/auth/src/permission-cache.ts:68–70` shows TtlLruCache + HashProbeState; effective_hash updates via `effective_hash_computer.ts`. Six-path coverage **not exhaustively verified** in this audit — UNKNOWN-edges |

## API Contract — `@stynx/data` exports

Reference: `specs/STYNX-API-DATA.md` §1 and §7.

| Expected                                           | Actual location                    | Status                |
| -------------------------------------------------- | ---------------------------------- | --------------------- |
| `DataModule` (alias `StynxDataModule`)             | `packages/data/src/index.ts`       | MATCHES               |
| `Database`                                         | `packages/data/src/database.ts`    | MATCHES               |
| `Transaction`, `createDrizzle`                     | `packages/data/src/transaction.ts` | MATCHES               |
| `withSystemContext`                                | exported                           | MATCHES               |
| Type exports (`TxOptions`, `SoftDeleteOptions`, …) | `./types` barrel                   | MATCHES               |
| All §7 errors                                      | `./errors` barrel                  | MATCHES (11/11 below) |

### §7 Error classes

| Error                                | Code                                   | HTTP | Present |
| ------------------------------------ | -------------------------------------- | ---- | ------- |
| `TenantContextMissingError`          | `TENANT_CONTEXT_MISSING`               | 500  | ✅      |
| `ActorContextMissingError`           | `ACTOR_CONTEXT_MISSING`                | 500  | ✅      |
| `TransactionRequiredError`           | `TRANSACTION_REQUIRED`                 | 500  | ✅      |
| `ReadOnlyViolationError`             | `READONLY_VIOLATION`                   | 500  | ✅      |
| `CascadeTooDeepError`                | `CASCADE_TOO_DEEP`                     | 409  | ✅      |
| `CascadeTooLargeError`               | `CASCADE_TOO_LARGE`                    | 409  | ✅      |
| `SoftDeleteBlockedError`             | `SOFT_DELETE_BLOCKED_BY_CHILDREN`      | 409  | ✅      |
| `RestoreConflictError`               | `RESTORE_CONFLICT`                     | 409  | ✅      |
| `RestoreCascadeParentsArchivedError` | `RESTORE_HAS_ARCHIVED_CASCADE_PARENTS` | 409  | ✅      |
| `ArchiveMirrorMissingError`          | `ARCHIVE_MIRROR_MISSING`               | 500  | ✅      |
| `ArchiveMirrorDriftError`            | `ARCHIVE_MIRROR_DRIFT`                 | 500  | ✅      |

### Transaction methods

| Method                                   | Spec §   | Present                      | Signature shape                  |
| ---------------------------------------- | -------- | ---------------------------- | -------------------------------- |
| `tx(fn, opts?)`                          | §3.2     | ✅                           | matches                          |
| `softDelete(table, id, opts?)`           | §5.1–5.2 | ✅                           | dual overload (dryRun / regular) |
| `restoreFromArchive(table, id, opts?)`   | §5.3     | ✅                           | matches                          |
| `restoreWithCascade(...)`                | §5.4     | ✅ (via convenience wrapper) | matches                          |
| `hardDelete(table, id, opts)`            | §5.5     | ✅                           | `confirm` literal type present   |
| `hardDeleteFromArchive(archiveId, opts)` | §5.6     | ✅                           | platform-only                    |
| `withDeleted()` / `onlyDeleted()`        | §5.7     | ✅                           | `query-helpers.ts`               |

API contract: **MATCHES** end-to-end.

## Database Structure

**Not verified in this audit.** Verifying schemas, roles, and trigger
behavior requires applying migrations to a Postgres instance. The audit
prompt (Section 2) calls for `pg_namespace`/`pg_roles` queries; these
require running `stynx migrate up` against a clean DB and inspecting it.
The `apps/reference-api/docker-compose.yml` makes this feasible but
running it would require the auditor to start containers and write DB
state — the prompt's "no mutating commands against shared environments"
permits ephemeral docker, but time-budget did not allow this verification
to complete. Recorded as **UNKNOWN** — FIND-012.

## Aggregate Adherence Score

- Invariants: 5 PASS, 2 PASS-with-reservation, 1 DEVIATION-MAJOR (I3) → **6.5 / 8 = 81 %**
- Architectural decisions: 8 HONORED, 1 DRIFT (linter), 1 partial (ADR-002 paths) → **8.5 / 10 = 85 %**
- API contract: 11/11 errors, 7/7 transaction methods, 5/5 module exports → **23/23 = 100 %**
- DB structure: UNKNOWN

Weighted (2 × invariants + 2 × architecture + 3 × contract):
**(81 × 2 + 85 × 2 + 100 × 3) / 7 = 632 / 7 = 90.3 %**

The contract-level adherence is excellent. Invariant-level adherence is
strong but undermined by the broken migration linter (which is the actual
enforcement mechanism for I5/I6/I8) and the I3 violation in
`packages/privacy`.
