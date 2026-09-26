---
'@stynx-nyx/core': minor
'@stynx-nyx/contracts': minor
'@stynx-nyx/auth': minor
'@stynx-nyx/backend': minor
'@stynx-nyx/tenancy': minor
---

Initialize one request context before guards, add explicit public tenant routes with Host-based tenant selection and optional verified authentication, and reject conflicting tenant sources. The fixed STYNX package group advances together.

Backend migration: replace application-specific public request seeds and global interceptor-order patches with `StynxTenancyModule.forRoot({ publicTenant: { resolveHost, actorId } })` and `@PublicTenantRoute()`. Keep the application's Host allow-list and configure proxy Host forwarding explicitly. The nominal `actorId` must be a valid UUID. Remove DETRAN prototype helpers `patchTenantContextInterceptorOrdering`, `seedPortalPublicRequest`, `request.portalPublic`, and `portalRequestHostStorage` after adopting this API.
