# Frontend Completeness Remediation Plan — stynx

**Compiled:** 2026-05-19
**Author role (Article 6):** Engineer (per user assignment, proposing); Architect + Engineer + Inspector (executing — see Article 6 routing per file).
**Reads:** [../inv/FE-*](../inv/), [../diag/FE-*](../diag/).
**Writes:** an ordered, wave-by-wave plan to bring the `packages-web/*` library suite up to the user's completeness expectations without disturbing the existing testing-pipeline programme already in flight under `WAVE-*` and the new `frontend-completeness` work.

## Files in this directory (this plan)

| File                                                                           | Wave / topic                                                                            |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [FE-README.md](FE-README.md)                                                   | This overview, sequencing, success criteria, role routing.                              |
| [FE-LIFTUP-completion-plan.md](FE-LIFTUP-completion-plan.md)                   | Post-interruption completion plan for the FE lift-up recovery session.                   |
| [FE-WAVE-A-public-surface.md](FE-WAVE-A-public-surface.md)                     | Standards + packaging baseline. `OnPush`, signal convergence, `exports`, `ng-package`. |
| [FE-WAVE-B-admin-iam-ui.md](FE-WAVE-B-admin-iam-ui.md)                         | New package `@stynx-web/angular-iam` (users / roles / groups / permission-matrix).      |
| [FE-WAVE-C-profile-sessions-completeness.md](FE-WAVE-C-profile-sessions-completeness.md) | Profile (stub → real) + Sessions (default adapter + polish).                  |
| [FE-WAVE-D-storage-trash-i18n.md](FE-WAVE-D-storage-trash-i18n.md)             | Storage download + multipart; trash default adapter + bulk; i18n catalogs + ICU.        |
| [FE-WAVE-E-tenancy-and-audit.md](FE-WAVE-E-tenancy-and-audit.md)               | Tenancy polish + new package `@stynx-web/angular-audit`.                                |
| [FE-WAVE-F-flow-installable.md](FE-WAVE-F-flow-installable.md)                 | `@stynx-web/angular-flow` polish to 1.0.                                                |
| [FE-WAVE-G-test-fan-out.md](FE-WAVE-G-test-fan-out.md)                         | TestBed migration + per-vertical Playwright + a11y + mutation rebase.                   |
| [FE-WAVE-H-reference-app-docs.md](FE-WAVE-H-reference-app-docs.md)             | `create-stynx-app` starter + per-package READMEs.                                       |

## Pre-existing waves on disk (NOT touched)

The following testing-pipeline waves remain in flight and are unmodified:

- [WAVE-00-baseline-truth.md](WAVE-00-baseline-truth.md)
- [WAVE-01-coverage-100.md](WAVE-01-coverage-100.md)
- [WAVE-02-api-error-matrix.md](WAVE-02-api-error-matrix.md)
- [WAVE-03-db-runtime.md](WAVE-03-db-runtime.md)
- [WAVE-04-real-e2e.md](WAVE-04-real-e2e.md)
- [WAVE-05-mutation-completeness.md](WAVE-05-mutation-completeness.md)
- [WAVE-06-pipeline-hardening.md](WAVE-06-pipeline-hardening.md)
- [WAVE-07-cleanup.md](WAVE-07-cleanup.md)
- [CLOSURE-REGISTRY.md](CLOSURE-REGISTRY.md)

The `FE-WAVE-*` files here run **in parallel** with the existing waves but do not depend on them. The two programmes converge in `WAVE-G` (which inherits the mutation-completeness gating policy from `WAVE-05`).

## Sequencing

```
FE-A baseline + packaging ──┬─► FE-B IAM ─────────┐
                            ├─► FE-C profile+sessions ┤
                            ├─► FE-D storage+trash+i18n ┤
                            ├─► FE-E tenancy+audit ┤
                            └─► FE-F flow polish ─┘
                                                    │
                                                    └──► FE-G test fan-out ──► FE-H reference + docs
```

- **FE-A is the precondition** for every other wave. It locks in the standards (OnPush, signals convergence, package exports, ng-packagr) so every later wave can land with the right shape.
- **FE-B through FE-F** are independent. Their packages don't share files; they can run in parallel by separate workers.
- **FE-G** runs after each of FE-B…FE-F so the tests it authors target the just-completed surface. In practice, FE-G is a rolling wave: as each feature wave closes, the test fan-out catches up.
- **FE-H** is last: it consolidates the experience into a starter template and per-package READMEs.

## Success criteria (against the user's expectations)

| Expectation                                | Wave    | Definition of done                                                                                                                                       |
| ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication / Login                     | FE-A    | OnPush + signals converged; permission-denied component shipped; default re-login modal on 401-after-refresh. Tests in FE-G.                              |
| Profile (view / edit / prefs / password / MFA) | FE-C | Typed reactive forms; `ProfileService` against SDK; avatar via `angular-storage`; password / MFA handoff to OIDC hosted UI. Tests in FE-G.                |
| Sessions                                    | FE-C    | `SdkSessionsAdapter` shipped; "this device" badge; revoke-all-others confirm dialog; toast feedback. Tests in FE-G.                                       |
| Users / Roles / Groups admin                | FE-B    | New package `@stynx-web/angular-iam` covering users / roles / groups / permission-matrix / effective-permissions admin; routes; provider; documentation. |
| Permissions admin                           | FE-B    | Permission matrix component + role / group editors inside `@stynx-web/angular-iam`. Runtime check (`*stynxHasPermission`) unchanged.                       |
| i18n from start                             | FE-D    | Per-package translation catalogs (`en` + 1 reference locale); every template migrated to `| translate`; ICU support; `Intl`-backed date / number pipes.    |
| Storage upload / download / trash           | FE-D    | Multipart + resumable upload; download component with progress; trash default adapter + bulk operations + retention countdown; scan-status callback hook. |
| Tenancy                                     | FE-E    | `tenantChanged$` event + state-reset bus; tenant chooser at login; tenant context in error toasts.                                                        |
| Audit reports                               | FE-E    | New package `@stynx-web/angular-audit` (log viewer + entity history + hash-integrity badge).                                                              |
| Workflow UI on `@stynx/flow`                | FE-F    | 1.0 release: empty states, publish/draft separation, "my tasks" inbox, ICU forms, translated strings, real router tests, full Playwright scenario.        |
| Modern Angular standards                    | FE-A    | OnPush uniform; signals on UI; RxJS on services (signal-as-source-of-truth, observable adapters only); typed forms in every form-bearing component.        |
| Library packaging                           | FE-A    | Per-package `ng-package.json`, `package.json#exports`, `sideEffects: false`, optional `./testing` sub-entry.                                              |
| Test surface                                | FE-G    | TestBed-rendered component specs everywhere; per-vertical Playwright; `@axe-core/playwright` non-blocking report; mutation thresholds rebased.            |
| Starter template + docs                     | FE-H    | `create-stynx-app` template extracted from `reference/web`; per-package README with install + import + `provideX` snippet.                                |

## Role routing (Article 6)

Each wave document carries its own role table. Headline routings:

- **Architect** authors: any new ADR (e.g., "FE library packaging policy"); any new policy under `scripts/test-matrix.config.json`; the FE testing contract update.
- **Engineer** authors: all new code under `packages-web/`, all changes under `reference/web/`, the `create-stynx-app` template, the ESLint config additions, the build-pipeline changes (`ng-packagr`).
- **Inspector** authors: every new `*.spec.ts` under `packages-web/*/test/`, every new Playwright spec under `reference/web/test/e2e/`.
- **Auditor** authors: this very directory (`docs/work/plan/FE-*`), per-wave closure reports, the programme-level summary.

## Out-of-scope (deliberate non-goals)

- Cross-browser Playwright (already declined in the prior testing-pipeline audit).
- Visual regression (Percy / Chromatic).
- Lighthouse / web-vitals budgets.
- Custom design system. Pragmatic primitives only.
- Replacing the list-canvas in `angular-flow` with a spatial graph editor.
- A native (Capacitor / Tauri) shell of `reference/web`.

## Cost estimate (calibration)

Per-wave T-shirt sizing, assuming one engineer + one inspector pair:

| Wave   | Size  | Notes                                                                                                                                       |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| FE-A   | M     | Standards sweep + packaging adoption. Mostly mechanical; large surface. 4–6 days.                                                            |
| FE-B   | L     | New IAM package, ~12 components + service + routes + tests. 8–12 days.                                                                       |
| FE-C   | M     | Profile rewrite + sessions default adapter + polish. 4–6 days.                                                                               |
| FE-D   | M-L   | Storage + trash polish + i18n catalogs (whole-suite migration is the time-sink). 6–9 days.                                                   |
| FE-E   | M-L   | Tenancy polish + new audit package. 6–9 days.                                                                                                |
| FE-F   | M     | Flow polish to 1.0. 5–7 days.                                                                                                                |
| FE-G   | M-L   | TestBed migration + Playwright fan-out + a11y. 6–10 days.                                                                                    |
| FE-H   | S-M   | Starter template + per-package README. 3–5 days.                                                                                             |
| **Total** | **~9 weeks** | Two-pair team; less if parallelised across FE-B…FE-F.                                                                                |

## Risks

- **Scope creep on `angular-iam`.** IAM is large; a "do everything" rewrite is L→XL. Mitigation: ship the user / role / group / permission-matrix vertical first; defer effective-permissions viewer + impersonation + bulk-import to a v1.1.
- **i18n migration breaking existing templates.** Mitigation: per-package translation keys are introduced before catalog files; templates migrate file-by-file under PR review; a `pnpm i18n:check` script flags untranslated literals.
- **`ng-packagr` adoption regressing the build.** Mitigation: keep `tsc` build alongside as a fallback during the transition; promote `ng-packagr` only when both builds match.
- **Playwright wall-time explosion.** Mitigation: parallelise with `--workers=4`; per-spec ≤ 5 min budget; serial gating optional in CI.
- **Audit package depends on backend hash-chain semantics that may shift.** Mitigation: pin to the current audit contract; coordinate with `packages/audit` owners before authoring the component.

## How to consume the prompt pack

The companion [../prompts/FE-*](../prompts/) directory contains an orchestrator prompt and one worker prompt per wave. The orchestrator decomposes a wave into per-package work items; the worker prompts execute one package at a time. Each prompt:

- States the wave's success criterion verbatim.
- Cites the relevant Constitution Article.
- Names the canonical files the worker may edit (its substrate of authority).
- Specifies validation commands.
- Specifies the closure artifact (a row in `docs/work/plan/FE-WAVE-<X>-report.md`).
