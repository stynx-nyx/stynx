# @stynx-nyx/outbox

## 1.2.1

### Patch Changes

- 32fc82c: Adopt the installed @aarusso-nyx/devai package as the only governance path.

  STYNX no longer carries a second governance implementation. Local
  release-candidate orchestration, the 1.1.1 campaign policy and schema, the
  mutation evidence composition and reuse engine, the direct verifier
  invocation, and the local RC and main-observation workflows are removed.
  Mutation execution remains a STYNX responsibility and continues to run the
  complete 38-package roster at the unchanged break: 90 floor.

  Also resolves 12 transitive dependency security advisories and unblocks
  @stynx-nyx/contracts mutation, which was prevented by Stryker scaffolding
  that had been committed by accident.

  No public API, runtime behavior, or package contract changes.

- Updated dependencies [32fc82c]
  - @stynx-nyx/contracts@1.2.1
  - @stynx-nyx/core@1.2.1
  - @stynx-nyx/data@1.2.1

## 1.2.0

### Unified Version Rebaseline

- Advance the canonical STYNX 1.x line to exact version 1.2.0 for the complete 44-package fixed group without changing runtime behavior or public contracts.

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
