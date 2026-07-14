# @stynx-nyx/reference-api

## 0.3.6

### Patch Changes

- 7bdc103: Wire GitHub Packages auth into each Dockerfile's internal `pnpm install`
  (BuildKit secret mount, `.npmrc` copied into the build context) so image
  builds can resolve `@devai-nyx/*` now that CI consumes DEVAI as published
  npm packages instead of a sibling checkout (D-118).

## 0.3.5

### Patch Changes

- Updated dependencies [d7a6c41]
- Updated dependencies [d7a6c41]
  - @stynx-nyx/preferences@0.2.0
  - @stynx-nyx/sessions@1.1.0
  - @stynx-nyx/auth@1.0.4
  - @stynx-nyx/audit@1.0.4
  - @stynx-nyx/flow@0.1.4
  - @stynx-nyx/ratelimit@1.0.4
  - @stynx-nyx/tenancy@1.0.3
  - @stynx-nyx/backend@1.0.4

## 0.3.4

### Patch Changes

- Updated dependencies [cc0f53e]
  - @stynx-nyx/audit@1.0.3
  - @stynx-nyx/auth@1.0.3
  - @stynx-nyx/backend@1.0.3
  - @stynx-nyx/core@1.0.2
  - @stynx-nyx/data@1.0.2
  - @stynx-nyx/flow@0.1.3
  - @stynx-nyx/health@1.0.2
  - @stynx-nyx/idempotency@1.0.3
  - @stynx-nyx/logging@1.0.2
  - @stynx-nyx/ratelimit@1.0.3
  - @stynx-nyx/sessions@1.0.2
  - @stynx-nyx/storage@1.0.3
  - @stynx-nyx/tenancy@1.0.3

## 0.3.3

### Patch Changes

- Updated dependencies [41a2a8b]
  - @stynx-nyx/audit@1.0.2
  - @stynx-nyx/auth@1.0.2
  - @stynx-nyx/backend@1.0.2
  - @stynx-nyx/core@1.0.1
  - @stynx-nyx/data@1.0.1
  - @stynx-nyx/flow@0.1.2
  - @stynx-nyx/health@1.0.1
  - @stynx-nyx/idempotency@1.0.2
  - @stynx-nyx/logging@1.0.1
  - @stynx-nyx/ratelimit@1.0.2
  - @stynx-nyx/sessions@1.0.1
  - @stynx-nyx/storage@1.0.2
  - @stynx-nyx/tenancy@1.0.2

## 0.3.2

### Patch Changes

- Updated dependencies [ce41938]
  - @stynx-nyx/flow@0.1.1
  - @stynx-nyx/audit@1.0.1
  - @stynx-nyx/auth@1.0.1
  - @stynx-nyx/backend@1.0.1
  - @stynx-nyx/idempotency@1.0.1
  - @stynx-nyx/ratelimit@1.0.1
  - @stynx-nyx/storage@1.0.1
  - @stynx-nyx/tenancy@1.0.1

## 0.3.1

### Patch Changes

- Updated dependencies [8f6df55]
  - @stynx-nyx/audit@1.0.0
  - @stynx-nyx/auth@1.0.0
  - @stynx-nyx/core@1.0.0
  - @stynx-nyx/data@1.0.0
  - @stynx-nyx/health@1.0.0
  - @stynx-nyx/idempotency@1.0.0
  - @stynx-nyx/logging@1.0.0
  - @stynx-nyx/ratelimit@1.0.0
  - @stynx-nyx/sessions@1.0.0
  - @stynx-nyx/storage@1.0.0
  - @stynx-nyx/tenancy@1.0.0
  - @stech/stynx-backend@1.0.0
