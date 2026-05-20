# FE-05 — Cross-Cutting Standards Compliance

**Compiled:** 2026-05-19
**Reads:** every `packages-web/*` package, plus `eslint.config.mjs`, the workspace `tsconfig.json`, and the existing `inv/03-frontend.md`.
**Subject.** Modern Angular standards across the suite: standalone components, signals on UI, RxJS in services, change detection, DI, public API barrels, typed forms, library packaging.

## Standards expected

| Standard                                                   | Why it matters                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Angular ≥ 20, standalone components only                   | NgModules are legacy; standalone is canonical for new code.                                                          |
| `ChangeDetectionStrategy.OnPush` on every component        | Required for correctness when state is signal-driven; avoids spurious re-renders.                                    |
| Signals for UI state, RxJS for HTTP / streams              | The user states this explicitly: "signal on UI side, RxJS on services interactions".                                 |
| Typed reactive forms (or signal-forms when available)       | Type-safe, signal-friendly form state.                                                                                |
| `inject()` over constructor DI in standalone code           | Cleaner; works in `@Component` standalone classes; avoids field-order issues.                                        |
| `provideX()` factories over `NgModule` shims for setup      | Modern wiring under `bootstrapApplication`.                                                                          |
| Public-API barrel (`public-api.ts` or `index.ts`) only      | One canonical entry point per package; sub-path imports are explicit.                                                |
| `package.json#exports` map                                  | Allows tree-shaking; locks the surface; supports condition-based resolution.                                          |
| `sideEffects: false` declaration                            | Allows tree-shaking; needed for bundlers to drop unused code.                                                         |
| `ng-package.json` + Angular Package Format (APF) compliance | Required for external Angular CLI consumers expecting `fesm2022/`, partial-ivy, peer-dep mapping.                     |
| `@axe-core/playwright` accessibility checks                 | Industry default for shipped UIs.                                                                                    |

## Findings

### Standalone

- ✅ Every component examined declares `standalone: true`. No `NgModule`-resident components found in `packages-web/*/src`.
- ⚠️ Both `StynxAngularModule` (in `@stynx-web/angular`) and `StynxAngularAuthModule` (in `@stynx-web/angular-auth`) survive as `NgModule` shims for legacy hosts. They are documented as "for hosts that haven't migrated to standalone yet". Acceptable, but the standalone `provideStynxX()` factory must be the documented happy path.

### ChangeDetectionStrategy

- ⚠️ Inconsistent. Sample check across `packages-web/angular-flow/src/lib/`:
  - `flow-task-card.component.ts` — `OnPush`.
  - `flow-graph-designer.component.ts` — `Default` (no strategy declared, hence `Default`).
  - `flow-fills.component.ts` — `Default`.
- ⚠️ No ESLint rule (`@angular-eslint/prefer-on-push-component-change-detection`) is enabled in `eslint.config.mjs`.
- **Impact.** Signals work with `Default`, but the suite cannot claim "modern Angular" if half its components opt out of `OnPush`. A workspace-wide rule + a one-pass fix is cheap.

### Signals vs RxJS split

The user's stated split is: signals on the UI layer, RxJS on services / HTTP. The current code maintains this most of the time, but:

- ⚠️ **Dual exposure.** `TenantContextService`, `StynxSessionService`, `ErrorBannerService`, `StynxToastService` each expose **both** a `signal<T>()` accessor and an `Observable<T>` field (`*$`). Two sources of truth invite drift. Either:
  - Expose only the signal and offer `toObservable(signal)` for the (rare) RxJS-only consumer; or
  - Expose only the observable and offer `toSignal(observable)` on the consumer side.
  - Convergence on signal-as-source-of-truth is the modern Angular default.
- ⚠️ Some components subscribe to observables in `ngOnInit` and write the value into a `signal` — the dual exposure encourages this. With signal-only services, `toSignal()` does it in one line.

### Forms

- ⚠️ `StynxProfileFormComponent` and `StynxPreferencesFormComponent` use **template-driven** forms (`[(ngModel)]`). No `FormGroup`, no typed `FormControl<T>`, no validators.
- ⚠️ `StynxFlowFillsComponent` similarly uses template-driven forms.
- The Angular signal-forms preview (`@angular/forms-experimental` patterns) is not used; reactive typed forms also not used.
- **Impact.** Forms are weakly typed; validation rules cannot be authored centrally; per-field errors are hand-rolled.

### DI

- ⚠️ Mixed `constructor(private x: X)` and `private x = inject(X)`. Standalone Angular code is best served by `inject()` because it composes cleanly with `untracked()`, signals, and effect contexts.

### Provider factories

- ✅ `provideStynxAngular`, `provideStynxAuth`, `provideStynxTenancy`, `provideStynxFlow`, `provideStynxI18n` all exist.
- ⚠️ No `providePresetX` overloads to bundle the common case (e.g., `provideStynxDefaults()` = `[provideAngular, provideAuth(...), provideTenancy(...), provideI18n(...)]`).

### Public API barrel

- ✅ Every package has `src/index.ts` re-exporting its public surface.
- ⚠️ Not all packages restrict their `index.ts` rigorously — a few re-export entire `src/lib/types.ts` files including internal helper types.
- ⚠️ No package has a `public-api.ts` convention. Either pattern is fine; current state is consistent (always `index.ts`), so leave it.

### `package.json#exports`

- 🟠 **No package declares an `exports` map.** Each falls back to `main` / `types` from package.json:
  ```jsonc
  // packages-web/angular-flow/package.json
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  ```
- ⚠️ Sub-path imports (`@stynx-web/angular-flow/testing`) are not possible. There is no way to ship a `testing` sub-entry today.
- ⚠️ `sideEffects` field is missing in every package. Bundlers must conservatively assume side effects exist, so dead code is not eliminated.

### Library packaging (APF)

- 🟠 **No `ng-package.json`** in any package. All build with raw `tsc`. Distribution structure:
  ```
  packages-web/angular-flow/dist/
    index.js, index.d.ts, lib/*.js, lib/*.d.ts
  ```
  vs the APF-compliant structure expected by Angular consumers:
  ```
  fesm2022/<scope>-<name>.mjs, esm2022/, index.d.ts, package.json with module/typings/exports
  ```
- **Impact.** A non-workspace consumer running `npm i @stynx-web/angular-flow` plugged into Angular CLI will fail on partial-ivy compilation and missing `fesm2022/` resolution. The packages are only usable inside the stynx pnpm workspace today.
- 🟡 If the intent is to publish externally (the `1.0.0` versions in most packages suggest yes), `ng-packagr` and `ng-package.json` are required.

### TypeScript strictness

- ✅ Root `tsconfig.json` enables `strict` (per the test-results audit). Each `packages-web/*/tsconfig.json` extends it.
- ⚠️ `"noUncheckedIndexedAccess"` not enabled workspace-wide — caught by inspection of a few `users[id]` style accesses in service code.

### ESLint

- The Angular ESLint plugin is present (per `eslint.config.mjs` lines 1–43 of a glanced read) but several recommended rules are disabled or absent:
  - `@angular-eslint/component-class-suffix` — typically enforced; current naming follows it, but no rule guards regressions.
  - `@angular-eslint/prefer-on-push-component-change-detection` — not enabled.
  - `@angular-eslint/no-input-rename`, `no-output-rename`, `no-output-on-prefix` — should be enabled.
  - `@angular-eslint/template/no-any` — not enabled.
- The eslint config is mostly oriented toward general TypeScript hygiene, not Angular-specific rules. See [diag/FE-03](../diag/FE-03-standards-compliance.md).

### Accessibility

- 🟠 **No accessibility test.** No `@axe-core/playwright` integration, no `@angular-eslint/template/click-events-have-key-events` rule, no `aria-*` attribute coverage in spec assertions.

### Tests vs standards

- The `vitest` jsdom setup is standard and works well; not contested.
- Existing `inv/03-frontend.md` notes the **lack of `TestBed` use** for component tests — most specs construct components via `Injector.create(...)` and `runInInjectionContext(...)`. This works for guards and tokens but is inadequate for components with templates / inputs / outputs / effect-driven re-renders. Adopting `TestBed` (or the new `runInInjectionContext`-friendly variants from Angular 20) is a uniform fix.

## Summary table

| Standard                                  | State        | Action                                                                                          |
| ----------------------------------------- | -----------: | ----------------------------------------------------------------------------------------------- |
| Standalone components                      | ✅           | Keep; the two `NgModule` shims are documented as legacy.                                        |
| `OnPush` change detection                  | ⚠️ mixed    | Enable ESLint rule; one-pass fix.                                                                |
| Signals (UI) vs RxJS (services)            | ⚠️ dual    | Converge: signal-as-source-of-truth, `toObservable()` for RxJS facade.                          |
| Typed reactive forms                       | 🟠 absent  | Replace `ngModel` in `profile` / `preferences` / `fills` forms with typed `FormGroup`.          |
| `inject()` DI                              | ⚠️ mixed   | Lint rule + one-pass fix.                                                                       |
| `provideX()` factories                     | ✅           | Add `provideStynxDefaults()` convenience.                                                       |
| Public-API barrel                          | ✅           | Document the convention in `packages-web/README.md`.                                            |
| `package.json#exports` map                 | 🟠 absent  | Add per-package; declare `.` and `./testing`.                                                   |
| `sideEffects: false`                       | 🟠 absent  | Add per-package.                                                                                |
| APF / `ng-package.json`                    | 🟠 absent  | Decide: external publish → adopt `ng-packagr`; workspace-only → document.                       |
| `strict` TypeScript                        | ✅           | Consider `noUncheckedIndexedAccess`.                                                            |
| ESLint Angular rules                       | ⚠️ partial | Adopt the canonical `@angular-eslint:recommended` preset.                                       |
| Accessibility                              | 🟠 absent  | Add `@axe-core/playwright` to the E2E run.                                                      |
| `TestBed` component tests                  | 🟠 sparse  | Adopt as the default in this audit's wave plan.                                                  |

Each row maps to a workstream in [plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md) and [plan/FE-WAVE-G](../plan/FE-WAVE-G-test-fan-out.md).
