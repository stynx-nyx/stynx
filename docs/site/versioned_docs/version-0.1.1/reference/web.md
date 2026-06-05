---
title: 'Reference Web'
---

# Reference Web

`@stynx/reference-web` is the Angular 20 showcase app for the neutral `sample.*` domain. It demonstrates how a consumer application mounts the `@stynx-web/*` packages against the reference API while keeping auth, tenancy, i18n, storage, flow, IAM, and shared UI wiring visible in one app.

## Demo Surfaces

| Route                                                                       | Demonstrates                                                                                                                                                                 | Package docs                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`                                                                    | STYNX session exchange, OIDC adapter override, permission-denied routing, and the reference-only dev login form.                                                             | [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth), [`@stynx-web/angular`](/docs/packages-web/angular)                                                                                                                                                                                                                     |
| `/`                                                                         | Dashboard composition with tenant/user context, locale switching, currency formatting, upload, active sessions, profile, preferences, banners, and permission-gated actions. | [`@stynx-web/angular-i18n`](/docs/packages-web/angular-i18n), [`@stynx-web/angular-storage`](/docs/packages-web/angular-storage), [`@stynx-web/angular-sessions`](/docs/packages-web/angular-sessions), [`@stynx-web/angular-profile`](/docs/packages-web/angular-profile), [`@stynx-web/angular-ui`](/docs/packages-web/angular-ui) |
| `/tenant`                                                                   | Tenant switching through the session stack and `X-Tenant-Id` plumbing.                                                                                                       | [`@stynx-web/angular-tenancy`](/docs/packages-web/angular-tenancy)                                                                                                                                                                                                                                                                   |
| `/records`, `/records/new`, `/records/:id`, `/records/:id/edit`             | Sample CRUD, route permissions, empty/loading/error states, data table, document upload, and document download.                                                              | [`@stynx-web/angular`](/docs/packages-web/angular), [`@stynx-web/angular-ui`](/docs/packages-web/angular-ui), [`@stynx-web/angular-storage`](/docs/packages-web/angular-storage), [`@stynx-web/sdk`](/docs/packages-web/sdk)                                                                                                         |
| `/work-items`, `/work-items/new`, `/work-items/:id`, `/work-items/:id/edit` | Workflow-adjacent sample records, guarded transitions, and soft-delete entry points.                                                                                         | [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth), [`@stynx-web/angular-ui`](/docs/packages-web/angular-ui)                                                                                                                                                                                                               |
| `/trash`                                                                    | Generic restore and hard-delete UI over reference records and work items.                                                                                                    | [`@stynx-web/angular-trash`](/docs/packages-web/angular-trash)                                                                                                                                                                                                                                                                       |
| `/flow/*`                                                                   | Host-mounted Flow design, runtime, fill, task, waiver, and analytics routes from `flowRoutes()`.                                                                             | [`@stynx-web/angular-flow`](/docs/packages-web/angular-flow)                                                                                                                                                                                                                                                                         |
| `/admin/users`, `/admin/roles`, `/admin/groups`                             | IAM user, role, group, membership, role assignment, and effective-permission screens from `iamRoutes()`.                                                                     | [`@stynx-web/angular-iam`](/docs/packages-web/angular-iam)                                                                                                                                                                                                                                                                           |

## Dev Auth Is Test-Only

The app overrides `STYNX_OIDC_ADAPTER` and `STYNX_AUTH_BACKEND` with `ReferenceWebDevOidcAdapter` and `ReferenceWebDevAuthBackend`. In the default local mode, the login page stores a deterministic `reference-dev:&lt;email&gt;` marker in `sessionStorage` and exchanges it with the reference API at `/_reference/dev-login`.

This bypass is only for local development, deterministic Playwright coverage, and package showcase tests. Production consumers must use the real OIDC adapter/backend from `@stynx-web/angular-auth` or their own audited equivalent. Set `environment.useRealOidc` only when the backing OIDC endpoints are available.

## Local Commands

```bash
pnpm --filter @stynx/reference-web build
pnpm --filter @stynx/reference-web build:web
pnpm --filter @stynx/reference-web serve
pnpm --filter @stynx/reference-web test:e2e
```

The app expects `reference-api` on `http://127.0.0.1:3000` by default.
