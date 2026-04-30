# 03 — Core Concepts (Glossary)

Vocabulary for porting agents. After reading this, the agent should
use STYNX terms correctly without inventing synonyms.

## Tenant / TenantContext / `tenant_id`

A **Tenant** is the unit of isolation in STYNX. One tenant per row in
`tenancy.tenants`. Each tenant has a UUID id, a slug, a state
(`provisioning → active → suspended → archived → purged`), and an
`is_active` flag. Multi-tenancy is **pool + RLS** (one DB, one
Cognito pool, one S3 bucket per environment); tenants are
distinguished by `tenant_id` columns + Postgres RLS policies, not
schemas or databases. (`STYNX-SPEC-v0.6.md` §4.1.)

A column is a **`tenant_id`** if it is `uuid NOT NULL REFERENCES
tenancy.tenants(id)` and the table's RLS policy keys on
`current_setting('app.tenant_id', true)::uuid`. Other names like
`org_id`, `account_id`, `workspace_id` should be renamed to
`tenant_id` if they 1:1 map to STYNX tenants (see
[`12-DECISION-TREES.md`](12-DECISION-TREES.md) Tree 7).

The **`TenantContext`** is the request-scoped value (via
`nestjs-cls`) that names the current tenant. Reading
`TenantContext.tenantId` outside a request throws unless inside
`withSystemContext(...)`. (`packages/tenancy/src/tenant-context.interceptor.ts`.)

**Example:** an HTTP request arrives with `X-Tenant-Id:
abc...123`. `TenantContextInterceptor` validates membership, sets
the GUC, and `Database.tx()` issues `SET LOCAL app.tenant_id = 'abc...123'`.
RLS does the rest.

**See also:** [Three database roles](#three-database-roles), [GUCs](#gucs).

**Citation:** `specs/STYNX-SPEC-v0.6.md` §4.1–§4.2.

## Actor / ActorContext

An **Actor** is the principal performing the request — typically a
user (`auth.users.id`) but can be a system actor for
`withSystemContext` operations. The **`ActorContext`** carries the
actor id alongside `TenantContext`. `ActorContextMissingError` is
raised by `Database.tx()` when a write is attempted without one.

**Example:** every mutation sets `app.actor_id` so trigger-based
audit knows who changed what.

**Citation:** `packages/data/src/errors.ts`.

## Session, sid, perms_hash, generation

A **Session** is a STYNX bearer JWT (10 min TTL) plus an opaque
refresh token (24 h sliding). Stored hot in Redis and durably in
`auth.sessions` (partitioned monthly).

- **`sid`** — the session id; appears as a JWT claim.
- **`perms_hash`** — SHA-256 of the user's resolved permission set
  (sorted), cached with the session. On every request the auth guard
  compares the bearer's `perms_hash` to the cached value; mismatch
  triggers re-resolution and cache update.
- **`generation`** — a monotonic counter on the session record;
  rotated when the session is refreshed.

**Example:** a role change increments `auth.memberships.effective_hash`,
publishes a Redis pub/sub message, and the next request sees the
mismatch and re-resolves.

**Citation:** `specs/STYNX-SPEC-v0.6.md` §5.3, ADR-002,
`packages/auth/src/permission-cache.ts`.

## RequestContext

The full per-request bundle: `request_id`, `tenant_id`, `actor_id`,
`session_id`, `locale`, plus controller/route metadata. Provided by
`@stynx/core` (`packages/core/src/request-context.ts`). Used by
logging, audit, rate-limit, idempotency, and tracing layers.

**Example:** every Pino log line carries `{request_id, tenant_id,
actor_id}` automatically because `@stynx/logging` reads the context.

## Tenant-scoped table, RLS policy

A **tenant-scoped table** is a live table with `tenant_id uuid NOT
NULL`. Every such table must have **RLS enabled** + a
`tenant_isolation` policy keyed on `app.tenant_id` GUC. (Invariant
I5.) The `data.create_soft_deletable_table($$ ... $$)` helper sets
this up automatically.

**Example:**

```sql
ALTER TABLE sample.record ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample.record FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sample.record
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

**Citation:** `STYNX-SPEC-v0.6.md` §4.4.

## Live table vs archive table

A **live table** is the canonical table where business data lives.
An **archive table** is a mirror in the `archive` schema
(`archive.{schema}_{table}`) that holds soft-deleted rows
permanently. Application code reads only live by default; archive is
reached via `withDeleted()` / `onlyDeleted()` query helpers.

**Example:** `sample.record` is the live table;
`archive.sample_record` is its archive mirror. The mirror has
identical domain columns plus `archive_id bigserial PRIMARY KEY`,
`archived_at`, `deleted_at`, `deleted_by`.

**See also:** [`16-SPEC-EXCERPTS/soft-delete-model.md`](16-SPEC-EXCERPTS/soft-delete-model.md).

## Soft delete / hard delete / restore / cascade restore

- **Soft delete** — moves a row from live to archive (single
  transaction, GUC-gated audit). Default for all tenant-scoped
  tables (I8).
- **Hard delete** — removes a row from live without writing to
  archive. Used only with explicit `:hard_delete:*` permission.
- **Hard delete from archive** — removes a row from archive
  (admin-only; LGPD purge or admin archive erasure).
- **Restore** — moves a row from archive back to live. Validates
  unique constraints first; 409 on conflict.
- **Cascade restore** — `restoreWithCascade(table, id)` restores the
  parent plus all archived descendants whose `deleted_at` matches
  the parent's (timestamp-equality match — avoids restoring children
  archived in unrelated operations). Requires `:restore:*` on every
  child table.

**Citation:** `STYNX-SPEC-v0.6.md` §14.5, §14.6.

## FK annotations: `cascade`, `block`, `hide`

Every FK to a soft-deletable parent **must** carry one of three
annotations on the migration line:

- **`-- @softdelete_fk: cascade`** — children archive with parent
  atomically.
- **`-- @softdelete_fk: block`** — parent cannot be archived while
  children exist; soft-delete returns 409 with blocker list.
- **`-- @softdelete_fk: hide`** — children remain in live; FK column
  shows orphaned (must be nullable). Used for audit/historical
  links (e.g., `created_by_user_id` to `auth.users`).

The migration linter rejects any FK to a soft-deletable parent
without an annotation (LINT004). See
[`12-DECISION-TREES.md`](12-DECISION-TREES.md) Tree 1 for choosing.

## Permission key — `resource:action:scope`

RBAC permission shape. Examples: `record:read:*`, `record:read:own`,
`record:write:*`, `record:hard_delete:*`. No ABAC. Wildcards expand
at cache build time; runtime check is O(1) hash-set lookup.

**Default tenant roles:** `owner`, `admin`, `member`, `viewer`
(seeded on tenant creation).

**Platform roles:** `platform:support`, `platform:billing`,
`platform:ops`. Group hierarchy depth capped at 8.

**Citation:** `STYNX-SPEC-v0.6.md` §6.1.

## Three database roles — `stynx_owner`, `stynx_app`, `stynx_reader`

| Role           | RLS            | Privileges                                 | Used by                              |
| -------------- | -------------- | ------------------------------------------ | ------------------------------------ |
| `stynx_owner`  | BYPASSRLS      | DDL                                        | Migrations; `withSystemContext(...)` |
| `stynx_app`    | Subject to RLS | DML on live + archive; SELECT on `audit.*` | Default app connections              |
| `stynx_reader` | Subject to RLS | SELECT on live + archive                   | Read-only routes (`@ReadOnly()`)     |

Provisioned by
`packages/data/migrations/platform/0001_roles.sql`.

## GUCs — `app.tenant_id`, `app.actor_id`, `app.archive_move`, …

Postgres custom GUC settings set at the start of every transaction
by `@stynx/data`:

```sql
SET LOCAL app.tenant_id    = '...';
SET LOCAL app.actor_id     = '...';
SET LOCAL app.request_id   = '...';
SET LOCAL app.session_id   = '...';
SET LOCAL app.role         = 'app' | 'reader' | 'owner';
```

Plus, during archive moves:

```sql
SET LOCAL app.archive_move    = 'in_progress';   -- suppresses archive-side audit duplication
SET LOCAL app.archive_reason  = 'soft_delete';   -- or 'restore'
```

The audit trigger reads `app.archive_move` to decide whether to
write a duplicate audit row during archive moves. Bypassing
`@stynx/data`'s archive flow leaves the GUC unset → duplicate audit
rows.

**Citation:** `STYNX-SPEC-v0.6.md` §4.4, §9.3.

## LGPD strategies — `nullify`, `hash_with_salt`, `tombstone_row`, `delete_row`

Erasure strategies declared per column in `core.pii_map`:

- **`nullify`** — set the column to NULL. Most common.
- **`hash_with_salt`** — replace with salted hash. For columns where
  you need to retain identity-of-reference without revealing the
  value (e.g., audit references).
- **`tombstone_row`** — mark row tombstoned; hide from queries. Used
  when row must persist for accounting but PII must vanish.
- **`delete_row`** — hard-delete from live and archive. Last resort;
  for legal-mandated total erasure.

LGPD-tagged audit partitions retain hot for 5 years (vs 90 days
general). See [`16-SPEC-EXCERPTS/audit-model.md`](16-SPEC-EXCERPTS/audit-model.md)
§9.4.

`[VERIFY in PORT-08 — exact strategy enum lives in
`packages/privacy/src/pii-map.service.ts` or types module.]`

## System context / `withSystemContext`

A scope that runs code without a tenant — for migrations, cron jobs,
queue workers, boot-time seeding. Wraps a `reason` string for
audit traceability. Inside the callback, `Database.tx` succeeds
without a tenant; queries run as `stynx_owner` (BYPASSRLS) by
default.

**Example:**

```typescript
await db.withSystemContext('cron-audit-retention', async () => {
  await db.tx(
    async (trx) =>
      trx.execute(sql`DELETE FROM audit.log WHERE occurred_at < NOW() - INTERVAL '90 days'`),
    { role: 'owner' },
  );
});
```

The `reason` is recorded in `audit.system_op` with 5-year hot
retention. `withSystemContext` bypasses **tenant scope**, NOT
**audit**.

**Citation:** `packages/data/src/system-context.ts`.

## Idempotency key

A client-supplied identifier (`Idempotency-Key` header) that allows
safe retry of mutations. Same key + same request → return cached
response; new key → execute and cache. 24 h TTL in Redis with
`core.idempotency_keys` durable mirror. Stripe-compatible semantics.

**Example:**

```typescript
@Post()
@Permission('record:write:*')
@Idempotent('Idempotency-Key')
create(@Body() dto: CreateRecordDto, @Headers('Idempotency-Key') key: string) {
  return this.records.create(dto);
}
```

**Citation:** `STYNX-SPEC-v0.6.md` §22, `packages/idempotency/`.

## Doctor

The `stynx doctor` CLI command (`packages/cli/src/doctor.ts`). Walks
controllers, migrations, and config to report invariant violations
(I4 route coverage, I6 audit coverage, I7 read-only enforcement,
I8 archive mirror parity). Audit FIND-011 noted empty output at
audit time — verify before relying on it as a CI gate.
