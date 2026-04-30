# 00 — Executive Summary

## Overall assessment

**STYNX is in better shape than the prompt assumes.** Despite the
"extended agentic development" backstory, the working tree is unusually
clean: knip reports zero unused exports, depcheck reports zero unused
dependencies, every tracked test file is real (no `it.only`/`it.skip`
sprawl), every workspace tsconfig (44 of 45) extends a shared preset,
ESLint and Prettier both run from a single root config, and the only
real `TODO`/`FIXME` markers in tracked source are four intentional
sentinels. The workspaces themselves have a consistent
build/lint/test contract; the variations match each workspace's role
(`tools/tsconfig` and `tools/eslint-config` are config-only, `test/*`
tiers don't build, `docs` doesn't lint). The repo's curated
`knip.config.ts` ignore list and the dedicated `test/*` workspace tier
together explain why so much would-be entropy never accumulated.

The actionable findings concentrate at the **repository root** and in
**release/changeset metadata** — namely, agent-prompt artifacts
(`PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES.md`, `SUMMARY.md`,
`patches/0000…0014.patch`) left behind from a one-shot patch series, a
generated `.changeset/status.json` that should be gitignored, a
duplicated pair of root tsconfigs, and one undocumented set of
`pnpm.overrides` pins. None of these touch a published package
surface; none affect builds or tests. The two genuine _structural_
observations — the `@stynx/*` vs `@stech/*` namespace split and the
fragmentation of the `packages-web/angular-*` family — are real but
out-of-scope for line-level cleanup; both belong to an RFC track.

## Top 5 highest-impact cleanups

1. **CLEAN-001 + CLEAN-002 + CLEAN-003**: Delete the agent-prompt
   residue at the repo root (`PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES.md`,
   `SUMMARY.md`, `src/.gitkeep`) and the corresponding `patches/`
   mailbox (15 `.patch` files). Together this removes ~16 files and
   ~1300 lines of pure noise that contradict the repo's current state.
2. **CLEAN-010**: Stop tracking `.changeset/status.json` (a generated
   file) by gitignoring it. Eliminates ongoing merge-conflict churn on
   the release-status surface.
3. **CLEAN-007**: Document the five undocumented `pnpm.overrides`
   pins (`@types/node`, `handlebars`, `postcss`, `serialize-javascript`,
   `webpackbar`). Each is opaque maintenance debt; an `OVERRIDES.md`
   file recording reason + removal-condition turns each into a
   tractable future task.
4. **CLEAN-006 + CLEAN-008**: Consolidate the duplicated root
   `tsconfig.json` / `tsconfig.base.json` pair, and bring
   `infra/cdk/tsconfig.json` (the lone hold-out) under the shared
   `tools/tsconfig/*` preset family.
5. **CLEAN-013**: Re-validate the 18-entry knip `ignoreFiles` list —
   for the six entries under `packages/stynx-backend/src/{idempotency,
rate-limit}/`, attempt to re-export through the package barrel so
   knip sees them naturally and the curated suppression can shrink.

## Top 5 areas the inspection found surprisingly clean

1. **No dead exports.** `pnpm lint:deadcode` returns `{"issues":[]}`.
2. **No unused dependencies.** `pnpm lint:deps` returns "No depcheck
   issue".
3. **No test sprawl.** Zero `it.only` / `fit` / `describe.only` /
   `it.skip` / `xit` in tracked test files.
4. **No real TODO debt.** Four matches in tracked source — all
   intentional sentinels (`'TODO' + '_PERMISSION'`).
5. **Config drift is single-digit.** Exactly one workspace tsconfig
   (`infra/cdk/tsconfig.json`) doesn't extend a shared preset; ESLint
   and Prettier carry zero per-workspace overrides; per-package script
   contract is uniform with role-appropriate exceptions.

## Effort aggregate

From the catalog (19 items total):

| Effort tier | Count | Notes                                                                                                       |
| ----------- | ----: | ----------------------------------------------------------------------------------------------------------- |
| S (<2h)     |    12 | Pure deletions, gitignore tweaks, single-file config edits                                                  |
| M (2–8h)    |     5 | Knip re-validation, overrides documentation, README pass, logging-callsite scan, release-drafts disposition |
| L (1–3d)    |     0 | —                                                                                                           |
| XL (>3d)    |     2 | STRUCT-001/002 — both RFC scope, not execution-plan work                                                    |

**Approximate person-week total for Waves 1–4 (the actionable
catalog): 0.4–0.5 person-weeks (~13–18 hours)**, assuming a single
focused contributor. The XL structural items are excluded from this
total because they require RFC and consumer-coordination work that
isn't unit-of-execution.

## Recommended posture: **QUICK PASS** (with optional follow-on)

Two of the catalog's "DO NOW" items (STEP-W1-A, STEP-W1-B in the
execution plan) can land in a **single afternoon's work** as one
pure-deletion PR plus one gitignore PR — capturing 4 of the 19 catalog
items and eliminating the most visible noise (~1300 LOC of agent
residue at the root). That alone justifies the rationalization pass.

The remaining Wave 2 (config consolidations) and Wave 4 (doc disposition)
items are worth **a follow-on phased pass over the subsequent week**, but
they're polish — not load-bearing. They can be done piecemeal as
contributors find time, in any order, with no cross-PR coupling.

The two STRUCT-\* items are deliberately separated from the cleanup track
and routed to RFC discussion. Treating them as part of "rationalization"
would invert their actual scope: they are architectural decisions that
happen to surface during inspection, not janitorial work.

### What would change the recommendation

- If `audit/REPO-GAP-ANALYSIS.md` (out of scope per R4) surfaces
  spec-adherence issues that touch the same files as cleanup items, the
  audit work takes precedence; cleanup items affecting those files
  should be deferred until audit-driven changes have landed.
- If the team confirms that the prompt-numbered workflow tracked in
  `TODO.md` has been retired, CLEAN-005 upgrades from DEFER to DO NOW
  and the file gets deleted (cheap win).
- If the maintainer confirms the `@stech/*` namespace is intentional
  branding (e.g., "stech is the corporate publisher"), STRUCT-001
  downgrades from "RFC required" to "documented exception" and a
  one-paragraph note in `packages/README.md` resolves it.

## Net read

The repository carries **noticeable but localized** entropy at the
root level and a small amount of release/changeset metadata sprawl,
on a foundation that is otherwise unusually well-curated. A
short-day cleanup PR captures 4 of the 5 highest-impact items; a
follow-on week of polish closes the remaining actionable catalog. No
significant refactors, no breaking changes, no audit overlap. The
two structural questions worth asking are namespace consolidation and
web-package fragmentation — both belong in RFC discussion, not in this
cleanup wave.

## Single most valuable cleanup

If only one PR ships from this entire pass, ship **STEP-W1-A**
(catalog items CLEAN-001, CLEAN-002, CLEAN-003): delete
`PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES.md`, `SUMMARY.md`,
`src/.gitkeep`, and `patches/*.patch`. ~30 minutes of work, ~1300
lines removed, zero risk, immediate signal-to-noise improvement at the
first place every contributor looks.
