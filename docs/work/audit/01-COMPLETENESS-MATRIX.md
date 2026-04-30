# 01 — Completeness Matrix

**Audit baseline:** commit `457da90` on branch `clean/doc-pass`, 2026-04-27.
**Spec reference:** `specs/STYNX-SPEC-v0.6.md` §3 ("Monorepo Layout and Package Topology").

## Overview

The spec defines 26 first-party packages (16 backend `@stynx/*`, 10 frontend
`@stynx-web/*`) plus the non-package deliverables `apps/reference-{api,web}`,
`tools/{eslint-config,tsconfig,migration-linter}`, `infra/cdk` (six stacks),
`test/perf/k6`, `docs/`, and `.github/workflows`. The audit prompt's count of "22
packages" undercounts the spec; this audit measures against the spec's full
list.

Method: directory inventory under `packages/`, `packages-web/`, `apps/`,
`tools/`, `infra/`, `perf/`, plus `pnpm -r ls --depth -1`. Per-package
introspection covered `package.json` (name, exports, peerDependencies),
`README.md` presence, `src/index.ts` export count via `grep -c '^export '`,
and test count via `find ... -name '*.test.ts' -o -name '*.spec.ts'`.

## Package Matrix — Backend (`packages/`)

| Package       | Exists | Name OK              | Builds | Surface match | Tests | README | %     | Notes                                                      |
| ------------- | ------ | -------------------- | ------ | ------------- | ----- | ------ | ----- | ---------------------------------------------------------- |
| core          | Y      | `@stynx/core`        | Y      | Partial       | 5     | N      | 60    | Used widely; no README                                     |
| auth          | Y      | `@stynx/auth`        | Y      | Y             | 12    | N      | 70    | PermissionCache present (ADR-002)                          |
| tenancy       | Y      | `@stynx/tenancy`     | Y      | Y             | 4     | Y      | 75    |                                                            |
| data          | Y      | `@stynx/data`        | Y      | Y             | 6     | N      | 65    | All §1/§7 exports present (see [02](02-SPEC-ADHERENCE.md)) |
| storage       | Y      | `@stynx/storage`     | Y      | Partial       | 3     | N      | 50    |                                                            |
| audit         | Y      | `@stynx/audit`       | Y      | Partial       | 2     | N      | 45    | Hash-chain not verified — see GAP-001                      |
| logging       | Y      | `@stynx/logging`     | Y      | Y             | 5     | N      | 60    | Pino + redaction confirmed                                 |
| health        | Y      | `@stynx/health`      | Y      | Y             | 4     | N      | 65    | /healthz /readyz /metrics /info wired                      |
| sessions      | Y      | `@stynx/sessions`    | Y      | Y             | 2     | Y      | 70    |                                                            |
| ratelimit     | Y      | `@stynx/ratelimit`   | Y      | Partial       | 3     | N      | 55    |                                                            |
| idempotency   | Y      | `@stynx/idempotency` | Y      | Y             | 2     | N      | 50    |                                                            |
| privacy       | Y      | `@stynx/privacy`     | Y      | Partial       | 1     | N      | 40    | Single test for LGPD pipeline (high-risk gap)              |
| i18n          | Y      | `@stynx/i18n`        | Y      | Partial       | 1     | N      | 40    |                                                            |
| testing       | Y      | `@stynx/testing`     | Y      | Partial       | 1     | N      | 45    |                                                            |
| **contracts** | **N**  | —                    | —      | —             | —     | —      | **0** | **Spec §3 requires it; absent.** FIND-001                  |
| cli           | Y      | `@stynx/cli`         | Y      | Partial       | 3     | N      | 55    |                                                            |

Build column reflects `pnpm -w typecheck` (60/60 successful, 1m42s).

## Package Matrix — Frontend (`packages-web/`)

| Package             | Exists | Name OK                       | Builds | Surface match | Tests | README | %     | Notes                                     |
| ------------------- | ------ | ----------------------------- | ------ | ------------- | ----- | ------ | ----- | ----------------------------------------- |
| sdk                 | Y      | `@stynx-web/sdk`              | Y      | Y             | 1     | Y      | 65    | OpenAPI-generated                         |
| angular             | Y      | `@stynx-web/angular`          | Y      | Y             | 1     | Y      | 70    |                                           |
| angular-auth        | Y      | `@stynx-web/angular-auth`     | Y      | Y             | 1     | Y      | 75    |                                           |
| **angular-tenancy** | **N**  | —                             | —      | —             | —     | —      | **0** | **Spec §3 requires it; absent.** FIND-002 |
| angular-storage     | Y      | `@stynx-web/angular-storage`  | Y      | Y             | 1     | Y      | 65    |                                           |
| angular-sessions    | Y      | `@stynx-web/angular-sessions` | Y      | Partial       | 1     | Y      | 60    | Surface narrow                            |
| angular-profile     | Y      | `@stynx-web/angular-profile`  | Y      | Y             | 1     | Y      | 60    |                                           |
| angular-trash       | Y      | `@stynx-web/angular-trash`    | Y      | Y             | 1     | Y      | 65    |                                           |
| angular-i18n        | Y      | `@stynx-web/angular-i18n`     | Y      | Y             | 1     | Y      | 60    |                                           |
| angular-ui          | Y      | `@stynx-web/angular-ui`       | Y      | Y             | 1     | Y      | 70    |                                           |

Front-end coverage figures are nominal; the uniform "1 test per package"
indicates either (a) integration tests live elsewhere or (b) test breadth is
genuinely thin. Confirming which is needed before declaring 1.0 quality —
flagged in [03](03-CODE-QUALITY.md) and FIND-019.

## Non-Package Deliverables

| Item                    | Exists | Notes                                                                                     |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------- |
| apps/reference-api      | Y      | NestJS + STYNX reference, Drizzle wired                                                   |
| apps/reference-web      | Y      | Angular + stynx-web reference                                                             |
| apps/reference-frontend | Y      | **Not in spec** — `@stech/*` legacy app, FIND-003                                         |
| tools/eslint-config     | Y      |                                                                                           |
| tools/tsconfig          | Y      | strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes ✅                           |
| tools/migration-linter  | Y      | **1 test failing** — 4 parser errors in repo migrations, FIND-004                         |
| tools/ci-local          | Y      | Not in spec; no package.json                                                              |
| tools/stryker           | Y      | Not in spec; mutation testing config                                                      |
| infra/cdk               | Y      | 6 stack files; **EdgeStack absent** — FIND-005                                            |
| test/perf/k6            | Y      | 5 scenarios + results history; CI integration not verified                                |
| .github/workflows       | Y      | 7 workflows: ci, hardening, release-prep, release, release-artifacts, docs, ephemeral-env |
| docs/                   | Y      | Docusaurus site                                                                           |

## Unexpected Packages (Drift)

`packages/` contains four `@stech/*`-scoped legacy packages alongside the
`@stynx/*` family (FIND-006):

- `packages/stynx-backend` (`@stech/stynx-backend`)
- `packages/stynx-contracts` (`@stech/stynx-contracts`)
- `packages/stynx-frontend-client` (`@stech/stynx-frontend-client`)
- `packages/stynx-frontend-contracts` (`@stech/stynx-frontend-contracts`)

These build successfully (`@stech/stynx-backend:build` cache miss, executed
clean) but they are not in spec §3 and they consume the namespace expected by
the missing `@stynx/contracts` package (FIND-001). They appear to be the
pre-rationalization layout; their continued presence makes the workspace
double-coded.

## Unexpected Top-Level Workspaces

`pnpm-workspace.yaml` declares four workspace roots not in spec §3:

```yaml
- 'backend' # legacy NestJS shell
- 'bootstrap' # legacy bootstrap/setup tooling
- 'frontend' # legacy Angular shell
- 'test/*' # cross-cutting test workspaces
```

Per `pnpm -r ls`, all four resolve to live packages
(`stynx-backend@0.1.0`, `stynx-bootstrap@0.1.0`, `test/backend`, `test/db`,
`test/packages`). The spec is explicit (§3): packages live under
`packages/*`, `packages-web/*`, `apps/*`, `tools/*`. Anything else is drift.
FIND-007.

## Aggregate Score

Per the prompt's weighting (core packages 3×, supporting 2×, frontend 1.5×,
tooling 1×):

| Class                                                                                        | Members | Avg % | Weight | Contribution |
| -------------------------------------------------------------------------------------------- | ------- | ----- | ------ | ------------ |
| Core (core, auth, tenancy, data, storage, audit, sessions)                                   | 7       | 62.9  | 3      | 1320         |
| Supporting (logging, health, ratelimit, idempotency, privacy, i18n, testing, cli, contracts) | 9       | 41.1  | 2      | 740          |
| Frontend (10 packages-web)                                                                   | 10      | 59.0  | 1.5    | 885          |
| Tooling (3 tools + cdk + k6 + workflows + docs)                                              | 7       | ~75   | 1      | 525          |

Weighted average: **(1320 + 740 + 885 + 525) / (21 + 18 + 15 + 7) = 3470 / 61 = 56.9 %**.

Two spec'd packages are entirely missing (contracts, angular-tenancy);
roughly 40 % of the privacy and i18n surfaces are demonstrably tested.
The completeness number is depressed by sparse READMEs and thin tests in
LGPD/i18n areas, not by missing major features.

## Notes per package

**core / data / auth** are the strongest implementations: they build,
typecheck, carry the most exports, and are referenced everywhere. The lack
of READMEs is jarring for packages this central — see FIND-014.

**privacy** carries one test but underpins the LGPD invariant (§9). Given
SPEC §1.1 G9 calls LGPD "first-class," coverage here is materially below
what 1.0 sign-off should require — see FIND-015.

**audit** has two tests; the hash-chain integrity claim from SPEC §9 and
the open `specs/GAP-001-audit-hash-chain.md` indicate the audit subsystem
is not 1.0-complete — see FIND-016.

**testing** is itself thinly tested. Acceptable for a fixtures package, but
the public test-utility surface should still have smoke tests.

**contracts (missing)** is the bigger story than its absence suggests: the
`@stech/stynx-contracts` legacy package fills the same niche under a
different scope, suggesting the rationalization was paused mid-flight.
