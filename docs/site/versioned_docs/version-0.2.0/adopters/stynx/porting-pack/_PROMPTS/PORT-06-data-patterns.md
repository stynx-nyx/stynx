# PORT-06 — Data Layer Patterns

**Produces:** `docs/stynx/porting-pack/06-DATA-LAYER-PATTERNS.md`.
**Depends on:** `04-INVARIANTS-AND-CONTRACTS.md`, `05-PACKAGE-CATALOG.md`,
`16-SPEC-EXCERPTS/data-api-contract.md`,
`16-SPEC-EXCERPTS/soft-delete-model.md`.
**Branch:** `docs/stynx/porting-pack/06-data-patterns`.

## Mission

The heaviest part of the port. This document gives the consuming
agent ready-to-apply patterns for replacing raw `pg.Pool` and
existing ORM call sites with `@stynx/data`.

## Read

- `packages/data/src/database.ts`, `transaction.ts`, `query-helpers.ts`.
- `packages/data/src/internal/archive-schema.ts` (note: internal —
  do not let consumers import directly).
- `reference/api/src/records.service.ts` (or whichever the
  reference service is) — canonical service shape.
- `reference/api/migrations/0001_*.sql` for the helper-driven
  table creation pattern.

## Sections to write

```
# 06 — Data Layer Patterns

## The Database / Transaction surface (current code)

[Table of every Database method and every Transaction method, with
signatures pulled from the actual code, not the spec. Mark drift
from STYNX-API-DATA.md inline.]

## Pattern 1 — Replacing pg.Pool

[Before: `const result = await pool.query(...)`. After: inside `db.tx(async tx => { ... })`. Cite database.ts.]

## Pattern 2 — Replacing an existing ORM (TypeORM / Prisma / Knex / Sequelize)

[Per ORM, a side-by-side rewrite. Note: Drizzle is the only ORM in STYNX (§13.3).]

## Pattern 3 — A canonical CRUD service

[Full code listing of a typical service that exposes
list/get/create/update/softDelete/restore/hardDelete methods.
Use the reference-api's records.service.ts as the model.]

## Pattern 4 — A soft-deletable resource with mixed FK annotations

[A resource with one `cascade` child, one `block` child, and one
`hide` parent. Migration excerpt + service excerpt.]

## Pattern 5 — A read-only reporting endpoint

[`@ReadOnly()` on the controller, `tx({ role: 'reader', readonly: true })` in service. Cite database.ts:65.]

## Pattern 6 — Background work outside a request

[`withSystemContext('reason', async () => { ... })`. Cite the export in packages/data/src/index.ts.]

## Pattern 7 — Querying with .withDeleted() and .onlyDeleted()

[Snippets showing the helpers; note the consumer never sees archive Drizzle types — only the helpers.]

## Pattern 8 — When to use softDelete vs hardDelete vs restoreFromArchive

[Decision-table form: user wants this → call this method.]

## Anti-patterns

For each, show the wrong code first, then the correction:

1. Filtering by `tenant_id` manually in queries (RLS does this).
2. Adding a `deleted_at` column to a live table (I8 violation).
3. Using `ON DELETE CASCADE` at the DB level (cascade is application-layer).
4. Running queries outside `tx()` (I2 violation).
5. Importing `archive.*` Drizzle types into application code (use `withDeleted()` / `onlyDeleted()` instead).
```

## Rules

- Every pattern includes a runnable code example (TypeScript, ≤30
  lines).
- Every example is grounded in a real reference-app file. If the
  reference app does not demonstrate a pattern, mark it `[GAP —
reference app does not exercise this; verify against the spec
before applying]`.
- For "Replacing existing ORM": cover at least TypeORM and Prisma
  by name. Knex/Sequelize can share a section.

## Acceptance

- All eight patterns + anti-patterns present.
- Every pattern's "After" code references real `@stynx/data` exports
  (verify against the catalog).
- No anti-pattern silently corresponds to a real pattern by mistake
  (e.g., pattern 5 must not be silently illustrating an I2 violation).
