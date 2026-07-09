# `@stynx-nyx/data` — API Reference (v1.0)

&gt; Formal API surface for the data‑access module. Paired with STYNX‑SPEC §4, §13, §14.

**Status:** Normative. Implementation reference.
**Peer deps:** NestJS ≥ 10, Drizzle ORM, `pg` ≥ 8.
**Imported types:** `@stynx-nyx/core` (TenantContext, ActorContext), `@stynx-nyx/contracts` (shared table types).

---

## 1. Module surface

```typescript
// Root exports from @stynx-nyx/data
export { DataModule } from './module';
export { Database } from './database';
export { Transaction } from './transaction';
export { withSystemContext } from './system-context';

// Types
export type {
  TxOptions,
  SoftDeleteOptions,
  RestoreOptions,
  HardDeleteOptions,
  QueryBuilder,
  SoftDeletableTable,
  LiveOnlyTable,
  FkBehavior,
  CascadePlan,
} from './types';

// Errors
export {
  StynxDataError,
  TenantContextMissingError,
  ActorContextMissingError,
  TransactionRequiredError,
  ReadOnlyViolationError,
  CascadeTooDeepError,
  CascadeTooLargeError,
  SoftDeleteBlockedError,
  RestoreConflictError,
  RestoreCascadeParentsArchivedError,
  ArchiveMirrorMissingError,
  ArchiveMirrorDriftError,
} from './errors';
```

Archive schema types are **not exported** to consumers. They exist at `@stynx-nyx/data/internal/archive-schema` and are consumed only by the query helpers and soft‑delete operations, per STYNX‑SPEC §14.3.

---

## 2. Core types

### 2.1 `TxOptions`

```typescript
interface TxOptions {
  /** Postgres isolation level. Default: 'read committed'. */
  isolation?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';

  /** Enforce read-only at transaction scope (SET LOCAL TRANSACTION READ ONLY). Default: false. */
  readonly?: boolean;

  /** DB role for this transaction's connection. Default: 'app'. */
  role?: 'app' | 'reader' | 'owner';

  /** Route to the read replica. Only valid with role='reader' or role='app' + readonly=true. Default: false. */
  replica?: boolean;

  /** Retry policy on 40001 (serialization_failure) and 40P01 (deadlock_detected). Default: { attempts: 3, jitterMs: [10, 50] }. */
  retry?: { attempts: number; jitterMs: [number, number] } | false;

  /** Advisory deadline for the whole transaction. On timeout, raises StatementTimeoutError. Default: no deadline. */
  deadlineMs?: number;
}
```

### 2.2 `SoftDeleteOptions`

```typescript
interface SoftDeleteOptions {
  /** Override the platform-default cascade depth limit (§14.8). Default: from core.config (4). */
  maxCascadeDepth?: number;

  /** Override the platform-default cascade row count limit (§14.8). Default: from core.config (100). */
  maxCascadeRows?: number;

  /** Pre-count the cascade subtree and return the plan without executing. For confirmation UIs. Default: false. */
  dryRun?: boolean;

  /** Free-form tags merged into the audit row's `tags` jsonb. */
  auditTags?: Record<string, unknown>;
}
```

### 2.3 `RestoreOptions`

```typescript
interface RestoreOptions {
  /** Specific archive row to restore when multiple exist for the same live id. Default: latest by deleted_at DESC. */
  archiveId?: bigint;

  /** If true, restore the row AND its timestamp-matched cascade children (§14.6). Default: false. */
  cascade?: boolean;

  /** Free-form tags merged into the audit row. */
  auditTags?: Record<string, unknown>;
}
```

### 2.4 `HardDeleteOptions`

```typescript
interface HardDeleteOptions {
  /** Required acknowledgment; callers must explicitly confirm hard delete. */
  confirm: 'I understand this is irrecoverable';

  /** Free-form tags merged into the audit row. */
  auditTags?: Record<string, unknown>;
}
```

### 2.5 `CascadePlan`

Returned by `dryRun: true` on `softDelete` or any cascade path that needs confirmation:

```typescript
interface CascadePlan {
  /** Parent row being archived. */
  parent: { schema: string; table: string; id: string };

  /** Per-table row counts to be moved, leaves-first order. */
  steps: Array<{
    schema: string;
    table: string;
    rowCount: number;
    fkBehavior: 'cascade'; // only cascade rows appear in the plan
  }>;

  /** Total rows across the cascade. */
  totalRows: number;

  /** Maximum recursion depth this cascade would reach. */
  maxDepth: number;

  /** Whether the plan is within the caller-supplied or platform limits. */
  withinLimits: boolean;
}
```

### 2.6 Table markers

```typescript
/** Marker type emitted by data.create_soft_deletable_table. */
type SoftDeletableTable<T> = T & { __stynxSoftDeletable: true };

/** Marker type for tables tagged @NoSoftDelete. */
type LiveOnlyTable<T> = T & { __stynxLiveOnly: true };
```

The type system enforces that `softDelete`, `restoreFromArchive`, `restoreWithCascade`, `withDeleted`, and `onlyDeleted` can only be called with `SoftDeletableTable&lt;T&gt;`. Attempting them on a `LiveOnlyTable` is a compile error.

---

## 3. Connection and transactions

### 3.1 Obtaining a `Database` instance

```typescript
import { Injectable } from '@nestjs/common';
import { Database } from '@stynx-nyx/data';

@Injectable()
class CustomerService {
  constructor(private readonly db: Database) {}
  // ...
}
```

`Database` is request‑scoped in default mode — it resolves `TenantContext` and `ActorContext` from the current request via `nestjs-cls`. Outside a request (e.g. inside a background worker that called `withSystemContext`), `Database` must be obtained from the system context instead.

### 3.2 `Database.tx(fn, options?)`

```typescript
tx<T>(fn: (trx: Transaction) => Promise<T>, options?: TxOptions): Promise<T>;
```

Executes `fn` inside a Postgres transaction under the configured role. On entry, the following GUCs are set via `SET LOCAL`:

```
app.tenant_id  = <from TenantContext>
app.actor_id   = <from ActorContext>
app.request_id = <from request context>
app.session_id = <from request context>
app.role       = <options.role, default 'app'>
```

**Throws** before executing `fn`:

- `TenantContextMissingError` if `TenantContext` is unset and role is not `'owner'`.
- `ActorContextMissingError` if `ActorContext` is unset.

**Throws** from inside `fn` (re‑raised after rollback):

- `ReadOnlyViolationError` if a DML statement runs under `role: 'reader'`.
- `TransactionRequiredError` if a nested `trx.execute()` is called outside the current transaction (programming error).

**Behavior:**

- `readonly: true` issues `SET LOCAL TRANSACTION READ ONLY` after GUCs.
- `role: 'reader'` requires `readonly: true`; misuse fails immediately.
- `role: 'owner'` is allowed only from a `withSystemContext` frame; direct use from request scope throws `SystemContextRequiredError`.
- Retry on transient failures (40001, 40P01) consumes one attempt per retry; each retry re‑enters `fn` with a fresh transaction and fresh GUCs.
- Nested `tx()` inside `tx()` uses a SAVEPOINT; nested rollback unwinds only the savepoint.

### 3.3 `Database.withSystemContext(reason, fn)`

```typescript
withSystemContext<T>(
  reason: string,
  fn: (ctx: SystemContext) => Promise<T>
): Promise<T>;
```

Escape from normal tenant‑scoped operation. Inside `fn`:

- `TenantContext` resolution returns `null`; caller must pass explicit `tenant_id` into each `tx` if a specific tenant is targeted, or use `tx` with `role: 'owner'` for platform‑level work.
- Every call writes a row to `audit.system_op` with `reason`, `actor_id`, and `request_id`.

`reason` is a free‑form string, minimum 10 characters, required for audit readability.

### 3.4 `Database.withReplica(fn)`

Convenience wrapper for read‑only replica access:

```typescript
withReplica<T>(fn: (trx: Transaction) => Promise<T>): Promise<T>;
// Equivalent to: tx(fn, { role: 'reader', readonly: true, replica: true })
```

---

## 4. Query helpers

### 4.1 Default — live only

```typescript
const rows = await trx
  .select()
  .from(record) // Drizzle schema, live table
  .where(eq(record.isActive, true));
```

No archive access. Returns rows from `sample.record` only.

### 4.2 `withDeleted()` — live UNION archive

```typescript
const rows = await trx
  .select()
  .from(record)
  .withDeleted() // includes archive.sample_record
  .orderBy(desc(record.updatedAt));
```

Internally: SQL `UNION ALL` of live projection and archive projection. Archive‑only columns (`archived_at`, `deleted_at`, `deleted_by`, `archive_id`) are projected as NULL for live rows and populated for archive rows. Consumers can filter by `deleted_at IS NULL` after the fact if needed.

**Ordering caveat:** the Drizzle query builder's `orderBy` translates to one top‑level `ORDER BY` applied to the UNION result. Column stability is guaranteed because the column set is normalized.

### 4.3 `onlyDeleted()` — archive only

```typescript
const trash = await trx
  .select()
  .from(record)
  .onlyDeleted()
  .orderBy(desc(sql`deleted_at`))
  .limit(50);
```

Queries `archive.sample_record` directly. All archive-only columns are available in the projection. Default ordering is `deleted_at DESC` if `orderBy` is not specified.

### 4.4 Type enforcement

```typescript
// Compile error — `auditLog` is a LiveOnlyTable (no archive mirror)
await trx.select().from(auditLog).withDeleted();
//                                ^^^^^^^^^^^^^^
// Type error: withDeleted() requires SoftDeletableTable<T>
```

---

## 5. Soft delete operations

### 5.1 `softDelete(table, id, options?)`

```typescript
softDelete<T>(
  table: SoftDeletableTable<T>,
  id: string,
  options?: SoftDeleteOptions
): Promise<SoftDeleteResult>;

interface SoftDeleteResult {
  archiveId: bigint;
  cascaded: Array<{ schema: string; table: string; archiveId: bigint; id: string }>;
  deletedAt: string;                    // ISO timestamp; shared across the whole cascade
}
```

Moves the row from live to archive. If FKs with `cascade` annotation point to this table's rows, recursively soft‑deletes children first (leaves‑first ordering).

**Sequence:**

1. Verify `TenantContext` set; verify caller role ≠ `reader`.
2. Pre‑count the cascade subtree by walking `core.softdelete_fk_registry`.
3. If `totalRows &gt; maxCascadeRows` or `depth &gt; maxCascadeDepth`: throw `CascadeTooLargeError` / `CascadeTooDeepError` **without** mutating state.
4. If `options.dryRun === true`: return a `CascadePlan` (via a different overload — see §5.2).
5. Open sub‑savepoint; for each cascade child, recursively call `softDelete`.
6. `SET LOCAL app.archive_move = 'in_progress'; SET LOCAL app.archive_reason = 'soft_delete';`
7. `INSERT INTO archive.&#123;schema&#125;_&#123;table&#125; SELECT ...,  clock_timestamp(), clock_timestamp(), $actor_id FROM live.&#123;schema&#125;.&#123;table&#125; WHERE id = $1`
8. `DELETE FROM live.&#123;schema&#125;.&#123;table&#125; WHERE id = $1`
9. If step 8 raises `foreign_key_violation` for a `block`‑annotated FK: throw `SoftDeleteBlockedError` with the blocking children list.
10. Audit trigger on live DELETE fires with `op='D'`, `tags=&#123;"soft_delete":true,"archived":true,"archive_table":"..."&#125;`; archive INSERT trigger observes `app.archive_move='in_progress'` and writes no audit row.

**Errors:**

- `CascadeTooDeepError &#123; maxDepth, attempted &#125;`
- `CascadeTooLargeError &#123; maxRows, plan: CascadePlan &#125;`
- `SoftDeleteBlockedError &#123; parent, blockingChildren: Array&lt;&#123;...&#125;&gt; &#125;`
- `TenantContextMissingError`, `ReadOnlyViolationError`

### 5.2 `softDelete(table, id, &#123; dryRun: true &#125;)` overload

```typescript
softDelete<T>(
  table: SoftDeletableTable<T>,
  id: string,
  options: SoftDeleteOptions & { dryRun: true }
): Promise<CascadePlan>;
```

Returns the cascade plan without mutating any state. Use for confirmation UIs ("This will archive 47 rows across 4 tables — proceed?").

### 5.3 `restoreFromArchive(table, id, options?)`

```typescript
restoreFromArchive<T>(
  table: SoftDeletableTable<T>,
  id: string,
  options?: RestoreOptions
): Promise<RestoreResult>;

interface RestoreResult {
  id: string;
  restoredAt: string;
  cascadeChildren?: Array<{ schema: string; table: string; id: string }>;  // only if options.cascade
}
```

**Sequence:**

1. Resolve archive row: if `options.archiveId` given, use it; else latest by `deleted_at DESC` for this `id`.
2. Verify no unique‑constraint conflict in live by running a uniqueness check for each declared unique constraint on the archive row's values.
3. If any conflict: throw `RestoreConflictError &#123; conflictingConstraint, blockingLiveId &#125;`.
4. Verify parent rows are live (for `cascade` and `block` FKs outgoing from this table): any archived parent that is referenced triggers `RestoreCascadeParentsArchivedError &#123; archivedParents: [...] &#125;` unless `options.cascade === true` (in which case cascade restore walks **upward** first).
5. If `options.cascade === true`: find all archive rows with `deleted_at = subject.deleted_at` AND FK pointing at `subject.id` under a `cascade` annotation; recursively restore those after the parent.
6. `SET LOCAL app.archive_move = 'in_progress'; SET LOCAL app.archive_reason = 'restore';`
7. `INSERT INTO live ... SELECT ... FROM archive WHERE archive_id = $1`
8. `DELETE FROM archive WHERE archive_id = $1`
9. Audit on live INSERT fires with `op='I'`, `tags=&#123;"restore":true,"from_archive":true&#125;`.

**Errors:**

- `RestoreConflictError &#123; conflictingConstraint, conflictValues &#125;`
- `RestoreCascadeParentsArchivedError &#123; archivedParents &#125;` (when `cascade: false`)
- Per‑child `:restore:*` permission missing (from the perms layer, not this module — surfaces as `403 ForbiddenException` upstream)

### 5.4 `restoreWithCascade(table, id, options?)`

Thin convenience wrapper:

```typescript
restoreWithCascade<T>(
  table: SoftDeletableTable<T>,
  id: string,
  options?: Omit<RestoreOptions, 'cascade'>
): Promise<RestoreResult>;
// Equivalent to: restoreFromArchive(table, id, { ...options, cascade: true })
```

### 5.5 `hardDelete(table, id, options)`

```typescript
hardDelete<T>(
  table: SoftDeletableTable<T> | LiveOnlyTable<T>,
  id: string,
  options: HardDeleteOptions
): Promise<void>;
```

`DELETE FROM live.&#123;schema&#125;.&#123;table&#125; WHERE id = $1` with `app.archive_move` unset. No archive write. Audit fires with `op='D'`, `tags=&#123;"hard_delete":true&#125;`.

Requires the `options.confirm` literal string match. Type system enforces this at compile time.

Callers must have the `&#123;resource&#125;:hard_delete:*` permission; permission enforcement happens in the guard layer above this module.

### 5.6 `hardDeleteFromArchive(archiveId, options)`

Platform‑only operation. Removes a row from an archive table.

```typescript
hardDeleteFromArchive(
  archiveId: bigint,
  options: HardDeleteOptions & {
    /** Required — the archive table's schema_table name, e.g. 'sample_record'. */
    archiveTable: string;
  }
): Promise<void>;
```

Used by the LGPD erasure pipeline (§21) and by the `platform:archive_purge:*` admin path. Audit fires on the archive table with `op='D'`, `tags=&#123;"hard_delete":true,"from_archive":true&#125;`.

---

## 6. Migration‑time helpers (Postgres functions)

These are SQL‑callable from migration files, not TypeScript APIs. Declared once by `@stynx-nyx/data`'s bootstrap migration; consumer migrations call them.

### 6.1 `data.create_soft_deletable_table(ddl text)`

Parses the supplied `CREATE TABLE` statement and emits:

1. The live table as written.
2. The archive mirror at `archive.&#123;schema&#125;_&#123;table&#125;` with identical column set plus `archive_id bigserial PK`, `archived_at`, `deleted_at`, `deleted_by`, `last_erasure_at`.
3. RLS enable + tenant‑isolation policy on both.
4. Default indexes on archive: `(id)`, `(tenant_id)`, `(deleted_at DESC)`.
5. Audit trigger enablement on both tables (`audit.enable_for(...)`).

Fails if:

- DDL is not a single `CREATE TABLE`.
- Table lacks `tenant_id uuid NOT NULL` (violates I5).
- Archive name would collide with an existing object.

### 6.2 `data.alter_soft_deletable_table(table regclass, alter_stmt text)`

Applies the ALTER to both live and archive in one transaction. Parses the ALTER to decide how to mirror:

- `ADD COLUMN foo ...` → added to both.
- `DROP COLUMN foo` → dropped from both (blocked if the column carries data that would be lost; requires `-- @destructive` annotation in the migration).
- `ALTER COLUMN foo TYPE ...` → applied to both; requires compatible existing data.
- Constraints (CHECK, UNIQUE, FK): applied to live only; archive has no FKs or uniques by design.

Fails loudly with a clear error if the ALTER cannot be safely mirrored.

### 6.3 `data.register_softdelete_fk(parent_schema, parent_table, child_schema, child_table, fk_constraint, behavior)`

Inserts a row into `core.softdelete_fk_registry`. Normally called by the migration linter from parsed `-- @softdelete_fk` annotations, but exposed for cases where the annotation isn't parseable (rare).

### 6.4 `data.softdelete_fk_audit()`

Returns rows where a FK constraint targets a soft‑deletable parent but no registry entry exists. Used by `stynx doctor` to flag orphaned migrations.

---

## 7. Error taxonomy

All errors extend `StynxDataError`:

```typescript
abstract class StynxDataError extends Error {
  abstract readonly code: string; // stable machine-readable code
  abstract readonly httpStatus: number; // suggested HTTP mapping
  readonly cause?: unknown;
  readonly context: Record<string, unknown>;
}
```

The NestJS error filter in `@stynx-nyx/core` maps these to HTTP responses automatically:

| Error class                                           | `code`                                 | HTTP | Retryable?                            |
| ----------------------------------------------------- | -------------------------------------- | ---- | ------------------------------------- |
| `TenantContextMissingError`                           | `TENANT_CONTEXT_MISSING`               | 500  | No (programming error)                |
| `ActorContextMissingError`                            | `ACTOR_CONTEXT_MISSING`                | 500  | No (programming error)                |
| `TransactionRequiredError`                            | `TRANSACTION_REQUIRED`                 | 500  | No (programming error)                |
| `SystemContextRequiredError`                          | `SYSTEM_CONTEXT_REQUIRED`              | 500  | No (programming error)                |
| `ReadOnlyViolationError`                              | `READONLY_VIOLATION`                   | 500  | No (programming error)                |
| `CascadeTooDeepError`                                 | `CASCADE_TOO_DEEP`                     | 409  | No (redesign FK graph or raise limit) |
| `CascadeTooLargeError`                                | `CASCADE_TOO_LARGE`                    | 409  | No (same)                             |
| `SoftDeleteBlockedError`                              | `SOFT_DELETE_BLOCKED_BY_CHILDREN`      | 409  | Yes after children resolved           |
| `RestoreConflictError`                                | `RESTORE_CONFLICT`                     | 409  | Yes after conflict resolved           |
| `RestoreCascadeParentsArchivedError`                  | `RESTORE_HAS_ARCHIVED_CASCADE_PARENTS` | 409  | Yes with `cascade: true`              |
| `ArchiveMirrorMissingError`                           | `ARCHIVE_MIRROR_MISSING`               | 500  | No (migration error)                  |
| `ArchiveMirrorDriftError`                             | `ARCHIVE_MIRROR_DRIFT`                 | 500  | No (migration error)                  |
| `StatementTimeoutError`                               | `STATEMENT_TIMEOUT`                    | 504  | Yes                                   |
| `SerializationFailureError` (after retries exhausted) | `SERIALIZATION_FAILURE`                | 503  | Yes                                   |

Each error carries `context` with enough detail for logs and UI. Examples:

```typescript
new SoftDeleteBlockedError({
  parent: { schema: 'sample', table: 'record', id: 'uuid...' },
  blockingChildren: [
    { schema: 'sample', table: 'work_item', count: 47, sampleIds: ['uuid1', 'uuid2'] },
  ],
});

new RestoreConflictError({
  conflictingConstraint: 'uniq_record_email',
  conflictValues: { tenant_id: '...', email: 'owner@sample.test' },
  blockingLiveId: 'uuid-of-newer-record',
});
```

---

## 8. Usage patterns

### 8.1 Standard CRUD service

```typescript
@Injectable()
export class RecordService {
  constructor(private readonly db: Database) {}

  async create(dto: CreateRecordDto): Promise<Record> {
    return this.db.tx(async (trx) => {
      const [row] = await trx.insert(record).values(dto).returning();
      return row;
    });
  }

  async softRemove(id: string): Promise<void> {
    await this.db.tx(async (trx) => {
      await trx.softDelete(record, id);
    });
  }

  async restore(id: string): Promise<Record> {
    return this.db.tx(async (trx) => {
      const result = await trx.restoreFromArchive(record, id);
      const [row] = await trx.select().from(record).where(eq(record.id, result.id));
      return row;
    });
  }

  async previewCascade(id: string): Promise<CascadePlan> {
    return this.db.tx(async (trx) => {
      return trx.softDelete(record, id, { dryRun: true });
    });
  }
}
```

### 8.2 Read‑only reporting endpoint

```typescript
async usageReport(): Promise<UsageRow[]> {
  return this.db.withReplica(async (trx) => {
    return trx.select().from(record).where(/* ... */);
  });
}
```

### 8.3 Background maintenance under system context

```typescript
async nightlyCompliance(): Promise<void> {
  await this.db.withSystemContext('nightly LGPD retention pass', async () => {
    // Iterate tenants; for each tenant, elevate into that tenant's context
    const tenantIds = await this.loadTenantIds();
    for (const tid of tenantIds) {
      await this.db.tx(async (trx) => {
        await trx.execute(sql`SET LOCAL app.tenant_id = ${tid}`);
        // ... apply retention rules
      }, { role: 'owner' });
    }
  });
}
```

### 8.4 Cascade confirmation flow

```typescript
@Delete(':id')
@Permission('record:delete:*')
async remove(@Param('id') id: string, @Query('confirm') confirm?: string) {
  const plan = await this.recordService.previewCascade(id);

  if (plan.totalRows > 10 && confirm !== 'yes') {
    throw new HttpException({
      code: 'CASCADE_CONFIRMATION_REQUIRED',
      plan,
      next: `DELETE /records/${id}?confirm=yes`,
    }, 409);
  }

  await this.recordService.softRemove(id);
  return { deleted: id, cascaded: plan.steps };
}
```

---

## 9. Interaction with other STYNX packages

| Module           | Interaction                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@stynx-nyx/auth`    | Permission decorators gate routes; `@stynx-nyx/data` itself performs no permission checks.                                                             |
| `@stynx-nyx/tenancy` | Supplies `TenantContext`; `@stynx-nyx/data` reads it at `tx` entry.                                                                                    |
| `@stynx-nyx/audit`   | Triggers fire inside Postgres; `@stynx-nyx/data` sets GUCs that the triggers read.                                                                     |
| `@stynx-nyx/privacy` | Uses `hardDeleteFromArchive` and direct archive access for LGPD erasure (§21.4). Operates under `withSystemContext`.                               |
| `@stynx-nyx/testing` | Provides matchers (`expectInArchive`, `expectNotInLive`, `expectRestoreConflict`, `expectArchiveMirrorInSync`) against the live and archive state. |

---

## 10. Versioning

This API is the **v1.0 contract**. Breaking changes require an RFC per STYNX‑SPEC §17.4.

Additive changes (new options fields, new error subclasses extending existing base classes, new helper methods) are minor‑version safe.

Semantic observable changes to retry policy defaults, cascade limit defaults, or error code mappings are **breaking** even when no signature changes — they affect consumer test fixtures and ops runbooks.

---

_End of `@stynx-nyx/data` API Reference v1.0._
