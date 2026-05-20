# Test Framework Lift-Up Diagnostics

**Captured:** 2026-05-19
**Author role:** Auditor
**Depends on:** `docs/work/inv/TEST-LIFT-current-inventory.md`

## Summary

The interrupted session should not resume from the old W0/W1/W2 waiver state. The current repo has moved into a FE-completeness checkpoint, has no canonical `coverage/test-evidence.json`, and still contains generated evidence plus dirty package state. The correct next step is to re-bootstrap evidence from a calm worktree, then close the remaining FE test/framework gaps before attempting full W0-W7-style gate closure.

## Findings

### D1. Canonical Evidence Is Missing

`coverage/test-evidence.json` is absent. The matrix coverage view falls back to `coverage/coverage-final.json`, which is insufficient for closure because it does not carry the full level/package evidence used by the compact matrix, mutation aggregation, and closure registry.

Impact:

- Coverage rows can appear green while package evidence is stale or missing.
- `@stynx-web/angular-iam` shows `0` coverage despite FE-B being documented as closed.
- W0/W1/W2 closure cannot be revalidated until `pnpm test:evidence` is rerun intentionally.

### D2. Worktree Is Calm But Not Pristine

The process table is calm, but the checkout has dirty generated evidence, a dirty lockfile, and one dirty source fix in `packages-web/angular-profile/src/routes.ts`.

Impact:

- Closure evidence must distinguish committed baseline, generated artifacts, and local fixes.
- The `routes.ts` fix appears correct and makes `@stynx-web/angular-profile` typecheck pass, but it still needs normal owner/commit handling.
- The `pnpm-lock.yaml` diff is broad and should be reviewed before any gate claims.

### D3. FE Registry And Reports Are Out Of Sync With Current Work

The FE closure registry still lists FE-C, FE-D, FE-E, and FE-F as `IN_PROGRESS`, while their reports contain more rows than the registry notes.

Impact:

- The registry is currently a stale control surface.
- Promotion decisions must be re-audited wave by wave, not inferred from report rows.

### D4. `pnpm i18n:check` Fails

The current failure is isolated to `@stynx-web/angular-audit` catalogs:

- `packages-web/angular-audit/src/i18n/keys.json` missing or out of date.
- `packages-web/angular-audit/src/i18n/en.json` missing 39 keys.
- `packages-web/angular-audit/src/i18n/pt-BR.json` missing 39 keys.

Impact:

- FE-E cannot close.
- FE-G/FE-H should not promote while the i18n catalog gate is red.

### D5. Mutation Remains The Main Compact-Matrix Gap

The compact matrix still has mutation `!` rows for web and backend packages:

- `@stynx-web/angular-iam`
- `@stynx-web/angular-profile`
- `@stynx/audit`
- `@stynx/cli`
- `@stynx/data`
- `@stynx/flow`
- `@stynx/i18n`
- `@stynx/privacy`
- `@stynx/tenancy`
- `@stynx/testing`

Impact:

- W1 cannot close if "no mutation regression" remains part of acceptance.
- FE-G cannot close without IAM/profile mutation treatment.
- Full `ci:stynx:full` remains risky until package-level mutation gaps are routed.

### D6. Demo Bookmark API Matrix Is Still Non-Green

`@stynx-domain/demo-bookmark-api` has API `!` in the compact matrix.

Impact:

- W2/API-matrix closure remains open.
- If this API is not meant to be applicable, an Architect policy decision is required before marking it not applicable.

### D7. Original W0-W7 Plan Docs Are Absent

The W0-W7 worker prompts remain under `docs/work/prompts`, but the matching plan/report files are absent under `docs/work/plan`.

Impact:

- A future orchestrator cannot follow the original bootstrap literally.
- Either restore/recreate W0-W7 plan/report docs, or explicitly supersede them with the FE/test-lift plan in this pack.

### D8. Full-Gate Closure Is Still Unproven

The interrupted session attempted `pnpm ci:stynx` twice and failed in different places while concurrent workers were active. Those results are no longer sufficient evidence either way.

Impact:

- `ci:stynx` and `ci:stynx:full` must be rerun from the calm state after evidence bootstrap and obvious red gates are addressed.
- Prior waivers for W0/W1/W2 remain historical, not closure proof.

## Risk Register

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Generated artifacts contaminate closure evidence | High | Decide whether to delete/regenerate or commit them intentionally; do not mix old and new evidence. |
| Broad lockfile drift hides dependency changes | High | Review and classify `pnpm-lock.yaml` before running final gates. |
| Matrix fallback gives false confidence | High | Recreate `coverage/test-evidence.json`; do not close on fallback coverage alone. |
| FE registry stale relative to reports | Medium | Re-audit report rows and update registry only after live validation. |
| Mutation closure explodes in scope | Medium | Route one package per worker and keep package thresholds explicit. |
