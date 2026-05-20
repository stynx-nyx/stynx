# FE-03 — Modern Angular Standards Compliance

**Compiled:** 2026-05-19
**Reads:** [../inv/FE-05](../inv/FE-05-cross-cutting-standards.md), `eslint.config.mjs`, `packages-web/*/tsconfig.json`, `packages-web/*/package.json`.
**Format:** one diagnosis per standard, with the recommended remediation and the wave that delivers it.

## Standalone components

**State.** ✅ Universal in `packages-web/*/src`. Two `NgModule` shims (`StynxAngularModule`, `StynxAngularAuthModule`) survive for legacy hosts.

**Diagnosis.** No corrective action — but the documentation must lead with the standalone happy path. The `NgModule` shims should be footnoted as legacy.

---

## `ChangeDetectionStrategy.OnPush`

**State.** ⚠️ Mixed. Components in `angular-flow`, `angular-storage`, `angular-profile`, `angular-trash` mostly omit the strategy declaration, falling back to `Default`.

**Why it matters.** Signals work under `Default`, but every render cycle still walks the component tree. Under `OnPush`, the cycle stops at the component until a signal it reads is dirty or an input changes. For a UI built on signals, `OnPush` is the canonical strategy.

**Remediation.**
1. Enable `@angular-eslint/prefer-on-push-component-change-detection` in `eslint.config.mjs`.
2. One-pass fix: add `changeDetection: ChangeDetectionStrategy.OnPush` to every `@Component` decorator under `packages-web/*/src/lib/`.
3. Audit any component that breaks under `OnPush` — likely candidates are components that previously relied on `Default` for non-signal-driven re-renders (e.g., observables piped without `async` pipe).

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).

---

## Signals on UI / RxJS on services — convergence

**State.** ⚠️ Dual exposure. Several services expose both a `signal<T>()` accessor and a `BehaviorSubject<T>` `*$`.

**Why it matters.** Two sources of truth invite drift; a future maintainer can update the signal and forget the subject (or vice versa). The signal is the modern canonical; the observable adapter is one line (`toObservable(signal)`).

**Remediation.**
1. Identify every dual-exposed pair.
2. Mark the `*$` accessor `@deprecated since: 1.x — use toObservable(signal)`.
3. Internally replace any `*$.next(value)` with `signal.set(value)` and emit through `toObservable` for the deprecated reads.
4. Remove the `*$` accessor in the next major.

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).

---

## Typed reactive forms (or signal-forms)

**State.** 🟠 Profile, Preferences, Fills use template-driven `ngModel`.

**Why it matters.** Template-driven forms lose type information at the `FormGroup` boundary; validation is scattered across the template; cross-field validators are awkward.

**Remediation.** Migrate `StynxProfileFormComponent`, `StynxPreferencesFormComponent`, `StynxFlowFillsComponent`, and any new admin forms to typed reactive forms using `NonNullableFormBuilder.group(...)`. Surface form state via signals (Angular 20's `toSignal(form.statusChanges)` works cleanly).

**Wave.** [../plan/FE-WAVE-C](../plan/FE-WAVE-C-profile-sessions-completeness.md), [../plan/FE-WAVE-F](../plan/FE-WAVE-F-flow-installable.md), [../plan/FE-WAVE-B](../plan/FE-WAVE-B-admin-iam-ui.md).

---

## `inject()` over constructor DI

**State.** ⚠️ Mixed. Both patterns coexist.

**Remediation.** Adopt `inject()` as the default. Constructor DI is fine but should be the exception. ESLint has no out-of-the-box rule, but `tslint-to-eslint`-style codemods exist; in practice a one-pass `sed` or codemod over `*.component.ts` and `*.service.ts` is enough.

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).

---

## `provideX()` factories

**State.** ✅ All present. Missing: a convenience `provideStynxDefaults()`.

**Remediation.** Add to `@stynx-web/angular`:

```ts
export function provideStynxDefaults(config: StynxDefaultsConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideStynxAngular(config.angular),
    provideStynxAuth(config.auth),
    provideStynxTenancy(config.tenancy),
    provideStynxI18n(config.i18n),
    ...(config.flow ? [provideStynxFlow(config.flow)] : []),
    ...(config.iam ? [provideStynxIam(config.iam)] : []),
    ...(config.audit ? [provideStynxAudit(config.audit)] : []),
  ]);
}
```

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).

---

## Public-API barrel

**State.** ✅ Each package uses `src/index.ts`. The pattern is consistent.

**Diagnosis.** Document the convention in `packages-web/README.md`. Audit each `index.ts` to confirm no internal types leak (a few `export *` from `src/lib/types.ts` likely re-export private helpers).

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).

---

## `package.json#exports` map

**State.** 🟠 Absent.

**Why it matters.** Without `exports`, sub-path imports (`@stynx-web/angular-flow/testing`) cannot exist. The whole surface is funneled through a single barrel. Bundlers must fall back to legacy resolution.

**Remediation.** Per package:

```jsonc
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  },
  "./testing": {
    "types": "./dist/testing.d.ts",
    "default": "./dist/testing.js"
  }
}
```

Plus add `"sideEffects": false` (or an explicit list if some module has top-level effects).

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).

---

## `ng-package.json` and Angular Package Format

**State.** 🟠 Absent. Builds use `tsc` only.

**Why it matters.** External Angular CLI consumers expect APF-shaped libraries (`fesm2022/`, partial-ivy compilation, peer-dep mapping). A `tsc`-built library works inside the pnpm workspace; it may fail in an external CLI app.

**Decision needed.** Is the suite intended for external publication?
- **Yes.** Adopt `ng-packagr` per package. `pnpm add -D -w ng-packagr`. Add `ng-package.json` with the entry-file. Replace `tsc` build script with `ng-packagr -p ng-package.json`.
- **No.** Document the workspace-only nature; keep `tsc`. Externals would consume via git submodule or repo fork — non-standard.

**Recommendation.** Adopt `ng-packagr` even if the current consumers are workspace-only. The cost is small (one build script + one config), the future-proofing is large.

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).

---

## TypeScript strictness

**State.** ✅ `strict` is on workspace-wide.

**Diagnosis.** Consider `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Both are likely to surface real bugs (defensive index access in services, `undefined`-vs-missing-property in DTO handling). Trade-off: a sweep of `cast(x ?? throw new Error(...))` is required; reasonable cost for the safety.

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md), optional sub-stream.

---

## ESLint Angular rules

**State.** ⚠️ Partial. Angular-specific rules are not consistently enabled.

**Remediation.** Adopt `@angular-eslint:recommended` and `@angular-eslint/template/recommended` presets. Spot-add:
- `@angular-eslint/prefer-on-push-component-change-detection` — error.
- `@angular-eslint/no-input-rename`, `no-output-rename`, `no-output-on-prefix` — error.
- `@angular-eslint/component-class-suffix` — error.
- `@angular-eslint/template/click-events-have-key-events` — warn (a11y).
- `@angular-eslint/template/no-any` — warn.

**Wave.** [../plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md).

---

## Accessibility

**State.** 🟠 Absent.

**Remediation.** Adopt `@axe-core/playwright`. One axe-scan per Playwright scenario; budgets configurable per page. Add a workspace task `pnpm test:a11y` that runs the Playwright suite with axe enabled and outputs a JSON report under `.test-results/a11y.json`.

**Wave.** [../plan/FE-WAVE-G](../plan/FE-WAVE-G-test-fan-out.md).

---

## TestBed adoption

**State.** 🟠 Specs avoid `TestBed`, use raw `Injector.create`.

**Why it matters.** Template-rendering, input-change, output-emission, structural-directive behaviour are unverifiable without `TestBed`. Vitest + jsdom + `@angular/core/testing` work cleanly together; the cost is the boilerplate.

**Remediation.** Provide a `test/support/test-bed.ts` helper per package that pre-wires `provideStynx*`, common mocks, and a `renderComponent<T>(C, { inputs, providers })` factory. Migrate one component spec per package to demonstrate the pattern; require all new specs to use it.

**Wave.** [../plan/FE-WAVE-G](../plan/FE-WAVE-G-test-fan-out.md).

---

## Summary

The standards story is **mostly compliant for primitives, mostly non-compliant for polish**. Standalone is uniform; `OnPush` is half-done; signals-vs-RxJS is dual-exposed; typed forms are missing in three packages; packaging metadata is absent. None of these is hard to fix; all of them are visible to any modern Angular reviewer.
