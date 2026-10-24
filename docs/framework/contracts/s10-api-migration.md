# S10 approved API migration and acceptance checklist

This is a migration guide for the accepted [ADR0030](../../../law/adr/2026-10-23-s10-public-type-soundness-proposal.md) and [ADR0031](../../../law/adr/2026-10-23-s10-generated-sql-disposition-proposal.md) decisions. Implementation is in progress. These examples describe the approved target; they do not establish a published version, completed public API baseline, full SM-09/SM-11 acceptance or downstream DETRAN/PORM acceptance. Release classification remains separate.

## Pool lifecycle types

The registry starts with an empty mutable map. Its public types now describe that existing behavior:

```ts
readonly pools: Partial<Record<StynxDataRole, Pool>>;
get(role: StynxDataRole, replica?: boolean): Pool | undefined;
```

Narrow a selected pool before dereferencing it. For example, a caller that chooses to require initialization can make its own error policy explicit:

```ts
const pool = registry.get('app');
if (pool === undefined) {
  throw new Error('This operation requires an initialized app pool');
}
const client = await pool.connect();
try {
  // Use the acquired client within the caller's existing lifecycle.
} finally {
  client.release();
}
```

This example does not change registry.get into a throwing method. Preserve existing caller-specific errors when migrating framework code. The public map remains mutable; preinitialization test injection such as `registry.pools.app = pool` remains supported. Initialization can fail partway through, so do not assert that the whole record is complete merely because one entry exists. A callback that requires all roles must receive a fresh snapshot after checking owner, app and reader, preserving its existing complete-record contract.

Migration checklist:

- Replace unchecked Pool assignments from get/map lookup with narrowing or an existing validated initialization boundary.
- Retain replica selection, partial-failure cleanup, preinit injection and ordinary object enumeration.
- Keep complete migration callback snapshots independent of later mutations to the public map.
- Compile representative consumers against emitted declarations; do not use a non-null assertion or cast to hide missing initialization.

## Symbol-backed table markers

Use the existing marker constructors on actual Drizzle tables. Their return types now use the real runtime symbol properties, preserving the same table object:

```ts
import { softDeletable, makeLiveOnly, SOFT_DELETABLE, LIVE_ONLY } from '@stynx-nyx/data';

const deletable = softDeletable(existingPgTable);
const live = makeLiveOnly(anotherPgTable);
const marked: true = deletable[SOFT_DELETABLE];
const liveMarked: true = live[LIVE_ONLY];
```

The symbols retain `Symbol.for('stynx.data.soft-deletable')` and
`Symbol.for('stynx.data.live-only')`. Constructors retain nonenumerable,
nonwritable, nonconfigurable marker descriptors. Stop constructing or reading
the old phantom `__stynxSoftDeletable` / `__stynxLiveOnly` string properties;
they were never created at runtime.

`isSoftDeletable(value)` proves only that its marker is exactly true. When the
input is already a genuine Drizzle table, TypeScript retains that table type
and adds the marker. When the input is unknown, a marker alone does not prove
that the object is a table. Establish the table contract independently before
using table operations. Markers are not authorization credentials; RLS,
transaction and archive checks remain required.

Migration checklist:

- Preserve generic column/row inference through the constructors and aliases.
- Keep live-only tables rejected by archive-operation compile-time tests.
- Preserve table identity, descriptors, inherited marker handling and cross-module symbol identity.
- Reject a forged truthy non-boolean marker as typed evidence; do not fabricate a table predicate from a symbol-only check.

## Explicit undefined in request-context patches

RequestContextPatch now admits explicit undefined for tenantId, actorId,
sessionId, locale and roles, matching existing clearing behavior. Omitting a
key retains it; supplying undefined removes that optional key from the
normalized snapshot. RequestContextState remains the normalized output type.

```ts
mutator.patch({ sessionId: undefined }); // Clear the existing optional session.
mutator.patch({}); // Retain the current session.
```

Keep this distinction in consumer tests. No cast is needed for a public-route
session clear, and snapshots must not acquire own undefined optional fields.

## Generated SQL: preserved behavior and explicit remaining work

ADR0031 preserves exactly two legacy consumer-output families: generated
partial create/update statements and arbitrary adoption SQL rewrites. Existing
blueprint limits, omitted-column defaults, selected-column UPDATE semantics,
one-statement behavior and operation availability remain unchanged. There is
no new raw executor admission, dynamic registry entry or field limit.

| Population                                                      | Approved implementation direction                                                                                           | Acceptance boundary                                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Actual SQL execution by STYNX CLI/runtime source                | Continue the checked-executor/static repository work under ADR0028/0029.                                                    | Source lint alone does not inspect emitted consumer programs.                                                 |
| Generated list/get/delete with compatible non-timestamp results | Emit literal defineQuery definitions in `*.repository.ts`; preserve parameters, cardinality, row shape and tenant behavior. | Requires materialized-output lint/runtime and packed-consumer verification.                                   |
| Generated partial create/update                                 | Preserve current behavior as explicit legacy output.                                                                        | This population remains incomplete for static SQL / full SM-09 acceptance.                                    |
| Arbitrary adoption SQL rewrites                                 | Preserve existing rewriting and rollback behavior as explicit legacy output.                                                | Automatic authoritative parameter/row schemas remain unavailable; typed-output acceptance remains incomplete. |
| Timestamp-bearing generated result contracts                    | Preserve behavior pending the separate public representation decision.                                                      | ADR0030/0031 do not authorize a new Date/string conversion or rejection of valid timestamp values.            |

The direct generated repository currently returns driver timestamp values even
where its declaration says string. Do not use the HTTP serializer as evidence
that a direct repository value is already a string. The separate decision must
account for null, infinity and out-of-range values before a typed validator is
introduced. This guide grants no additional approval.

Generator/adoption checklist:

- Keep supported blueprints accepted and all previously generated operations available.
- Retain omitted defaults, column-specific triggers, bound values and single-statement writes.
- Preserve actual generated-output assertions, tenant isolation, permissions and adoption rollback/idempotence tests.
- Distinguish independently converted static operations from the two legacy families in the final census.
- Do not call the whole CLI, all generated programs or full SM-09 complete while those families remain deferred.
- Track schema-informed adoption and a future partial-mutation design separately; neither is implemented by renaming a generic SQL forwarder.

## Candidate closeout

Inspector owns the runtime and emitted-consumer regressions; Engineer owns the
implementation; Architect reviews the intended emitted declarations and uses
the official baseline writer after the coordinated clean build. Record the
exact source/test/baseline candidate and remaining acceptance populations.
These compile-time changes can require consumer migration even where runtime
behavior is preserved. Choose release classification separately, and keep
publication and downstream DETRAN/PORM acceptance outside this implementation
checkpoint.
