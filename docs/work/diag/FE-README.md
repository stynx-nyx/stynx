# Frontend Completeness Diagnostics — stynx

**Compiled:** 2026-05-19
**Author role (Article 6):** Engineer (per user assignment).
**Reads:** [../inv/FE-*](../inv/), `coverage/test-evidence.json`, the source under `packages-web/`.
**Writes:** opinions on what should change, what's flaky, what's redundant, and what's not worth keeping. No source modifications.

## Files in this directory (this audit)

| File                                                                       | Topic                                                                                                    |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [FE-README.md](FE-README.md)                                               | This overview.                                                                                            |
| [FE-01-headline-findings.md](FE-01-headline-findings.md)                   | The ten highest-leverage findings, ranked.                                                                |
| [FE-02-completeness-gaps.md](FE-02-completeness-gaps.md)                   | Per-expectation gap analysis: what's missing or partial, why, and the recommended remediation shape.     |
| [FE-03-standards-compliance.md](FE-03-standards-compliance.md)             | Modern Angular standards: `OnPush`, signals vs RxJS, typed forms, `inject()`, public-API, APF, ESLint.    |
| [FE-04-stale-unused-flaky.md](FE-04-stale-unused-flaky.md)                 | Code that is stale, duplicated, or likely unneeded; brittle / flaky test patterns.                       |
| [FE-05-testing-against-expectations.md](FE-05-testing-against-expectations.md) | Where the test surface understates / overstates / fails to exercise the completeness claims.         |

## Pre-existing diagnostics on disk (NOT touched)

The following testing-pipeline diagnostics remain canonical for their own scope and are unmodified by this pass:

- [01-headline-findings.md](01-headline-findings.md)
- [02-redundancy-and-staleness.md](02-redundancy-and-staleness.md)
- [03-flakiness-and-failures.md](03-flakiness-and-failures.md)
- [04-db-coverage-gaps.md](04-db-coverage-gaps.md)
- [05-evidence-and-aggregation.md](05-evidence-and-aggregation.md)
- [06-frontend-quality.md](06-frontend-quality.md)
- [07-mutation-gaps.md](07-mutation-gaps.md)

This pass complements but does not duplicate them. `diag/06-frontend-quality.md` covers test depth on the existing FE packages; this pass focuses on FE **completeness** vs the user's expectations, with testing as one dimension among several.

## Executive summary

`packages-web/*` ships **the foundation, not the building.** The core layers (`sdk`, `angular`, `angular-auth`, `angular-tenancy`) are clean, modern, and ready. The feature layer (`angular-flow`, `angular-storage`, `angular-i18n`, `angular-ui`) is partially populated. **Three load-bearing capabilities are absent** (IAM admin, audit reports, real translation catalogues). **Three more are stubbed** (profile, sessions, trash — adapter contracts with no default wiring).

The ten highest-leverage moves, ranked:

1. **Author `@stynx-web/angular-iam`** — users / roles / groups / permission-matrix admin UI. The largest single gap; backend endpoints already exist.
2. **Author `@stynx-web/angular-audit`** — audit-log viewer + per-entity history. Mirrors the IAM gap.
3. **Complete `@stynx-web/angular-profile`** — replace the two bare form components with a real profile experience (typed reactive form, view + edit, preferences, password change handoff, MFA enrolment handoff).
4. **Wire default adapters** in `angular-sessions` and `angular-trash`, removing the "host must write adapter" burden for the common case.
5. **Ship real i18n catalogs** — extract every shipped component's template strings and provide at least `en` + one reference locale per package; adopt ICU for plurals.
6. **Enforce `OnPush` workspace-wide** and converge the signal-vs-RxJS dual exposure on signal-as-source-of-truth.
7. **Polish `angular-flow` for 1.0** — empty states, publish/draft separation, runtime "my tasks" inbox, ICU forms, translated strings.
8. **Adopt Angular Package Format** — `ng-package.json`, `package.json#exports`, `sideEffects: false`. Required for external consumers.
9. **Fan out the test surface** — `TestBed` component tests, real router tests, real XHR tests, Playwright scenarios per FE vertical (rows 1–28 of the FE-01 matrix).
10. **Extract a `create-stynx-app` starter** from `reference/web` — the "first 5 minutes" experience for client developers.

Each is actionable, none requires fresh research; all are addressed in [../plan/](../plan/).

## Magnitude

| Bucket                            | Items                                                                                                                          | Effort     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **New packages (greenfield)**     | `@stynx-web/angular-iam`, `@stynx-web/angular-audit`                                                                            | L          |
| **Stub → real**                   | `angular-profile`, `angular-sessions` default adapter, `angular-trash` default adapter                                           | M          |
| **Polish to 1.0**                 | `angular-flow` (empty states, ICU forms, publish badge, inbox), `angular-ui` (form-field, select, date, autocomplete primitives) | M          |
| **Standards / packaging**         | `OnPush`, signals convergence, `inject()`, `exports` map, `sideEffects`, `ng-package.json`                                       | S–M        |
| **i18n**                          | Translation catalog extraction + per-package locale files + ICU                                                                  | M          |
| **Tests**                         | `TestBed` migration, Playwright fan-out, accessibility checks                                                                    | M–L        |
| **Reference / docs**              | Starter template, per-package README usage snippets                                                                              | S          |

Conservative T-shirt: **eight to twelve weeks** of one engineer + one inspector, parallelised across the waves.

## What we are deliberately NOT proposing

- A custom design system. `angular-ui` should remain pragmatic; if the project later adopts Material / Ant / Spartan, that's a future decision.
- Cross-browser Playwright (Firefox / WebKit). Already declined in the testing-pipeline audit; we agree.
- Visual-regression / Percy / Chromatic. Mention only.
- Lighthouse budgets. Mention only.
- Bundle-size budgets. A reasonable add but out of immediate scope.
- Replacing Cytoscape with a richer graph editor in `angular-flow`. Hosts opt in; we keep the list-canvas as the default.

See [FE-02](FE-02-completeness-gaps.md) for the full gap-by-gap analysis and [FE-04](FE-04-stale-unused-flaky.md) for what to delete or rewrite.
