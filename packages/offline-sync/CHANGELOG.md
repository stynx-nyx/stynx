# @stynx-nyx/offline-sync

## 1.0.0

### Minor Changes

- f90c5a6: Add tenant-scoped generic numbering reservations, payload-hash-idempotent sync batches, conflict
  resolution, and forced-RLS PostgreSQL persistence.

### Patch Changes

- Updated dependencies [bb469ee]
- Updated dependencies [0aa9695]
- Updated dependencies [e99b2cc]
  - @stynx-nyx/core@1.0.0
  - @stynx-nyx/data@1.0.0
  - @stynx-nyx/auth@1.0.0
  - @stynx-nyx/idempotency@1.0.0
  - @stynx-nyx/backend@1.0.0

## 0.5.0

### Minor Changes

- Promote TEAT's offline sync mechanics into a generic NestJS package with atomic numbering,
  payload-hash idempotency, conflicts, and tenant-scoped RLS persistence.
