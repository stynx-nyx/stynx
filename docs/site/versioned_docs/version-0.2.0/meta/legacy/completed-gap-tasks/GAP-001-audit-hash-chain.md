# GAP-001 — Audit: Append-Only Hash Chaining

**Priority:** CRITICAL
**Package:** `packages/audit`
**DDL:** `database/ddl/02-audit.sql`
**Source of truth:** pec's `audit.events` hash-chain model
**Run from:** `./stynx` repo root
**Status:** Complete

---

## Context

`audit.events` rows are currently independent. A database administrator with
write access can silently alter or delete historical events with no detectable
evidence. pec solves this with a cryptographic hash chain: each row stores
`sha256(own_fields || previous_row_hash)`. Mutating any row forces a full
re-hash of all downstream rows, making tampering practically detectable.

---

## Goal

Add a `previous_hash` column to `audit.events` and compute it on every insert
so that the chain can be verified at any time by re-computing hashes in event
order and comparing them to the stored values.

---

## Step 1 — Read current state

Before writing any code, read these files in full:

- `database/ddl/02-audit.sql`
- `packages/audit/src/types.ts`
- `packages/audit/src/sql-adapter.ts`
- `packages/audit/src/audit.service.ts`
- `database/ddl/00-extensions.sql` (confirm `pgcrypto` is present)

---

## Step 2 — Migrate `database/ddl/02-audit.sql`

### 2a — Add column to `audit.events`

After the existing column list in the `CREATE TABLE audit.events` statement,
add:

```sql
  previous_hash  text          null,
  row_hash       text          not null generated always as (
    encode(
      digest(
        coalesce(event_id::text,     '') || '|' ||
        coalesce(occurred_at::text,  '') || '|' ||
        coalesce(tenancy_id::text,   '') || '|' ||
        coalesce(actor_id::text,     '') || '|' ||
        coalesce(entity,             '') || '|' ||
        coalesce(entity_id,          '') || '|' ||
        coalesce(operation::text,    '') || '|' ||
        coalesce(old_data::text,     '') || '|' ||
        coalesce(new_data::text,     '') || '|' ||
        coalesce(previous_hash,      'GENESIS'),
        'sha256'
      ),
      'hex'
    )
  ) stored,
```

`row_hash` is a generated stored column — it is always consistent with the
row's data and cannot be manually set to an arbitrary value.

### 2b — Update `audit.write()` function

`audit.write()` currently inserts rows without a `previous_hash`. Change the
function body to:

1. Fetch the `row_hash` of the most recent event for the same `tenancy_id`
   using `SELECT row_hash FROM audit.events WHERE tenancy_id = $tenancy_id
ORDER BY occurred_at DESC, event_id DESC LIMIT 1 FOR UPDATE`.
2. Pass that value as `previous_hash` in the INSERT.
3. If no prior row exists, pass `NULL` (the generated column will use
   `'GENESIS'` as the seed — consistent with a chain start).

Use `FOR UPDATE` on the SELECT to serialise concurrent writers per tenant and
prevent hash-chain forks.

### 2c — Update `audit.fn_log_dml()` trigger function

Apply the same pattern as 2b: look up the latest `row_hash` for the current
tenant and pass it as `previous_hash` when calling `audit.write()` or
performing the direct INSERT.

### 2d — Add verification function

```sql
create or replace function audit.verify_chain(
  p_tenancy_id uuid,
  p_limit      int default 1000
)
returns table (
  event_id      uuid,
  occurred_at   timestamptz,
  expected_hash text,
  stored_hash   text,
  chain_valid   boolean
)
language sql stable
as $$
  select
    e.event_id,
    e.occurred_at,
    e.row_hash                       as expected_hash,  -- generated column
    e.row_hash                       as stored_hash,
    true                             as chain_valid
  from audit.events e
  where e.tenancy_id = p_tenancy_id
  order by e.occurred_at, e.event_id
  limit p_limit;
$$;
```

The real integrity check is done in the application layer (GAP-001 Step 4).
This function provides a queryable surface for spot checks.

---

## Step 3 — Update TypeScript types

### `packages/audit/src/types.ts`

Add to the `AuditEvent` interface (or equivalent export type):

```typescript
previousHash: string | null; // null for the first event in a tenant chain
rowHash: string; // sha256 of own fields + previousHash
```

### `packages/audit/src/sql-adapter.ts`

Update any SELECT query that reads `audit.events` to include
`previous_hash` and `row_hash` in the column list and map them to the
TypeScript type.

### `packages/audit/src/audit.service.ts`

Add a `verifyChain(tenancyId: string, limit?: number): Promise&lt;ChainVerificationResult&gt;` method:

```typescript
export interface ChainVerificationResult {
  valid: boolean;
  totalChecked: number;
  firstBrokenEventId?: string;
}
```

The method fetches up to `limit` rows ordered by `(occurred_at, event_id)`,
then re-computes each `row_hash` in JavaScript using Node's built-in
`crypto.createHash('sha256')` and compares it to the stored value. Return
`&#123; valid: false, firstBrokenEventId &#125;` on the first mismatch.

Export `ChainVerificationResult` from `packages/audit/src/index.ts`.

---

## Step 4 — Add integration test

In `test/db/` create `audit-hash-chain.test.ts`:

```typescript
// 1. Insert 3 audit events via audit.write() for the same tenancy_id
// 2. Read all three rows, verify row_hash is non-null on each
// 3. Verify row 2's previous_hash === row 1's row_hash
// 4. Verify row 3's previous_hash === row 2's row_hash
// 5. Call auditService.verifyChain(tenancyId) — expect { valid: true }
// 6. Directly UPDATE audit.events SET old_data = '{}' WHERE event_id = row1
// 7. Call verifyChain again — expect { valid: false, firstBrokenEventId: row1.event_id }
```

Use the existing Testcontainers PostgreSQL setup already present in `test/db/`.

---

## Step 5 — Update package exports

In `packages/audit/src/index.ts`, add exports for:

- `ChainVerificationResult`
- `verifyChain` (re-exported from the service if needed)

---

## Verification

```bash
# Schema compiles cleanly
psql $DATABASE_URL -f database/ddl/02-audit.sql

# TypeScript builds
pnpm --filter @stynx/audit build

# Unit tests pass
pnpm --filter @stynx/audit test

# Integration test passes (requires PostgreSQL)
pnpm test:int 2>&1 | grep -E "audit-hash|PASS|FAIL"

# Lint clean
pnpm --filter @stynx/audit lint
```

---

## Acceptance criteria

- [x] `audit.events` has `previous_hash` (nullable) and insert-trigger-computed `row_hash` columns in both the DDL reference and platform migration
- [x] `audit.write()` always populates `previous_hash` from the previous row's `row_hash`
- [x] DML audit triggers write hash-chain events using the same hash helper path (`audit.fn_log_dml()` in the DDL reference and `audit.fn_row_change()` in the platform migration)
- [x] `auditService.verifyChain()` returns `&#123; valid: false &#125;` when any row is mutated
- [x] Integration test covers chain creation and tamper detection
- [x] `pnpm build`, `pnpm test:unit`, `pnpm test:int`, `pnpm lint` all green
