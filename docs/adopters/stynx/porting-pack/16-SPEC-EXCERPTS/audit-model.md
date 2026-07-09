# Audit Model

> **Source:** `specs/STYNX-SPEC-v0.6.md` §9 (lines 493–565).
> **Spec version:** v0.6.

## Layer choice (§9.1)

DB-trigger audit, not application code. Tamper-resistant given
`stynx_app` cannot `DISABLE TRIGGER`. Every opted-in table fires
`audit.fn_row_change()` AFTER INSERT/UPDATE/DELETE (both live and
archive).

## Schema (§9.2)

```sql
CREATE SCHEMA audit;

CREATE TABLE audit.log (
  id           bigserial PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  tenant_id    uuid,
  actor_id     uuid,
  request_id   uuid,
  session_id   uuid,
  schema_name  text NOT NULL,
  table_name   text NOT NULL,
  row_pk       text NOT NULL,
  op           char(1) NOT NULL,           -- I, U, D, T (T = TRUNCATE)
  before       jsonb,
  after        jsonb,
  changed      text[],
  client_ip    inet,
  tags         jsonb                       -- e.g. {"soft_delete":true,"archived":true}
) PARTITION BY RANGE (occurred_at);

CREATE TABLE audit.system_op (...);
```

Defined in
`packages/data/migrations/platform/0008_audit.sql`.

## Trigger contract with the archive model (§9.3)

`audit.fn_row_change()` reads GUCs to disambiguate archive moves
from user-driven mutations. **This is the most subtle piece of the
audit pipeline — get the GUC handling wrong and you double-count or
miss audit rows.**

### Soft delete (live → archive)

1. `@stynx-nyx/data` sets `app.archive_move = 'in_progress'`,
   `app.archive_reason = 'soft_delete'`.
2. Application issues:
   ```sql
   INSERT INTO archive.{schema}_{table} SELECT ... FROM live.{schema}.{table} WHERE id = $1;
   DELETE FROM live.{schema}.{table} WHERE id = $1;
   ```
   (single transaction)
3. The archive INSERT trigger checks `app.archive_move`. If
   `in_progress`, writes **no** audit row (avoids duplicate).
4. The live DELETE trigger writes **one** audit row:
   - `op = 'D'`
   - `tags = {"soft_delete": true, "archived": true,
"archive_table": "archive.{schema}_{table}"}`

### Restore (archive → live)

1. `@stynx-nyx/data` sets `app.archive_move = 'in_progress'`,
   `app.archive_reason = 'restore'`.
2. INSERT into live; DELETE from archive (single transaction).
3. Archive DELETE trigger checks `app.archive_move` — writes no
   audit row if `in_progress`.
4. Live INSERT trigger writes one audit row:
   - `op = 'I'`
   - `tags = {"restore": true, "from_archive": true}`

### Hard delete from live (no archive involved)

Standard:

- `op = 'D'`
- `tags = {"hard_delete": true}`

### Direct operations on archive (LGPD erasure, admin archive purge)

No GUC set; archive triggers fire normally.

- LGPD erasure: `op = 'U'`,
  `tags = {"lgpd_erasure": true, "strategy": "nullify|hash|tombstone"}`.
- Admin archive purge: `op = 'D'`,
  `tags = {"hard_delete": true, "from_archive": true}`.

## Migration helper

```sql
SELECT audit.enable_for('sample.example_entity');
SELECT audit.enable_for('archive.sample_example_entity');  -- mirror also audited (direct ops only)
```

Called automatically by `data.create_soft_deletable_table(...)`.

`@NoAudit('reason')` opts a table out — the SQL annotation
`-- @no_audit: <reason>` must accompany the migration; the linter
enforces both.

## Retention (§9.4)

| Class                                                | Hot retention              | Cold archival                                                                   |
| ---------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| General                                              | **90 days** in `audit.log` | Older partitions detached monthly, shipped to `s3://.../audit/{yyyy-mm}.sql.gz` |
| LGPD-tagged (`tags @> '{"lgpd_erasure":true}'`)      | **5 years** hot            | Then archival                                                                   |
| `tags @> '{"hard_delete":true,"from_archive":true}'` | **5 years** hot            | Then archival                                                                   |
| `audit.system_op`                                    | **5 years** hot            | Then archival                                                                   |

The partition-detach job uses a per-partition `bool_or(...)` check
to decide hot vs cold eligibility. Volumes for the 5-year class
are tiny (admin events), so keeping them hot is cheap and supports
late-arriving compliance queries.

## LGPD metric

`lgpd_erasure_total{table, strategy}` — Prometheus counter
incremented on every LGPD-erasure write. New in v0.6 baseline.

## Read API (§9.5)

- `GET /_audit/log` — platform-role gated.
- Per-tenant admin UIs get a scoped subset.

## Hash chain integrity

Spec'd in `specs/GAP-001-audit-hash-chain.md`. Implementation status
verified by `stynx audit verify` (CLI command at
`packages/cli/src/audit.ts`). `[VERIFY in PORT-04 — confirm hash
chain is on by default and that `verifyAuditChain` passes against a
clean DB]`.

## Critical pitfalls (porting)

1. **GUC suppression depends on `app.archive_move`.** Custom
   archive movement code that bypasses `@stynx-nyx/data` and forgets
   the GUC will produce duplicate audit rows.
2. **`audit.enable_for` must be called for every consumer table.**
   The helper does it; hand-written CREATE TABLE migrations must
   call it explicitly or the table is silently un-audited.
3. **The 5-year LGPD partition retention is the spec's compliance
   anchor** — do not detach LGPD partitions early.
