# Closed offline storage and verified import

This is the exact 1.6.0 D6 contract under
[ADR-MOBILE-OFFLINE-0004](../../../law/adr/ADR-MOBILE-OFFLINE-0004-minor-parity-and-import.md).
The consumer collects its source and owns its source-to-target mapping. A
storage pass verifies the installed STYNX contract, not the consumer's product,
audit chain, provider or original source's truth.

## Public boundaries

`renderOfflineStorage(options?: OfflineStorageOptions): OfflineStorageArtifact`
operates offline from shipped digest-bound templates and manifest. Its artifact
has `contractVersion`, `packageVersion`, resolved `binding`, `objectsSql`,
`roleBindingsSql` and `manifest`, matching the outbox artifact convention.
`verifyOfflineStorage(trx: StorageVerifierTransaction, options?: OfflineStorageOptions)`
returns `Promise<StorageVerificationReport>` in an already-read-only configured
owner transaction. Shared types and default/custom binding rules are defined in
[consumer storage](consumer-storage.md). Neither operation copies a consumer
schema, executes hidden subprocesses or repairs storage.

The separately exported owner maintenance operation is:

```ts
parseOfflineImportManifest(text: string): OfflineImportManifest;

importOfflineState(
  trx: StorageVerifierTransaction,
  manifest: OfflineImportManifest,
  options?: OfflineImportOptions,
): Promise<OfflineImportReceipt>;

interface OfflineImportOptions {
  storage?: OfflineStorageOptions;
  verifyArchive?: OfflineArchiveVerificationPort;
}
```

The structural query interface is shared; import requires a writable transaction
and verification requires a read-only transaction. No `allowWrite` switch weakens
the public verifier. Import uses only the caller's connection and transaction;
it does not begin, commit or partially commit that transaction. A successful
result becomes durable only with the caller's commit. No request controller,
application store method, arbitrary SQL callback, applier, event dispatcher or
provider is part of this port. Unknown options refuse.

`parseOfflineImportManifest` is the exported raw-text admission seam. It accepts
strict JSON text, rejects malformed syntax and duplicate decoded property names
at every object depth (including escape-equivalent names such as `"a"` and
`"\u0061"`), then runs the same legal-JSON, closed schema and static manifest
validation used by object import. Static validation includes available envelope/
mapping/body/header digests and mapping coverage; database ownership, live
invariants and independent archive verification remain import-time checks.
It returns a typed manifest only after these checks, with no database or other
side effects. Parsing/duplicate/closed-input refusal is `OfflineImportError`
with reason `invalid-manifest`. No arbitrary parsing callback or permissive
JSON extension is admitted, and plain `JSON.parse` without duplicate detection
is not an equivalent implementation.

`importOfflineState` still validates typed-object inputs independently; the type
annotation is not an admission receipt. An already parsed object cannot reveal
duplicate keys discarded by an earlier parser. Consumers admitting raw source
manifest text must use `parseOfflineImportManifest` before object import, and
must not claim raw duplicate rejection from object validation alone. Revalidate
at import even for parser-produced objects so later mutation cannot bypass the
closed manifest/digest checks.

## Closed envelope and digest identity

[offline-import.schema.json](../../../law/schemas/offline-import.schema.json)
is the closed JSON envelope. Public `OfflineImportManifest`,
`OfflineImportRecord`, `OfflineImportMapping` and `OfflineArchivedResponse`
correspond exactly to that schema. All declared row fields are present; actual
nullable facts use JSON null. An absent historical fact is not filled with the
importer's actor, current time, an invented context, response or fingerprint.

The envelope has exactly `formatVersion: 'stynx-offline-import/1'`,
`source: { system, snapshotId, sha256 }`, `manifestSha256`, `mappings`, `records`
and `archives`. Source system and snapshot ID form the immutable operation
identity. `source.sha256` binds the consumer's immutable raw capture; the consumer
retains that capture and its provenance. The importer does not claim to have
independently observed an external source merely from its declared digest.

Every digest is `sha256:` followed by 64 lowercase hexadecimal digits. Compute
`manifestSha256` over UTF-8 canonical JSON of the entire envelope with only the
root `manifestSha256` field omitted. Do not omit provenance, nullable values,
archives or timestamps. Canonical JSON uses the same legal-JSON validation and
UTF-16 recursive object-key order as `canonicalOfflineSyncPayload`; array order
is significant. This is an import-envelope identity, not a recomputation of any
historical batch or payload fingerprint. The mapping digest is SHA-256 over the
canonical JSON of the complete ordered `mappings` array. An archive's headers
digest covers canonical JSON of its exact `responseHeaders`; its body digest
covers decoded bytes, not base64 text. No archive contains the manifest digest
inside the digested envelope; the verification port receives it as context after
it is computed. There is no self-reference or excluded nested evidence.

All JSON data is plain legal JSON: valid Unicode strings and keys, finite
numbers, ordinary/null-prototype objects, and dense ordinary arrays. Reject
cycles, accessors, symbols, unsupported objects, non-enumerable/extra properties,
ambiguous numbers and coercion/toJSON behavior before hashing or SQL. Admit raw JSON through
`parseOfflineImportManifest`, which detects duplicate decoded object keys before
any parser can discard them. Exact byte bounds and
row constraints remain mandatory runtime validation; schema validation alone
cannot prove them or cross-record invariants.

Storage bigint values are canonical decimal strings, never floating-point JSON
numbers. Validate signed-bigint range and the runtime's safe-integer domain where
that field reaches a numeric public API. Instants are finite RFC3339 strings
with explicit zone and at most six fractional digits, exactly representable at
PostgreSQL microsecond precision. Bind them as text to PostgreSQL; never roundtrip
through JavaScript `Date` or invent source rounding. Reject unrepresentable source
precision. The immutable receipt retains the original lexical text, including
zone/precision; stored instants must compare exactly, even if PostgreSQL renders
a different equivalent lexical representation. Bytes use canonical padded base64;
decode/re-encode equality is required. Rejected-at instants and received hashes
in attempts are original facts, not normalized into invented canonical evidence.

## Records and mappings

Each record is `{ kind, row }`. Each mapping is
`{ kind, tenantId, sourceKey, targetKey }`. `sourceKey` is bounded opaque source
identity; `targetKey` is a closed object with the actual target primary-key
column names. Mapping identities are unique within source/kind/tenant. Every
record has exactly one mapping and every mapping has exactly one record; reject
duplicates, ambiguous aliases and dangling mappings. Mapping tenant equals the
row's tenant and any tenant-leading target key. Single-column UUID keys still
bind the row tenant through the mapping. The tenant must already exist in the
configured tenant table; there is no tenant remap or tenant-creation port.

| Kind               | Target relation                     | Exact target primary key                               |
| ------------------ | ----------------------------------- | ------------------------------------------------------ |
| `ranges`           | `offline.numbering_ranges`          | `id`                                                   |
| `reservations`     | `offline.numbering_reservations`    | `id`                                                   |
| `queueItems`       | `offline.sync_queue_items`          | `tenant_id, id`                                        |
| `conflicts`        | `offline.sync_conflicts`            | `id`                                                   |
| `batches`          | `offline.sync_batches`              | `tenant_id, device_id, device_batch_id`                |
| `transportKeys`    | `offline.sync_batch_transport_keys` | `tenant_id, transport_key`                             |
| `receipts`         | `offline.sync_item_receipts`        | `tenant_id, idempotency_key`                           |
| `attempts`         | `offline.sync_item_attempts`        | `tenant_id, device_id, device_batch_id, queue_item_id` |
| `consumption`      | `offline.numbering_consumption`     | `tenant_id, reservation_id, number`                    |
| `conflictEvidence` | `offline.sync_conflict_evidence`    | `tenant_id, conflict_id, queue_item_id`                |
| `conflictActions`  | `offline.sync_conflict_actions`     | `tenant_id, id`                                        |

Rows use exactly the named migration columns, including nullable historical
provenance and 0005–0007 additions. The bytea column `response_body_bytes` is
represented only by `response_body_base64`. The internal 0008
`response_body_is_archived` column is deliberately absent from the source DTO;
`additionalProperties: false` refuses any caller-supplied value. The importer
derives it only from actual independent archive verification and compares the
derived internal value separately from source row fields. No relation name, arbitrary column,
SQL expression, generated identity, default timestamp or extra row kind is
accepted. Context/payload/evidence/attributes are JSON data only, never executable
mapping instructions. Validate each field against its specific storage and API
contract, including bounded attributes and the actual initial creation receipt.
Existing fingerprints remain exact; do not reinterpret old batch hashing using
the new payload helper. Unsupported source formats refuse rather than rehashing.

`offline.numbering_reservation_scopes` is derived concurrency machinery, not a
source-history record. Under the exclusive locks, derive missing normalized
null/string scope keys consistently from actual reservations using the 0006
comparator, without changing source shift/origin/fingerprint or any existing
fence fact. Generation UUIDs identify the new maintenance fence operation, not
an imported business event. Retain valid existing fence rows. Their catalog and
mixed-origin behavior remain part of verification.

### Historical nullable item declarations

`OfflineImportBatchesRow.declared_keys` is `readonly (string | null)[]`, matching
the actual durable batch's original ordered input declarations. Null represents
an omitted original item `idempotencyKey`, not a missing source record. Preserve
array order and repeated null entries exactly. Semantic validation rejects
repeated nonnull keys; it must not reject repeated nulls or collapse the array
into a set. Do not replace a null declaration with a derived receipt key or
rewrite the historical context/transport fingerprint.

For archive identity, each null occurrence must match one distinct source
queue/attempt/receipt identity within the same tenant/device/batch, with its
actual persisted `stynx:legacy:v1:*` derived key and no supplied `idempotencyKey`
on the original ACK item. Preserve that absence. Require one-to-one item/key
coverage and the original declaration multiplicity; a null is never an item
identity, a wildcard or permission to reuse another item's evidence. Source
records and independent proof must establish the binding; array position alone
or a guessed/currently recomputed legacy resolver value is insufficient. Distinct
legacy items require distinct actual derived keys. A nonnull declaration instead
requires the ACK item's supplied key to match that exact declaration and stored
item/receipt key. Missing, extra, ambiguous, aliased or mismatched items refuse;
never fabricate a caller key to admit genuine history.

## Exclusive owner transaction and atomic replay

The consumer stops source/target ordinary writers and supplies one writable
configured-owner transaction. Check actual `current_user`, full owner visibility
(`row_security_active` false for every protected relation), the exact closed
catalog/roles and required isolation before transfer. A boolean maintenance flag,
claimed role field or a transaction that can see only one tenant is insufficient.
Acquire `ACCESS EXCLUSIVE` locks in a fixed schema/relation-name order over the
complete offline population including the import ledger and scope fence before
identity lookup and all row invariants. Use READ COMMITTED; refuse an incompatible
nested boundary. The consumer's maintenance controls prevent external product
writers outside these relations from racing the transfer.

Validate the whole manifest and locked preexisting state before writing, then
insert in dependency order without disabling RLS, triggers, constraints or FK
checks. Existing rows may be reused only if they match the validated intended
facts exactly; an unrelated collision refuses. Preserve tenants, IDs, keys,
original timestamps, hashes, provenance, counters, consumption, conflict history
and already applied effects. Counters must already be safe beyond all consumed
numbers; unsafe source counters refuse rather than silently rewriting source
facts. Live source leases cannot grant a new actor authority during transfer;
resolve incompatible lifecycle state at the source before collecting a new
snapshot. No imported applied fact is downgraded or number reissued.

Forward migration `0008`, applied after 0007, adds
`offline.sync_import_receipts` and
`offline.sync_batches.response_body_is_archived boolean NOT NULL DEFAULT false`,
plus the archive-history guard. Existing/ordinary new batches default false;
this additive marker does not reinterpret their stored JSON response or change
ordinary replay. Only the owner import path may set true, exclusively for a
verified archive. Application-role INSERT/UPDATE must not establish true: the
guard checks actual configured relation-owner identity, never a caller-controlled
GUC/flag claiming maintenance authority. Once true, prevent removal/downgrade,
deletion or changes to batch identity, closed status, response bytes/status/
headers. Preserve unrelated ordinary-batch behavior. The closed catalog covers
the column/default and enabled archive guard as well as the ledger.
Its immutable logical source identity is `(source_system, source_snapshot_id)`.
The physical primary lookup key may be the SHA-256 digest of canonical JSON
`[source.system, source.snapshotId]`, so bounded long identities do not exceed
PostgreSQL index-tuple limits. Retain both original strings immutably and compare
them exactly on every lookup as well as all digests; a digest collision refuses,
never aliases another source or returns its receipt. The receipt binds
source digest, manifest digest, mapping digest, full original validated manifest,
actual importer/instant, result counts and each archive's verification verdict.
The configured owner alone can insert/read this maintenance ledger; app, reader,
PUBLIC and reachable parent capabilities cannot read or mutate it. Guard UPDATE
and DELETE against evidence replacement. The full original manifest preserves
unverified source response bytes, headers, state and provenance even when the
replayable batch must be classified `legacy_closed_unverified`.

Same source identity with identical source/manifest/mapping digests returns the
first immutable `OfflineImportReceipt` without effects; different content refuses.
Replay still validates current owner/maintenance boundary and the stored receipt's
integrity. `OfflineImportReceipt` contains `source`, `manifestSha256`,
`mappingSha256`, actual `importedBy`, `importedAt`, per-kind `recordCounts` and
per-batch `archives` verdicts. It never claims domain application or delivery.
An interrupted uncommitted import rolls back completely and can resume from the
same manifest; a committed import replays its receipt. There is no partially
visible chunk/resume checkpoint. Any refusal requires rollback of the caller's
transaction; no successful prefix or orphan receipt may commit.

Raw-text parsing and invalid object/options validation before SQL perform no
SQL and cannot persist a prefix. Once the importer enters its SQL phase, a
semantic/JavaScript refusal also marks the supplied PostgreSQL transaction
aborted using a fixed, non-input-derived failing statement before propagating
the error. Native SQL failures already abort it. Accidentally issuing COMMIT
after catching such an error cannot publish an imported prefix or receipt;
the caller must roll back and start a new transaction before retry. The importer
still does not own rollback/commit or hide the original refusal.

Use a typed `OfflineImportError` with closed `reason` values `invalid-manifest`,
`source-conflict`, `storage-unsupported`, `maintenance-required`,
`record-conflict`, `invariant-violation` or `archive-invalid`. These are owner-port
refusals, not a new HTTP error envelope or retry grant. Include safe object/check
identity, not secrets, payloads, raw ACKs or database URLs. Native transaction
errors still require rollback; do not turn a serialization failure into success.

## Independently verified archived responses

An archive binds a declared batch primary key, source digest, complete mapping
digest, exact response status, canonical base64 body and its digest, stored
replayable headers and their digest, plus actual `verificationEvidence`. Exactly
one archive may address a batch; it must match that batch's source response facts
and transported identity. Do not filter forbidden headers away to make evidence
pass. Validate the existing replayable-header rules, JSON ACK envelope/status,
tenant/batch/receipt identity and request/transport binding independently.

The supported archived response is a completed CTG9 ACK: HTTP 201, matching
batch ID and receipt device/batch/sequence, `receipt.status: 'closed'`,
`receipt.responseStatus: 201`, `receipt.responseBodyBytes: null` and an object of
string response headers. Null inner body is the genuine first-writer shape;
the outer archived bytes remain the actual complete response, not a recursively
embedded copy. Require nonnegative safe accepted/duplicate counts, duplicates
not greater than accepted, exact item/receipt count and unique queue identities,
and exact conflict-item coverage. Each item binds source tenant/device/org-unit/
agent, payload hash and actual outcome/context/receipt evidence. Optional `stynx`
may be absent when absent in the source; do not invent it or reject solely for
that absence. Where present it must match actual source platform context.
Supplied item keys and omitted-key legacy items follow the one-to-one rules above.

One supported duplicate writer has deliberately partial attempt context. Its
source attempt stores exactly `{ originalQueueItemId: canonicalQueueItemId }`,
including a same-ID submission under a later batch. Bind that attempt's tenant,
device/batch/submitted queue identity, status, error, key and payload hash exactly;
bind the referenced canonical receipt's tenant/key/hash/queue identity as well.
The archived item and its inner receipt entry must still agree exactly. Their
host context follows the actual duplicate writer: the original canonical host
context at response creation, with `originalQueueItemId` overlaid only when the
canonical and submitted queue IDs differ. For equal IDs the attempt marker is
not copied into the ACK; an empty original host context leaves ACK context absent.

This single writer shape may therefore differ from the attempt's singleton
context. Accept original host fields not retained in that attempt only when the
independent captured-ACK proof binds the exact archived context, response bytes
and source/receipt identities. The differing-ID overlay must equal the bound
canonical queue ID. Do not reconstruct unavailable earlier host context, require
an equal-ID overlay the writer did not produce, or compare historical status,
error or host context with the canonical receipt's mutable present outcome.
This exception does not admit arbitrary context subsets: attempts outside this
exact duplicate shape retain exact source-context matching, and missing or
contradictory identity, snapshot outcome or independent proof refuses verification.

For an original submission without a durable attempt, require exactly one
source queue row and exactly one canonical receipt matching its tenant, device,
batch, queue ID, key and payload hash. Bind the archived item to those stable
identities and its exact declared-key rules. Queue and canonical receipt status,
error and context may have changed after the response closed; preserve their
actual imported values, but do not use their present values as an archive-time
outcome oracle. The ACK item and inner receipt entry must still agree exactly.

In this fallback, historical outcome/context custody comes from the independently
retained original transport capture: exact raw response bytes, status and headers,
bound to the original authenticated request/transport identity, source snapshot
and complete mappings. The trusted archive verifier must check that original
capture and its provenance, including the exact historical outcome/context.
Rehashing the submitted ACK or echoing its manifest/body digests into a verifier
result is not independent evidence. The same rule governs historical host context
not retained by a supported partial duplicate attempt. Do not synthesize missing
history or replace it with current storage. Without independent proof, retain
`legacy_closed_unverified`; contradictory immutable capture or stable source
identity refuses verification. Shape validation alone never promotes an archive.

Header names must be valid HTTP tokens and case-insensitively unique. Values
must be accepted by the actual HTTP adapter's header-value validation; reject
CR/LF/NUL, invalid control/unrepresentable values and forbidden replay headers.
Do not filter or coerce invalid headers into a passing archive. Inner receipt
header bindings must agree with the corresponding archived replay headers;
current replay/correlation markers keep their existing separately applied rules.
These are source/shape checks before independent proof, not substitutes for it.

`OfflineArchiveVerificationPort` receives the frozen archive plus context
`{ source, manifestSha256, mappingSha256, batch, transportKeys }`; it may read
consumer-owned evidence but cannot mutate the import transaction or invoke domain
application/provider work. Its result is exactly `{ verdict: 'verified' | 'unverified',
sourceSha256, manifestSha256, mappingSha256, batch, responseBodySha256,
responseHeadersSha256, evidenceId }`, with every returned binding matching the
request and nonempty actual evidence identity. Invalid output, thrown verification
or a binding/digest mismatch refuses atomically. Caller-controlled `verified:true`
is not proof. Without the port or without actual independent proof, verdict is
unverified and the batch stays `legacy_closed_unverified`; raw source facts remain
in the immutable receipt. The consumer owns the trust/provenance of this verifier.

Only a verified archive can enable closed replay. The importer sets
`response_body_is_archived = true` atomically with its independently verified
archive and immutable receipt. Unverified imports remain false and
`legacy_closed_unverified`. The application role does not read the import ledger
to choose transport behavior. The service/controller raw-byte seam branches only
on the stored true marker, never source input, presence of response bytes or an
in-memory caller claim. False retains the existing ordinary closed-response
JSON/controller serialization and envelope behavior unchanged.

Preserve true-marked response bytes and headers immutably and replay them
through that confined raw-byte response seam:
the transport's stored status/headers and original body bytes are sent directly,
without JSON parse/stringify or framework serialization changing whitespace,
key order or encoding. Existing current-request replay markers and correlation
headers retain their existing semantics. Do not change the CTG9 route, status,
ACK envelope or ordinary newly produced response assertions. The legacy
unverified state refuses replay as before; it never gets a synthesized ACK.

### Exact archived-body adapter port

The additive consumer hook is:

```ts
interface SubmitSyncBatchOptions {
  replayArchivedBody?: (bytes: Uint8Array, headers: Readonly<Record<string, string>>) => void;
}
```

It is required only when replay selects a stored verified true archive marker;
omission refuses configuration (`OfflineSyncConfigurationError`,
`archivedReplayTransport`). False/ordinary paths do not require or invoke it.
The store gives the hook detached exact body bytes and a detached readonly
stored-header object, while separately decoding the programmatic result.
The hook is synchronous; no returned promise is awaited. Capture the bytes for
transport after successful service completion; do not mutate or reconstruct them,
perform domain effects, or treat the decoded programmatic return as equivalent
wire output. Stored status/headers and current replay-marker behavior continue
through the existing response adapter.

The mounted CTG9 controller captures this hook and returns Nest `StreamableFile`
with the original bytes, archived content type (default `application/json`) and
actual byte length. The consumer's envelope/serialization/interceptor chain and
HTTP adapter must preserve that raw binary body; it must not wrap it in JSON,
serialize the file object, stringify the decoded ACK, alter whitespace/key order
or substitute a new body. Ordinary new and closed replay paths keep their
existing JSON/envelope behavior. This obligation concerns only the verified
archive branch, not a blanket response-interceptor exception.

Actual DETRAN HTTP characterization through its mounted adapter and real
interceptors is required before claiming consumer archive-replay acceptance.
Compare original body bytes, status, permitted stored headers and current replay
markers, preserving all existing route/status/envelope assertions and ordinary
replay regressions. Framework/store tests alone cannot certify that consumer
pipeline; no test PKI/provider or machine readiness claim supplies this evidence.

## Complete storage verification and acceptance

The offline artifact/manifest covers the canonical 0001–0007 chain plus 0008,
all twelve runtime relations and the owner-only receipt ledger, columns,
constraints/indexes, enabled FK/history/active-scope triggers and functions,
FORCE RLS policies, effective grants/membership, and exact role/tenant bindings.
Include reservation origin and nullable shift, written scope fence, first batch
mode, range attributes/creation receipt/cancellation provenance and guards.
Name advisory locks, required isolation, row locks and `app.tenant_id`/actor
context dependencies. An SQL-reference inventory alone cannot prove these.

Read-only verification checks all tenants, original identity relationships,
FK orphan absence, counter/no-reissue and range overlap, mixed-origin active
admission, provenance/receipt integrity, durable batch/transport/attempt links,
and verified versus unverified archived replay consistency. Every true archive
marker must have matching immutable verified import custody, batch identity and
body/status/header digests. An orphan or mismatching marker fails supported
status; a boolean alone is not archive evidence. Missing or unreadable
checks fail supported status. The exclusive importer uses shared internal
inspection in its writable boundary, never a weakened public verifier.

After commit, run the public read-only verifier and actual consumer protocol
regressions before ordinary writes resume. Acceptance compares independently
installed default/custom tenant-role catalogs, fresh and populated upgrades,
atomic invalid-prefix rollback, equal/changed source replay, mapping/tenant
refusals, nullable reservations and immutable history, lossless timestamps/bigints,
missing proof and exact archived wire bytes. No test, threshold or historical
observation is weakened for import support.

## Prospective 1.6.1 reconciliation history extension

[ADR-MOBILE-OFFLINE-0005 D5](../../../law/adr/ADR-MOBILE-OFFLINE-0005-acceptance-evidence.md#d5--durable-reconciliation-history-v-13)
adds `stynx-offline-import/2`. Its envelope retains the same closed fields and
digest rules. Version `/1` still admits exactly the original eleven kinds;
`reconciliations` is refused under `/1`. Version `/2` additionally admits
`{ kind: 'reconciliations', row }` mapped by exact `targetKey: { tenant_id, id }`
to `offline.numbering_reconciliations`.

The closed row has `id`, `tenant_id`, `reservation_id`, `actor_id`, `created_at`,
`claimed_numbers`, `user_ref`, `idempotency_key`, `request_fingerprint` and
`result_json`. Nullable fields are explicit null. `claimed_numbers` uses the
existing canonical-decimal bigint import representation; its safe-integer,
sorted-unique semantics are independently validated. `result_json` is the actual
complete closed reconciliation result, including its `reconciliationId`, stable
reservation/status, consumption snapshot and missing/unexpected arrays. Preserve
original actor, instant, key, claim set and result; do not recompute the result
against current consumption, invent an old observation or apply any claim again.

Require row ID = result reconciliation ID, reservation ID = result reservation
ID, same-tenant existing reservation, valid result/claim numbers in the original
interval and the declared request-key/fingerprint relationship. Keyed replay
uniqueness is scoped to tenant/reservation; unknown fields, kinds, malformed
snapshots, dangling mappings or conflicting existing evidence refuse atomically.
Import causes no domain effect or resolution event. The verifier includes forward
migration `0009` and its immutable, FORCE RLS relation under the consumer binding.
Old `/1` manifests and their immutable digests remain valid without synthetic
reconciliation rows. Candidate-bound installed-package, populated upgrade and
restart/idempotence tests are required before declaring this extension delivered.
