# 06 — Data Layer Patterns

> **Audience:** coding agents porting an existing application onto STYNX
> in a foreign repo. This file is self-contained: it does **not** assume
> access to the STYNX source tree, only to the citations below.
>
> **Source baseline:** commit `670d165253efd66113e338cd0c79d4c8fcbc8be7`
> on branch `clean/doc-pass`, 2026-04-27.
>
> **Sister files:**
> [`04-INVARIANTS-AND-CONTRACTS.md`](04-INVARIANTS-AND-CONTRACTS.md),
> [`05-PACKAGE-CATALOG.md`](05-PACKAGE-CATALOG.md),
> [`16-SPEC-EXCERPTS/data-api-contract.md`](16-SPEC-EXCERPTS/data-api-contract.md),
> [`16-SPEC-EXCERPTS/soft-delete-model.md`](16-SPEC-EXCERPTS/soft-delete-model.md),
> [`08-MIGRATION-PATTERNS.md`](08-MIGRATION-PATTERNS.md).

This document describes how the foreign codebase's data layer must look
_after_ the port — and how to get there from the most common starting
points. The goal is not to paraphrase the spec, but to translate it
into mechanical rewrites you can execute on someone else's code.

Every example here either appears verbatim in the STYNX source tree (in
which case the file:line citation locates it) or is a minimal
synthesised example whose behaviour is verified against the cited
implementation.

If a concept here contradicts `specs/STYNX-API-DATA.md`, prefer the
**code** — the spec lags slightly. The drift is called out at each
relevant point.

---

## The Database / Transaction surface (current code)

This is the canonical surface a port must use. Every signature below is
extracted directly from the implementation, not the spec.

### `Database` (Nest provider)

`Database` is a `@Injectable()` class extending `CoreDatabase` from
`@stynx/core`. Inject by class:

```typescript
import { Database } from '@stynx/data';
@Injectable()
class MyService {
  constructor(private readonly db: Database) {}
}
```

| Method              | Signature                                                                                           | Source                                |
| ------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `tx`                | `tx<T>(fn: (trx: Transaction) => Promise<T>, options?: TxOptions): Promise<T>`                      | `(packages/data/src/database.ts:79)`  |
| `withReplica`       | `withReplica<T>(fn: (trx: Transaction) => Promise<T>): Promise<T>`                                  | `(packages/data/src/database.ts:147)` |
| `withSystemContext` | `withSystemContext<T>(reason: string, fn: (ctx: SystemExecutionContext) => Promise<T>): Promise<T>` | `(packages/data/src/database.ts:151)` |

`tx()` order: (1) resolves role/readonly defaults `(database.ts:80)`; (2) `assertRoleConstraints` — reader/replica require readonly, owner requires SystemContext `(database.ts:178)`; (3) resolves execution context, throwing `TenantContextMissingError`/`ActorContextMissingError` if CLS absent `(database.ts:226)`; (4) nested call → savepoint `stynx_sp_{N}` `(database.ts:158)`; (5) `pool.connect`, `BEGIN`, `applySessionState`, `createDrizzle`, run `fn`, `COMMIT` `(database.ts:96–141)`; (6) retries PG `40001`/`40P01` (default 3 attempts, 10–50 ms jitter) `(database.ts:43, 82, 121)`; (7) maps `25006` → `ReadOnlyViolationError`, `57014` → `StatementTimeoutError` `(database.ts:48)`.

`applySessionState` issues per-transaction (no SESSION-scope): `set_config('app.role'|'app.request_id'|'app.tenant_id'|'app.actor_id'|'app.session_id', ..., true)`, `SET LOCAL TRANSACTION READ ONLY` (when readonly), `set_config('statement_timeout', ..., true)` (when deadlineMs) `(packages/data/src/database.ts:194–224)`.

### `Transaction` (passed into `tx` callback)

| Method                         | Signature                                                                    | Source                                   |
| ------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------- |
| `select`                       | `select(): TransactionSelectRoot`                                            | `(packages/data/src/transaction.ts:95)`  |
| `insert`                       | `insert(table)` (Drizzle insert builder)                                     | `(packages/data/src/transaction.ts:100)` |
| `update`                       | `update(table)` (Drizzle update builder)                                     | `(packages/data/src/transaction.ts:105)` |
| `delete`                       | `delete(table)` (Drizzle delete builder)                                     | `(packages/data/src/transaction.ts:110)` |
| `execute`                      | `execute(query: SQLWrapper): Promise<QueryResult>`                           | `(packages/data/src/transaction.ts:115)` |
| `query`                        | `query<TRow>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>`  | `(packages/data/src/transaction.ts:120)` |
| `softDelete` (dryRun overload) | `softDelete(table, id, { dryRun: true }): Promise<CascadePlan>`              | `(packages/data/src/transaction.ts:128)` |
| `softDelete`                   | `softDelete(table, id, options?): Promise<SoftDeleteResult>`                 | `(packages/data/src/transaction.ts:133)` |
| `restoreFromArchive`           | `restoreFromArchive(table, id, options?): Promise<RestoreResult>`            | `(packages/data/src/transaction.ts:172)` |
| `restoreWithCascade`           | `restoreWithCascade(table, id, options?): Promise<RestoreResult>`            | `(packages/data/src/transaction.ts:188)` |
| `hardDelete`                   | `hardDelete(table, id, { confirm }): Promise<void>`                          | `(packages/data/src/transaction.ts:199)` |
| `hardDeleteFromArchive`        | `hardDeleteFromArchive(archiveId, { archiveTable, confirm }): Promise<void>` | `(packages/data/src/transaction.ts:213)` |

### Drift vs `STYNX-API-DATA.md` (prefer the code)

1. **`hardDelete` confirmation literal.** Spec says `'CONFIRM_HARD_DELETE'`; implementation accepts `'I understand this is irrecoverable'` `(packages/data/src/transaction.ts:833)`. Reference-api uses the implemented literal `(apps/reference-api/src/sample/reference-sample.service.ts:44)`.
2. **`DataModule` vs `StynxDataModule`.** Both exported; prefer `StynxDataModule`.
3. **Archive Drizzle types are private** — `packages/data/src/internal/archive-schema.ts`, not re-exported. See Anti-pattern 5.
4. **`withSystemContext` callback receives `SystemExecutionContext`**, not `Transaction`. Call `db.tx(...)` inside `(packages/data/src/database.ts:151)`.

### `TxOptions` (extracted)

```typescript
interface TxOptions {
  isolation?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
  readonly?: boolean; // default false
  role?: 'app' | 'reader' | 'owner'; // default 'app'
  replica?: boolean; // requires role='reader' or readonly=true
  retry?: { attempts: number; jitterMs: [number, number] } | false;
  deadlineMs?: number;
}
```

Cited at [`16-SPEC-EXCERPTS/data-api-contract.md`](16-SPEC-EXCERPTS/data-api-contract.md) §2.1, behaviour at
`(packages/data/src/database.ts:79–145)`.

### Errors raised by the surface

All extend `StynxDataError` (code + httpStatus). The `@stynx/backend` global filter translates them. Key throw sites: `TenantContextMissingError` `(packages/data/src/database.ts:240)`, `ActorContextMissingError` `(database.ts:243)`, `ReadOnlyViolationError` `(database.ts:51, 180; transaction.ts:67)`, `SerializationFailureError` `(database.ts:129)`, `CascadeTooDeepError` `(transaction.ts:236)`, `CascadeTooLargeError` `(transaction.ts:284)`, `SoftDeleteBlockedError` `(transaction.ts:359)`, `RestoreConflictError` `(transaction.ts:443)`, `RestoreCascadeParentsArchivedError` `(transaction.ts:419)`, `ArchiveMirrorMissingError` `(transaction.ts:787)`, `TransactionRequiredError` `(transaction.ts:840)`.

---

## Pattern 1 — Replacing `pg.Pool`

The most common starting point: a service that imports `pg` directly,
manages its own pool, and runs queries with parameter arrays. The port
removes the pool, removes any tenant predicate written into SQL, and
routes everything through `Database.tx()`.

### Before (raw `pg.Pool`)

```typescript
// my-service.ts (FOREIGN code, before port)
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export class RecordsService {
  async list(tenantId: string) {
    const { rows } = await pool.query(
      `SELECT id, title, email FROM sample.record WHERE tenant_id = $1`,
      [tenantId],
    );
    return rows;
  }

  async create(tenantId: string, actorId: string, title: string, email: string) {
    await pool.query(
      `INSERT INTO sample.record (tenant_id, title, email, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$4)`,
      [tenantId, title, email, actorId],
    );
  }
}
```

This violates **I1** (raw pg connection — no GUCs set) and **I5** (the
`WHERE tenant_id = $1` predicate is application-level rather than RLS).

### After (STYNX `Database.tx`)

```typescript
// records.service.ts (after port)
import { Injectable } from '@nestjs/common';
import { Database } from '@stynx/data';
import { eq, desc } from 'drizzle-orm';
import { records } from './schema';

@Injectable()
export class RecordsService {
  constructor(private readonly db: Database) {}

  list() {
    return this.db.tx(async (trx) => trx.select().from(records).orderBy(desc(records.updatedAt)), {
      role: 'reader',
      readonly: true,
    });
  }
}
```

Notes:

- The `WHERE tenant_id = $1` clause is gone. RLS does the filtering
  because `app.tenant_id` is set by `applySessionState`
  `(packages/data/src/database.ts:206)`.
- The constructor takes no `Pool`; `Database` is injected by Nest.
- The connection options matrix (replica, role, readonly) is in
  `TxOptions`, not in pool construction.
- The reference-api list method is a verbatim shape:
  `(apps/reference-api/src/sample/reference-sample.service.ts:88)`.

---

## Pattern 2 — Replacing an existing ORM

Side-by-side rewrites for the four ORMs most often encountered in the
foreign codebases this pack targets. The "after" column is identical
across ORMs because STYNX is the destination — only the "before"
varies.

### 2.1 TypeORM

```typescript
// BEFORE — TypeORM
@Injectable()
export class RecordsService {
  constructor(@InjectRepository(Record) private readonly repo: Repository<Record>) {}

  list(tenantId: string) {
    return this.repo.find({ where: { tenantId, deletedAt: IsNull() } });
  }

  async softDelete(tenantId: string, id: string) {
    await this.repo.softDelete({ id, tenantId });
  }
}
```

```typescript
// AFTER — STYNX
@Injectable()
export class RecordsService {
  constructor(private readonly db: Database) {}

  list() {
    return this.db.tx((trx) => trx.select().from(records), { role: 'reader', readonly: true });
  }

  softDelete(id: string) {
    return this.db.tx((trx) => trx.softDelete(records, id));
  }
}
```

Things that disappear in the rewrite:

- `@InjectRepository` and the `Repository<T>` abstraction. STYNX's
  Drizzle schema gives you the table object directly (see
  `apps/reference-api/src/sample/reference-sample.service.ts:25–31`).
- `deletedAt: IsNull()` and `softDelete` semantics — STYNX moves rows
  to `archive.*`; live tables never have `deleted_at`. See
  `(apps/reference-api/migrations/0001_reference.sql:88–110)` for the
  helper invocation that replaces TypeORM's `@DeleteDateColumn`.
- Manual `tenantId` parameter — RLS handles it.

### 2.2 Prisma

```typescript
// BEFORE — Prisma
const records = await prisma.record.findMany({
  where: { tenantId: ctx.tenantId, deletedAt: null },
  orderBy: { updatedAt: 'desc' },
  take: 50,
});

await prisma.record.update({
  where: { id },
  data: { deletedAt: new Date(), deletedBy: ctx.actorId },
});
```

```typescript
// AFTER — STYNX
const records = await this.db.tx(
  (trx) => trx.select().from(recordsTable).orderBy(desc(recordsTable.updatedAt)).limit(50),
  { role: 'reader', readonly: true },
);

await this.db.tx((trx) => trx.softDelete(recordsTable, id));
```

Notes:

- Prisma Client's transaction model (`prisma.$transaction(...)`) maps
  1:1 onto `db.tx(async (trx) => { ... })`.
- Prisma's "soft delete" is conventionally the `deletedAt` column
  pattern; STYNX rejects this at the linter level (Anti-pattern 2).
  Move to the helper before porting.

### 2.3 Knex

```typescript
// BEFORE — Knex
const rows = await knex('sample.record').select('*').where({ tenant_id });
await knex('sample.record').where({ id, tenant_id }).update({ deleted_at: knex.fn.now() });
```

```typescript
// AFTER — STYNX
const rows = await this.db.tx((trx) => trx.select().from(records), {
  role: 'reader',
  readonly: true,
});

await this.db.tx((trx) => trx.softDelete(records, id));
```

If you genuinely need raw SQL (e.g. for a complex CTE), use
`trx.query(text, values)` `(packages/data/src/transaction.ts:120)` —
it bypasses Drizzle but stays inside the transaction's GUC envelope.

### 2.4 Sequelize

```typescript
// BEFORE — Sequelize
const records = await Record.findAll({
  where: { tenant_id, deleted_at: { [Op.is]: null } },
  order: [['updated_at', 'DESC']],
});

await Record.destroy({ where: { id, tenant_id } });
```

```typescript
// AFTER — STYNX
const records = await this.db.tx(
  (trx) => trx.select().from(recordsTable).orderBy(desc(recordsTable.updatedAt)),
  { role: 'reader', readonly: true },
);

await this.db.tx((trx) => trx.softDelete(recordsTable, id));
```

Sequelize's "paranoid" tables (`paranoid: true`) translate to the
helper-emitted soft-deletable pair; the `deletedAt` column on the live
side must be removed before the migration linter will pass.

---

## Pattern 3 — A canonical CRUD service

The reference-api's records resource is the pattern. This shows the
full controller + service shape with `@Permission` decorators inline.

### Controller

```typescript
// records.controller.ts — full file shape, abridged from reference-api
@Controller('/records')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class RecordsController {
  constructor(private readonly svc: RecordsService) {}

  @Get() // (records.controller.ts:53)
  @ReadOnly() // I7 — RO role
  @Permission('sample:record:read') // I4 — every route gated
  @Audit({ action: 'sample.record.list', entity: 'sample.record' })
  list(@Query() query: ListQuery) {
    return this.svc.listRecords(query);
  }

  @Get('/:id') // (records.controller.ts:71)
  @ReadOnly()
  @Permission('sample:record:read')
  @Audit({ action: 'sample.record.get', entity: 'sample.record' })
  get(@Param('id') id: string) {
    return this.svc.getRecord(id);
  }

  @Post() // (records.controller.ts:80)
  @Permission('sample:record:write')
  @Idempotent()
  @Audit({ action: 'sample.record.create', entity: 'sample.record' })
  create(@Body() body: CreateRecordDto) {
    return this.svc.createRecord(body);
  }

  @Patch('/:id') // (records.controller.ts:89)
  @Permission('sample:record:write')
  @Idempotent()
  @Audit({ action: 'sample.record.update', entity: 'sample.record' })
  update(@Param('id') id: string, @Body() body: UpdateRecordDto) {
    return this.svc.updateRecord(id, body);
  }

  @Delete('/:id') // (records.controller.ts:98)
  @Permission('sample:record:delete')
  @Idempotent()
  @Audit({ action: 'sample.record.soft-delete', entity: 'sample.record' })
  delete(@Param('id') id: string) {
    return this.svc.softDeleteRecord(id);
  }
}
```

(Real source:
`apps/reference-api/src/sample/records.controller.ts:48–124`.)

### Service

```typescript
// records.service.ts — abridged from reference-sample.service.ts
@Injectable()
export class RecordsService {
  constructor(
    private readonly db: Database,
    private readonly ctx: RequestContext,
  ) {}

  listRecords(q: ListQuery = {}) {
    // (reference-sample.service.ts:88)
    return this.db.tx(
      (trx) => trx.select().from(records).orderBy(desc(records.updatedAt)).limit(50),
      { role: 'reader', readonly: true },
    );
  }

  createRecord(input: CreateRecordDto) {
    // (reference-sample.service.ts:116)
    return this.db.tx(async (trx) => {
      const id = randomUUID();
      const now = new Date();
      await trx.insert(records).values({
        id,
        tenantId: this.ctx.tenantId!,
        title: input.title,
        email: input.email,
        createdAt: now,
        createdBy: this.ctx.actorId!,
        updatedAt: now,
        updatedBy: this.ctx.actorId!,
      });
      return this.requireById(records, id);
    });
  }

  softDeleteRecord(id: string) {
    // (reference-sample.service.ts:153)
    return this.db.tx((trx) => trx.softDelete(records, id));
  }
}
```

Patterns to copy verbatim:

- `randomUUID()` in application code; let the DB default also fire if
  the column has `DEFAULT gen_random_uuid()` (it does — see
  `(apps/reference-api/migrations/0001_reference.sql:91)`).
- `created_by` / `updated_by` populated from `RequestContext.actorId`,
  not from any token claim directly — `RequestContext` already validated
  the token.
- The list endpoint runs `{ role: 'reader', readonly: true }`; mutations
  use the default `{ role: 'app' }`.
- Every method body opens with `db.tx(async (trx) => ...)`. No
  `await db.something()` outside that wrapper exists in the service.

---

## Pattern 4 — A soft-deletable resource with mixed FK annotations

This is the load-bearing example. The reference migration declares
five tables with `cascade`, `block`, and `hide` annotations across
them; the cascade engine reads `core.softdelete_fk_registry` to
decide what to do at delete-time.

### Migration (excerpt)

```sql
-- (apps/reference-api/migrations/0001_reference.sql:88–110)
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.record (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenancy.tenants(id),
    title         text NOT NULL,
    email         citext NOT NULL,
    status        text NOT NULL DEFAULT 'active',
    created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by    uuid NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by    uuid NOT NULL,
    UNIQUE (tenant_id, email)
  );
$$);
```

```sql
-- record_note: cascade child of record  (0001_reference.sql:113–135)
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.record_note (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenancy.tenants(id),
    record_id     uuid NOT NULL REFERENCES sample.record(id) ON DELETE RESTRICT,
    -- @softdelete_fk: cascade
    -- a note exists only because of its parent record
    kind text NOT NULL CHECK (kind IN ('primary','secondary','internal')),
    label text NOT NULL,
    detail text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by uuid NOT NULL
  );
$$);
```

```sql
-- work_item: block child of record, hide child of auth.users
-- (0001_reference.sql:138–168)
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.work_item (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenancy.tenants(id),
    record_id     uuid NOT NULL REFERENCES sample.record(id) ON DELETE RESTRICT,
    -- @softdelete_fk: block
    -- archiving a record with active work items must fail loudly
    created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    -- @softdelete_fk: hide
    -- if the creating user is archived, work item lives on; audit retains who
    code text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by uuid NOT NULL,
    UNIQUE (tenant_id, code)
  );
$$);
```

The matching registry calls (the linter normally generates these from
the comment annotations; explicit form for clarity):

```sql
-- (apps/reference-api/migrations/0001_reference.sql:222–233)
SELECT data.register_softdelete_fk('sample','record','sample','record_note',
                                   'record_note_record_id_fkey','cascade');
SELECT data.register_softdelete_fk('sample','record','sample','work_item',
                                   'work_item_record_id_fkey','block');
SELECT data.register_softdelete_fk('auth','users','sample','record',
                                   'record_owner_user_id_fkey','hide');
```

### Service excerpt — softDelete + restore

```typescript
// (apps/reference-api/src/sample/reference-sample.service.ts:441–457)
private async softDelete<T extends SampleTable>(
  table: SoftDeletableTable<T>, id: string,
) {
  return this.db.tx(async (trx) => {
    await this.requireLive(table, id);
    const result = await trx.softDelete(table, id);
    return this.serializeForResponse({
      ...result,
      archiveId: result.archiveId.toString(),  // bigint → string for JSON
    });
  });
}

private async restore<T extends SampleTable>(
  table: SoftDeletableTable<T>, id: string,
) {
  return this.db.tx(async (trx) => {
    await trx.restoreFromArchive(table, id);
    return this.requireById(table, id);
  });
}
```

What the engine does at runtime, sourced from
`(packages/data/src/transaction.ts:305–404)`:

1. Sets `app.archive_move = 'in_progress'` and
   `app.archive_reason = 'soft_delete'` GUCs (the audit trigger reads
   these to suppress duplicate rows during the move) — line 365.
2. Reads `core.softdelete_fk_registry` for child rules — line 519.
3. For each `cascade` child, recurses (depth/row-limit checked) —
   line 326.
4. For each `block` child with active rows, raises
   `SoftDeleteBlockedError` with structured blocker list (count +
   sample IDs) — line 357.
5. `INSERT INTO archive.* (..., deleted_at, deleted_by)` then
   `DELETE FROM live` — lines 368–384.
6. Audit row written by trigger; metric incremented — line 402.

Restore semantics
`(packages/data/src/transaction.ts:406–517)`:

- `loadArchivedRow` picks the latest `deleted_at` for `id`, or the
  caller-provided `archiveId` — line 632.
- `findArchivedParents` walks the FK registry for the _child_ side of
  the entry; if a parent is in `archive.*` and not in live, it's
  blocking — line 654.
- If parents are archived and `cascade=false`, raises
  `RestoreCascadeParentsArchivedError` — line 419.
- `findRestoreConflict` checks every unique constraint via
  `pg_constraint` introspection — line 702.

---

## Pattern 5 — A read-only reporting endpoint

Reporting routes connect via `stynx_reader`. This combines `@ReadOnly()`
on the controller method with `tx({ role: 'reader', readonly: true })`
inside the service. Both are required: the decorator covers I7
intent, the option covers the actual role used at the pool level.

### Controller

```typescript
// reports.controller.ts
@Controller('/reports')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('/records-by-status')
  @ReadOnly() // I7
  @Permission('sample:record:read')
  @RateLimit({ bucket: 'tenant', scope: 'reports.records-by-status', cost: 5 })
  @Audit({ action: 'sample.report.records-by-status', entity: 'sample.report' })
  recordsByStatus() {
    return this.svc.recordsByStatus();
  }
}
```

### Service

```typescript
// reports.service.ts
@Injectable()
export class ReportsService {
  constructor(private readonly db: Database) {}

  recordsByStatus() {
    return this.db.tx(
      (trx) =>
        trx.execute(sql`
        SELECT status, count(*)::bigint AS n
          FROM sample.record
         GROUP BY status
      `),
      { role: 'reader', readonly: true }, // ← I7 enforcement
    );
  }
}
```

Equivalent shorthand using `withReplica`
`(packages/data/src/database.ts:147)`:

```typescript
recordsByStatus() {
  return this.db.withReplica((trx) => trx.execute(sql`
    SELECT status, count(*)::bigint AS n FROM sample.record GROUP BY status
  `));
}
```

`withReplica` forwards `{ role: 'reader', readonly: true, replica: true }`
to `tx`. Use it whenever a read-only path can tolerate replica lag.
`assertRoleConstraints` will reject any attempt to mix `replica` with
`readonly: false` `(packages/data/src/database.ts:178)`.

The `READ ONLY` guard is enforced at the **transaction** level too:
`SET LOCAL TRANSACTION READ ONLY` is issued in `applySessionState` when
`readonly=true` `(packages/data/src/database.ts:218)`. Any write inside
the callback fails with PG `25006` → `ReadOnlyViolationError`.

---

## Pattern 6 — Background work outside a request

Cron jobs, queue workers, migration scripts, and warmup probes all run
without an HTTP request — i.e. without a CLS-bound `RequestContext`.
Calling `db.tx(...)` directly will throw `TenantContextMissingError`
`(packages/data/src/database.ts:240)`. Wrap the whole job in
`withSystemContext('reason', async () => { ... })`.

```typescript
// jobs/nightly-vacuum.ts
import { Database, withSystemContext } from '@stynx/data';
import { sql } from 'drizzle-orm';

@Injectable()
export class NightlyVacuumJob {
  constructor(private readonly db: Database) {}

  async run() {
    await withSystemContext(this.db, 'nightly-vacuum', async () => {
      // Inside this block, db.tx({ role: 'owner' }) is permitted.
      await this.db.tx((trx) => trx.execute(sql`SELECT data.purge_archive_older_than('90 days')`), {
        role: 'owner',
      });
    });
  }
}
```

What the wrapper does:

- `Database.withSystemContext` delegates to `SystemContext.withSystemContext`
  from `@stynx/core` `(packages/data/src/database.ts:151)`.
- `assertRoleConstraints({ role: 'owner' })` calls
  `systemContext.current()`; if no SystemContext is active,
  `SystemContextRequiredError` is raised
  `(packages/data/src/database.ts:185)`.
- The `reason` is recorded in `audit.system_op` (per audit-model spec
  excerpt) so cross-tenant operations are attributable.
- Inside the callback, `tx({ role: 'owner' })` connects via the
  `stynx_owner` pool which has `BYPASSRLS`. Use this sparingly —
  invariant I2 still applies: every transaction sets `app.role = owner`
  GUC so audit triggers see who issued the operation.

The free-function helper at
`(packages/data/src/system-context.ts:4)` is a thin wrapper:

```typescript
// (packages/data/src/system-context.ts:4)
export function withSystemContext<T>(
  database: Pick<Database, 'withSystemContext'>,
  reason: string,
  fn: (context: SystemExecutionContext) => Promise<T>,
): Promise<T> {
  return database.withSystemContext(reason, fn);
}
```

Use this in modules that import `Database` only as a type. Otherwise
call `db.withSystemContext(...)` directly.

---

## Pattern 7 — Querying with `.withDeleted()` and `.onlyDeleted()`

The default `trx.select().from(table)` returns live rows only. To
include archived rows, chain a query helper. The helpers are
implemented in `packages/data/src/query-helpers.ts` and exposed on the
select root by a `Proxy`
`(packages/data/src/query-helpers.ts:314–351)`.

```typescript
// Live only — default
const live = await this.db.tx((trx) => trx.select().from(records), {
  role: 'reader',
  readonly: true,
});

// Live ∪ archive, archive-only columns null on live rows
const all = await this.db.tx((trx) => trx.select().from(records).withDeleted(), {
  role: 'reader',
  readonly: true,
});

// Archive only (the trash list)
const trash = await this.db.tx(
  (trx) =>
    trx
      .select()
      .from(records)
      .onlyDeleted()
      .where(eq(records.tenantId, this.ctx.tenantId!))
      .orderBy(desc(records.updatedAt))
      .limit(50),
  { role: 'reader', readonly: true },
);
```

The reference-api uses `onlyDeleted` for the `/trash` endpoints
`(apps/reference-api/src/sample/reference-sample.service.ts:103, 245)`.

Behaviour from `query-helpers.ts`:

- `withDeleted()` builds a `UNION ALL` between the live projection
  (with NULLs for `archive_id`, `archived_at`, `deleted_at`,
  `deleted_by`, `last_erasure_at`) and the archive projection
  `(packages/data/src/query-helpers.ts:175–198, 231–246)`.
- `onlyDeleted()` queries only the mirror, defaulting `ORDER BY
deleted_at DESC` `(packages/data/src/query-helpers.ts:253–264)`.
- A `tenant_id` guard is appended automatically when the table has
  that column `(packages/data/src/query-helpers.ts:199)` — defense in
  depth on top of RLS.
- The returned row type adds `ArchiveMetadataNullable` (withDeleted)
  or `ArchiveMetadataRequired` (onlyDeleted) to the live row shape
  `(packages/data/src/query-helpers.ts:42–62)`.

Both helpers are only attached to tables marked
`SoftDeletableTable<T>`. Calling `.withDeleted()` on a `LiveOnlyTable`
is a TypeScript error.

`onlyDeleted()` is the **only** sanctioned way to read archive data
from application code. `archive.*` Drizzle types must not be imported
directly — see Anti-pattern 5.

---

## Pattern 8 — Decision: `softDelete` vs `hardDelete` vs `restoreFromArchive`

The default delete is always soft. Hard delete is for compliance
erasure or admin archive cleanup. Restore reverses a soft delete. This
table makes the choice explicit:

| Situation                                                                | Method                                                                                                 | Notes                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| User clicks "Delete" on a row in the UI                                  | `trx.softDelete(table, id)`                                                                            | Default. Cascade engine handles children. Recoverable.                                             |
| Cascade dry-run for confirmation UI                                      | `trx.softDelete(table, id, { dryRun: true })`                                                          | Returns `CascadePlan`; no writes. `(packages/data/src/transaction.ts:128, 156)`                    |
| User clicks "Restore" in the trash UI                                    | `trx.restoreFromArchive(table, id)`                                                                    | Validates uniqueness; raises `RestoreConflictError` (409) on conflict.                             |
| User clicks "Restore with children"                                      | `trx.restoreWithCascade(table, id)`                                                                    | Restores children archived in the same `deleted_at` tick. Caller needs `:restore:*` on each child. |
| Admin permanently empties the trash                                      | `trx.hardDeleteFromArchive(archiveId, { archiveTable, confirm })`                                      | Use `confirm: 'I understand this is irrecoverable'`. `(packages/data/src/transaction.ts:213, 833)` |
| LGPD subject erasure                                                     | Goes through `@stynx/privacy`, which uses `hardDeleteFromArchive` + per-column nullify/hash strategies |
| One-off cleanup of a misbehaving live row that should never have existed | `trx.hardDelete(table, id, { confirm })`                                                               | Live-only DELETE; no archive write. Use exceedingly rarely; reserve for explicit admin paths.      |
| Testing — wipe between scenarios                                         | TRUNCATE inside `withSystemContext`                                                                    | Not a `Transaction` method; use `trx.execute(sql\`truncate ...\`)`with`role: 'owner'`.             |

Cascade limits at decision-time
`(packages/data/src/transaction.ts:152, 235, 283)`:

- `maxCascadeDepth` defaults to **4**; raises `CascadeTooDeepError`.
- `maxCascadeRows` defaults to **100**; raises `CascadeTooLargeError`.
- Override per call: `trx.softDelete(table, id, { maxCascadeDepth: 6, maxCascadeRows: 500 })`.
- Use `dryRun: true` first when expected fan-out is uncertain.

Reference-api's hard-delete follows the archive-id lookup pattern
`(apps/reference-api/src/sample/reference-sample.service.ts:459–475)`:

```typescript
// Look up the archive_id for this live id, then hard-delete from archive.
const archived = await trx.query<{ archive_id: string }>(
  `select archive_id::text as archive_id from ${cfg.archiveTable}
    where id = $1::uuid and tenant_id = $2::uuid limit 1`,
  [id, this.requireTenantId()],
);
const archiveId = archived.rows[0]?.archive_id;
if (!archiveId) throw new NotFoundException('RESOURCE_NOT_FOUND');
await trx.hardDeleteFromArchive(BigInt(archiveId), {
  archiveTable: cfg.archiveTable,
  confirm: HARD_DELETE_CONFIRMATION, // 'I understand this is irrecoverable'
});
```

Note the literal string for `confirm`: this is the implementation's
guard — not the spec's documented `'CONFIRM_HARD_DELETE'`. The
implementation wins
`(packages/data/src/transaction.ts:833)`.

---

## Anti-patterns

Each is presented as **wrong** code → **corrected** code, with a one-
line rationale. Grep for these in the foreign codebase before declaring
a port done.

### 1. Manual `WHERE tenant_id = $1`

```typescript
// WRONG — application-level tenant filter
async list(tenantId: string) {
  return this.db.tx((trx) =>
    trx.select().from(records).where(eq(records.tenantId, tenantId)),
  );
}
```

```typescript
// RIGHT — RLS handles it
async list() {
  return this.db.tx(
    (trx) => trx.select().from(records),
    { role: 'reader', readonly: true },
  );
}
```

**Why:** RLS uses `current_setting('app.tenant_id', true)::uuid`. The
GUC is set by `applySessionState`
`(packages/data/src/database.ts:206)`. An app-level predicate is
either redundant or, worse, incorrect (e.g. uses an attacker-controlled
value). Matches the rewrite table for I5 in
[`04-INVARIANTS-AND-CONTRACTS.md`](04-INVARIANTS-AND-CONTRACTS.md) §I5.

The reference-api keeps `eq(table.tenantId, this.requireTenantId())` in
_some_ places `(apps/reference-api/src/sample/reference-sample.service.ts:92)`
as defense in depth — that's tolerated. The anti-pattern is when the
predicate is the **only** isolation, with no RLS behind it.

### 2. Adding `deleted_at` to a live table

```sql
-- WRONG
CREATE TABLE sample.record (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  -- ...
  deleted_at timestamptz NULL,
  deleted_by uuid NULL
);
```

```sql
-- RIGHT
SELECT data.create_soft_deletable_table($$
  CREATE TABLE sample.record (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    -- ... (no deleted_at / deleted_by here)
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by uuid NOT NULL
  );
$$);
```

**Why:** STYNX's archive-mirror model puts deletion metadata on
`archive.{schema}_{table}`, never on the live table (I8). The
migration linter rejects `deleted_at` columns on live tables. See
`(apps/reference-api/migrations/0001_reference.sql:88–110)` for the
canonical helper invocation.

### 3. `ON DELETE CASCADE` at DB level

```sql
-- WRONG
record_id uuid NOT NULL REFERENCES sample.record(id) ON DELETE CASCADE,
```

```sql
-- RIGHT
record_id uuid NOT NULL REFERENCES sample.record(id) ON DELETE RESTRICT,
-- @softdelete_fk: cascade
```

**Why:** STYNX's cascade is _application-level_: the engine walks
`core.softdelete_fk_registry`
`(packages/data/src/transaction.ts:519)` and moves children to
`archive.*` in the same transaction. A DB-level `CASCADE` would
delete children outright (no archive write), bypass audit triggers
that depend on the `app.archive_move` GUC, and break the depth/row
limits.

`ON DELETE RESTRICT` is the right DB-level posture for every FK to a
soft-deletable parent — it forces the application path. See
`(apps/reference-api/migrations/0001_reference.sql:118)` and
`(apps/reference-api/migrations/0001_reference.sql:143)` for both
`cascade` and `block` examples that use `RESTRICT` at the DB level.

### 4. Queries outside `tx()`

```typescript
// WRONG
@Injectable()
export class WidgetService {
  constructor(@Inject('PG_POOL') private readonly pool: Pool) {}
  list() {
    return this.pool.query('SELECT * FROM sample.widget');
  }
}

// also WRONG — Drizzle without a Transaction wrapper
@Injectable()
export class WidgetService {
  constructor(private readonly db: NodePgDatabase) {}
  list() {
    return this.db.select().from(widgets);
  }
}
```

```typescript
// RIGHT
@Injectable()
export class WidgetService {
  constructor(private readonly db: Database) {}
  list() {
    return this.db.tx((trx) => trx.select().from(widgets), { role: 'reader', readonly: true });
  }
}
```

**Why:** GUCs are set per transaction inside
`applySessionState` `(packages/data/src/database.ts:194)`. Outside
`tx()`, RLS predicates evaluate `app.tenant_id` against `NULL` and
either deny everything or, with `BYPASSRLS`, leak everything.
`TenantContextMissingError` is the runtime trip wire
`(packages/data/src/database.ts:240)`. For background work, use
Pattern 6 (`withSystemContext`).

### 5. Importing `archive.*` Drizzle types into application code

```typescript
// WRONG
import { sampleRecordArchive } from '@stynx/data/internal/archive-schema';

const archivedRecords = await this.db.tx((trx) => trx.select().from(sampleRecordArchive));
```

```typescript
// RIGHT
const archivedRecords = await this.db.tx(
  (trx) => trx.select().from(records).onlyDeleted().orderBy(desc(records.updatedAt)).limit(50),
  { role: 'reader', readonly: true },
);
```

**Why:** Archive Drizzle types live at
`packages/data/src/internal/archive-schema.ts` and are not re-exported
from the public barrel
(see [`16-SPEC-EXCERPTS/data-api-contract.md`](16-SPEC-EXCERPTS/data-api-contract.md) §1
drift note). The `onlyDeleted()` helper gives application code the same
data with the right tenant guard and result shape automatically
`(packages/data/src/query-helpers.ts:253–270, 295–311)`.

A `no-restricted-imports` rule should block `@stynx/data/internal/*` in
foreign code; the absence of that rule is `[GAP — verify ESLint
`no-restricted-imports`rule in`tools/eslint-config/`blocks`@stynx/data/internal/\*` outside the data package itself]`.

---

## Cross-references

- Invariants and grep recipes: [`04-INVARIANTS-AND-CONTRACTS.md`](04-INVARIANTS-AND-CONTRACTS.md).
- Migration helpers + linter: [`08-MIGRATION-PATTERNS.md`](08-MIGRATION-PATTERNS.md).
- Spec excerpts: [`16-SPEC-EXCERPTS/data-api-contract.md`](16-SPEC-EXCERPTS/data-api-contract.md), [`16-SPEC-EXCERPTS/soft-delete-model.md`](16-SPEC-EXCERPTS/soft-delete-model.md).
- Open gaps: [`_DISCOVERY.md`](_DISCOVERY.md) §11 and [`18-GAPS-AND-OPEN-QUESTIONS.md`](18-GAPS-AND-OPEN-QUESTIONS.md).

When in doubt, `apps/reference-api/src/sample/reference-sample.service.ts` is the ground-truth example.
