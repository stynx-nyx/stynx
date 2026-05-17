# Phase A Retro — DEVAI Bootstrap + First Inventory in stynx

**Pilot:** C-4 (stynx adopts DEVAI). **Phase:** A.
**Brief:** `../devai-adoption-by-stynx.md` (sibling of stynx, not committed to either repo).
**Session date:** 2026-05-15.
**Author role (per DEVAI Article 6):** Auditor (analysis-only report).
**DEVAI HEAD assumed:** `cb21339` (Phase 19.G closeout, D-62).
**Stynx branch:** `codex/sgp-stynx-web-declarations` (Phase A commits added on top of unrelated WIP; WIP files not touched).

---

## What landed (commits)

| Substep | Commit      | Subject                                                                                                           |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| A.0a    | (no commit) | `pnpm link --global ../devai/packages/cli` — `devai` resolves on PATH via `PNPM_HOME=/Users/aarusso/Library/pnpm` |
| A.0b    | (deferred)  | `apps/reference-{api,web}` → `reference/{api,web}` rename — see §3                                                |
| A.1     | (no commit) | `devai pack-resolve` — read-only; no state log produced                                                           |
| A.2     | `b66286d`   | bootstrap devai under `.devai/` via `init --execute`                                                              |
| A.3     | `9cec878`   | first inventory pass — seven L0 sensors                                                                           |
| A.4     | `86ef9c4`   | invariant candidate baseline (no promotion)                                                                       |
| A.5     | `923f829`   | docs-synthesize wiring smoke (mock; failed) — see A.5b                                                            |
| A.5b    | `49fab65`   | doc-synthesis via `claude -p` CLI bridge (3 docs landed; $0.378 total)                                            |
| A.6     | this file   | retro + skills/governance consolidation map (revised post-A.5b)                                                   |

Seven commits land into stynx. Zero changes under `../devai/`.

---

## 1. Sensor counts (from `.devai/state/sensors/<verb>/`)

| Sensor                | Status     | Headline counts                                                                                                                           |
| --------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `sense-api`           | **PASS**   | 50 backend endpoints (NestJS controllers under `apps/reference-api/src`)                                                                  |
| `sense-routes`        | **REVIEW** | 0 frontend routes — see §4 (DEVAI gap: React-only walker)                                                                                 |
| `sense-data-model`    | **PASS**   | 5 Postgres tables: `record`, `record_note`, `work_item`, `work_item_entry`, `work_item_lock` (11–14 columns each)                         |
| `sense-data-handling` | **PASS**   | Same 5 tables; **0 columns auto-classified as PII**                                                                                       |
| `sense-rbac`          | **PASS**   | 1 `__placeholder` role, 2 guard-derived permissions (`StynxAuthGuard`, `PermissionGuard`), **0 endpoint bindings**, **0 RBAC ILF tables** |
| `sense-dep-graph`     | **PASS**   | 484 modules, 1989 import edges (avg 4 imports/module)                                                                                     |
| `sense-coverage`      | **REVIEW** | 50 endpoints × 0 routes, 0 use-cases, 0 links — depends on `sense-routes` (Angular detection)                                             |

**Pass:** 5/7. **Review:** 2/7 (`sense-routes`, `sense-coverage`). **Fail:** 0.

---

## 2. Candidate invariants (from `.devai/state/inv-candidates/`, A.4)

`devai inv-suggest --from-inventory` emitted **54 candidates**:

| Category               | Count | Notes                                                                                                                                                                                                                     |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unmapped_endpoint`    | 50    | Every backend endpoint lacks a use-case — coverage matrix is empty because `sense-routes` returned 0 routes (DEVAI gap, §4). Once Angular routes are detectable, many of these will become mappable rather than orphaned. |
| `unbound_endpoint`     | 3     | Three controllers without a discovered guard binding.                                                                                                                                                                     |
| `unlabeled_pii_column` | 1     | `sense-data-handling` did not label any column PII; one heuristic flag landed anyway.                                                                                                                                     |

**No candidate was promoted** (Phase B's deliverable, per brief).

---

## 3. Overrides used (input for a future Phase B/G pack widening)

The matched pack `redox-pack-nestjs-postgres-angular` defaults assume the codex-canonical `apps/api/src` + `apps/web/src` + `migrations`/`db/migrations`/`apps/api/migrations`. Stynx uses `apps/reference-{api,web}/` (Phase A.0b deferred — see below). Overrides applied:

| Sensor             | Override                                         | Reason                                                                                            |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `sense-api`        | `--scan-dir apps/reference-api/src`              | NestJS controllers live under reference-api                                                       |
| `sense-routes`     | `--scan-dir apps/reference-web/src`              | Angular sources live under reference-web (didn't fix the empty result — walker is React-only, §4) |
| `sense-data-model` | `--migration-dirs apps/reference-api/migrations` | Stynx migrations live alongside the reference-api                                                 |

**Recommendation for the pack** (Architect call against `../devai/examples/redox-pack-nestjs-postgres-angular/stack-adapter.json`, deferred to a separate DEVAI session per session boundary discipline):

- Add `apps/reference-api`, `apps/reference-web`, and (post-A.0b) `reference/api`, `reference/web` as alternate signal directories.
- Document the alternate-layout pattern in `../devai/docs/adopters/pack-resolution.md`.

### A.0b — `apps/reference-{api,web}` → `reference/{api,web}` rename, deferred

Per session directive 5, the canonical location is `./reference/api` and `./reference/web` (analogous to DEVAI's own `./examples/`). Today these live at `apps/reference-{api,web}`.

A `git grep` showed **91 files reference the current paths**, including:

- `pnpm-workspace.yaml`, `turbo.json`, `tools/tsconfig/base.json`, `tools/repo-config/{commitlint.config.cjs, knip.config.ts}`
- 3 CDK configs (`infra/cdk/lib/config/{dev,stage,prod}.ts`)
- 2 GitHub workflows (`.github/workflows/{reference-apps.yml, hardening.yml}`)
- 4 scripts (`scripts/{ci-local/inside.sh, ci-local/run.sh, stynx-doctor.mjs}`, `scripts/verify-web-sourcemaps.mjs`)
- `pnpm-lock.yaml`
- ~50 docs files referencing the paths

This is well above the inline-feasible threshold and touches infra-critical surfaces (CI workflows, CDK configs). **Recommended Phase A.0b follow-up session:** Engineer-led rename with full `pnpm install && pnpm typecheck && pnpm lint && pnpm test` validation and a single dedicated commit. Once landed, the pack overrides above become unnecessary (assuming the pack is also widened to recognize `reference/*`).

---

## 4. DEVAI gaps surfaced

Numbered for follow-up — these are findings Phase A produced _about_ DEVAI itself. Per session boundary discipline, **none are fixed in this session**; they are filed for the DEVAI-side maintainer.

### D-A-1 — `docs-synthesize` mock backend produces invalid writer payloads

**Where:** `../devai/packages/core/dist/llm/factory.js` (mock client) + `../devai/packages/core/dist/skills/writers/write-helper.js` (writer-skill response parser).
**Symptom:** With `DEVAI_LLM_BACKEND=mock`, all three `SKILL-write-{overview,architecture-guide,rbac-matrix}` invocations emit 9-token deterministic responses that fail the `{ markdown: "..." }` shape check. Outcome status `fail`; no doc files written.
**Evidence:** `.devai/state/llm-usage.jsonl`, `.devai/state/agent-runs/AR-019e2e74-*.json`, `.devai/state/skills/SKILL-write-*/`.
**Why this matters for adopter wiring smoke:** the brief explicitly nominates mock as the safe default for verifying wiring without LLM cost. Today that path is broken — adopters must have a real key to even verify the pipe works.
**Suggested resolution (DEVAI-side):** either teach the mock backend to return a valid `{ markdown: "<stub>" }` per writer skill, or relax the writer-skill response parser to accept the mock's deterministic payload as a stub. Track behind a Phase 19-style gap (D-63?).

### D-A-2 — `sense-routes` walker is React-only despite NestJS+Angular pack

**Where:** `../devai/packages/sensors/dist/inventory/routes.js` (or wherever the routes walker lives).
**Symptom:** `sense-routes --pack-tune --scan-dir apps/reference-web/src` returns `REVIEW` with `ROUTES_INVENTORY_EMPTY: No React routes (<Route .../> or createBrowserRouter([...])) discovered under scan path.` Default body path is even named `routes-react.json`. Stynx's `app.routes.ts` uses Angular's `Routes`/`provideRouter()` API, which the walker doesn't recognize.
**Why this matters for adopter wiring smoke:** for the canonical NestJS+**Angular**+Postgres pack, this is the most surprising gap — the pack name advertises Angular support but the routes sensor only detects React. It cascades into `sense-coverage` (also REVIEW) and inflates `unmapped_endpoint` candidate count to 50/50 (every endpoint).
**Suggested resolution (DEVAI-side):** add an Angular-flavored routes walker (`Routes` array + `provideRouter()` calls + `RouterModule.forRoot()`/`RouterModule.forChild()` patterns) and let the pack route-tune select it. Body path could become pack-determined (`routes-react.json` vs `routes-angular.json`).

### D-A-3 — Brief uses `sense $verb` but actual CLI is `sense-$verb`

**Where:** `../devai-adoption-by-stynx.md` lines 85, 88 (the for-loop) and 91-92.
**Symptom:** Following the brief literally produces `error: unknown command 'sense'`. The actual CLI verbs are `sense-api`, `sense-routes`, `sense-data-model`, `sense-data-handling`, `sense-rbac`, `sense-dep-graph`, `sense-coverage`.
**Suggested resolution (brief-side, not DEVAI):** correct the brief's example before the next adopter pilot.

### D-A-4 — Commit-format collision (DEVAI role-prefix vs adopter conventional-commits)

**Where:** brief lines 144-150 mandate role-prefixed subjects (`Architect: A.1 — ...`); stynx's husky+commitlint rejects them (no `Architect` type, no uppercase subject, no `devai`/`devai-architect` scope).
**Resolution this session:** encoded role in `chore(repo)` scope + body. See A.2/A.3/A.4/A.5 commit messages.
**Long-term (Phase G):** stynx's commitlint config (`tools/repo-config/commitlint.config.cjs`) needs to either (a) add DEVAI roles as valid types/scopes or (b) defer entirely to DEVAI's commit-validation. Per directive 5.2 (DEVAI governance supersedes legacy stynx), option (b) is the target.

### D-A-6 — no first-class CLI-bridge LLM backend

**Where:** `../devai/packages/core/src/llm/factory.js` only knows three families (`mock`, `claude`, `codex`) and both real backends require an API key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`).
**Symptom:** A user with the `claude` (Claude Code) CLI on PATH and a valid OAuth session — but no exported API key — cannot use DEVAI's writer pipeline. They have to either export a key, use mock (broken per D-A-1), or build their own bridge as we did in A.5b.
**Suggested resolution (DEVAI-side):** add a `claude-cli` (and/or `codex-cli`) backend family in `factory.js` that shells out to the local CLI via `--print --output-format json`. Telemetry can be captured from the envelope's `usage` + `total_cost_usd` fields. Auth is delegated to the CLI's own OAuth, which is already trusted by the host. This makes adopter onboarding trivially cheaper and unblocks "I have Claude Code installed; just use it" — exactly the path the stynx pilot needed.
**Reference implementation:** `/tmp/devai-prompt-{compose,merge}.mjs` from this session, plus the three commits worth of telemetry now in `.devai/state/`.

### D-A-5 — lint-staged runs prettier on `.devai/state/**`

**Where:** stynx's lint-staged config formats every staged JSON. The DEVAI evidence chain (`.devai/state/evidence-chain.json`) is hash-chained per Article 32; if a future commit triggers prettier rewriting an existing chained record, the chain breaks.
**Mitigation today:** Phase A only adds new state files; nothing existing is rewritten, so the chain is intact.
**Long-term:** add `.devai/state/**` to lint-staged ignore (or `prettier --ignore-path` augment). Phase G consolidation work.

---

## 5. Doc-synth artifacts

### A.5 (initial run, mock backend) — FAILED

| Writer                           | Status       | Body file written? | Cost         |
| -------------------------------- | ------------ | ------------------ | ------------ |
| `SKILL-write-overview`           | FAIL (D-A-1) | No                 | $0.00 (mock) |
| `SKILL-write-architecture-guide` | FAIL (D-A-1) | No                 | $0.00 (mock) |
| `SKILL-write-rbac-matrix`        | FAIL (D-A-1) | No                 | $0.00 (mock) |

### A.5b (redo via `claude -p` CLI bridge) — PASSED

Per user directive ("both claude and codex are accessible without key, just call cli commands"), the three writers were re-run via the local `claude --print` CLI using host OAuth (no `ANTHROPIC_API_KEY`).

| Writer                           | Status | Body file                    | Chars |       Cost | Cite / Inferred / Gaps |
| -------------------------------- | ------ | ---------------------------- | ----: | ---------: | ---------------------- |
| `SKILL-write-overview`           | PASS   | `docs/Overview.md`           |  3115 |    $0.1146 | 30 / 4 / 6             |
| `SKILL-write-architecture-guide` | PASS   | `docs/Architecture Guide.md` |  4800 |    $0.1306 | 38 / 4 / 6             |
| `SKILL-write-rbac-matrix`        | PASS   | `docs/RBAC Matrix.md`        |  3672 |    $0.1323 | 26 / 1 / 8             |
| **total**                        |        |                              | 11587 | **$0.378** | **94 / 9 / 20**        |

Method: `/tmp/devai-prompt-compose.mjs` imported DEVAI's own `loadInventories` / `summarizeForPrompt` / `WRITER_PROMPTS` / `OUTPUT_CONTRACT_INSTRUCTION` so the prompts were byte-identical to what `runWriterSkill` would have built. Three `claude --print --output-format json --json-schema ... --model claude-sonnet-4-6` calls produced structured payloads in `envelope.structured_output` (NOT `envelope.result` — when `--json-schema` is set, `claude -p` puts the parsed object in `structured_output` and the `result` field carries a chat-style status message). `/tmp/devai-prompt-merge.mjs` extracted the markdown and recorded DEVAI-shaped telemetry under `.devai/state/{llm-usage.jsonl, agent-runs/, skills/}`. Both `/tmp/*` scripts are throwaway, not committed.

**Honest deviations from DEVAI's pipeline:** no real `runWriterSkill` invocation, no rate-limit wrapper, no DEVAI budget enforcer (the CLI's own `--max-budget-usd` was used instead). The underlying fix is **D-A-1** (mock backend writer payload) plus a future DEVAI feature: a CLI-bridge backend that uses host OAuth instead of `ANTHROPIC_API_KEY`. Until those land, this CLI bridge is single-session glue, not a long-term substitute. Filed as **D-A-6** below.

Re-run is idempotent — it only rewrites `docs/{Overview, Architecture Guide, RBAC Matrix}.md` and appends new telemetry. No other Phase A step needs to be redone.

---

## 6. Skills-consolidation audit (per directive 6: prefer DEVAI; keep only idiosyncratic)

Stynx today ships 3 skills under `.codex/skills/`. DEVAI ships 37 skills (`devai skill-list`). Consolidation map:

| Stynx skill                    | Verdict                | DEVAI replacement                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ---------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `governance-structure-auditor` | **REPLACED-BY-DEVAI**  | `SKILL-compute-scorecard` + `SKILL-assess-state` + `SKILL-compile-backlog` | Stynx skill enforces structural conformance under `docs/governance/{health,audit,compliance}` and emits a scorecard. DEVAI's auditor-role triplet does the same job against the constitutional substrate. Phase G: retire stynx skill, point governance contributors at the DEVAI auditor flow.                                                                                                                                                                                                                                                                           |
| `repo-governance-aligner`      | **REPLACED-BY-DEVAI**  | `devai init --introspect --execute` + `devai upgrade`                      | Stynx skill enforces top-level dirs/files (`docs`, `test`, `src`, `dist`, `README.md`, `AGENTS.md`, `GOVERNANCE.md`) and seeds `docs/governance/`, `docs/work/`, `docs/dev/`, `docs/user/`. DEVAI's `init` (which we just ran in A.2) does the substrate-scaffolding job for `docs/{product,architecture,contracts,adr,operations,security,glossary}/`. The set differs (legacy stynx vs DEVAI Article 6); per directive 5.2, DEVAI's structure wins. Phase G: retire stynx skill; Phase G also folds `docs/governance/` and `docs/work/` content into DEVAI's substrate. |
| `npm-security-upgrade-auditor` | **IDIOSYNCRATIC-KEEP** | (none)                                                                     | DEVAI does not have a dependency-security skill (correctly — it's stack-specific and overlaps `npm audit` / Dependabot / Renovate already). Stynx-specific value, low overlap. **Keep.**                                                                                                                                                                                                                                                                                                                                                                                  |

**Net Phase G action on skills:** retire 2 of 3 `.codex/skills/`; keep `npm-security-upgrade-auditor`. Optionally relocate the kept skill from `.codex/` to a DEVAI-friendly location once Phase G has decided where idiosyncratic adopter skills live (proposed: `.devai/extensions/skills/` — a new convention DEVAI may want to introduce).

---

## 7. Governance-tree consolidation map (per directives 3 & 4: DEVAI authoritative; supersedes stynx)

Today, stynx has multiple governance surfaces that overlap with DEVAI's substrates:

| Stynx surface                                                                                        | DEVAI counterpart                                                                          | Phase G action                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOVERNANCE.md` (stub pointing at `docs/governance/`)                                                | DEVAI Constitution + `docs/architecture/`, `docs/security/`, `docs/operations/` substrates | Replace with a one-line "see `.devai/CONSTITUTION.md` and `docs/architecture/`" pointer.                                                                                                             |
| `AGENTS.md` (Codex modes: danger-full-access / workspace-write / read-only / approval_policy: never) | DEVAI five-role authority (Owner/Architect/Engineer/Inspector/Auditor) per Article 6       | Replace approval-mode framing with DEVAI's role-by-path framing. Keep stynx-specific operational notes (RLS reminder, naming conventions) as a side document if needed.                              |
| `CONTRIBUTING.md` (Conventional Commits + hook policy)                                               | DEVAI commit format (role-prefixed)                                                        | Reconfigure `tools/repo-config/commitlint.config.cjs` to accept DEVAI's role-prefix subjects (or replace with DEVAI's commit validator). See D-A-4.                                                  |
| `docs/governance/{health, audit, compliance}`                                                        | DEVAI scorecard + evidence chain + auditor outputs in `.devai/state/`                      | Migrate canonical compliance/health/audit content into DEVAI's substrates; leave stynx tree as transitional links.                                                                                   |
| `docs/work/{inv, diag, plan}`                                                                        | DEVAI's `.devai/state/` (sensor bodies, candidates, agent-runs)                            | Largely redundant once DEVAI is wired; treat as scratch space and gitignore.                                                                                                                         |
| `specs/` (15 normative specs incl. ADRs)                                                             | DEVAI `docs/architecture/` + `docs/adr/`                                                   | One-time migration: move spec content into `docs/architecture/invariants/` and ADRs into `docs/adr/`. Keep `/specs/` as a transitional symlink or remove after migration.                            |
| `.codex/system.md` + `.codex/prompts/` + `.codex/skills/`                                            | DEVAI prompt-overlay system + skill registry                                               | Per §6: retire 2 of 3 skills, relocate `npm-security-upgrade-auditor`. `.codex/system.md` is supplanted by DEVAI's `CLAUDE.md` (DEVAI ships an adopter version). Phase G: retire `.codex/` outright. |

**Phase A does not delete or modify any of the stynx surfaces above** — that's Phase G's job and out of session scope. This map is the input Phase G will work from.

---

## 8. Phase B promotion priorities

Phase B is "promote candidate invariants from `.devai/state/inv-candidates/` into `docs/architecture/invariants/INV-<DOMAIN>-NNN.json`." Recommended priority order, given Phase A signal:

1. **The 3 `unbound_endpoint` candidates first.** These are concrete, narrow, immediately fixable in stynx code (add `@UseGuards`/`@Roles`), and validating the fix end-to-end exercises the adherence-reverse loop with real data. Promote as `INV-RBAC-001` / `-002` / `-003`.

2. **Resolve D-A-2 _before_ promoting any `unmapped_endpoint`.** Promoting 50 unmapped-endpoint invariants today is misleading because the 0-routes baseline is a sensor bug, not a real spec gap. Once Angular routes are detectable, this number will collapse — promote _then_.

3. **The 1 `unlabeled_pii_column` candidate** is worth promoting only after a manual data-handling review (run `sense-data-handling` against an annotated `.devai/config/pii-overrides.json` if one is added). Today it's a single-shot heuristic.

4. **A new invariant family stynx should consider authoring:** "every published endpoint has a documented use-case in `docs/product/`." This is a Phase B _Owner-authored_ invariant that closes the gap inventory currently surfaces, rather than a sensor-derived candidate. Out of scope to draft here.

**Suggested Phase B sequencing:**

- B.1 — promote 3 `unbound_endpoint` invariants; add corresponding `@UseGuards` calls in stynx; re-run `sense-rbac` to confirm `endpointBindings` populates.
- B.2 — wait for D-A-2 (Angular routes walker) to land in DEVAI; re-run `sense-routes` and `sense-coverage`; re-run `inv-suggest`; re-evaluate `unmapped_endpoint` count.
- B.3 — promote whatever survives.

---

## 9. Open items for the user (across DEVAI and stynx)

1. **DEVAI-side gaps (D-A-1 through D-A-3, D-A-5)** — file as DEVAI tickets. The brief is explicit about not patching across repo boundaries in this session.
2. **`ANTHROPIC_API_KEY`** — no longer blocking (A.5b landed via `claude -p`). Still recommended if you ever want to run DEVAI's `docs-synthesize` directly, e.g., for the writers we didn't run (`software-stack`, `database-reference`, `erd`, `api-map`, `frontend-routes-map`, `compliance-{lgpd,gdpr,ccpa}`, `fp-report`, `threat-model`, `onboarding`).
3. **Persistent `PNPM_HOME`** — A.0a worked by inlining `PNPM_HOME=/Users/aarusso/Library/pnpm` per command. To make `devai` available without inline `PATH=...`, append to `~/.zshrc`:
   ```
   export PNPM_HOME="/Users/aarusso/Library/pnpm"
   export PATH="$PNPM_HOME:$PATH"
   ```
   Or run `pnpm setup` (which writes the same lines).
4. **`apps/reference-{api,web}` rename (A.0b)** — schedule a follow-up Engineer-led session.
5. **WIP on `codex/sgp-stynx-web-declarations`** — three uncommitted changes (`package.json`, `tools/tsconfig/angular18.json`, untracked `scripts/verify-web-sourcemaps.mjs`) were left exactly as found. Phase A commits sit on top. Reset/stash/finish them as you see fit.

---

## 10. Phase A self-assessment

| Brief deliverable                                                | Status                                                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A.1 — pack-resolve confirms match                                | ✅ `redox-pack-nestjs-postgres-angular`, 3 signals                                            |
| A.2 — `init --execute` bootstraps `.devai/` (+ docs scaffolding) | ✅ 14 files, commit `b66286d`                                                                 |
| A.3 — seven L0 sensors run                                       | ✅ 5 PASS / 2 REVIEW / 0 FAIL, commit `9cec878`                                               |
| A.4 — candidate invariants cataloged (no promotion)              | ✅ 54 candidates, commit `86ef9c4`                                                            |
| A.5 — doc-synthesis wiring smoke                                 | ⚠️ Wired, telemetry persisted, output FAILED under mock (D-A-1). Commit `923f829`             |
| A.5b — doc-synthesis via `claude -p` CLI bridge                  | ✅ 3 docs (Overview, Architecture Guide, RBAC Matrix) landed; $0.378 total. Commit `49fab65`  |
| A.6 — retro file landed                                          | ✅ this file                                                                                  |
| Six commits, role declared                                       | ✅ commits use `chore(repo)` scope (commitlint constraint) with role declared in body (D-A-4) |
| No edits to `../devai/`                                          | ✅ confirmed clean — `git -C ../devai status` (recommend the user verify)                     |
| No invariant promotion (Phase B's job)                           | ✅ candidates remain under `.devai/state/inv-candidates/`                                     |
| No autonomous loop (Phase F's job)                               | ✅                                                                                            |
| No retirement of stynx governance docs (Phase G's job)           | ✅ — flagged in §7 instead                                                                    |

**Verdict:** Phase A complete. All deliverables landed (A.5 closed via the A.5b CLI-bridge redo). Six DEVAI-side findings (D-A-1 … D-A-6) for the DEVAI maintainer to triage.
