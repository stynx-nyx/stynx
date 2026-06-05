# Session S8 — threshold tuning + adherence-reverse audit

**Session:** C-4 post-pilot S8.
**Date:** 2026-05-16.
**Author role:** Auditor + Architect (trace.json).
**DEVAI HEAD:** `583ce02` (Phase 21.F).

## What ran

### Threshold tuning (`.devai/config/thresholds.json`)

Current thresholds:

```
coverage: { statements: 0.7, branches: 0.6, functions: 0.7, lines: 0.7 }
```

No tuning landed in S8. Rationale: the scorecard cells are all UNKNOWN (per S7 / D-A-14 / D-A-16), so there's no live coverage signal against which to tune. Re-running threshold tuning post-D-A-14-closure + post-real-coverage-data is the right time.

### Adherence-reverse audit

Authored `docs/framework/arch/trace.json` (required input — was missing). Schema-valid; maps `INV-RBAC-001` + `INV-PRIVACY-001` to their `docs/framework/arch/invariants/*.json` files. Both invariants have empty `tests` arrays — they're declared but not yet verified by tests (Inspector follow-up).

Ran `devai inv-adherence-reverse --repo-root . --inventory .devai/state/inventory/inventory.json --human`. Result: **0 surfaces; 0 claimed, 0 orphan**.

### New gap D-A-17

`inv-regen` aggregates the per-slice inventories (modules, routes, components, dep-graph) but produces `modules: [<id-string>, ...]` and `routes: [{method, path, module}, ...]` — neither has the `{id, file}` shape that `computeReverseAdherence()` (in `packages/core/src/inventory/adherence-reverse.ts:60-89`) reads. As a result, adherence-reverse correctly walks all 4 surface kinds and finds 0 surfaces with the expected shape.

Either:

- (a) `inv-regen` should preserve per-surface `{id, file}` (and possibly more metadata) for each surface kind, OR
- (b) `inv-adherence-reverse` should consume the per-slice sensor body files directly (e.g., `.devai/state/sensors/inventory_api/api-map.json`) rather than the aggregate.

Suggested resolution: (a) — the aggregate is the right consumer surface; teaching `inv-regen` to retain per-surface details is the cleaner fix. Filed for the next devai alignment session.

## What landed in stynx (S8 commit)

- `docs/framework/arch/trace.json` — minimal but schema-valid; maps the 2 promoted invariants to their authoring docs. Empty `tests` arrays signal the verification work still pending.
- `.devai/state/inventory/inventory.json` — first aggregate inventory.json commit (was missing). Generated via `devai inv-regen --no-git`.

## D-A register update

Open after this session:

- **D-A-12** — sense-api recognize `@Public()` (S1)
- **D-A-13** — sense-data-model extract legal_basis/retention (S1)
- **D-A-14** — scorecard cell-classifier learns L0 inventory SRs (R1)
- **D-A-15** — scaffolder API templates are TypeORM-shaped, not stynx-aware (S3-2)
- **D-A-16** — assess-state narrative actionable advice (S7)
- **D-A-17** — inv-regen preserves per-surface {id, file} for adherence-reverse (this session)

Six open DEVAI gaps total carried forward from stynx-side work. Each is small-to-medium and well-scoped; together they'd close in a focused 1-day devai session ("Phase 22").
