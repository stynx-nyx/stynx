# FE-WAVE-A — Public Surface, Standards, Packaging

**Wave goal.** Lock in the modern-Angular standards baseline across `packages-web/*` so every subsequent wave can land with the right shape. Adopt `OnPush`, converge signals + RxJS, ship `package.json#exports` + `ng-package.json` per package, enable the Angular ESLint preset, and add `provideStynxDefaults()`.

## Why first

Every subsequent wave authors new code. Without the standards baseline in place, the new code drifts. Locking it in once, before B–F, costs days and saves weeks.

## Workstreams

### A.1 — Enforce `OnPush` workspace-wide

- Enable `@angular-eslint/prefer-on-push-component-change-detection` (level: error) in `eslint.config.mjs`.
- One-pass fix: add `changeDetection: ChangeDetectionStrategy.OnPush` to every `@Component({...})` decorator under `packages-web/*/src/lib/`. Expect ~30 components.
- Identify and fix any component that breaks under `OnPush`. Typical breaks: observables piped without `async`, mutations to bound array references without `signal.update(arr => [...arr])`.
- Run `pnpm -r test` to verify.

**Files touched.** `eslint.config.mjs`; every `packages-web/*/src/lib/*.component.ts`.

### A.2 — Converge signals + RxJS to signal-as-source-of-truth

Targets:
- `TenantContextService` in `@stynx-web/angular`
- `StynxSessionService` in `@stynx-web/angular-auth`
- `ErrorBannerService` in `@stynx-web/angular`
- `StynxToastService` in `@stynx-web/angular` and `@stynx-web/angular-ui`

For each:
- Keep the signal as canonical state.
- Replace the internal `BehaviorSubject<T>` with `toObservable(signal)` for the `*$` accessor.
- Mark `*$` `@deprecated since: 1.x — use toObservable(this.signal()) or the signal directly`.
- Update any internal consumer that was reading via `*$` to read via the signal.

**Files touched.** Four services + their tests.

### A.3 — `inject()` as default DI

- Mechanical pass: replace `constructor(private x: X, ...)` with `private readonly x = inject(X)`.
- ESLint: add a workspace rule (`@typescript-eslint/prefer-readonly` already on; consider a custom rule or a codemod for the `inject()` migration).

**Files touched.** Every `@Component` / `@Injectable` class in `packages-web/*`.

### A.4 — `provideStynxDefaults()`

Add to `@stynx-web/angular`:

```ts
export interface StynxDefaultsConfig {
  angular?: StynxAngularConfig;
  auth?: StynxAuthConfig;
  tenancy?: StynxTenancyConfig;
  i18n?: StynxI18nConfig;
  flow?: StynxFlowConfig;
  iam?: StynxIamConfig;
  audit?: StynxAuditConfig;
  ui?: StynxUiConfig;
}
export function provideStynxDefaults(config: StynxDefaultsConfig): EnvironmentProviders;
```

`flow`, `iam`, `audit` are optional so consumers can pull only what they need.

**Files touched.** `packages-web/angular/src/lib/provide-defaults.ts`, exported via `index.ts`.

### A.5 — `package.json#exports` + `sideEffects: false`

For every `packages-web/*/package.json`:

```jsonc
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing.d.ts",
      "default": "./dist/testing.js"
    }
  },
  "sideEffects": false
}
```

Each package adds a `src/testing/index.ts` re-exporting its test helpers (mocks, fixtures, `TestBed` factory).

**Files touched.** 11 `package.json` + 11 `src/testing/index.ts`.

### A.6 — Adopt Angular Package Format (`ng-packagr`)

ADR: `docs/adr/ADR-FE-PACKAGING-0001-ng-packagr-adoption.md` — record the decision to publish APF-compliant libraries.

Per package:
- Add `ng-package.json`:
  ```json
  { "$schema": "../../node_modules/ng-packagr/ng-package.schema.json",
    "lib": { "entryFile": "src/index.ts" },
    "dest": "dist",
    "allowedNonPeerDependencies": ["@stynx-web/*"] }
  ```
- Replace the `build` script with `ng-packagr -p ng-package.json`.
- Keep the existing `tsc` build under `build:tsc` for one release as a fallback.
- Add the package to `turbo.json#tasks.build` if not already.
- Verify the output: `dist/fesm2022/...mjs` + `dist/index.d.ts` + `dist/package.json` with `module` / `typings` / `exports` map.

**Files touched.** 11 `ng-package.json` (new), 11 `package.json` (script change), 1 ADR.

### A.7 — Angular ESLint preset

Adopt `@angular-eslint:recommended` + `@angular-eslint/template/recommended`. Spot-additions:
- `@angular-eslint/prefer-on-push-component-change-detection` — error.
- `@angular-eslint/no-input-rename`, `no-output-rename`, `no-output-on-prefix` — error.
- `@angular-eslint/component-class-suffix` — error.
- `@angular-eslint/template/click-events-have-key-events` — warn.

Run `pnpm lint --fix` workspace-wide. Address fail-out by hand.

**Files touched.** `eslint.config.mjs`; component files that fail the new rules.

### A.8 — Permission-denied component + re-login modal

Ship `StynxPermissionDeniedComponent` in `@stynx-web/angular-auth`:

```ts
@Component({ standalone: true, changeDetection: OnPush, selector: 'stynx-permission-denied', ... })
export class StynxPermissionDeniedComponent { ... }
```

Add a default route `provideStynxAuth({ permissionDeniedPath: '/forbidden' })` and a permission-denied view component.

Add a default re-login modal trigger to `AuthInterceptor` when refresh fails: dispatch a `ErrorBannerService.show({ tone: 'error', actionLabel: 'log in', action: () => session.loginRedirect() })`.

**Files touched.** `packages-web/angular-auth/src/lib/permission-denied.component.ts`, `auth.interceptor.ts`.

### A.9 — Icon strategy

Ship `<stynx-icon name="...">` in `@stynx-web/angular-ui`. Resolves SVG from an in-package sprite (`assets/sprite.svg`) by `<use href="#name">`. Document the icon set in the package README. Replace ad-hoc emoji / inline SVG in `angular-flow`, `angular-ui` with `<stynx-icon>` calls.

**Files touched.** `packages-web/angular-ui/src/lib/icon/`; ~20 templates across `angular-flow` + `angular-ui`.

## Success criteria

1. `pnpm lint` passes with `@angular-eslint/prefer-on-push-component-change-detection` at `error`.
2. Every shipped component declares `changeDetection: OnPush`.
3. Every dual-exposed state in the four services is reduced to a signal + `toObservable()` adapter; `*$` accessors are `@deprecated`.
4. `provideStynxDefaults()` exists and compiles; documented in `packages-web/README.md`.
5. Every `packages-web/*/package.json` has `exports`, `sideEffects: false`.
6. Every `packages-web/*` builds via `ng-packagr`; output validates against APF.
7. ADR `ADR-FE-PACKAGING-0001-ng-packagr-adoption.md` exists.
8. `<stynx-permission-denied>` is shipped and rendered when `PermissionGuard` rejects.
9. `<stynx-icon name="...">` is shipped; legacy emoji / inline SVG replaced in `angular-flow` + `angular-ui`.
10. `pnpm test:matrix --no-color --coverage` shows no regression in branches/lines/functions; mutation thresholds unchanged.

## Closure artifact

`docs/work/plan/FE-WAVE-A-report.md` — one row per workstream with commit hash and proof-of-work output.

## Role routing

| Workstream | Authority |
| ---------- | --------- |
| A.1 (`OnPush`) | Engineer |
| A.2 (signals convergence) | Engineer |
| A.3 (`inject()`) | Engineer |
| A.4 (`provideStynxDefaults`) | Engineer |
| A.5 (`exports`, `sideEffects`) | Engineer |
| A.6 (`ng-packagr`) | Architect (ADR) + Engineer |
| A.7 (ESLint) | Engineer |
| A.8 (permission-denied) | Engineer |
| A.9 (icon strategy) | Engineer |
| Tests updated to keep current coverage | Inspector |
