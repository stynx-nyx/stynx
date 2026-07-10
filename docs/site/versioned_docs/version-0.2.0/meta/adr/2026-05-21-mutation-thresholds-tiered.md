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

The three packages that explicitly listed a controller (`@stynx-nyx/auth`, `@stynx-nyx/health`, `@stynx-nyx/i18n`) have been edited to drop the controller line. The other 27 packages already either did not list controllers or did not have controllers under the mutated path.

**Rationale.** Nest controllers in stynx are thin HTTP → service forwarders. The semantically interesting strings (route paths, `@Permission(...)` literals) live in decorators and are exercised by integration tests through supertest (the `reference/api/test/integration/reference-api.runtime.spec.ts` family and Wave 2 of `internal work note (not published)`). Mutating them under unit mocks produces low-signal survivors and dilutes the report. Packages with genuine branching logic inside a controller may opt back in by overriding `mutate`.

### D2. Adopt the CI / PR split mode for `STRYKER_INCREMENTAL`

The factory honours `STRYKER_INCREMENTAL` as the split-mode knob:

| Loop                                 | `STRYKER_INCREMENTAL` | Cache step                               | Rationale                                                                           |
| ------------------------------------ | --------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Weekly Monday cron (`hardening.yml`) | `false`               | n/a                                      | Authoritative score; only full runs catch cross-file drift in a monorepo.           |
| Local dev iteration                  | unset → `true`        | local `reports/stryker-incremental.json` | 10–50× faster iteration; risk of drift is acceptable on a developer machine.        |
| Per-PR scoped gate (deferred per D4) | `true`                | `actions/cache` keyed on src+test hashes | When adopted, must persist the cache or incremental does nothing on a fresh runner. |

The current `STRYKER_INCREMENTAL: 'false'` in `.github/workflows/hardening.yml` is kept as-is. No new workflow is added today; the contract is documented so the future PR-gate workflow has the contract to plug into.

### D3. Adopt tiered mutation bands with a single stynx acceptance floor

**2026-05-22 Architect revision.** Stynx now uses one mutation acceptance
floor across all stynx package tiers: `break: 90`. The tier names remain useful
for ownership/risk classification and for the low/high reporting bands, but
Stryker pass/fail is intentionally uniform.

`scripts/test-matrix.config.json#policies.mutation` now defines three named tiers in addition to the legacy `default / strict / strictest`:

```json
"tier1": { "break": 90, "high": 90, "low": 80 },
"tier2": { "break": 90, "high": 95, "low": 85 },
"tier3": { "break": 90, "high": 100, "low": 90 }
```

The `break` value is the acceptance threshold. It is the ceiling of the tier1
band, the middle of the tier2 band, and the floor of the tier3 band. The
`low`/`high` values remain reporting boundaries for matrix colouring and
Stryker report semantics; they do not lower the acceptance floor.

`defaults.mutation` is now `"tier3"`. The per-package map assigns packages by risk class:

| Tier              | Packages                                                                                                                                                                                                | Rationale                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| tier1 (`80..90`)  | `@stynx-nyx/auth`, `@stynx-nyx/data`, `@stynx-nyx/audit`, `@stynx-nyx/privacy`, `@stynx-nyx/tenancy`, `@stynx-nyx/sdk`, `@stynx-nyx/angular-auth`, `@stynx-nyx/angular-iam`, `@stynx-nyx/angular-audit` | Security / data / identity / shipped SDK; cross-package blast radius for surviving mutants. |
| tier2 (`85..95`)  | `@stynx-nyx/sessions`, `@stynx-nyx/idempotency`, `@stynx-nyx/flow`, `@stynx-nyx/core`, `@stynx-nyx/storage`, `@stynx-nyx/ratelimit`                                                                     | State engines and runtime services; logic-heavy but not on the security perimeter.          |
| tier3 (`90..100`) | All others (workspace default)                                                                                                                                                                          | Generic / UI / wiring; mutation testing remains mandatory, with no package below 90.        |

The legacy `default / strict / strictest` numeric policies are retained for backward compatibility with any external consumer; they are not used by per-package overrides any more.

**Expected adoption impact.** Any stynx package with a current mutation score
below `90.00` now fails the mutation gate until remediated. This is deliberate:
the wave work lifted the former tier1-below-high packages above 90, and the
remaining below-90 packages are now visible as the next architectural quality
debt rather than being hidden behind lower tier floors.

### D4. Postpone per-PR mutation gating

No new workflow is created. The Monday cron + manual `workflow_dispatch` remain the only triggers. The factory and CI scaffolding are positioned so the per-PR gate can be added later by creating a new workflow that:

- Filters to changed packages via path-detection.
- Sets `STRYKER_INCREMENTAL: 'true'` and caches `reports/stryker-incremental.json`.
- Uses an explicitly approved PR-mode threshold if the workspace later wants a softer changed-package gate; it must not silently weaken the stynx-wide `break: 90` floor.

Adoption is deferred until the below-90 packages clear the D3 floor. Gating PRs when the floor is already unreachable creates a perpetually-red gate the team would learn to ignore.

## Consequences

| Aspect                                    | Before                                                        | After                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `*.controller.ts` in `mutate:`            | Inconsistent: 3 packages opted in, 1 explicitly out, rest n/a | Workspace-wide opt-out via factory default.                                                                                            |
| Workspace mutation default                | `60` (`default` policy)                                       | `90` (`tier3` policy) — same acceptance floor as every stynx tier.                                                                     |
| `auth` / `data` floor                     | `85` (`strictest`)                                            | `90` (`tier1`).                                                                                                                        |
| `tenancy` floor                           | `80` (`strict`)                                               | `90` (`tier1`).                                                                                                                        |
| `angular-iam` / `angular-audit` floor     | `70` (literal)                                                | `90` (`tier1`).                                                                                                                        |
| `sdk` / `angular-auth` floor              | `60` (default)                                                | `90` (`tier1`).                                                                                                                        |
| `sessions` / `flow` / `idempotency` floor | `60`                                                          | `90` (`tier2`).                                                                                                                        |
| `core` / `storage` / `ratelimit` floor    | `60`                                                          | `90` (`tier2`).                                                                                                                        |
| Other stynx package floors                | `60` (`tier3` default)                                        | `90` (`tier3`).                                                                                                                        |
| `STRYKER_INCREMENTAL` policy              | Implicit (`false` in CI, `true` locally)                      | Documented contract in `tools/stryker/base.mjs`.                                                                                       |
| Per-PR gate                               | None                                                          | Deferred. ADR records the contract for future adoption.                                                                                |
| Threshold helper                          | `getMutationThreshold(pkg) → number`                          | `getMutationThresholds(pkg) → &#123;break, high, low&#125;` plus scalar back-compat accessor.                                          |
| `stryker.thresholds.high == break`        | Always true (single number policy)                            | True only for tier1. Tier2 and tier3 keep higher `high` targets while Stryker exit-code behaviour is keyed on the uniform `break: 90`. |

## How to revert

Revert with: `git revert &lt;this-commit-range&gt;`. The original ADR changes touched six files; the 2026-05-22 Architect revision touches:

- `scripts/test-matrix.config.json`
- `devai render-matrix`
- `docs/meta/adr/2026-05-21-mutation-thresholds-tiered.md`

The on-disk mutation artefacts (`&lt;pkg&gt;/.test-results/mutation.json`, `&lt;pkg&gt;/reports/mutation/`) are untouched; they remain valid against the previous policy. The next mutation run rewrites them under the new policy.
