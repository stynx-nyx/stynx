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

Adopt the installed @aarusso-nyx/devai package as the only governance path.

STYNX no longer carries a second governance implementation. Local
release-candidate orchestration, the 1.1.1 campaign policy and schema, the
mutation evidence composition and reuse engine, the direct verifier
invocation, and the local RC and main-observation workflows are removed.
Mutation execution remains a STYNX responsibility and continues to run the
complete 38-package roster at the unchanged break: 90 floor.

Also resolves 12 transitive dependency security advisories and unblocks
@stynx-nyx/contracts mutation, which was prevented by Stryker scaffolding
that had been committed by accident.

No public API, runtime behavior, or package contract changes.
