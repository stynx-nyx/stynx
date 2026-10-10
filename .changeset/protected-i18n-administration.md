---
'@stynx-nyx/i18n': minor
'@stynx-nyx/auth': patch
---

Protect i18n administration with verified authentication and explicit read/write permissions. Add tenant-context administration methods using restricted database roles, validate tenant bindings before cache access, and publish cached updates only after independent commit. Refuse held transactions instead of publishing uncommitted state or borrowing a privileged connection. Existing internal administration methods require an already active SystemContext outside HTTP execution; preauthentication locale resolution retains non-tenant fallbacks without privileged lookups. Declare the actual auth, contracts and idempotency runtime dependencies. Reject invalid protected-route credentials with HTTP 401 while preserving infrastructure failures.
