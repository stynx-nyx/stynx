# Offline Sync API Contract

**Package:** `@stynx-nyx/offline-sync`
**Status:** Supported (E6 server pair)
**Authority:** `INV-OFFLINE-001` and `ADR-MOBILE-OFFLINE-0001`
**Effective:** 2026-08-24

`StynxOfflineSyncModule.forRoot()` mounts authenticated NestJS routes backed by PostgreSQL. Hosts
that need only the service may set `mountControllers: false`; tests may use `inMemory()`.

| Method | Path                                              | Permission                       | Purpose                                       |
| ------ | ------------------------------------------------- | -------------------------------- | --------------------------------------------- |
| `POST` | `/offline-sync/numbering-reservations`            | `offline-sync:numbering:reserve` | Atomically reserve an entity-scoped interval. |
| `POST` | `/offline-sync/numbering-reservations/:id/cancel` | `offline-sync:numbering:cancel`  | Cancel one tenant-owned reservation.          |
| `POST` | `/offline-sync/sync-batches`                      | `offline-sync:batches:submit`    | Persist an idempotent device batch.           |
| `POST` | `/offline-sync/conflicts/:id/resolve`             | `offline-sync:conflicts:resolve` | Resolve one tenant-owned conflict.            |

All routes use STYNX authentication, permission, audit, and HTTP idempotency decorators. Tenant and
actor identity are derived from trusted `RequestContext`; a request body containing identity
override fields is rejected.

## Invariants

- `entityType` is consumer-defined and is part of range selection and queue identity.
- Numbering reservation locks one tenant/org-unit/entity/series range and advances `next_number`
  in the same transaction, so intervals cannot overlap.
- `(tenant_id, payload_hash)` is unique. Replaying the same payload in a tenant is reported as a
  duplicate instead of creating another queue item; another tenant has an independent namespace.
- Payload hashes use `sha256:<64 lowercase hex>`.
- All four `offline.*` tables carry `tenant_id`, tenant-leading keys/indexes, and forced RLS keyed
  by `app.tenant_id` set by `@stynx-nyx/data`.
- Device-local entity and queue identifiers are bounded text because device IDs need not be UUIDs.

Adopters must apply the shipped `migrations/0001_offline_sync.sql` with the STYNX migration owner
before mounting the PostgreSQL-backed module. The package does not create consumer numbering-range
rows; provisioning those ranges remains a host-domain responsibility.

Server-side device attestation is deferred to Phase 5. This API authenticates the actor and scopes
database access, but it cannot independently prove the client's posture claim.
