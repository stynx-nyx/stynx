---
'@stynx-nyx/backend': minor
'@stynx-nyx/contracts': minor
'@stynx-nyx/angular-auth': minor
'@stynx-nyx/sessions': minor
'@stynx-nyx/auth': minor
---

Add opt-in global authorization with trusted tenant context, configurable
targets and denial envelopes, and case-insensitive hierarchical permission
grants in the backend and Angular auth package. Add atomic per-tenant session
policy, verified strong-factor handling, atomic tenant switch, and a bounded
Redis readiness indicator. The fixed STYNX package group advances together.

Consumers using `StynxAuthorizationModule.forRoot({ global: true })` must
register their authentication `APP_GUARD` first. Session policy remains off by
default; hosts enabling it must use an atomic store implementation. The
session readiness indicator composes with the health module. See
`docs/framework/contracts/authorization-session-1.5.md` for the real symbols
and migration behavior.
