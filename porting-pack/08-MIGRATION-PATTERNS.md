# 08 — Migration Patterns

> **Audience:** an agent porting another codebase to STYNX, or extending
> a STYNX consumer with a new domain schema. Every pattern in this file
> compiles against the platform helpers shipped by `@stynx/data`'s
> bootstrap migrations and is enforced by the migration linter at
> `tools/migration-linter/src/lint.ts`.
>
> **Sources read end-to-end for this file:**
>
> - `porting-pack/_DISCOVERY.md` (§6 migration system, §7 linter, §11 open Qs)
> - `porting-pack/16-SPEC-EXCERPTS/soft-delete-model.md`
> - `porting-pack/16-SPEC-EXCERPTS/audit-model.md`
> - `porting-pack/04-INVARIANTS-AND-CONTRACTS.md`
> - `specs/STYNX-REFERENCE-MIGRATION.sql` (468 lines, full read)
> - `packages/data/migrations/platform/0001_roles.sql` … `0012_*.sql`
>   (full read of `0010_data_helpers.sql`; spot-read of others)
> - `apps/reference-api/migrations/0001_reference.sql` (485 lines, full
>   read)
> - `tools/migration-linter/src/lint.ts` (636 lines, full read)
> - `tools/migration-linter/src/types.ts`
> - `packages/cli/src/adopt.ts` (525 lines, full read)
>
> **Source baseline:** commit `670d165253efd66113e338cd0c79d4c8fcbc8be7`
> on branch `clean/doc-pass`, 2026-04-27.

---

## Migration order

The runtime database that backs a STYNX consumer is built in three
layers, applied in this order. Skipping or reordering layers produces
RLS bypasses, broken FK references, and silent un-audited tables.

### 1. Platform migrations from `@stynx/data`

Run first. Located at
`packages/data/migrations/platform/`. The thirteen files at the
discovery commit:

```
0001_roles.sql                 — roles: stynx_owner / stynx_app / stynx_reader
0002_extensions.sql            — pgcrypto, citext, etc.
0003_schemas.sql               — core / tenancy / auth / audit / storage / archive / data / public
0004_tenancy.sql               — tenancy.tenants + lifecycle states
0005_auth.sql                  — auth.users / memberships / roles / perms
0006_auth_effective_hash.sql   — perms_hash machinery (ADR-002 cache key)
0007_core.sql                  — core.config / core.idempotency_keys / core.softdelete_fk_registry / core.pii_map
0008_audit.sql                 — audit.log + audit.fn_row_change() + audit.enable_for()
0009_grants_ddl_privileges.sql — role grants & default privileges
0010_data_helpers.sql          — data.create_soft_deletable_table, alter_, ensure_archive_mirror, register_softdelete_fk, adopt_soft_deletable_table
0011_storage.sql               — storage.* tables + RLS
0012_ratelimit_idempotency.sql — rate-limit + idempotency tables
0012_tenancy_lifecycle.sql     — tenancy lifecycle (note: shares the 0012 prefix)
```

Filenames are lexicographically sorted by the runner. The two
`0012_*.sql` files share a prefix; see "Duplicate `0012_*.sql`
prefix" below.

### 2. Consumer migrations layer on top

A consumer ships its own migration directory (the reference app uses
`apps/reference-api/migrations/`) holding files like
`0001_reference.sql`. Consumer migrations:

- **assume** all platform schemas, roles, helpers, and tables already
  exist (see `apps/reference-api/migrations/0001_reference.sql:36-59`
  for the canonical preamble);
- **never** redefine `data.*` / `audit.*` helpers;
- **must** themselves be linted and emit the `audit.enable_for(...)` /
  RLS / archive-mirror calls — directly or via
  `data.create_soft_deletable_table(...)`.

### 3. Migration runner is `@stynx/cli`'s `migrate` command

`packages/cli/src/migrate.ts` implements `stynx migrate up | down |
redo | status` (per `_DISCOVERY.md` §8). The runner reads from a
configurable migrations directory, applies files in lexicographic
order, and records applied entries in a tracking table.

**Invocation note from `_DISCOVERY.md` §8 / §11:** at the discovery
commit `pnpm --filter @stynx/cli exec stynx --help` does **not**
resolve a `stynx` bin (`Command "stynx" not found`). Consuming agents
should invoke the CLI through `node packages/cli/dist/main.js` or via
the wrapper script their app exposes — **not** via `pnpm exec stynx`
at the filter scope. `[GAP — bin-name resolution]`.

### Duplicate `0012_*.sql` prefix — how to handle

Two files at the same numeric prefix:

- `0012_ratelimit_idempotency.sql`
- `0012_tenancy_lifecycle.sql`

Lexicographic sort places `ratelimit_idempotency` before
`tenancy_lifecycle` (`'r' < 't'` byte-wise), so the deterministic
order today is:

```
0012_ratelimit_idempotency.sql   ← runs first
0012_tenancy_lifecycle.sql       ← runs second
```

Consumer migrations starting at `0001_*.sql` are layered after both.
**Before porting**, verify against `_DISCOVERY.md` §11 item 2 — the
discovery flagged this as a MAJOR ordering surprise risk for
consumer migrations that themselves want to start at low numeric
prefixes. Recommended consumer practice:

- Start consumer migrations at `0001_*.sql` in their **own**
  directory (the runner tracks platform vs consumer separately, per
  `stynx migrate` semantics).
- If you must interleave, prefix consumer files with a wider band
  (e.g. `1000_*.sql` upward) to leave headroom for future platform
  migrations.

`[GAP — _DISCOVERY.md §11 leaves "ordering expectations" open;
re-verify in the migration runner code at
`packages/cli/src/migrate.ts` before committing a port.]`

---

## SQL helpers exposed by the platform

All defined in
`packages/data/migrations/platform/0010_data_helpers.sql`. Every
helper is `SECURITY DEFINER`, owned by `stynx_owner`, and revoked
from `PUBLIC`. The `@security-definer-approved:
platform-architects/STYNX-I5` annotation accompanies each definition
to satisfy the linter rule LINT006 (see below).

| Helper                             | Signature                                                                                                     | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                | File:line                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `data.archive_mirror_name`         | `(schema_name text, table_name text) RETURNS text`                                                            | Compute canonical archive table name and reject mismatched COMMENT-bound mirrors.                                                                                                                                                                                                                                                                                                                                      | `0010_data_helpers.sql:6-29`    |
| `data.ensure_archive_mirror`       | `(live_table regclass) RETURNS text`                                                                          | Idempotent creation of the archive mirror; enforces `tenant_id uuid NOT NULL` on the live; emits `LIKE … INCLUDING DEFAULTS GENERATED IDENTITY COMMENTS`; adds `archive_id`/`archived_at`/`deleted_at`/`deleted_by`/`last_erasure_at`; sets owner; enables/forces RLS on live and mirror; (re)creates `tenant_isolation` policy on both; creates default archive indexes; calls `audit.enable_for` on live and mirror. | `0010_data_helpers.sql:32-117`  |
| `data.create_soft_deletable_table` | `(ddl text) RETURNS void`                                                                                     | Parses the embedded `CREATE TABLE schema.table (...)` DDL, asserts the live does not yet exist, validates the future archive mirror name, executes the DDL, then calls `data.ensure_archive_mirror` on the result.                                                                                                                                                                                                     | `0010_data_helpers.sql:120-146` |
| `data.alter_soft_deletable_table`  | `(live_table regclass, alter_stmt text) RETURNS void`                                                         | Strips a leading `ALTER TABLE …` clause from `alter_stmt`, accepts only `ADD COLUMN` / `DROP COLUMN` / `ALTER COLUMN … TYPE`; `DROP COLUMN` requires `@destructive`; runs the action against live then mirror in lockstep, **except** that `ADD CONSTRAINT` / `UNIQUE` / `REFERENCES` / `CHECK` actions are applied to live only (archive must not carry FKs/uniqueness — see soft-delete-model.md).                   | `0010_data_helpers.sql:149-206` |
| `data.register_softdelete_fk`      | `(parent_schema, parent_table, child_schema, child_table, fk_constraint, behavior) RETURNS void`              | Upsert into `core.softdelete_fk_registry`; rejects any `behavior` outside `('hide','cascade','block')`.                                                                                                                                                                                                                                                                                                                | `0010_data_helpers.sql:209-252` |
| `data.softdelete_fk_audit`         | `() RETURNS TABLE(parent_schema, parent_table, child_schema, child_table, fk_constraint)`                     | List FKs whose parent has an archive mirror but which are **not** in `core.softdelete_fk_registry` — i.e. drift between DDL and runtime registry. Used by `stynx doctor`-class checks.                                                                                                                                                                                                                                 | `0010_data_helpers.sql:255-284` |
| `data.adopt_soft_deletable_table`  | `(live_table regclass, soft_delete_column text, deleted_at_column text, deleted_by_column text) RETURNS void` | Adoption helper for legacy tables that already carry an `is_deleted`-style boolean. Calls `ensure_archive_mirror`, copies all rows where the soft-delete column is `true` into the mirror, then `DELETE`s them from live.                                                                                                                                                                                              | `0010_data_helpers.sql:287-366` |

Trailing GRANT/REVOKE block at `0010_data_helpers.sql:368-389`
removes `PUBLIC` execution and grants `stynx_owner` only.

### A note on the `audit.enable_for` helper

`audit.enable_for(table regclass)` is shipped by
`packages/data/migrations/platform/0008_audit.sql` and is called
**automatically** by `data.ensure_archive_mirror` for both live and
mirror (lines 113–114). Hand-rolled `CREATE TABLE` migrations that
bypass the helper must call it themselves or the table is silently
un-audited (see `audit-model.md` "Critical pitfalls" §1).

---

## Pattern: tenant-scoped table the right way

The canonical authoring surface is
`data.create_soft_deletable_table($$ … $$)`. One call yields:

- the live `sample.{name}` table,
- the mirror `archive.sample_{name}` with
  `archive_id`/`archived_at`/`deleted_at`/`deleted_by`/`last_erasure_at`,
- RLS + `tenant_isolation` policy on **both**,
- default archive indexes `(id)`, `(tenant_id)`, `(deleted_at DESC)`,
- `audit.enable_for(live)` and `audit.enable_for(archive)`.

Cited from `apps/reference-api/migrations/0001_reference.sql:88-110`
(the `sample.record` aggregate root):

```sql
-- 2.1 Record — top-level tenant-scoped aggregate root
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.record (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES tenancy.tenants(id),

    title         text        NOT NULL,
    email         citext      NOT NULL,
    external_ref  text        NULL,
    status        text        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','pending','inactive')),

    owner_user_id uuid NULL
      REFERENCES auth.users(id) ON DELETE SET NULL,

    created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by    uuid        NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by    uuid        NOT NULL,

    UNIQUE (tenant_id, email)
  );
$$);
```

What the helper enforces (per `0010_data_helpers.sql:54-64`): the
embedded DDL **must** declare `tenant_id uuid NOT NULL`. Omitting it
or making it nullable raises:

```
Soft-deletable tables must include tenant_id uuid not null
```

What it does **not** enforce: the existence of `created_at` /
`created_by` / `updated_at` / `updated_by`. The reference migration
includes them by convention; consumer ports SHOULD too — they are
the columns the audit pipeline reads through `before` / `after`
JSONB deltas.

---

## Pattern: adding a column to a soft-deletable table

Use `data.alter_soft_deletable_table('schema.table', '<action>')`.
The helper rewrites the action onto live and mirror in lockstep,
honoring the constraint that mirrors do not carry FKs/uniqueness
(see soft-delete-model.md §"Constraints on archive shape").

Spec-cited form (from `soft-delete-model.md:89-93`):

```sql
SELECT data.alter_soft_deletable_table('sample.example_entity',
  'ADD COLUMN priority smallint NOT NULL DEFAULT 0');
-- live + archive in lockstep
```

Accepted action prefixes (per `0010_data_helpers.sql:188`):

- `ADD COLUMN …`
- `DROP COLUMN …` (requires `@destructive` annotation in the
  `alter_stmt` text — `0010_data_helpers.sql:192-194`)
- `ALTER COLUMN … TYPE …`

Anything else raises `Unsupported alter for soft-deletable table:
%`.

When the action contains `ADD CONSTRAINT` / `UNIQUE` / `REFERENCES`
/ `CHECK`, the helper applies it to **live only** and skips the
mirror (`0010_data_helpers.sql:199-201`) — archive tables intentionally
have no FKs and no uniqueness beyond the surrogate `archive_id` PK.

DROP COLUMN with the destructive marker:

```sql
SELECT data.alter_soft_deletable_table(
  'sample.work_item',
  'DROP COLUMN obsolete_flag -- @destructive: approved-by=PROJ-1234'
);
```

The linter independently enforces `@destructive: approved-by=<ticket>`
on `DROP COLUMN` / `DROP TABLE` / `TRUNCATE` (LINT005, see below).

### When you must hand-roll an ALTER

If you have a structural change the helper cannot express, write
**paired** ALTERs in the same migration: one for live, one for
mirror. The linter's LINT003 rule keys off this pairing
(`lint.ts:602-618`). Example:

```sql
-- live
ALTER TABLE sample.work_item
  ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', code)) STORED;

-- mirror (paired in the same file — required to silence LINT003)
ALTER TABLE archive.sample_work_item
  ADD COLUMN search_vector tsvector;  -- archive must not carry GENERATED expressions
```

---

## Pattern: declaring an FK to a soft-deletable parent

Every FK whose parent table has an archive mirror MUST carry one of
three annotations on the column line, parsed by the linter at
`lint.ts:275`:

```
-- @softdelete_fk: hide
-- @softdelete_fk: cascade
-- @softdelete_fk: block
```

The annotation is also registered into `core.softdelete_fk_registry`
via `data.register_softdelete_fk(...)` (idempotent upsert,
`0010_data_helpers.sql:209-252`). The runtime soft-delete cascade
engine reads from that registry.

### `cascade` — children archived atomically with parent

From `apps/reference-api/migrations/0001_reference.sql:113-135`:

```sql
-- 2.2 Record note — cascade child of record
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.record_note (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES tenancy.tenants(id),

    record_id     uuid        NOT NULL REFERENCES sample.record(id) ON DELETE RESTRICT,
    -- @softdelete_fk: cascade
    -- Rationale: a note only exists because of its parent record.

    kind          text        NOT NULL CHECK (kind IN ('primary','secondary','internal')),
    label         text        NOT NULL,
    detail        text        NOT NULL,
    /* … */
    created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by    uuid        NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by    uuid        NOT NULL
  );
$$);
```

Use when children are compositionally part of the parent. Cascade
limits (defaults from `core.config`) are `maxCascadeDepth = 4`,
`maxCascadeRows = 100`, overridable per call.

### `block` — parent cannot be archived while children are alive

From `apps/reference-api/migrations/0001_reference.sql:138-168`:

```sql
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.work_item (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES tenancy.tenants(id),

    record_id     uuid        NOT NULL REFERENCES sample.record(id) ON DELETE RESTRICT,
    -- @softdelete_fk: block
    -- Rationale: deleting a record with active work items should fail loudly.

    /* … remainder of columns … */
    UNIQUE (tenant_id, code)
  );
$$);
```

Note the FK is `NOT NULL` (required for `block`) and the DB-level
behavior is `ON DELETE RESTRICT`. The runtime catches the
`foreign_key_violation` and returns HTTP 409 with the structured
`SOFT_DELETE_BLOCKED_BY_CHILDREN` body shown in
`soft-delete-model.md:118-129`.

### `hide` — children orphaned, hidden by application filtering

Continuing the same migration block at lines 147-152:

```sql
    created_by_user_id uuid   NULL
      REFERENCES auth.users(id) ON DELETE SET NULL,
    -- @softdelete_fk: hide
    -- Rationale: if the creating user is archived, the work item keeps living;
    -- the audit log retains who it was. FK column is nullable per `hide` rules.
```

Two non-negotiable rules for `hide`:

1. The FK column **must** be nullable. The linter's LINT009 rule at
   `lint.ts:588-597` rejects a `hide` annotation on a `NOT NULL`
   column.
2. The table-level FK should typically be `ON DELETE SET NULL` so
   that hard-deleting the parent does not cascade-delete the child.

### Explicit registry insertion (optional)

Even with annotations, you may insert into the registry directly for
documentation:

```sql
SELECT data.register_softdelete_fk('sample','record','sample','record_note',
                                   'record_note_record_id_fkey','cascade');
SELECT data.register_softdelete_fk('sample','record','sample','work_item',
                                   'work_item_record_id_fkey','block');
SELECT data.register_softdelete_fk('auth','users','sample','work_item',
                                   'work_item_created_by_user_id_fkey','hide');
```

(Verbatim from `apps/reference-api/migrations/0001_reference.sql:222-233`.)

---

## Pattern: opting out of soft delete

Some tables are not soft-deletable by design — append-only logs,
materialized read models, ephemeral scratch tables. Opting out
requires **two** declarations that must agree:

1. **TS entity model:** `@NoSoftDelete('reason')` on the Drizzle
   schema, surfaced from `@stynx/data`'s `table-markers` barrel
   (`_DISCOVERY.md` §10 — `* from './table-markers'`).
2. **SQL migration:** `-- @no_soft_delete: <reason>` annotation in
   the same migration that declares the `CREATE TABLE`. The linter
   parses it at `lint.ts:133`:
   ```ts
   noSoftDelete: /@no_soft_delete\s*:/i.test(statement.text),
   ```
   When set, the linter skips LINT002 archive-mirror enforcement for
   that table (`lint.ts:547`).

Example:

```sql
-- @no_soft_delete: append-only audit-style log; rotation handled by partition detach
CREATE TABLE sample.event_log (
  id           bigserial PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants(id),
  payload      jsonb NOT NULL,
  occurred_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE sample.event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample.event_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sample.event_log
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

SELECT audit.enable_for('sample.event_log');
```

The TypeScript companion (illustrative; consult `@stynx/data`
table-markers for the exact decorator surface — `[GAP — symbol name
not enumerated in this pass; verify in the table-markers barrel]`):

```ts
import { pgTable } from 'drizzle-orm/pg-core';
import { NoSoftDelete } from '@stynx/data';

export const eventLog = NoSoftDelete(
  'append-only audit-style log; rotation handled by partition detach',
)(
  pgTable('event_log', {
    /* columns … */
  }),
);
```

If the SQL annotation is present but the TS marker is not (or vice
versa), runtime guards in `@stynx/data` raise — divergence is a
fail-closed condition.

---

## Pattern: opting out of audit

Symmetric to the soft-delete opt-out. Two declarations:

1. **TS entity model:** `@NoAudit('reason')` from `@stynx/data`
   table-markers.
2. **SQL migration:** `-- @no_audit: <reason>` annotation in the
   migration that declares the table; **and** the migration must
   _not_ call `audit.enable_for(...)` on the table. The
   `audit-model.md` "Migration helper" section explicitly notes:
   > `@NoAudit('reason')` opts a table out — the SQL annotation
   > `-- @no_audit: <reason>` must accompany the migration; the linter
   > enforces both.

`[GAP — at the discovery commit the linter source at
`tools/migration-linter/src/lint.ts`does **not** include an explicit
LINT00X code keyed to`@no_audit`. The LINT_CODES tuple in
`types.ts:1-11` enumerates only LINT001…LINT009 with the meanings
inferred below. Re-verify before treating the audit opt-out as
linter-enforced; it may be enforced only by the platform runtime.]`

Example:

```sql
-- @no_audit: high-volume cache table; audit cost would dominate
CREATE TABLE sample.search_cache (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants(id),
  query_hash   bytea NOT NULL,
  result       jsonb NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE sample.search_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample.search_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sample.search_cache
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Note: NO audit.enable_for(...) call here.
-- Note: also opt out of soft-delete since the cache is regenerable.
-- @no_soft_delete: regenerable cache; no archive needed.
```

The matching TS marker:

```ts
import { NoAudit, NoSoftDelete } from '@stynx/data';

export const searchCache = NoAudit('high-volume cache; audit cost would dominate')(
  NoSoftDelete('regenerable cache')(
    pgTable('search_cache', {
      /* … */
    }),
  ),
);
```

---

## Pattern: PII map entries

The PII map lives in `core.pii_map`, defined at
`packages/data/migrations/platform/0007_core.sql:48-59`:

```sql
CREATE TABLE IF NOT EXISTS core.pii_map (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_schema text NOT NULL,
  table_name   text NOT NULL,
  column_name  text NOT NULL,
  strategy     text NOT NULL,
  category     text,
  notes        text,
  version      bigint NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (table_schema, table_name, column_name)
);
```

The `@stynx/privacy` package's `PiiMapService`
(`packages/privacy/src/pii-map.service.ts:75+`) reads the rows at
LGPD-erasure time. The DB column the service treats as the strategy
key is `strategy` (per `0007_core.sql:53`).

### Entry shape

```sql
INSERT INTO core.pii_map (table_schema, table_name, column_name, category, strategy, notes)
VALUES (...)
ON CONFLICT (table_schema, table_name, column_name) DO UPDATE
  SET category = EXCLUDED.category,
      strategy = EXCLUDED.strategy,
      notes    = EXCLUDED.notes;
```

(Adapted from `apps/reference-api/migrations/0001_reference.sql:356-378`.)

### Strategy enum

The strategies in use across the reference migration (and the spec
draft at `specs/STYNX-REFERENCE-MIGRATION.sql`) are:

| Strategy         | Effect at LGPD erasure                                                                    | Audit tag                                                |
| ---------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `nullify`        | Column set to NULL on the live row (and in the archive row, if present).                  | `tags = {"lgpd_erasure": true, "strategy": "nullify"}`   |
| `hash_with_salt` | Replace value with a salted hash; preserves uniqueness for dedupe but breaks readability. | `tags = {"lgpd_erasure": true, "strategy": "hash"}`      |
| `tombstone`      | Replace with a sentinel (`'[erased]'` etc.); used when downstream code requires non-NULL. | `tags = {"lgpd_erasure": true, "strategy": "tombstone"}` |

(Tag names from `audit-model.md:88` —
`tags = {"lgpd_erasure": true, "strategy": "nullify|hash|tombstone"}`.)

### Category enum (advisory)

The reference migration uses three categories:

| Category         | Meaning                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `direct_pii`     | Column directly identifies a person (name, email, document).                                                 |
| `incidental_pii` | Column carries personal data only because the user wrote it there (free-text).                               |
| `subject_link`   | Column is a FK/link to the user table; erasure handled via the `auth.users` pipeline rather than per-column. |

Worked example — entries for `sample.record` and friends, verbatim
from `apps/reference-api/migrations/0001_reference.sql:356-378`:

```sql
INSERT INTO core.pii_map (table_schema, table_name, column_name, category, strategy, notes)
VALUES
  ('sample', 'record', 'title',        'direct_pii', 'nullify',
    'Display title may contain personal information; nullify on erasure.'),
  ('sample', 'record', 'email',        'direct_pii', 'hash_with_salt',
    'Retain hash for deduplication; source email erased.'),
  ('sample', 'record', 'external_ref', 'direct_pii', 'hash_with_salt',
    'External identifiers may encode user data.'),

  ('sample', 'record_note', 'detail',  'direct_pii',     'nullify', NULL),
  ('sample', 'record_note', 'detail2', 'direct_pii',     'nullify', NULL),
  ('sample', 'record_note', 'region',  'incidental_pii', 'nullify', NULL),
  ('sample', 'record_note', 'code',    'direct_pii',     'nullify', NULL),

  ('sample', 'work_item', 'created_by_user_id', 'subject_link', 'nullify',
    'Link to user; erasure handled via auth.users pipeline.'),

  ('sample', 'work_item_lock', 'external_ref', 'incidental_pii', 'nullify',
    'External references may contain third-party identifiers.')
ON CONFLICT (table_schema, table_name, column_name) DO UPDATE
  SET category = EXCLUDED.category,
      strategy = EXCLUDED.strategy,
      notes    = EXCLUDED.notes;
```

> Note: the spec-side draft at `specs/STYNX-REFERENCE-MIGRATION.sql:340-362`
> uses column names `schema_name` / `erasure_strategy` instead of
> `table_schema` / `strategy`. The implemented schema in
> `0007_core.sql:48-59` and the implemented reference migration win:
> use `table_schema, table_name, column_name, strategy`. `[GAP —
spec needs an erratum to align column names with implementation.]`

---

## Pattern: permission seed inserts

Per invariant **I4** (`04-INVARIANTS-AND-CONTRACTS.md` §I4), every
non-`@Public` / non-`@System` route requires a registered permission
key. Permissions live in `auth.perms` and are mapped to roles via
`auth.role_perms`.

### Implemented form (reference-api as shipped)

From `apps/reference-api/migrations/0001_reference.sql:272-310`:

```sql
INSERT INTO auth.perms (key, description) VALUES
  ('sample:record:read',        'Read records in the tenant.'),
  ('sample:record:write',       'Create or update records.'),
  ('sample:record:delete',      'Soft-delete records.'),
  ('sample:record:restore',     'Restore soft-deleted records.'),
  ('sample:record:hard-delete', 'Hard-delete archived records.'),
  /* … additional resources … */
  ('sample:probe:read',         'Run internal probe routes used by doctor and CI.')
ON CONFLICT (key) DO NOTHING;
```

Convention used by the reference app: `<schema>:<resource>:<action>`
with kebab-case for multi-word actions (e.g. `hard-delete`).

### Spec-form (alternative, broader columns)

The spec draft at `specs/STYNX-REFERENCE-MIGRATION.sql:272-292`
shows a richer columnar form with `key, resource, action, scope,
description` and the convention `resource:action:scope` (e.g.
`record:read:*`, `record:read:own`). The implemented reference app
uses the simpler `(key, description)` form. **Both are valid** —
which one to adopt depends on the column shape of `auth.perms` in
your platform-bootstrap migration. `[GAP — `auth.perms`schema not
re-read in this pass; verify against`packages/data/migrations/platform/0005_auth.sql` before porting a
permission INSERT.]`

### Role mapping

The reference app maps perms onto the four default tenant roles at
`apps/reference-api/migrations/0001_reference.sql:316-347`. The
shape:

```sql
-- Owner: everything
INSERT INTO auth.role_perms (role_id, perm_id)
SELECT r.id, p.id FROM auth.roles r, auth.perms p
 WHERE r.key = 'owner' AND p.key LIKE 'sample:%'
ON CONFLICT DO NOTHING;

-- Admin: everything except hard-delete
INSERT INTO auth.role_perms (role_id, perm_id)
SELECT r.id, p.id FROM auth.roles r, auth.perms p
 WHERE r.key = 'admin'
   AND p.key LIKE 'sample:%'
   AND p.key NOT LIKE '%:hard-delete'
ON CONFLICT DO NOTHING;
```

…and equivalent `WHERE r.key = 'member' AND (p.key LIKE '%:read' OR
p.key LIKE '%:write')` / `r.key = 'viewer' AND p.key LIKE '%:read'`
clauses for the remaining two roles. The default roles `owner` /
`admin` / `member` / `viewer` are seeded by the platform bootstrap
when a tenant is created.

---

## Pattern: dev-only fixture seeds

Production migrations should never seed business data. The reference
app gates fixtures on a session-level GUC, so they run only in dev /
test where the operator has flipped the flag.

### Verified GUC name

The reference migration reads the GUC `stynx.seed_fixtures` at
`apps/reference-api/migrations/0001_reference.sql:387-396`:

```sql
DO $$
DECLARE
  v_seed boolean := COALESCE(current_setting('stynx.seed_fixtures', true)::boolean, false);
  v_tid  uuid;
  v_uid  uuid;
BEGIN
  IF NOT v_seed THEN
    RAISE NOTICE 'Skipping fixture seed (stynx.seed_fixtures not enabled).';
    RETURN;
  END IF;
  /* … insert tenant + user + membership + role assignment … */
END $$;
```

The same GUC name appears in the spec draft at
`specs/STYNX-REFERENCE-MIGRATION.sql:373` (`current_setting('stynx.seed_fixtures', true)`).

`[GAP — the GUC `stynx.seed*fixtures`is **not** declared by any
file under`packages/data/migrations/platform/`at the discovery
commit. (A`grep`for`seed_fixtures`against the platform
migrations returns no matches.) The GUC works because PostgreSQL
permits arbitrary`app.*`/`stynx.\_`-namespaced custom GUCs without
prior declaration, but the platform does not reserve the name. Port
agents using the same convention should document this in their
deployment runbook and consider declaring it via a session-level
`SET` in their bootstrap.]`

### Enabling in dev

```sql
-- One-shot for the current session:
SET stynx.seed_fixtures = on;

-- Persistent at the database level (dev only):
ALTER DATABASE my_dev_db SET stynx.seed_fixtures = on;
```

Or invoke the migration with the flag inline (per the closing
comment at `apps/reference-api/migrations/0001_reference.sql:478-479`):

```bash
ALTER DATABASE <db> SET stynx.seed_fixtures = on;   -- dev only
\i 0001_reference.sql
```

For the full body of a guarded seed (tenant + user + membership +
role-assignment INSERTs inside the `DO` block), see
`apps/reference-api/migrations/0001_reference.sql:387-416` verbatim.

---

## Migration linter rules (LINT001..LINT009)

The linter is the single file
`tools/migration-linter/src/lint.ts` (636 lines, no separate
rule files). Rule codes are listed in
`tools/migration-linter/src/types.ts:1-11`:

```ts
export const LINT_CODES = [
  'LINT001',
  'LINT002',
  'LINT003',
  'LINT004',
  'LINT005',
  'LINT006',
  'LINT007',
  'LINT008',
  'LINT009',
] as const;
```

Each rule's emit-site, message, and one-line description from the
real source:

| Code        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Emit-site                                                                                              | Source line                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **LINT001** | Tenant-scoped table must `ENABLE ROW LEVEL SECURITY` and declare a `tenant_isolation`-style policy in the same migration. Triggered when a hand-written `CREATE TABLE` has a `tenant_id` column but the file lacks either `ALTER TABLE … ENABLE ROW LEVEL SECURITY` or a matching `CREATE POLICY … current_setting('app.tenant_id'…)`. Skipped when `source === 'helper'` (the helper handles RLS itself).                                                         | Two emits — first when RLS is missing, second when RLS is present but the policy regex does not match. | `lint.ts:524-545`                                                        |
| **LINT002** | Soft-deletable table must declare its archive mirror in the same migration **or** be authored via `data.create_soft_deletable_table(...)`. Triggered when an explicit `CREATE TABLE` has `tenant_id` and is **not** annotated `@no_soft_delete`, and there is no matching `archive.{schema}_{table}` `CREATE TABLE` in the same file. Suggestion (when `--include-fix-suggestions`) wraps the original DDL in a `data.create_soft_deletable_table($$ … $$);` call. | `createIssue(... 'LINT002' ...)`                                                                       | `lint.ts:550-560` (suggestion at `lint.ts:373-376`)                      |
| **LINT003** | `ALTER TABLE` on a soft-deletable live table must use `data.alter_soft_deletable_table(...)` **or** be paired with the corresponding archive `ALTER TABLE archive.{…}` in the same migration. Triggered when the live table is in the known soft-set, the alter was **not** issued via the helper, and no paired archive alter is present.                                                                                                                         | `createIssue(... 'LINT003' ...)`                                                                       | `lint.ts:602-618`                                                        |
| **LINT004** | FK to a soft-deletable parent requires `-- @softdelete_fk: hide \| cascade \| block`. Triggered when a CREATE TABLE column carries `REFERENCES <known_soft_table>` but has no `@softdelete_fk:` annotation in its column block.                                                                                                                                                                                                                                    | `createIssue(... 'LINT004' ...)`                                                                       | `lint.ts:577-586`                                                        |
| **LINT005** | Destructive migration statement (`DROP TABLE`, `TRUNCATE`, or `ALTER TABLE … DROP COLUMN`) requires `-- @destructive: approved-by=<ticket>`. Triggered for any matching statement whose text lacks the approval annotation.                                                                                                                                                                                                                                        | `createIssue(... 'LINT005' ...)`                                                                       | `lint.ts:454-463`                                                        |
| **LINT006** | `SECURITY DEFINER` requires `-- @security-definer-approved: <name>/<ticket>`. Triggered for any function/procedure declaration with `SECURITY DEFINER` that lacks the approval annotation.                                                                                                                                                                                                                                                                         | `createIssue(... 'LINT006' ...)`                                                                       | `lint.ts:465-474`                                                        |
| **LINT007** | `audit.*` tables are SELECT-only to `stynx_app`. Triggered when a `GRANT … ON TABLE audit.<…> TO stynx_app` statement grants any privilege beyond plain `SELECT` (case-insensitive, whitespace-normalized).                                                                                                                                                                                                                                                        | `createIssue(... 'LINT007' ...)`                                                                       | `lint.ts:476-485` (helper `grantViolatesAuditRule` at `lint.ts:324-340`) |
| **LINT008** | Archive naming collision: two distinct live tables map to the same `archive.{schema}_{table}` mirror name. Tracked across files via `archiveNameOwners` (a single `Map<archiveName, ownerQualifiedName>` accumulated across the run).                                                                                                                                                                                                                              | `createIssue(... 'LINT008' ...)`                                                                       | `lint.ts:504-512`                                                        |
| **LINT009** | FK using `-- @softdelete_fk: hide` cannot be `NOT NULL`. Triggered when a `hide` annotation is paired with a child column whose `nullable === false` (parsed from the column-line `NOT NULL` flag in `extractForeignKeys`).                                                                                                                                                                                                                                        | `createIssue(... 'LINT009' ...)`                                                                       | `lint.ts:588-597`                                                        |

The linter sorts issues by (file, line, code) at
`lint.ts:625-633` so output is stable. `LintIssue` shape per
`types.ts:15-23`:

```ts
export interface LintIssue {
  code: LintCode;
  file: string;
  message: string;
  line: number;
  statementLine: number;
  table?: string;
  suggestion?: string;
}
```

The `--include-fix-suggestions` flag (per
`types.ts:36-38`) switches on default fix snippets for LINT001 and
LINT002 (`lint.ts:363-376`).

### What the linter does **not** check

Reading `lint.ts` end-to-end shows the rule set is scoped tightly:

- **No** explicit `@no_audit:` enforcement. (`grep -n 'no_audit'
tools/migration-linter/src/*.ts` returns nothing.) The
  audit-model.md text claims the linter enforces it; the source
  does not. `[GAP — spec/source mismatch on `@no_audit`
enforcement; audit opt-out is currently runtime-enforced only.]`
- **No** check for missing `audit.enable_for(...)` calls on
  hand-written tenant-scoped tables. (LINT006/LINT007 deal with
  audit-related grants and definer privileges, not enable_for
  presence.)
- **No** check for FK column nullability for `cascade` / `block`
  (only `hide` is nullability-checked, via LINT009).

---

## Audit caveat — FIND-004

The audit baseline at `docs/work/audit/07-FINDINGS-REGISTER.md`
recorded **FIND-004** as the migration linter test failing on the
repo's own migrations. `_DISCOVERY.md` §0 lists FIND-004 in the set
"still likely live (not re-verified in this discovery pass —
re-check before relying on them)" and §11 item 5 marks it
"BLOCKER if still failing".

Practical implications for porting agents:

- Treating the linter as a **hard CI gate** is premature. Run it as
  an advisory check first; capture the issues against your own
  migrations and the platform migrations alike, then triage.
- The expected re-verification command is roughly:
  ```bash
  pnpm --filter @stynx/migration-linter test
  # or, against arbitrary SQL trees:
  pnpm --filter @stynx/migration-linter exec migration-linter \
    packages/data/migrations/platform \
    apps/reference-api/migrations
  ```
  `[GAP — exact test target name not re-verified in this pass; check
`tools/migration-linter/package.json` scripts.]`
- If the linter does flag platform migrations themselves, the right
  move is **not** to silence the rule but to file a fix against the
  platform migration (e.g. add the missing
  `@security-definer-approved:` line — every helper in
  `0010_data_helpers.sql` already carries one, so LINT006 noise
  there is a parser bug, not a real violation).
- Until FIND-004 closes, downstream gates that depend on the linter
  (CI workflows, pre-merge checks) should run with `continue-on-error:
true` semantics, not as blocking.

Re-verify before treating it as a hard CI gate.

---

## Migration adoption helper — `stynx adopt`

Source: `packages/cli/src/adopt.ts` (525 lines). The CLI surface
exposed via `packages/cli/src/cli.ts` is:

```
stynx adopt scan <repo>                    — diagnose invariant violations in a foreign repo
stynx adopt apply <repo> [--dry-run]       — write codemods + generated migrations
stynx adopt apply-permissions <repo>       — fill in TODO_PERMISSION placeholders
stynx adopt link-cognito-users <repo>      — match auth.users to a Cognito export by email
```

Each top-level export in `adopt.ts`, in the order it is defined:

### `adoptScan(targetDir): AdoptScanReport` — `adopt.ts:197-276`

Walks the target directory (skipping `node_modules`, `.git`, `dist`,
`.turbo` per `walk()` at `adopt.ts:67-81`) and produces a
`AdoptScanReport`. The report's `invariants` block keys directly to
I1 / I4 / I5 / I6 / I8 from `04-INVARIANTS-AND-CONTRACTS.md`:

| Section                                       | Key                   | What it detects                                                                                                                                                             |
| --------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------- | ---------------------------------------- |
| `invariants.rawDbConnection`                  | `callSites: string[]` | Lines matching `(?:pool                                                                                                                                                     | client)\.query\(` (`adopt.ts:216`). |
| `invariants.rawDbConnection`                  | `pgImports: string[]` | Lines matching `from 'pg'` / `require('pg')` (`adopt.ts:219`).                                                                                                              |
| `invariants.routePermissions`                 | `RouteCandidate[]`    | NestJS `@Get/@Post/@Put/@Patch/@Delete` decorators that are **not** preceded by `@Permission/@Public/@System` (`adopt.ts:153-179`).                                         |
| `invariants.tenancy.organizationIdTables`     | `string[]`            | Tenant-scoped tables that use the legacy column name `organization_id` instead of `tenant_id`.                                                                              |
| `invariants.tenancy.missingRlsTables`         | `string[]`            | Tenant-scoped tables without a matching `ALTER TABLE … ENABLE ROW LEVEL SECURITY` in the SQL corpus.                                                                        |
| `invariants.audit.missingAuditTables`         | `string[]`            | Tenant-scoped tables without a matching `audit.enable_for(<table>)` call.                                                                                                   |
| `invariants.softDelete.missingArchiveTables`  | `string[]`            | Tenant-scoped non-`_log` tables without a `data.create_soft_deletable_table` / `data.adopt_soft_deletable_table` call **and** without an `archive.<schema>_<table>` mirror. |
| `invariants.softDelete.adHocSoftDeleteTables` | `string[]`            | Tables that already carry a `deleted` / `deleted_at` column (candidates for `data.adopt_soft_deletable_table`).                                                             |
| `authLayer.customJwtMiddleware`               | `string[]`            | Files that mention `jwt` and `middleware` (heuristic — flag for manual review against `@stynx/auth`).                                                                       |
| `other.readOnlyCandidates`                    | `string[]`            | GET handlers whose name matches `report                                                                                                                                     | utilization                         | calendar | list`— candidates for`@ReadOnly()` (I7). |
| `other.appendOnlyCandidates`                  | `string[]`            | Tables whose name ends `_log` — candidates for `@NoSoftDelete` and partition-detach retention.                                                                              |

The detection helpers used by `adoptScan` are:

- `walk(dir)` — recursive directory walk (`adopt.ts:67-81`).
- `parseSqlTables(targetDir)` — regex-extract every `CREATE TABLE
[IF NOT EXISTS] name (...);` (`adopt.ts:87-105`).
- `scanTables(targetDir)` — coalesce duplicates and tag each table
  with `tenantColumn` (`'tenant_id' | 'organization_id'`) and
  `hasDeletedColumn` (`adopt.ts:107-128`).
- `hasRlsForTable / hasAuditForTable / hasSoftDeleteMirror` —
  per-table regexes against the joined SQL corpus
  (`adopt.ts:130-144`).
- `routeCandidates(targetDir)` — decorator-scan regex
  (`adopt.ts:153-179`).
- `readOnlyCandidates`, `appendOnlyCandidates` —
  `adopt.ts:181-195`.

### `formatAdoptScanHuman(report): string` — `adopt.ts:278-304`

Renders the JSON `AdoptScanReport` as a human-readable
"Compliance report" with `✓ none` / `✗ N <thing>` lines per
invariant. This is what `stynx adopt scan --format=text` prints.

### `adoptApply(targetDir, dryRun = false): AdoptApplyResult` — `adopt.ts:444-490`

Per file, runs three TS codemods in sequence:

- `codemodPoolUsage` (`adopt.ts:339-347`) — rewrites `pg`-direct
  imports and `Pool/Client` usage to `Database` injection from
  `@stynx/data`. Replaces `this.pool.query(…)` with
  `this.db.tx(async (trx) => trx.query(…))`. Replaces
  `new Pool(…)` constructions with a `TODO(stynx-adopt): inject
Database via NestJS DI` comment.
- `codemodAuthMiddleware` (`adopt.ts:349-361`) — flags JWT
  middleware files with a `// DEPRECATED in favor of @stynx/auth.`
  banner so the cutover is reviewable.
- `codemodRoutePermissions` + `injectPermissionImports`
  (`adopt.ts:310-337`) — for any route decorator without a sibling
  `@Permission/@Public/@System`, inject
  `@Permission(TODO_PERMISSION)` and add the import. The
  `TODO_PERMISSION` placeholder is the literal `'TODO' +
'_PERMISSION'` constructed at `adopt.ts:4` so the source code of
  the CLI itself doesn't grep-match a real TODO.

Per table, generates two artifacts in `generated/stynx-adopt/`:

- `schema.ts` — Drizzle schema scaffold from `generateSchemaFile`
  (`adopt.ts:382-422`). Each tenant-scoped non-`_log` table is
  wrapped with `softDeletable(pgTable('…', { … }))`.
- `migrations/<NNNN>_stynx_adopt_<table>.sql` — generated by
  `generateAdoptionMigration` (`adopt.ts:424-442`). Body:
  - rename `organization_id → tenant_id` if needed,
  - call `data.adopt_soft_deletable_table(...)` if a `deleted`-style
    column is present **or** print a `-- Reviewer: wrap … with
data.create_soft_deletable_table(...)` instruction otherwise,
  - `ALTER TABLE … ENABLE ROW LEVEL SECURITY;`,
  - `SELECT audit.enable_for('<table>');`,
  - wrapped in `BEGIN; … COMMIT;`.

`dryRun=true` prints the would-be-changed file list without writing.

### `adoptApplyProposedPermissions(targetDir, replacements): number` — `adopt.ts:492-509`

Take a `Record<placeholder, finalPermissionKey>` mapping and replace
each placeholder occurrence (typically `TODO_PERMISSION`,
`TODO_PERMISSION_RECORDS`, etc.) across the tree. Returns the count
of files changed. Run after `adoptApply` once a human has chosen
the right permission keys.

### `linkCognitoUsers(users, cognitoUsers): LinkCognitoUsersResult` — `adopt.ts:511-524`

Email-based join between an existing `auth.users` export and a
Cognito user-pool export. Returns `{ matched: [...], unmatched:
[...] }` with `cognitoSub` filled in for matches. Does no
side-effects — feeds an UPDATE migration the operator authors.

### Helper functions exported only as types

- `RouteCandidate`, `TableScanResult`, `AdoptScanReport`,
  `AdoptApplyResult`, `LinkCognitoUsersResult` are the public
  interfaces (`adopt.ts:6-59`).
- `SqlTableDefinition` (`adopt.ts:61-65`) is internal.

### When to run `stynx adopt` during a port

1. **`scan`** first against the foreign repo to enumerate the work.
2. **`apply --dry-run`** to preview the codemods.
3. **`apply`** when the dry-run output is acceptable.
4. **Manual review** of the `TODO_PERMISSION` markers; resolve them
   to real keys.
5. **`apply-permissions`** with the resolved map.
6. **`link-cognito-users`** if migrating user identity from a Cognito
   pool — emit the resulting UPDATE script as a follow-up migration.
7. Run the migration linter (advisory until FIND-004 closes — see
   above) against the generated `generated/stynx-adopt/migrations/`
   directory.
8. Hand-edit any `data.adopt_soft_deletable_table` follow-ups that
   the generator left as `-- Reviewer: …` comments.

---

## Cross-references

- Soft-delete behavior, restore semantics, cascade limits:
  `porting-pack/16-SPEC-EXCERPTS/soft-delete-model.md`.
- Audit triggers, GUC suppression, retention classes:
  `porting-pack/16-SPEC-EXCERPTS/audit-model.md`.
- Invariants I1, I5, I6, I8 (the migration-relevant ones):
  `porting-pack/04-INVARIANTS-AND-CONTRACTS.md`.
- Reference migration as the canonical worked example:
  `apps/reference-api/migrations/0001_reference.sql`.
- Helper source of truth:
  `packages/data/migrations/platform/0010_data_helpers.sql`.
- Linter source of truth: `tools/migration-linter/src/lint.ts`,
  `tools/migration-linter/src/types.ts`.
- Adoption helper source of truth: `packages/cli/src/adopt.ts`.
