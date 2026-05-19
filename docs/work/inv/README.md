# Testing Inventory — stynx

**Compiled:** 2026-05-18
**Author role (Article 6):** Inspector — read-only inventory of test surfaces.
**Source of truth:** `coverage/test-evidence.json` (schemaVersion 1, generated 2026-05-19T01:32:31Z), per-package `.test-results/*.json`, and direct filesystem inspection. No tests were executed for this report; assertions reference the most recent canonical run.

## Files in this directory

| File                                       | Purpose                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| [README.md](README.md)                     | This overview; links to the other sheets.                                        |
| [01-matrix.md](01-matrix.md)               | The full per-package test-matrix (Unit / API / DB / E2E / Mutation / Coverage).  |
| [02-runners.md](02-runners.md)             | Frameworks, runners, configs, helpers, and supporting fixtures.                  |
| [03-frontend.md](03-frontend.md)           | Web-package (`packages-web/*`) test surface and the Playwright E2E surface.      |
| [04-backend.md](04-backend.md)             | Backend (`packages/*`, `reference/api`, `domain/*/api`) test surface, by family. |
| [05-db.md](05-db.md)                       | DDL / schema / RLS / trigger / view test surface and gaps.                       |
| [06-mutation.md](06-mutation.md)           | Stryker coverage, scores, thresholds, missing packages.                          |
| [07-cross-cutting.md](07-cross-cutting.md) | Aggregators, evidence ledgers, perf, smoke, governance, CI hooks.                |

## Scope of testing required by the assignment

| Aspect | Expectation                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| A      | Unit tests at 100% lines / statements / branches / functions in every package.                                               |
| B      | All API routes/methods exercised: every happy path **and** every distinct error class (validation, auth, headers, sequence). |
| C      | Every DB flow exercised: every schema, every trigger, every function, every view, every materialized view; happy + unhappy.  |
| D      | Real E2E flows: backend = supertest sequences against the running app with real PG; frontend = Playwright user journeys.     |
| E      | Reasonable Stryker mutation coverage with non-trivial thresholds, per package.                                               |

## Workspace shape

- **3 published-track families** of test owners:
  - `packages/*` — backend libraries (Nest-friendly): 18 packages.
  - `packages-web/*` — Angular libraries: 11 packages.
  - `reference/{api,web}` — runtime "reference apps" exercising the library set: 2 packages.
- **2 internal-track families:**
  - `tools/*` (config, linters, scripts): 7 packages, 4 with vitest configs.
  - `test/{db,packages,backend,perf,scripts,support}` — shared test fixtures + cross-cutting suites.
- **1 domain pilot:** `domain/demo-bookmark/{api,web}` (Phase H scaffolding pilot).

## Topline numbers (from `coverage/test-evidence.json`, 2026-05-19T01:32:31Z)

| Level       | Packages | Tests | Passed | Failed | Wall ms |
| ----------- | -------: | ----: | -----: | -----: | ------: |
| Unit        |       39 | 1 329 |  1 329 |      0 | 310 192 |
| Integration |       16 |    79 |     79 |      0 | 133 972 |
| E2E         |        1 |     4 |      4 |      0 |   8 219 |
| Mutation    |      12¹ |     — |      — |      — |       — |
| Coverage    |       28 |     — |      — |      — |       — |
| Perf        |        1 |     — |      — |      1 |   4 110 |

¹ Only @stynx/contracts appears in the aggregate `levels.mutation`; 11 more packages have on-disk `.test-results/mutation.json` artifacts (see [06-mutation.md](06-mutation.md)).

## Headline gaps

- **Coverage is 100% on lines/statements/functions** for the 28 reported packages — but **15 packages sit below 100% on branches** (range 91.52 % – 99.37 %). Per the user's expectation A, every aspect must be 100 %.
- **E2E "real" coverage is anchored to one suite:** the Playwright tests in `reference/web/test/e2e/` (4 scenarios) and the supertest+testcontainers `reference-api.runtime.spec.ts` (17 integration "families"). Every `packages/*/test/e2e/*.e2e-spec.ts` and `packages-web/*/test/e2e/*.e2e-spec.ts` is a **wiring / export-existence smoke test, not a real E2E**.
- **DB tests do not exercise the database**: `test/db/*.ddl.spec.ts` are text-greps on SQL files. No runtime trigger/function/view execution outside the reference-api runtime spec.
- **Mutation matrix is patchy**: only 12 of 30 packages with `stryker.conf.mjs` have a current `.test-results/mutation.json`. 18 packages have a Stryker config but no recorded score in this evidence cycle.
- **Perf smoke fails today**: `scripts/perf-smoke.mjs` reports 5/5 probes failing at p50 792 ms; no enforced regression budget recorded.
- **Frontend testing is anaemic**: web packages collectively own only 75 unit tests (versus 1 244 on the backend side). Most web packages have a single export-existence spec.

See [`docs/work/diag/`](../diag/) for the diagnostics and [`docs/work/plan/`](../plan/) for the remediation programme.
