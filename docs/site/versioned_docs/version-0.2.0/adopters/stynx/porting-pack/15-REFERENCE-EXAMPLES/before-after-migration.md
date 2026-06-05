# Before / After — A Migration

&gt; Companion to [`08-MIGRATION-PATTERNS.md`](../08-MIGRATION-PATTERNS.md)
&gt; and the spec excerpts in [`16-SPEC-EXCERPTS/soft-delete-model.md`](../16-SPEC-EXCERPTS/soft-delete-model.md)
&gt; and [`16-SPEC-EXCERPTS/audit-model.md`](../16-SPEC-EXCERPTS/audit-model.md).
&gt; The "After" section mirrors `reference/api/migrations/0001_reference.sql`.

This file shows a typical legacy migration — `organization_id` column,
`deleted` boolean, no RLS, no archive mirror, no audit trigger — and
rewrites it to use `data.create_soft_deletable_table` plus the three
FK-annotation idioms (`cascade`, `block`, `hide`).

---

## Before — legacy `CREATE TABLE`

```sql
-- migrations/2024_03_invoices.sql (FOREIGN — pre-port)
BEGIN;

CREATE TABLE IF NOT EXISTS sample.record (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  title           text        NOT NULL,
  email           text        NOT NULL,
  status          text        NOT NULL DEFAULT 'active',
  deleted         boolean     NOT NULL DEFAULT false,
  deleted_at      timestamptz NULL,
  deleted_by      uuid        NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, email)
);

CREATE INDEX idx_record_org ON sample.record (organization_id);
CREATE INDEX idx_record_deleted_lookup
  ON sample.record (organization_id, deleted, updated_at DESC);

-- No RLS, no archive mirror, and no audit trigger are declared here.
-- Application code is expected to remember every tenant/deleted predicate.
-- Deleted rows remain mixed into the live table forever.

CREATE TABLE IF NOT EXISTS sample.record_note (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  record_id       uuid        NOT NULL REFERENCES sample.record(id) ON DELETE CASCADE,
  kind            text        NOT NULL,
  detail          text        NOT NULL,
  deleted         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sample.work_item (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL,
  record_id         uuid        NOT NULL REFERENCES sample.record(id) ON DELETE CASCADE,
  created_by_user_id uuid       NOT NULL,        -- foreign key to users; NOT NULL
  code              text        NOT NULL,
  status            text        NOT NULL DEFAULT 'draft',
  deleted           boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

COMMIT;
```

### What this migration violates

| Symptom                                                                      | Rule                                          | Citation                                                                                                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `organization_id` instead of `tenant_id`                                     | I5; helper rejects                            | [`08-MIGRATION-PATTERNS.md`](../08-MIGRATION-PATTERNS.md) "Pattern: tenant-scoped table"                                             |
| `deleted` / `deleted_at` / `deleted_by` on the live table                    | I8                                            | [`16-SPEC-EXCERPTS/soft-delete-model.md`](../16-SPEC-EXCERPTS/soft-delete-model.md) — "Live tables MUST NOT carry deletion metadata" |
| No `ENABLE ROW LEVEL SECURITY` and no `tenant_isolation` policy              | LINT001                                       | `tools/migration-linter/src/lint.ts:524-545`                                                                                         |
| No archive mirror table for the soft-deletable parent                        | LINT002                                       | `tools/migration-linter/src/lint.ts:550-560`                                                                                         |
| `ON DELETE CASCADE` at the DB level on FK to a soft-deletable parent         | LINT004 (annotation missing) + Anti-pattern 3 | [`06-DATA-LAYER-PATTERNS.md`](../06-DATA-LAYER-PATTERNS.md) "Anti-pattern 3"                                                         |
| FK with no `-- @softdelete_fk:` annotation                                   | LINT004                                       | `tools/migration-linter/src/lint.ts:577-586`                                                                                         |
| `created_by_user_id NOT NULL` referencing a user that may itself be archived | I8 + LINT009 if annotated `hide`              | `lint.ts:588-597`                                                                                                                    |
| No `audit.enable_for(...)` call                                              | I6                                            | [`16-SPEC-EXCERPTS/audit-model.md`](../16-SPEC-EXCERPTS/audit-model.md) "Critical pitfalls" §1                                       |
| `created_by` / `updated_by` columns absent — audit cannot record actor       | I6 (advisory)                                 | reference migration convention (`0001_reference.sql:103-106`)                                                                        |

---

## After — STYNX-compliant rewrite

```sql
-- migrations/0001_invoices.sql (after port)
BEGIN;

-- ----------------------------------------------------------------------------
-- SECTION 0. Assumptions: platform schemas, helpers, and roles already exist.
-- See packages/data/migrations/platform/0001..0012_*.sql.
-- ----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS sample AUTHORIZATION stynx_owner;
GRANT USAGE  ON SCHEMA sample TO stynx_app, stynx_reader;

ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA sample
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stynx_app;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA sample
  GRANT SELECT ON TABLES TO stynx_reader;

-- ----------------------------------------------------------------------------
-- SECTION 1. Soft-deletable domain tables.
-- Each call to data.create_soft_deletable_table produces:
--   - The live table sample.{name}
--   - The archive mirror archive.sample_{name} with archive_id, archived_at,
--     deleted_at, deleted_by, last_erasure_at
--   - RLS + tenant_isolation policy on both
--   - Default archive indexes (id), (tenant_id), (deleted_at DESC)
--   - audit.enable_for(live) and audit.enable_for(archive)
-- ----------------------------------------------------------------------------

-- 1.1 Record — top-level aggregate root
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.record (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES tenancy.tenants(id),

    title         text        NOT NULL,
    email         citext      NOT NULL,
    status        text        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','pending','inactive')),

    created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by    uuid        NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by    uuid        NOT NULL,

    UNIQUE (tenant_id, email)
  );
$$);

-- 1.2 Record note — cascade child of record
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.record_note (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES tenancy.tenants(id),

    record_id     uuid        NOT NULL REFERENCES sample.record(id) ON DELETE RESTRICT,
    -- @softdelete_fk: cascade
    -- A note exists only because of its parent record.

    kind          text        NOT NULL CHECK (kind IN ('primary','secondary','internal')),
    detail        text        NOT NULL,

    created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by    uuid        NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by    uuid        NOT NULL
  );
$$);

-- 1.3 Work item — block child of record, hide child of auth.users
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.work_item (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES tenancy.tenants(id),

    record_id     uuid        NOT NULL REFERENCES sample.record(id) ON DELETE RESTRICT,
    -- @softdelete_fk: block
    -- Archiving a record with active work items must fail loudly (HTTP 409).

    created_by_user_id uuid   NULL
      REFERENCES auth.users(id) ON DELETE SET NULL,
    -- @softdelete_fk: hide
    -- If the creating user is archived, work item lives on; audit retains who
    -- it was. FK column is nullable (LINT009 requires this for `hide`).

    code          text        NOT NULL,
    status        text        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','ready','done','cancelled')),

    created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by    uuid        NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by    uuid        NOT NULL,

    UNIQUE (tenant_id, code)
  );
$$);

-- ----------------------------------------------------------------------------
-- SECTION 2. FK registry entries.
-- The linter normally generates these from the @softdelete_fk annotations.
-- We register them explicitly here for documentation.
-- ----------------------------------------------------------------------------

SELECT data.register_softdelete_fk('sample','record','sample','record_note',
                                   'record_note_record_id_fkey','cascade');
SELECT data.register_softdelete_fk('sample','record','sample','work_item',
                                   'work_item_record_id_fkey','block');
SELECT data.register_softdelete_fk('auth','users','sample','work_item',
                                   'work_item_created_by_user_id_fkey','hide');

-- ----------------------------------------------------------------------------
-- SECTION 3. Domain-specific indexes (beyond the helper defaults)
-- ----------------------------------------------------------------------------

CREATE INDEX idx_record_tenant_status
  ON sample.record (tenant_id, status)
  WHERE status IN ('active','pending');

CREATE INDEX idx_work_item_record
  ON sample.work_item (record_id);

COMMIT;
```

---

## Annotations — what changed and why

1. **Column rename `organization_id → tenant_id`.** The
   `data.create_soft_deletable_table` helper rejects DDL where
   `tenant_id uuid NOT NULL` is missing
   (`packages/data/migrations/platform/0010_data_helpers.sql:54-64`).
   Closes I5. `stynx adopt apply` performs the rename automatically
   (`packages/cli/src/adopt.ts:424-442`).

2. **`deleted` / `deleted_at` / `deleted_by` columns removed from live.**
   Soft-deletable tables put deletion metadata on the
   `archive.sample_&#123;name&#125;` mirror only (I8). The helper attaches
   `archive_id`, `archived_at`, `deleted_at`, `deleted_by`,
   `last_erasure_at` to the mirror automatically
   (`0010_data_helpers.sql:32-117`). See
   [`08-MIGRATION-PATTERNS.md`](../08-MIGRATION-PATTERNS.md) "Pattern:
   tenant-scoped table the right way" and Anti-pattern 2 in
   [`06-DATA-LAYER-PATTERNS.md`](../06-DATA-LAYER-PATTERNS.md).

3. **Hand-written `CREATE TABLE` replaced by helper invocation.** The
   helper produces, in one call: live + archive tables; RLS + policies
   on both; default archive indexes; `audit.enable_for` on both. This
   single change closes LINT001, LINT002, and the missing-audit pitfall
   ([`16-SPEC-EXCERPTS/audit-model.md`](../16-SPEC-EXCERPTS/audit-model.md)
   "Critical pitfalls" §1).

4. **`ON DELETE CASCADE` ⇒ `ON DELETE RESTRICT` + `@softdelete_fk: cascade`
   annotation.** STYNX cascade is _application-level_: the engine walks
   `core.softdelete_fk_registry` and moves children to `archive.*` in
   the same transaction (`packages/data/src/transaction.ts:519`). A
   DB-level CASCADE would delete children outright, bypassing audit
   triggers and the depth/row caps. See Anti-pattern 3 in
   [`06-DATA-LAYER-PATTERNS.md`](../06-DATA-LAYER-PATTERNS.md). LINT004
   enforces the annotation (`tools/migration-linter/src/lint.ts:577-586`).

5. **`block` annotation on `record_id` of `work_item`.** Composite
   business rule: archiving a record with live work items should fail
   loudly. The runtime catches the `foreign_key_violation` at delete
   time and raises `SoftDeleteBlockedError` → HTTP 409 with a
   `SOFT_DELETE_BLOCKED_BY_CHILDREN` body
   (`packages/data/src/transaction.ts:359`). FK is `NOT NULL` because
   the relationship is required.

6. **`hide` annotation on `created_by_user_id`.** When the creating
   user is archived, the work item itself survives; the orphaned link
   is hidden by the application's read-side filtering. Two
   non-negotiable rules for `hide`:
   - The FK column must be **nullable** (LINT009 — `lint.ts:588-597`).
   - The DB-side referential action should be `ON DELETE SET NULL` so
     a hard-delete of the user does not cascade onto the work item.

7. **`citext` for `email`.** Case-insensitive uniqueness without
   `LOWER()` indexes everywhere. Extension assumed loaded by
   `packages/data/migrations/platform/0002_extensions.sql`.

8. **`created_by` / `updated_by` columns kept.** Not enforced by the
   helper but required by convention — the audit pipeline reads them
   in the `before`/`after` JSONB delta. The reference migration includes
   them on every table (`0001_reference.sql:103-106`).

9. **`UNIQUE (tenant_id, email)`.** Composite uniqueness with
   `tenant_id` as the leading column is the canonical form for
   per-tenant uniqueness. Archive mirrors do **not** carry uniqueness
   constraints (`0010_data_helpers.sql:199-201`); restore conflict is
   detected by the runtime via `pg_constraint` introspection
   (`packages/data/src/transaction.ts:702`).

10. **GRANTs explicit.** Default privileges in the `sample` schema send
    DML grants to `stynx_app` and SELECT-only to `stynx_reader`. This is
    what makes `@ReadOnly()` routes safe at the role level — the
    `stynx_reader` pool simply has no INSERT/UPDATE/DELETE grant.

11. **`audit.enable_for` not called explicitly.** The helper calls it
    on both live and mirror (`0010_data_helpers.sql:113-114`). For
    hand-written tables that bypass the helper, you must call it
    yourself or risk a silently un-audited table
    ([`16-SPEC-EXCERPTS/audit-model.md`](../16-SPEC-EXCERPTS/audit-model.md)
    "Critical pitfalls" §1).

### Linter rules touched by this rewrite

| Rule                                  | What the after version satisfies                                                   | Source            |
| ------------------------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| LINT001 (RLS + policy)                | Helper enables FORCE RLS and creates `tenant_isolation` policy on both             | `lint.ts:524-545` |
| LINT002 (archive mirror)              | Helper creates `archive.sample_*` for every table                                  | `lint.ts:550-560` |
| LINT003 (paired ALTER)                | N/A here (no ALTER) — covered if you later use `data.alter_soft_deletable_table`   | `lint.ts:602-618` |
| LINT004 (FK annotation)               | Every FK to a soft-deletable parent carries `@softdelete_fk: cascade\|block\|hide` | `lint.ts:577-586` |
| LINT005 (destructive)                 | N/A — no DROP/TRUNCATE                                                             | `lint.ts:454-463` |
| LINT006 (`SECURITY DEFINER` approval) | N/A — no functions defined here                                                    | `lint.ts:465-474` |
| LINT007 (`audit.*` grants)            | N/A — no GRANT to `audit.*`                                                        | `lint.ts:476-485` |
| LINT008 (archive name collision)      | Each table maps to a unique `archive.sample_&#123;name&#125;`                      | `lint.ts:504-512` |
| LINT009 (`hide` nullable)             | `created_by_user_id` is nullable                                                   | `lint.ts:588-597` |

`[GAP — FIND-004 still flagged at discovery commit; the linter test
fails on repo migrations. Run the linter as advisory, not blocking,
until FIND-004 closes (see [`08-MIGRATION-PATTERNS.md`](../08-MIGRATION-PATTERNS.md)
"Audit caveat — FIND-004").]`

### Migrating existing data

If the legacy table already has rows with `deleted = true`, do **not**
copy them into the live table. Use `data.adopt_soft_deletable_table` to
move them into the archive mirror in one shot:

```sql
-- After the rename to tenant_id, but before introducing the helper-managed
-- form, run the adoption helper. It (1) creates the archive mirror,
-- (2) copies all rows where deleted = true into it, (3) DELETEs them
-- from live. Then DROP the deleted/deleted_at/deleted_by columns.
SELECT data.adopt_soft_deletable_table(
  'sample.record'::regclass,
  soft_delete_column := 'deleted',
  deleted_at_column  := 'deleted_at',
  deleted_by_column  := 'deleted_by'
);

ALTER TABLE sample.record
  DROP COLUMN deleted,         -- @destructive: approved-by=PORT-0001
  DROP COLUMN deleted_at,      -- @destructive: approved-by=PORT-0001
  DROP COLUMN deleted_by;      -- @destructive: approved-by=PORT-0001
```

The `@destructive: approved-by=&lt;ticket&gt;` annotation is what LINT005
checks (`lint.ts:454-463`). Keep the ticket id real — it's a
search anchor for incident forensics. The `stynx adopt apply` codemod
emits this scaffolding for tables it detects as
`adHocSoftDeleteTables` (`packages/cli/src/adopt.ts:424-442`).
