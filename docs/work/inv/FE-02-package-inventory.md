# FE-02 — Per-Package Inventory

**Compiled:** 2026-05-19
**Reads:** `packages-web/*/{package.json, src/index.ts, src/lib/*.ts, test/*.spec.ts, vitest.config.ts}`.
**Format:** one section per package. Each section lists exports, peer deps, signal-vs-RxJS usage, public-API barrel state, test surface, and a short verdict on whether it stands alone as an installable library.

All packages target Angular ≥ 20 (peer deps `^20.2.0`), TypeScript 6.x, and are built with `tsc` (no `ng-package.json`). All components are `standalone: true`. The shared selector prefix is `stynx-`.

---

## `@stynx-web/sdk` — version 1.0.0

**Shape.** Framework-agnostic TypeScript client wrapping the auto-generated OpenAPI types.

**Exports (from `src/index.ts`).**

- `StynxSdkClient`, `StynxHttpTransport`, `AuthProvider`, `TenantProvider`, `SessionManager`
- `parseJwtPayload`, `normalizePermissions`, JWT type definitions
- `GeneratedStynxSdk` — re-export of the OpenAPI-generated client surface
- `RefreshTokenStorage` (in-memory + sessionStorage modes)

**Peer deps.** None on Angular. The SDK is reusable in non-Angular consumers.

**Signals vs RxJS.** The token store inside the SDK uses `signal()` (imported from `@angular/core/primitives/signals` shim, not `@angular/core` directly — preserves framework-neutrality). The transport returns `Promise`-based methods, not `Observable`s; Angular adapters wrap these.

**Public-API barrel.** `src/index.ts` re-exports the entire surface. No `public-api.ts` convention. Adequate for library consumers; explicit is better than implicit (see [FE-05](FE-05-cross-cutting-standards.md)).

**Test surface.** 16 tests across `test/transport.spec.ts` and `test/runtime.spec.ts`. Coverage: lines 100 %, branches 97.86 %. **Mutation score 67.81 %** — the lowest of the recorded web-side scores. Happy-path HTTP only; no `401-refresh`, `429-retry`, `503-fallback`, `abort`, `timeout` cases (per `diag/06-frontend-quality.md`).

**Verdict.** ✅ Solid core; mutation gaps signal under-tested error paths.

---

## `@stynx-web/angular` — version 1.0.0

**Shape.** Core integration package: interceptors, tenant context, error UX services.

**Exports.**

- `AuthInterceptor`, `ErrorInterceptor`, `RequestIdInterceptor`, `TenantInterceptor`
- `TenantContextService` (signal-based), `ErrorBannerService`, `StynxToastService` (queue, signals + RxJS)
- `EmptyStateComponent` (standalone)
- `StynxAngularModule` (NgModule shim for legacy hosts) and `provideStynxAngular()` standalone provider

**Peer deps.** `@angular/common`, `@angular/core`, `@angular/router`.

**Signals vs RxJS.** Mixed by design. `TenantContextService` and `StynxToastService` expose both a `signal<T>()` accessor and a `BehaviorSubject<T>` `*$` observable — this is duplication that costs maintenance; see [FE-05](FE-05-cross-cutting-standards.md) for the recommendation to converge on signals plus `toObservable()` adapters.

**Test surface.** 14 tests in one spec; 1 spec file. Mutation score 76.54 %.

**Verdict.** ✅ Core layer present.

---

## `@stynx-web/angular-auth` — version 1.0.0

**Shape.** Cognito-OIDC + STYNX-session-exchange + permission guard.

**Exports.**

- `StynxSessionService` (implements SDK's `AuthProvider`)
- `OidcClientAdapter` (Cognito Hosted UI + PKCE)
- `StynxAuthBackend` (session exchange against `/auth/session`)
- `AuthGuard`, `PermissionGuard`, `*stynxHasPermission` structural directive
- `LoginRedirectComponent`, `LogoutButtonComponent`
- `RefreshTokenStorage` modes — `memory`, `session`, `cookie` (tab-scoped)
- `StynxAngularAuthModule` for NgModule hosts

**Peer deps.** `@angular/common`, `@angular/core`, `@angular/forms`, `@angular/router`.

**Signals vs RxJS.** Auth state via signal; backwards-compat observable `state$`. Some duplication.

**Stubs.** Two `not implemented` sites in the OIDC adapter for advanced flows (silent renew with custom IdP); safe defaults — they throw informative errors only when called outside the documented happy path.

**Test surface.** 12 tests; jsdom-based. Coverage: branches 93.98 % (6 % gap traced to the `permission.guard.ts` permission-set comparison branch — see Wave A in [plan/FE-WAVE-A](../plan/FE-WAVE-A-public-surface.md)).

**Verdict.** ✅ Login + permission gating shipped. MFA enrolment UI is not in scope here (lives in the OIDC provider) and is acceptable.

---

## `@stynx-web/angular-profile` — version 1.0.0

**Shape.** Two bare standalone form components.

**Exports.**

- `StynxProfileFormComponent` — `<stynx-profile-form>`, displays inputs for `firstName / lastName / email`, no service binding.
- `StynxPreferencesFormComponent` — `<stynx-preferences-form>`, displays inputs for `locale / theme / timezone`, no service binding.

**Peer deps.** `@angular/common`, `@angular/core`, `@angular/forms`.

**Signals vs RxJS.** Components use template-driven `ngModel`; no signal-based form state, no `signal-forms` integration, no `FormGroup` validators.

**Test surface.** 2 tests; both `expect(Component).toBeDefined()`. Coverage 100 % because the component bodies are empty of behavior.

**Verdict.** 🟠 **STUB.** The package exists to claim the namespace but does not deliver a working profile experience. No service, no API binding, no submit, no validation, no avatar, no password change, no MFA enrolment, no preferences persistence. See [plan/FE-WAVE-C](../plan/FE-WAVE-C-profile-sessions-completeness.md).

---

## `@stynx-web/angular-sessions` — version 1.0.0

**Shape.** Active-session list with adapter pattern.

**Exports.**

- `StynxActiveSessionsComponent` — `<stynx-active-sessions>`, renders a list of `StynxActiveSession` objects, emits a `revoke` event.
- `StynxSessionsAdapter` interface — `list(): Observable<StynxActiveSession[]>`, `revoke(id): Observable<void>`, `revokeOthers(): Observable<void>`.
- `STYNX_SESSIONS_ADAPTER` injection token.

**Peer deps.** `@angular/common`, `@angular/core`.

**Signals vs RxJS.** Component uses signals for the list state; adapter contract is RxJS.

**Test surface.** 1 test (`expect(Component).toBeDefined()`).

**Verdict.** 🟡 **PARTIAL.** The component is correct for what it does, but no default adapter is shipped, so a consumer must wire its own. The SDK already exposes `/auth/sessions` and `/auth/sessions/{id}` endpoints; a default `SdkSessionsAdapter` would make this drop-in. No "this device" indicator, no last-IP / last-user-agent display. See [plan/FE-WAVE-C](../plan/FE-WAVE-C-profile-sessions-completeness.md).

---

## `@stynx-web/angular-storage` — version 1.0.0

**Shape.** Presigned-PUT upload component + service.

**Exports.**

- `StynxDocumentUploadComponent` — `<stynx-document-upload>`, accepts `accept`, `maxBytes`, emits `uploadStart`, `progress`, `uploadComplete`, `uploadError`.
- `DocumentService` — `initiate(...)`, `complete(...)`, `list(...)`, `delete(...)`, `restore(...)`.
- `XhrUploadExecutor` — raw `XMLHttpRequest` PUT with progress events.
- `STYNX_UPLOAD_EXECUTOR` injection token.

**Peer deps.** `@angular/common`, `@angular/core`.

**Signals vs RxJS.** Component uses signals for upload state (idle / uploading / done / error). Service is RxJS.

**Test surface.** 6 tests; covers happy upload, mime rejection, size rejection. No XHR error / abort / timeout test; no progress assertion against a fake `XHR.upload`.

**Verdict.** 🟡 Single-file upload works. Missing: drag-and-drop, chunked / multi-part upload, resumable upload (tus.io / S3 multipart), download component with progress, in-app save-as / rename, virus-scan callback. See [plan/FE-WAVE-D](../plan/FE-WAVE-D-storage-trash-i18n.md).

---

## `@stynx-web/angular-trash` — version 1.0.0

**Shape.** Generic trash-list with adapter pattern.

**Exports.**

- `StynxTrashListComponent` — `<stynx-trash-list>`, renders a list, allows restore / hard-delete.
- `StynxTrashAdapter` interface — `list(): Observable<StynxTrashItem[]>`, `restore(id)`, `hardDelete(id)`.
- Type `StynxTrashItem` — `id / kind / deletedAt / retentionUntil / label`.

**Peer deps.** `@angular/common`, `@angular/core`.

**Test surface.** 2 tests; export-existence shape.

**Verdict.** 🟡 Same shape as `angular-sessions`: correct contract, no default adapter, no bulk-restore, no per-kind grouping, no retention countdown UI, no "purged" filter. See [plan/FE-WAVE-D](../plan/FE-WAVE-D-storage-trash-i18n.md).

---

## `@stynx-web/angular-tenancy` — version 0.1.0

**Shape.** Tenant context + interceptor + switcher.

**Exports.**

- `TenantContextService` (signal-based `tenantId`, `tenantLabel`, `availableTenants`)
- `TenantSwitcherComponent` — `<stynx-tenant-switcher>`
- `TenantInterceptor` — injects `X-Tenant` header
- `provideTenancy({ adapterFactory })` standalone provider
- Tokens — `STYNX_TENANT_CONTEXT`, `STYNX_TENANT_ADAPTER`

**Peer deps.** `@angular/common`, `@angular/core`, `@angular/forms`.

**Test surface.** 10 tests across 2 spec files; jsdom + node. Mutation score 72.73 %.

**Verdict.** ✅ Complete. Open question: "state reset on tenant change" is a host responsibility today; a default `tenantChanged$` bus that other packages can subscribe to would lower the integration burden (see [diag/FE-02](../diag/FE-02-completeness-gaps.md)).

---

## `@stynx-web/angular-i18n` — version 1.0.0

**Shape.** Runtime catalog loader + locale switcher + translate pipe.

**Exports.**

- `I18nService` — `localeState` signal, `catalogState` signal, `setLocale(locale)`, `loadCatalog(locale)`.
- `LocaleSwitcherComponent` — `<stynx-locale-switcher>`.
- `TranslatePipe` — `{{ 'auth.login.title' | translate }}` returns `string | null` until the catalog resolves.
- `STYNX_I18N_CONFIG` token.

**Peer deps.** `@angular/common`, `@angular/core`.

**Test surface.** 3 tests; jsdom.

**Verdict.** ✅ on the mechanism, 🟡 on the deliverable. The package ships the runtime, but **not the catalogs** any consuming app needs. The other `packages-web/*` packages do **not** consume `TranslatePipe` for their own template strings — they ship untranslated literals — so even after `provideStynxI18n()`, a host app sees English-only UI. See [plan/FE-WAVE-D](../plan/FE-WAVE-D-storage-trash-i18n.md) and [diag/FE-02](../diag/FE-02-completeness-gaps.md).

---

## `@stynx-web/angular-ui` — version 1.0.0

**Shape.** UI primitives kit.

**Exports.**

- `StynxBannerComponent` (info / warn / error tone)
- `StynxToastContainerComponent` + `StynxToastService` (signal queue)
- `StynxTableComponent` (data grid: rows in, sort / select events out)
- `StynxPaginationComponent`
- `StynxLoadingSpinnerComponent`
- `StynxConfirmDialogComponent`
- `EmptyStateComponent` (re-exported from `@stynx-web/angular`)

**Peer deps.** `@angular/common`, `@angular/core`.

**Test surface.** 7 tests; jsdom.

**Verdict.** 🟡 Six primitives + toast service is a thin kit for the scope. Missing: form-field primitive (label + hint + error wrapper), date / select / chip / autocomplete inputs, card primitive, side-nav primitive, breadcrumb primitive, an icon strategy (sprite vs Material vs Heroicons — currently mixed in templates), a theme tokens contract (light / dark / accent).

---

## `@stynx-web/angular-flow` — version 0.1.0

**Shape.** Full workflow UI on top of the `@stynx/flow` engine.

**Exports.**

- `StynxFlowGraphDesignerComponent` — node / edge visual builder
- `StynxFlowGraphCanvasComponent` — list-based canvas (no spatial layout)
- `StynxFlowTaskCardComponent`, `StynxFlowFormsComponent`, `StynxFlowFillsComponent`, `StynxFlowWaiversComponent`
- `StynxFlowAnalyticsComponent` — open-tasks dashboard
- `StynxFlowDesignDialogsComponent` — modal dialogs for graph edits
- `FlowApiService` — full CRUD over scopes / graphs / forms / tasks / runs / fills / waivers
- `flowRoutes()` exportable Routes array
- `provideStynxFlow({ clientFactory })` standalone provider
- `STYNX_FLOW_CLIENT` injection token
- 20+ types: `FlowScope`, `FlowGraph`, `FlowNode`, `FlowEdge`, `FlowForm`, `FlowTask`, `FlowRun`, `FlowFill`, `FlowWaiver`, …

**Peer deps.** `@angular/common`, `@angular/core`, `@angular/router`.

**Test surface.** 19 tests across 3 spec files (canvas, designer, API). Branches 91.89 %.

**Verdict.** ✅ Most complete of the feature packages. See [FE-04](FE-04-flow-ui-inventory.md) for the deep-dive.

---

## `reference/web` — consuming Angular app

Outside `packages-web/*` but in scope for "is the library suite installable by a client developer?".

- Angular 20 standalone app, uses `provideStynxAngular`, `provideStynxAuth`, `provideStynxTenancy`, `provideStynxFlow`.
- Dev-auth bypass (`reference-web-dev-auth.backend.ts`, `reference-web-dev-oidc.adapter.ts`) used in tests; production builds gate it behind an environment flag.
- 4 Playwright scenarios. Backend is mocked (static SPA, no `reference-api` boot).
- Not extracted as a `create-stynx-app` starter template.

**Verdict.** 🟡 Useful as a guide but not a "first 5 minutes" client onboarding experience.

---

## Cross-package observations

- **No `ng-package.json`** in any package — packages are `tsc`-built. Workable for direct `pnpm` workspace consumption; risky for an external publisher who expects Angular Package Format (`fesm2022/`, partial-ivy compilation, `sideEffects: false` annotation, `module` / `main` / `exports` map).
- **No `public-api.ts`** convention — each package uses `src/index.ts`. Either is fine; pick one and apply uniformly.
- **No `Storybook` or per-package demo / playground**. The only "live" surface is `reference/web`.
- **No `package.json#exports` field** in any package — sub-path imports rely on relative paths, which prevents tree-shaking and locks consumers to the top-level barrel.
- **Three intentionally-thin packages** (`angular-profile`, `angular-sessions`, `angular-trash`) follow a "UI shell + adapter contract" pattern. That pattern is fine in isolation; combined with no default adapter and no documentation, the result is a series of half-finished features rather than three lean ones.
- **Missing packages** for the assignment scope:
  - `@stynx-web/angular-iam` — users / roles / groups / permission-matrix admin UI.
  - `@stynx-web/angular-audit` — audit-log viewer + per-entity history.
- See [FE-03](FE-03-admin-and-rbac-surfaces.md) for the IAM detail and [FE-05](FE-05-cross-cutting-standards.md) for the standards detail.
