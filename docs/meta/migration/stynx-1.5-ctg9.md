# STYNX 1.5 — CTG9 outbox and offline sync

This guide describes the CTG9 migration contract for `@stynx-nyx/outbox` and
`@stynx-nyx/offline-sync`. Confirm package version 1.5.0, the APIs, and
migration names against the release artifacts before applying them.

## Upgrade order and database roles

Use the STYNX migration runner with the configured migration owner. Do not run
these DDL files as `stynx_app` or `stynx_reader`. Apply the platform outbox
migration `0021_outbox_event_log.sql` and offline-sync migration
`0002_durable_sync.sql` before enabling their CTG9 APIs. The offline-sync
upgrade also requires its existing `0001_offline_sync.sql` baseline. Keep the
application role and reader role subject to the migrations' grants and forced
row-level security; do not grant either role table ownership, superuser, or
`BYPASSRLS`.

The offline-sync migration adds durable batch, item receipt, item attempt,
transport-key ledger, number consumption, and conflict evidence relations. Existing queue rows are
preserved and assigned legacy E6 identity. Their stored payload hashes and
statuses are not rewritten. New relations receive tenant leading keys,
policies, grants, and forced RLS. Test the migration from an empty database
and upgrade a copy of the existing 0001 schema before deploying it.

In 1.5.x, offline-sync adds the forward-only `0003_reservation_idempotency.sql`
after 0002. It adds nullable `idempotency_key` and `idempotency_fingerprint`
columns to `offline.numbering_reservations`, plus a partial unique index on
`(tenant_id, idempotency_key)`. The table's existing forced RLS policy and
grants still apply. Only callers that pass
`ReserveNumberingInput.idempotencyKey` need 0003. Without it, a keyed
PostgreSQL reservation fails with 503 `OFFLINE_SYNC_UPGRADE_REQUIRED`
("migration 0003"), and keyless callers are unaffected.

The outbox migration adds the immutable event log, delivery projection,
attempt and ACK ledgers, tenant clock, legacy ID map, ownership marker, and
unbound ACK quarantine. It installs forced RLS and app/owner grants while
preserving the published audit RLS policies. Applying the DDL does not move
legacy rows or change legacy API behavior.

## Outbox adoption

Existing `enqueue`, `dispatchDue`, and `ack` consumers can continue after the
DDL. New event producers call `appendInTransaction` or
`appendManyInTransaction` with the live transaction that contains the domain
write. Give each event a stable idempotency key. The event log is immutable;
the delivery projection serializes each aggregate and prevents a later event
from passing a nonterminal predecessor.

Delivery is at least once. A worker crash after sending but before recording
success can cause a resend after lease expiry. Receiving systems must
deduplicate by event ID or idempotency key. Attempts retain available request
and response evidence and hashes. Consumers should treat a sent event without
a verified ACK as unresolved, rather than assume delivery was exactly once.

`ackEvent` binds a receipt to the tenant and event (or validated event key),
and only a valid HMAC ACK advances event state. Invalid or unbound ACK bodies
are retained in the owner only quarantine with their reason and digest; they
must not be attached to a guessed tenant or event. Keep the legacy
`acknowledgements` table and its one row per message constraint for legacy
`ack` callers.

Legacy cutover is a separate, explicit `cutoverLegacyMessages()` operation
after the migration and application rollout are ready. It moves only the
default legacy tables. Custom table configurations remain in legacy mode and
must not be passed to cutover. The operation is idempotent and serializes with
legacy enqueue, claim, ACK, retry, and dispatch-failure writes through the
ownership marker. A lock conflict is retryable and requires retrying the whole
transaction with the same idempotency key. After the marker reaches NEW,
legacy enqueue is rejected; native append events remain deliverable. Plan and
observe this cutover as a data operation, with a backup and a verified
reconciliation path for unresolved sends.

## Offline sync adoption

The 0002 migration is required before running the 1.5.0 offline-sync package,
including for hosts that continue using E6. A 0001-only database fails closed
with `OFFLINE_SYNC_UPGRADE_REQUIRED`; do not route traffic to new package code
until migration has completed.

Without `OfflineSyncPolicyResolver`, the package preserves E6 semantics:
payload-hash deduplication across item keys, repeated cancellation conflict,
the existing TTL default, and the 100 item batch limit. Configuring the
resolver at module bootstrap selects CTG9 mode; requests cannot change modes.
CTG9 uses tenant plus item key as identity and the payload hash as integrity
evidence. A repeated key with the same hash returns its durable receipt; a
different hash is rejected and cannot apply another effect. Completed
cancellations replay idempotently. Keep E6 and CTG9 rows distinguishable by
their stored identity mode.

CTG9 stores batch identity, sequence, declared item keys, original receipts,
response status/body bytes and replayable headers. A database lease with a
fencing generation prevents two workers from applying an item twice. Each
item's domain effect, number consumption, receipt, and outbox append share one
independent app role transaction. A failed item rolls back its own effects;
successful siblings remain committed. An expired or unverifiable legacy
idempotency record cannot authorize a second domain effect. A legacy item
without a verified identity remains unapplied and is recorded with a neutral
legacy result.

The batch context also binds a stable digest of each item's `payloadJson`.
When a new transport key resumes an open batch, changed JSON is a context
conflict (409), even if the submitted `payloadHash` is unchanged. An identical
batch can resume with a new key; a closed matching batch replays its original
response. Hosts define the submitted `payloadHash` and must generate it
consistently; STYNX validates its format and compares it across item-key
attempts, while its separate context digest guards resumed payload bytes.
The generated TypeScript SDK exposes the new routes through
`Ctg9OfflineSyncService`; method names begin `ctg9OfflineSync...`.

Number reservations remain tenant, organizational unit, entity, and series
scoped. Reconciliation exposes the disposition of each reserved number;
settlement preserves consumed numbers and permits release only of an unused
tail. Provisioning ranges and resolving business conflicts remain host domain
responsibilities. Configure tenant policy explicitly; CTG9 mode must not fall
back to another tenant's settings or a global policy.

## Signature trust adoption

The CTG9 signature additions are opt-in. Calls that omit
`minimumSignatureLevel` keep the legacy signing and verification behavior;
those results do not establish ADVANCED or QUALIFIED trust. Regulated callers
must provide a versioned `SignatureTrustProfile`, actual signed PDF and CMS
bytes, trust anchors, accepted certificate policy and qualification rules.
Mock backends, provider level fields, synthetic CMS and local clock values
cannot satisfy a minimum-level request.

The STYNX verifier accepts detached CMS `id-data` only. It selects the PDF
signature dictionary by matching `/Contents` to the supplied CMS and verifies
the signature over the exact `/ByteRange`; the original document must be the
signed PDF's exact byte prefix. For B-LT, the DSS/VRI must carry the required
certificate and signed OCSP/CRL evidence for the signer and TSA chain. A later
DSS revision is accepted only when signed objects and effective xref entries
remain unchanged. Free entries, repointed objects, shadow objects, malformed
xref chains, and any xref semantics the verifier cannot prove are rejected.
The actual evidence determines B-T or B-LT. LTA is unsupported and profiles
that require it fail closed.

Configure TSA trust anchors and authenticated TSA/OCSP/CRL fetchers as needed.
The embedded RFC 3161 timestamp must bind the SignerInfo signature bytes;
revocation evidence must be signed, match its certificate and issuer, be
current, and be issued no earlier than the profile's trusted signing instant.
An unavailable resolver or remote evidence source remains unavailable and
must not be converted to a valid or invalid assertion. Production readiness
requires an authenticated `readinessChallenge` that exercises the configured
trust path and `SignatureHealthIntegration` registration. The current verifier
reports LTA unavailable; a profile that requires LTA cannot report ready.

For session and batch manifests, configure a tenant-scoped
`resolveSignerCertificate(tenantId, signerId)` resolver returning the expected
DER SHA-256 for each required signer. Each identity must bind to its own
certificate; an artifact or certificate cannot fill multiple signer slots.
Manifest bytes use RFC 8785 canonical JSON and bind tenant, document and
snapshot bytes, signer order, proof hashes, and the selected PDF signature's
covered manifest hash. Supply the original source document and snapshot on
every append or verification call, including after loading a persisted
manifest.

Digital withdrawal requires a separate canonical declaration signed by the
eligible party. Configure tenant-scoped
`resolvePartyCertificate(tenantId, signerPartyId)` and bind the declaration's
tenant, case, document, content hash, party, and evidence reference. The
evidence bytes must equal that declaration's CMS; the original document's
signature cannot be reused. Physical withdrawal requires a consumer trusted
attestor that proves the same fields and a nonzero verification time. Without
the required identity resolver, evidence, or attestor, the outcome is
`unavailable`. Acknowledged consumer-owned verifiers remain identified as
`consumer-owned`; they do not create a STYNX-owned qualification claim.

## Consumer rollout checks

Before enabling traffic, verify migration ownership and grants, application
and reader roles without `BYPASSRLS`, two tenant isolation, E6 compatibility,
upgrade preservation, and rollback behavior. Exercise actual HTTP adapters for
status, body bytes, replay headers, 503/`Retry-After`, authorization, and
idempotent replay. For outbox, test competing cutover and legacy writes,
lease recovery, late attempt fencing, event ordering, and valid versus
quarantined ACKs. For offline sync, test concurrent same-batch requests,
sequence gaps, changed identity/hash, legacy replay evidence, per-item
rollback, number reconciliation, and outbox append in the item transaction.

The detailed API contracts are [outbox](../../framework/contracts/outbox-api.md)
and [offline sync](../../framework/contracts/offline-sync-api.md). Release
conformance remains pending the required final implementation review and
release gates.
