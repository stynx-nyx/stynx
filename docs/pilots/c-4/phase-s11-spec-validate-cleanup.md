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
| `docs/arch/trace.json: invariant 'INV-PACKAGES-001' has no trace entry`                                        | Same invariant was never added to `trace.json` when promoted.                                                                                                                               |

## 2. What landed

Single Architect commit (this session):

1. **Dropped 5 broken kickoff-brief anchor refs** from `INV-COVERAGE-001.json`, `INV-ERROR-001.json`, `INV-PERF-001.json`, `INV-PRIVACY-001.json`, `INV-RBAC-001.json`. Each invariant retains its second `authority.docs[]` entry, which validates cleanly.
2. **Renamed `INV-PACKAGES-001` → `INV-CORE-001`.** `git mv` of the file under `docs/arch/invariants/`; `id` field updated; `domain: "CORE"` retained (already correct). The two active README references (`docs/arch/README.md`, `docs/arch/invariants/README.md`) were swept with an inline note about the rename. Historical pilot retros (`phase-i-retro.md`) were **not** rewritten — those documents are immutable history; their use of the old name reflects the state at that time.
3. **Added `INV-CORE-001` entry to `docs/arch/trace.json`** with docs[] (the invariant + threat-model anchor), tests[] (representative reference-api integration test pointing at the structural-claim oracle), and `code_areas: ["packages/**", "packages-web/**", "reference/**", "domain/**", "tools/**"]`.

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

> **Numbering correction (post-session check):** The IDs D-A-34 and D-A-35 were assigned at filing time based on a `grep -oE 'D-A-[0-9]+' docs/pilots/c-4/` sweep that returned 33 as the highest stynx-side mention. A subsequent `git log` against `../devai/` showed that DEVAI already shipped commits closing its own D-A-34 (`70e7e83` — `sense-harness-green-main --since + min_sample_size guard`) and D-A-35 (`dd28dcd` — `sense-coverage SR metrics mirror coverage body`). The findings below are real and unrelated to DEVAI's existing closures; their **canonical IDs are D-A-36 and D-A-37** respectively. The original IDs are retained as headings below with strike-through reminders so external readers tracing back through git history aren't confused.
>
> Going forward, adopter retros should base D-A numbering on `(cd ../devai && git log --all --oneline | grep -oE 'D-A-[0-9]+')` rather than stynx-local grep.

### ~~D-A-34~~ D-A-36 — `spec-validate action-coverage` expects adopter invariants to claim every DEVAI CLI sub-command

**Where:** DEVAI's `spec-validate-all` action-coverage check, invoked against stynx's `docs/arch/invariants/`.

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

**Where:** [`../../../../devai/packages/sensors/src/inventory-coverage.ts`](../../../../devai/packages/sensors/src/inventory-coverage.ts) lines 310-311.

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

**Workaround that works today:** `devai sense-coverage --routes-path .devai/state/sensors/inventory_routes/routes-angular.json` PASSes and populates the matrix with all 15 Angular routes. This is how the last committed [`coverage-matrix.json`](../../../.devai/state/sensors/inventory_coverage/coverage-matrix.json) (generatedAt `2026-05-18T00:06:29.650Z`) was produced — with the explicit `--routes-path` override. The bug is purely the default value when no override is provided; a no-arg `devai sense-coverage` against an Angular adopter emits REVIEW with the routes-react.json warning.

**Caller-side mitigation (already in use):** Whatever script generated the 2026-05-18 matrix (likely an S-series automation or skill) must already pass `--routes-path` explicitly. Capturing that invocation in a stynx-controlled wrapper (`pnpm sense:coverage` script, or [`tools/repo-config/devai-shims/`](../../../tools/repo-config/)) would make the workaround durable across `.devai/state/` regenerations.

**Endpoint side is unaffected.** Stynx is at **100% endpoint coverage already** (50/50 endpoints linked across UC-stynx-001…014). The earlier "44 unmapped endpoints + 7 unmapped routes" baseline cited in [`phase-i-retro.md`](phase-i-retro.md) was closed at the endpoint level during the use-case authoring sweep that produced [`stynx-reference-app.json`](../../product/use-cases/stynx-reference-app.json) and [`stynx-reference-app-extended.json`](../../product/use-cases/stynx-reference-app-extended.json). The route side is also functionally complete — 14 of 15 Angular routes are claimed via `refs.routeIds[]` in use-case `mainFlow[]` steps. Only the no-arg measurement default is broken.

**Suggested resolution (DEVAI-side):**

- **(a) Default to a framework-agnostic glob.** `glob('.devai/state/sensors/inventory_routes/routes-*.json')` and pick the first that exists, or merge all (stynx may eventually carry both an Angular shell + a React reference web).
- **(b) Read the framework discriminator from `.devai/config/pack-tune.json`** (already records `frontend: angular` / `react` for stynx-shaped packs) and select `routes-${framework}.json` accordingly.
- **(c) Allow `routesPath` override via `.devai/config/project.json`** so adopters can pin the path without DEVAI knowing the framework.

**Recommended stynx-side mitigation (durable):** add a `pnpm sense:coverage` script (or wrapper in `tools/repo-config/`) that always invokes with `--routes-path .devai/state/sensors/inventory_routes/routes-angular.json`. This is a clean stynx-side fix; no `.devai/state/` writes; no DEVAI patch dependency. **Not done in this session** — flagged for follow-up.

**Status:** Open. Real underlying bug; workaround is reliable. Filed as DEVAI-upstream concern for the default-value fix, plus a stynx-local follow-up for the wrapper script.

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

## 6. References

- Schema source: [`../../../../devai/docs/schemas/invariant.schema.json`](../../../../devai/docs/schemas/invariant.schema.json) (id regex, domain pattern).
- Domain declaration: [`../../../.devai/config/domains.json`](../../../.devai/config/domains.json).
- Companion S-series audits: [`phase-s10-audit.md`](phase-s10-audit.md), [`phase-s8-tuning-audit.md`](phase-s8-tuning-audit.md).
- Original promotion of the umbrella invariant: [`phase-i-retro.md`](phase-i-retro.md) §F1×T4 line 914 (as `INV-PACKAGES-001`, retained verbatim in history).
