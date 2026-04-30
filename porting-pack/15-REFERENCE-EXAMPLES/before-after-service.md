# Before / After — A CRUD Service

> Companion to [`06-DATA-LAYER-PATTERNS.md`](../06-DATA-LAYER-PATTERNS.md)
> and the spec excerpts in [`16-SPEC-EXCERPTS/data-api-contract.md`](../16-SPEC-EXCERPTS/data-api-contract.md)
> and [`16-SPEC-EXCERPTS/soft-delete-model.md`](../16-SPEC-EXCERPTS/soft-delete-model.md).
> The "After" section mirrors `apps/reference-api/src/sample/reference-sample.service.ts`.

This file shows a typical "list / get / create / update / delete" service in
its foreign shape — raw `pg.Pool`, hand-written tenant predicates, an
`is_deleted` boolean flag — and rewrites it to the STYNX-compliant shape that
goes through `Database.tx`, the `softDelete` helper, and `@Permission`.

---

## Before — raw `pg.Pool` + `is_deleted` flag

```typescript
// src/records/records.service.ts (FOREIGN — pre-port)
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Record {
  id: string;
  organization_id: string;
  title: string;
  email: string;
  status: string;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class RecordsService {
  async list(orgId: string): Promise<Record[]> {
    const { rows } = await pool.query(
      `SELECT id, organization_id, title, email, status,
              is_deleted, created_at, updated_at
         FROM sample.record
        WHERE organization_id = $1
          AND is_deleted = false
        ORDER BY updated_at DESC
        LIMIT 50`,
      [orgId],
    );
    return rows;
  }

  async get(orgId: string, id: string): Promise<Record | null> {
    const { rows } = await pool.query(
      `SELECT * FROM sample.record
        WHERE id = $1 AND organization_id = $2 AND is_deleted = false
        LIMIT 1`,
      [id, orgId],
    );
    return rows[0] ?? null;
  }

  async create(
    orgId: string,
    actorId: string,
    input: { title: string; email: string; status?: string },
  ): Promise<Record> {
    const id = randomUUID();
    const now = new Date();
    await pool.query(
      `INSERT INTO sample.record (
         id, organization_id, title, email, status, is_deleted,
         created_at, created_by, updated_at, updated_by
       ) VALUES ($1, $2, $3, $4, $5, false, $6, $7, $6, $7)`,
      [id, orgId, input.title, input.email, input.status ?? 'active', now, actorId],
    );
    return (await this.get(orgId, id))!;
  }

  async update(
    orgId: string,
    actorId: string,
    id: string,
    patch: Partial<Pick<Record, 'title' | 'email' | 'status'>>,
  ): Promise<Record> {
    await pool.query(
      `UPDATE sample.record
          SET title      = COALESCE($3, title),
              email      = COALESCE($4, email),
              status     = COALESCE($5, status),
              updated_at = NOW(),
              updated_by = $6
        WHERE id = $1 AND organization_id = $2 AND is_deleted = false`,
      [id, orgId, patch.title, patch.email, patch.status, actorId],
    );
    return (await this.get(orgId, id))!;
  }

  async delete(orgId: string, actorId: string, id: string): Promise<void> {
    // "Soft delete" by flipping is_deleted on the live row.
    await pool.query(
      `UPDATE sample.record
          SET is_deleted = true,
              deleted_at = NOW(),
              deleted_by = $3,
              updated_at = NOW(),
              updated_by = $3
        WHERE id = $1 AND organization_id = $2`,
      [id, orgId, actorId],
    );
  }
}
```

### What this code violates

| Symptom                                                        | Invariant | Citation                                                                                                                                     |
| -------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Module-scope `new Pool(...)`, GUCs never set                   | I1        | [`04-INVARIANTS-AND-CONTRACTS.md`](../04-INVARIANTS-AND-CONTRACTS.md) §I1                                                                    |
| `WHERE organization_id = $1` is the only isolation, no RLS     | I5        | [`16-SPEC-EXCERPTS/tenancy-model.md`](../16-SPEC-EXCERPTS/tenancy-model.md) §4.4                                                             |
| `is_deleted` boolean on the live table                         | I8        | [`16-SPEC-EXCERPTS/soft-delete-model.md`](../16-SPEC-EXCERPTS/soft-delete-model.md) — "Live tables MUST NOT carry `deleted_at`/`deleted_by`" |
| `tenantId` carried as method argument from the controller      | I2        | RequestContext should provide it; see Pattern 1 in [`06-DATA-LAYER-PATTERNS.md`](../06-DATA-LAYER-PATTERNS.md)                               |
| No audit pipeline; no `actorId` GUC; trigger can't tag the row | I6        | [`16-SPEC-EXCERPTS/audit-model.md`](../16-SPEC-EXCERPTS/audit-model.md)                                                                      |

---

## After — STYNX-compliant rewrite

```typescript
// src/records/records.service.ts (after port)
import { randomUUID } from 'node:crypto';
import {
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequestContext } from '@stynx/core';
import { Database, type SoftDeletableTable } from '@stynx/data';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx/auth';
import { Idempotent } from '@stynx/idempotency';
import { RateLimit } from '@stynx/ratelimit';
import { Audit } from '@stynx/backend';
import { and, desc, eq } from 'drizzle-orm';
import { records } from './schema';
import type { CreateRecordDto, ListQuery, UpdateRecordDto } from './dto';

@Injectable()
export class RecordsService {
  constructor(
    private readonly database: Database,
    private readonly requestContext: RequestContext,
  ) {}

  listRecords(query: ListQuery = {}) {
    return this.database.tx(
      (trx) =>
        trx
          .select()
          .from(records)
          .orderBy(desc(records.updatedAt))
          .limit(Math.min(query.limit ?? 50, 200)),
      { role: 'reader', readonly: true },
    );
  }

  async getRecord(id: string) {
    return this.requireById(records, id);
  }

  createRecord(input: CreateRecordDto) {
    return this.database.tx(async (trx) => {
      const id = randomUUID();
      const now = new Date();
      await trx.insert(records).values({
        id,
        tenantId: this.requireTenantId(),
        title: input.title,
        email: input.email,
        status: input.status ?? 'active',
        createdAt: now,
        createdBy: this.requireActorId(),
        updatedAt: now,
        updatedBy: this.requireActorId(),
      });
      return this.requireById(records, id);
    });
  }

  updateRecord(id: string, input: UpdateRecordDto) {
    return this.database.tx(async (trx) => {
      await this.requireById(records, id);
      await trx
        .update(records)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
          updatedBy: this.requireActorId(),
        })
        .where(and(eq(records.id, id), eq(records.tenantId, this.requireTenantId())));
      return this.requireById(records, id);
    });
  }

  softDeleteRecord(id: string) {
    return this.database.tx(async (trx) => {
      await this.requireById(records, id);
      const result = await trx.softDelete(records as SoftDeletableTable<typeof records>, id);
      return { ...result, archiveId: result.archiveId.toString() };
    });
  }

  private async requireById(table: typeof records, id: string) {
    const rows = await this.database.tx(
      (trx) =>
        trx
          .select()
          .from(table)
          .where(and(eq(table.id, id), eq(table.tenantId, this.requireTenantId())))
          .limit(1),
      { role: 'reader', readonly: true },
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('RESOURCE_NOT_FOUND');
    return row;
  }

  private requireTenantId(): string {
    const v = this.requestContext.tenantId;
    if (!v) throw new NotFoundException('TENANT_CONTEXT_MISSING');
    return v;
  }

  private requireActorId(): string {
    const v = this.requestContext.actorId;
    if (!v) throw new NotFoundException('ACTOR_CONTEXT_MISSING');
    return v;
  }
}

@Controller('/records')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Get()
  @ReadOnly()
  @Permission('sample:record:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.records.list' })
  @Audit({ action: 'sample.record.list', entity: 'sample.record' })
  list(@Query() query: ListQuery) {
    return this.recordsService.listRecords(query);
  }

  @Delete('/:id')
  @Permission('sample:record:delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.records.delete', cost: 3 })
  @Audit({ action: 'sample.record.soft-delete', entity: 'sample.record' })
  remove(@Param('id') id: string) {
    return this.recordsService.softDeleteRecord(id);
  }
}
```

---

## Annotations — what changed and why

1. **`new Pool(...)` removed; `Database` injected.** Inject the platform's
   `Database` class (`@stynx/data`). Every call goes through `db.tx(...)`,
   which sets `app.tenant_id`, `app.actor_id`, `app.request_id`, `app.role`
   GUCs per transaction. See [`06-DATA-LAYER-PATTERNS.md`](../06-DATA-LAYER-PATTERNS.md)
   "The Database / Transaction surface" and the `applySessionState` citation.
   Closes I1.

2. **`organization_id` ⇒ `tenant_id`.** STYNX's column convention is
   `tenant_id uuid NOT NULL`; the `data.create_soft_deletable_table` helper
   refuses to create the table otherwise. See
   [`08-MIGRATION-PATTERNS.md`](../08-MIGRATION-PATTERNS.md) "Pattern:
   tenant-scoped table the right way". `stynx adopt` rewrites the column
   for you (`packages/cli/src/adopt.ts`).

3. **`WHERE organization_id = $1` deleted.** RLS does the filtering once
   `app.tenant_id` GUC is set. Closes I5. Note the reference service
   sometimes keeps `eq(table.tenantId, this.requireTenantId())` as
   defense-in-depth (see `reference-sample.service.ts:92`); that's
   tolerated, but never the _only_ isolation.

4. **Tenancy and actor read from `RequestContext`, not method arguments.**
   `RequestContext` from `@stynx/core` is bound by the
   `RequestContextInterceptor` and survives any `await` inside `db.tx()`
   thanks to `nestjs-cls`. The controller no longer threads `orgId`
   through.

5. **`is_deleted` boolean is gone.** Live rows do not carry deletion
   metadata (I8). Soft-delete moves rows to `archive.sample_record` via
   `trx.softDelete(records, id)`. The cascade engine reads
   `core.softdelete_fk_registry` to walk children. Detail in
   [`16-SPEC-EXCERPTS/soft-delete-model.md`](../16-SPEC-EXCERPTS/soft-delete-model.md)
   and [`06-DATA-LAYER-PATTERNS.md`](../06-DATA-LAYER-PATTERNS.md) "Pattern 4".

6. **`bigint` archive id serialized to string.** `softDelete` returns
   `{ archiveId: bigint, ... }`; JSON cannot encode `bigint`, so the
   service stringifies it before returning. Mirrors
   `reference-sample.service.ts:441–449`.

7. **List path uses `{ role: 'reader', readonly: true }`.** Reads connect
   via the `stynx_reader` pool (no INSERT/UPDATE/DELETE grants); a
   stray write inside the callback raises `ReadOnlyViolationError`.
   Closes I7. Mutations use the default `app` role. See
   [`06-DATA-LAYER-PATTERNS.md`](../06-DATA-LAYER-PATTERNS.md) "Pattern 5".

8. **Audit happens automatically at the row layer; route labels stay explicit.**
   No code in the service mentions audit:
   the `audit.fn_row_change()` trigger (installed by
   `data.ensure_archive_mirror`) reads `app.actor_id` GUC and writes a
   row to `audit.log` for every INSERT/UPDATE/DELETE. Closes I6 without
   service-level boilerplate. The controller adds `@Audit({...})` for the
   per-route action label — see
   [`before-after-controller.md`](before-after-controller.md).

9. **`@Permission` lives at the controller boundary.** The After block
   includes the minimal `RecordsController` because `PermissionGuard`
   reads route metadata. The service stays composable and unit-testable;
   don't duplicate permission checks inside service methods unless the
   check is a domain rule outside the RBAC model.

10. **No raw SQL strings.** Drizzle builders give compile-time column
    names. If you must drop to SQL (CTEs, recursive queries), use
    `trx.query(text, values)` — it stays inside the GUC envelope. Avoid
    `pool.query` and the unwrapped Drizzle root (`Anti-pattern 4` in
    [`06-DATA-LAYER-PATTERNS.md`](../06-DATA-LAYER-PATTERNS.md)).

### Imports verified against `@stynx/*` exports

| Symbol                                                        | Package              | Source                                                   |
| ------------------------------------------------------------- | -------------------- | -------------------------------------------------------- |
| `Database`, `SoftDeletableTable`                              | `@stynx/data`        | `packages/data/src/index.ts` (catalog 05 §`@stynx/data`) |
| `RequestContext`                                              | `@stynx/core`        | catalog 05 §`@stynx/core`                                |
| `Permission`, `ReadOnly`, `StynxAuthGuard`, `PermissionGuard` | `@stynx/auth`        | `packages/auth/src/index.ts`                             |
| `Idempotent`                                                  | `@stynx/idempotency` | `packages/idempotency/src/index.ts`                      |
| `RateLimit`                                                   | `@stynx/ratelimit`   | `packages/ratelimit/src/index.ts`                        |
| `Audit`                                                       | `@stynx/backend`     | `packages/backend/src/index.ts`                          |
| `eq`, `and`, `desc`                                           | `drizzle-orm`        | peer dep of `@stynx/data`                                |

`[GAP — confirm `randomUUID`vs UUIDv7 helper preference; reference-api
uses Node`crypto.randomUUID`which is UUIDv4. The migration comment
says "UUIDv7 preferred"; if a helper ships in`@stynx/core`, prefer it.]`
