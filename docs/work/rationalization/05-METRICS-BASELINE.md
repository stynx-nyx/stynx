# 05 — Metrics Baseline

Snapshot at commit `457da9025f754946b161e6f4d9d9e30770fba682` (branch `main`),
`2026-04-26`. All counts computed from `git ls-files` and grep over the tracked
tree (no `node_modules`, no build outputs). Build/test/coverage runtime
numbers are not captured in this pass — see "Deferred metrics" below for the
rationale.

## Repository scale

| Metric                 | Value                     |
| ---------------------- | ------------------------- |
| Tracked files (total)  | 1070                      |
| TypeScript / TSX files | 585 (`.ts`) + 0 `.tsx`    |
| `.cjs` files           | 48                        |
| `.mjs` files           | 31                        |
| `.js` files            | 8                         |
| `.json` files          | 113                       |
| `.md` files            | 123                       |
| `.sql` files           | 41                        |
| `.html` files          | 16                        |
| `.scss` files          | 14                        |
| `.yml` / `.yaml` files | 11 + 3                    |
| `.sh` files            | 13                        |
| `.patch` files         | 15 (all under `patches/`) |
| `.gitkeep` files       | 5                         |

## Workspace inventory (45 total)

| Tier                            | Count | Members                                                                                                                                                                                                    |
| ------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/*` (publishable libs) | 21    | audit, auth, cli, core, data, health, i18n, idempotency, logging, privacy, ratelimit, sessions, storage, stynx-backend, stynx-contracts, stynx-frontend-client, stynx-frontend-contracts, tenancy, testing |
| `packages-web/*` (Angular libs) | 9     | angular, angular-auth, angular-i18n, angular-profile, angular-sessions, angular-storage, angular-trash, angular-ui, sdk                                                                                    |
| `apps/*`                        | 3     | reference-api, reference-frontend, reference-web                                                                                                                                                           |
| `tools/*`                       | 3     | eslint-config, migration-linter, tsconfig                                                                                                                                                                  |
| `test/*` (test workspaces)      | 4     | backend, db, packages, scripts                                                                                                                                                                             |
| top-level workspaces            | 5     | backend, bootstrap, frontend, docs, infra/cdk                                                                                                                                                              |

## Per-package source / test counts

(`src` excludes `*.spec.ts`/`*.test.ts`; `test` includes co-located + sibling
test dirs; the `test/*` tier below holds cross-package tests separately)

| Workspace                         | Name                             | Source | Tests |
| --------------------------------- | -------------------------------- | -----: | ----: |
| packages/audit                    | @stynx/audit                     |      9 |     2 |
| packages/auth                     | @stynx/auth                      |     22 |    12 |
| packages/cli                      | @stynx/cli                       |      9 |     3 |
| packages/core                     | @stynx/core                      |     12 |     5 |
| packages/data                     | @stynx/data                      |     20 |     6 |
| packages/health                   | @stynx/health                    |      7 |     4 |
| packages/i18n                     | @stynx/i18n                      |     11 |     1 |
| packages/idempotency              | @stynx/idempotency               |     11 |     2 |
| packages/logging                  | @stynx/logging                   |      7 |     5 |
| packages/privacy                  | @stynx/privacy                   |     10 |     1 |
| packages/ratelimit                | @stynx/ratelimit                 |     11 |     3 |
| packages/sessions                 | @stynx/sessions                  |     11 |     2 |
| packages/storage                  | @stynx/storage                   |      7 |     3 |
| packages/stynx-backend            | @stech/stynx-backend             |     50 |     0 |
| packages/stynx-contracts          | @stech/stynx-contracts           |      9 |     0 |
| packages/stynx-frontend-client    | @stech/stynx-frontend-client     |      7 |     0 |
| packages/stynx-frontend-contracts | @stech/stynx-frontend-contracts  |      3 |     0 |
| packages/tenancy                  | @stynx/tenancy                   |     12 |     4 |
| packages/testing                  | @stynx/testing                   |      8 |     1 |
| packages-web/angular              | @stynx-web/angular               |     13 |     1 |
| packages-web/angular-auth         | @stynx-web/angular-auth          |     14 |     1 |
| packages-web/angular-i18n         | @stynx-web/angular-i18n          |      7 |     1 |
| packages-web/angular-profile      | @stynx-web/angular-profile       |      4 |     1 |
| packages-web/angular-sessions     | @stynx-web/angular-sessions      |      3 |     1 |
| packages-web/angular-storage      | @stynx-web/angular-storage       |      6 |     1 |
| packages-web/angular-trash        | @stynx-web/angular-trash         |      3 |     1 |
| packages-web/angular-ui           | @stynx-web/angular-ui            |      8 |     1 |
| packages-web/sdk                  | @stynx-web/sdk                   |     17 |     1 |
| apps/reference-api                | @stynx/reference-api             |     15 |     2 |
| apps/reference-frontend           | @stech/reference-frontend        |     12 |     0 |
| apps/reference-web                | @stynx/reference-web             |     23 |     1 |
| tools/eslint-config               | @stynx-internal/eslint-config    |      0 |     0 |
| tools/migration-linter            | @stynx-internal/migration-linter |      7 |     1 |
| tools/tsconfig                    | @stynx-internal/tsconfig         |      0 |     0 |
| test/backend                      | stynx-backend-tests              |      0 |     5 |
| test/db                           | stynx-db-tests                   |      0 |     3 |
| test/packages                     | stynx-package-tests              |      0 |    19 |
| test/scripts                      | stynx-script-tests               |      0 |     0 |
| backend                           | stynx-backend                    |     44 |     0 |
| bootstrap                         | stynx-bootstrap                  |      0 |     0 |
| frontend                          | stynx-frontend                   |     29 |     0 |
| docs                              | docs                             |      0 |     0 |

(Several workspaces show `tests=0` because their tests live in the
dedicated `test/*` tier rather than co-located — this is intentional repo
architecture, not a coverage gap.)

## Cleanliness signals (the "surprisingly clean" baseline)

| Signal                                                             | Result                                                                                                                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint:deadcode` (knip)                                        | **0 issues** (`{"issues":[]}`)                                                                                                                                                    |
| `pnpm lint:deps` (depcheck)                                        | **0 issues** ("No depcheck issue")                                                                                                                                                |
| `it.only` / `fit` / `describe.only` / `fdescribe` in tracked tests | **0**                                                                                                                                                                             |
| `it.skip` / `xit` / `describe.skip` in tracked tests               | **0**                                                                                                                                                                             |
| `TODO` / `FIXME` / `XXX` / `HACK` markers in tracked source        | **4** total — all in `packages/cli/src/adopt.ts`, `packages/cli/test/cli.spec.ts`, `scripts/stynx-doctor.mjs`, all intentional `'TODO' + '_PERMISSION'` sentinels (not real debt) |
| Workspace tsconfig drift                                           | **1** file (`infra/cdk/tsconfig.json`) does not extend a `tools/tsconfig` preset; remaining 44 do                                                                                 |
| Workspaces missing `build` script                                  | **5** (test/\* tier + tools/eslint-config + tools/tsconfig + docs lint) — all by design                                                                                           |
| Eslint config files in workspaces                                  | **1** root (`eslint.config.mjs`)                                                                                                                                                  |
| Package script consistency                                         | High — every publishable package has `build`/`lint`/`test`; missing scripts match workspace role (test-tier has no build, tools/eslint-config & tools/tsconfig are config-only)   |

## Knip ignore-list size (curated dead-code suppressions)

`knip.config.ts` declares 18 ignored files (entry-points knip can't see) and
3 module-scoped ignored issues. This is a maintenance surface — every entry
warrants periodic re-validation. **Source line count of `knip.config.ts`: 65.**

## Root-level layered files (potential doc-debt source)

| File                                         | Lines | Nature                                             |
| -------------------------------------------- | ----: | -------------------------------------------------- |
| `PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES.md` |   248 | One-shot agentic prompt left at root               |
| `README.md`                                  |    99 | Project README                                     |
| `TODO.md`                                    |    20 | 5 open prompt-tracking items                       |
| `AGENTS.md`                                  |    27 | Agent guidance                                     |
| `SUMMARY.md`                                 |    14 | Frozen commit-summary log from one historical task |
| `GOVERNANCE.md`                              |     3 | Stub                                               |
| `package.json`                               |    83 | —                                                  |

## Tracked transient/coordination directories

| Dir                |                       Tracked file count | Disposition                                               |
| ------------------ | ---------------------------------------: | --------------------------------------------------------- |
| `patches/`         |                        15 `.patch` files | Mailbox export from one historical patch series           |
| `.codex/`          |                     8 (prompts + skills) | Agent prompt library                                      |
| `.release/drafts/` |            25 (one per package + README) | Per-package release-note drafts                           |
| `.changeset/`      | 3 (config, status.json, v1-release-prep) | `status.json` is a generated file (`pnpm release:status`) |
| `audit/`           |               1 (`REPO-GAP-ANALYSIS.md`) | Audit-stream artifact (out of scope per R4)               |
| `src/`             |                           1 (`.gitkeep`) | Vestigial empty placeholder                               |

## Untracked working-tree directories (local dev artifacts only)

These are NOT in `git ls-files` — they're local outputs/caches. Listed for
completeness; `.gitignore` already excludes them, so they're not a cleanup
target unless polluting workflow surface.

| Dir                    | Notes                         |
| ---------------------- | ----------------------------- |
| `.tmp-tsconfig-smoke/` | tsconfig smoke-test workspace |
| `.toolchain/`          | Local Node toolchain dir      |
| `.agent/tmp/`          | Agent temp dir                |
| `.pnpm-store/`         | pnpm content-addressed store  |
| `.turbo/`              | Turborepo cache               |

## Open dependabot PRs (off-repo backlog signal)

`origin` carries **27 open `dependabot/*` branches**, mostly version bumps.
Not local entropy, but a maintenance signal — see CLEAN-018.

## Spec corpus (load-bearing per R4 — do not touch)

| Type                   | Count | Files                                                                                                                                    |
| ---------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GAP specs              |     7 | `GAP-000` … `GAP-006`                                                                                                                    |
| ADRs                   |     2 | `STYNX-ADR-001-soft-delete`, `STYNX-ADR-002-perms-caching`                                                                               |
| Spec / API / migration |     6 | `STYNX-SPEC-v0.6`, `STYNX-API-DATA`, `STYNX-CDK-SKELETON`, `STYNX-CODEX-PROMPTS`, `STYNX-ADOPT-EXAMPLE`, `STYNX-REFERENCE-MIGRATION.sql` |

## Deferred metrics (not captured in this pass)

| Metric                            | Why deferred                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm -r build` runtime           | Heavy command across 35+ workspaces; would dominate session budget. Capture in a follow-up baseline run.                                                           |
| `pnpm -r typecheck` runtime       | Same as above; covered by CI.                                                                                                                                      |
| `pnpm -r test` runtime            | Same.                                                                                                                                                              |
| `cloc .` LOC by language          | `cloc` not installed locally; counts approximated via `git ls-files` + extension census above. Run `pnpm dlx cloc .` in a follow-up if a precise number is needed. |
| `madge --circular`                | Not run in this pass; no circular-dep symptoms surfaced via knip/depcheck/builds, so left for the cycle-specific cleanup wave.                                     |
| `jscpd` clusters                  | Not run in this pass; manual scan surfaced no glaring duplication. Recommended to run during Wave 2 prep.                                                          |
| `pnpm audit --prod --json`        | Not run in this pass to avoid network calls; covered by `hardening.yml` workflow.                                                                                  |
| Bundle sizes for `packages-web/*` | Out of scope for rationalization-only inspection.                                                                                                                  |
| Cyclomatic complexity hotspots    | Out of scope.                                                                                                                                                      |

## High-churn files (last 6 months)

Top churn is concentrated in **package.json files** (3 commits each across
~33 manifests — predominantly dependabot bumps) and **CI workflows** —
`.github/workflows/hardening.yml` (5 commits), `.github/workflows/release-artifacts.yml`
(3), `.github/workflows/docs.yml` (3). No source-code hotspot exceeded 3
commits in 6 months, suggesting the _implementation_ surface has stabilized
even while CI/release machinery iterates.
