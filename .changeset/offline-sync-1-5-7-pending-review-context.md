---
'@stynx-nyx/offline-sync': patch
'@stynx-nyx/sdk': patch
---

Implement UPS-OFS-06, UPS-OFS-07 and UPS-OFS-08 of stynx-nyx/stynx#317 under
ADR-MOBILE-OFFLINE-0003 D1, D2 and D3, with forward-only migration
`migrations/0004_pending_state_and_conflict_actions.sql` (apply after 0003; required before a
`conflictResolver` resolves anything, otherwise 503 `OFFLINE_SYNC_UPGRADE_REQUIRED` names 0004).

- UPS-OFS-06 (D1, declared compatibility note): `OfflineSyncQueueStatus` gains `'pending'`, and the
  three status `CHECK` constraints admit it. The only entry is the resolution action
  `retry_after_correction` closing a conflict on a `conflict` item with no committed effect
  (no `appliedAt`, no applied number, no other open conflict); the queue item and its receipt move
  to `pending` in the resolving transaction. A `pending` item is applied again only by a later batch
  of the same device under a different batch id with the same key and identical hash, once, with
  the receipt row locked, keeping the original batch binding, consuming numbers under the unchanged
  rules and emitting its event under `<key>:retry:<attempts>`. Closed-batch replay, reads, other
  devices and a different hash never re-apply; nothing expires a `pending` item.
- UPS-OFS-07 (D2): `OfflineSyncConflictResolver.resolve` may return `status: 'open'`; the action is
  appended to the new tenant-leading, append-only `offline.sync_conflict_actions` history (FORCE RLS,
  app role `SELECT`/`INSERT` only) and the conflict row stays open with a null resolution. Every
  accepted action, final or not, has a history row, readable through the additive
  `listSyncConflictActions`. Without a resolver, `resolveConflict` is unchanged.
- UPS-OFS-08 (D3): item receipts, attempts and conflict evidence carry a versioned platform object
  under the reserved `stynx` key (`version: 1`: `receiptId`, `appliedAt`, `serverEntityId`,
  `errorCode`, `errorMessage`, `attempts`, `reasonCode`, `receivedPayloadHash`,
  `storedPayloadHash`, `relatedQueueItemId`, `retryable`, opaque size-bounded
  `consumerAttributes` returned by the applier or resolver). It is exposed as the additive optional
  `stynx` property of `SyncItemReceipt`, `SyncQueueItemRecord` and `SyncConflict` from lookups and
  listings, never merged into `SyncItemReceipt.context`, written once and identical on replay. A
  same-key submission with a different hash now also records one `integrity` conflict per tenant,
  key and received hash that references the untouched original, with both hashes in the evidence
  and `reject` as its only default action.
- SDK: regenerated `OfflineSyncQueueStatus`, `SyncItemReceipt`, `SyncConflict` and the new
  `OfflineSyncStynxContext` and `OfflineSyncConsumerAttributes` models.
