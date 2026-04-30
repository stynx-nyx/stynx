# 03 — Execution Plan

Wave-ordered, PR-sized steps. Each step references catalog IDs from
[`02-CLEANUP-CATALOG.md`](./02-CLEANUP-CATALOG.md). Wave 5 (public API
tightening) is empty — this repo has no flagged BREAKING cleanup beyond
the two structural RFC candidates, which are not "execution plan" work.

Pre-condition for all waves: the audit prompt's BLOCKER findings, if any,
have been cleared. Rationalization should not race ahead of audit-driven
fixes.

---

## Wave 1 — Pure deletions (LOW risk, NO public API impact)

### STEP-W1-A: "Remove agent-prompt artifacts and applied patch series"

- **Catalog IDs:** CLEAN-001, CLEAN-002, CLEAN-003
- **Branch:** `clean/remove-agent-prompt-residue`
- **Diff size estimate:** ~−1300 LOC (16 deleted files), 0 added
- **Order rationale:** First because it's the largest visible noise
  reduction and zero risk — none of the targets are imported, executed,
  or referenced from any tracked file outside themselves.
- **Pre-conditions:** None.
- **Steps for the executing agent/human:**
  1. `git rm PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES.md SUMMARY.md src/.gitkeep`
  2. `git rm patches/*.patch` (15 files)
  3. `rmdir src patches` (only if both end up empty)
  4. Grep the repo for any reference to the deleted filenames:
     `git grep -nF 'PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES'`,
     `git grep -nF 'SUMMARY.md'` (limit to top-level mentions),
     `git grep -nF 'patches/'`. Update any stale references found in
     READMEs or workflow files.
- **Verification:**
  - `pnpm -r build && pnpm -r typecheck && pnpm -r lint && pnpm -r test`
    all green.
  - `git ls-files | grep -E 'PROMPT_UPDATE|^SUMMARY\.md$|^src/|^patches/'`
    returns empty.
- **Rollback:** `git revert <sha>` — purely additive removal; no
  semantic dependency.
- **Effort:** S (~30 min including verification).

### STEP-W1-B: "Stop tracking generated `.changeset/status.json`"

- **Catalog IDs:** CLEAN-010
- **Branch:** `clean/changeset-status-gitignore`
- **Diff size estimate:** ~+1 / −N LOC (one .gitignore line, one removed
  generated file)
- **Order rationale:** Pairs naturally with W1-A but kept separate so the
  changeset surface change is reviewable independently by the release
  owner.
- **Pre-conditions:** Confirm `pnpm release:status` regenerates the file
  (it should, per its `--output .changeset/status.json` flag in the root
  `package.json` script).
- **Steps:**
  1. Append `/.changeset/status.json` to `.gitignore`.
  2. `git rm --cached .changeset/status.json`
  3. `pnpm release:status` (regenerate locally — should succeed and
     leave a file ignored by git).
- **Verification:**
  - `git status` shows `.changeset/status.json` as untracked-and-ignored
    (i.e., not listed at all).
  - Open a tiny no-op changeset and `pnpm release:status` to confirm
    regeneration still works.
- **Rollback:** `git revert <sha>` and re-add the file.
- **Effort:** S (~15 min).

---

## Wave 2 — Internal consolidations (LOW risk, NO public API impact)

### STEP-W2-A: "Consolidate root tsconfigs"

- **Catalog IDs:** CLEAN-006
- **Branch:** `clean/consolidate-root-tsconfig`
- **Diff size estimate:** ~−5 LOC (one file deletion)
- **Order rationale:** Quick win, sets up later config-cleanup work.
- **Pre-conditions:** Confirm IDE setup (VS Code TS server + Angular
  Language Service) doesn't pin to a specific root file. Most likely the
  IDE picks up `tsconfig.json`; `tsconfig.base.json` is the historical
  one with the three extra `compilerOptions`. Decision: keep
  `tsconfig.base.json` (the one with content) and rename it to
  `tsconfig.json`, OR keep `tsconfig.json` (the stub) and merge the three
  options into `tools/tsconfig/base.json`. Recommended: merge into
  `tools/tsconfig/base.json` (already extended by every workspace) and
  delete both root files. **Verify** every workspace tsconfig still
  compiles after the change.
- **Steps:**
  1. Move `noImplicitOverride`, `experimentalDecorators`,
     `emitDecoratorMetadata` from root `tsconfig.base.json` into
     `tools/tsconfig/base.json` (or its sub-presets if any of those
     three are not desired for non-Nest workspaces).
  2. `git rm tsconfig.json tsconfig.base.json`.
  3. Update any tooling that references `./tsconfig.json` at the root
     (search for `tsconfig.base.json` and `^tsconfig.json` references).
- **Verification:**
  - `pnpm -r build && pnpm -r typecheck` green.
  - Particular attention to `apps/reference-frontend`,
    `apps/reference-web`, `frontend`, `packages-web/*` (Angular
    workspaces — the decorator metadata flags matter most for them).
- **Rollback:** Revert.
- **Effort:** S (~1h with verification).

### STEP-W2-B: "Make `infra/cdk/tsconfig.json` extend the shared preset"

- **Catalog IDs:** CLEAN-008
- **Branch:** `clean/infra-cdk-tsconfig-extend`
- **Diff size estimate:** ~−15 / +1 LOC
- **Order rationale:** Single file change; depends on W2-A landing first
  (so `tools/tsconfig/node24.json` is the canonical shared preset).
- **Pre-conditions:** W2-A merged.
- **Steps:**
  1. Read current `infra/cdk/tsconfig.json` and identify any options
     that diverge from `tools/tsconfig/node24.json`.
  2. If divergences are intentional (CDK requires e.g. `target: ES2020`
     or specific `lib` settings), either upstream them into the shared
     preset or keep them as overrides under an `extends` line.
  3. If divergences are accidental, drop them.
  4. Add `"extends": "../../tools/tsconfig/node24.json"`.
- **Verification:** `pnpm --filter @stynx-infra/cdk build` (or whatever
  the CDK build command is) green.
- **Rollback:** Revert.
- **Effort:** S (~30 min).

### STEP-W2-C: "Re-validate knip ignore-list and inline what's possible"

- **Catalog IDs:** CLEAN-013
- **Branch:** `clean/knip-ignore-list-revalidate`
- **Diff size estimate:** ~−6 / +6 LOC (deltas in knip.config.ts and
  index re-exports)
- **Order rationale:** Independent of other waves; low risk.
- **Pre-conditions:** None.
- **Steps:**
  1. For each entry in `knip.config.ts` `ignoreFiles`, run
     `git grep -n '<basename>'` and confirm it's still consumed
     dynamically (NestJS DI, Angular build replacement, Cypress, etc.).
  2. For `packages/stynx-backend/src/idempotency/{constants,
idempotency.module, pg-idempotency.store}.ts` and the parallel
     `rate-limit/` triple, attempt to re-export them via the package
     `index.ts`. If knip then sees them, remove the ignore entries.
  3. For any entry whose target file no longer exists, remove the
     entry.
- **Verification:**
  - `pnpm lint:deadcode` still reports 0 issues.
  - `pnpm -r build && pnpm -r test` green for `packages/stynx-backend`
    and any consumer.
- **Rollback:** Revert.
- **Effort:** M (~3h).

### STEP-W2-D: "Document or unwind unexplained pnpm.overrides pins"

- **Catalog IDs:** CLEAN-007
- **Branch:** `clean/document-pnpm-overrides`
- **Diff size estimate:** ~+30 / −0 LOC (a new `OVERRIDES.md` plus a
  pointer comment in `package.json` near the overrides block)
- **Order rationale:** Independent.
- **Pre-conditions:** None.
- **Steps:**
  1. For each pin, `git log -p -- package.json | rg <pkg-name>` to find
     the commit that introduced it; surface the rationale (CVE? broken
     transitive? perf?).
  2. Create `OVERRIDES.md` with one section per pin: package, pinned
     version, reason, last-reviewed date, removal condition (e.g.,
     "remove when @types/node 26 lands and Angular's CLI is compatible").
  3. If any pin's reason no longer applies (transitive issue resolved
     upstream), drop it from `package.json` and verify
     `pnpm install && pnpm -r build` green.
- **Verification:**
  - `pnpm install --frozen-lockfile=false` succeeds.
  - `pnpm -r build && pnpm -r test` green.
- **Rollback:** Revert.
- **Effort:** M (~2h, plus per-pin spelunking time).

---

## Wave 3 — Convention alignment (LOW–MEDIUM risk)

### STEP-W3-A: "Rename mis-named root scripts"

- **Catalog IDs:** CLEAN-011
- **Branch:** `clean/rename-bootstrap-typecheck`
- **Diff size estimate:** ~−1 / +1 LOC, plus any callers
- **Order rationale:** After Wave 2 settles; independent.
- **Pre-conditions:** None.
- **Steps:**
  1. Rename `bootstrap:typecheck` → `bootstrap:build` in root
     `package.json`.
  2. `git grep -nF 'bootstrap:typecheck'` and update any workflow,
     doc, or docstring callers.
- **Verification:** `pnpm bootstrap:build` succeeds.
- **Rollback:** Revert.
- **Effort:** S (~15 min).

### STEP-W3-B: "Logging-call-site sweep"

- **Catalog IDs:** CLEAN-014
- **Branch:** `clean/logging-callsite-sweep`
- **Diff size estimate:** TBD (depends on scan results)
- **Order rationale:** Standalone; do only if the scan turns up
  violations.
- **Pre-conditions:** Run the scan first:
  `git ls-files '*.ts' | xargs grep -nE '\bconsole\.(log|warn|error|info|debug)\b|new Logger\('`
  filtered for non-test, non-script paths.
- **Steps:**
  1. If scan returns 0 violations: drop CLEAN-014 from the catalog
     (close as `DROP — no violations found`).
  2. If violations exist, migrate each callsite to `@stynx/logging` or
     justify the exception inline.
- **Verification:** `pnpm -r test` green; logs in dev still readable.
- **Rollback:** Revert.
- **Effort:** Conditional; M if scan returns ≤20 hits, otherwise scope
  to a follow-up.

---

## Wave 4 — Documentation pass (LOW risk, wide surface)

### STEP-W4-A: "Sort `.release/drafts/` story"

- **Catalog IDs:** CLEAN-009
- **Branch:** `clean/release-drafts-disposition`
- **Diff size estimate:** Either ~+1 / −24 (gitignore + remove) or
  ~+10 / −0 (README header)
- **Order rationale:** Independent.
- **Pre-conditions:** Read `scripts/generate-release-drafts.mjs` and
  decide whether the drafts are regenerated.
- **Steps:** See CLEAN-009.
- **Verification:** `pnpm release:drafts` runs cleanly; intended files
  are present (or excluded as per decision).
- **Rollback:** Revert.
- **Effort:** S (~45 min).

### STEP-W4-B: "Reconcile or expand 3-line stub READMEs and `GOVERNANCE.md`"

- **Catalog IDs:** CLEAN-004, CLEAN-012
- **Branch:** `clean/stub-readme-pass`
- **Diff size estimate:** ~+50–150 LOC across 6–7 files
- **Order rationale:** Optional polish; does not affect any builds or
  tests.
- **Pre-conditions:** None.
- **Steps:**
  1. For each `packages-web/angular-*/README.md` ≤ 3 lines, expand to a
     paragraph: package purpose, intended consumer, link to the docs
     site or to the package's `index.ts`.
  2. For `GOVERNANCE.md`, either expand or replace with a redirect to
     `docs/governance/`.
- **Verification:** Visual review.
- **Rollback:** Revert.
- **Effort:** M (~3h).

### STEP-W4-C: "Reconcile AGENTS.md and .codex/"

- **Catalog IDs:** CLEAN-016
- **Branch:** `clean/agents-codex-reconcile`
- **Diff size estimate:** ~+/−30 LOC across 3 files
- **Order rationale:** Independent.
- **Pre-conditions:** Decide whether `AGENTS.md` is the
  [agents.md](https://agents.md) protocol surface (in which case keep
  per-spec) or repo-internal — `.codex/` looks repo-internal. If both
  are kept, distinguish their scopes in their headers.
- **Steps:** Cross-link the two; remove duplicate content.
- **Verification:** Visual review; agents reading either file land on
  the right one.
- **Rollback:** Revert.
- **Effort:** S (~1h).

### STEP-W4-D: "Triage `TODO.md` and `audit/` location"

- **Catalog IDs:** CLEAN-005, CLEAN-015
- **Branch:** `clean/todo-and-audit-disposition`
- **Diff size estimate:** Either small or none, depending on team
  decisions.
- **Order rationale:** Both are DEFER items pending team input — group
  for a single team-decision PR.
- **Pre-conditions:** Confirm with maintainer:
  - Is the prompt-numbered workflow (`Prompts 31, 34–37`) still active?
  - Is `audit/` the standing location for audit-stream output, or one-shot?
- **Steps:** Apply the decisions reached.
- **Verification:** N/A (doc-only).
- **Effort:** S–M depending on outcome.

---

## Wave 5 — Public API tightening (HIGH risk)

**Empty.** No catalog item recommends a Wave-5 cleanup. The two
STRUCT-\* items (namespace consolidation, web-package consolidation)
require RFCs and consumer analysis; they should be tracked outside the
rationalization execution stream.

---

## Wave summary

| Wave                             |        Steps | Catalog items | Total est. effort                  |
| -------------------------------- | -----------: | ------------: | ---------------------------------- |
| Wave 1 — Pure deletions          |            2 |             4 | S+S = ~45 min                      |
| Wave 2 — Internal consolidations |            4 |             4 | S+S+M+M = ~7h                      |
| Wave 3 — Convention alignment    |            2 |             2 | S + (M conditional) = ~30 min – 4h |
| Wave 4 — Documentation pass      |            4 |             5 | S+M+S+S–M = ~5–7h                  |
| Wave 5 — Public API tightening   |            0 |             0 | 0                                  |
| **Total (Waves 1–4)**            | **12 steps** |  **15 items** | **~13–18 hours**                   |

(Items remaining after Wave 4: CLEAN-018 — process item, handed to
maintainer; STRUCT-001/002 — RFC-track, not part of execution plan.)

## Cross-cutting execution rules

- **One PR per step.** No bundling across steps unless explicitly
  marked.
- **Verification gate per PR:** `pnpm -r build && pnpm -r typecheck &&
pnpm -r lint && pnpm -r test` must pass locally before opening.
- **Changeset:** none of the Wave 1–4 steps touch published packages'
  surfaces, so no `changeset add` is required. If a step accidentally
  ends up touching a `packages/*/src/index.ts` export, halt and reroute
  to a STRUCT- track.
- **Branch naming:** `clean/<descriptive-kebab>` per step.
- **Commit messages:** conventional-commits, scoped `chore` for code
  cleanup or `docs` for doc cleanup. Reference catalog IDs in the body
  (`CLEAN-001, CLEAN-002, CLEAN-003`).
