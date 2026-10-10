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
- Enabled and forced RLS, tenant-leading keys/FKs, original tenant identity,
  dedup uniqueness, counter/cursor monotonicity and other stored-row invariants.
- Retirement terminal/provenance consistency; acknowledged or retired rows are
  not outstanding, and genuine historical evidence is not reconstructed.
- Offline canonical stored hashes, non-overlapping/non-reissued numbering,
  reservation scope/status consistency and replay evidence availability.

`supported` is true only when every mandatory check passes. Each failure names
its object/check, expected and observed condition and tenant when applicable;
secrets and payloads are not echoed. Permission errors are not silently skipped.
Source/canonical manifest regeneration and real PostgreSQL catalog equivalence
are separate repository gates; a self-consistent handwritten manifest is not
enough. Test platform-default and independently rendered consumer installations.

## Upgrade and import boundaries

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
