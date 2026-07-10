# 09 - Frontend Patterns

> **Scope.** This chapter is for teams porting an existing frontend to STYNX.
> The canonical frontend adoption guide is
> [`docs/meta/dev/frontend.md`](../../../meta/dev/frontend.md). Keep reusable
> guidance there; keep this chapter focused on migration choices, risk checks,
> and links into the canonical guide and the before/after examples.

## Decision: Keep The UI Framework Or Adopt Angular

Use the smallest migration that gives the product the STYNX request contract.

| Starting point                                                   | Recommended path                                                                                                                                                    | Why                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| React, Vue, Svelte, vanilla TypeScript, mobile bridge, Node tool | Use [`@stynx-nyx/sdk`](/docs/packages-web/sdk) only.                                                                                                                | The SDK is framework-neutral and covers typed HTTP, auth/tenant providers, refresh, and error mapping without pulling Angular into the bundle. |
| Angular app that should keep its current shell                   | Add [`@stynx-nyx/angular`](/docs/packages-web/angular), [`@stynx-nyx/angular-auth`](/docs/packages-web/angular-auth), and only the feature packages the app mounts. | Interceptors, route guards, tenant context, and package UI can be adopted incrementally.                                                       |
| New Angular reference or showcase app                            | Follow the full path in [`docs/meta/dev/frontend.md`](../../../meta/dev/frontend.md).                                                                               | The canonical guide tracks the current reference-web composition.                                                                              |
| Non-TypeScript frontend                                          | Generate or author a local client from the API contract and mimic the SDK header/error/refresh contract.                                                            | STYNX does not ship official non-JS clients in this repo.                                                                                      |

Do not rewrite a mature non-Angular product into Angular just to consume STYNX.
The SDK path is the intended brownfield path for those teams.

## Migration Checklist

1. Inventory all hand-written HTTP clients, auth refresh paths, tenant header
   writers, request-id generators, and error mappers.
2. Decide SDK-only vs Angular package adoption using the table above.
3. Replace manual bearer and tenant header logic with either SDK providers or
   Angular interceptors. Canonical guidance:
   [`Bootstrap`](../../../meta/dev/frontend.md#bootstrap),
   [`Auth`](../../../meta/dev/frontend.md#auth), and
   [`Tenancy`](../../../meta/dev/frontend.md#tenancy).
4. Move navigation authorization into route guards and keep backend
   authorization/RLS authoritative. Canonical guidance:
   [`Routing`](../../../meta/dev/frontend.md#routing).
5. Mount feature packages instead of copying package internals. Canonical
   package map: [`Feature Packages`](../../../meta/dev/frontend.md#feature-packages).
6. Port forms, i18n catalogs, uploads, trash/restore flows, and shared UI in
   small vertical slices. Canonical guidance:
   [`Forms, I18n, And Storage`](../../../meta/dev/frontend.md#forms-i18n-and-storage).
7. Replace string/status-only error handling with STYNX client error classes
   and stable codes. Canonical guidance:
   [`Error Handling`](../../../meta/dev/frontend.md#error-handling).
8. Add or update package Vitest coverage and reference-app Playwright coverage
   according to the R18 W02 taxonomy. Canonical guidance:
   [`Testing`](../../../meta/dev/frontend.md#testing).
9. Run the current frontend production gates, not legacy root `frontend/`
   commands. Canonical guidance:
   [`Production Gates`](../../../meta/dev/frontend.md#production-gates).

## Before / After Example

Use
[`15-REFERENCE-EXAMPLES/before-after-frontend-component.md`](15-REFERENCE-EXAMPLES/before-after-frontend-component.md)
as the worked migration example. It shows a page moving from hand-rolled bearer
headers, tenant local storage, permission parsing, and raw upload calls to:

- `StynxSdkClient` for SDK calls.
- `StynxAngularModule.forRoot(...)` and `StynxAngularAuthModule.forRoot(...)`
  for Angular bootstrap.
- `TenantContextService` and `StynxSessionService.switchTenant(...)` for tenant
  changes.
- `*stynxHasPermission` for affordance gating.
- `<stynx-document-upload>` for presigned upload flow.

## Porting Risk Checks

| Risk                                           | Check                                                                                                                                                       | Canonical source                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Dev auth leaks into production                 | Search for `ReferenceWebDevOidcAdapter`, `ReferenceWebDevAuthBackend`, `reference-dev:`, and `/_reference/dev-login` outside local reference/test contexts. | [`Auth`](../../../meta/dev/frontend.md#auth)                         |
| Manual tenant headers drift from session state | Search for direct `X-Tenant-Id` writes in Angular app code. Keep them in SDK-only transport/provider layers only.                                           | [`Tenancy`](../../../meta/dev/frontend.md#tenancy)                   |
| Route permissions are only decorative          | Verify backend endpoints still enforce permissions and tenant/RLS. Frontend guards do not replace backend enforcement.                                      | [`Routing`](../../../meta/dev/frontend.md#routing)                   |
| Feature package copied instead of mounted      | Prefer `flowRoutes()`, `iamRoutes()`, package components, and package services over local forks.                                                            | [`Feature Packages`](../../../meta/dev/frontend.md#feature-packages) |
| Error handling branches on messages            | Branch on STYNX error class/code, not message text.                                                                                                         | [`Error Handling`](../../../meta/dev/frontend.md#error-handling)     |
| Browser coverage is misclassified              | Keep package behavior in Vitest and system e2e in `reference/web/test/e2e/` per W02.                                                                        | [`Testing`](../../../meta/dev/frontend.md#testing)                   |

## Current Reference Surfaces

- Canonical guide:
  [`docs/meta/dev/frontend.md`](../../../meta/dev/frontend.md).
- Showcase map:
  [`reference/web/README.md`](/docs/reference/web).
- Living Angular composition:
  `reference/web/src/app/reference-web.module.ts` and
  `reference/web/src/app/app.routes.ts`.
- Package catalog:
  [`packages-web/README.md`](/docs/packages-web/).
- R18 test taxonomy ADR:
  [`docs/meta/adr/2026-06-11-test-taxonomy.md`](../../../meta/adr/2026-06-11-test-taxonomy.md).

The older prompt file `_PROMPTS/PORT-09-frontend.md` is generation history,
not current guidance. In particular, its note that
`@stynx-nyx/angular-tenancy` was not implemented is stale; the current tenancy
package and reference app are the authority.
