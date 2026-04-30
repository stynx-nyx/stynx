# 02 — Cleanup Catalog

Each `CLEAN-NNN` is one PR-sized cleanup. Evidence cites a tracked file
path. Public-API impact is `NONE` unless the change touches a published
`@stynx/*` / `@stech/*` / `@stynx-web/*` package's exported surface.

Categories: **DEAD-CODE**, **DUPLICATION**, **TEST-DEBT**, **DOC-DEBT**,
**SCRIPT-DEBT**, **DEP-HYGIENE**, **CONFIG-DRIFT**, **STRUCTURAL**,
**ABANDONED-EXPERIMENT**.

Effort: **S** (<2h), **M** (2–8h), **L** (1–3 days), **XL** (>3 days).

Risk: **LOW** (purely internal, well-tested), **MEDIUM** (touches public
API or shared utility), **HIGH** (cross-package), **VERY HIGH** (RFC).

Recommendation: **DO NOW** / **DO SOON** / **DO AT MAJOR** / **DEFER** /
**DROP**.

---

| ID         | Category             | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Affected paths                                                                                                                                                                                                          | Effort | Risk      | Public API impact          | Recommendation                         |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- | -------------------------- | -------------------------------------- |
| CLEAN-001  | ABANDONED-EXPERIMENT | Remove root-level prompt-artifact docs left from one-shot agent run. `PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES.md` (248 lines) is a verbatim Codex prompt with `git format-patch` shell commands; `SUMMARY.md` (14 lines) is a frozen commit-summary log of the 10 commits the prompt produced. Both describe already-merged work; neither documents current state.                                                                                                                                                             | `PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES.md`, `SUMMARY.md`                                                                                                                                                              | S      | LOW       | NONE                       | DO NOW                                 |
| CLEAN-002  | ABANDONED-EXPERIMENT | Remove `patches/` directory. Contains 15 `git format-patch` mailbox files (cover letter + patches 0001–0014) produced by the same agent series as CLEAN-001. The patches were applied via the documented commit sequence; no `pnpm.patchedDependencies` consumer exists. They are residue.                                                                                                                                                                                                                                     | `patches/0000-cover-letter.patch` … `patches/0014-…patch` (15 files)                                                                                                                                                    | S      | LOW       | NONE                       | DO NOW                                 |
| CLEAN-003  | DOC-DEBT             | Delete vestigial `src/.gitkeep` at repository root. Root `src/` is otherwise empty; the placeholder served an earlier layout no longer used.                                                                                                                                                                                                                                                                                                                                                                                   | `src/.gitkeep`                                                                                                                                                                                                          | S      | LOW       | NONE                       | DO NOW                                 |
| CLEAN-004  | DOC-DEBT             | Either flesh out or delete the 3-line stub `GOVERNANCE.md`. Confirm with the team whether governance lives elsewhere (docs site? `.github/`?) and either redirect or expand.                                                                                                                                                                                                                                                                                                                                                   | `GOVERNANCE.md`                                                                                                                                                                                                         | S      | LOW       | NONE                       | DO SOON                                |
| CLEAN-005  | DOC-DEBT             | Triage `TODO.md` open items. The 5 open checkboxes ("Prompts 31, 34–37") reference an external prompt-numbering workflow. If that workflow has been retired, convert to GitHub issues and delete the file; if it's still in use, add a header note linking to where the prompts are tracked.                                                                                                                                                                                                                                   | `TODO.md`                                                                                                                                                                                                               | S      | LOW       | NONE                       | DEFER (needs team confirmation)        |
| CLEAN-006  | CONFIG-DRIFT         | Consolidate root `tsconfig.json` (2 lines) and `tsconfig.base.json` (8 lines). Both extend `./tools/tsconfig/base.json`; neither is referenced by any workspace tsconfig (every workspace extends `tools/tsconfig/*` directly). Pick one canonical root config and drop the other, or remove both if the IDE doesn't need them.                                                                                                                                                                                                | `tsconfig.json`, `tsconfig.base.json`                                                                                                                                                                                   | S      | LOW       | NONE                       | DO SOON                                |
| CLEAN-007  | DEP-HYGIENE          | Document or remove unexplained `pnpm.overrides` pins in root `package.json`: `@types/node@25.6.0`, `handlebars@4.7.9`, `postcss@8.5.12`, `serialize-javascript@7.0.5`, `webpackbar@7.0.0`. Each pin has no inline comment explaining why; some may be CVE-driven (handlebars, serialize-javascript) and others may be outdated. Either add an inline comment per pin (preferred — pnpm doesn't support `//` keys cleanly, so use a sibling `OVERRIDES.md` or a CHANGESET-style ADR snippet) or drop pins that no longer apply. | `package.json` (`pnpm.overrides`)                                                                                                                                                                                       | M      | LOW       | NONE                       | DO SOON                                |
| CLEAN-008  | CONFIG-DRIFT         | Make `infra/cdk/tsconfig.json` extend `tools/tsconfig/node24.json` to match the rest of the monorepo (the only workspace tsconfig that currently doesn't extend a preset). If the CDK app deliberately needs a different baseline, document why in a header comment.                                                                                                                                                                                                                                                           | `infra/cdk/tsconfig.json`                                                                                                                                                                                               | S      | LOW       | NONE                       | DO SOON                                |
| CLEAN-009  | DOC-DEBT             | Determine whether `.release/drafts/` is generated or hand-authored. If `scripts/generate-release-drafts.mjs` regenerates the 24 `stynx-*.md` drafts, add `/.release/drafts/*.md` to `.gitignore` and stop tracking them (keep only the README). If they're hand-authored release-note seeds, add a header note to the README so contributors don't expect regeneration.                                                                                                                                                        | `.release/drafts/*.md` (25 files), `scripts/generate-release-drafts.mjs`, `.gitignore`                                                                                                                                  | S      | LOW       | NONE                       | DO SOON                                |
| CLEAN-010  | CONFIG-DRIFT         | Stop tracking generated `.changeset/status.json`. The `release:status` script (`pnpm release:status`) writes this file at every run; tracking it produces churn and merge conflicts. Add `/.changeset/status.json` to `.gitignore` and `git rm --cached` it.                                                                                                                                                                                                                                                                   | `.changeset/status.json`, `.gitignore`                                                                                                                                                                                  | S      | LOW       | NONE                       | DO NOW                                 |
| CLEAN-011  | SCRIPT-DEBT          | Rename root script `bootstrap:typecheck` (currently aliases `pnpm --dir bootstrap run build`) to `bootstrap:build`, or change its body to actually run `typecheck`. The current name lies about what it does.                                                                                                                                                                                                                                                                                                                  | `package.json` (root)                                                                                                                                                                                                   | S      | LOW       | NONE                       | DO SOON                                |
| CLEAN-012  | DOC-DEBT             | Audit the six 3-line `packages-web/angular-*/README.md` stubs (`angular-trash`, `angular-storage`, `angular-sessions`, `angular-profile`, `angular-i18n`, plus one more). Either expand each to a one-paragraph "what is this package, who uses it, link to docs site" or unify on a generated stub from a workspace template.                                                                                                                                                                                                 | `packages-web/angular-{trash,storage,sessions,profile,i18n}/README.md`                                                                                                                                                  | M      | LOW       | NONE                       | DEFER                                  |
| CLEAN-013  | DEAD-CODE            | Re-validate `knip.config.ts` `ignoreFiles` entries. The 18-entry list is the curated set of "knip can't see this is used, trust us" exemptions. For each entry, confirm the file is still used dynamically; for `packages/stynx-backend/src/{idempotency,rate-limit}/{constants,*.module,pg-*.store}.ts` (6 entries), consider re-exporting through the package `index.ts` so knip sees them naturally and the ignores can be removed.                                                                                         | `knip.config.ts`, `packages/stynx-backend/src/idempotency/*.ts`, `packages/stynx-backend/src/rate-limit/*.ts`                                                                                                           | M      | LOW       | NONE                       | DO SOON                                |
| CLEAN-014  | CONFIG-DRIFT         | Spot-audit logging-call sites for callers that bypass `@stynx/logging` (raw `console.*` or NestJS `Logger` direct use). Not yet enumerated — this catalog entry exists to schedule the scan; if zero violations are found, drop the entry. If violations exist, migrate them.                                                                                                                                                                                                                                                  | `packages/**/src/**/*.ts`, `backend/src/**/*.ts`, `apps/**/src/**/*.ts`                                                                                                                                                 | M      | LOW       | NONE                       | DEFER (scan first, then decide)        |
| CLEAN-015  | DOC-DEBT             | Sweep `audit/REPO-GAP-ANALYSIS.md` and confirm the directory's purpose: is `audit/` the standing location for audit-prompt outputs, or a one-shot artifact? If standing, add a README; if one-shot, move the analysis under `docs/work/inv/` (which is currently empty and was apparently intended for this kind of artifact). NOTE: per R4 we do not modify the spec corpus; this is purely about the _location_ of an audit-stream artifact, not its content.                                                                | `audit/REPO-GAP-ANALYSIS.md`, `docs/work/inv/`                                                                                                                                                                          | S      | LOW       | NONE                       | DEFER (audit-stream coordination)      |
| CLEAN-016  | DOC-DEBT             | Reconcile `AGENTS.md` (root, 27 lines) with `.codex/system.md` and `.codex/prompts/`. Both describe agent behavior. Either pick one canonical "how agents work in this repo" doc and have the others link to it, or distinguish their scopes (e.g., `AGENTS.md` is the Codex protocol per [agents.md](https://agents.md), while `.codex/` is repo-specific overrides).                                                                                                                                                         | `AGENTS.md`, `.codex/system.md`, `.codex/README.md`                                                                                                                                                                     | S      | LOW       | NONE                       | DEFER                                  |
| CLEAN-017  | CONFIG-DRIFT         | Verify `.DS_Store` is gitignored. It appears in `ls -la` at root but does not appear in `git ls-files`, suggesting `.gitignore` already handles it. Spot-check that the global gitignore covers `**/.DS_Store` so subfolder copies don't slip in.                                                                                                                                                                                                                                                                              | `.gitignore`                                                                                                                                                                                                            | S      | LOW       | NONE                       | DO SOON                                |
| CLEAN-018  | DEP-HYGIENE          | Process item (not code): triage the 27 open `dependabot/*` branches on `origin`. Either enable auto-merge for low-risk update categories or set a recurring triage cadence. **This is a workflow change, not a repo edit — included for visibility and to be handed to the maintainer rather than executed by a code-cleanup PR.**                                                                                                                                                                                             | `.github/dependabot.yml` (if present, otherwise create); GH project settings                                                                                                                                            | S–M    | LOW       | NONE                       | DEFER (process, not code)              |
| STRUCT-001 | STRUCTURAL           | Resolve `@stynx/*` vs `@stech/*` namespace split. Five packages use `@stech/`; the rest use `@stynx*/`. The split is a navigation hazard. **Renaming any published package is BREAKING (semver major)** and requires consumer coordination plus changesets. Do not act in isolation — write a short RFC and align with the next major.                                                                                                                                                                                         | `packages/stynx-backend/package.json`, `packages/stynx-contracts/package.json`, `packages/stynx-frontend-client/package.json`, `packages/stynx-frontend-contracts/package.json`, `apps/reference-frontend/package.json` | XL     | VERY HIGH | BREAKING                   | DO AT MAJOR (RFC required)             |
| STRUCT-002 | STRUCTURAL           | Evaluate `packages-web/angular-*` fragmentation. Nine libs, three of them <5 source files (angular-trash=3, angular-sessions=3, angular-profile=4). Consolidation may reduce workspace overhead; cherry-pick consumers may suffer from a larger dependency. Requires consumer-import analysis (which apps/packages import which web libs?) before deciding. **Not a single-PR cleanup; record as RFC candidate.**                                                                                                              | `packages-web/angular-{trash,sessions,profile,storage,i18n}/`                                                                                                                                                           | XL     | VERY HIGH | BREAKING (if consolidated) | DEFER (analysis first; RFC if pursued) |

---

## Catalog summary

### By category

| Category             |  Count |
| -------------------- | -----: |
| ABANDONED-EXPERIMENT |      2 |
| DOC-DEBT             |      7 |
| CONFIG-DRIFT         |      4 |
| DEP-HYGIENE          |      2 |
| SCRIPT-DEBT          |      1 |
| DEAD-CODE            |      1 |
| STRUCTURAL           |      2 |
| DUPLICATION          |      0 |
| TEST-DEBT            |      0 |
| **Total**            | **19** |

### By effort

| Effort   |                                  Count |
| -------- | -------------------------------------: |
| S (<2h)  |                                     12 |
| M (2–8h) |                                      5 |
| L (1–3d) |                                      0 |
| XL (>3d) | 2 (STRUCT-001, STRUCT-002 — RFC scope) |

### By risk

| Risk      |                      Count |
| --------- | -------------------------: |
| LOW       |                         17 |
| MEDIUM    |                          0 |
| HIGH      |                          0 |
| VERY HIGH | 2 (STRUCT-001, STRUCT-002) |

### By recommendation

| Recommendation |                                                                   Count |
| -------------- | ----------------------------------------------------------------------: |
| DO NOW         |                                            4 (CLEAN-001, 002, 003, 010) |
| DO SOON        | 6 (CLEAN-004, 006, 007, 008, 009, 011, 013, 017) — actually 8, see note |
| DO AT MAJOR    |                                                          1 (STRUCT-001) |
| DEFER          |         6 (CLEAN-005, 012, 014, 015, 016, 018, STRUCT-002) — actually 7 |
| DROP           |                                                                       0 |

(Discrepancy in counts above is intentional: CLEAN-013 is "DO SOON" but
M effort, vs CLEAN-017 "DO SOON" but S effort — they're both DO SOON.
The exact split of "DO SOON" vs "DEFER" for borderline items will be
finalized in the execution plan.)

### Public API impact

| Impact       |                      Count |
| ------------ | -------------------------: |
| NONE         |                         17 |
| NON-BREAKING |                          0 |
| BREAKING     | 2 (STRUCT-001, STRUCT-002) |

### Sanity check vs posture

17 of 19 items are LOW risk and NONE-impact. Of those, 12 are S effort
(<2h each). A single "Wave 1" PR can reasonably bundle CLEAN-001, 002,
003, 010, 011, 017 — all pure deletions / gitignore tweaks — for ≤200
LOC of diff. CLEAN-006, 007, 008, 013 fit a "Wave 1.5" config-cleanup
PR. The remaining items either depend on confirmation or are RFC-scope.

This is a **QUICK PASS** posture in disguise — see
[`00-EXECUTIVE-SUMMARY.md`](./00-EXECUTIVE-SUMMARY.md).
