# @stynx-nyx/outbox

## 1.1.1

### Unified Version Rebaseline

- Re-establish the canonical STYNX 1.x line at exact version 1.1.1 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.0.0

### Minor Changes

- c793a9d: Add the transactional outbox promoted from PEC: same-transaction enqueue,
  concurrent safe claiming, pluggable HTTP dispatch, configurable retry backoff,
  and HMAC-verified inbound ACK helpers.

### Patch Changes

- Updated dependencies [bb469ee]
- Updated dependencies [0aa9695]
- Updated dependencies [e99b2cc]
  - @stynx-nyx/core@1.0.0
  - @stynx-nyx/data@1.0.0
  - @stynx-nyx/contracts@1.0.0

## 0.5.0

### Minor Changes

- Initial release. Promoted from pec's `integration.renach_outbox` transactional
  outbox (`transmissions.service.ts`) into a generalized, entity-agnostic
  package: same-transaction `enqueue(trx, envelope)`, claim-and-dispatch via
  `FOR UPDATE SKIP LOCKED`, a pluggable `OutboxDispatcherPort` (HTTP shipped;
  EventBridge port reserved for a later package), a configurable
  `OutboxBackoffPolicy` (pec hardcoded `now() + 15 minutes`), and an
  HMAC-SHA256 inbound ACK signature helper promoted from pec's
  `webhook-signature.ts`. See `law/adr/ADR-OUTBOX-0001-transactional-outbox-promotion.md`.
