# `@stynx/data` — API Contract

&gt; **Source:** `specs/STYNX-API-DATA.md` (618 lines), cross-checked
&gt; against `packages/data/src/index.ts`,
&gt; `packages/data/src/transaction.ts`, and `packages/data/src/database.ts`.
&gt; **Spec version:** v1.0 contract paired with SPEC v0.6.

## 1. Module surface (verified at HEAD)

```typescript
// From packages/data/src/index.ts:
export { StynxDataModule, StynxDataModule as DataModule } from './data.module';
export { Database } from './database';
export { Transaction, createDrizzle, type StynxDrizzleDatabase } from './transaction';
export { StynxPoolRegistry, createStynxPgPool, type StynxPgPoolOptions } from './pools';
export { createStynxPgClient, type StynxPgClient, type StynxPgClientConfig } from './client';
export { withSystemContext } from './system-context';
export * from './table-markers'; // SoftDeletableTable, LiveOnlyTable
export * from './types'; // TxOptions, SoftDeleteOptions, …
export * from './errors';
export * from './tokens';
export * from './schema'; // Drizzle schema for live tables
export * from './query-helpers'; // withDeleted(), onlyDeleted()
```

**Drift vs spec:** `STYNX-API-DATA.md` §1 lists `DataModule` as a
single export; the code re-aliases it as `StynxDataModule`. Both
names are exported. Use `StynxDataModule` in new code (matches the
naming pattern of sibling packages).

**Drift vs spec:** archive Drizzle types are at
`packages/data/src/internal/archive-schema.ts` (not the spec's
`@stynx/data/internal/archive-schema` subpath). They are not
re-exported from the public barrel — consumer code must not import
them.

## 2. Core types (from `packages/data/src/types.ts`)

### 2.1 `TxOptions`

```typescript
interface TxOptions {
  isolation?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
  readonly?: boolean; // default false
  role?: 'app' | 'reader' | 'owner'; // default 'app'
  replica?: boolean; // valid with role='reader' or role='app' + readonly=true
  retry?: { attempts: number; jitterMs: [number, number] } | false;
  deadlineMs?: number;
}
```

(Defaults sourced from STYNX-API-DATA.md §2.1.)

### 2.2 `SoftDeleteOptions`

```typescript
interface SoftDeleteOptions {
  maxCascadeDepth?: number; // default: from core.config (4)
  maxCascadeRows?: number; // default: from core.config (100)
  dryRun?: boolean; // default false
}
```

### 2.3 `RestoreOptions` / `HardDeleteOptions`

```typescript
interface RestoreOptions {
  archiveId?: number; // pick a specific archive row when many exist
  cascade?: boolean; // restoreWithCascade convenience
}

interface HardDeleteOptions {
  confirm: 'CONFIRM_HARD_DELETE'; // literal string, prevents accidents
}
```

### 2.4 `CascadePlan`

Returned by `softDelete(..., &#123; dryRun: true &#125;)`. Lists the planned
moves per table, with row counts and a `withinLimits` boolean.

### 2.5 Table markers (from `packages/data/src/table-markers.ts`)

```typescript
declare const SOFT_DELETABLE: unique symbol;
declare const LIVE_ONLY: unique symbol;

type SoftDeletableTable<T> = T & { readonly [SOFT_DELETABLE]: true };
type LiveOnlyTable<T> = T & { readonly [LIVE_ONLY]: true };
```

`@NoSoftDelete('reason')` markers map to `LiveOnlyTable&lt;T&gt;` at the
type level; the migration linter enforces the matching SQL annotation.

## 3. Database — connection and transactions

### 3.1 Obtaining a `Database`

`Database` is provided by `StynxDataModule.forRoot(...)`. Inject via
`@Inject(Database)` or constructor injection.

### 3.2 `Database.tx(fn, options?)`

```typescript
db.tx(async (trx: Transaction) => {
  // all queries use trx.* — never the outer db
}, options);
```

Behavior:

- Acquires a pooled connection.
- Sets GUCs (`app.tenant_id`, `app.actor_id`, `app.request_id`,
  `app.session_id`, `app.role`).
- Issues `BEGIN`; runs `fn`; commits unless `fn` throws.
- Retries on `40001` / `40P01` per `TxOptions.retry`.
- Raises `TenantContextMissingError` if no `TenantContext` is set
  (I2 enforcement).
- Raises `ActorContextMissingError` if no actor is set (mutations).

### 3.3 `Database.withSystemContext(reason, fn)` / module-level `withSystemContext`

Establishes a `SystemContext` for cross-tenant or no-tenant work
(migrations, scheduled jobs). The `reason` is audited. Within the
callback, `Database.tx` succeeds without a tenant; queries run as
`stynx_owner` (BYPASSRLS) by default unless overridden.

### 3.4 `Database.withReplica(fn)`

Convenience wrapper that runs `fn` against the read replica with
`role='reader'`, `readonly=true`. Forbids writes.

## 4. Query helpers (from `packages/data/src/query-helpers.ts`)

```typescript
trx.select().from(table); // live only (default)
trx.select().from(table).withDeleted(); // live UNION ALL archive
trx.select().from(table).onlyDeleted(); // archive only, ordered by deleted_at DESC
```

`withDeleted()` normalizes the projection: archive-only columns
(`archived_at`, `deleted_at`, `deleted_by`) appear as NULL on live
rows.

`onlyDeleted()` is the only way for application code to read archive
data. `archive.*` Drizzle types are never imported by consumers.

## 5. Soft-delete operations (from `packages/data/src/transaction.ts`)

### 5.1 `softDelete(table, id, options?)` — execute

```typescript
await trx.softDelete(records, recordId);
await trx.softDelete(records, recordId, { maxCascadeDepth: 6 });
```

Behavior:

- Sets `app.archive_move = 'in_progress'`,
  `app.archive_reason = 'soft_delete'`.
- For each cascade-annotated child, soft-deletes recursively
  (depth &amp; row limits enforced).
- For each block-annotated child, raises `SoftDeleteBlockedError`
  (HTTP 409) if blockers exist.
- For the parent: `INSERT INTO archive...` then `DELETE FROM live`
  in one transaction.
- Audit row written by trigger with `tags: &#123; soft_delete, archived &#125;`.

### 5.2 `softDelete(table, id, &#123; dryRun: true &#125;)` — plan only

Returns a `CascadePlan` listing what would be archived; performs no
writes.

### 5.3 `restoreFromArchive(table, id, options?)`

Validates uniqueness against live, then `INSERT INTO live` + `DELETE
FROM archive`. If multiple archive rows exist for the same `id`,
operates on the latest by `deleted_at` unless `archiveId` is given.
Raises `RestoreConflictError` (409) on uniqueness conflict;
`RestoreCascadeParentsArchivedError` if a cascade parent is still
archived.

### 5.4 `restoreWithCascade(table, id, options?)`

Restores the row plus all cascade-annotated children that were
archived **in the same `deleted_at` timestamp** as the parent.
Requires `:restore:*` on every child table.

### 5.5 `hardDelete(table, id, &#123; confirm: 'CONFIRM_HARD_DELETE' &#125;)`

Direct DELETE on the live table; no archive write. The `confirm`
literal prevents accidental invocation.

### 5.6 `hardDeleteFromArchive(archiveId, options)`

Platform-only: DELETE from archive directly. Used by LGPD purge and
admin archive-erasure flows.

## 6. Migration-time SQL helpers

From `packages/data/migrations/platform/0010_data_helpers.sql`:

- `data.create_soft_deletable_table(ddl text)` — emits live + archive
  - RLS + indexes + audit-trigger wiring atomically.
- `data.alter_soft_deletable_table(table regclass, alter_stmt text)`
  — applies the same ALTER to live and archive in lockstep.
- `data.register_softdelete_fk(parent_schema, parent_table,
child_schema, child_table, fk_constraint, behavior)` — registers an
  FK annotation in `core.softdelete_fk_registry`.
- `data.softdelete_fk_audit()` — internal audit helper for the FK
  registry.

`[VERIFY in PORT-08 — exhaustive helper list by reading the SQL file
end to end]`.

## 7. Errors (from `packages/data/src/errors.ts`)

All extend `StynxDataError`. Each carries `code` and `httpStatus`.

| Class                                | Code                                   | HTTP |
| ------------------------------------ | -------------------------------------- | ---- |
| `TenantContextMissingError`          | `TENANT_CONTEXT_MISSING`               | 500  |
| `ActorContextMissingError`           | `ACTOR_CONTEXT_MISSING`                | 500  |
| `TransactionRequiredError`           | `TRANSACTION_REQUIRED`                 | 500  |
| `ReadOnlyViolationError`             | `READONLY_VIOLATION`                   | 500  |
| `CascadeTooDeepError`                | `CASCADE_TOO_DEEP`                     | 409  |
| `CascadeTooLargeError`               | `CASCADE_TOO_LARGE`                    | 409  |
| `SoftDeleteBlockedError`             | `SOFT_DELETE_BLOCKED_BY_CHILDREN`      | 409  |
| `RestoreConflictError`               | `RESTORE_CONFLICT`                     | 409  |
| `RestoreCascadeParentsArchivedError` | `RESTORE_HAS_ARCHIVED_CASCADE_PARENTS` | 409  |
| `ArchiveMirrorMissingError`          | `ARCHIVE_MIRROR_MISSING`               | 500  |
| `ArchiveMirrorDriftError`            | `ARCHIVE_MIRROR_DRIFT`                 | 500  |
| `SerializationFailureError`          | (PG 40001)                             | 500  |
| `StatementTimeoutError`              | (PG 57014)                             | 500  |

Apps should let these bubble; the `@stynx/backend`
`StynxPlatformPipelineModule` wires a global exception filter that
translates them to JSON error responses.
