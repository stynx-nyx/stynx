---
'@stynx-nyx/angular': minor
'@stynx-nyx/backend': minor
'@stynx-nyx/core': minor
'@stynx-nyx/integration-adapter': minor
'@stynx-nyx/worklist': minor
---

Add raw-body HMAC webhook verification with atomic replay protection, a Nest
guard that clears unverified identity, an injectable clock, a tenant business
calendar using host-provided timezones and holidays, and opt-in Angular
idempotency keys for marked commands. The fixed STYNX package group advances
together.

Consumers must send `sha256=` prefixed signatures, provide a shared replay
store, and configure Nest raw-body capture. Business-day deadlines end at the
exclusive start of the following local civil date; hosts must supply their own
tenant-scoped holiday data.

Angular consumers register `provideStynxIdempotency()` once with
`withInterceptorsFromDi()` and mark each mutating request explicitly. Body
hashing requires a plain JSON object or array; existing idempotency headers
remain authoritative.
