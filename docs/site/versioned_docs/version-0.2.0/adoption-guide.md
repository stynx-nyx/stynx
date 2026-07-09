---
title: 'Adoption Guide'
---

# `stynx adopt` — Worked Example

&gt; Applying STYNX to an existing raw-SQL NestJS service. Demonstrates the four phases described in STYNX-SPEC §20.2 against a realistic "before" codebase without introducing domain-specific business models into the platform docs.

---

## 0. The target service

We're adopting a hypothetical `OperationsExample` service: a small NestJS app that tracks tenant-scoped `resource_record` rows. About 40 endpoints, 12 tables, raw `pg.Pool` calls throughout. Multi-tenant behavior was bolted on via an `organization_id` column on most tables, with filtering enforced by convention rather than RLS.

This matches the intended adoption target: raw SQL, no ORM, tenancy by convention. For brevity the worked example walks through three files and one table. Real adoption expands the same pattern.

---

## 1. The "before" codebase

### 1.1 `src/db.ts` (current)

```typescript
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows;
}
```

### 1.2 `src/auth.middleware.ts` (current)

```typescript
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  async use(req: any, res: any, next: () => void) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = header.slice(7);

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
      req.user = { id: payload.sub, email: payload.email };
      req.organizationId = payload.org_id;
    } catch {
      throw new UnauthorizedException();
    }
    next();
  }
}
```

### 1.3 `src/records/records.service.ts` (current)

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { query, pool } from '../db';

@Injectable()
export class RecordsService {
  async list(orgId: string) {
    return query(
      `SELECT * FROM resource_record
        WHERE organization_id = $1
          AND deleted = false
        ORDER BY opened_at DESC
        LIMIT 100`,
      [orgId],
    );
  }

  async get(orgId: string, id: string) {
    const rows = await query(
      `SELECT * FROM resource_record WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    if (rows.length === 0) throw new NotFoundException();
    return rows[0];
  }

  async create(orgId: string, userId: string, dto: CreateResourceRecordDto) {
    const [row] = await query(
      `INSERT INTO resource_record (id, organization_id, external_ref, opened_at, closed_at, label, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [orgId, dto.externalRef, dto.openedAt, dto.closedAt, dto.label, userId],
    );
    return row;
  }

  async delete(orgId: string, id: string) {
    const result = await pool.query(
      `UPDATE resource_record
          SET deleted = true, deleted_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    if (result.rowCount === 0) throw new NotFoundException();
  }
}
```

### 1.4 The `resource_record` table (current)

```sql
CREATE TABLE resource_record (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  external_ref    text NOT NULL,
  display_name    text,
  opened_at       timestamptz NOT NULL,
  closed_at       timestamptz,
  label           text,
  status          text DEFAULT 'active',
  deleted         boolean DEFAULT false,
  deleted_at      timestamptz,
  created_at      timestamptz DEFAULT now(),
  created_by      uuid NOT NULL
);

CREATE INDEX idx_resource_record_org ON resource_record (organization_id);
```

Observations that shape adoption:

- No RLS; tenancy enforced by `WHERE` clause convention.
- Ad-hoc soft delete (`deleted boolean + deleted_at`), no audit, no archive.
- `organization_id` is STYNX's `tenant_id` semantically.
- JWT payload is bespoke; no Cognito integration.
- No permission model beyond "logged in."

---

## 2. Phase 1 — Assessment (`stynx adopt scan`)

```text
$ pnpm stynx adopt scan

Scanning OperationsExample service...
  Repository:   /workspaces/adoption-example
  Commit:       a4f8c2e
  Node files:   127
  SQL files:    8
  Migrations:   23

Compliance report
=================

INVARIANT VIOLATIONS (must resolve before "STYNX: compliant")

  I1  No raw DB connection
      ✗ 43 call sites use `pool.query(...)` directly
      ✗  2 files import `pg` directly (should go through @stynx-nyx/data)
      → Codemod available (Phase 2)

  I4  Every HTTP route has a permission
      ✗ 40 routes without @Permission / @Public / @System
      → Insert @Permission placeholders (Phase 2); design keys (Phase 3)

  I5  Every tenant-scoped table has tenant_id + RLS
      ✗ 12 tables use `organization_id` (rename candidate)
      ✗ 12 tables without RLS policies
      → Rename migration + RLS enable (Phase 2); policy design (Phase 3)

  I6  Every mutation is audited
      ✗ Audit triggers missing on all 12 tables
      → audit.enable_for(...) migrations (Phase 2)

  I8  Every tenant-scoped table is soft-deletable
      ✗ 12 tables lack archive mirrors
      ✗ 1 table has ad-hoc `deleted` column (`resource_record`) — consolidate into archive model
      → Generated mirror migrations + column removal (Phase 2)

AUTH LAYER

  ✗ Custom JWT middleware at src/auth.middleware.ts
  ✗ No Cognito integration
  ✗ No session management; JWT is self-signed with static secret
  → Replace with @stynx-nyx/auth in Phase 2 (mechanical); Cognito pool wiring in Phase 3

OTHER

  ! 8 endpoints appear to be GET-only reporting queries. Candidates for @ReadOnly()
  ! 2 tables are append-only logs (`activity_log`, `mutation_log`).
    Candidates for @NoSoftDelete — review in Phase 3.
  ! 23 migrations committed; recommend fresh baseline after rename before Phase 2

EFFORT ESTIMATE

  Phase 2 (codemods): ~4 hours runtime; 1-2 days of manual review
  Phase 3 (manual design): ~3-4 weeks (RLS policies, perms design, Cognito wiring)
  Phase 4 (green gate):    ~1 week (shadow traffic + sign-off)

Next: `stynx adopt apply --dry-run` to preview Phase 2 changes.
```

Key takeaways:

- The codebase is mechanically adoptable; no structural rewrite required.
- The `organization_id -&gt; tenant_id` rename touches migrations and queries symmetrically; the codemod handles both.
- The ad-hoc soft-delete on `resource_record` is the one spot needing extra care: its `deleted = true` rows must move into the archive mirror at cutover time.
- Two append-only tables are likely `@NoSoftDelete` candidates.

---

## 3. Phase 2 — Codemods (`stynx adopt apply`)

### 3.1 `src/db.ts` after

The file disappears entirely. `pg.Pool` is replaced by `@stynx-nyx/data`'s injected `Database`.

```typescript
// DELETED: src/db.ts
// Database access now goes through @stynx-nyx/data's Database service.
```

### 3.2 `src/auth.middleware.ts` after

The old middleware is commented out and the app is rewired to `@stynx-nyx/auth`.

```typescript
// DEPRECATED in favor of @stynx-nyx/auth.
// Left in-tree for one release to ease rollback; delete after cutover.
```

### 3.3 `src/records/records.service.ts` after

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { Database } from '@stynx-nyx/data';
import { desc, eq } from 'drizzle-orm';
import { resourceRecord } from '../schema';

@Injectable()
export class RecordsService {
  constructor(private readonly db: Database) {}

  async list() {
    return this.db.tx(async (trx) => {
      return trx.select().from(resourceRecord).orderBy(desc(resourceRecord.openedAt)).limit(100);
    });
  }

  async get(id: string) {
    return this.db.tx(async (trx) => {
      const rows = await trx.select().from(resourceRecord).where(eq(resourceRecord.id, id));
      if (rows.length === 0) throw new NotFoundException();
      return rows[0];
    });
  }

  async create(dto: CreateResourceRecordDto) {
    return this.db.tx(async (trx) => {
      const [row] = await trx
        .insert(resourceRecord)
        .values({
          externalRef: dto.externalRef,
          openedAt: dto.openedAt,
          closedAt: dto.closedAt,
          label: dto.label,
        })
        .returning();
      return row;
    });
  }

  async remove(id: string) {
    return this.db.tx(async (trx) => {
      await trx.softDelete(resourceRecord, id);
    });
  }
}
```

### 3.4 Generated migration — schema conversion

```sql
-- migrations/2026-04-24_stynx_adopt_resource_record.sql
--
-- Generated by `stynx adopt apply` on behalf of the adoption example.
--
-- Changes:
--   1. Rename organization_id -> tenant_id
--   2. Create archive.resource_record mirror
--   3. Backfill existing deleted rows into archive
--   4. Drop deleted/deleted_at from the live table
--   5. Enable RLS + tenant isolation
--   6. Enable audit trigger

BEGIN;

ALTER TABLE resource_record RENAME COLUMN organization_id TO tenant_id;

ALTER TABLE resource_record
  ADD CONSTRAINT resource_record_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenancy.tenants(id);

SELECT data.adopt_soft_deletable_table(
  live_table         => 'resource_record',
  soft_delete_column => 'deleted',
  deleted_at_column  => 'deleted_at',
  deleted_by_column  => NULL
);

ALTER TABLE resource_record DROP COLUMN deleted;
ALTER TABLE resource_record DROP COLUMN deleted_at;

ALTER TABLE resource_record
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN updated_by uuid;

UPDATE resource_record SET updated_by = created_by WHERE updated_by IS NULL;
ALTER TABLE resource_record ALTER COLUMN updated_by SET NOT NULL;

ALTER INDEX idx_resource_record_org RENAME TO idx_resource_record_tenant;

COMMIT;
```

### 3.5 Generated Drizzle schema

```typescript
// src/schema/resource-record.ts -- generated
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from '@stynx-nyx/data/schema';
import { softDeletable } from '@stynx-nyx/data';

export const resourceRecord = softDeletable(
  pgTable('resource_record', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    externalRef: text('external_ref').notNull(),
    displayName: text('display_name'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    label: text('label'),
    status: text('status').default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').notNull(),
  }),
);
```

### 3.6 Placeholders inserted into controllers

```typescript
// src/records/records.controller.ts
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Permission, TODO_PERMISSION } from '@stynx-nyx/auth';

@Controller('records')
export class RecordsController {
  constructor(private readonly svc: RecordsService) {}

  @Get()
  @Permission(TODO_PERMISSION)
  list() {
    return this.svc.list();
  }

  @Get(':id')
  @Permission(TODO_PERMISSION)
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  @Permission(TODO_PERMISSION)
  create(@Body() dto: CreateResourceRecordDto) {
    return this.svc.create(dto);
  }

  @Delete(':id')
  @Permission(TODO_PERMISSION)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
```

---

## 4. Phase 3 — Manual checklist

```text
$ pnpm stynx adopt scan --after-codemods

Remaining manual items
======================

RLS POLICIES
  12 tables have RLS enabled but only the default tenant_isolation policy.
  Review each for additional restrictions:
    - resource_record:          default tenant isolation may be enough
    - policy_binding:           restrict writes to owner/admin roles
    - activity_log:             read-only for tenant members; write via @System only

PERMISSION KEY DESIGN
  40 routes with TODO_PERMISSION placeholders.
  Proposed mapping:
    RecordsController.list      -> 'resource_record:read:*'
    RecordsController.get       -> 'resource_record:read:*'
    RecordsController.create    -> 'resource_record:write:*'
    RecordsController.remove    -> 'resource_record:delete:*'

AUDIT OPT-IN
  activity_log and mutation_log are annotated @NoAudit in code
  (they are already source-of-truth logs).

READ-ONLY ROUTES
  8 GET endpoints look report-shaped:
    ReportsController.capacity_overview -> candidate for @ReadOnly()

SOFT DELETE OPT-OUTS
  2 append-only tables should opt out of soft delete:
    [ ] activity_log:  @NoSoftDelete('append-only event log')
    [ ] mutation_log:  @NoSoftDelete('append-only event log')

FK ANNOTATIONS
  17 FKs to soft-deletable parents without annotations. Proposed defaults:
    related_document.resource_record_id -> cascade
    related_lock.resource_record_id     -> block
    resource_record.owner_user_id               -> hide

COGNITO WIRING
  @stynx-nyx/auth is installed but Cognito User Pool ID is unset.
```

This is the real adoption work: decisions that cannot be inferred mechanically.

---

## 5. Phase 4 — Green gate

```text
$ pnpm stynx adopt scan --final

Compliance report
=================

INVARIANT VIOLATIONS          0  ✓
MANUAL CHECKLIST ITEMS        0  ✓
TODO_PERMISSION PLACEHOLDERS  0  ✓
@stynx-nyx/testing REQUIRED TESTS 12/12  ✓
stynx doctor                    ✓

Status: STYNX compliant
```

At this point the service consumes `@stynx-nyx/*` idiomatically. New features are built on STYNX rails; the adoption branch merges after the shadow period.

---

## 6. Common gotchas observed during adoption

1. **`organization_id` is not always `tenant_id`.** Some apps use `organization_id` for a user-facing grouping concept rather than actual SaaS tenancy. The scan should flag these for human review before rename.
2. **Ad-hoc soft-delete columns must be triaged before migration.** Legacy `deleted` rows may include drafts, test data, or real removals.
3. **Missing `updated_at` and `updated_by` columns need backfill.** The codemod can synthesize safe defaults, but it cannot reconstruct historical truth.
4. **JWT claim shape changes.** Legacy `org_id` style claims differ from the STYNX shape (`sub`, `sid`, `tenant_id`, `perms_hash`).
5. **FK annotation defaults are conservative.** The scan proposes `block` when uncertain. Some relationships should become `cascade` after review.
6. **Complex raw SQL may stay raw.** `stynx adopt apply` preserves untranslatable queries as `sql\`...\`` blocks when necessary.
7. **Cognito migration is not a codemod.** The helper links identities; it does not provision Cognito users for you.

_End of worked example._
