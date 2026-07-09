# PORT-14 — Verification Checklist

**Produces:** `docs/stynx/porting-pack/14-VERIFICATION-CHECKLIST.md`.
**Depends on:** `04`, `11`.
**Branch:** `docs/stynx/porting-pack/14-checklist`.

## Mission

Checkboxes the consuming agent marks off to declare the port done.

## Structure

```
# 14 — Verification Checklist

## Per-invariant checks

For each invariant from `04-INVARIANTS-AND-CONTRACTS.md`:

- [ ] **I1 — No raw DB connection outside @stynx-nyx/data**
  - Command: `rg "from ['\"]pg['\"]|new Pool\(" --type ts | grep -v packages/data | grep -v test`
  - Expected: empty output (modulo documented exceptions).

- [ ] **I2 — …**
- ...

## Mandatory test families (per spec testing section)

- [ ] RLS leak test using `@stynx-nyx/testing` matcher.
- [ ] Soft-delete + restore roundtrip.
- [ ] Cascade limit (depth + rows).
- [ ] Permission deny path returns 403 with the documented error shape.
- [ ] Idempotency replay returns the original response.
- [ ] LGPD erasure dry-run.
- [ ] Audit row written for every mutation in a sampled controller.

## Doctor

- [ ] `pnpm doctor` exits 0.
- [ ] Doctor output mentions every spec'd check (route coverage,
      audit coverage, soft-delete coverage, ReadOnly enforcement).
- [ ] Note: at audit baseline, `pnpm doctor` produced empty output
      (FIND-011). Consuming agents on the foreign repo run their own
      `stynx doctor` from `@stynx-nyx/cli` — verify it actually emits.

## Smoke tests

- [ ] **Tenant lifecycle:** provision tenant → create user → log in
      → create resource → soft-delete → restore → hard-delete →
      confirm absent.
- [ ] **LGPD pipeline:** export request returns the user's data;
      erasure request lands the appropriate strategies on each PII
      column; archive row updated; audit row written with LGPD tag.

## Sentinel cleanup

- [ ] No `TODO_PERMISSION` strings remain.
- [ ] No `TODO_AUDIT` strings remain.
- [ ] No `TODO_TENANCY` strings remain.

## Done criteria

The port is complete when:
- All boxes above are checked.
- Doctor exits 0.
- E2E smoke green.
- No sentinels remain.
- Branch protection rejects PRs without changesets (if the
  consuming repo adopted that gate).
```

## Rules

- Every checkbox has a runnable verification command or a clear
  inspection step.
- Per-invariant checks come from `04` — do not invent.

## Acceptance

- All four sections present.
- Each item runnable.
