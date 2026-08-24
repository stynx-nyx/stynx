# @stynx-nyx/outbox

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
