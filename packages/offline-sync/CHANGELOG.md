# @stynx-nyx/offline-sync

## 1.5.6

### Patch Changes

- 1cc583c: Implement the no-migration offline-sync requests of stynx-nyx/stynx#317 under
  ADR-MOBILE-OFFLINE-0003 D4 and D5:

  - UPS-OFS-10 (D4, declared behaviour change): in CTG9 mode a `payloadHash` string of 1 to 255
    bytes that is not canonical (`sha256:` + 64 lowercase hex) no longer fails the batch with 400. The
    item receives a `rejected` receipt with `OFFLINE_SYNC_ITEM_INTEGRITY`, recorded only in
    `offline.sync_item_attempts` with the received value; no queue row, item receipt, consumption or
    effect is created and the key stays unconsumed, so the same key with a canonical hash applies in a
    later batch. A missing, non-string, empty or over-long hash is still a batch-wide 400, E6 mode
    keeps its 400, and both `payload_hash` `CHECK` constraints and `INV-OFFLINE-001` are unchanged.
  - UPS-OFS-11: `listSyncConflicts` accepts a `deviceId` filter (through the referenced queue item)
    and `SyncConflictRecord` carries `deviceId`.
  - UPS-OFS-12 (D5, stage one): the exported `OFFLINE_SYNC_NO_SHIFT` (`stynx:no-shift`) is the
    documented "no shift" value; any other `stynx:`-prefixed `shiftId` is rejected as invalid input.
    The supported consumer write contract for `offline.numbering_ranges` is documented. Cancelling a
    reservation tail reactivates only an `exhausted` range and never revives a `cancelled` one, and
    a reservation without `series` no longer selects a cancelled range.
  - UPS-OFS-14: the verification map names a test for V-03, V-04, V-05, V-07, V-08, V-10, V-11,
    V-12, V-13 and V-14.
  - @stynx-nyx/auth@1.5.6
  - @stynx-nyx/backend@1.5.6
  - @stynx-nyx/core@1.5.6
  - @stynx-nyx/data@1.5.6
  - @stynx-nyx/idempotency@1.5.6

## 1.5.5

### Patch Changes

- @stynx-nyx/auth@1.5.5
- @stynx-nyx/backend@1.5.5
- @stynx-nyx/core@1.5.5
- @stynx-nyx/data@1.5.5
- @stynx-nyx/idempotency@1.5.5

## 1.5.4

### Patch Changes

- @stynx-nyx/auth@1.5.4
- @stynx-nyx/backend@1.5.4
- @stynx-nyx/core@1.5.4
- @stynx-nyx/data@1.5.4
- @stynx-nyx/idempotency@1.5.4

## 1.5.3

### Patch Changes

- 032f86e: Add tenant-scoped keyset listings of batch receipts, item receipts, queue items
  and conflicts (`listSyncBatchReceipts`, `listSyncItemReceipts`,
  `listSyncQueueItems`, `listSyncConflicts`) to `OfflineSyncService` and both
  shipped stores. Add an optional `idempotencyKey` to `ReserveNumberingInput`:
  a same-key, same-request replay returns the original reservation without
  consuming numbers, and a changed request throws
  `OfflineSyncReservationReplayError` (409
  `OFFLINE_SYNC_RESERVATION_IDEMPOTENCY_CONFLICT`). PostgreSQL callers that use
  the key must apply the new forward-only `migrations/0003_reservation_idempotency.sql`.
  Range refusals keep `OFFLINE_SYNC_RANGE_UNAVAILABLE` and the same response body,
  and are now `OfflineSyncRangeUnavailableError` with a `reason` of `inactive`,
  `exhausted` or `insufficient_capacity`. The item applier context carries an
  optional `receiptId`. The batch-size error now reports the configured limit.
- Updated dependencies [59d04a7]
- Updated dependencies [47426a6]
- Updated dependencies [d98960b]
  - @stynx-nyx/data@1.5.3
  - @stynx-nyx/auth@1.5.3
  - @stynx-nyx/backend@1.5.3
  - @stynx-nyx/idempotency@1.5.3
  - @stynx-nyx/core@1.5.3

## 1.5.2

### Patch Changes

- @stynx-nyx/auth@1.5.2
- @stynx-nyx/backend@1.5.2
- @stynx-nyx/core@1.5.2
- @stynx-nyx/data@1.5.2
- @stynx-nyx/idempotency@1.5.2

## 1.5.1

### Patch Changes

- Updated dependencies [8e09a90]
  - @stynx-nyx/backend@1.5.1
  - @stynx-nyx/data@1.5.1
  - @stynx-nyx/auth@1.5.1
  - @stynx-nyx/idempotency@1.5.1
  - @stynx-nyx/core@1.5.1

## 1.5.0

### Minor Changes

- 5dffc83: Complete the CTG9 signature trust verification, ordered transactional event log
  and delivery receipts, and durable offline batch, numbering and conflict
  protocols for STYNX 1.5.0. Apply the additive platform and offline-sync
  migrations before enabling the new modes. Existing E6 offline behavior remains
  available when no CTG9 policy resolver is configured. The fixed STYNX package
  group advances together.

### Patch Changes

- Updated dependencies [c6ddb66]
- Updated dependencies [42bbb43]
- Updated dependencies [138f7f0]
- Updated dependencies [2a94cac]
- Updated dependencies [7eec2d7]
- Updated dependencies [8a800c2]
- Updated dependencies [5aea8af]
  - @stynx-nyx/backend@1.5.0
  - @stynx-nyx/auth@1.5.0
  - @stynx-nyx/data@1.5.0
  - @stynx-nyx/core@1.5.0
  - @stynx-nyx/idempotency@1.5.0

## 1.5.0-rc.3

### Patch Changes

- Updated dependencies [c6ddb66]
  - @stynx-nyx/backend@1.5.0-rc.3
  - @stynx-nyx/auth@1.5.0-rc.3
  - @stynx-nyx/idempotency@1.5.0-rc.3
  - @stynx-nyx/core@1.5.0-rc.3
  - @stynx-nyx/data@1.5.0-rc.3

## 1.5.0-rc.2

### Patch Changes

- Updated dependencies [138f7f0]
  - @stynx-nyx/backend@1.5.0-rc.2
  - @stynx-nyx/auth@1.5.0-rc.2
  - @stynx-nyx/core@1.5.0-rc.2
  - @stynx-nyx/data@1.5.0-rc.2
  - @stynx-nyx/idempotency@1.5.0-rc.2

## 1.5.0-rc.1

### Patch Changes

- Updated dependencies [2a94cac]
  - @stynx-nyx/core@1.5.0-rc.1
  - @stynx-nyx/auth@1.5.0-rc.1
  - @stynx-nyx/backend@1.5.0-rc.1
  - @stynx-nyx/data@1.5.0-rc.1
  - @stynx-nyx/idempotency@1.5.0-rc.1

## 1.4.0

### Minor Changes

- 1565d4e: Adopt DEVAI 1.5.0 and its release profile 1.4.0, keeping mutation testing as
  optional manual hardening outside all CI, acceptance, and publication gates.

### Patch Changes

- Updated dependencies [1565d4e]
  - @stynx-nyx/auth@1.4.0
  - @stynx-nyx/backend@1.4.0
  - @stynx-nyx/core@1.4.0
  - @stynx-nyx/data@1.4.0
  - @stynx-nyx/idempotency@1.4.0

## 1.3.1

### Patch Changes

- 773ad90: Release tooling: the 1.3.0 CHANGELOG sections list sibling packages as `@2.0.0` under "Updated dependencies"; Changesets' peer-dependency inference had computed 2.0.0 before the version was corrected to 1.3.0 by hand. The references now read `@1.3.0`. The workspace `version-packages` script applies the fixed-group version rule from now on (the highest bump a changeset declares for a group member; a peer-inferred major is corrected in manifests and changelogs). No public API or runtime behaviour changes.
- Updated dependencies [773ad90]
  - @stynx-nyx/auth@1.3.1
  - @stynx-nyx/backend@1.3.1
  - @stynx-nyx/core@1.3.1
  - @stynx-nyx/data@1.3.1
  - @stynx-nyx/idempotency@1.3.1

## 1.3.0

### Minor Changes

- 1946efc: Angular 22. The Angular packages are built with @angular/compiler-cli 22.1.6, ng-packagr 22.1 and TypeScript 6.0.3, and their peer ranges move from `>=20.3.0 <22` to `>=22.0.0 <23`. Owner decision 2026-09-12: this ships as the 1.3.0 line. **1.3.x requires Angular 22**; applications on Angular 20 or 21 must stay on 1.2.x. Backend packages in the fixed group are re-released unchanged.

  The published declaration files of nine Angular packages also change: the previous ng-packagr 21 / TypeScript 5.9 toolchain dropped `| null` and `| undefined` from emitted generic type arguments (for example `Signal<ErrorBannerState>` where the source declares `Signal<ErrorBannerState | null>`, `InjectionToken<AuthProvider>` for `InjectionToken<AuthProvider | null>`). Angular 22 emits the types as written in the sources. Consumers that relied on the narrower, incorrect declarations will see new strict-null errors; the runtime behaviour is unchanged.

### Patch Changes

- a56760d: Dependency round 2026-09 (part 2): NestJS 11.2.3 workspace-wide (test and reference dependencies; peer ranges unchanged), AWS SDK 3.1068+, nestjs-cls 6.2.1, intl-messageformat 11.2.8, and the shared toolchain (eslint 10.5, typescript-eslint 8.61, swc 1.15.41, turbo 2.9.18, prettier 3.8.4, knip 6.16, typedoc-plugin-markdown 4.12, Docusaurus 3.10.2, react 19.2.7). No public API or runtime behaviour changes.
- e45bfb9: Dependency round 2026-09 (part 3, tooling majors): @types/node 24.13.4 across the publishable packages (tracking the Node 24 engine pin), testcontainers 12, commander 15 (ESM-only; consumed via require(esm) on Node 24), commitlint 21, lint-staged 17, eslint-plugin-jsdoc 63. No public API or runtime behaviour changes.
- e639fa0: Dependency round 2026-09: rebuild the Angular libraries with @angular/compiler-cli 21.2.20 (partial-compilation output embeds the compiler version), and advance the workspace advisory overrides (js-yaml 3.15.2/4.3.2, multer 2.3.0, svgo 3.3.5, smol-toml 1.7.1). No public API or runtime behaviour changes.
- 9df17e7: node-redis 5 -> 6 in @stynx-nyx/auth, idempotency, ratelimit, sessions and testing. The four Redis-backed stores now create their clients with `RESP: 2` explicitly, so the wire protocol, reply shapes and the Redis server requirement are exactly as in 1.2.x (node-redis 6 defaults to RESP3, which would otherwise require Redis >= 6 on the server side). Switching STYNX to RESP3 is a separate, documented decision. No public API or runtime behaviour changes.
- 1b41c89: Dependency round 2026-09 (test runner): the workspace test runner moves from vitest 3.2.7 to vitest 4.1.11 with @vitest/coverage-v8 4.1.11. Test-only change: the shared Vitest base config adopts the Vitest 4 pool options (`maxWorkers: 1` + `isolate: false` replaces `poolOptions.threads.singleThread`; `minWorkers` is dropped) with the same single-thread and per-file-fork behaviour, pins each package's coverage population to its own directory (Vitest 4 otherwise lets a sibling package whose directory name extends the current one leak into the report), and constructor mocks in four specs move to `function` implementations. Coverage thresholds are unchanged; the more accurate Vitest 4 remapping exposed previously uncounted gaps, which are closed by additional unit tests. No public API or runtime behaviour changes.
- Updated dependencies [1946efc]
- Updated dependencies [a56760d]
- Updated dependencies [e45bfb9]
- Updated dependencies [e639fa0]
- Updated dependencies [9df17e7]
- Updated dependencies [1b41c89]
  - @stynx-nyx/auth@1.3.0
  - @stynx-nyx/backend@1.3.0
  - @stynx-nyx/core@1.3.0
  - @stynx-nyx/data@1.3.0
  - @stynx-nyx/idempotency@1.3.0

## 1.2.0

### Unified Version Rebaseline

- Advance the canonical STYNX 1.x line to exact version 1.2.0 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.1.1

### Unified Version Rebaseline

- Re-establish the canonical STYNX 1.x line at exact version 1.1.1 for the complete 44-package fixed group without changing runtime behavior or public contracts.

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
