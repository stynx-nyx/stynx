---
'@stynx-nyx/angular': minor
'@stynx-nyx/angular-auth': minor
'@stynx-nyx/angular-i18n': minor
'@stynx-nyx/angular-ui': minor
'@stynx-nyx/backend': minor
'@stynx-nyx/sdk': minor
'@stynx-nyx/testing': minor
---

Add strong revision `If-Match` parsing, method-scoped 428/412 law errors and
successful-response ETags to Nest routes. Add Angular error classification and
banner handling, an accessible localized shell, and published auth, i18n and
transaction testing helpers. The fixed STYNX package group advances together.

Apply `@RequireIfMatch()` and `@IfMatchRevision()` to revision-protected methods;
the consumer still performs the atomic revision check and throws
`PreconditionFailedError` on a stale value. Add `@RevisionETag()` only when the
successful body has a safe integer `revision`. For transactional commands,
validate that revision before the command commits. Install app-owned i18n
catalogs and provide tenant-qualified shell theme storage keys when a shared
browser can switch tenants.
