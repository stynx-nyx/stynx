# Phase I Retro — C-4 Pilot Close

**Pilot:** C-4 (stynx adopts DEVAI). **Phase:** I — pilot close + retro.
**Author role (per Constitution Article 6):** Auditor.
**Session date:** 2026-05-15 → 2026-05-16 (single multi-turn session).
**DEVAI HEAD throughout:** `cb21339` initially → `4eb4547` after Phase 20 alignment landed mid-session → `4eb4547` at pilot close.
**Stynx branch:** `codex/sgp-stynx-web-declarations`. Pilot commits added on top of pre-existing WIP; WIP files (`package.json`, `tools/tsconfig/angular18.json`, `scripts/verify-web-sourcemaps.mjs`) were not touched.
**Inputs:** [`../devai-adoption-by-stynx.md`](../../../devai-adoption-by-stynx.md) (the kickoff brief, sibling to both repos).

This is the C-4 pilot's terminal retro. Phase A's retro at [`docs/devai-phase-a-retro.md`](devai-phase-a-retro.md) and Phase H's audit at [`docs/devai-phase-h-audit.md`](devai-phase-h-audit.md) are its detailed companions; this file synthesizes across all nine phases.

## 1. What landed (full pilot commit log)

15 commits in stynx (`b66286d` → `2435162`). Zero edits in `../devai/` from this session — all DEVAI-side work landed offline as the Phase 20 alignment (`cb21339` → `4eb4547`, six sub-batches 20.A–20.F closing D-A-1 / D-A-2 / D-A-4 / D-A-5 / D-A-6).

| Phase             | Commit      | Subject                                                                                                      |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| **A.0a**          | (no commit) | `pnpm link --global @devai/cli` via `PNPM_HOME=/Users/aarusso/Library/pnpm`                                  |
| **A.0b**          | (deferred)  | `apps/reference-{api,web}` → `reference/{api,web}` rename — 91 files; deferred to a future Engineer session  |
| **A.1**           | (no commit) | `devai pack-resolve` — `redox-pack-nestjs-postgres-angular`, 3 signals (later 5 post-20.E)                   |
| **A.2**           | `b66286d`   | `devai init --execute` — 14 files (`.devai/` + 7 spec-substrate READMEs)                                     |
| **A.3**           | `9cec878`   | first inventory pass — 7 L0 sensors                                                                          |
| **A.4**           | `86ef9c4`   | invariant candidate baseline (54 candidates, no promotion)                                                   |
| **A.5**           | `923f829`   | `docs-synthesize` wiring smoke (mock; failed under D-A-1)                                                    |
| **A.6**           | `bec5f12`   | Phase A retro + skills/governance consolidation map                                                          |
| **A.5b**          | `49fab65`   | redo via `claude -p` CLI bridge — 3 docs landed, $0.378                                                      |
| (retro update)    | `fc5e249`   | A.6 retro update — record A.5b closure                                                                       |
| (post-20 refresh) | `133deea`   | A.7 refresh inventory + candidates against patched DEVAI (54 → 68 candidates; 14 Angular routes now visible) |
| **B**             | `8c675ee`   | promote `INV-RBAC-001`, `INV-PRIVACY-001`                                                                    |
| **C**             | `6d8802c`   | author `BP-DEMO-BOOKMARK-001`                                                                                |
| **D**             | `15be445`   | scaffold 24 files under `domain/demo-bookmark/`                                                              |
| **E**             | `7f36463`   | `.github/workflows/devai-gates.yml`                                                                          |
| **F**             | `2f6e92f`   | autonomous-loop infrastructure verified; loop not invoked                                                    |
| **G**             | `4f914a2`   | retire stynx parallel governance (commitlint, GOVERNANCE.md, AGENTS.md, .codex/skills/ archive)              |
| **H**             | `2435162`   | self-application audit (CLAUDE.md added; D-A-9, D-A-10, D-A-11 filed)                                        |
| **I**             | this file   | pilot close + final retro                                                                                    |

## 2. Headline outcomes

### What worked

- **Inventory: end-to-end clean.** All 7 L0 sensors PASS post-Phase-20 against stynx with zero `--scan-dir` overrides. The pack widening (20.E) and Angular routes walker (20.D) were exactly the fixes the Phase A retro asked for, and they shipped.
- **Blueprint → scaffold pipeline: works.** `BP-DEMO-BOOKMARK-001` validated cleanly, diffed cleanly, planned cleanly, scaffolded 24 files across 6 skills. The output is template-shaped (placeholder fields in migrations, real structure in controllers/services/Angular components) — a useful starting point that requires hand-finishing.
- **CI integration: production-ready.** `devai-gates.yml` runs the full sensor sweep + invariant + blueprint validation on every PR with evidence uploaded as 14-day artifacts.
- **CLI-bridge LLM backends: a quiet win.** Phase 20.C closed D-A-6 and the result is that an adopter with the `claude` CLI installed and an OAuth session can run `docs-synthesize` end-to-end with no API key. This is the change that most reduces adopter onboarding friction.
- **Evidence chain: never broke.** 15 commits later, `evidence-verify` still PASSES. The hash-chained `.devai/state/` design holds up under realistic workload, including hand-authored agent-runs from the A.5b CLI bridge.

### What did not work cleanly

- **Doctor leaks self-development assumptions.** 4 of 8 `devai doctor` checks fail against any reasonable adopter (D-A-9 + D-A-10 + D-A-11). Closing these is the single highest-leverage next-session improvement.
- **Scaffolders don't fall back to `findDevaiPacksRoot()`.** Required a per-machine `examples/` symlink (D-A-7). Sensors do this fallback correctly; scaffolders should follow the same pattern.
- **The autonomous loop has nothing to grind on.** `compute-scorecard` returns all-UNKNOWN because the L0 sense commands don't emit SensorReadings (D-A-8). The loop chain (scorecard → backlog → feedback-iteration) wires correctly but cannot produce a meaningful backlog without sensor-readings emission.
- **Mock backend writer-payload contract was broken at session start** (D-A-1) — closed mid-session by Phase 20.B.

### What surprised us

- **DEVAI manages stynx better than DEVAI's own doctor admits.** The runtime primitives (sensors, blueprints, scaffolders, evidence chain, LLM bridges) all work. The doctor's pessimism is calibration noise, not real signal.
- **The Phase 20 alignment loop closed faster than expected.** Six DEVAI gaps surfaced in Phase A; the user took those, ran a separate DEVAI session, and shipped Phase 20 (six commits absorbing all six findings) before this session resumed. Round-trip in hours, not weeks.
- **The CLI bridge proved its value before it was a feature.** Phase A.5b's `/tmp/devai-prompt-{compose,merge}.mjs` hack was the reference implementation that Phase 20.C turned into first-class `claude-cli` / `codex-cli` LLM-backend families. The pilot and the framework co-evolved.

## 3. Adopted gaps (the D-A-\* register at pilot close)

Eleven DEVAI-side gaps surfaced across Phases A and H. Six closed offline mid-session via Phase 20; five remain open for a future devai alignment session.

| ID         | Gap                                                                     | Surfaced   | Status                                                             |
| ---------- | ----------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| **D-A-1**  | mock backend writer-payload contract broken                             | Phase A.5  | ✅ closed in Phase 20.B                                            |
| **D-A-2**  | sense-routes walker is React-only despite NestJS+Angular pack           | Phase A.3  | ✅ closed in Phase 20.D                                            |
| **D-A-3**  | brief uses `sense $verb` but actual CLI is `sense-$verb`                | Phase A.3  | ✅ closed in Phase 20.E (brief edit)                               |
| **D-A-4**  | commit-format collision (DEVAI role-prefix vs adopter commitlint)       | Phase A.2  | ✅ closed in Phase 20.E (commitlint template) + applied in Phase G |
| **D-A-5**  | lint-staged risk to evidence chain                                      | Phase A.2  | ✅ closed in Phase 20.E (gitattributes template)                   |
| **D-A-6**  | no first-class CLI-bridge LLM backend                                   | Phase A.5b | ✅ closed in Phase 20.C                                            |
| **D-A-7**  | `resolveStackAdapterPack` doesn't fall back to `findDevaiPacksRoot()`   | Phase D    | ⏳ OPEN — workaround in CI workflow                                |
| **D-A-8**  | sense-\* commands don't emit SensorReadings                             | Phase F    | ⏳ OPEN — blocks scorecard / backlog meaningfulness                |
| **D-A-9**  | doctor checks hardcode DEVAI's monorepo layout                          | Phase H    | ⏳ OPEN — split into `--self` / `--adopter`                        |
| **D-A-10** | constitution-symlink check assumes adopter authors its own constitution | Phase H    | ⏳ OPEN — paired with D-A-11                                       |
| **D-A-11** | `init --execute` doesn't create the constitution pointer                | Phase H    | ⏳ OPEN — paired with D-A-10                                       |

## 4. Adopter-side follow-ups (deferred from Phases A–H)

| ID       | Follow-up                                                                                                  | Surfaced              | Disposition                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| **F-1**  | `apps/reference-{api,web}` → `reference/{api,web}` rename                                                  | A.0b                  | Deferred — 91 files; needs Engineer session with full lint/typecheck/test validation |
| **F-2**  | `/specs/` migration into `docs/adr/` + `docs/architecture/`                                                | G                     | Deferred — 15 ADRs/specs to consolidate per-spec                                     |
| **F-3**  | `docs/governance/{health,audit,compliance}` migration into `.devai/state/`                                 | G                     | Deferred — multiple files, careful ownership transitions                             |
| **F-4**  | `docs/work/{inv,diag,plan}` cleanup (gitignore)                                                            | G                     | Deferred — needs review of what's still active                                       |
| **F-5**  | `.codex/system.md` retirement                                                                              | G                     | Deferred — leave for now to keep `.codex/` runtime functional                        |
| **F-6**  | `record.email` legal_basis + retention                                                                     | B (`INV-PRIVACY-001`) | Deferred — needs Owner authorship of legal_basis                                     |
| **F-7**  | mark `/_reference/*` dev-auth endpoints as `auth.required=false`                                           | B (`INV-RBAC-001`)    | Deferred — Engineer one-line edit + sense-api re-run to verify                       |
| **F-8**  | author use-cases for the 50 endpoints + 14 routes (Phase B precondition)                                   | B                     | Deferred — Owner-level work; opens promotion of `unmapped_*` candidates              |
| **F-9**  | finish-scaffolded `domain/demo-bookmark/` (DB migration field expansion, controller wiring, tests passing) | D                     | Deferred — Engineer work; the scaffold is template-shaped, not production-ready      |
| **F-10** | persist `PNPM_HOME` for `devai` on PATH without inline prefixing                                           | A.0a                  | Deferred — adopter convenience; one-line `~/.zshrc` add                              |

## 5. Per-phase reflection

### Phase A (bootstrap + first inventory)

**Took:** ~2 hours of session time. **Produced:** 6 commits + a 200-line retro. **Most useful insight:** "DEVAI manages adopters less strictly than it manages itself" — a tension that crystallized in Phase H and drove the largest follow-up batch.

### Phase B (invariant promotion)

**Took:** ~15 minutes. **Produced:** 2 stynx-flavored invariants. **Pattern:** `specializes` field would have been useful but is `additionalProperties: false`-rejected; folded the lineage into `rationale` instead. Schema strictness is a feature, not a bug, but minor schema additions for adopter-flavored metadata would help.

### Phase C (blueprint authoring)

**Took:** ~30 minutes (including 4 schema iterations). **Produced:** `BP-DEMO-BOOKMARK-001`. **Pattern:** schema errors were precise enough that converging from "looks right" to "validates" was bounded. Adopter-friendly.

### Phase D (scaffolding)

**Took:** ~10 minutes once D-A-7 workaround was understood. **Produced:** 24 files. **Pattern:** the scaffolder output is honestly labeled (template-shaped, not production-ready) — the file headers cite the blueprint sha. Good provenance hygiene.

### Phase E (CI gates)

**Took:** ~20 minutes. **Produced:** a 12-step workflow that runs everything important on every PR. **Pattern:** the workflow is also a template that other adopters can lift; the comments at the top explicitly mark it as adopter-shareable.

### Phase F (autonomous loop)

**Took:** ~10 minutes (mostly reading skill source). **Produced:** verification commit; no actual loop run. **Pattern:** harness correctly blocked the autonomous loop launch. The honest finding is that the loop has nothing to grind on yet (D-A-8) — Phase F's deliverable shape is documentary.

### Phase G (governance retirement)

**Took:** ~30 minutes (including the commitlint debugging). **Produced:** new commitlint config accepting both shapes, replaced GOVERNANCE.md + AGENTS.md, archived 2 of 3 .codex/skills/. **Pattern:** the DEVAI adopter-doc templates from Phase 20.E worked well as starting points but had a latent bug (`type-empty: never` rejects role-shape headers) — fixed during application. Worth filing back to DEVAI for template hardening.

### Phase H (self-application audit)

**Took:** ~25 minutes. **Produced:** 80-line audit + CLAUDE.md addition + 3 new D-A entries. **Pattern:** the audit was higher-leverage than expected — it surfaced concrete changes (D-A-9 split-doctor) that translate directly into next-session work.

### Phase I (this file)

**Took:** ~15 minutes. **Produced:** this synthesis. **Pattern:** writing the retro reinforces what's deferred (F-1 through F-10) and what's not.

## 6. Quantitative summary

| Metric                                     | Value                                                                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase A→I duration                         | ~5 hours of active session time across two calendar days (2026-05-15 → 2026-05-16)                                                                                   |
| Stynx commits                              | 15 (`b66286d` → `2435162`)                                                                                                                                           |
| Files added in stynx                       | ~95 (24 scaffolded module files + 14 init files + 7 sensor bodies + ~50 candidates + 5 promoted-invariant/blueprint/retro files + CI workflow + governance pointers) |
| `../devai/` edits in this session          | 0 (Phase 20 alignment landed offline)                                                                                                                                |
| DEVAI gaps filed                           | 11 (`D-A-1` through `D-A-11`)                                                                                                                                        |
| DEVAI gaps closed mid-session              | 6 (via Phase 20.A–F)                                                                                                                                                 |
| LLM cost incurred                          | $0.378 (3× `claude -p` doc-synthesis writers in A.5b)                                                                                                                |
| Permission-rule additions to settings.json | 0 (the user verbally approved each blocked-classifier action; no persistent rules added)                                                                             |
| Production-ready output                    | 1 module-blueprint, 2 invariants, 1 CI workflow, 3 brownfield doc-synth artifacts                                                                                    |
| Template-shaped output (needs finishing)   | 1 scaffolded module (24 files) — the "minimal but concrete" demo                                                                                                     |

## 7. Recommendations

For the next devai alignment session (highest leverage first):

1. **D-A-9** — split `doctor` into `--self` / `--adopter`. Closes 3 false-positives.
2. **D-A-7** — `resolveStackAdapterPack` falls back to `findDevaiPacksRoot()`. Eliminates the per-adopter symlink workaround.
3. **D-A-10 + D-A-11** (paired) — relax `constitution-symlink` + teach `init` to create the pointer.
4. **D-A-8** — sensor-readings emission. Either `sense-* --emit-reading` or `sense-readings-rebuild` aggregator. Without this, the autonomous loop is non-functional for adopters.

For the next stynx session (highest leverage first):

1. **F-7** — mark the 3 unbound `/_reference/*` endpoints as `auth.required=false`; re-run `sense-api`; close `INV-RBAC-001`'s known violations.
2. **F-1** — `apps/reference-{api,web}` → `reference/{api,web}` rename per directive 5.4.
3. **F-9** — finish the scaffolded `domain/demo-bookmark/` (real migration fields, working tests). Currently template-shaped.
4. **F-8** — Owner-authored use-cases for the 50 endpoints + 14 routes. Unblocks meaningful candidate promotion.
5. **F-2 / F-3 / F-4 / F-5** — finish Phase G (legacy governance migration) once the above stabilize.

## 8. Verdict

The C-4 pilot **succeeded as designed.** Stynx now runs DEVAI's full discipline (Article 6 roles in commit messages, F1-F5 substrates seeded, evidence chain valid, sensors PASS, scaffolders work, CI gates active, autonomous-loop infrastructure wired). Pre-existing stynx governance is retired or pointed at DEVAI. The pilot found 11 gaps; 6 closed mid-pilot, 5 carry forward.

The framework is fit for purpose: a NestJS+Angular+Postgres adopter can clone DEVAI as a sibling, run `devai init --execute`, run the seven L0 sensors, author blueprints + invariants, scaffold modules, wire CI, and ship a documented project under DEVAI's discipline — with the caveats that `devai doctor` overstates its complaints and the autonomous loop is not yet useful without the D-A-8 sensor-readings emission fix.

C-4 is closed. C-5 (the next adopter pilot, post-D-A-7/-8/-9/-10/-11 closure) starts from a strictly easier baseline than C-4 did.

---

## 9. Post-21 sessions update (S11 close, 2026-05-16)

**DEVAI Phase 21 closed at `583ce02`** (D-66) between this retro and S11, shipping all 5 carried-forward closures (D-A-7, D-A-8, D-A-9, D-A-10, D-A-11). Stynx then ran 11 follow-up sessions (R1, F-12, S1, S2, S3-1+2, S4-1+2, S5-1+2+3+4, S7, S8, S9, S10) to apply the Phase 21 closures and complete the adoption.

### What landed across R1 + S\* sessions

| Session | Commit                     | Outcome                                                                                                                                                                                                                              |
| ------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1      | `2c0e0ab`                  | Post-Phase-21 baseline refresh: `.devai/constitution.md` pointer landed; 7 sensors emit SRs (`.devai/state/sensor-readings/`); `devai doctor --adopter` 6/6 PASS; `examples/` symlink dropped; CI workflow updated; **D-A-14** filed |
| F-12    | `30337cd`                  | Commitlint regex accepts `Architect + Engineer:` style + `@stynx/*` scopes (pre-existing latent bug)                                                                                                                                 |
| S1      | `47c6ccc`                  | `INV-RBAC-001-allowlist.json` + `core.pii_map` enriched with `legal_basis`/`retention` + new migration `0013`; **D-A-12, D-A-13** filed                                                                                              |
| S2      | `d3bec7b`                  | `apps/reference-{api,web}` → `reference/{api,web}` (161 files); typecheck 46/46 green                                                                                                                                                |
| S5-1    | `cb734ac`                  | Commitlint adopter template, GOVERNANCE.md + AGENTS.md rewritten, `.codex/skills/` archived, `.codex/system.md` retired                                                                                                              |
| S5-2    | `ef47f85`                  | `/specs/` migration finished (10 remaining files routed); `/specs/README.md` is now the forwarding map                                                                                                                               |
| S5-3    | `343a5c1`                  | `docs/governance/` archived to `docs/legacy/governance-archive/`                                                                                                                                                                     |
| S5-4    | `de7599b`                  | `.codex/prompts/` retired to `.codex/legacy/prompts/`; README's "Active workspace shape" table replaces the old "Transitional Legacy" pre-extraction note                                                                            |
| S3-1    | `b1ca7f8`                  | `domain/demo-bookmark/` real DB schema (9-field bookmark + tag join + PII map) + workspace registration                                                                                                                              |
| S3-2    | `9ba8006`                  | demo-bookmark module compiles end-to-end (api + web typecheck green); 6 missing/broken files rewritten; **D-A-15** filed                                                                                                             |
| S4-1    | `334f0d4`                  | 4 use-cases (records browse/edit/delete + dev-login) covering 11 of 50 endpoints, 8 of 14 routes                                                                                                                                     |
| S4-2    | `1988b10`                  | 9 more use-cases (work-items, documents, record-notes, probes, tenant); **50/50 endpoints + 13/14 routes covered**                                                                                                                   |
| S7      | `9710a8d`                  | Autonomous-loop chain verified end-to-end; backlog correctly empty; **D-A-16** filed                                                                                                                                                 |
| S8      | `7224689`                  | `trace.json` authored; `inv-adherence-reverse` runs cleanly; **D-A-17** filed                                                                                                                                                        |
| S9      | `2288340`                  | `tools/migration-linter/README.md` formalizes stynx-idiosyncratic status                                                                                                                                                             |
| S10     | `7350e12`                  | Phase H redux: doctor 6/6 PASS, sensors 6/7 PASS + 1 REVIEW; **D-A-18** filed; C-4 declared structurally complete                                                                                                                    |
| S11     | this file + Phase 22 brief | C-4 terminal close                                                                                                                                                                                                                   |

### Final D-A register (open after C-4 close)

7 DEVAI-side gaps surfaced from stynx-side adoption work, all carrying to the next devai alignment session ("Phase 22"):

| ID     | Surfaced in | One-line description                                                                            |
| ------ | ----------- | ----------------------------------------------------------------------------------------------- |
| D-A-12 | S1          | `sense-api` should recognize `@Public()` decorators                                             |
| D-A-13 | S1          | `sense-data-model` should extract `legal_basis`/`retention` from migrations + `pii_map` inserts |
| D-A-14 | R1          | scorecard cell-classifier should map L0 inventory SRs onto F4 cells                             |
| D-A-15 | S3-2        | scaffolder API templates should be pack-driven (stynx-shaped, not TypeORM)                      |
| D-A-16 | S7          | `SKILL-assess-state` narrative should surface actionable advice when 43/45 UNKNOWN              |
| D-A-17 | S8          | `inv-regen` should preserve per-surface `{id, file}` for `adherence-reverse`                    |
| D-A-18 | S10         | `sense-coverage` should read `docs/product/use-cases/*.json` to populate `links[]`              |

Companion brief authored at `../devai-phase-22-alignment.md` (next-session kickoff).

### Final F- register (open stynx-side follow-ups)

| ID           | One-line description                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| F-9 step 2/N | Wire `domain/demo-bookmark/` services to `@stynx/data`; real tests; module-level CI green                  |
| F-16         | Re-author the 2 ADRs at `docs/adr/` in DEVAI's schema-conformant form (check-adrs currently finds 0 files) |

Both are stynx-side engineering work, neither blocks the pilot close.

### Final verdict

**C-4 is fully closed.** Stynx is a DEVAI-managed repository:

- All framework-level governance lives in DEVAI substrates.
- All legacy stynx governance machinery is either folded in or formally archived (every file under `/specs/`, `docs/governance/`, `.codex/{prompts,system.md}`, plus 2 of 3 `.codex/skills/`).
- DEVAI gates run on every PR (`.github/workflows/devai-gates.yml`).
- `devai doctor --adopter` returns 6/6 PASS.
- The two intentionally-stynx-specific surfaces (`tools/migration-linter/`, `.codex/skills/npm-security-upgrade-auditor/`) are now documented as such.
- The 7 open D-A entries are framework improvements DEVAI absorbs in the next phase, not stynx gaps.

Stynx becomes the canonical "DEVAI adopter at maturity" reference. C-5 starts from a strictly easier baseline than C-4 did, with Phase 22's closures further reducing onboarding friction.

**Pilot: complete.**
