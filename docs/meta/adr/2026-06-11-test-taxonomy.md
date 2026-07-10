---
adr_id: ADR-TEST-TAXONOMY-2026-06-11
title: Stynx test taxonomy and e2e naming contract
status: accepted
date: 2026-06-11
authors: ['Architect']
tags: [stynx, testing, e2e, vitest, playwright]
---

# ADR-TEST-TAXONOMY-2026-06-11 - Stynx test taxonomy and e2e naming contract

**Authority:** Architect, per DEVAI Constitution Article 6.
**Related:** `docs/work/round-18/diag.md`, `docs/work/round-18/inv.md`, `docs/work/round-18/inv-before/e2e-spec-touchpoints.txt`.

Decision summary: stynx uses four named test kinds. Package-level mocked HTTP
or route-contract tests are **wiring specs**, not e2e specs. Package-level
Docker-backed backend tests stay under integration naming. The `e2e` label is
reserved for system-boundary suites in the reference applications.

## Status

Accepted on 2026-06-11 for R18 W02.

## Context

R18 W01 verified that the repo has exactly 8 package-level backend
`*.e2e-spec.ts` files under `packages/*/test/e2e/`. Each is valuable, but none
is a full end-to-end suite:

- Seven build a Nest testing module with mocked services, overridden guards or
  stubbed dependencies, and HTTP assertions through `supertest`.
- `packages/flow/test/e2e/flow-routes.e2e-spec.ts` is route metadata coverage,
  not a real process or browser e2e test.

W01 also verified that `reference/web/test/e2e/` contains 32 Playwright
`*.spec.ts` files, and that the idempotency and ratelimit package-level
Docker-backed tests already use `test/integration/*.integration.spec.ts`.

The old naming blurred these categories and caused ledger drift: browser e2e
already exists in `reference/web`, while some package-level backend files were
still named as if they exercised system boundaries.

## Decision

### D1. Unit and behavioral specs

Unit and package-local behavioral specs use `test/unit/**/*.spec.ts`.

These specs run inside Vitest without external process boundaries. A package may
temporarily include broader `test/**/*.spec.ts` globs, but new package-local
unit/behavioral coverage should live under `test/unit/` unless another category
below applies.

### D2. Controller wiring specs

Package-level mocked HTTP, guard, controller, or route-shape tests use:

```text
test/wiring/**/*.wiring-spec.ts
```

This replaces the current backend pseudo-e2e idiom. A wiring spec may use
`Test.createTestingModule`, `supertest`, mocked providers, overridden guards,
or metadata inspection. It must not be named `*.e2e-spec.ts` unless it crosses a
real system boundary.

R18 W03 must rename the 8 current files exactly as follows:

| Current path                                           | New path                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| `packages/audit/test/e2e/audit-http.e2e-spec.ts`       | `packages/audit/test/wiring/audit-http.wiring-spec.ts`       |
| `packages/auth/test/e2e/auth-http.e2e-spec.ts`         | `packages/auth/test/wiring/auth-http.wiring-spec.ts`         |
| `packages/flow/test/e2e/flow-routes.e2e-spec.ts`       | `packages/flow/test/wiring/flow-routes.wiring-spec.ts`       |
| `packages/health/test/e2e/health-http.e2e-spec.ts`     | `packages/health/test/wiring/health-http.wiring-spec.ts`     |
| `packages/i18n/test/e2e/i18n-http.e2e-spec.ts`         | `packages/i18n/test/wiring/i18n-http.wiring-spec.ts`         |
| `packages/privacy/test/e2e/privacy-http.e2e-spec.ts`   | `packages/privacy/test/wiring/privacy-http.wiring-spec.ts`   |
| `packages/sessions/test/e2e/sessions-jwks.e2e-spec.ts` | `packages/sessions/test/wiring/sessions-jwks.wiring-spec.ts` |
| `packages/tenancy/test/e2e/tenancy-http.e2e-spec.ts`   | `packages/tenancy/test/wiring/tenancy-http.wiring-spec.ts`   |

W03 must preserve file contents except import-path updates mechanically required
by the directory move. W03 must also update package Vitest include globs so
`test/wiring/**/*.wiring-spec.ts` runs in each affected package's normal
package-local `test` gate. No root `test:e2e` or `turbo` task rename is required
by this ADR because W01 found no scoped tooling reference to the exact
`e2e-spec` string.

### D3. Backend integration specs

Package-level backend tests that exercise real backing services through Docker
helpers, test databases, Redis, or similar external integration dependencies
use:

```text
test/integration/**/*.integration.spec.ts
```

This is the current idempotency and ratelimit contract:

- `packages/idempotency/test/integration/idempotency.integration.spec.ts`
- `packages/ratelimit/test/integration/rate-limit.integration.spec.ts`

These files remain package integration specs. They are not rename targets for
R18 W03. Future package-level backend tests should prefer this naming when they
exercise real backend dependencies but not the full reference application as a
system.

### D4. System e2e specs

System e2e suites cross an application boundary and may use the `e2e` label.
There are two current forms:

- Browser system e2e: Playwright specs under `reference/web/test/e2e/`.
- Reference API flow e2e: API flow files under `reference/api/test/e2e/flows/`.

The Playwright contract is:

- `reference/web/playwright.config.mjs` owns the browser suite.
- `testDir` is `./test/e2e`.
- `globalSetup` is `./test/e2e/a11y-global-setup.mjs`.
- Projects are `legacy-api`, `spa-only`, and `spa+api`.
- `spa-only` excludes `@needs-api` tests with `grepInvert: /@needs-api/`.
- `spa+api` includes `@needs-api` tests with `grep: /@needs-api/`.

At the time of this ADR, the project/tag split exists in config, but no
Playwright test file currently contains `@needs-api`. That is a contract
available to future system tests, not a claim about current tagged coverage.

## Why Playwright lives under `reference/web`

`reference/web` is the consumer-shaped Angular application that composes
`@stynx-nyx/*` packages against reference API behavior. Browser e2e belongs
there because the meaningful system boundary is the running SPA plus its
reference backend surface, not an isolated package library.

Per-package web libraries should keep fast unit/behavioral coverage in their own
package test trees. Browser-driven package behavior is proven through the
reference app once packages are composed into routes, providers, auth state,
tenant context, permissions, i18n, storage, and user workflows.

## Consequences

The naming contract makes `e2e` grep-able again: package-level mocked HTTP tests
are wiring specs, Docker-backed package tests are integration specs, and
reference-application boundary tests are e2e specs.

W01's scoped touch-point sweep found zero exact `e2e-spec` references in root,
package, workflow, tool, and script configuration files. The wider e2e-context
search found reference-web CI/local helpers and generic `test:e2e` surfaces, but
not backend `*.e2e-spec.ts` glob coupling. The rename therefore does not exceed
the 10-site ripple threshold from the W02 prompt.

The immediate cost is W03 config hygiene in the affected packages: Vitest
include globs must include `test/wiring/**/*.wiring-spec.ts` where they
currently only include `test/unit/**/*.spec.ts`. That is a deliberate rename
follow-up, not a new test tier or tooling adoption.

## Appendix A - Corrected F-03 draft for W08

Draft replacement row text for `docs/meta/known-gaps.md` F-03, to be reconciled
and landed by R18 W08 rather than this wave:

| #    | Gap                                                                                 | Source                           | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-03 | **Backend wiring specs still need rename closeout; no per-package browser harness** | R18 W02 taxonomy ADR, 2026-06-11 | R17 W03/W04 landed web behavioral depth across `packages-web/*`: the after-baseline shows 46 web spec files and 413 `it()` blocks, up from 35 files and 389 `it()` blocks in `docs/work/round-17/inv-before/web-spec-counts.json`. System-level browser e2e exists: `reference/web/test/e2e/` carries 32 Playwright specs across auth, documents, flows, i18n, iam, permissions, profile, records, sessions, smoke, tenant, work-items, and root compatibility specs, with axe a11y global setup in `reference/web/playwright.config.mjs` and CI execution through `.github/workflows/reference-apps.yml`. Residual gap before W03: 8 backend package files under `packages/*/test/e2e/*.e2e-spec.ts` are controller/route wiring specs, not e2e; R18 W03 is expected to rename them to `test/wiring/*.wiring-spec.ts` per this ADR. `packages-web/*` libraries still do not own browser-driven package-local tests; system e2e covers them through `reference/web`. |
