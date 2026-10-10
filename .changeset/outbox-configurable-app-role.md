---
'@stynx-nyx/data': patch
'@stynx-nyx/outbox': patch
---

Make the application SQL role configuration (UPS-OBX-10, #320; ADR-OUTBOX-0003 D1).
`StynxDataModuleOptions.appRoleName` (default `'stynx_app'`, a PostgreSQL identifier of at most
63 bytes, validated at module construction) is the role `requireActor` transactions, outbox
appends and outbox stream reads expect as `current_user`; `Database.appRoleName` exposes the
resolved name read-only and no request-path literal remains. `TransactionIdentityMismatchError`
gains a typed `mismatch` and `OutboxEventTransactionError` a typed `reason` (also in `context`)
that separate the wrong SQL role from isolation, read-only, recovery, tenant and actor refusals;
every existing code, status and message is kept. Platform migration
`0025_outbox_attempt_guard_role_independent.sql` replaces the body of
`outbox.guard_app_attempt_completion()` so the 0022 immutability checks apply to every role
except the owner of `outbox.event_attempts` (SQLSTATE `42501` kept, no role named). New
fail-closed startup behaviour for every installation: before the application pool serves its
first app-role transaction the data module verifies on an application connection that
`current_user` is the configured role, that it is neither a superuser nor `BYPASSRLS`, and that
a differing `session_user` behind `SET ROLE` satisfies both attribute checks; the outbox module
verifies at bootstrap that the role neither owns nor is a member of the owner of any outbox
relation. A failure raises `AppRoleConfigurationError` (`APP_ROLE_CONFIGURATION`, naming the
property) or `OutboxAppRoleOwnershipError` (`OUTBOX_APP_ROLE_OWNERSHIP`) and prevents startup;
an application pool that is unreachable at bootstrap is checked on its first acquisition.
