# Soft-Delete Model

> **Sources:** `specs/STYNX-SPEC-v0.6.md` §14 (lines 658–840),
> `specs/STYNX-ADR-001-soft-delete.md` (286 lines).
> **Spec version:** v0.6 + ADR-001.

## Core idea

Soft-deleting a live row **moves** it to a mirrored table in the
`archive` schema. The live table stops seeing the row; the archive
retains it permanently. Default ON for every tenant-scoped table.
Opt out with `@NoSoftDelete('reason')` on the entity model **and** a
`-- @no_soft_delete: <reason>` migration annotation.

## `is_active` is **not** soft delete

`auth.users` and `tenancy.tenants` carry `is_active` for _temporary
suspension_. Orthogonal to soft delete, which represents
_removed-with-recall_. The two compose: a tenant can be `is_active=
false` and later soft-deleted. `stynx doctor` emits an info note when
a soft-deletable live table also carries `is_active`.

## Archive mirror schema (§14.2)

Naming: `archive.{schema}_{table}`. Example: `sample.example_entity`
→ `archive.sample_example_entity`.

```sql
CREATE TABLE archive.sample_example_entity (
  archive_id   bigserial PRIMARY KEY,    -- repeated archives of same id over time
  id           uuid NOT NULL,            -- original live.id
  tenant_id    uuid NOT NULL,
  -- all original domain columns, mirrored verbatim ...
  created_at   timestamptz NOT NULL,
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL,
  updated_by   uuid NOT NULL,
  archived_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at   timestamptz NOT NULL,
  deleted_by   uuid NOT NULL
);

CREATE INDEX idx_archive_sample_example_entity_id         ON archive.sample_example_entity(id);
CREATE INDEX idx_archive_sample_example_entity_tenant     ON archive.sample_example_entity(tenant_id);
CREATE INDEX idx_archive_sample_example_entity_deleted_at ON archive.sample_example_entity(deleted_at DESC);

ALTER TABLE archive.sample_example_entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.sample_example_entity FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON archive.sample_example_entity
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

Constraints on archive shape:

- **No FKs** on archive tables (snapshot semantics).
- **No unique constraints** beyond the surrogate PK (a single live
  `id` may have multiple archive rows from repeated delete/restore).
- **RLS mandatory** — archive is tenant-scoped just like live.
- **Not partitioned in v1.0.**
- **Naming-collision detection** by the migration linter.

## Mirror generation — `data.create_soft_deletable_table` (§14.3)

The helper is the **primary authoring surface**. Hand-written
mirrors are an escape hatch — divergence is caught by the linter.

```sql
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.example_entity (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    -- domain columns ...
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
  );
$$);
```

This emits live + archive + full RLS on both + default archive
indexes + `audit.enable_for()` on both.

Schema evolution:

```sql
SELECT data.alter_soft_deletable_table('sample.example_entity',
  'ADD COLUMN priority smallint NOT NULL DEFAULT 0');
-- live + archive in lockstep
```

Archive Drizzle types are **hidden** from consumer code
(`packages/data/src/internal/archive-schema.ts`). Application code
sees the mirror only via `withDeleted()` / `onlyDeleted()` query
helpers, never via direct `archive.*` imports.

## FK annotations (§14.7) — mandatory, no default

Every FK to a soft-deletable parent **must** carry one of:

```sql
-- @softdelete_fk: hide
-- @softdelete_fk: cascade
-- @softdelete_fk: block
```

The migration linter rejects any FK to a soft-deletable parent
without an annotation. The annotation is registered into
`core.softdelete_fk_registry` for runtime lookup.

### `block`

Parent cannot be soft-deleted while active children exist.
DB-level: `ON DELETE RESTRICT`. Runtime catches the
`foreign_key_violation` and returns 409 with structured blocker
list:

```json
{
  "code": "SOFT_DELETE_BLOCKED_BY_CHILDREN",
  "parent": { "schema": "sample", "table": "record", "id": "..." },
  "blocking_children": [
    { "schema": "sample", "table": "work_item", "count": 47, "sample_ids": ["...", "...", "..."] }
  ]
}
```

Use when children have independent lifecycle.

### `cascade`

Children compositionally part of parent. Archiving parent archives
children atomically (depth & row limits enforced — defaults 4 / 100,
overridable per call via `SoftDeleteOptions`). Runtime: depth-first
walk through registry; same `deleted_at` timestamp on all rows.

### `hide`

Children remain in live but show as orphaned. Application-layer
filtering should hide them in user-facing views. Used for FKs to
parents that are routinely archived (e.g. user → audit_event_actor)
where audit data must persist.

## Restore semantics (§14.6)

- Validates all unique constraints on live before move.
- 409 `RESTORE_CONFLICT` if a constraint would fail.
- If multiple archive rows for same `id`, operates on latest by
  `deleted_at` unless `archiveId` provided.
- Restore does **not** auto-cascade. If the row was originally
  cascade-archived, response includes
  `archived_cascade_children` with hint to use
  `?cascade=true`.

`restoreWithCascade(table, id)`: restores parent + every archived
descendant whose `deleted_at` matches the parent's (timestamp-equality
match — avoids restoring children archived in unrelated operations).
Requires `:restore:*` on every child table.

## Cascade limits

Defaults from `core.config`:

- `maxCascadeDepth` = 4
- `maxCascadeRows` = 100

Overridable per call via `SoftDeleteOptions`. Exceeding raises
`CascadeTooDeepError` / `CascadeTooLargeError` (HTTP 409).

## Operations matrix (§14.5)

| Op                    | HTTP                                            | DB effect           | Permission                 | Audit tags                  |
| --------------------- | ----------------------------------------------- | ------------------- | -------------------------- | --------------------------- |
| Soft delete           | `DELETE /things/{id}`                           | live → archive      | `thing:delete:*`           | `soft_delete, archived`     |
| Hard delete (live)    | `DELETE /things/{id}?hard=true`                 | DELETE FROM live    | `thing:hard_delete:*`      | `hard_delete`               |
| Hard delete (archive) | `DELETE /_archive/{table}/{archive_id}` (admin) | DELETE FROM archive | `platform:archive_purge:*` | `hard_delete, from_archive` |
| Restore               | `POST /things/{id}/restore`                     | archive → live      | `thing:restore:*`          | `restore, from_archive`     |
| List                  | `GET /things`                                   | live only           | `thing:read:*`             | n/a                         |
| List with deleted     | `GET /things?include_deleted=true`              | live ∪ archive      | `thing:read_trash:*`       | n/a                         |
| Trash list            | `GET /things/_trash`                            | archive only        | `thing:read_trash:*`       | n/a                         |

## ADR-001 highlights

ADR-001 (`specs/STYNX-ADR-001-soft-delete.md`) decides:

- **Helper as default** authoring surface.
- **Archive Drizzle types hidden** from consumer barrels.
- **FK annotation mandatory** — no implicit default.
- **Cascading restore** uses per-child `:restore:*` permissions; no
  separate `:restore_cascade:*`.
- **No `archived_links jsonb` sidecar** in v1.0; historical FK
  topology is reconstructable from audit if needed.
