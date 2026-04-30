# 99 — Provenance

## Generation

| Field                       | Value                                                                         |
| --------------------------- | ----------------------------------------------------------------------------- |
| Generated at                | 2026-04-26                                                                    |
| Generator                   | Claude Code agent (model: claude-opus-4-7)                                    |
| Source repo                 | `/Users/aarusso/Development/stech/stynx`                                      |
| Source commit SHA           | `457da9025f754946b161e6f4d9d9e30770fba682`                                    |
| Source branch               | `main`                                                                        |
| Working tree state at start | clean (`git status` reported no modifications)                                |
| Inspection scope            | All workspaces declared in `pnpm-workspace.yaml` plus root coordination files |

## Tools that ran

| Tool                             | Invocation                                                      | Result                                                                          |
| -------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| knip                             | `pnpm lint:deadcode --reporter json`                            | Exit 0; `{"issues":[]}`                                                         |
| depcheck                         | `pnpm lint:deps`                                                | Exit 0; "No depcheck issue"                                                     |
| git ls-files / git grep          | various                                                         | Used for file inventory, TODO census, skip/only census, ignoreFiles cross-check |
| `find` per workspace             | `find <ws>/src -type f -name '*.ts'` etc.                       | Used for per-workspace src/test counts                                          |
| `git log --since="6 months ago"` | `… --pretty=format: --name-only \| sort \| uniq -c \| sort -rn` | Used for high-churn analysis                                                    |

## Tools that did NOT run (and why)

| Tool                       | Why deferred                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ts-prune`                 | Knip already covers exports/files/types under the project's own configured contract; `ts-prune` would duplicate the signal. Recommend running once after CLEAN-013 lands as a sanity check.           |
| `jscpd`                    | Not pre-installed; `pnpm dlx jscpd` would require a network round-trip. Manual scan surfaced no glaring duplication, so deferred to Wave 2 prep. Recommend running before STEP-W2-C as a final check. |
| `madge`                    | Not pre-installed; cycles would have shown up in `pnpm -r build` (which CI proves green). Deferred.                                                                                                   |
| `cloc`                     | Not pre-installed. File counts approximated via extension census from `git ls-files`.                                                                                                                 |
| `pnpm audit --prod --json` | Network-dependent; covered by `.github/workflows/hardening.yml`.                                                                                                                                      |
| `pnpm -r outdated`         | Network-dependent; deferred to dependabot triage (CLEAN-018).                                                                                                                                         |
| `pnpm -r build`            | Not run in this pass — heavy command across 35+ workspaces, would dominate session budget. CI proves green per recent commit history.                                                                 |
| `pnpm -r typecheck`        | Same as build.                                                                                                                                                                                        |
| `pnpm -r test --silent`    | Same as build.                                                                                                                                                                                        |

## Files inspected

Inspection covered every tracked file by category, but not every file
individually. Summary by directory:

| Directory                                                           |       Tracked files | Inspection depth                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/*` (21 workspaces)                                        | ~530 src+test files | Per-workspace src/test/dep counts; spot-reads of suspect knip-ignored modules                                                                                                                                         |
| `packages-web/*` (9 workspaces)                                     | ~140 src+test files | Per-workspace counts; README length distribution                                                                                                                                                                      |
| `apps/*` (3 workspaces)                                             |           ~70 files | Per-workspace counts                                                                                                                                                                                                  |
| `tools/*` (3 workspaces)                                            |           ~10 files | Full read of `tools/tsconfig` presets; tsconfig extends-graph                                                                                                                                                         |
| `test/*` (4 workspaces)                                             |      ~40 test files | Per-workspace counts; jest config presence                                                                                                                                                                            |
| `backend`, `bootstrap`, `frontend`, `docs`, `infra/cdk`             |          ~120 files | Per-workspace counts; tsconfig extends                                                                                                                                                                                |
| `specs/` (16 files)                                                 |                  16 | Listed (load-bearing per R4 — not inspected for adherence)                                                                                                                                                            |
| `.github/workflows/`                                                |               7 yml | Listed; cross-checked vs root scripts                                                                                                                                                                                 |
| `.husky/`                                                           |             2 hooks | Read for hook-script existence                                                                                                                                                                                        |
| `scripts/`                                                          |          16 entries | Listed; cross-checked vs root scripts and workflows                                                                                                                                                                   |
| `.codex/`, `.release/`, `.changeset/`, `audit/`, `patches/`, `src/` |   60 files combined | Read or sampled                                                                                                                                                                                                       |
| Root coordination files                                             |                 ~15 | Read in full (`README.md`, `TODO.md`, `SUMMARY.md`, `AGENTS.md`, `GOVERNANCE.md`, `PROMPT_UPDATE_*.md`, `package.json`, `tsconfig*.json`, `turbo.json`, `eslint.config.mjs`, `knip.config.ts`, `pnpm-workspace.yaml`) |

Total tracked files in repo: **1070** (`git ls-files \| wc -l`).

## Inspection duration

Approximately 25–30 minutes of wall time across one continuous session
(plan generation, exploration, tool runs, artifact authoring). The
plan-mode interlude added ~5 minutes for the plan file write and
approval cycle.

## Output word count

Approximate word counts of the deliverable artifacts:

| File                           |   Approx. words |
| ------------------------------ | --------------: |
| `00-EXECUTIVE-SUMMARY.md`      |           ~1100 |
| `01-INSPECTION-RESULTS.md`     |           ~2400 |
| `02-CLEANUP-CATALOG.md`        |           ~1700 |
| `03-EXECUTION-PLAN.md`         |           ~2000 |
| `04-RISK-REGISTER.md`          |            ~900 |
| `05-METRICS-BASELINE.md`       |           ~1200 |
| `99-PROVENANCE.md` (this file) |            ~600 |
| **Total**                      | **~9900 words** |

## Self-check against quality gates

| Gate                                                                               | Status                                                                     |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Q1: All seven artifacts exist under `docs/work/rationalization/`                   | ✅                                                                         |
| Q2: Every `CLEAN-NNN` entry has evidence + recommendation                          | ✅                                                                         |
| Q3: Every execution step references ≥1 catalog ID                                  | ✅ (only Wave 5 is empty by design)                                        |
| Q4: Wave ordering (deletions → consolidations → conventions → docs → API) enforced | ✅                                                                         |
| Q5: Every evidence cell cites ≥1 file path                                         | ✅                                                                         |
| Q6: Executive-summary posture consistent with catalog totals                       | ✅ (QUICK PASS reflects 17 LOW-risk items, 12 of which are <2h each)       |
| Q7: `git diff --stat` shows changes only under `docs/work/rationalization/`        | (verify after this turn — see closing `git status` in operator handoff)    |
| Q8: Plan readable top-to-bottom in <30 min by senior engineer                      | ✅ (executive summary + catalog table = ~10 min triage; full read ≤25 min) |

## Caveats and known limits of this pass

- **Build/test runtime not measured.** CI is the authoritative source;
  the metrics baseline records this gap.
- **No bundle-size analysis** for Angular shipping packages.
- **No cyclomatic-complexity scan.** Out of scope for rationalization.
- **Spec adherence not assessed.** That is the audit prompt's domain
  (R4); `audit/REPO-GAP-ANALYSIS.md` is the existing audit-stream
  artifact.
- **`pnpm.overrides` rationale is unknown for all five pins** — CLEAN-007
  proposes the discovery work. Until done, the pins remain as-is.
- **Logging-call-site scan** (CLEAN-014) was not executed in this pass;
  the catalog item exists to schedule that scan as a Wave 3 step.
