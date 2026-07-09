---
adr_id: ADR-001
title: Soft Delete Mechanics and Cascading Semantics
status: accepted
date: 2026-05-16
authors: ['@aarusso']
tags: [stynx, soft-delete, data-layer, post-c4]
---

# ADR-001 — Soft Delete Mechanics and Cascading Semantics

**Authority:** Architect.
**Related:** [`docs/arch/STYNX-SPEC-v0.6.md`](/docs/arch/STYNX-SPEC-v0.6) §14, §13.4, §13.5. Pre-pilot history: file was at `specs/STYNX-ADR-001-soft-delete.md` until C-4 Session S5 (commit `cb734ac`); re-authored to DEVAI ADR schema in C-4 Session T3.

## Status

Accepted on 2026-05-16 (re-authored to DEVAI schema; the underlying decision was made pre-pilot — original Status was "Proposed"; accepted as of stynx v1.0 release prep).

## Context

Stynx supports tenant-scoped data with regulatory erasure requirements (LGPD Art. 18). Two mechanically distinct soft-delete patterns coexisted across the platform — Part A documents the strategy choice and Part B documents the cascading semantics.

The full Context is the analysis in Part A (Soft Delete Strategy) and Part B (Cascading Semantics) below.

## Decisions

The decisions made in this ADR:

1. **Strategy** (Part A): adopt the **archive-schema, same database** approach (option B) over in-table flags (A) and twin-database (C).
2. **Cascading semantics** (Part B): cascading soft-deletes follow [the rules elaborated in Part B's table and prose].

See Part A and Part B below for the detailed reasoning, trade-off matrices, and operational notes.

## Alternatives Considered

Three soft-delete strategies were evaluated in detail (Part A §A.1):

- **Option A — In-table flag** (`deleted_at timestamptz NULL`)
- **Option B — Archive schema, same database** (selected)
- **Option C — Twin archive database**

Plus alternatives dismissed early (temporal tables, event sourcing, audit-log reconstruction) for operational or teachability reasons (Part A §A.1 preamble).

## Affected Rules

- `INV-RBAC-001` references tenant-bound endpoints; soft-delete affects what those endpoints return.
- `INV-PRIVACY-001` (LGPD/GDPR PII retention) interacts with soft-delete erasure semantics.
- `tools/migration-linter/` enforces the archive-table pairing pattern that flows from this ADR.
- `packages/data/`'s `core.create_soft_deletable_table()` helper is the canonical implementation surface.

## Consequences

See "## Consequences" section near the end of this document (line ~263 in the pre-T3 layout).

---

## Part A — Soft Delete Strategy

### A.1 Options on the table

Three mechanics are serious contenders. Others (temporal tables, event sourcing, audit‑log reconstruction) fail early on operational or teachability grounds and are not evaluated in depth here.

#### A — In‑table flag

`deleted_at timestamptz NULL` column on the live table. Queries filter `WHERE deleted_at IS NULL` by default. Partial unique indexes (`UNIQUE(...) WHERE deleted_at IS NULL`) preserve uniqueness semantics. Hard delete removes the row. This is what v0.3 specified.

#### B — Archive schema, same database

Mirrored tables in a dedicated `archive` schema. Soft delete moves the row from live to archive in a single transaction. Live table is clean (no `deleted_at` column). This is what v0.4 currently specifies.

#### C — Twin archive database

Separate PostgreSQL instance (or separate database on the same instance) holds archived rows. Soft delete requires cross‑database movement.

### A.2 Trade‑off matrix

| Concern                           | A (in‑table)                                                                                                                                                                             | B (archive schema, same DB)                                                                                                                      | C (twin DB)                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Mechanical simplicity             | **Simplest.** One table, one column, one filter.                                                                                                                                         | Two tables per entity; migration linter required for parity.                                                                                     | Two databases, two connection pools, distributed concerns.                                                                             |
| Atomicity of delete               | Trivial (`UPDATE`).                                                                                                                                                                      | Trivial (single‑DB transaction).                                                                                                                 | **Requires 2PC** or dual‑write with reconciliation. PG 2PC is incompatible with PgBouncer transaction pooling (one of our invariants). |
| Live‑table performance            | Accumulates tombstones; index bloat on filtered predicates. Partial indexes help. At scale, autovacuum works harder.                                                                     | **Live tables stay pristine.** Better cache locality, smaller indexes, cleaner query plans.                                                      | Same as B.                                                                                                                             |
| Query ergonomics                  | Every query must remember the filter. Forgetting it = data leak. ORMs help via global filters.                                                                                           | Default query path hits only live; accessing archive requires explicit `withDeleted()` / `onlyDeleted()`. Hard to leak accidentally.             | Archive is a different connection entirely; no accidental leak possible.                                                               |
| Unique constraints                | Require partial indexes (`WHERE deleted_at IS NULL`) on every uniqueness rule. Subtle to get right; migration linter needed.                                                             | Plain constraints on live. Archive has none.                                                                                                     | Plain constraints on live.                                                                                                             |
| Restore                           | `UPDATE deleted_at = NULL`. Subject to unique conflicts if re‑creation happened.                                                                                                         | Move row back; same conflict concern.                                                                                                            | Cross‑DB move; 2PC again.                                                                                                              |
| LGPD erasure                      | Process live rows where `deleted_at IS NOT NULL` alongside active. Single scan.                                                                                                          | Process live + archive. Two passes but both in same DB.                                                                                          | Cross‑DB orchestration; operationally painful.                                                                                         |
| Referential integrity             | FKs work normally; soft‑deleted parent still satisfies FK (children may dangle semantically).                                                                                            | Parent DELETE from live triggers `ON DELETE` behavior (RESTRICT/SET NULL/CASCADE). Archive has no outgoing FKs by design.                        | FK across databases impossible. Application‑level orphan risk.                                                                         |
| Backup / DR                       | One snapshot.                                                                                                                                                                            | One snapshot.                                                                                                                                    | **Two snapshots, coordinated.** RTO/RPO complexity doubles.                                                                            |
| Read replicas                     | One.                                                                                                                                                                                     | One (serves both live and archive reads).                                                                                                        | Two.                                                                                                                                   |
| Vacuum / bloat                    | Tombstones stay in live table; autovacuum and index bloat scale with delete volume.                                                                                                      | Live vacuum footprint is only truly‑deleted rows (soft delete = DELETE from live); archive grows unbounded but is rarely vacuumed (append‑only). | Same as B but across two instances.                                                                                                    |
| Cognitive load for a new engineer | "Don't forget the `deleted_at IS NULL` filter." Single rule.                                                                                                                             | "Live and archive are twins; the linter keeps them in sync; query helpers choose which side." More to learn, less to forget.                     | "Archive is a whole other database with its own pool, its own RLS, its own auth." Highest load.                                        |
| LGPD defensibility                | Regulators see one table with a flag. Deleted data is still present, same schema, same indexes. Technically compliant if queries filter correctly, but easy to misstate during an audit. | Regulators see an explicit `archive` schema. "Deleted data is separated" is a clean sentence to say. Easier to narrate.                          | Even cleaner separation, but the operational overhead isn't justified by LGPD alone at this scale.                                     |
| When it breaks down               | Tables with very high delete volume (tombstone/bloat eventually forces archive anyway).                                                                                                  | Very large archive volumes (needs partitioning — deferred as E9).                                                                                | Only justified at archive scales that STYNX will not hit at tens–hundreds of tenants.                                                  |

### A.3 Ruling out C

_Twin database is the wrong choice here, and I'd push back if you asked to adopt it._ Four concrete reasons:

1. **PgBouncer transaction pooling + 2PC do not compose.** Our I1/I2 invariants require `SET LOCAL` and transaction‑scoped GUC propagation, which is why we picked transaction pooling over session pooling (§13.2). Distributed transactions across two databases need `PREPARE TRANSACTION` on each side — this is supported by PG but incompatible with transaction pooling in practice (PgBouncer loses the prepared state between statements). You would need a dedicated session pool for every soft‑delete operation, which blows up connection economics.
2. **Without 2PC, you need an outbox or reconciliation saga.** That's a whole subsystem — one of the deferred extensions (E3). Building it to serve soft‑delete only, in v1.0, is a scope explosion.
3. **The archive volume does not justify it.** Tens to hundreds of tenants, each with realistically 10³–10⁵ mutating operations per day, gives archive growth in the hundreds of millions of rows over a multi‑year horizon — comfortably within a single well‑provisioned PG instance, especially with per‑table partitioning when that becomes needed.
4. **RLS, audit, and privacy all live in the main DB.** Splitting archive to a twin means duplicating all three. Every erasure, every audit query, every tenant‑scoped read becomes a dual‑system coordination problem.

Twin DB makes sense under exactly one set of conditions we do not have: archive volumes so large they threaten the operational DB, combined with a compliance regime that requires physical separation (e.g., data residency mandating archive in a separate AWS account or region). Neither applies.

_Source: PostgreSQL docs on prepared transactions and their session‑binding requirements; PgBouncer documentation on transaction pooling limitations ("Features that break: SET/RESET, LISTEN, WITH HOLD CURSOR, PREPARE / DEALLOCATE, PRESERVE/DELETE ROWS temp tables, LOAD, server‑side prepared statements"). The PgBouncer FAQ explicitly lists prepared transactions among the things transaction pooling cannot handle cleanly._

### A.4 A vs B — the real choice

_This is a closer call than I made it look in v0.4, and I want to be honest about that._

**The case for A (in‑table flag):**

- You pay the complexity cost once, in a well‑tested helper, and never think about it again.
- Drizzle has clean patterns for automatic global filters (there are several community implementations; one Drizzle‑official pattern is likely within 12 months given the ORM's trajectory).
- At your scale, table bloat from soft-deleted rows is manageable. A `record` table with 100k active + 20k deleted rows performs identically to one with 120k active, modulo query plans that can use the partial index for the live set.
- One schema to evolve, one migration review per entity, one mental model.
- LGPD compliance is still defensible — deleted rows are still tenant‑scoped, still RLS‑protected, just flagged.
- The "forgot the filter" failure mode is real but it's a test responsibility, not an architectural one. Our mandatory RLS leak test (§16.3 #1) can be extended to check deleted‑row leakage.

**The case for B (archive schema, same DB):**

- Live tables stay clean forever. Query plans and index footprints scale with _active_ data, not cumulative delete volume. For an app that runs for a decade, this compounds.
- The "can I accidentally see deleted data?" question has a crisp answer: no, unless you call `withDeleted()` explicitly. A reviewer can verify by grep.
- Partial unique indexes are an ergonomic tax every time you add a `UNIQUE` constraint. The linter catches it but it slows down PR review.
- LGPD audits are cleaner to narrate: "deleted data lives in the `archive` schema, which has its own access controls and its own deletion lifecycle." Regulators understand this faster than "deleted data has a flag."
- Archive can evolve with different access patterns: different indexes, future partitioning, colder storage via tablespaces. Live table keeps its operational profile.

**Where I come down, with calibrated confidence:**

_I lean B, at about 60/40. The decisive factor for me is the "can't accidentally leak" property, which I care about more in a foundation library consumed by many apps over many years than in a single‑app codebase. A shared foundation that makes it structurally difficult to leak deleted data is worth more than the mirror‑management overhead, which the linter absorbs._

_If you lean A instead, I won't argue hard. The two reasonable reasons to flip are:_

1. _You expect `stynx adopt` to be used heavily on legacy apps where retrofitting archive mirrors for 50+ tables is operationally painful. A is a cheaper retrofit (add a column, add partial indexes)._
2. _You have a strong intuition that mirror management will become a friction point despite the linter. This is a judgement call I can't make from outside your team's rhythm._

**A hybrid ("A now, promote to B later") is not a good path.** Migrating from A to B is possible but expensive — you'd need a one‑shot move of every historical soft‑deleted row, plus a schema flip, plus code changes. Pick one and commit.

### A.5 Recommendation

**Stay with B (archive schema, same DB)** as specified in v0.4, but with two refinements to reduce the cost you were reacting to:

1. **Make the helper the primary authoring surface.** In v0.4 §14.3 the helper `data.create_soft_deletable_table(...)` is shown as an option. Make it the _default_. Consumers write one `CREATE TABLE` inside the helper and get the live table + archive mirror + RLS on both + audit wiring + indexes automatically. Hand‑written mirror DDL is an escape hatch, not the common path. This takes the ongoing cognitive load of mirror parity down to near zero.
2. **Stop emitting `archive.*` in Drizzle schema files.** Archive tables are derived; developers should read and write live tables only. `@stynx-nyx/data` exposes query helpers (`.withDeleted()`, `.onlyDeleted()`) that resolve archive access internally. Drizzle types for archive are generated into a separate, ignored module consumed only by the helpers. Result: developers never see the mirror except in migrations.

With those two moves, the day‑to‑day cost of B approaches the cost of A, and you retain the structural‑safety benefits.

---

## Part B — Cascading Soft Deletes, in Detail

### B.1 The problem

When you soft‑delete Customer X, what happens to the Invoices, Addresses, Memberships, and Notes that reference Customer X? The question has three sensible answers and no universal default — domain semantics decide per FK.

### B.2 The three annotations

Every FK to a soft‑deletable parent must carry one annotation. No default: the migration linter fails the migration if missing.

#### `block`

**Intent:** the parent cannot be soft‑deleted while active children exist.

**DB:** `FOREIGN KEY (...) REFERENCES parent(id) ON DELETE RESTRICT`.

**Mechanics:** `softDelete(parent, id)` performs the archive INSERT + live DELETE transaction. The DELETE raises `foreign_key_violation` (SQLSTATE 23503) if any child row still references this parent. `@stynx-nyx/data` catches the error, looks up the child tables from `core.softdelete_fk_registry`, queries for blocking children (limited to the first N, say 10, with a count), and returns a 409 response:

```json
{
  "code": "SOFT_DELETE_BLOCKED_BY_CHILDREN",
  "parent": { "schema": "sample", "table": "record", "id": "..." },
  "blocking_children": [
    { "schema": "sample", "table": "work_item", "count": 47, "sample_ids": ["...", "...", "..."] },
    { "schema": "sample", "table": "record_note", "count": 2, "sample_ids": ["...", "..."] }
  ]
}
```

**When to use:** children have independent lifecycle and shouldn't disappear silently. A `tenants → audit_exports` FK where pending exports must complete or be explicitly abandoned. A `users → sessions` FK where you want forced logout before user deletion.

**Cost:** a query per child table to enumerate blockers on every soft‑delete. Cheap if FKs are indexed (which they should be).

#### `cascade`

**Intent:** children belong to parent; archiving parent archives children atomically.

**DB:** `FOREIGN KEY (...) REFERENCES parent(id) ON DELETE RESTRICT`. _Not_ `CASCADE` — Postgres `ON DELETE CASCADE` would hard‑delete the children, losing them. We want them moved to archive, not deleted.

**Mechanics:** `softDelete(parent, id)` walks the `core.softdelete_fk_registry` for all `cascade` children of the parent table, issues a recursive archive move:

```
procedure softDelete(table, id):
  children := registry.cascadeChildrenOf(table)
  for each (child_table, fk_column) in children:
    for each child_row where child_row.{fk_column} = id:
      softDelete(child_table, child_row.id)   -- recurse
  archiveMove(table, id)                       -- INSERT archive + DELETE live
```

All of this happens in one transaction with `app.archive_move='in_progress'` set, so audit fires once per row deleted from live and never on the archive INSERTs.

**When to use:** children have no meaning without the parent. A `record -&gt; notes` FK means deleting the record archives the notes too. A `work_item -&gt; entries` FK means the entries are compositionally part of the work item.

**Cost:** proportional to the subtree size. A record with 10k work items x 50 entries = 500k row moves in one transaction. This is the failure mode of cascade.

#### `hide`

**Intent:** children remain live with the link severed.

**DB:** `FOREIGN KEY (...) REFERENCES parent(id) ON DELETE SET NULL`. **Requires the FK column to be nullable.** This is a hard constraint — `hide` is unavailable if the FK column is NOT NULL, and the linter will reject a `hide` annotation on a non‑nullable FK with a clear error.

**Mechanics:** `softDelete(parent, id)` executes normally; Postgres `ON DELETE SET NULL` nulls the child's FK column automatically as part of the parent DELETE. Children stay in live, with NULL where they used to point. Application UIs render these as "(removed)" or hide them from lists that join through the FK.

**When to use:** the relationship is informational, not structural. A `created_by_user` FK on a `work_item`, where the user leaving should not invalidate the work item. An `owner_user_id` on a `record` can also be just a pointer.

**When not to use:** any FK where the child cannot semantically exist without the parent (an Invoice without a Customer; an Address without a Customer). In those cases, the FK column is NOT NULL and `hide` is unavailable — you must pick `cascade` or `block`.

### B.3 Worked example

Tenant Sample Demo is being soft-deleted. The FK graph and annotations:

```
tenancy.tenants(id)
├── auth.memberships.tenant_id          → cascade
│   └── (memberships carry no children of their own)
├── sample.record.tenant_id                 → cascade
│   ├── sample.record_note.record_id        → cascade
│   ├── sample.work_item.record_id          → cascade
│   │   ├── sample.work_item_entry.work_item_id → cascade
│   │   └── sample.work_item_lock.work_item_id  → cascade
│   └── sample.work_item.created_by_user_id → hide (nullable)
└── sample.audit_export.tenant_id          → block
```

Soft-deleting Sample Demo in one transaction:

1. `softDelete(tenancy.tenants, 'sample-id')` called.
2. Registry lookup: children with `cascade` — `auth.memberships`, `sample.record`. Children with `block` — `sample.audit_export`.
3. Check blockers. If any row in `sample.audit_export` has `tenant_id = 'sample-id'`, **abort with 409** listing pending exports. (Fail fast before touching anything.)
4. Otherwise, recurse into `sample.record`:
   - For each record, recurse into `record_note`, `work_item`.
   - For each work item, recurse into `work_item_entry`, `work_item_lock`.
   - Archive the leaves first (locks, entries), then work items, then notes, then records.
5. Recurse into `auth.memberships`: archive each membership.
6. Archive the tenant row itself.
7. Commit.

Postgres handles the `hide` case automatically during step 4: when a `work_item` is DELETEd from live, the `created_by_user_id` FK has `ON DELETE SET NULL`, so any child pointing at the deleted user gets nulled. (This is the reverse direction of our cascade walk, so actually it doesn't apply here — `hide` is relevant when the _user_ is deleted, not the tenant.)

Audit trail after commit: one audit row per row DELETEd from live, tagged `&#123;soft_delete, archived&#125;`. No audit rows from the archive INSERT side (suppressed by the GUC).

### B.4 Depth limit (Q2 in v0.4 §27)

_I proposed a default depth limit of 4 to prevent pathological cascade topologies from accidentally archiving half the database. The rationale: a 4-level hierarchy (tenant -&gt; record -&gt; work_item -&gt; work_item_entry) is a practical upper bound for most consumer models; anything deeper is usually a taxonomy tree that probably should not cascade as soft delete._

Concretely, `softDelete` tracks recursion depth and raises `CASCADE_TOO_DEEP` if it exceeds the limit. Consumer apps can raise the limit per call via `softDelete(table, id, &#123; maxCascadeDepth: 6 &#125;)` if they know what they're doing.

### B.5 Transaction size

The real cost of `cascade` is transaction size. Moving 500k rows in one transaction is not unreasonable on modern PG but has real costs:

- **WAL volume:** 500k `INSERT` + 500k `DELETE` statements write a lot. Replication lag spikes.
- **Lock footprint:** row‑level locks on every moved row. Brief in practice (&lt; a few seconds for 500k rows if indexes cooperate), but blocks concurrent writes to the same rows.
- **Audit volume:** 500k audit rows. `audit.log` is partitioned; this is not a showstopper but is a spike.
- **Client timeout:** if the request is user-initiated (for example, "delete record"), a 30-second cascade feels broken.

Mitigations:

1. **Cascade size limit**, separate from depth limit. Reject cascades that would touch &gt; `cascadeRowLimit` rows (default: 10 000). Consumer can override per call.
2. **Precount the cascade** before starting. A fast `COUNT(*)` per cascade child using indexed FKs. If over limit, fail with `CASCADE_TOO_LARGE` and the counts; caller can escalate to bulk tooling.
3. **For "delete whole tenant" scenarios**, cascade is the wrong tool. Use the tenant lifecycle's archive/purge flow (§4.5), which is offline and explicit.

### B.6 `hide` and NOT NULL — the recurring gotcha

Whenever a consumer wants `hide` on an FK that's currently NOT NULL, they need a migration that:

1. Alters the child column to NULL.
2. Adds the `ON DELETE SET NULL` clause.
3. Annotates `-- @softdelete_fk: hide`.

This is a schema change and will usually require application code adjustments (the type becomes `T | null`, listing queries may need to filter NULL, UI may need to render "removed"). The linter should flag `hide` annotations that would require column nullability changes and print the full migration skeleton.

### B.7 Self‑referencing FKs

`auth.groups.parent_id → auth.groups.id` is a self‑reference. All three behaviors are defined and useful:

- `cascade`: deleting a parent group archives all descendants recursively. Depth limit applies.
- `hide`: deleting a parent group makes its children root groups (parent_id = NULL). Requires `parent_id` nullable — it already is in the v0.4 `auth.groups` schema.
- `block`: cannot archive a group that has active children.

The recursion logic handles self‑references identically to cross‑table references; no special case needed.

### B.8 Interaction with the restore path

Restore does not cascade. If you restore a row whose children were cascade‑archived along with it, those children stay in archive. The restore helper's 409 response (Q7 in v0.4 §27) extends to flag this: if the archive row being restored had cascade children that are still archived, the response includes them so the caller can decide whether to restore them too.

A convenience helper `restoreWithCascade(table, id)` exists for the common "oops, restore the whole thing" case. It performs the inverse walk: restore parent, then walk archive to find children that were cascade‑archived _at the same timestamp_, then restore those, recursively. The match criterion is exact timestamp equality (`deleted_at = parent.deleted_at`) plus FK pointing to the parent's original id. This avoids restoring children that were archived in a _different_ operation.

### B.9 Summary table — when to pick which

| Relationship semantics                                                                                         | Annotation                                                                               |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Child is compositionally part of parent; parent without children is nonsense.                                  | `cascade`                                                                                |
| Child has independent lifecycle; parent can't be deleted while children are active.                            | `block`                                                                                  |
| Link is informational; child stands alone when parent vanishes.                                                | `hide` (FK must be nullable)                                                             |
| Child count is huge and business logic says cascade is correct but the operation can't fit in one transaction. | Don't use soft delete at this edge. Use offline bulk tooling or the tenant archive flow. |
| You don't know yet.                                                                                            | Pick `block`. It's the safest default; it fails loudly when you didn't think about it.   |

---

## Consequences

If the recommendation in A.5 is accepted:

- v0.4 §14 remains substantially unchanged.
- v0.4 §14.3 is reframed: the helper is the default, hand‑written mirror DDL is an escape hatch.
- A new subsection is added noting that archive Drizzle types are derived and not surfaced in consumer code.
- §14.7 is rewritten with the detail from B.2–B.8 of this ADR.
- §16.3 gets one more mandatory test: cascade transaction size stays under the configured limit for realistic fixtures.

If A.5 is rejected in favor of Option A (in‑table flag):

- §14 rewrites back toward the v0.3 approach.
- Partial unique indexes return to §7.
- §9.3's GUC‑suppression mechanism simplifies (no archive side to suppress).
- The adoption codemod gets simpler (add column vs create mirror).
- Net lines of spec decrease; net lines of runtime code also decrease.
- Accepting slightly higher accidental‑leak risk and slightly higher long‑term table bloat.

---

## Open decisions to close before returning to §27

1. **Confirm Option B** or flip to Option A. (My lean: B, at 60/40.)
2. If B: confirm the refinement in A.5 — "helper is default, mirror DDL hidden from consumers."
3. **Cascade row limit default.** 10 000 is my suggestion.
4. **`block` as the fallback default** when the linter sees an unannotated FK to a soft‑deletable parent? Currently v0.4 says "reject the migration." Alternative: default to `block` with a warning. I lean "reject" — force the thought.

_End of ADR‑001._
