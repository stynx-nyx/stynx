---
'@stynx-nyx/audit': minor
'@stynx-nyx/auth': minor
'@stynx-nyx/backend': minor
'@stynx-nyx/contracts': minor
'@stynx-nyx/data': minor
'@stynx-nyx/idempotency': minor
'@stynx-nyx/tenancy': minor
---

Add a transactional HTTP command boundary that commits an audit event and a durable idempotent response with the domain mutation in one tenant-scoped app-role transaction. The fixed STYNX package group advances together.

Apply platform migration `0020_transactional_commands.sql` before enabling command routes. Configure a real `stynx_app` connection for the application pool; the command boundary checks the live database role, tenant and actor. Install `StynxTransactionalCommandModule.forRoot({ auditSink })` and mark protected routes with the built-in STYNX auth guard, `@TransactionalCommand()`, transactional `@Idempotent()` and transactional `@Audit()`. Public tenant commands require `StynxTenancyModule` and `@PublicTenantRoute()`.

Committed responses replay the exact JSON bytes, status, `location`, `retry-after`, `cache-control` and `etag` headers. Do not put cookies or per-request headers in a committed response. An unselected successful status commits the domain change and audit event while clearing its key; an unselected error rolls back. Legacy idempotency behavior remains available on routes without the transactional command marker.
