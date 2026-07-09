# Frontend Adopter Guide

This is the canonical stynx frontend adoption guide. It explains the path an adopter walks from first bootstrap to production gates, and it points at the reference web app and package READMEs as the living examples.

Audience split:

- Building or modernizing an Angular app: start here, then read the referenced `@stynx-web/*` package docs.
- Porting an existing non-Angular frontend: keep the app framework and use [`@stynx-web/sdk`](/docs/packages-web/sdk); the porting-specific checklist lives in [`FRONTEND-PATTERNS`](/docs/adopters/stynx/porting-pack/FRONTEND-PATTERNS).
- Reading the showcase app: use [`reference/web/README.md`](/docs/reference/web) as the route map and this guide for the adoption narrative.

## Reference App

The reference implementation is [`@stynx-nyx/reference-web`](/docs/reference/web), an Angular app under `reference/web/src/app/`. It composes:

- Foundation providers from [`@stynx-web/angular`](/docs/packages-web/angular).
- Auth, OIDC, route guards, permission directives, and session exchange from [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth).
- Tenant context and tenant header plumbing from [`@stynx-web/angular-tenancy`](/docs/packages-web/angular-tenancy).
- Flow routes from [`@stynx-web/angular-flow`](/docs/packages-web/angular-flow).
- IAM routes from [`@stynx-web/angular-iam`](/docs/packages-web/angular-iam).
- I18n, storage, sessions, profile, trash, audit, and UI packages from the package READMEs under [`packages-web/`](/docs/packages-web/).

The showcase is intentionally small enough to inspect. Use `reference/web/src/app/reference-web.module.ts` for provider wiring, `reference/web/src/app/app.routes.ts` for route guards and host-mounted package routes, and `reference/web/src/app/core/` for the shell services that adapt the reference API to the reusable packages.

## Bootstrap

An Angular adopter starts by installing the foundation module and only the feature packages it actually mounts. The reference app wires this in `reference/web/src/app/reference-web.module.ts`:

- `StynxAngularModule.forRoot(...)` sets the API base URL, bearer-session mode, and default tenant resolver.
- `StynxAngularAuthModule.forRoot(...)` configures OIDC, login redirects, and unauthorized routing.
- `StynxI18nModule.forRoot(...)` supplies the app catalog loader.
- `DocumentService`, `XhrUploadExecutor`, and `STYNX_UPLOAD_EXECUTOR` enable the storage upload flow.

`@stynx-web/angular` registers the request-id, auth, and error interceptors. `@stynx-web/angular-tenancy` registers tenant context and the tenant interceptor through the tenancy provider used by the foundation module. Do not hand-write those headers in feature pages unless you are deliberately outside Angular and using the SDK-only path.

For non-Angular adopters, [`@stynx-web/sdk`](/docs/packages-web/sdk) is the contract. Provide an `AuthProvider`, `TenantProvider`, `baseUrl`, and `fetchFn`; keep React/Vue/Svelte/Node state management in the host app.

## Auth

Production auth uses the real OIDC adapter/backend from [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth) or an audited equivalent that implements the same package contracts.

The reference app also ships local-only test adapters:

- `reference/web/src/app/core/reference-web-dev-oidc.adapter.ts`
- `reference/web/src/app/core/reference-web-dev-auth.backend.ts`

These adapters store deterministic `reference-dev:<email>` state and exchange it with the reference API's `/_reference/dev-login` endpoint. They exist for local development, deterministic Playwright coverage, and package showcase tests. They are not a production pattern. Keep that boundary visible in adopter docs and code review.

The shell flow is in `reference/web/src/app/core/reference-web-shell.service.ts`:

- `login(...)` starts dev or real OIDC login.
- `initialize()` resumes an existing local/real session.
- `logout()` clears session and tenant context.

## Tenancy

Every authenticated request is tenant-scoped. In Angular apps, use [`TenantContextService`](/docs/packages-web/angular-tenancy) and the provided tenant interceptor rather than manually setting `X-Tenant-Id`.

The reference app demonstrates the lifecycle in `reference/web/src/app/core/reference-web-shell.service.ts`:

- Choose a tenant at login.
- Set tenant context before completing the login exchange.
- Call `session.switchTenant(tenantId)` when the user changes tenant so the bearer session rotates with the tenant.

Use the package's tenant switcher/picker components when the default UI fits. If the app needs a custom selector, still write through `TenantContextService` and the session service instead of keeping an unrelated local storage key.

## Routing

Use route guards for application boundaries and permission directives for element-level affordances.

The reference route table is `reference/web/src/app/app.routes.ts`. Patterns to copy:

- Public routes (`/login`, `/unauthorized`) have no auth guard.
- Authenticated shell routes use `stynxAuthGuard`.
- Resource routes add `stynxPermissionGuard('<permission>')`.
- Feature packages are mounted as children, for example `children: flowRoutes()` under `/flow` and `...iamRoutes()` under `/admin`.

Keep backend authorization authoritative. Frontend guards improve navigation and prevent confusing affordances, but backend permissions and RLS still enforce access.

## Feature Packages

Mount reusable UI packages instead of copying package internals into the adopter app.

| Need                                               | Package / surface                                                                                                                        | Living example                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Typed HTTP without Angular                         | [`@stynx-web/sdk`](/docs/packages-web/sdk)                                                                                               | Porting-pack SDK path in [`FRONTEND-PATTERNS`](/docs/adopters/stynx/porting-pack/FRONTEND-PATTERNS) |
| Angular foundation and interceptors                | [`@stynx-web/angular`](/docs/packages-web/angular)                                                                                       | `reference/web/src/app/reference-web.module.ts`                                                     |
| Login, session, route guards, permission directive | [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth)                                                                             | `reference/web/src/app/pages/login.page.ts`, `reference/web/src/app/app.routes.ts`                  |
| Tenant selector and tenant header context          | [`@stynx-web/angular-tenancy`](/docs/packages-web/angular-tenancy)                                                                       | `reference/web/src/app/pages/tenant-selection.page.ts`                                              |
| Flow design/runtime/fill/tasks                     | [`@stynx-web/angular-flow`](/docs/packages-web/angular-flow)                                                                             | `/flow/*` route mount in `reference/web/src/app/app.routes.ts`                                      |
| IAM users, roles, groups, permissions              | [`@stynx-web/angular-iam`](/docs/packages-web/angular-iam)                                                                               | `/admin/*` route mount in `reference/web/src/app/app.routes.ts`                                     |
| I18n catalog, translate pipe, locale switcher      | [`@stynx-web/angular-i18n`](/docs/packages-web/angular-i18n)                                                                             | `reference/web/src/app/core/reference-web-i18n.service.ts`                                          |
| Presigned document upload/download                 | [`@stynx-web/angular-storage`](/docs/packages-web/angular-storage)                                                                       | `reference/web/src/app/pages/records.page.ts`                                                       |
| Trash/restore UI                                   | [`@stynx-web/angular-trash`](/docs/packages-web/angular-trash)                                                                           | `reference/web/src/app/pages/trash.page.ts`                                                         |
| Profile and sessions surfaces                      | [`@stynx-web/angular-profile`](/docs/packages-web/angular-profile), [`@stynx-web/angular-sessions`](/docs/packages-web/angular-sessions) | `reference/web/src/app/pages/dashboard.page.ts`                                                     |
| Shared banners, tables, dialogs, toasts            | [`@stynx-web/angular-ui`](/docs/packages-web/angular-ui)                                                                                 | Reference pages under `reference/web/src/app/pages/`                                                |

## Forms, I18n, And Storage

Use Angular reactive forms for feature pages and keep persistence behind an app service. The reference pages use a small `ReferenceWebApiService` in `reference/web/src/app/core/reference-web-api.service.ts` for CRUD and idempotency-key calls, while package surfaces handle cross-cutting behavior.

I18n belongs in the i18n package configuration. The reference app wires `StynxI18nModule.forRoot(...)` to `ReferenceWebI18nService.catalog(...)` in `reference/web/src/app/core/reference-web-i18n.service.ts`, so pages consume package pipes/components instead of hard-coding locale state.

Storage uses the package upload flow: initiate, upload to the presigned URL, then complete. See [`@stynx-web/angular-storage`](/docs/packages-web/angular-storage) for the component/service API and `reference/web/src/app/pages/records.page.ts` for page composition.

## Error Handling

SDK and Angular paths converge on typed STYNX client errors. In Angular, the foundation error interceptor maps `HttpErrorResponse` into the SDK error classes and surfaces banners through the shared UI services. In SDK-only apps, catch the same SDK error classes in the host framework.

Guidance:

- Branch on stable error codes/classes, not localized messages.
- Treat `401` as auth/session handling. Let refresh and `onAuthFailure` complete before showing UI.
- Treat `403` as an authorization outcome. Show a permission/access message; do not redirect to login.
- Treat `409` as a user-action conflict. Reload or merge data, then retry with a fresh idempotency key when appropriate.

## Testing

Use the R18 W02 taxonomy in [`2026-06-11-test-taxonomy.md`](../adr/2026-06-11-test-taxonomy.md):

- Package-local frontend behavior belongs in package Vitest specs.
- Component and provider behavior should use the R17 TestBed helper pattern when Angular template/provider compilation matters. Representative helpers live in `packages-web/angular/test/support/test-bed.ts`, `packages-web/angular-iam/test/support/test-bed.ts`, and similar package `test/support/` folders.
- Browser system e2e belongs under `reference/web/test/e2e/` and is driven by `reference/web/playwright.config.mjs`.

Useful commands:

```bash
pnpm --filter @stynx-nyx/reference-web build
pnpm --filter @stynx-nyx/reference-web build:web
pnpm --filter @stynx-nyx/reference-web test:e2e
pnpm frontend:a11y-gate
```

Run package-specific Vitest suites with `pnpm --filter <package> test` when changing a package. Run the reference app Playwright suite when package composition, route guards, auth state, tenant context, or storage/i18n/profile/session flows change.

## Production Gates

The old root `frontend/` commands are obsolete. The current production-oriented frontend gates are root `pnpm` scripts:

- `pnpm frontend:production-smoke` checks critical web package test scripts, package test presence, testing exports, consumer fixture imports, and the SDK route smoke script.
- `pnpm frontend:a11y-gate` checks the reference web Playwright and axe accessibility wiring.
- `pnpm release:web-sourcemaps` verifies web source-map policy through `scripts/verify-web-sourcemaps.mjs`.
- `pnpm --filter @stynx-nyx/reference-web build:web` builds the deployable reference SPA bundle.

For release/readiness work, pair those with the broader release gates named in [`production-readiness-evidence.md`](/docs/adopters/stynx/production-readiness-evidence).
