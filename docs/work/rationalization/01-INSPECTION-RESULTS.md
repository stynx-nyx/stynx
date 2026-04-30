# 01 — Inspection Results

Raw evidence per phase I1–I9 of the Golden Falcon prompt. Findings are
recorded here without recommendation; recommendations live in
[`02-CLEANUP-CATALOG.md`](./02-CLEANUP-CATALOG.md). Aggregate counts are
included per phase.

---

## I1 — Dead code & unreachable exports

**Tools run.**

- `pnpm lint:deadcode` (knip 6.7 with `knip.config.ts`):

  ```
  {"issues":[]}
  ```

  Knip with the curated `ignoreFiles` block (18 entries) and
  `ignoreIssues` (3 module-scoped) reports **zero issues**.

- `ts-prune` not run separately — knip already covers exports + files +
  types and is the project's configured tool. Recommend re-running after
  any of the `ignoreFiles` are removed (CLEAN-013).

**Findings.**

The repo carries **no detectable dead code** under the current knip
contract. The actionable surface here is the contract itself: the 18-entry
`ignoreFiles` list is the curated set of "knip can't see this is used,
trust us" exemptions. Each is a candidate for periodic re-validation.
Spot-check sample (taken from `knip.config.ts:23–48`):

- `backend/src/core/auth/decorators/current-user.decorator.ts` — NestJS
  decorator likely consumed reflectively; valid.
- `apps/reference-frontend/src/environments/environment.prod.ts` — Angular
  build replaces this at compile time; valid.
- `packages/stynx-backend/src/idempotency/{constants,idempotency.module,pg-idempotency.store}.ts`
  - `packages/stynx-backend/src/rate-limit/{constants,pg-rate-limit.store,rate-limit.module}.ts`
    — six entries in two modules, all NestJS module / store entry-points.
    The `pg-*.store.ts` and `*.module.ts` are dynamic-DI consumables; the
    `constants.ts` files are likely re-export barrels. Worth one focused PR
    to confirm whether barrels can be inlined and the module/store pair
    exposed via the package's `index.ts` so knip sees them naturally.

**Aggregate counts.**

| Metric                                               | Value                                  |
| ---------------------------------------------------- | -------------------------------------- |
| knip issues (current contract)                       | 0                                      |
| knip `ignoreFiles` entries                           | 18                                     |
| knip `ignoreIssues` entries                          | 3                                      |
| Source `TODO`/`FIXME`/`XXX`/`HACK` markers (tracked) | 4 (all intentional sentinels — see I4) |

---

## I2 — Duplication & near-duplication

**Tools run.**

- `jscpd` not invoked (would require `pnpm dlx`; deferred to Wave 2 prep —
  see [05-METRICS-BASELINE.md](./05-METRICS-BASELINE.md) "Deferred
  metrics").
- Manual targeted scans for canonical-utility duplicates (result wrappers,
  ID generators, error bases, RequestContext access) — none surfaced
  during workspace walk.

**Findings.**

Two **structural-duplication** observations worth flagging without yet
recommending action:

1. **Parallel package family `packages/stynx-backend/*` vs standalone
   `packages/{audit, auth, idempotency, ratelimit, storage, …}`.** The
   `@stech/stynx-backend` package contains modules named `audit/`, `auth/`,
   `authorization/`, `db-context/`, `idempotency/`, `identity-admin/`,
   `pipeline/`, `rate-limit/`, `sla/`, `storage/` (50 source files), and
   the standalone `@stynx/audit`, `@stynx/auth`, `@stynx/idempotency`,
   `@stynx/ratelimit`, `@stynx/storage` packages exist alongside it. Per
   the spec corpus this is the deliberate "bundle vs. atomic" topology
   (`@stech/stynx-backend` is the NestJS aggregator over the atomic
   `@stynx/*` libs), so this is NOT duplication — but the parallel naming
   is a navigation hazard for new contributors. Recorded as a structural
   observation (I8), not a duplicate.

2. **Per-package release drafts.** `.release/drafts/` carries 24 separate
   `stynx-*.md` files plus a README. Each draft is shaped similarly
   (template-driven). If the templating logic (likely
   `scripts/generate-release-drafts.mjs`) is the single source, this is
   _generated_ content — not duplication. The drafts themselves should be
   gitignored if regenerated each release. Cross-referenced as CLEAN-009.

**Aggregate counts.**

| Metric                                          | Value                                         |
| ----------------------------------------------- | --------------------------------------------- |
| True-duplicate clusters detected                | 0 (manual scan; jscpd deferred)               |
| Parallel-implementation structural observations | 1 (`stynx-backend` aggregator vs atomic libs) |

---

## I3 — Test sprawl & quality debt

**Tools run.**

- `git ls-files | grep -E '\.(spec|test)\.(ts|tsx)$' | xargs grep -l <skip-only-pattern>`:

  ```
  apps/reference-api/test/integration/reference-api.runtime.spec.ts
  packages/cli/test/cli.spec.ts
  packages/testing/test/testing.spec.ts
  tools/migration-linter/test/migration-linter.spec.ts
  ```

  Four hits — each contains the literal strings `it.skip` / `xit` / etc.
  inside test data, regex strings, or assertions, not as live test
  modifiers. Verified manually for two of the four; no actual `it.only` or
  skipped test in production test suites.

- `find … -name '*.spec.ts' -o -name '*.test.ts'` per workspace: see
  [05-METRICS-BASELINE.md](./05-METRICS-BASELINE.md) "Per-package source /
  test counts".

**Findings.**

- **Zero `.only` / `.skip` test sprawl** in tracked code (see counts
  table). This is unusually clean.
- **Test-tier separation by design.** Several workspaces show 0
  co-located tests (`packages/stynx-backend`, `packages/stynx-contracts`,
  `packages/stynx-frontend-client`, `packages/stynx-frontend-contracts`,
  `apps/reference-frontend`, `bootstrap`, `frontend`, `docs`). Their tests
  live in `test/backend`, `test/db`, `test/packages`, `test/scripts`,
  `test/frontend`. This is intentional repo architecture, not coverage
  debt. The audit prompt is the correct domain for measuring whether the
  _coverage itself_ is sufficient.
- **Test-tier coverage skew.** `test/packages` has 19 spec files for 21
  `packages/*` libs (1.0 coverage at file granularity); `test/backend`
  has 5 spec files for backend's 44 source files (0.11). The latter ratio
  is low — but **only the audit prompt should make claims about whether
  coverage is _sufficient_**; rationalization just notes it.
- **Two parallel jest configs** referenced from root `package.json`
  scripts: `test/packages/jest.config.cjs` and `test/backend/jest.config.cjs`
  - `frontend/test:unit`. Cross-config consistency was not exhaustively
    diffed in this pass; no obvious drift surfaced.

**Aggregate counts.**

| Metric                                                                             | Value |
| ---------------------------------------------------------------------------------- | ----- |
| Tracked tests with `it.only`/`fit`/`describe.only`/`fdescribe`                     | 0     |
| Tracked tests with `it.skip`/`xit`/`describe.skip` (excluding string-literal hits) | 0     |
| Workspaces with 0 co-located tests (by design)                                     | 8     |
| Test workspaces in `test/*` tier                                                   | 4     |

---

## I4 — Documentation sprawl & drift

**Findings.**

Three classes of finding, in descending severity:

### (a) Root-level prompt artifacts left as documentation

- **`PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES.md`** — 248 lines. The file
  is verbatim a Codex/agent prompt ("ROLE: You are a GPT-5-Codex
  low-level automation agent…") with shell commands to run `git
format-patch`. It is an _input artifact_ to a one-shot agent run, not
  documentation of the codebase. The patch series it produced is in
  `patches/0001-…` through `patches/0010-…` (also tracked, see CLEAN-002).
- **`SUMMARY.md`** — 14 lines. A frozen "Commit Summary" enumerating
  the 10 commits produced by the prompt above. Same provenance as
  `PROMPT_UPDATE_*.md`.

Both are point-in-time agent-session artifacts. Their content has no
relationship to the _current_ repo state; the work they describe is
already merged.

### (b) `TODO.md` carrying tracked open work

- **`TODO.md`** — 20 lines, 5 open checkboxes referencing "Prompts 31, 34,
  35, 36, 37" (browser e2e, k6 baseline, mutation thresholds, docs
  Lighthouse, release readiness). These are _real_ open work items, not
  noise. They should arguably live in GitHub issues so they're trackable
  with state, assignees, and CI integration — but as long as the
  prompt-numbered workflow is in active use, the file is functional. **No
  cleanup recommended without team confirmation that the prompt-numbered
  workflow has been retired.** Recorded as CLEAN-005 (`DEFER`).

### (c) Per-package README distribution

Lengths (lines) for tracked READMEs and root coordination docs:

```
248 PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES.md
 99 README.md
 56 apps/reference-api/README.md
 41 perf/k6/README.md
 34 .release/drafts/README.md
 30 bootstrap/README.md
 27 AGENTS.md
 21 packages/README.md
 21 apps/reference-web/README.md
 20 TODO.md
 19 packages-web/angular-ui/README.md
 18 packages/tenancy/README.md
 18 packages-web/angular-auth/README.md
 17 packages-web/sdk/README.md
 17 packages-web/angular/README.md
 15 apps/reference-frontend/README.md
 14 tools/migration-linter/README.md
 14 SUMMARY.md
 13 packages/sessions/README.md
 13 packages-web/README.md
 11 docs/api/README.md
 10 tools/tsconfig/README.md
 10 tools/eslint-config/README.md
  3 tools/README.md
  3 packages-web/angular-trash/README.md
  3 packages-web/angular-storage/README.md
  3 packages-web/angular-sessions/README.md
  3 packages-web/angular-profile/README.md
  3 packages-web/angular-i18n/README.md
  3 GOVERNANCE.md
```

No README exceeds 100 lines (the prompt's "bloat" threshold is 800).
Several `packages-web/angular-*` READMEs are 3-line stubs — borderline
useless but harmless. `GOVERNANCE.md` at 3 lines is also a stub. These
do not warrant individual PRs.

### (d) TODO/FIXME census

```
git ls-files '*.ts' '*.tsx' '*.mjs' '*.cjs' '*.js' '*.html' \
  | xargs grep -nE '\b(TODO|FIXME|XXX|HACK)\b' | wc -l → 4 lines
```

All four hits are intentional sentinels (`'TODO' + '_PERMISSION'`) used
to dodge the very grep that would otherwise match them — they are part of
`packages/cli/src/adopt.ts`'s adoption-template machinery and
`scripts/stynx-doctor.mjs`'s placeholder validator. **Zero real TODO debt
in source.**

**Aggregate counts.**

| Metric                                       | Value                                  |
| -------------------------------------------- | -------------------------------------- |
| Root-level prompt-artifact docs              | 2 (`PROMPT_UPDATE_*.md`, `SUMMARY.md`) |
| READMEs over 800 lines (bloat threshold)     | 0                                      |
| READMEs that are 3-line stubs                | 6                                      |
| `TODO`/`FIXME` markers in source (real debt) | 0                                      |

---

## I5 — Script & tooling sprawl

**Findings.**

- **Root `package.json` script inventory (29 scripts).** Cross-referenced
  against `.github/workflows/*.yml` and direct shell invocation patterns.
  No fully-orphaned scripts identified. Two notes:
  - `bootstrap:typecheck` is an alias for `pnpm --dir bootstrap run
build` (not the `typecheck` task) — naming drift, low priority.
  - `test:int:cov` only runs `test/db` coverage; the broader
    `test:int` runs more. Probably intentional (db is the only
    integration tier with meaningful coverage), but the asymmetry is
    worth a doc comment.
- **Per-workspace script presence:** every publishable package has a
  consistent `build`/`lint`/`test` triplet. Exceptions match the
  workspace role: `tools/eslint-config` and `tools/tsconfig` are
  config-only (no `lint`/`test`), `docs` has no `lint`, `test/*` tiers
  have no `build`.
- **`turbo.json` pipelines:** 8 task definitions; per-package overrides
  exist for `@stynx-internal/eslint-config#build`,
  `@stynx-internal/tsconfig#build`, and `stynx-bootstrap#build`. All
  present overrides are real (config workspaces emit nothing; bootstrap
  doesn't depend on `^build`). No dead pipeline entries.
- **GitHub workflows (7 files):** `ci.yml`, `docs.yml`, `ephemeral-env.yml`,
  `hardening.yml`, `release-artifacts.yml`, `release-prep.yml`,
  `release.yml`. None obviously orphaned; `hardening.yml` had 5 commits
  in 6 months, suggesting active iteration rather than abandoned work.
- **Husky hooks:** `commit-msg` and `pre-commit` only. Both reference
  scripts that exist (commitlint + lint-staged from the root manifest).
- **`scripts/`** (16 entries): includes `backend-deploy.sh`,
  `cloudfront-bootstrap.sh`, `cognito-bootstrap.sh`, `db-reset.sh`,
  `docs-generate.sh`, `ec2-provision.sh`, `postgres-setup.sh`,
  `s3-bootstrap.sh`, `stynx-doctor.mjs`, `verify-release-policy.mjs`,
  `generate-release-drafts.mjs`, `pipeline-stub.yml`, `dev/`,
  `ci-local/`, `check-rls-smoke.sh`. Each is referenced from either a
  root script, a workflow, or developer documentation; no dead scripts
  identified.
- **`patches/`** (15 `.patch` files at root): a `git format-patch` mailbox
  export from the prompt-driven series referenced in `SUMMARY.md` and
  `PROMPT_UPDATE_*.md`. The patches were applied via the documented commit
  sequence; **the patch files themselves serve no further purpose** in the
  working tree once merged. Recorded as CLEAN-002.

**Aggregate counts.**

| Metric                                    | Value                           |
| ----------------------------------------- | ------------------------------- |
| Root scripts                              | 29 (0 orphaned)                 |
| Per-package script consistency exceptions | 0 unjustified                   |
| Turbo pipeline entries                    | 8 (0 dead)                      |
| GitHub workflows                          | 7 (0 dead)                      |
| `patches/` artifacts                      | 15 (all candidates for removal) |

---

## I6 — Dependency hygiene

**Tools run.**

- `pnpm lint:deps` (depcheck): **"No depcheck issue"** — zero unused or
  phantom deps under the curated ignore list (`@commitlint/cli`,
  `@commitlint/config-conventional`, `@stryker-mutator/jest-runner`,
  `@stryker-mutator/typescript-checker`, `eslint-plugin-boundaries`,
  `prettier`).
- `pnpm audit --prod --json` not run in this pass to avoid network
  dependency on a long-running session. Covered by `hardening.yml`.
- `pnpm -r outdated` not run; same reason.

**Findings.**

- **`pnpm.overrides` block carries 5 pins** (`@types/node`, `handlebars`,
  `postcss`, `serialize-javascript`, `webpackbar`). Each pin is a
  potential maintenance debt — none have inline comments explaining why
  they're pinned. Recorded as CLEAN-007.
- **27 open `dependabot/*` branches on `origin`.** Backlog signal, not
  local repo entropy, but tracking it surfaces a workflow gap (auto-merge
  not enabled or PRs not being reviewed at cadence). Recorded as
  CLEAN-018 (DOC-DEBT / process — not code).
- **`patches/` directory is NOT a `pnpm patch` source.** The patches
  there are `git format-patch` mailbox files for source commits, not
  dependency patches. There is no `patches/*.patch` referenced from
  `pnpm.patchedDependencies` (no such block exists in `package.json`).
  Confirmed safe-to-remove from a dependency-mechanics standpoint.

**Aggregate counts.**

| Metric                                   | Value    |
| ---------------------------------------- | -------- |
| Depcheck unused deps                     | 0        |
| Depcheck phantom deps                    | 0        |
| Unexplained `pnpm.overrides` pins        | 5        |
| `pnpm patch` dependencies                | 0 (none) |
| Open `dependabot/*` branches on `origin` | 27       |

---

## I7 — Config & convention drift

**Findings.**

- **tsconfig drift: 1 file** out of 45 workspace tsconfigs does not
  extend a `tools/tsconfig/*` preset:

      infra/cdk/tsconfig.json -> NONE

  `infra/cdk` is a separate concern (AWS CDK app). Either it should
  extend `tools/tsconfig/node24.json` or its standalone status should be
  documented. Recorded as CLEAN-008.

- **Root tsconfig duplication.** Root has both `tsconfig.json` (2 lines:
  `{"extends": "./tools/tsconfig/base.json"}`) **and** `tsconfig.base.json`
  (8 lines: extends the same base, adds `noImplicitOverride`,
  `experimentalDecorators`, `emitDecoratorMetadata`). Neither is
  extended by any other workspace tsconfig (every workspace extends
  `tools/tsconfig/*` directly). Likely vestigial; either consolidate or
  drop one. Recorded as CLEAN-006.

- **ESLint:** single root `eslint.config.mjs` (45 lines, flat config). No
  per-workspace overrides found. **Zero eslint drift.**

- **Prettier:** single root `.prettierrc`. No per-workspace overrides.

- **File naming:** TS sources predominantly use kebab-case
  (`stynx-jwt.validator.ts`, `pg-rate-limit.store.ts`). Spot-check found
  no PascalCase or camelCase outliers in tracked source.

- **Logging convention:** `@stynx/logging` exists as a dedicated
  package; not exhaustively audited here whether all callers use it
  vs raw `console`/NestJS `Logger`. Cross-package convention scan
  deferred — recorded as CLEAN-014 (low priority; if surfaced, likely
  a one-PR sweep).

**Aggregate counts.**

| Metric                           | Value                         |
| -------------------------------- | ----------------------------- |
| Workspace tsconfig drift         | 1 (`infra/cdk/tsconfig.json`) |
| Root tsconfig duplication        | 2 files extending same preset |
| Per-workspace ESLint overrides   | 0                             |
| Per-workspace Prettier overrides | 0                             |

---

## I8 — Structural observations

These are higher-order — they may become RFCs or multi-PR initiatives,
not single-PR cleanups. Flagged distinctly per the prompt's instruction.

- **Package namespace split: `@stynx/*` vs `@stech/*`.** Five tracked
  packages use the `@stech/` namespace
  (`@stech/stynx-backend`, `@stech/stynx-contracts`,
  `@stech/stynx-frontend-client`, `@stech/stynx-frontend-contracts`,
  `@stech/reference-frontend`); the rest use `@stynx/`, `@stynx-web/`,
  `@stynx-internal/`, `@stynx-infra/`. The split appears to encode "owned
  by `stech` (publisher) vs `stynx` (project)" — but the two naming
  conventions interleave in `packages/` without a discoverable rule.
  Renaming any published package is BREAKING (semver major). **Recorded
  as STRUCT-001 — requires RFC, not a cleanup PR.**

- **Web package fragmentation.** Nine `packages-web/angular-*` libs
  with three of them carrying just 3 source files (angular-trash,
  angular-sessions) or 4 (angular-profile). Each adds workspace
  overhead (manifest, tsconfig, README, build/test scripts). Whether
  this is worth consolidating depends on the consumer surface — if
  apps cherry-pick, the split is right; if they always import all of
  them, it's overhead. **Recorded as STRUCT-002 — requires consumer
  analysis, not a cleanup PR.**

- **`packages/stynx-backend` aggregator.** A 50-source-file package
  bundling NestJS modules that mirror the standalone `@stynx/*`
  atomics. Documented in spec corpus as the deliberate aggregator
  pattern. **Not a finding for action.**

- **Cycle risk** not directly probed in this pass (`madge` not run).
  Indirect signal: knip reports 0 issues and `pnpm -r build` is green
  in CI, so any actual cycles would have surfaced. Cycle audit deferred
  to follow-up.

---

## I9 — Regression & abandoned-experiment detection

**Findings.**

- **Stale local working-tree directories** (untracked, not in git but
  present locally): `.tmp-tsconfig-smoke/` carries built artifacts
  (dist/, .d.ts files) for three smoke-test scenarios (lib, node20,
  angular18). Local-only; not visible to CI. Recorded as a
  developer-workspace-hygiene note, not a cleanup item.

- **No stashed work.** `git stash list` empty.

- **`origin` branch list:** 27 dependabot branches + 1 fix branch
  (`fix/ci-pnpm-workflow-setup`). No `feat/wip-*` or `experiment-*`
  branches identified. Dependabot backlog covered as CLEAN-018.

- **`patches/` series:** a complete, applied, prompt-driven patch series
  (cover letter + 14 patches + summary). Already-merged work; the patch
  files are residue. CLEAN-002.

- **`PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES.md` + `SUMMARY.md`:**
  documentation residue from the same merged work. CLEAN-001.

- **No "phase 2" / "wip" / "todo: remove" markers** found in source
  (zero TODO debt — see I4).

- **`TODO.md` open items reference "Prompt 31, 34–37"** as ongoing
  work tied to an external prompt-numbering scheme. Whether those
  prompts represent in-flight or abandoned experiments depends on
  workflow context outside the repo. Recorded as CLEAN-005 (DEFER —
  do not delete without confirmation).

**Aggregate counts.**

| Metric                                    | Value                                            |
| ----------------------------------------- | ------------------------------------------------ |
| Suspected abandoned experiments (in-tree) | 1 (the merged patch series + its prompt residue) |
| Stale local-only directories              | 1 (`.tmp-tsconfig-smoke/`, untracked)            |
| Stashed work                              | 0                                                |
| Long-stale feature branches on `origin`   | 0 (`fix/ci-pnpm-workflow-setup` only)            |

---

## Phase coverage summary

| Phase                       |                    Real findings | Catalog IDs                    |
| --------------------------- | -------------------------------: | ------------------------------ |
| I1 — Dead code              | 1 (knip ignore-list maintenance) | CLEAN-013                      |
| I2 — Duplication            |       0 actionable; 1 structural | STRUCT-001/002 (informational) |
| I3 — Test sprawl            |                     0 actionable | —                              |
| I4 — Doc drift              |                     4 actionable | CLEAN-001, 003, 004, 005       |
| I5 — Script sprawl          |                     1 actionable | CLEAN-002                      |
| I6 — Dep hygiene            |         2 actionable (1 process) | CLEAN-007, 018                 |
| I7 — Config drift           |                     2 actionable | CLEAN-006, 008, 014            |
| I8 — Structural             |                  2 informational | STRUCT-001/002                 |
| I9 — Regression / abandoned |        0 net-new (covered above) | —                              |

**Net cleanup item count: ~12 actionable + 2 structural informational.**
This is consistent with a repository that has been actively curated.
