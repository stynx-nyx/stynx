# Upgrading to STYNX 1.6.0

This guide records the accepted minor-release upgrade requirements. Verify the
actual package release, registry integrity and acceptance evidence before an
installation; this guide alone is not publication or consumer certification.
Upgrade the `@stynx-nyx/*` fixed group together.

## Apply storage before the new runtime

Preserve existing migrations and evidence. Apply forward platform migration
0026 for outbox retirement and the forward offline migrations following 0004.
Run the installed package's [consumer-storage verifier](../../framework/contracts/consumer-storage.md)
in a live read-only transaction as the configured owner before ordinary writes.
Default application roles and custom roles must both be nonsuperuser, without
`BYPASSRLS` or protected ownership/membership; FORCE RLS and least grants remain.
Do not use a privileged app login to make a failed check pass.

For consumer-owned outbox storage, render the objects and role bindings from the
installed package and verify the real database. `storageMode: 'consumer-owned'`
does not support platform legacy cutover. Your audit chain and legacy product
mapping remain your responsibility. Do not run a transfer while ordinary writers
are active or accept a missing verifier check as success.

## Handle terminal delivery retirement

Handle `RETIRED` in exhaustive delivery-status consumers. It is an operator
disposition, not successful delivery or ACK. Authorize the actor before calling
`retireEvent(eventId, { idempotencyKey, reason })`; tenant and actor come from the
trusted live transaction. Reuse the exact operation key/reason for idempotent
retry, and retain the returned receipt. Active leases and acknowledged deliveries
refuse. Retired deliveries release their aggregate but are never sent or retried.
Queue counts include them while outstanding age excludes them. Existing immutable
events and genuine transport history remain available.

See the [outbox API](../../framework/contracts/outbox-api.md) for error codes,
history reads and late-ACK behavior.

## Bind durable offline semantics explicitly

E6 and CTG9 remain separate. In CTG9, default initial materialization is still
`received`; select `initialQueueStatus: 'pending'` only when the host needs that
vocabulary. The same batch still applies its items; there is no new worker.
Existing closed batches keep exact response bytes and fingerprints.
An initially pending item may be admitted by a later keyed batch from the same
device with the same hash under the existing receipt-lock safeguards. This
never permits a second committed effect or bypasses correction preconditions.
Apply offline migration `0005_initial_queue_status.sql`: the first-created mode
is persisted per batch. Resume and lease takeover use that original mode even
after module configuration changes; old batches default to `received` without
rewriting their hashes or item states.

Generate payload hashes using the canonical helper or a documented consumer
`payloadHashPort`. The producer helpers are `canonicalOfflineSyncPayload` and
`canonicalOfflineSyncPayloadHash`. Object keys sort recursively by UTF-16 order,
finite numbers use JSON encoding (`-0` becomes `0`), arrays keep their order,
and all strings/keys require valid Unicode. Supply plain JSON objects only;
cycles, accessors, symbols, non-finite numbers, sparse/extended arrays and other
ambiguous values refuse. A well-formed but incorrect hash now rejects before effects;
do not reuse arbitrary placeholder hashes. The default hashes canonical JSON of
`payloadJson`. Pre-apply detection, when configured, runs on the item transaction
before numbering/domain/event effects and supplies stable receipt/suspicion/pair
context to the applier. Trusted `concurrencyApplication: 'apply' | 'defer'`
defaults to `defer` for effective pre-apply suspicion. A request cannot waive
it; existing post-apply detection stays effective.

Use `getSyncIntegrityRejection({ deviceId, deviceBatchId, queueItemId })` to
read raw rejection provenance even when no canonical queue item exists.
The getter preserves the received hash and actual rejection instant; optional
original hash/identity appear only when stored evidence supplies them. Missing
attempts return `OFFLINE_SYNC_INTEGRITY_REJECTION_NOT_FOUND` (404). Custom
durable stores must implement the optional read port before callers use it;
unsupported stores fail configuration instead of fabricating a record.

Handle nullable CTG9 shifts and `OFFLINE_SYNC_ACTIVE_RESERVATION` (409).
Use `CTG9ReserveNumberingInput` and the explicit `reserveDurableNumbering`,
`replayDurableNumberingReservation` and `cancelDurableNumberingReservation`
service/store seams; keep E6's string-only methods separate. Custom durable
stores must implement these optional ports before use.
Single-active admission per tenant/device/shift is mandatory; null and the old
no-shift sentinel occupy the same no-shift scope. Replay the original operation
before requesting another allocation. Resolve preexisting active duplicates
through authorized lifecycle operations; never delete history or reissue numbers.
Apply forward `0006` before using nullable shifts and active admission. Existing
reservation origins default to `e6`, while new durable rows use `ctg9`.
CTG9 admission checks all active origins; E6 cannot allocate alongside an active
CTG9 row, while pure E6 multiple reservations retain their legacy behavior.
Do not normalize historical shifts or fingerprints. Durable exact replay can
return a historical string row; reusing its sentinel-bound key with null is
conflicting reuse, not a new spelling of replay.
Migration `0006` also installs the FORCE-RLS scope-fence table and trigger.
Keep these objects and their least grants in a consumer storage installation;
an advisory lock alone cannot prevent stale-snapshot admission. The durable
helper requires READ COMMITTED with a trusted actor and no automatic retry;
it refuses an incompatible nested repeatable-read boundary. Roll back the
enclosing operation on `40001`. Expiry is sampled again after waiting.
`STY44` is the active-collision 409 mapping, `STY45` reports upgrade collisions,
and `STY46` protects immutable reservation scope/origin. Resolve reported
upgrade collisions through lifecycle operations, never by deleting evidence.
Use tenant-scoped range administration, keep allocated bounds immutable and
treat consumer attributes as opaque bounded JSON. Reconciliation distinguishes
assigned numbers from actual applied effects.

Apply forward `0007` for `createNumberingRange`, `getNumberingRange`,
`listNumberingRanges` and `cancelNumberingRange`. Creation generates an active
range; it accepts no caller ID/status/counter/provenance. Keep full keyed-create
requests, including attributes, stable: replay returns the immutable original
creation snapshot, while get returns current state. Changed key content gives
`OFFLINE_SYNC_RANGE_IDEMPOTENCY_CONFLICT`; another creation in the same
tenant/org-unit/entity/series gives `OFFLINE_SYNC_RANGE_CONFLICT` (both 409).
Cancel records the trusted actor's first facts, never rewinds allocation, and
repeated cancel returns those same facts. Exhausted cancellation refuses
`OFFLINE_SYNC_RANGE_STATE` (409). Lists use ascending UUID IDs, an exclusive
last-ID cursor and 50/default, 200/maximum pages. Historical absent provenance
remains absent. Custom stores must implement these optional admin ports before
use; no new HTTP route is implied.

## Import only verified legacy state

Use the explicit owner-only offline import seam with writers stopped and a
validated source identity/digest/mapping manifest. Import is not an application
endpoint and does not apply or send effects. Run live verification and consumer
protocol tests before resuming writes. A batch without independently verified
archived response bytes remains `legacy_closed_unverified`; never manufacture
replay responses or missing history.

The [offline API](../../framework/contracts/offline-sync-api.md) and accepted
ADR-MOBILE-OFFLINE-0004 define atomicity, key/hash identity, numbering and replay.

## Signature and governance evidence

The minimal LTA and profile-set boundary remains
[ADR-SIGNATURE-0002](../../../law/adr/ADR-SIGNATURE-0002-minimal-lta-and-profile-sets.md).
Actual provider compatibility must be independently demonstrated by the consuming
application; local test PKI or mocked provider responses are not that approval.

Repositories adopting DEVAI 2.4.0 wait for its independently verified published
package, then bind its policy inputs through the pinned registered CLI. Generated
configuration is not edited by hand. Preserve all prior sensor readings and
chain prefixes; new readings establish a new observation without relabeling the
historical 1.5.7 RED scorecard. Tests, thresholds and the two existing N/A cells
are not relaxed to meet the campaign's machine target.
