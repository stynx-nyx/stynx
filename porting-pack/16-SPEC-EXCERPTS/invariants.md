# Invariants

> **Source:** `specs/STYNX-SPEC-v0.6.md` §1.3 (lines 57–70).
> **Spec version:** v0.6.

## I1 — No raw DB connection

All DB access goes through STYNX's connection manager, which sets
`app.tenant_id`, `app.actor_id`, `app.request_id`, `app.session_id`
GUCs on every transaction.

**Detection:** every DB call routes through `Database.tx(...)` from
`@stynx/data` (`packages/data/src/database.ts`). Direct `pg.Pool` or
`new Pool(...)` outside `packages/data/` and `packages/cli/` (migration
runner) is a violation. Linter rule `[VERIFY in PORT-04 — locate
ESLint `no-restricted-imports`config in`tools/eslint-config/`]`.

## I2 — No query outside a request context

Background work obtains an explicit `TenantContext` via
`withSystemContext(reason, fn)`.

**Detection:** runtime check at `Database.tx()` entry raises
`TenantContextMissingError` (`packages/data/src/errors.ts`) when no
`TenantContext` is present. Background scripts must wrap calls in
`withSystemContext('reason', async () => { ... })`
(`packages/data/src/system-context.ts`).

## I3 — No direct S3 client

All object operations go through `@stynx/storage`.

**Detection:** grep for `@aws-sdk/client-s3` outside
`packages/storage/`. As of audit FIND-010, `packages/privacy/` had a
documented violation; verify current state (`grep -r
'@aws-sdk/client-s3' packages/privacy/src` should be empty if the
remediation landed).

## I4 — Every HTTP route has a permission

Routes without `@Permission(...)`, `@Public()`, or `@System()` fail
CI.

**Detection:** the `stynx doctor` CLI command
(`packages/cli/src/doctor.ts`) walks controllers and reports
unguarded methods. Audit FIND-011 noted doctor produced empty
output; verify before relying on it as a gate. Manual fallback:
`grep -rE '@(Get|Post|Put|Delete|Patch|All)' apps/<your-app>/src
--include='*.controller.ts'` and confirm each method is also
decorated with `@Permission` / `@Public` / `@System`.

## I5 — Every tenant-scoped table has `tenant_id` and an RLS policy

`tenant_id uuid NOT NULL`. RLS policy keyed on
`current_setting('app.tenant_id', true)::uuid` (see §4.4 in
`tenancy-model.md`).

**Detection:** the migration linter
(`tools/migration-linter/src/lint.ts`) emits a `LINT*` issue when a
new tenant-scoped table omits `tenant_id` or its RLS policy. Audit
FIND-004 noted the linter's self-test failing on repo migrations;
verify before relying on it.

## I6 — Every mutation is audited

Unless annotated `@NoAudit('reason')`.

**Detection:** controller decorators carry `@Audit({ entity, op })`
on every mutation; the migration linter requires opt-out reason on
`@NoAudit`. Trigger-level enforcement lives in
`packages/data/migrations/platform/0008_audit.sql` (the `audit.fn_row_change`
trigger fires AFTER INSERT/UPDATE/DELETE on every opted-in table).

## I7 — Read-only clients use the RO role

`@ReadOnly()` routes connect via `stynx_reader`.

**Detection:** `Database.tx({ role: 'reader', readonly: true })`
sets `app.role = 'reader'` GUC; `ensureWritableRole()` in
`packages/data/src/database.ts` raises `ReadOnlyViolationError` if a
write attempt is made under that role.

## I8 — Every tenant-scoped table is soft-deletable

Unless annotated `@NoSoftDelete('reason')`. Soft-deletable tables
MUST have a corresponding `archive.{schema}_{table}` mirror declared
in the **same** migration. Live tables of soft-deletable entities do
**not** carry `deleted_at`/`deleted_by` columns — deletion metadata
lives in the archive mirror only.

**Detection:** the SQL helper
`data.create_soft_deletable_table($$ ... $$)` (defined in
`packages/data/migrations/platform/0010_data_helpers.sql`) emits the
mirror, RLS, indexes, and audit binding atomically. Migration linter
fails any soft-deletable live table without a mirror, and any live
table that carries `deleted_at` / `deleted_by` columns.

## Cross-cutting consequences

- **No `ON DELETE CASCADE`** at the DB level; cascade is application-
  layer (see `soft-delete-model.md`).
- **No `deleted_at` on live tables** — ever.
- **No application-layer tenant filtering** — RLS does it; manual
  `WHERE tenant_id = ...` predicates are noise at best, drift at worst.
- **Cognito Groups are not used for tenancy or roles** — those live in
  `auth.memberships` (see `tenancy-model.md`).
