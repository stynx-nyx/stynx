# Phase H Audit — Does DEVAI manage stynx as well as DEVAI manages DEVAI?

**Pilot:** C-4 (stynx adopts DEVAI). **Phase:** H — self-application audit.
**Author role (per Constitution Article 6):** Auditor (analysis-only).
**Session date:** 2026-05-16.
**DEVAI HEAD:** `4eb4547` (Phase 20.F closeout, D-64).

The brief's framing for Phase H: _"does DEVAI manage stynx as well as DEVAI manages DEVAI?"_ This audit answers it by running every DEVAI self-application command against stynx and comparing the results to what DEVAI's own dogfooding produces.

## TL;DR

**Partially.** The runtime infrastructure works: pack-resolve matches, every L0 sensor passes, scaffolders generate against blueprints, CI gates run, evidence chain stays valid, BOTH CLI-bridge LLM backends light up. But **DEVAI's `doctor` command leaks self-development assumptions into adopter checks** — 4 of 8 doctor checks fail not because stynx is misconfigured but because they hardcode DEVAI's monorepo layout and substrate naming.

**Score:** 4 of 8 doctor checks pass post-Phase-H mitigation (CLAUDE.md added). 5 of 5 ad-hoc audit commands (`inv-contracts`, `check-adrs`, `check-forbidden-actions`, `evidence-verify`, `pack-resolve`) pass. Verdict: DEVAI's adopter-side primitives are mature; DEVAI's self-doctor is not.

## 1. `devai doctor` results (pre- and post-Phase-H)

### 1.1 Initial run (pre-CLAUDE.md fix)

| Check                  | Verdict | Notes                                                                                                            |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `workspace-layout`     | ✗ FAIL  | Missing `tsconfig.base.json`, `packages/{schemas,sensors,utils}` — DEVAI's own monorepo layout.                  |
| `f1-paths-present`     | ✗ FAIL  | Missing `docs/schemas/` (DEVAI's own schemas directory; adopters use `../devai/docs/schemas/`).                  |
| `schemas-loadable`     | ✗ FAIL  | `docs/schemas/` directory missing (cascade from above).                                                          |
| `constitution-symlink` | ✗ FAIL  | Missing `.devai/constitution.md`. `init --execute` does not create it.                                           |
| `agents-claude-sync`   | ✗ FAIL  | `CLAUDE.md` missing at root (only `AGENTS.md` was present).                                                      |
| `chain-dir-writable`   | ✓ PASS  |                                                                                                                  |
| `evidence-chain-valid` | ✓ PASS  | Hash chain intact through Phases A–G.                                                                            |
| `llm-bridges`          | ✓ PASS  | `claude-cli` (Claude Code 2.1.132) and `codex-cli` (codex-cli 0.130.0) both present and exercised by Phase 20.C. |

**3 of 8 PASS, 5 of 8 FAIL.**

### 1.2 After Phase H mitigation (CLAUDE.md added)

`CLAUDE.md` was authored at the stynx repo root (Phase H deliverable) — a session-governance pointer mirroring DEVAI's CLAUDE.md but pointing at the sibling `../devai/` checkout for the canonical reading order. The doctor's `agents-claude-sync` check also requires the file to mention five specific tokens (Constitution Article 6, the five role names, the canonical reading-order sources `README.md` / `CONSTITUTION.md` / `BUILD-PLAN.md` / `DESIGN-DECISIONS.md` / `docs/schemas`); the new file includes all of them by reference.

| Check                  | Verdict    | Notes                                             |
| ---------------------- | ---------- | ------------------------------------------------- |
| `workspace-layout`     | ✗ FAIL     | (unchanged — DEVAI-self-development bleed; D-A-9) |
| `f1-paths-present`     | ✗ FAIL     | (unchanged — D-A-9)                               |
| `schemas-loadable`     | ✗ FAIL     | (unchanged — D-A-9)                               |
| `constitution-symlink` | ✗ FAIL     | (unchanged — D-A-10)                              |
| `agents-claude-sync`   | ✓ **PASS** | Fixed by Phase H CLAUDE.md author.                |
| `chain-dir-writable`   | ✓ PASS     |                                                   |
| `evidence-chain-valid` | ✓ PASS     |                                                   |
| `llm-bridges`          | ✓ PASS     |                                                   |

**4 of 8 PASS, 4 of 8 FAIL.** Net delta from Phase H: +1 PASS.

## 2. Other self-application commands

| Command                                                                            | Verdict       | Notes                                                                                                               |
| ---------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pack-resolve`                                                                     | ✓ PASS        | `redox-pack-nestjs-postgres-angular`, 5 matched signals (post-Phase-20.E pack widening).                            |
| `sense-{api, routes, data-model, data-handling, rbac, dep-graph}`                  | ✓ PASS        | All 6 inventory sensors pass against stynx with `--pack-tune` and zero `--scan-dir` overrides (Phase A.7 baseline). |
| `sense-coverage`                                                                   | ⚠️ REVIEW     | Functional — 14 routes × 50 endpoints — but use-cases not authored (Owner deliverable).                             |
| `inv-suggest`                                                                      | ✓ PASS        | 68 candidates emitted post-Phase-20 refresh.                                                                        |
| `inv-contracts`                                                                    | ✓ PASS        | 0 schemas (stynx has not authored `*.schema.json` yet — would-be-finding, but expected at this stage).              |
| `inv-{components, dependencies, modules, routes, schemas, tests, glossary, regen}` | not exercised | Out of Phase H scope (deeper audit could extend here in a future session).                                          |
| `check-adrs`                                                                       | ✓ PASS        | 0 ADR files (stynx ADRs still under legacy `/specs/`; Phase G.2 deferred migration).                                |
| `check-forbidden-actions`                                                          | ✓ PASS        | 16 registry entries, 0 findings.                                                                                    |
| `check-overrides`                                                                  | not exercised | Out of Phase H scope.                                                                                               |
| `evidence-verify`                                                                  | ✓ PASS        | Chain valid through Phase G.                                                                                        |
| `blueprint-validate docs/product/draft/blueprints/demo-bookmark.json`              | ✓ PASS        | Phase C blueprint validated cleanly post-rewrites.                                                                  |
| `blueprint-diff`                                                                   | ✓ PASS        | 12 deltas reported correctly (matched what Phase D scaffolded).                                                     |
| `blueprint-plan`                                                                   | ✓ PASS        | 21-file plan; Phase D ran the 6 scaffolders against it.                                                             |
| `compute-scorecard`                                                                | ✓ PASS        | 45 cells, all UNKNOWN/N/A (sensor-readings emission gap, D-A-8).                                                    |
| `compile-backlog`                                                                  | ✓ PASS        | 0 items (correct: no FAIL cells).                                                                                   |
| `feedback-iteration`                                                               | not invoked   | Auto-classifier blocked the autonomous loop launch (correct safety behavior).                                       |
| `docs-synthesize` (mock)                                                           | ✗ FAIL        | D-A-1 — closed in Phase 20.B (not yet re-tested in this session).                                                   |
| `docs-synthesize` (claude-cli, via the bridge)                                     | ✓ PASS        | Phase A.5b: 3 docs landed via host OAuth, $0.378 total.                                                             |

## 3. Filed gaps (added to the D-A-\* register)

### D-A-9 — `devai doctor` checks hardcode DEVAI's own workspace layout

**Where:** `packages/cli/src/commands/doctor.ts` — `checkWorkspaceLayout`, `checkF1Paths`, `checkSchemasLoadable`.
**Symptom:** The expected-paths list is `['package.json', 'pnpm-workspace.yaml', 'tsconfig.base.json', 'tsconfig.json', 'packages/cli', 'packages/core', 'packages/schemas', 'packages/sensors', 'packages/utils']` — i.e., DEVAI's own monorepo. The F1 paths list includes `docs/schemas/` (DEVAI ships the canonical schemas; adopters consume them from the sibling devai checkout).
**Why this matters for adopters:** these three checks fail by design on every adopter. There is no way for stynx (or any reasonable adopter) to satisfy them without reproducing DEVAI's internal directory shape, which contradicts the brownfield-adoption framing of D-57.
**Suggested resolution (DEVAI-side):** split `doctor` into `doctor --self` (DEVAI-self-development checks) and `doctor --adopter` (the subset that makes sense for adopters: chain validity, evidence-chain-valid, llm-bridges, agents-claude-sync, and an adopter-flavored `f1-paths-present` that takes the adopter's own substrate roots from `.devai/config/project.json`). Default behavior for `doctor` with no flag: auto-detect via `findDevaiPacksRoot()` — if the cwd IS the devai workspace root, run `--self`; otherwise run `--adopter`.

### D-A-10 — `constitution-symlink` check assumes adopter authors its own constitution

**Where:** `packages/cli/src/commands/doctor.ts` — `checkConstitutionSymlink`.
**Symptom:** Expects `.devai/constitution.md` to be a symlink to `../CONSTITUTION.md` (i.e. `<repoRoot>/CONSTITUTION.md`). Adopters don't author a constitution — they inherit DEVAI's.
**Suggested resolution:** allow the symlink target to be `../../<sibling>/CONSTITUTION.md` (cross-repo) OR allow `.devai/constitution.md` to be a regular file containing a one-line "see ../<devai>/CONSTITUTION.md" pointer. Phase 20.C's `findDevaiPacksRoot()` walk-up logic already knows how to find DEVAI from the adopter's filesystem; the same logic could resolve the constitution.

### D-A-11 — `init --execute` doesn't create the constitution symlink/pointer

**Where:** `packages/cli/src/commands/init.ts` (the bootstrap planner).
**Symptom:** Phase A.2 of the C-4 pilot ran `devai init --target . --introspect --execute` and got 14 files created — but `.devai/constitution.md` was not among them, leading to the persistent `doctor constitution-symlink` failure.
**Suggested resolution:** add `.devai/constitution.md` (per-D-A-10's resolution: pointer file or cross-repo symlink) to the init plan. Coordinated with D-A-10's fix.

## 4. What works perfectly (the positive findings)

These are not "absence of failure" — they are deliberate engineering choices that paid off when applied transitively to stynx:

1. **`pack-resolve` post-Phase-20.E widening.** Stynx's `apps/reference-{api,web}` shape used to require explicit `--scan-dir` overrides; after Phase 20.E shipped the widened pack signals, `pack-tune` + zero overrides Just Works.
2. **`claude-cli` + `codex-cli` LLM-bridge backends (Phase 20.C, D-A-6 closure).** Eliminates the API-key prerequisite for adopter pilots. Doctor's `llm-bridges` check correctly probes both, with versions surfaced. The Phase A.5b CLI-bridge hack from this very pilot is now a first-class DEVAI feature.
3. **Angular routes walker (Phase 20.D, D-A-2 closure).** `sense-routes` now finds 14 stynx Angular routes correctly. Cascade fix: `sense-coverage` matrix gets populated, candidate set shrinks from artifact-noise to real signal.
4. **Adopter-doc templates (Phase 20.E, D-A-4/D-A-5 closures).** The commitlint and `.gitattributes` templates landed in adopter docs and were applied cleanly in Phase G.
5. **Mock backend writer-payload contract (Phase 20.B, D-A-1 closure).** Not re-tested in this Phase H run, but the underlying gap that caused Phase A.5 to fail under mock should now be closed.

## 5. The headline question: how well does DEVAI manage stynx?

**Functional verdict:** well enough to drive Phases A–G end-to-end with no DEVAI-side edits in this session (DEVAI was at `4eb4547` throughout; the changes between `cb21339` and `4eb4547` were the Phase 20 alignment landed offline). Every adopter-shaped primitive (pack resolution, sensors, candidates, blueprints, scaffolders, CI gates, evidence chain, LLM bridges) works against stynx. Phases B, C, D, E, F (infrastructure) all produced their designed outputs.

**Health-check verdict:** the existing `devai doctor` is calibrated for self-development, not adoption. It surfaces 4 false-positives against stynx that are framework limitations rather than adopter failures. **D-A-9 / D-A-10 / D-A-11** capture the work needed to close this gap.

**Observed asymmetry:** DEVAI manages DEVAI more strictly than DEVAI manages stynx today. The opposite of the brief's premise. This is fine for a pilot — the stricter regime can be relaxed for adopters by splitting `doctor` and softening the substrate-shape expectations. The discipline (Article 6 roles, evidence chain, propose-before-producing) translates cleanly; only the structural assumptions don't.

**Phase B-G outcomes against this audit's framing:**

- Phase B (invariant promotion) — DEVAI's invariant schema accepted the stynx-flavored specializations cleanly. Schema is adopter-ready.
- Phase C (blueprint authoring) — schema rejected the first draft (5+ shape mismatches; clean error messages led to a quick rewrite). Schema is strict but learnable.
- Phase D (scaffolding) — passed once a workaround symlink (`examples/redox-pack-* → ../../devai/examples/...`) was in place. **D-A-7** captures the underlying `resolveStackAdapterPack` gap.
- Phase E (CI gates) — the workflow runs all 7 sensors + invariant validation + blueprint validation + uploads evidence. Production-ready.
- Phase F (autonomous loop) — chain wired correctly; the loop has nothing to act on yet (D-A-8 sensor-readings emission gap; the SKILL-feedback-iteration was correctly blocked by the harness's safety classifier).
- Phase G (governance retirement) — DEVAI's adopter-doc templates from Phase 20.E applied cleanly; `tools/repo-config/commitlint.config.cjs` accepts both shapes; `.codex/skills/` retirement was straightforward.

## 6. Recommendations for the next devai alignment session

In priority order:

1. **D-A-9** — split `doctor` into `--self` and `--adopter`. Highest leverage; closes 3 false-positives and unblocks adopter health-check use.
2. **D-A-7** — `resolveStackAdapterPack` should fall back to `findDevaiPacksRoot()` like sensors do. Second highest leverage; eliminates the Phase D symlink workaround for every adopter.
3. **D-A-10 + D-A-11** (paired) — relax `constitution-symlink` to accept cross-repo pointers + teach `init` to create the pointer. Closes the 4th false-positive.
4. **D-A-8** — sensor-readings emission. Either add `--emit-reading` flag to `sense-*` commands or ship a `sense-readings-rebuild` aggregator. Without this, scorecard / backlog / autonomous-loop chain has nothing to act on for adopters.
