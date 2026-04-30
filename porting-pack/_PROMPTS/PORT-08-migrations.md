# PORT-08 — Migration Patterns

**Produces:** `porting-pack/08-MIGRATION-PATTERNS.md`.
**Depends on:** `04`, `06`.
**Branch:** `porting-pack/08-migrations`.

## Mission

How to write STYNX-compliant migrations. The consuming agent will
generate dozens of these against a foreign schema.

## Read

- `specs/STYNX-REFERENCE-MIGRATION.sql` — canonical example.
- `packages/data/migrations/` — platform migrations (the consumer's
  migrations layer on top of these; document the order).
- `apps/reference-api/migrations/0001_*.sql` — consumer-style example.
- `tools/migration-linter/src/` — enumerate every lint rule.

## Sections

```
# 08 — Migration Patterns

## Migration order

1. Platform migrations from `@stynx/data` run first
   (cite packages/data/migrations/).
2. Consumer migrations layer on top.
3. Run order is enforced by the migration runner in @stynx/cli.

## Pattern: tenant-scoped table the right way

[Use `data.create_soft_deletable_table(...)` (or the actual helper
name found in code). NOT raw CREATE TABLE.]

## Pattern: adding a column to a soft-deletable table

[Paired add: live table + archive mirror. Cite the helper.]

## Pattern: declaring an FK to a soft-deletable parent

[The annotation comment is mandatory. Show the migration-linter
rule that enforces it.]

## Pattern: opting out of soft delete

[`@NoSoftDelete('reason')` on the entity + matching migration
comment. Cite tools/migration-linter rule.]

## Pattern: opting out of audit

[`@NoAudit('reason')` + matching migration comment.]

## Pattern: adopting an existing table with ad-hoc soft-delete

[VERIFY: does `data.adopt_soft_deletable_table` exist in the repo?
If yes, document. If no, mark `[GAP — adoption helper not present;
manual migration required]`.]

## Pattern: PII map entries

[Where the PII map lives (privacy package), the entry shape, the
strategy enum.]

## Pattern: permission seed inserts

[The seed migration shape used by reference-api.]

## Pattern: dev-only fixture seeds

[Gated by GUC (`app.environment` or similar) so prod migrations
don't insert fixtures. Verify the GUC name.]

## Migration linter rules

| Code | Description | Source |
|---|---|---|
| LINT001 | … | tools/migration-linter/src/rules/... |
| LINT002 | … | … |

[Enumerate every rule found in tools/migration-linter/src/.]

## Caveat — linter regression at audit time

The audit found the migration-linter test failing on the repo's
own migrations (FIND-004). Until that's resolved, the linter is
not gating CI. Consuming agents should still author migrations to
the linter's rules, but should verify the linter is green before
relying on it as a CI gate.
```

## Rules

- Helper names must match what's actually exposed by the platform
  migrations. Verify with `psql \df data.*` if possible, or by
  reading the SQL helper definitions.
- The linter rules table must enumerate the actual rule files; do
  not invent rule codes.

## Acceptance

- All patterns present, each with a SQL example.
- Linter rule table populated from actual source.
- The FIND-004 caveat is included.
