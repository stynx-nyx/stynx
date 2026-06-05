# Session S11 — `spec-validate-all` cleanup

**Session:** C-4 post-pilot S11.
**Date:** 2026-05-24.
**Author role:** Architect + Auditor.
**DEVAI HEAD:** unchanged from S10 (`583ce02`).
**Stynx HEAD at session start:** `745c2dd` (post-PEC R2 changeset).

Targeted cleanup pass over `devai spec-validate-all` against stynx's invariant + trace substrates. Closes 7 of 144 reported errors (all invariant + trace findings). Files one new DEVAI-upstream gap (D-A-34) for the residual 137 action-coverage errors.

## 1. Starting state

```
spec validate-all: FAIL
  [✗] invariants (9 file(s), 6 error(s))
  [✗] trace (1 file(s), 1 error(s))
  [✗] action-coverage (145 file(s), 137 error(s))
```

The 6 invariant errors and 1 trace error were all actionable on the stynx side:

| Error                                                                                                          | Root cause                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INV-COVERAGE-001 /authority/docs/0/anchor: cannot resolve 'phase-a-scope' in '../devai-adoption-by-stynx.md'` | Five invariants (COVERAGE, ERROR, PERF, PRIVACY, RBAC) each carried `authority.docs[0]` pointing at the Phase A kickoff brief, which was intentionally never committed to either repo.      |
| (same shape for INV-ERROR-001, INV-PERF-001, INV-PRIVACY-001, INV-RBAC-001)                                    | Each invariant carries a valid second `authority.docs[]` entry (threat-model anchor or `phase-a-retro.md#8-phase-b-promotion-priorities`) — the unresolvable first entry was pure dead ref. |
| `INV-PACKAGES-001 /id: id domain 'PACKAGES' does not match 'domain' field 'CORE'`                              | The umbrella governance invariant promoted during U9 was named `INV-PACKAGES-001` but declared `domain: "CORE"`. `PACKAGES` is not a declared domain in `.devai/config/domains.json`.       |
| `docs/framework/arch/trace.json: invariant 'INV-PACKAGES-001' has no trace entry`                              | Same invariant was never added to `trace.json` when promoted.                                                                                                                               |

## 2. What landed

Single Architect commit (this session):

1. **Dropped 5 broken kickoff-brief anchor refs** from `INV-COVERAGE-001.json`, `INV-ERROR-001.json`, `INV-PERF-001.json`, `INV-PRIVACY-001.json`, `INV-RBAC-001.json`. Each invariant retains its second `authority.docs[]` entry, which validates cleanly.
2. **Renamed `INV-PACKAGES-001` → `INV-CORE-001`.** `git mv` of the file under `docs/framework/arch/invariants/`; `id` field updated; `domain: "CORE"` retained (already correct). The two active README references (`docs/framework/arch/README.md`, `docs/framework/arch/invariants/README.md`) were swept with an inline note about the rename. Historical pilot retros (`phase-i-retro.md`) were **not** rewritten — those documents are immutable history; their use of the old name reflects the state at that time.
3. **Added `INV-CORE-001` entry to `docs/framework/arch/trace.json`** with docs[] (the invariant + threat-model anchor), tests[] (representative reference-api integration test pointing at the structural-claim oracle), and `code_areas: ["packages/**", "packages-web/**", "reference/**", "domain/**", "tools/**"]`.

## 3. Validation

After the fixes:

```
spec validate-all: FAIL
  [✓] invariants (9 file(s), 0 error(s))   ← was 6 errors
  [✓] journeys (0 file(s), 0 error(s))
  [✓] trace (1 file(s), 0 error(s))        ← was 1 error
  [✓] glossary (0 file(s), 0 error(s))
  [✗] action-coverage (145 file(s), 137 error(s))   ← unchanged; filed as D-A-34
```

Net: **7 errors closed, 137 remaining** (all in action-coverage, filed upstream below).

## 4. New gap filed

> **Numbering correction (post-session check):** The IDs D-A-34 and D-A-35 were assigned at filing time based on a `grep -oE 'D-A-[0-9]+' docs/adopters/pilots/c-4/` sweep that returned 33 as the highest stynx-side mention. A subsequent `git log` against `../devai/` showed that DEVAI already shipped commits closing its own D-A-34 (`70e7e83` — `sense-harness-green-main --since + min_sample_size guard`) and D-A-35 (`dd28dcd` — `sense-coverage SR metrics mirror coverage body`). The findings below are real and unrelated to DEVAI's existing closures; their **canonical IDs are D-A-36 and D-A-37** respectively. The original IDs are retained as headings below with strike-through reminders so external readers tracing back through git history aren't confused.
>
> Going forward, adopter retros should base D-A numbering on `(cd ../devai && git log --all --oneline | grep -oE 'D-A-[0-9]+')` rather than stynx-local grep.

### ~~D-A-34~~ D-A-36 — `spec-validate action-coverage` expects adopter invariants to claim every DEVAI CLI sub-command

**Where:** DEVAI's `spec-validate-all` action-coverage check, invoked against stynx's `docs/framework/arch/invariants/`.

**Symptom:** Stynx's invariants collectively declare `measurable_via: [...]` claims covering `sense coverage`, `sense api`, `sense routes`, `sense data`, `sense data-handling`, `sense dep-graph`, `sense rbac`, `sense perf-test`, `sense spec-alignment`, `sense contracts`, `inv adherence` — i.e. the sense/inv subset that's adopter-meaningful. The check then reports 137 errors of the form `action '<verb> <subcommand>' is not claimed by any invariant.measurable_via` against actions such as:

- `lock acquire`, `lock release`, `lock list`, `lock reap`
- `evidence emit`, `evidence verify`, `evidence chain-head`, `evidence redact`
- `prompts compose`, `prompts diff`, `prompts freeze`
- `llm probe`, `record run`, `release gate`, `release runtime-drift`, `release postdeploy-verify`, `release list`
- `blueprint plan`, `blueprint diff`, `blueprint validate`
- `pack graduate-invariants`, `pack resolve`, `rgr emit/list/show/resolve`
- `worktree *`, `skill *`, `task *`, `triage *`, `render matrix`
- `db provision`, `db drop`, `db status`, `db start-shared`, `db stop-shared`, `db rebuild-template`, `db provision-cluster`
- `docs cli`, `docs links`, `docs synthesize`, `docs synthesize-all`, `docs render-mermaid`
- `actions list`, `backlog add/list/next/complete/compact`, `check adrs/forbidden-actions/overrides/pr-compliance/prompt-overlays`, `coverage aggregate`, `inv components/contracts/coverage/dependencies/glossary/modules/regen/routes/schemas/suggest/tests/adherence-reverse`, `loop run`, `score *`, `rtd *`, `sense build/data-model/judge/readings-rebuild/lint/harness-*/inventory-*/plant-*/spec-*/test-*/migrate-check/security-scan/test-weakening/trace-resolve/type-check`, `spec validate-*`, `verify *`

Roughly 95% of the unclaimed actions are pure DEVAI-internal infrastructure (`lock`, `evidence`, `llm`, `prompts`, `release`, `record`, `blueprint`, `pack`, `worktree`, `rgr`, `skill`, `task`, `triage`, `render`) — there is no plausible adopter invariant that should claim them. The remaining ~5% are sense-actions in DEVAI's growing surface (e.g. `sense build`, `sense judge`, `sense type-check`, `sense harness-*`) that landed post-Phase-30 without corresponding stynx invariant claims.

**Suggested resolution (DEVAI-side):**

- **(a) Split action-coverage by authorship.** Distinguish actions that DEVAI's own invariants should claim (most of them) from actions that adopter invariants should claim (the sense-_ / inv-_ subset that produces adopter-observable signal). Run two passes; report adopter errors only against the adopter-claimable subset.
- **(b) Allow `measurable_via: []` invariants to exempt scope.** Today every action must be claimed by _some_ invariant; an adopter doesn't (and shouldn't) author invariants over DEVAI's own infrastructure.
- **(c) Provide a default DEVAI invariant fixture** that adopters can either inherit or override, claiming the DEVAI-internal action namespace.

**Workaround (stynx-side, until upstream lands):** Treat the 137 action-coverage errors as known noise. They do not gate any CI pipeline today (`devai-gates.yml` runs invariants + blueprint validation, not full spec-validate-all action-coverage). Pilot retros and S-series audits should report the count without remediating.

**Status:** Open. Filed as DEVAI-upstream concern; no stynx-side code change unblocks this.

### ~~D-A-35~~ D-A-37 — `sense-coverage` hardcodes `routes-react.json` as the routes-inventory path default

**Where:** [`../../../../../devai/packages/sensors/src/inventory-coverage.ts`](../../../../../devai/packages/sensors/src/inventory-coverage.ts) lines 310-311.

```ts
const routesPath =
  opts.routesPath ?? join(opts.repoRoot, '.devai/state/sensors/inventory_routes/routes-react.json');
```

**Symptom:** Stynx is an Angular shop; `sense-routes` writes its inventory to `.devai/state/sensors/inventory_routes/routes-angular.json` (15 routes captured). `sense-coverage` then can't find `routes-react.json` and emits:

```
inventory:coverage [inventory_coverage]: REVIEW
  [warning] COVERAGE_REQUIRES_ROUTES: routes-inventory body not found at
  .devai/state/sensors/inventory_routes/routes-react.json. Run 'devai sense routes' first.
```

The resulting `coverage-matrix.json` has `routes: []` (empty), and zero route-side link records, even though 14 of the 15 Angular routes are referenced by `refs.routeIds[]` inside use-case `mainFlow[]` steps.

**Sibling gap:** D-A-2 closed the **walker** half of this (sense-routes now emits Angular correctly post-Phase-20.D). D-A-37 is the **coverage sensor's** half — the consumer of the walker output still assumes React.

**Workaround that works today:** `devai sense-coverage --routes-path .devai/state/sensors/inventory_routes/routes-angular.json` PASSes and populates the matrix with all 15 Angular routes. This is how the last committed [`coverage-matrix.json`](../../../../.devai/state/sensors/inventory_coverage/coverage-matrix.json) (generatedAt `2026-05-18T00:06:29.650Z`) was produced — with the explicit `--routes-path` override. The bug is purely the default value when no override is provided; a no-arg `devai sense-coverage` against an Angular adopter emits REVIEW with the routes-react.json warning.

**Caller-side mitigation (already in use):** Whatever script generated the 2026-05-18 matrix (likely an S-series automation or skill) must already pass `--routes-path` explicitly. Capturing that invocation in a stynx-controlled wrapper (`pnpm sense:coverage` script, or [`tools/repo-config/devai-shims/`](../../../../tools/repo-config/)) would make the workaround durable across `.devai/state/` regenerations.

**Endpoint side is unaffected.** Stynx is at **100% endpoint coverage already** (50/50 endpoints linked across UC-stynx-001…014). The earlier "44 unmapped endpoints + 7 unmapped routes" baseline cited in [`phase-i-retro.md`](phase-i-retro.md) was closed at the endpoint level during the use-case authoring sweep that produced [`stynx-reference-app.json`](../../../framework/product/use-cases/stynx-reference-app.json) and [`stynx-reference-app-extended.json`](../../../framework/product/use-cases/stynx-reference-app-extended.json). The route side is also functionally complete — 14 of 15 Angular routes are claimed via `refs.routeIds[]` in use-case `mainFlow[]` steps. Only the no-arg measurement default is broken.

**Suggested resolution (DEVAI-side):**

- **(a) Default to a framework-agnostic glob.** `glob('.devai/state/sensors/inventory_routes/routes-*.json')` and pick the first that exists, or merge all (stynx may eventually carry both an Angular shell + a React reference web).
- **(b) Read the framework discriminator from `.devai/config/pack-tune.json`** (already records `frontend: angular` / `react` for stynx-shaped packs) and select `routes-${framework}.json` accordingly.
- **(c) Allow `routesPath` override via `.devai/config/project.json`** so adopters can pin the path without DEVAI knowing the framework.

**Stynx-side mitigation (landed in this session):** root [`package.json`](../../../../package.json) carried a `sense:coverage` script:

```
"sense:coverage": "devai sense-coverage --repo-root . --routes-path .devai/state/sensors/inventory_routes/routes-angular.json --human"
```

`pnpm sense:coverage` PASSed against the current state. Durable across `.devai/state/` regenerations; no DEVAI patch dependency; no symlinks. Future S-series automations and skills were expected to call this script instead of bare `devai sense-coverage`.

**R10 cleanup:** DEVAI `765bad0` closed the default-path gap, so the stynx-local wrapper is no longer required. The root `sense:coverage` script was removed on 2026-05-24 after bare `devai sense-coverage --human` passed without route overrides.

**Status:** Open upstream (default-value still hardcoded to `routes-react.json`). Stynx is unblocked.

**Impact on Gap #3 (coverage-link synthesis, from the S11 pre-amble):** Originally framed as a half-day Architect session to author endpoint/route refs across 13 use-cases. **In reality coverage authoring is essentially complete** — endpoints at 100% (50/50), routes at 14/15 via in-step `refs.routeIds[]` (the matrix workaround above confirms PASS). Gap #3 is **closed in scope**; the remaining work is D-A-37's default-value fix and the stynx-local wrapper.

## 5. Updated open-gap snapshot

| Gap                                  | Was               | Now                                                                                                                                                                                                                                    |
| ------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trace gap (INV-PACKAGES-001 missing) | 1 error           | **closed** (added INV-CORE-001 entry)                                                                                                                                                                                                  |
| Invariant id↔domain mismatch         | 1 error           | **closed** (renamed to INV-CORE-001)                                                                                                                                                                                                   |
| Broken kickoff-brief anchors         | 5 errors          | **closed** (dropped dead refs)                                                                                                                                                                                                         |
| Action-coverage breadth              | 137 errors        | **filed upstream** (D-A-36; initially filed as D-A-34 — collision)                                                                                                                                                                     |
| Coverage-matrix routes count         | 0 routes (no-arg) | **filed upstream** (D-A-37; initially filed as D-A-35 — collision). Routes populate correctly with `--routes-path .../routes-angular.json` override. Endpoint side at 100% (50/50); route side at 14/15 via in-step `refs.routeIds[]`. |

`devai spec-validate-all` is now green on every adopter-controllable substrate (invariants / journeys / trace / glossary). The single remaining failing category is upstream-owned.

## 6. Post-D-A-36/D-A-37 follow-up (later in session)

After both upstream fixes landed, a verification pass against the fresh `devai` build surfaced one more upstream gap and an adopter-side cleanup.

### D-A-38 — `spec-validate-all` aggregator bypasses D-A-36's adopter-scope filter

**Where:** [`../../../../../devai/packages/cli/src/commands/spec/validate-all.ts:87-101`](../../../../../devai/packages/cli/src/commands/spec/validate-all.ts) — the inline action-coverage gate.

**Symptom:** The standalone `devai spec-validate-action-coverage --human` against stynx correctly reports **3 unclaimed + 3 orphan** (post-D-A-36 baseline). The aggregator `devai spec-validate-all --human` against the same repo reports **137 errors** — exactly the pre-D-A-36 noise. Both commands read the same invariants directory and registry.

**Root cause:** `spec-validate-all` does not delegate to the same `validateActionCoverage` function the standalone command uses. Its inline gate at validate-all.ts:91 iterates `getActionsList()` (the full 145-action registry) and flags every action not in `claimedActions`. No `detectSelfPosture()`, no `discoverAdopterActions()`, no `adopterFacingAuthorities` filter. And `spec-validate-all --help` exposes no `--scope` flag, so adopters can't opt in even manually.

**Evidence:**

```
$ devai spec-validate-action-coverage --human          # standalone, auto-detect
spec validate-action-coverage: FAIL (scope=adopter)
  145 action(s) registered, 14 in scope, 11 claimed by invariants
  3 unclaimed action(s): blueprint validate, inv suggest, sense data-model
  3 orphan claim(s): inv adherence, sense contracts, sense data

$ devai spec-validate-all --human                      # aggregator
spec validate-all: FAIL
  [✗] action-coverage (145 file(s), 137 error(s))      ← unfiltered
```

**Suggested resolution (DEVAI-side):** have `validate-all.ts` import and call the same `validateActionCoverage` function the standalone CLI uses, propagating an auto-detected scope. Single-source-of-truth; ~20 lines of replacement. The standalone command's existing `--scope` / `--coverage-authorities` / `--pack-tune` / `--pack-id` / `--packs-root` / `--adopter-root` options would also need to be either exposed on `spec-validate-all` or default-resolved through the same auto-detect path. Minimal-intervention shape: aggregator just calls the standalone function with default options; adopters who need overrides invoke the standalone CLI.

**Stynx-side mitigation (no code change in this session):** scripts and CI that currently call `devai spec-validate-all` for the action-coverage signal should call `devai spec-validate-action-coverage --human` directly until the aggregator is fixed. The aggregator's other four categories (invariants / journeys / trace / glossary) are all PASS, so the only signal lost by skipping the aggregator is the unified summary line.

**Status:** Open. Upstream-only fix; no clean stynx-side change.

### Adopter-side cleanup (landed in this session): 6 `measurable_via` residuals

Once `spec-validate-action-coverage` (the scope-aware standalone) was readable, it surfaced 6 fixable issues in stynx's own invariants:

| Type      | Action name          | Where (before)                           | Where (after)                                               |
| --------- | -------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Orphan    | `sense data`         | INV-FLOW-001, INV-FLOW-003               | renamed to `sense data-model`                               |
| Orphan    | `sense contracts`    | INV-ERROR-001                            | renamed to `inv contracts`                                  |
| Orphan    | `inv adherence`      | INV-FLOW-001, INV-FLOW-002, INV-FLOW-003 | renamed to `inv adherence-reverse`                          |
| Unclaimed | `blueprint validate` | (no claimant)                            | added to INV-CORE-001                                       |
| Unclaimed | `inv suggest`        | (no claimant)                            | added to INV-CORE-001                                       |
| Unclaimed | `sense data-model`   | (no claimant)                            | implicitly claimed via the FLOW-001/003 orphan rename above |

Verified post-cleanup:

```
$ devai spec-validate-action-coverage --human
spec validate-action-coverage: OK (scope=adopter)
  145 action(s) registered, 13 in scope, 13 claimed by invariants
```

Adopter-side action-coverage is now **0 unclaimed, 0 orphan**. The only thing keeping `spec-validate-all` red is D-A-38.

## 7. Updated open-gap snapshot (post-post-session)

| Gap                                  | Status                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Trace gap (INV-PACKAGES-001 missing) | **closed** in §2 (added INV-CORE-001 entry)                                                                    |
| Invariant id↔domain mismatch         | **closed** in §2 (renamed to INV-CORE-001)                                                                     |
| Broken kickoff-brief anchors         | **closed** in §2 (dropped dead refs)                                                                           |
| Action-coverage breadth (137 errors) | **closed upstream** — D-A-36 / commit `3b52bcc` in devai. Scope-aware standalone shows 0 errors against stynx. |
| Coverage-matrix routes count         | **closed upstream** — D-A-37 / commit `765bad0` in devai. Bare `devai sense-coverage` PASSes.                  |
| Aggregator bypasses scope filter     | **filed upstream** (D-A-38). Standalone command is the durable workaround.                                     |
| 6 `measurable_via` residuals (3+3)   | **closed** in §6 (orphan renames + 2 additions to INV-CORE-001)                                                |

## 8. References

- D-A-36 closure commit (devai): `3b52bcc — Architect + Engineer: closes D-A-36 — action-coverage adopter scope filters framework-internal authorities`.
- D-A-37 closure commit (devai): `765bad0 — Engineer: closes D-A-37 — sense-coverage default routes path is framework-aware`.
- Schema source: [`../../../../../devai/docs/framework/schemas/invariant.schema.json`](../../../../../devai/docs/framework/schemas/invariant.schema.json) (id regex, domain pattern).
- Domain declaration: [`../../../../.devai/config/domains.json`](../../../../.devai/config/domains.json).
- Companion S-series audits: [`phase-s10-audit.md`](phase-s10-audit.md), [`phase-s8-tuning-audit.md`](phase-s8-tuning-audit.md).
- Original promotion of the umbrella invariant: [`phase-i-retro.md`](phase-i-retro.md) §F1×T4 line 914 (as `INV-PACKAGES-001`, retained verbatim in history).
