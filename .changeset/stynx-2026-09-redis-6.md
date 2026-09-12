---
'@stynx-nyx/angular': patch
'@stynx-nyx/angular-audit': patch
'@stynx-nyx/angular-auth': patch
'@stynx-nyx/angular-flow': patch
'@stynx-nyx/angular-i18n': patch
'@stynx-nyx/angular-iam': patch
'@stynx-nyx/angular-profile': patch
'@stynx-nyx/angular-sessions': patch
'@stynx-nyx/angular-storage': patch
'@stynx-nyx/angular-tenancy': patch
'@stynx-nyx/angular-trash': patch
'@stynx-nyx/angular-ui': patch
'@stynx-nyx/audit': patch
'@stynx-nyx/auth': patch
'@stynx-nyx/backend': patch
'@stynx-nyx/cli': patch
'@stynx-nyx/contracts': patch
'@stynx-nyx/core': patch
'@stynx-nyx/data': patch
'@stynx-nyx/feature-flags': patch
'@stynx-nyx/flow': patch
'@stynx-nyx/health': patch
'@stynx-nyx/i18n': patch
'@stynx-nyx/idempotency': patch
'@stynx-nyx/jobs': patch
'@stynx-nyx/integration-adapter': patch
'@stynx-nyx/logging': patch
'@stynx-nyx/notifications': patch
'@stynx-nyx/mobile-runtime': patch
'@stynx-nyx/offline-sync': patch
'@stynx-nyx/outbox': patch
'@stynx-nyx/pdf': patch
'@stynx-nyx/pdf-a': patch
'@stynx-nyx/pdf-a-vera-docker': patch
'@stynx-nyx/preferences': patch
'@stynx-nyx/privacy': patch
'@stynx-nyx/ratelimit': patch
'@stynx-nyx/sdk': patch
'@stynx-nyx/sessions': patch
'@stynx-nyx/signature': patch
'@stynx-nyx/storage': patch
'@stynx-nyx/tenancy': patch
'@stynx-nyx/testing': patch
'@stynx-nyx/worklist': patch
---

node-redis 5 -> 6 in @stynx-nyx/auth, idempotency, ratelimit, sessions and testing. The four Redis-backed stores now create their clients with `RESP: 2` explicitly, so the wire protocol, reply shapes and the Redis server requirement are exactly as in 1.2.x (node-redis 6 defaults to RESP3, which would otherwise require Redis >= 6 on the server side). Switching STYNX to RESP3 is a separate, documented decision. No public API or runtime behaviour changes.
