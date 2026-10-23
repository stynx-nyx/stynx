---
---

S10 SM-05 and SM-12, with no release in this change (O-8 (a)); the next fixed-group release carries them as a minor.

- `@stynx-nyx/core`: `RequestContextState` and `RequestContextPatch` gain an optional `roles`.
- `@stynx-nyx/auth`: `ActorContextInterceptor` patches the verified `roles` claim.
- `@stynx-nyx/data`: `Database.tx` writes `app.roles`.
- `@stynx-nyx/backend`: `PgSessionDbContextApplier` also writes the `app.*` setting names.
- `database/migrations/001_app_guc_context.sql` moves the bootstrap helpers and policies to `app.*`.
- `@stynx-nyx/eslint-config`: the import resolver accepts an internal workspace package map. The published profiles are unchanged.
