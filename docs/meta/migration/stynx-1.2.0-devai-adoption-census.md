# STYNX 1.2.0 — DEVAI adoption migration census

**Status:** BLOCKED — `@aarusso-nyx/devai@1.5.0` is not published.
**Role declared:** Architect (analysis and `law/`, `docs/meta/` authorship only).
**Base:** `main` @ `75f8d49fba0f2418c310b62d98f50f796a33002e`, tree `c526b93ef26bc5f9946dba19749a5268b9d2abff`.
**Branch:** `codex/stynx-1.2.0-migration-census`.

This document is the preservation census required before any governance removal.
No governance file has been removed. No adoption has been performed.

## 1. Upstream blocker

The migration target does not exist on the resolving registry.

| Fact               | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Package            | `@aarusso-nyx/devai`                                                                                    |
| Requested version  | `1.5.0`                                                                                                 |
| Resolving registry | `https://npm.pkg.github.com` (scoped via `.npmrc`)                                                      |
| Published versions | 29, ending at `1.4.5`                                                                                   |
| `dist-tags.latest` | `1.4.5`                                                                                                 |
| `1.5.0` present    | **no**                                                                                                  |
| Currently pinned   | `1.4.5`                                                                                                 |
| `1.4.5` integrity  | `sha512-5XuNGqbiqRGx+3MJOlO9VdJoKwX5MZ9a1BxdX/APUeD/j48CgtLwf5hNyxDkujxexekNn5TGSLUmU7aki2LTeQ==`       |
| `1.4.5` tarball    | `https://npm.pkg.github.com/download/@aarusso-nyx/devai/1.4.5/1d5aa3fc8748a3ac7c2150750f60803c0b357b86` |

Reproduction (cache-bypassing):

    npm view @aarusso-nyx/devai@1.5.0 version --prefer-online
    # npm error code E404 — No match found for version 1.5.0
    npm view @aarusso-nyx/devai version --prefer-online
    # 1.4.5

The migration brief requires pinning exactly `1.5.0` and forbids `latest`, a
range, workspace linking, a sibling checkout, a local tarball, or copied
internals. Every available substitute is therefore excluded by the brief, and
substituting `1.4.5` is an Owner decision, not an implementation choice.

## 2. Baseline populations (must not regress)

| Measure                                    | Baseline                                                 |
| ------------------------------------------ | -------------------------------------------------------- |
| Tracked files                              | 2460                                                     |
| Test files (`*.spec.*` / `*.test.*`)       | 379                                                      |
| Declared test cases (static)               | 2840                                                     |
| Assertions (static `expect(` / `assert.`)  | 9436                                                     |
| Mutation packages (`stryker.conf.mjs`)     | **38** — matches expected roster                         |
| Shared mutation base                       | `tools/stryker/base.mjs` (not a target)                  |
| Per-package vitest mutation configs        | 19                                                       |
| ADR files                                  | 28 (27 ADRs + `README.md`)                               |
| Invariants                                 | 10 `INV-*` + `RBAC-001-allowlist.json`                   |
| Security / RLS / tenancy / RBAC test files | 198                                                      |
| `test/db` files                            | 21                                                       |
| Pre-existing conditional skips             | 5 (all `describe.skip` behind `isVeraPdfDockerUsable()`) |

Coverage thresholds (`.devai/config/thresholds.json`): lines 70, branches 60,
functions 70, statements 70. Mutation: `score_min` 60, `survived_max` 50.
Lint and typecheck: zero errors, zero warnings.

The 5 Docker-gated skips are pre-existing and are the standing NOT VERIFIED
surface. They are a baseline to preserve, not a licence to add more.

## 3. Mutation roster — 38 packages verified

`packages/`: audit, auth, backend, cli, contracts, core, data, flow, health,
i18n, idempotency, jobs, logging, mobile-runtime, notifications, offline-sync,
outbox, preferences, privacy, ratelimit, sessions, storage, tenancy, testing,
worklist (25).

`packages-web/`: angular, angular-audit, angular-auth, angular-flow,
angular-i18n, angular-iam, angular-profile, angular-sessions, angular-storage,
angular-tenancy, angular-trash, angular-ui, sdk (13).

Total 25 + 13 = **38**. No discrepancy against the expected count.

## 4. Classification

### 4.1 Generic governance — remove and replace with DEVAI (class 2)

| Path                                             | LOC  | Responsibility                                  |
| ------------------------------------------------ | ---- | ----------------------------------------------- |
| `scripts/run-mutation-evidence.mjs`              | 2068 | mutation aggregation, composition, reuse engine |
| `scripts/lib/mutation-evidence.mjs`              | 1091 | evidence composition internals                  |
| `scripts/devai-local-rc.mjs`                     | 314  | local RC orchestration (`prepare`, `publish`)   |
| `scripts/verify-devai-trace.mjs`                 | 168  | direct verifier invocation                      |
| `scripts/lib/devai-local-rc.mjs`                 | 17   | RC shim                                         |
| `scripts/verify-mutation-roster.mjs`             | 24   | roster verification driver                      |
| `.github/workflows/devai-local-rc-verify.yml`    | 320  | local RC verification job                       |
| `.github/workflows/devai-main-observation.yml`   | 178  | main-branch observation job                     |
| `law/policy/release-campaign-1.1.1.json`         | 272  | candidate-specific campaign logic               |
| `law/policy/stynx-1.1.1-mutation-reuse.json`     | 698  | candidate-specific reuse grants                 |
| `law/schemas/release-campaign-1.1.1.schema.json` | 340  | campaign schema                                 |
| `law/policy/devai-local-rc-environment.json`     | 18   | RC environment pin                              |
| `law/policy/devai-local-rc-toolchain.json`       | 7    | RC toolchain pin                                |
| `law/policy/devai-local-rc-trust-store.json`     | 10   | RC trust store                                  |

Script subtotal 3682 LOC; policy/schema subtotal 1345 LOC; workflow subtotal
498 LOC. **5525 LOC** of candidate generic governance.

### 4.2 Mixed — extract the product requirement, retire the machinery (class 3)

- `scripts/lib/mutation-roster.mjs` (327 LOC). The **roster declaration**
  (38 packages, per-package thresholds, capability mapping) is STYNX-owned and
  must survive as declarative data. The verification/canonicalisation engine
  around it is DEVAI-owned and is removed.
- `law/trace.json` (3741 lines). Historical trace; must be retired as active
  authority while its accepted bytes are preserved as inactive history.
- `law/adr/2026-08-16-trusted-local-rc-evidence.md` and
  `law/adr/2026-08-24-stynx-1.1.1-campaign-controls.md` — governance decisions
  to retire explicitly through the supported ADR mechanism.
- `law/adr/2026-05-19-test-gate-tiers.md`,
  `law/adr/2026-05-21-mutation-thresholds-tiered.md`,
  `law/adr/2026-06-11-test-taxonomy.md` — embed still-valid product thresholds
  and the privacy package test-tier partition. Extract before retiring.

### 4.3 Product — preserve unchanged (class 1)

Classified by responsibility, not filename. These are product scripts despite
`verify-`/`devai`-shaped names:

`check-rls-smoke.sh`, `verify-rls-negative.mjs`, `verify-db-acceptance.mjs`,
`db-reset.sh`, `db-verify.mjs`, `list-ddl-objects.mjs`, `list-routes.mjs`,
`verify-openapi-contract.mjs`, `verify-public-api-baselines.mjs`,
`verify-api-coverage.mjs`, `verify-sdk-route-smoke.mjs`,
`verify-consumer-fixtures.mjs`, `verify-frontend-a11y-gate.mjs`,
`verify-frontend-production.mjs`, `verify-web-sourcemaps.mjs`,
`verify-stynx-boundary.ts`, `verify-secret-scan.mjs`,
`verify-license-policy.mjs`, `perf-smoke.mjs`, `gen-aspect-grid.mjs`,
`gen-schema-browser.mjs`, `generate-package-readmes.mjs`, `generate-sbom.mjs`.

Plus all 38 `stryker.conf.mjs`, all 19 `vitest.stryker.config.ts`,
`tools/stryker/base.mjs`, `test-tasks.json`, the 10 invariants, the 22 product
ADRs, and every `packages/`, `packages-web/`, `db/`, `domain/`, `reference/`,
`test/` file.

### 4.4 Historical records — preserve as inactive (class 4)

`.devai/state/audit-observations/**` (2 observation sets),
`.devai/state/rgr/`, `.devai/state/round-runs/`, `.devai/state/triage/`,
`MUTATION_AUDIT_2026-05-19.md`. Preserved; must not confer current authority.

### 4.5 Untouched (class 5)

`tmp/` (user-owned), `packages/cli/tests/` (untracked), all 57 historical
`.devai/worktrees/*` and their evidence stores.

## 5. Tests coupled to retired machinery

These must have their substantive safety assertions ported to the new public
boundary **before** the implementation they exercise is removed.

| Test                                              | Cases   | Assertions |
| ------------------------------------------------- | ------- | ---------- |
| `test/scripts/local-rc-blocker-contract.test.mjs` | 73      | 955        |
| `test/scripts/release-version-policy.test.mjs`    | 36      | 229        |
| `test/scripts/devai-local-rc-verifier.test.mjs`   | 11      | 66         |
| **Total**                                         | **120** | **1250**   |

`release-version-policy.test.mjs` is largely product version-line policy and is
expected to survive mostly intact; the other two are boundary tests that must be
re-expressed against DEVAI's public CLI.

## 6. Migration map

| Old responsibility                      | DEVAI public capability                     | Proof required                                           |
| --------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `devai:rc:prepare` / `devai:rc:publish` | release lifecycle CLI                       | prepare + export receipts                                |
| `test:mutation` aggregation             | supported per-package mutation execution    | 38 packages, `executed`/`reused`/`not-required` distinct |
| mutation reuse grants                   | evidence reuse on matching input identities | reuse rejected on dependency change                      |
| `devai:trace:verify`                    | offline evidence verification               | verify without source checkout                           |
| campaign policy + schema                | candidate-bound release intent              | preflight → certify receipt chain                        |
| RC environment/toolchain/trust pins     | adoption configuration                      | generated bindings                                       |
| `devai-local-rc-verify.yml`             | supported release workflow                  | required-check parity                                    |
| `devai-main-observation.yml`            | supported observation                       | observation parity                                       |
| roster verification engine              | roster from declarative config              | 38-package selection                                     |
| **retained** roster/thresholds/targets  | STYNX `law/policy/devai-adoption.json`      | unchanged counts                                         |

Package scripts requiring rewrite: `verify:mutation-roster`, `test:mutation`,
`devai:trace:verify`, `devai:rc:prepare`, `devai:rc:publish`.

## 7. Configuration state

- `law/policy/devai-adoption.json` — present, `policy_version` 1.1.0. Its
  `ci_economy.attested_rc` block encodes the local-RC transport being retired
  and will need to be re-expressed against the new contract.
- `.devai/config/release-verification.json` — **absent** in this checkout.
  Not inherited from any other worktree.

## 8. Unmerged product work

47 local and 2 origin `codex/*` branches are ahead of `main`. Nearly all carry
only governance and generated `packages/*/README.md` churn. Two branches carry
genuine unmerged **product** source:

`codex/stynx-1.1.2-inspector-prepare-3412` (and
`origin/codex/stynx-1.1.2-architect-6`) add, beyond the 24 generated READMEs:

- `packages/data/migrations/platform/0019_auth_session_partitions.sql`
- `packages/data/src/migration-runner.ts`
- `packages/data/test/integration/migrations.spec.ts`
- `packages/sessions/src/session-mirror.writer.ts`
- `packages/sessions/test/unit/session-control-depth.spec.ts`
- `packages/sessions/test/unit/session.service.spec.ts`
- `packages/contracts/stryker-setup-1.js`
- `reference/web/test/e2e/record-trash.spec.ts`

This work must not be silently discarded. Whether it lands before or after the
migration is an Owner sequencing decision.

## 9. Verdict

**BLOCKED.** The required dependency `@aarusso-nyx/devai@1.5.0` does not exist
on the resolving registry. Census, classification, and migration mapping are
complete; no governance removal or adoption has been attempted.

---

# Part II — Migration outcome (2026-09-04)

The Owner authorized adopting `1.4.5` after `1.5.0` was confirmed unpublished.
This part records what was actually done. Part I above is the pre-migration
census and is unchanged.

## Correction to Part I

Part I classified `scripts/run-mutation-evidence.mjs` as pure generic
governance. **That was wrong.** DEVAI does not execute mutation testing: the
`test:mutation` task node invokes `pnpm run test:mutation` under
`runner: stryker-v1`, and `devai check --only mutation` only compares reports
against thresholds. Deleting the script would have broken all 38 packages with
no replacement. It is a mixed file: reduced from 2068 to 380 lines, retaining
only per-package Stryker execution and report emission.

The same applies to `scripts/lib/mutation-evidence.mjs` (1091 → 475 lines) and
`scripts/lib/mutation-roster.mjs`, which is used by `run-release-preparation.mjs`
and `lint-workflows.mjs` and is retained unchanged.

## Adoption state

STYNX was **already bound to 1.4.5** before this migration
(`.devai/config/authority-policy.json`, materialized 2026-08-31). This was a
governance-removal migration, not a version bump.

| Item             | Value                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Package          | `@aarusso-nyx/devai@1.4.5`                                                                        |
| Registry         | `https://npm.pkg.github.com`                                                                      |
| Integrity        | `sha512-5XuNGqbiqRGx+3MJOlO9VdJoKwX5MZ9a1BxdX/APUeD/j48CgtLwf5hNyxDkujxexekNn5TGSLUmU7aki2LTeQ==` |
| Pin recorded in  | `law/policy/devai-package-identity.json`                                                          |
| Verified against | `node_modules`, `pnpm-lock.yaml`                                                                  |

Rebound through supported commands only: `devai init bind --full` then
`devai init bind --adopter-policy law/policy/devai-adoption.json`.
No generated file was hand-edited.

## Test census reconciliation

| Measure                | Baseline    | After     | Delta |
| ---------------------- | ----------- | --------- | ----- |
| Test files             | 379         | 378       | −1    |
| Declared cases         | 2840        | 2810      | −30   |
| Assertions             | 9436        | 9183      | −253  |
| Skip/todo/only markers | 7           | 7         | 0     |
| Mutation packages      | 38          | 38        | 0     |
| Coverage thresholds    | 70/60/70/70 | unchanged | 0     |
| Mutation break floor   | 90          | unchanged | 0     |

All test changes are confined to three files under `test/scripts/`. No
`packages/`, `packages-web/`, `db/`, `domain/`, or `reference/` test changed.

### Retirement ledger (31 retired, 1 added, net −30)

| File                                 | Before | After | Retired | Added |
| ------------------------------------ | ------ | ----- | ------- | ----- |
| `local-rc-blocker-contract.test.mjs` | 73     | 66    | 8       | 1     |
| `release-version-policy.test.mjs`    | 36     | 24    | 12      | 0     |
| `devai-local-rc-verifier.test.mjs`   | 11     | —     | 11      | 0     |

**Retired from `local-rc-blocker-contract`** — all covered focused-mode or
composed-campaign evidence, which no longer exists: five `D24.12 focused …`
tests, `D24.12 focused and full-roster publication roots are mechanically
independent`, `D24.32 composed mutation evidence …`, `D24.36 chained rebind …`.

**Ported, not deleted:** `D24.15 runner bypasses preflight only for
non-executing modes` kept its `--normalize-existing` bypass and
preflight-before-staging assertions, and gained assertions that exactly one
roster execution path remains.

**Added:** `full-roster mutation publication is atomic and rollback-safe`,
replacing the retired publication-roots test with coverage of the
staging → backup → final promotion and its failure restore.

**Retired from `release-version-policy`** — PR A campaign preparation and
exemption (2), Changeset PR A classification (1), 1.1.1 candidate collision (1),
six `D24.33` candidate-rebind tests, `trace closes 495/380/115/14=509` (1), and
campaign evidence fail-closed (1).

**Retired whole:** `devai-local-rc-verifier.test.mjs` — all 11 tests covered the
deleted `devai-local-rc.mjs` wrapper, the deleted campaign policy, and the
deleted `devai-local-rc-verify.yml` workflow. Nothing in it described behavior
that survives.

**Preserved explicitly:** the privacy package test-tier partition
(`privacy ordinary, integration, and coverage tiers resolve exact disjoint
populations`) and the space-bearing path test
(`D24.22 filesystem URLs preserve decoded space-bearing engine and Playwright
paths`) both pass unchanged. No skip, todo, `only`, reduced scope, or
success-returning stub was added anywhere.

## Product requirements extracted before their carriers were retired

| Requirement                   | New home                                     | Verification                                                |
| ----------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| 44/38/6 package census        | `law/policy/stynx-package-roster.json`       | 38 mutation packages byte-identical to filesystem discovery |
| Adopted DEVAI identity        | `law/policy/devai-package-identity.json`     | matches `node_modules` and `pnpm-lock.yaml`                 |
| Retired-governance provenance | `law/policy/retired-governance-catalog.json` | all 15 digests self-verify                                  |

## Verification results

| Check                                             | Result                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `test/scripts/local-rc-blocker-contract.test.mjs` | **66/66 pass**                                                       |
| `test/scripts/release-version-policy.test.mjs`    | 23/24 pass, then **24/24** after helper restore                      |
| `test/scripts/validate.js`                        | **4/4 suites pass**                                                  |
| `devai doctor`                                    | verdict **pass**, tier1, 13 checks, 2 advisory failures (see limits) |
| `devai check --task-plan --local`                 | **pass**, 9 nodes                                                    |
| `devai check --task-plan --rc`                    | **pass**, 16 nodes including `test:mutation`                         |
| Module load, `run-mutation-evidence.mjs`          | pass                                                                 |
| Task graph dependency integrity                   | pass, 17 nodes, no dangling                                          |

## Open items

1. **`devai doctor` reports 2 advisory failures that were 0 at baseline.**
   `trusted-local-rc-boundary` and `authority-enforcement` both fail because
   `.devai/config/project.json` still contains `ci_economy.attested_rc` after
   that block was removed from the adopter policy source. `devai init bind`
   merges rather than replaces, so the retired declaration cannot be cleared
   through any supported command. `devai init apply architect --force` does not
   clear it either and instead re-projects unrelated scaffolding, overwriting
   `CLAUDE.md`, `AGENTS.md`, and several READMEs; it was reverted. Per the rule
   against hand-editing generated files to simulate adoption, this is left
   failing and reported as a **DEVAI 1.4.5 limitation**.

2. **The mission's six-stage lifecycle is not reachable on 1.4.5.** The action
   catalog has 48 actions and contains no `prepare` and no `export`.

3. **Export requires signing control identities** (`--private-key`,
   `--public-key`, `--signer-id`) that this migration does not hold and must
   not invent.

4. **Unmerged product work remains unlanded**, preserved at
   `docs/meta/migration/preserved/`.

---

# Part III — Installed lifecycle acceptance (2026-09-05)

The complete DEVAI 1.4.5 release lifecycle was established end to end against a
real candidate. Part I is the pre-migration census; Part II is the migration
outcome; this part records acceptance.

## Final candidate

| Field         | Value                                                   |
| ------------- | ------------------------------------------------------- |
| Branch        | `codex/stynx-1.2.0-devai-adoption`                      |
| Commit        | `87adf071c5c7db0c995e42988f99642d6ab98dbc`              |
| Tree          | `d65ea1e9d2d7d9ff2d6c225e2dcd277aea6caadb`              |
| Base          | `main` @ `75f8d49fba0f2418c310b62d98f50f796a33002e`     |
| Version       | 1.2.0 (root + all 44 publishable packages)              |
| Worktree path | contains a literal space and non-ASCII-adjacent segment |

## Lifecycle stages

| Stage          | Command                                             | Result                                            |
| -------------- | --------------------------------------------------- | ------------------------------------------------- |
| plan           | `check --task-plan --rc`                            | pass, 16 nodes                                    |
| preflight      | `check --release-stage preflight --release-intent`  | **pass**, receipt `da934e05…`, 0 blocking reasons |
| certify        | `check --release-stage certify --preflight-receipt` | **pass**, receipt `975a8a2a…`                     |
| rc profile     | `check --rc --run`                                  | **pass**, receipt `acca6eb0…`                     |
| export         | `devai-evidence-export`                             | **ok**, envelope `129d0a0b…`, policy `ca68487f…`  |
| offline-verify | `devai-evidence-bundle-verify`                      | **ok**, 16 nodes, 80 artifacts, `exact-commit`    |

All 16 task nodes pass: `engines`, `typecheck`, `build`, `api:contracts`,
`lint:families`, `test:unit`, `test:integration`, `reference:apps`, `db:rls`,
`test:e2e`, `docs`, `test:mutation`, `test:performance`, `security`, `doctor`,
`release:prepare`.

## Mutation population

The complete 38-package roster executed under DEVAI's supported per-package
orchestration, twice (preflight 3.69 h, certify 3.58 h):

- 38/38 packages, **zero failing**, aggregate score 92.54
- lowest package 90.07 (`angular-flow`) against the `break: 90` floor
- 8,982 killed / 723 survived / 6 no-coverage / 60 timeout
- evidence package set byte-identical to `law/policy/stynx-package-roster.json`

`executed` and `reused` remain distinct: a re-run after a `.changeset/` change
reused 15 of 16 nodes at 0 ms, including the 3.7-hour mutation node, because
`.changeset/` is not among that node's input selectors.

## Fail-closed acceptance

Offline verification was performed in an isolated directory with **no git
repository, no source checkout, and no certification cache**. Eight negative
cases each fail closed with a distinct code:

| Case                           | Code                         |
| ------------------------------ | ---------------------------- |
| wrong candidate commit         | `COMMIT_MISMATCH`            |
| wrong tree                     | `TREE_MISMATCH`              |
| wrong policy digest            | `POLICY_DIGEST_MISMATCH`     |
| wrong repository               | `REPOSITORY_MISMATCH`        |
| tampered mutation artifact     | `ARTIFACT_DIGEST_MISMATCH`   |
| signature from a different key | `SIGNATURE_INVALID`          |
| revoked signer                 | `SIGNER_REVOKED`             |
| incomplete bundle              | `BUNDLE_POPULATION_MISMATCH` |

## External controls

Signing and control inputs live outside the repository, as the exporter
requires (`outsideRepository`):

- `~/.config/stynx/release-signing.pem` / `.pub.pem` — Ed25519, PKCS#8/SPKI,
  unencrypted by necessity (`createPrivateKey` is called without a passphrase)
- `~/.config/stynx/release-toolchain.json` — node, pnpm, postgres, typescript, vitest
- `~/.config/stynx/release-environment.json` — 16 allowlisted variables as
  SHA-256 digests, 7 non-null
- `~/.config/stynx/release-trust-store.json` — signer `stynx-release`

The `rc3-ledger` OpenSSH key is **not usable**: Node's `createPrivateKey`
rejects OpenSSH private-key format with `ERR_OSSL_UNSUPPORTED`.

## Known limits

1. `devai doctor` reports 2 advisory failures (`trusted-local-rc-boundary`,
   `authority-enforcement`) because `.devai/config/project.json` retains
   `ci_economy.attested_rc` after it was removed from the adopter policy source.
   `devai init bind` merges rather than replaces and cannot retire it; the
   generated file was not hand-edited. **DEVAI 1.4.5 limitation.**
2. Export consumes a **profile-driven** receipt (`--profile rc`), not the
   capability-driven `--release-intent` certification receipt; supplying the
   latter fails `POLICY_DIGEST_MISMATCH`. The `rc` profile receipt had to be
   produced separately, which re-ran the mutation population.
3. Publication protections were outstanding when Part III was written. They
   are now applied and verified; see Part IV.

---

# Part IV — Remote protections (2026-09-05)

Applied to `stynx-nyx/stynx` under explicit Owner authorization.
`node scripts/verify-branch-protection.mjs` reports
**"Branch protection matches .github/branch-protection.yml."**

## Branch protection on `main`

The applied state tightened `main` substantially. Before, it had no required
reviews at all, admins were not enforced, status checks were not strict, and
only 8 contexts were required. It now enforces admins, linear history,
conversation resolution, strict status checks, one approving code-owner review
with stale-review dismissal, and 12 required contexts.

`verified-local-rc` was removed from both the declared record and the live
protection. It was produced by `.github/workflows/devai-local-rc-verify.yml`,
which this migration deletes, so it could never have reported again. The
remaining 12 contexts were each confirmed against a real job.

`@codexmark` was added to all 13 CODEOWNERS rules. With code-owner review
required, a single approval, and admins enforced, a sole code owner could not
approve their own pull requests and the 1.2.0 candidate would have been
unmergeable.

## Tag ruleset

| Field         | Value                                      |
| ------------- | ------------------------------------------ |
| Name          | `stynx-release-tag-immutability`           |
| Id            | 22343697                                   |
| Target        | tag                                        |
| Enforcement   | active                                     |
| Include       | `refs/tags/v*`, `refs/tags/@stynx-nyx/*@*` |
| Rules         | `deletion`, `non_fast_forward`             |
| Bypass actors | none (`current_user_can_bypass: never`)    |

The repository publishes under two tag shapes and the ruleset covers both: the
release-line tags (`v1.1.1`, `v0.5.0`) and the per-package publish tags
(`@stynx-nyx/worklist@1.1.1`). Checked against the live tag list:
**100 of 100 tags covered, none uncovered.** Deletion and force-movement are
refused for admins as well, so every published package's provenance anchor is
immutable.

## Verifier defect fixed

`scripts/verify-branch-protection.mjs` read include patterns from the ruleset
**list** endpoint, which returns a summary without `conditions`. The pattern
set was therefore always empty and the script reported drift against a ruleset
that was present, active, and correct. It now fetches each active tag ruleset
by id when the summary omits `conditions`. The defect predates this migration
and would have misreported on the 1.1.x line as well.

---

# Part V — Pre-push gate exception (2026-09-05)

## What was bypassed

The branch was pushed with `git push --no-verify`, skipping the DEVAI pre-push
`forbidden-actions` hook, under explicit Owner authorization.

## Why

The gate rejected the branch with eight findings. All eight were resolved
properly: eight Owner authorization receipts were added to
`law/policy/forbidden-action-authorizations.json` in commit `327f04df`, and the
check confirmed `applied: 8` with every original finding cleared.

Adding those receipts produced one new, unresolvable finding:

```
FORBID-MUTATE-INVARIANTS  327f04df  |  git add law/
```

Commit `327f04df` changes exactly one file — the authorizations registry
itself. A receipt names a commit SHA, so a commit can never carry its own
receipt, and any commit that adds one trips the same rule. The mechanism
cannot authorize itself.

This is not specific to this migration. Every receipt-recording commit in the
repository has the same shape; `71885658 docs(repo): record D24.45 workflow
authorization` on `main` changes only
`law/policy/forbidden-action-authorizations.json` and carries no receipt. The
pre-push hook scans `--since-ref` across all outgoing commits, so it would
reject those commits today as well.

## Why it was not fixed locally

No supported local fix exists in DEVAI 1.4.5:

- `.devai/config/forbidden-actions.json` is byte-identical to
  `node_modules/@aarusso-nyx/devai/dist/law/policy/forbidden-actions.json`
  (`575f9345…`), materialized by `devai init bind --operational-law` with byte
  identity required. Editing it breaks the binding.
- The registry schema states adopters "may extend but never relax" it, and
  offers no path-exemption mechanism.
- `waivers` drops a canonical FORBID id entirely. Waiving
  `FORBID-MUTATE-INVARIANTS` would remove protection from `law/`, `product/`,
  `record/`, and `.devai/config/` wholesale to work around a bootstrapping
  quirk, which is a larger loss than the problem it solves.
- `glob_guards` serves an unrelated purpose and the adopter policy carries no
  forbidden-actions override.

## Upstream defect

**DEVAI 1.4.5: the forbidden-actions check cannot admit the authorization
registry it depends on.** The fix belongs in the package — either exempt
`law/policy/forbidden-action-authorizations.json` from the `law/` write
patterns, or accept a receipt that covers the commit introducing it.

## Scope of the exception

The bypass covers only the pre-push hook invocation. It does not waive any
forbidden action, alter the registry, or remove any protection. The eight
substantive authorizations remain recorded and verifiable, and the four
`FORBID-RM-RF` receipts state explicitly that they cover incidental text
matches rather than destructive operations.

---

# Part VI — Merge exception (2026-09-05)

## What was overridden

Pull request #231 was merged with `gh pr merge --admin`, under explicit Owner
authorization, bypassing the `required_pull_request_reviews` gate that this same
pull request established.

**Only the review requirement was overridden.** All 19 status checks passed
before the merge, including every one of the 12 required contexts:

| Check                                                                                                                                        | Result       |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `stynx-tier-gate`                                                                                                                            | pass, 17m04s |
| `unit-tests`                                                                                                                                 | pass, 15m25s |
| `build (ubuntu-latest)`                                                                                                                      | pass, 10m43s |
| `build-docs`                                                                                                                                 | pass, 9m20s  |
| `reference-web-e2e`                                                                                                                          | pass, 5m15s  |
| `integration-tests`                                                                                                                          | pass, 5m10s  |
| `reference-api`                                                                                                                              | pass, 4m21s  |
| `container-security`                                                                                                                         | pass, 3m17s  |
| `typecheck`                                                                                                                                  | pass, 2m23s  |
| `lint`                                                                                                                                       | pass, 2m18s  |
| `dependency-audit`, `install`, `lint:cycles`, `migration-lint`, `package-policy`, `release-drafts`, `semantic-pr-title`, `semgrep`, `doctor` | pass         |

No check was skipped, and no protection setting was altered.

## Why the review could not be satisfied in place

The pull request author and the only available authenticated identity are the
same account (`aarusso-nyx`). GitHub refuses approval on one's own pull
request, so self-approval was not an available action. `@codexmark` was added
to all 13 CODEOWNERS rules in `7f9da60b` and could have approved, but the Owner
elected to proceed without waiting.

## Honest characterisation

This exception is **weaker** than the `--no-verify` exception in Part V.

Part V documented a structural impossibility: an authorization receipt names a
commit SHA, so the commit that records one can never carry its own receipt, and
no supported configuration could resolve it. No actor could have satisfied that
gate.

This gate was satisfiable. A second code owner with admin access existed and
could have approved. The override was a choice to avoid waiting, not a response
to an unsatisfiable requirement.

It is recorded here in those terms so the precedent is not mistaken for the
earlier one. The first merge into `main` under the new branch protection was a
merge that bypassed part of it.

## Scope

The bypass covers the single merge of #231. Branch protection and the tag
ruleset remain exactly as applied in Part IV, verified by
`node scripts/verify-branch-protection.mjs`. Nothing was waived, relaxed, or
disabled.
