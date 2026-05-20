# FE-01 — Headline Findings (Top 10, Ranked)

**Compiled:** 2026-05-19
**Reads:** [../inv/FE-*](../inv/), `packages-web/*`, `coverage/test-evidence.json`.
**Format:** ten findings, ranked by leverage (highest impact × lowest risk on top). Each carries a one-line recommendation and a pointer to the wave that addresses it.

## 1. **No IAM admin UI ships in `packages-web/*`.** Severity ★★★★★

The user explicitly singles out admin interfaces — "user lifecycle, associations, grants" — as deserving special attention. The current library suite has zero components targeting users / roles / groups / permission management. The backend (per `packages/iam` and `packages/rbac`) exposes the necessary endpoints; the frontend bottleneck is the **only** thing keeping a consuming client from shipping an admin console.

**Recommendation.** Create `@stynx-web/angular-iam`. Standalone components, signal-driven UI state, RxJS service, `OnPush`, `provideStynxIam()`, `iamRoutes()`, full unit + Playwright coverage. Detail in [../inv/FE-03](../inv/FE-03-admin-and-rbac-surfaces.md).

**Wave.** [../plan/FE-WAVE-B](../plan/FE-WAVE-B-admin-iam-ui.md).

---

## 2. **No audit-report UI ships either.** Severity ★★★★★

The expectations list "Common audit report components" alongside IAM. The audit-hash-chain backend, audit emission middleware, and per-entity history endpoints are already in the workspace. There is no FE viewer — list, filter, paginate, per-entity history, hash-integrity indicator.

**Recommendation.** Create `@stynx-web/angular-audit`. Read-only by design; consumes `/audit/events` with cursor pagination; per-entity drill-down; hash-chain integrity badge.

**Wave.** [../plan/FE-WAVE-E](../plan/FE-WAVE-E-tenancy-and-audit.md).

---

## 3. **`@stynx-web/angular-profile` is a 30 %-grade stub.** Severity ★★★★

Two standalone form components (`StynxProfileFormComponent`, `StynxPreferencesFormComponent`) with template-driven `ngModel` inputs, no service, no validation, no submit handler, no API binding, no avatar, no password change, no MFA enrolment.

**Recommendation.** Replace with typed reactive forms (or signal-forms), wire a default `ProfileService` against the SDK profile endpoints, add validation, expose change-password and MFA-enrolment handoff to the OIDC provider's hosted UI. Detail in [FE-02](FE-02-completeness-gaps.md).

**Wave.** [../plan/FE-WAVE-C](../plan/FE-WAVE-C-profile-sessions-completeness.md).

---

## 4. **i18n shipped without translation catalogs.** Severity ★★★★

`angular-i18n` ships the runtime, but no `packages-web/*` package consumes it for its own template literals. Every shipped component renders English strings as static text. A host app that calls `provideStynxI18n({ locale: 'pt-BR' })` will still see English in every `@stynx-web/*` component.

**Recommendation.** Extract per-package translation keys (e.g. `auth.login.title`, `flow.designer.add-node`); migrate templates to `{{ key | translate }}`; ship at least one reference locale alongside `en` for each package; adopt ICU MessageFormat for plurals; add `Intl`-backed date / number / currency pipes to `angular-i18n`.

**Wave.** [../plan/FE-WAVE-D](../plan/FE-WAVE-D-storage-trash-i18n.md).

---

## 5. **Sessions and trash ship adapter contracts but no default adapter.** Severity ★★★

`StynxSessionsAdapter` and `StynxTrashAdapter` are interfaces. A consuming app must implement and provide them, even though the SDK already exposes `/auth/sessions` and the trash endpoints. The "lean and adapter-driven" pattern becomes "no batteries included".

**Recommendation.** Ship default adapters (`SdkSessionsAdapter`, `SdkTrashAdapter`) that consume the SDK out of the box. Keep the adapter interface as an extension point. Add a "current device" indicator + last-IP / user-agent fields to the sessions component.

**Wave.** [../plan/FE-WAVE-C](../plan/FE-WAVE-C-profile-sessions-completeness.md) (sessions) and [../plan/FE-WAVE-D](../plan/FE-WAVE-D-storage-trash-i18n.md) (trash).

---

## 6. **`ChangeDetectionStrategy.OnPush` is not uniform.** Severity ★★★

Components are inconsistent: some declare `OnPush`, many default to `Default`. With signal-based UI state, `Default` is technically harmless but is also a missed opportunity (signals work best under `OnPush`). No ESLint rule guards the regression.

**Recommendation.** Enable `@angular-eslint/prefer-on-push-component-change-detection` workspace-wide; one-pass fix; document the rule in `CONTRIBUTING.md`.

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).

---

## 7. **Signal-vs-RxJS dual exposure invites drift.** Severity ★★★

`TenantContextService`, `StynxSessionService`, `ErrorBannerService`, `StynxToastService` each expose **both** a `signal<T>()` and a `BehaviorSubject<T>` `*$`. Two sources of truth for the same state.

**Recommendation.** Converge on signal-as-source-of-truth. Offer `toObservable(signal)` adapter functions for the (rare) RxJS-only consumer. Mark the `*$` accessors `@deprecated` for one release, then remove.

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).

---

## 8. **No `ng-package.json`; no `package.json#exports`; no `sideEffects: false`.** Severity ★★★

Each `packages-web/*` is `tsc`-built. A non-workspace consumer running `npm i @stynx-web/angular-flow` plugged into the Angular CLI will fail to consume the package as an Angular library (no partial-ivy, no `fesm2022/`). Sub-path imports (`@stynx-web/angular-flow/testing`) are impossible. Bundlers cannot tree-shake.

**Recommendation.** Decide the publication model.
- **External publish:** adopt `ng-packagr`, add `ng-package.json` per package, add `package.json#exports`, declare `sideEffects: false`.
- **Workspace-only:** declare this explicitly in `packages-web/README.md`, keep tsc, but still add `exports` map + `sideEffects` to unlock tree-shaking.

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).

---

## 9. **The test surface does not exercise completeness.** Severity ★★★★

Per `inv/FE-06`: 3 of 28 completeness claims are verified, 9 are surface-only, **16 are unverified**. The 100 % line-coverage is technically true and substantively misleading; it covers stub bodies. Specs avoid `TestBed`, so component templates are unrendered in tests.

**Recommendation.** Migrate component specs to `TestBed`. Add real router tests. Add real XHR tests. Fan out Playwright per vertical (one scenario per `FE-01` row). Cap stub-grade `expect(Component).toBeDefined()` tests at one per package — these are gatekeepers, not coverage.

**Wave.** [../plan/FE-WAVE-G](../plan/FE-WAVE-G-test-fan-out.md).

---

## 10. **No `create-stynx-app` starter exists.** Severity ★★

`reference/web` is a useful demo; it is not a "first 5 minutes" experience. There's no `npx create-stynx-app my-app` flow, no extraction of the wiring code into a schematic / template.

**Recommendation.** Either:
- Extract `reference/web` into a `packages-web/create-stynx-app` template package (Yeoman-style or Angular schematic).
- Or write a 1-page "starting from scratch" guide that walks through `bootstrapApplication` with `provideStynxDefaults()`.

**Wave.** [../plan/FE-WAVE-H](../plan/FE-WAVE-H-reference-app-docs.md).

---

## Risk-and-reward summary

| Finding | Risk if untouched                                                                                | Reward if delivered                                                                                                |
| ------: | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1, 2    | Every client builds its own admin / audit UI, inconsistently, often badly.                      | The single largest reduction in client-side duplicate work the suite can offer.                                    |
| 3       | "Profile" is in the package list but unusable; trust in the suite erodes.                       | A complete profile experience makes onboarding tangible.                                                            |
| 4       | Multi-locale clients cannot ship; international rollouts blocked.                                | Real internationalisation unlocks the market.                                                                       |
| 5       | Adopters write boilerplate that should be in the package.                                       | Batteries-included; faster time to value.                                                                          |
| 6, 7    | Inconsistent code; mixed paradigms; subtle change-detection bugs at scale.                       | Clean, predictable Angular code; lower maintenance overhead.                                                       |
| 8       | Packages are not publishable as Angular libraries; lock-in to the pnpm workspace.               | Open the suite to external Angular consumers.                                                                       |
| 9       | "Looks-green-isn't-exercised" remains the dominant test pattern; regressions hide.              | Confidence that each completeness claim is enforced by a test.                                                     |
| 10      | New developers waste days bootstrapping; bad first impression.                                  | One command, working app, full library suite wired.                                                                |
