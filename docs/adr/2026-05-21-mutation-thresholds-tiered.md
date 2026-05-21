# ADR — Tiered mutation thresholds, controller exclusion, CI/PR split mode

- **Status:** accepted
- **Date:** 2026-05-21
- **Authors:** Inspector (audit) + operator (decision)
- **Supersedes:** the ad-hoc `default / strict / strictest` mutation policy carried over from the initial AI-authored configs.
- **Reads:** `MUTATION_AUDIT_2026-05-19.md` (the audit that motivates this ADR).

## Context

The Stryker configuration across the workspace was originally authored by AI agents from specs. The 2026-05-19 mutation audit (`MUTATION_AUDIT_2026-05-19.md`) found four design choices worth revisiting:

1. Whether `*.controller.ts` files should be on per-package `mutate:` lists.
2. How `STRYKER_INCREMENTAL` should behave across CI loops.
3. Where the mutation-score floor should sit per package class.
4. Whether to gate PRs on mutation testing today.

This ADR records the decisions taken on each.

## Decisions

### D1. Exclude controllers from `mutate:` workspace-wide

The factory default in `tools/stryker/base.mjs` now excludes `src/**/*.controller.ts`:

```js
mutate = ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.controller.ts'];
```

The three packages that explicitly listed a controller (`@stynx/auth`, `@stynx/health`, `@stynx/i18n`) have been edited to drop the controller line. The other 27 packages already either did not list controllers or did not have controllers under the mutated path.

**Rationale.** Nest controllers in stynx are thin HTTP → service forwarders. The semantically interesting strings (route paths, `@Permission(...)` literals) live in decorators and are exercised by integration tests through supertest (the `reference/api/test/integration/reference-api.runtime.spec.ts` family and Wave 2 of `docs/work/plan/`). Mutating them under unit mocks produces low-signal survivors and dilutes the report. Packages with genuine branching logic inside a controller may opt back in by overriding `mutate`.

### D2. Adopt the CI / PR split mode for `STRYKER_INCREMENTAL`

The factory honours `STRYKER_INCREMENTAL` as the split-mode knob:

| Loop                                 | `STRYKER_INCREMENTAL` | Cache step                               | Rationale                                                                           |
| ------------------------------------ | --------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Weekly Monday cron (`hardening.yml`) | `false`               | n/a                                      | Authoritative score; only full runs catch cross-file drift in a monorepo.           |
| Local dev iteration                  | unset → `true`        | local `reports/stryker-incremental.json` | 10–50× faster iteration; risk of drift is acceptable on a developer machine.        |
| Per-PR scoped gate (deferred per D4) | `true`                | `actions/cache` keyed on src+test hashes | When adopted, must persist the cache or incremental does nothing on a fresh runner. |

The current `STRYKER_INCREMENTAL: 'false'` in `.github/workflows/hardening.yml` is kept as-is. No new workflow is added today; the contract is documented so the future PR-gate workflow has the contract to plug into.

### D3. Adopt tiered mutation floors

`scripts/test-matrix.config.json#policies.mutation` now defines three named tiers in addition to the legacy `default / strict / strictest`:

```json
"tier1": { "break": 80, "high": 90, "low": 70 },
"tier2": { "break": 70, "high": 80, "low": 60 },
"tier3": { "break": 60, "high": 70, "low": 50 }
```

`defaults.mutation` is now `"tier3"`. The per-package map assigns packages by risk class:

| Tier                | Packages                                                                                                                                                                            | Rationale                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| tier1 (`break: 80`) | `@stynx/auth`, `@stynx/data`, `@stynx/audit`, `@stynx/privacy`, `@stynx/tenancy`, `@stynx-web/sdk`, `@stynx-web/angular-auth`, `@stynx-web/angular-iam`, `@stynx-web/angular-audit` | Security / data / identity / shipped SDK; cross-package blast radius for surviving mutants. |
| tier2 (`break: 70`) | `@stynx/sessions`, `@stynx/idempotency`, `@stynx/flow`, `@stynx/core`, `@stynx/storage`, `@stynx/ratelimit`                                                                         | State engines and runtime services; logic-heavy but not on the security perimeter.          |
| tier3 (`break: 60`) | All others (workspace default)                                                                                                                                                      | Generic / UI / wiring; mutation testing has lower marginal value here.                      |

The legacy `default / strict / strictest` numeric policies are retained for backward compatibility with any external consumer; they are not used by per-package overrides any more.

**Expected adoption impact on the next Monday cron.** Eight packages currently sit below their new tier's `break` threshold and will fail the gate until remediated. The audit's earlier 4-package forecast missed four additional packages that the matrix renderer now flags `!`:

| Package                   | Tier  | Current score | New floor |    Gap |
| ------------------------- | ----- | ------------: | --------: | -----: |
| `@stynx-web/sdk`          | tier1 |         68.32 |        80 | -11.68 |
| `@stynx/sessions`         | tier2 |         60.13 |        70 |  -9.87 |
| `@stynx/flow`             | tier2 |         60.55 |        70 |  -9.45 |
| `@stynx-web/angular-auth` | tier1 |         73.04 |        80 |  -6.96 |
| `@stynx/idempotency`      | tier2 |         63.82 |        70 |  -6.18 |
| `@stynx-web/angular-iam`  | tier1 |         74.77 |        80 |  -5.23 |
| `@stynx/audit`            | tier1 |         75.38 |        80 |  -4.62 |
| `@stynx/privacy`          | tier1 |         75.42 |        80 |  -4.58 |

These are the eight remediation work items the new policy surfaces. Closing each gap is tracked under `docs/work/plan/WAVE-05-mutation-completeness.md`. The order above (largest gap first) is also a reasonable order of attack: large gaps mean rich survivor lists and the highest signal per spec authored. The four packages with gaps under 5 points are within one focused day each — `audit` and `privacy` in particular.

`@stynx/auth` (92.50) and `@stynx/data` (96.58) used to be at 85 (`strictest`); they now sit at 80 (`tier1`). This is a deliberate 5-point relaxation: the audit could not justify the historical 85 against tenancy's 80 / `strict`. If the workspace later decides those two security-perimeter packages warrant a higher bar, add a `tier0: { break: 85 }` and reassign.

### D4. Postpone per-PR mutation gating

No new workflow is created. The Monday cron + manual `workflow_dispatch` remain the only triggers. The factory and CI scaffolding are positioned so the per-PR gate can be added later by creating a new workflow that:

- Filters to changed packages via path-detection.
- Sets `STRYKER_INCREMENTAL: 'true'` and caches `reports/stryker-incremental.json`.
- Uses a PR-mode threshold (e.g. `break = tier.break - 5`) so a half-point margin does not block merges that are unrelated to the failing package.

Adoption is deferred until the four fragile packages clear their D3 floors. Gating PRs when the floor is already unreachable creates a perpetually-red gate the team would learn to ignore.

## Consequences

| Aspect                                    | Before                                                        | After                                                                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `*.controller.ts` in `mutate:`            | Inconsistent: 3 packages opted in, 1 explicitly out, rest n/a | Workspace-wide opt-out via factory default.                                                                                                                                                                        |
| Workspace mutation default                | `60` (`default` policy)                                       | `60` (`tier3` policy) — same number, different policy label.                                                                                                                                                       |
| `auth` / `data` floor                     | `85` (`strictest`)                                            | `80` (`tier1`) — 5 pt relaxation, deliberate.                                                                                                                                                                      |
| `tenancy` floor                           | `80` (`strict`)                                               | `80` (`tier1`) — same floor, different policy label.                                                                                                                                                               |
| `angular-iam` / `angular-audit` floor     | `70` (literal)                                                | `80` (`tier1`).                                                                                                                                                                                                    |
| `sdk` / `angular-auth` floor              | `60` (default)                                                | `80` (`tier1`) — gate will fail on `sdk` (68.32) until remediated.                                                                                                                                                 |
| `sessions` / `flow` / `idempotency` floor | `60`                                                          | `70` (`tier2`) — gate will fail on all three until remediated.                                                                                                                                                     |
| `core` / `storage` / `ratelimit` floor    | `60`                                                          | `70` (`tier2`).                                                                                                                                                                                                    |
| `STRYKER_INCREMENTAL` policy              | Implicit (`false` in CI, `true` locally)                      | Documented contract in `tools/stryker/base.mjs`.                                                                                                                                                                   |
| Per-PR gate                               | None                                                          | Deferred. ADR records the contract for future adoption.                                                                                                                                                            |
| Threshold helper                          | `getMutationThreshold(pkg) → number`                          | `getMutationThresholds(pkg) → {break, high, low}` plus scalar back-compat accessor.                                                                                                                                |
| `stryker.thresholds.high == break`        | Always true (single number policy)                            | False for tiered packages: `high` is the target, `break` is the floor. Stryker exit-code behaviour is unchanged (still keyed on `break`); `high` informs the colour coding in the HTML report and matrix renderer. |

## How to revert

Revert with: `git revert <this-commit-range>`. The 1-commit-or-many decision is left to the operator; the changes touch six files:

- `scripts/test-matrix.config.json`
- `tools/repo-config/test-thresholds.mjs`
- `tools/stryker/base.mjs`
- `packages/auth/stryker.conf.mjs`
- `packages/health/stryker.conf.mjs`
- `packages/i18n/stryker.conf.mjs`

The on-disk mutation artefacts (`<pkg>/.test-results/mutation.json`, `<pkg>/reports/mutation/`) are untouched; they remain valid against the previous policy. The next mutation run rewrites them under the new policy.
