---
'@stynx-nyx/offline-sync': patch
---

Add tenant-scoped keyset listings of batch receipts, item receipts, queue items
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
