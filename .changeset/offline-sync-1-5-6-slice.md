---
'@stynx-nyx/offline-sync': patch
---

Implement the no-migration offline-sync requests of stynx-nyx/stynx#317 under
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
