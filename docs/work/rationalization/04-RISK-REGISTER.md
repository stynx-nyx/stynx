# 04 — Risk Register

Per-finding risk where risk > LOW; per-execution-step risk where risk >
LOW; cross-cutting risks at the bottom.

The catalog is unusually low-risk: 17 of 19 items are LOW risk, and the
two VERY HIGH items (STRUCT-001, STRUCT-002) are deliberately out-of-band
(RFC track, not execution plan). This register therefore concentrates on
the cross-cutting risks of the cleanup _itself_, not per-finding hazards.

---

## Per-finding risks > LOW

### STRUCT-001 — `@stynx/*` vs `@stech/*` namespace consolidation

- **Risk level:** VERY HIGH
- **Likelihood:** Medium (the inconsistency is real and visible to
  anyone reading `packages/`).
- **Impact:** Renaming any of the five `@stech/*` packages is a semver
  major. Every external consumer must update imports. Internal
  consumers within the monorepo would update transparently.
- **Mitigation:**
  - Publish an RFC describing the chosen target namespace and the
    deprecation timeline (e.g., publish under both names for one minor
    cycle, then remove `@stech/*`).
  - Coordinate with the `release.yml` workflow and `changesets` to
    bundle the rename into a single major-version bump.
  - Provide a codemod (`jscodeshift` or `ts-morph`) that consumers can
    run to update their imports.
- **Owner:** Repo maintainer; do not delegate to an automated cleanup
  agent.

### STRUCT-002 — `packages-web/angular-*` consolidation

- **Risk level:** VERY HIGH (if pursued)
- **Likelihood:** Low — consolidation may not be the right answer; the
  fragmented layout could be deliberate.
- **Impact:** Same as STRUCT-001 if any rename happens. Additionally,
  consumers cherry-picking individual angular libs would have to take a
  larger dependency.
- **Mitigation:**
  - Before any RFC, run a consumer-import analysis: for each
    `packages-web/angular-*`, list every workspace and external app
    that imports it. If most consumers import N>2 of them, consolidation
    is plausible; if most import exactly one, leave alone.
  - If consolidating, prefer a **virtual barrel** strategy (a single
    `@stynx-web/angular` aggregator that re-exports the others) over a
    physical merge — preserves cherry-picking while cleaning up the
    public-surface story.
- **Owner:** Repo maintainer.

---

## Per-execution-step risks > LOW

None of the Wave 1–4 steps carry per-step risk above LOW. The most
sensitive step is **STEP-W2-A (consolidate root tsconfigs)** because it
shifts compiler options into a shared preset that every workspace
inherits. If `experimentalDecorators` or `emitDecoratorMetadata` were
previously suppressed in some lib (unlikely given Angular + Nest both
need them), unifying them via the preset could change emitted output.
The verification gate (`pnpm -r build && pnpm -r typecheck`) catches this.

---

## Cross-cutting risks

### CC-1: Merge conflicts with in-flight feature work

- **Likelihood:** Medium. The repo has 27 open dependabot branches plus
  an active branch (`fix/ci-pnpm-workflow-setup`). The cleanup wave touches
  root `package.json`, `.gitignore`, root tsconfigs, and `knip.config.ts`
  — high-traffic surfaces.
- **Impact:** Stalled cleanup PRs; rebase tax.
- **Mitigation:**
  - Land cleanup PRs in tight succession (one wave at a time, all PRs
    merged before opening the next wave).
  - Pause dependabot during the cleanup window or batch-merge dependabot
    PRs first.
  - Keep each cleanup PR small (the catalog already enforces this).

### CC-2: Behavioral regression on undocumented behavior

- **Likelihood:** Low. The catalog avoids any change to source code
  (only doc, config, and metadata edits).
- **Impact:** Would be caught by `pnpm -r build && pnpm -r test` locally
  and CI's hardening workflow.
- **Mitigation:** Verification gate is mandatory per execution-plan
  cross-cutting rules. Any PR that fails CI rolls back.

### CC-3: Coverage / test-suite loss when consolidating

- **Likelihood:** N/A — no catalog item consolidates tests.
- **Impact:** N/A.
- **Mitigation:** N/A.

### CC-4: Build performance regression

- **Likelihood:** Low. None of the cleanups change Turborepo's
  dependency graph or pipeline structure. STEP-W2-C (knip ignores) might
  expose a few new files to knip's analysis but that's a lint-time, not
  build-time, effect.
- **Impact:** Marginal at most.
- **Mitigation:** None needed unless a PR explicitly modifies
  `turbo.json`.

### CC-5: Mis-classifying spec'd-but-unused features as dead code (R4)

- **Likelihood:** Very low for this catalog — knip already reports 0
  issues, so there are no dead-code removal PRs proposed in Wave 1.
  CLEAN-013 only re-validates existing ignores; it does not delete code.
- **Impact:** If a spec'd feature were misclassified and removed, the
  audit prompt would surface the gap.
- **Mitigation:** Cross-reference `specs/` before any code-deletion PR.
  None proposed in this catalog, so the mitigation is theoretical.

### CC-6: Doc churn during a release window

- **Likelihood:** Medium. CLEAN-009 (`.release/drafts/`) and CLEAN-010
  (`.changeset/status.json`) touch the release machinery. If executed
  during a release cycle, they could conflict with `pnpm changeset
version` or `pnpm release:status` runs.
- **Impact:** A failed release-prep workflow.
- **Mitigation:** Schedule W1-B and W4-A between releases, not during.

### CC-7: Context loss between cleanup PRs

- **Likelihood:** Medium. If different agents/humans pick up different
  steps, the rationale across the wave can drift.
- **Impact:** Inconsistent execution; `OVERRIDES.md` written one way in
  one PR, another way in the next.
- **Mitigation:** Each PR's body must reference this catalog and the
  execution-plan step ID. The first PR per wave should set conventions
  the later PRs follow.

---

## Risk summary

| Risk class                     |                                             Count |
| ------------------------------ | ------------------------------------------------: |
| Per-finding risks > LOW        | 2 (both STRUCT, both VERY HIGH, both out-of-band) |
| Per-execution-step risks > LOW |                                                 0 |
| Cross-cutting risks            |    7 (5 active mitigations, 1 N/A, 1 theoretical) |

**Net risk profile:** The execution plan is unusually safe. The two
real risks live entirely in the optional STRUCT track; ignoring those
and executing Waves 1–4 carries no per-step risk above LOW and only
process-coordination cross-cutting risks (CC-1, CC-6, CC-7) that
sequencing-and-comms address.
