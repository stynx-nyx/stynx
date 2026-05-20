# FE-04 — Stale, Unused, and Flaky Patterns

**Compiled:** 2026-05-19
**Reads:** `packages-web/*`, `reference/web/*`, the pre-existing `inv/03-frontend.md` + `diag/06-frontend-quality.md`.
**Format:** one finding per pattern; each carries a "delete", "fold", "rewrite", or "keep but rename" recommendation.

## 1. Per-package `*.e2e-spec.ts` smokes are misleading

**Finding.** Every `packages-web/*/test/e2e/*.e2e-spec.ts` is a single `expect(Component).toBeDefined()` test. They are export-existence checks misnamed as "E2E". Per `inv/03-frontend.md`, this pattern is workspace-wide.

**Why it matters.** Anyone reading the test output thinks "E2E passes" while in fact no user journey has been exercised at the package level. The pre-existing testing-pipeline audit's W7 cleanup already proposes to delete these.

**Recommendation.** **Delete.** Rely on the real Playwright suite in `reference/web/` + the new TestBed component specs (see [FE-03](FE-03-standards-compliance.md#testbed-adoption)). If a per-package "consumer smoke" is genuinely useful, rename to `consumer-smoke.spec.ts` and treat as a unit test.

---

## 2. Dual signal-and-subject exposure (the same state in two places)

**Finding.** `TenantContextService`, `StynxSessionService`, `ErrorBannerService`, `StynxToastService` expose state through both a `signal<T>()` accessor and a `BehaviorSubject<T>` `*$` observable.

**Why it matters.** Two sources of truth invite drift; a future maintainer can update one and forget the other. The signal is the canonical; the observable is one line of adapter code.

**Recommendation.** **Rewrite.** Converge on signal-as-source-of-truth; offer `toObservable(signal)` for callers that need an `Observable`. Mark the existing `*$` accessor `@deprecated`.

See [FE-03](FE-03-standards-compliance.md#signals-on-ui--rxjs-on-services--convergence) and `plan/FE-WAVE-A`.

---

## 3. Two `NgModule` shims survive

**Finding.** `StynxAngularModule` (in `@stynx-web/angular`) and `StynxAngularAuthModule` (in `@stynx-web/angular-auth`).

**Why it matters.** They are documented as "for hosts that haven't migrated to standalone yet". Angular 20+ is standalone-first; the shims are vestigial.

**Recommendation.** **Keep but rename for clarity** — `LegacyStynxAngularModule` etc., or just mark `@deprecated since: 1.x`. The shims are cheap to maintain and useful for one transition wave; remove in 2.0.

---

## 4. Template-driven forms in `angular-profile`

**Finding.** `StynxProfileFormComponent` and `StynxPreferencesFormComponent` use `[(ngModel)]`. No `FormGroup`, no typed validators.

**Why it matters.** Type safety is lost; cross-field validation is awkward; signal-friendly form state is unavailable.

**Recommendation.** **Rewrite.** Typed reactive forms. See `plan/FE-WAVE-C`.

---

## 5. `package.json#scripts.test:e2e` placeholder

**Finding.** Every `packages-web/*/package.json` has a `test:e2e` script that echoes "test:e2e removed during V6 cutover" and exits 1.

**Why it matters.** Running `pnpm -r test:e2e` produces non-zero exits. It's intentional — a placeholder for a removal that landed — but a long-lived intentional failure is a maintenance smell.

**Recommendation.** **Delete the placeholder entirely**. CI doesn't invoke it; humans should not either.

---

## 6. `expect(Component).toBeDefined()` as the entire test body

**Finding.** Several specs (`angular-profile`, `angular-sessions`, `angular-trash`, plus the per-package "e2e" files) consist exclusively of one assertion that the class exists at import time.

**Why it matters.** This proves only that TypeScript compiled and the export survived tree-shaking. It does not test behaviour. Combined with thin source files, it produces the 100 % coverage paradox in `coverage/test-evidence.json`.

**Recommendation.** **Rewrite.** Migrate each to `TestBed`-rendered fixtures asserting input / output / DOM behaviour. Per `plan/FE-WAVE-G`.

---

## 7. The `reference/web` dev-auth bypass

**Finding.** `reference/web/src/app/core/reference-web-dev-auth.backend.ts` and `reference-web-dev-oidc.adapter.ts` short-circuit OIDC for the Playwright run.

**Why it matters.** It works (the SPA boots in tests) but it disconnects E2E from the real auth path. Real Cognito + real session-exchange are never exercised. An OIDC regression slips through.

**Recommendation.** **Keep as the default, but add an opt-in real-OIDC path.** A `PLAYWRIGHT_USE_REAL_OIDC=1` env switch that boots `reference-api` + an `oidc-fake` provider (already in `tools/oidc-fake-server/` per the testing audit) gives the suite a real-auth E2E. See `plan/FE-WAVE-G`.

---

## 8. Hardcoded admin / tenant in Playwright specs

**Finding.** `reference/web/test/e2e/reference-web.spec.ts` (etc.) hardcode `admin@sample-demo.test` and tenant UUID `01978f4a-32bf-7c27-a131-fd73a9e001a1`.

**Why it matters.** Already flagged in `diag/03-flakiness-and-failures.md`. A seed change rotates the UUID; every spec breaks.

**Recommendation.** **Fold** into a shared `reference/web/test/e2e/fixtures.ts` (referenced from every spec). Already proposed by the pre-existing audit; we agree.

---

## 9. Untranslated literal strings in `packages-web/*` templates

**Finding.** Every shipped component renders English text directly in the template ("Login", "Submit", "Add node", "Approve waiver", "No tasks yet").

**Why it matters.** Once a consumer wires `provideStynxI18n({ locale: 'pt-BR', catalog: ... })`, the suite remains visibly English. Adoption in non-English markets is blocked.

**Recommendation.** **Rewrite** every template to consume `| translate` (or `$localize` if the build pipeline switches). Ship per-package translation catalogs. Per `plan/FE-WAVE-D`.

---

## 10. `mutate: []` arrays hand-maintained per package

**Finding.** Already noted in `diag/01-headline-findings.md` finding 9. The `stryker.conf.mjs` per package has hand-curated `mutate:` arrays.

**Why it matters in the FE context.** As new `*.component.ts` files land (e.g., the new IAM and Audit packages), they must be remembered for the mutation array. Easy to forget.

**Recommendation.** **Keep but lint.** Add a workspace invariant that compares `mutate:` to `src/**/*.ts` and fails when a source file is silently excluded. Per `plan/FE-WAVE-G`.

---

## 11. Mixed icon strategy

**Finding.** Components in `angular-flow` and `angular-ui` use inline emoji, inline SVG, and (in one spot) a CSS class that assumes Material icons. There is no single icon strategy.

**Why it matters.** Inconsistent visual language; bundle-size unpredictable; harder for downstream theming.

**Recommendation.** **Standardise.** Either ship a small `<stynx-icon name="...">` component that resolves SVG from a sprite, or commit to a specific icon library and document it in `angular-ui`'s README. Per `plan/FE-WAVE-A`.

---

## 12. `packages-web/*/README.md` is mostly absent

**Finding.** The top-level `packages-web/README.md` is one paragraph. Per-package READMEs are sparse — they exist but rarely show installation, import path, or usage snippet.

**Why it matters.** A consuming developer has to read source to learn the API.

**Recommendation.** **Author** a one-page README per package: install, peer-deps, `provideX` snippet, the public surface, and a "see also" cross-link. Per `plan/FE-WAVE-H`.

---

## 13. `coverage/` aggregate-scratch lingering after success

**Finding.** `coverage/.aggregate-scratch/packages-web__*/unit/coverage-final.json` lingers between runs.

**Why it matters.** Pollutes the coverage view of newly-removed packages; can mask coverage drops if a package is renamed without cleaning scratch.

**Recommendation.** **GC.** Add a `pnpm coverage:clean` script (or have the aggregate harness clean scratch on success). Already proposed by the pre-existing audit's W7; we agree.

---

## 14. No `OnPush` regression guard

**Finding.** When a new component is authored without `changeDetection: ChangeDetectionStrategy.OnPush`, nothing flags it.

**Recommendation.** ESLint rule (see [FE-03](FE-03-standards-compliance.md#changedetectionstrategyonpush)). Trivial to enable.

---

## 15. Vestigial `src/i18n/` folders that are empty

**Finding.** Some packages have `src/i18n/` (or `src/lib/i18n/`) directories that exist as placeholders for translation catalogs but ship empty.

**Why it matters.** Empty folders confuse new contributors and the file-tree.

**Recommendation.** **Delete** until catalogs land. Per `plan/FE-WAVE-D`.

---

## Net effect

Of the 15 patterns above, **four are deletions** (#1, #5, #6 in part, #15), **two are renames** (#3, #11 partial), **six are rewrites** (#2, #4, #6, #7, #9, #11), **three are guards** (#10, #12, #14), and **one is a fold-in** (#8). None is large; all are addressed across the waves.
