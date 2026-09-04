# STYNX 1.2.0 — DEVAI adoption migration census

**Status:** BLOCKED — `@aarusso-nyx/devai@1.5.0` is not published.
**Role declared:** Architect (analysis and `law/`, `docs/meta/` authorship only).
**Base:** `main` @ `75f8d49fba0f2418c310b62d98f50f796a33002e`, tree `c526b93ef26bc5f9946dba19749a5268b9d2abff`.
**Branch:** `codex/stynx-1.2.0-migration-census`.

This document is the preservation census required before any governance removal.
No governance file has been removed. No adoption has been performed.

## 1. Upstream blocker

The migration target does not exist on the resolving registry.

| Fact | Value |
| --- | --- |
| Package | `@aarusso-nyx/devai` |
| Requested version | `1.5.0` |
| Resolving registry | `https://npm.pkg.github.com` (scoped via `.npmrc`) |
| Published versions | 29, ending at `1.4.5` |
| `dist-tags.latest` | `1.4.5` |
| `1.5.0` present | **no** |
| Currently pinned | `1.4.5` |
| `1.4.5` integrity | `sha512-5XuNGqbiqRGx+3MJOlO9VdJoKwX5MZ9a1BxdX/APUeD/j48CgtLwf5hNyxDkujxexekNn5TGSLUmU7aki2LTeQ==` |
| `1.4.5` tarball | `https://npm.pkg.github.com/download/@aarusso-nyx/devai/1.4.5/1d5aa3fc8748a3ac7c2150750f60803c0b357b86` |

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

| Measure | Baseline |
| --- | --- |
| Tracked files | 2460 |
| Test files (`*.spec.*` / `*.test.*`) | 379 |
| Declared test cases (static) | 2840 |
| Assertions (static `expect(` / `assert.`) | 9436 |
| Mutation packages (`stryker.conf.mjs`) | **38** — matches expected roster |
| Shared mutation base | `tools/stryker/base.mjs` (not a target) |
| Per-package vitest mutation configs | 19 |
| ADR files | 28 (27 ADRs + `README.md`) |
| Invariants | 10 `INV-*` + `RBAC-001-allowlist.json` |
| Security / RLS / tenancy / RBAC test files | 198 |
| `test/db` files | 21 |
| Pre-existing conditional skips | 5 (all `describe.skip` behind `isVeraPdfDockerUsable()`) |

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

| Path | LOC | Responsibility |
| --- | --- | --- |
| `scripts/run-mutation-evidence.mjs` | 2068 | mutation aggregation, composition, reuse engine |
| `scripts/lib/mutation-evidence.mjs` | 1091 | evidence composition internals |
| `scripts/devai-local-rc.mjs` | 314 | local RC orchestration (`prepare`, `publish`) |
| `scripts/verify-devai-trace.mjs` | 168 | direct verifier invocation |
| `scripts/lib/devai-local-rc.mjs` | 17 | RC shim |
| `scripts/verify-mutation-roster.mjs` | 24 | roster verification driver |
| `.github/workflows/devai-local-rc-verify.yml` | 320 | local RC verification job |
| `.github/workflows/devai-main-observation.yml` | 178 | main-branch observation job |
| `law/policy/release-campaign-1.1.1.json` | 272 | candidate-specific campaign logic |
| `law/policy/stynx-1.1.1-mutation-reuse.json` | 698 | candidate-specific reuse grants |
| `law/schemas/release-campaign-1.1.1.schema.json` | 340 | campaign schema |
| `law/policy/devai-local-rc-environment.json` | 18 | RC environment pin |
| `law/policy/devai-local-rc-toolchain.json` | 7 | RC toolchain pin |
| `law/policy/devai-local-rc-trust-store.json` | 10 | RC trust store |

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

| Test | Cases | Assertions |
| --- | --- | --- |
| `test/scripts/local-rc-blocker-contract.test.mjs` | 73 | 955 |
| `test/scripts/release-version-policy.test.mjs` | 36 | 229 |
| `test/scripts/devai-local-rc-verifier.test.mjs` | 11 | 66 |
| **Total** | **120** | **1250** |

`release-version-policy.test.mjs` is largely product version-line policy and is
expected to survive mostly intact; the other two are boundary tests that must be
re-expressed against DEVAI's public CLI.

## 6. Migration map

| Old responsibility | DEVAI public capability | Proof required |
| --- | --- | --- |
| `devai:rc:prepare` / `devai:rc:publish` | release lifecycle CLI | prepare + export receipts |
| `test:mutation` aggregation | supported per-package mutation execution | 38 packages, `executed`/`reused`/`not-required` distinct |
| mutation reuse grants | evidence reuse on matching input identities | reuse rejected on dependency change |
| `devai:trace:verify` | offline evidence verification | verify without source checkout |
| campaign policy + schema | candidate-bound release intent | preflight → certify receipt chain |
| RC environment/toolchain/trust pins | adoption configuration | generated bindings |
| `devai-local-rc-verify.yml` | supported release workflow | required-check parity |
| `devai-main-observation.yml` | supported observation | observation parity |
| roster verification engine | roster from declarative config | 38-package selection |
| **retained** roster/thresholds/targets | STYNX `law/policy/devai-adoption.json` | unchanged counts |

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
