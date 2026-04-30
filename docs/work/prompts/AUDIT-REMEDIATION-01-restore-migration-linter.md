# 01 — Restore migration linter green

**Closes:** FIND-004 (BLOCKER).
**Branch:** `audit-remediation/01-migration-linter`.
**Spec:** §17 (CI gates), I5/I6/I8 (§1.3).

## Why

`tools/migration-linter`'s self-test "repo migrations lint without parser
errors" expects 0 parser errors and observes 4 against the repo's own
migrations. Until this is green, **I5/I6/I8 are claim-only** and every
downstream remediation involving migrations cannot be independently
verified.

## What to do

1. Run `pnpm --filter migration-linter test` and capture the 4 parser
   errors with file paths.
2. For each parser error:
   - If the migration SQL is invalid, fix the SQL while preserving
     intent (RLS policy, archive mirror, audit trigger). Cross-check
     against `specs/STYNX-REFERENCE-MIGRATION.sql`.
   - If the linter's parser is too strict (false positive on valid
     SQL), patch the linter — but only after confirming the spec
     allows the construct.
3. Confirm `tools/migration-linter` covers the I5/I6/I8 rules end-to-end
   (tenant_id NOT NULL, RLS policy declared, archive mirror present for
   soft-deletable, no `deleted_at` on live, `@Audit` or `@NoAudit` on
   mutations). Add missing rules.
4. Wire the linter into `.github/workflows/ci.yml` as a required
   status check.

## Acceptance

- `pnpm --filter migration-linter test` exits 0.
- CI gate "migration-lint" is required in branch protection (depends on
  prompt 08 for declarative config; for now, document in PR body).
- Adding a deliberately-broken migration to a throwaway test fixture
  causes the lint job to fail.

## Verify

```
pnpm --filter migration-linter test
pnpm --filter migration-linter run lint:repo
```
