# Consumer-owned outbox and offline storage

This is the STYNX 1.6.0 contract for the accepted consumer-storage deliverables
in [OUTBOX-0004](../../../law/adr/ADR-OUTBOX-0004-retirement-and-closed-storage.md)
and [MOBILE-OFFLINE-0004](../../../law/adr/ADR-MOBILE-OFFLINE-0004-minor-parity-and-import.md).
The consumer owns its migration, tenant table, roles, product mapping and audit
chain. A live verifier pass for the installed package is required for supported
consumer-owned mode. This document is not a claim that an unverified database is
supported.

## Binding and public ports

The reusable structural types live in `@stynx-nyx/data`; both packages use them:

```ts
interface StorageRoleBinding {
  ownerRole: string;
  appRole: string;
  readerRole: string | null;
  tenantTable: { schema: string; table: string; column: string };
}

interface OutboxStorageOptions {
  ownerRole?: string;
  appRole?: string;
  readerRole?: string | null;
  tenantTable?: { schema: string; table: string; column: string };
}

interface StorageVerificationCheck {
  id: string;
  status: 'pass' | 'fail' | 'unknown';
  object: string;
  tenantId?: string;
  expected?: unknown;
  actual?: unknown;
  reason?: string;
}

interface StorageVerificationReport {
  contractVersion: string;
  packageVersion: string;
  binding: StorageRoleBinding;
  supported: boolean;
  checks: readonly StorageVerificationCheck[];
}
```

The offline package exposes the same options shape as `OfflineStorageOptions`.
Defaults are owner `stynx_owner`, app `stynx_app`, reader `stynx_reader` and
tenant table `tenancy.tenants(id)`. Explicit `readerRole: null` omits a reader
binding. Every identifier is nonempty, at most 63 UTF-8 bytes, validated and
quoted independently; no arbitrary SQL or dotted identifier fragment is accepted.
Schema `outbox`/`offline` is fixed by the runtime SQL.

The data package also exports `StorageBindingOptions`,
`resolveStorageRoleBinding(options?)`, `quoteStorageIdentifier(identifier)` and
`collectStorageCatalog(trx, schema)`, with the `StorageCatalogEntry` type. The
resolver applies these defaults and rejects unknown options, malformed identifiers,
duplicate role identities and `PUBLIC` as a role. The catalog collector returns
sorted `{ kind, name, value }` entries from catalog queries; collecting entries
alone is not verification or a supported-storage verdict.

`renderOutboxStorage(options?)` returns `OutboxStorageArtifact` with
`contractVersion`, `packageVersion`, resolved `binding`, `objectsSql`,
`roleBindingsSql` and `manifest`. The objects artifact contains only outbox
objects. The renderer operates offline from shipped digest-bound templates and
manifest; catalog introspection belongs only to explicit generation tooling and
verifier execution, never a hidden renderer subprocess. Its source is the current
canonical platform chain, including forward
migration 0026. It excludes platform audit statements. The role-binding artifact
is independently applicable to an existing installation and can bind an additional
app role. It does not erase an unrelated role's policy or grant. Applying either
artifact repeatedly does not alter rows, identities, counters or evidence.

`verifyOutboxStorage(trx, options?)` and `verifyOfflineStorage(trx, options?)`
return `Promise<StorageVerificationReport>`. `StorageVerifierTransaction` is a
structural query executor compatible with a STYNX transaction or an equivalent
consumer transaction. The caller supplies an already-read-only live transaction
as the configured owner. The verifier checks `transaction_read_only` and actual
`current_user`; it does not trust an object property claiming a role. It never
opens a second connection, starts/commits the caller's transaction, executes DDL,
grants a privilege or repairs a row. A command-line wrapper returns nonzero when
`supported` is false. Unavailable/unknown checks cannot count as passes.

## Outbox storage command

The outbox package ships the `stynx-outbox-storage` executable. Rendering needs
neither a database URL nor a connection and writes the complete artifact as JSON
to standard output:

```sh
stynx-outbox-storage --render \
  --owner-role consumer_owner --app-role role_app_backend \
  --reader-role consumer_reader \
  --tenant-schema auth --tenant-table tenants --tenant-column id
```

Omit role and tenant flags to use the defaults above. `--no-reader` selects
`readerRole: null` and cannot be combined with `--reader-role`. When overriding
the tenant table, supply all three separate flags: `--tenant-schema`,
`--tenant-table` and `--tenant-column`. Unknown flags, positional arguments and
invalid bindings are refused. The command emits SQL in the JSON artifact; it
does not apply that SQL.

Without `--render`, the command verifies the live database using the same binding
flags. `--database-url-env NAME` selects the environment variable containing the
owner connection URL; its default is `STYNX_STORAGE_DATABASE_URL`. Pass the
variable name, never a URL on the command line:

```sh
stynx-outbox-storage --database-url-env CONSUMER_STORAGE_OWNER_URL \
  --owner-role consumer_owner --app-role role_app_backend --no-reader \
  --tenant-schema auth --tenant-table tenants --tenant-column id
```

The command connects, begins a read-only transaction, prints the verification
report as JSON and rolls the transaction back before disconnecting. Exit status
is zero only for a supported report; failed/unknown checks or configuration and
connection refusals return nonzero. Refusals do not echo the connection URL or
secret values. This CLI owns its connection and transaction; the library verifier
continues to use only the caller-supplied transaction.

## Closed manifest and checks

The generated manifest is versioned and shipped in the package. It enumerates
all referenced relations, columns/types/nullability, keys/checks/FKs, indexes,
functions/triggers, sequences, FORCE RLS, policies and minimum grants. Objects
are named by exact schema/object identity, with logical role and tenant-table
parameters resolved through the binding. Non-relational lock/GUC dependencies
are separately named. Runtime SQL references outside this closed inventory fail
the repository reference guard.

Mandatory checks include:

- Every required object and structural property, policy expression and required
  trigger/function behavior; no missing immutable-history guard.
- Exact configured app identity, neither superuser nor `BYPASSRLS`, no ownership
  or inherited membership of a protected owner, and no mutation grant on immutable
  history. Reader access is read-only; default roles receive the same checks.
- All parent capabilities reachable through `MEMBER`, including `SET ROLE`
  paths with `NOINHERIT`; applicable parent/PUBLIC policies and effective ACLs
  cannot broaden the contract. App and reader cannot hold grant options.
- Enabled and forced RLS, tenant-leading keys/FKs, original tenant identity,
  dedup uniqueness, counter/cursor monotonicity and other stored-row invariants.
- Enabled internal FK enforcement triggers and independent stored orphan scans;
  the ownership singleton, legacy map/generation, migrated delivery and ACK
  tenant identities must agree.
- Owner visibility with `row_security_active` false on every protected relation;
  a matching owner name alone does not prove that all rows were inspected.
- Retirement terminal/provenance consistency; acknowledged or retired rows are
  not outstanding, and genuine historical evidence is not reconstructed.
- Offline canonical stored hashes, non-overlapping/non-reissued numbering,
  reservation scope/status consistency and replay evidence availability.

The offline closed manifest includes the forward `0006` scope fence,
`offline.numbering_reservation_scopes`, its tenant-leading composite key,
generation UUID, FORCE RLS/policy and app SELECT/INSERT/UPDATE without DELETE
(reader SELECT), together with `offline.guard_active_numbering_reservation`
and its enabled trigger. Verify scope/origin immutability and mixed-origin
admission. The guard writes the normalized null/string scope fence before its
collision query and rechecks expiry after waiting. This prevents admission
through a stale repeatable-read snapshot; the contender may receive `40001`.
An advisory-lock declaration without this written fence is not equivalent.
Fence rows are concurrency state, not invented effect/history evidence.

`supported` is true only when every mandatory check passes. Each failure names
its object/check, expected and observed condition and tenant when applicable;
secrets and payloads are not echoed. Permission errors are not silently skipped.
Source/canonical manifest regeneration and real PostgreSQL catalog equivalence
are separate repository gates; a self-consistent handwritten manifest is not
enough. Test platform-default and independently rendered consumer installations.

`pnpm check:outbox-storage` checks generated artifact freshness and closure of
runtime storage references. It is a mandatory `ci:stynx` gate before
`check:trace`; live catalog equivalence and consumer-installation tests remain
required independently.

Catalog comparison normalizes PostgreSQL 18's separate NOT NULL constraint rows
to the existing column `notNull` property. It omits only the owner's implicit
`MAINTAIN` catalog grant; it does not discard an app grant or inherited privilege.
On PostgreSQL 17 and later, effective app `MAINTAIN` privilege is checked as a
hazard alongside the other forbidden privileges.

## Transferred event cursor safety

A tenant clock at least as large as its greatest stored event timestamp is
necessary but does not by itself guarantee the next append sorts after an
imported event. Stored timestamps must be finite milliseconds; clocks must lie
between `0` and `281474976710655` milliseconds. Verification computes the
prospective append instant as `max(last_ms, floor(live_wall_clock_ms))` and the
next global sequence value from `last_value` and `is_called`, without calling
`nextval`. The sequence must have an available signed-bigint value. At that
prospective instant, the runtime-generated UUID must sort strictly after every
stored event ID with the same timestamp.

Imported historical IDs need not be UUIDv7. If the prospective instant is later
than a row's timestamp, its arbitrary UUID does not obstruct cursor ordering.
If an imported future timestamp ties that instant, its ID must be below the
prospective runtime UUID. An unsafe tie fails verification; actual wall-clock
advance beyond that timestamp can later make it admissible. The verifier never
changes timestamps, clocks, IDs or sequence state. A pass describes the observed
database state, not a permission to import later rows without rechecking.

## Upgrade and import boundaries

Offline `objectsSql` is applied once to fresh storage. Unlike the repeatable
outbox objects artifact, it includes the ordered offline migration chain and
backfills. Existing offline installations use the consumer's migration ledger to
apply only missing forward migrations, then separately apply `roleBindingsSql`
and run `verifyOfflineStorage` in the required read-only owner transaction. Use
`renderOfflineStorageMigrations` for supported per-migration custom bindings and
original source/bound SQL identities. Its pure ordered artifact supplies no
selection or live-state inference: the consumer must admit a receipted contiguous
prefix and prove the prior exact contract before mutation, using a pinned prior
verifier or trusted catalog custody and applicable row checks. The
role-binding projection may be reapplied; the complete fresh objects artifact
must not be replayed over existing storage.

Apply forward migrations/artifacts before code uses new objects. Preserve
historical migration bytes, batch responses, event/attempt/ACK/history rows and
observation evidence. Outbox has no independent `database/ddl` mirror: its platform
migration chain is canonical. Seed coverage must prove fresh structural readiness
and absence of fabricated operational history, together with populated-upgrade
fixtures. An additional authored copy of the schema is not a substitute.

Outbox consumer-owned mode guarantees the verified outbox contract, not the
consumer audit chain. `storageMode: 'consumer-owned'` explicitly selects that
module mode; omission retains `platform`. Custom legacy cutover remains
unsupported. Consumer mode rejects it before SQL with
`OutboxConsumerStorageCutoverUnsupportedError` (409,
`OUTBOX_CONSUMER_STORAGE_CUTOVER_UNSUPPORTED`, reason `consumer-owned-storage`).
Platform mode safely checks the actual audit-function dependency before marker
locks or mutation; absence has reason `audit-chain-unavailable`, never a raw
`regprocedure` cast error. The consumer's
owner-only transfer must preserve tenant, immutable fact identity, dedup, cursor
clock and actual history. Offline import uses the explicit owner-only verified
manifest seam in MOBILE-OFFLINE-0004 D6, with writers stopped, atomic idempotent
mapping and post-import verification. Missing archived response bytes keep a
batch `legacy_closed_unverified`; missing evidence never becomes invented replay.

The exact offline renderer/verifier and `importOfflineState` owner maintenance
port are defined in [offline storage/import](offline-storage-import.md). The
closed artifact includes 0001–0007 and forward 0008's immutable owner-only import
receipt ledger, including range creation/cancellation guards and the derived
scope fence. Import never makes the public verifier writable or treats missing
source/ACK evidence as a supported replay.
