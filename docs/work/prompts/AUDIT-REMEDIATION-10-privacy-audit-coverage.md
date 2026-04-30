# 10 — LGPD and audit hash-chain coverage

**Closes:** FIND-015, FIND-016 (MAJOR).
**Branch:** `audit-remediation/10-privacy-audit-coverage`.
**Spec:** §9 (audit + LGPD), §1.1 G9, `specs/GAP-001-audit-hash-chain.md`.

## Why

- `@stynx/privacy` carries one test for an entire LGPD live + archive
  erasure surface — under-evidenced for a goal-G9 invariant.
- `specs/GAP-001-audit-hash-chain.md` documents an open gap; only
  two tests in `@stynx/audit`.

## What to do

### LGPD coverage

1. Build a reusable LGPD fixture in `@stynx/testing`:
   - Tenant + actor + a row in a soft-deletable table with PII columns
     across multiple types (string, jsonb, blob ref).
   - Soft-delete that row → archive mirror created.
   - Audit trail row recorded with LGPD tag + 5-year retention partition.
2. Write integration tests in `@stynx/privacy` that, for each erasure
   strategy from the PII map (overwrite, null, hash, drop):
   - Exercise live erasure.
   - Exercise archive erasure.
   - Assert PII columns are processed correctly.
   - Assert the audit trail records the erasure and lands in the
     5-year retention partition (per SPEC §9.2).
   - Assert object-store erasure (if path A from prompt 05).
3. Raise `@stynx/privacy` coverage threshold to 85 % (or 95 % to
   match `@stynx/auth`/`data`).

### Audit hash-chain

1. Read `specs/GAP-001-audit-hash-chain.md`. Implement what's
   outstanding.
2. Add a hash-chain integrity test in `@stynx/audit`:
   - Produce N audit events sequentially.
   - Verify each event's `prev_hash` matches the previous event's
     `hash`.
   - Tamper with one row's payload; verify integrity check detects it.
3. Add a CLI verification command (`stynx audit verify`).
4. Move/close `specs/GAP-001` per the new RFC layout from prompt 09.

## Acceptance

- `pnpm --filter @stynx/privacy test --coverage` shows ≥ 85 % across
  all four metrics.
- `pnpm --filter @stynx/audit test` includes a hash-chain integrity
  test that fails on tamper.
- `stynx audit verify` runs against a populated DB and reports OK.
- `specs/GAP-001-audit-hash-chain.md` is either moved to
  `docs/rfcs/` with status "Implemented" or deleted with the RFC
  cross-referenced.

## Verify

```
pnpm --filter @stynx/privacy test --coverage
pnpm --filter @stynx/audit test
stynx audit verify
```
