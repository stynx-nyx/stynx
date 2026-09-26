# Backend migration: tenancy context in STYNX 1.5

**Status:** contract for the 1.5 implementation; use only after the package release is available. This note covers backend Nest applications. The Engineer's changeset supplies the package CHANGELOG entry.

Import core and tenancy normally. Core's shared CLS middleware seeds `RequestContext` before guards, so remove application patches that reorder global interceptors or manually create a request context for tenancy. For DETRAN this means removing `patchTenantContextInterceptorOrdering`, `seedPortalPublicRequest`, `request.portalPublic`, and `portalRequestHostStorage` once the published 1.5 API replaces them.

For a public tenant endpoint, use `@PublicTenantRoute()` or `@PublicTenantRoute({ optionalAuth: true })` from `@stynx-nyx/auth`. Configure `StynxTenancyModule.forRoot({ publicTenant: { resolveHost, actorId } })`. `resolveHost` receives the raw HTTP Host and normalized path; return an active tenant UUIDv7 or undefined. The configured tenant header is checked against that Host selection. Keep trusted proxy and allowed Host configuration at the deployment/application boundary. Choose a stable RFC UUID nominal actor (v4 or v7) for audit attribution; it grants no roles or permissions. Missing or invalid public options, or a marked route without the tenancy module, fail at application initialization.

Protected routes retain membership and existing header/subdomain settings. On optional-auth public tenant routes, a verified token without membership in the Host tenant is denied; an absent or invalid token uses the nominal public actor. Test both auth guards used by the application, Host/header and Host/claim mismatches, real PostgreSQL RLS, and audited writes before removing the prototype patch.
