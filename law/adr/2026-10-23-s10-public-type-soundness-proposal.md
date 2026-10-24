---
adr_id: ADR-DEVAI-ADOPTION-0030
title: Honest pool lifecycle and symbol-backed table types
status: accepted
date: 2026-10-23
authors: ['Architect']
tags: [stynx, data, types, compatibility]
---

# ADR-DEVAI-ADOPTION-0030 — Public type soundness

**Status:** Accepted design; implementation and verification remain pending. The review filename is retained to preserve the linked proposal.

**Authority:** On 2026-10-23, after reviewing the two public type corrections and their consumer migration and release implications, the Owner answered **“Approve both type corrections; assess release version separately”**. This authorizes the bounded corrections below, not publication, a version choice, a commit-specific receipt or completed acceptance. The additive request-context correction remains independently ratified. Existing S10 approvals, ADR0028's archive bridge and ADR0029's bounded registry remain intact.

## Decision

Correct the two inaccurate published TypeScript contracts below while preserving legitimate runtime behavior. This requires consumer source migration and a separate release compatibility assessment; it is not an automatically compatible change for the intended 3.1 release. The Owner selected these corrections over deferral; no unsafe-rule suppression or premature acceptance claim is authorized.

No publication, downstream DETRAN/PORM acceptance, new SQL exception or external foundation amendment is authorized by this decision.

## 1. Partial pool lifecycle

`packages/data/src/pools.ts` declares `pools: Record<StynxDataRole, Pool>` but initializes it to `{}` through a narrowing assertion. Before initialization, absent property reads return `undefined`. Initialization fills the entries asynchronously and can fail partway through. `packages/data/test/unit/app-role-property-check.spec.ts` also requires preinitialization `registry.pools.app = pool` injection followed by `ensureAppRole()` without calling `onModuleInit()`.

The approved public contract is:

```ts
readonly pools: Partial<Record<StynxDataRole, Pool>>;
get(role: StynxDataRole, replica?: boolean): Pool | undefined;
```

Retain the ordinary mutable map, initially empty; preserve direct role assignment, property enumeration, replica selection, initialization order/idempotence, role verification and cleanup of existing entries. Do not replace absent reads with throwing getters, eagerly create pools, or introduce a proxy. The corrected types describe the existing runtime, including partial initialization.

Consumers must narrow a selected pool before calling its methods or establish initialization through a separately validated complete snapshot. Any complete snapshot must check all three entries and must not cache a stale proof across externally writable assignments. Do not disguise a partial record through `declare`, definite assignment, an unchecked overload, a fabricated type predicate or a generic cast helper.

Inspect `database.ts`, `migration-runner.ts`, `AppRoleVerifier` setup, the public migration `runner` callback and other pool consumers. Retain the existing callback's complete-record parameter where initialization supplies a real checked complete snapshot; do not silently widen unrelated callback contracts. Specify and test absent-pool behavior at internal dereference boundaries before introducing any new error. The corrected `get` itself continues to return `undefined` when no pool exists; this decision does not authorize replacing its existing absent return with a throw. Preserve the existing preinit injection test and initialization failure/cleanup assertions.

## 2. Actual symbol-backed table brands

`packages/data/src/types.ts` currently declares required string fields `__stynxSoftDeletable: true` and `__stynxLiveOnly: true`. `table-markers.ts` never creates those fields: it sets `Symbol.for('stynx.data.soft-deletable')` or `Symbol.for('stynx.data.live-only')` to `true`, nonenumerably, nonwritably and nonconfigurably. A symbol-only check therefore does not prove the published string fields. Checking an arbitrary `unknown` value's symbol also does not prove that it is a Drizzle `AnyPgTable`.

Replace the string phantom fields with actual symbol-keyed marker types. Define and export stable unique-symbol constants backed by the same `Symbol.for` keys, and derive `SoftDeletableTable<T>` and `LiveOnlyTable<T>` as intersections of `T` with their corresponding readonly symbol marker. Keep both marker constructors generic over a genuine input `T extends AnyPgTable`, preserve object identity and the existing descriptor attributes, and return the input only after verifying the symbol property that supplies the intersection. Do not materialize new string fields, which would change runtime shape and could collide with table columns.

The public `isSoftDeletable(value: unknown)` guard may prove only the actual marker object shape. A typed `AnyPgTable` input naturally narrows to the intersection of its existing table type and the marker; an arbitrary unknown input remains a marker-bearing object, not a proven table. Retain existing legitimate table operations, generic column inference, transaction overloads and select-with-deleted typing. If a caller starts from unknown and needs a table, it must separately establish the Drizzle table contract. No marker predicate or constructor overload may hide the old unchecked table assertion.

A marker value of exactly `true` supplies the corrected marker type. A forged truthy non-boolean marker does not establish that type. Existing constructors emit exactly `true`; explicitly test this approved tightening on malformed inputs, as well as unmarked/null values, cross-module `Symbol.for` identity and both marker constructors. A symbol can be forged and is not an authorization credential; transaction/RLS/archive checks remain required independently. Inspect inherited marker behavior and document any intentional change rather than silently treating an own-property check as equivalent.

Consumer migration: obtain table types through the constructors or new symbol-backed aliases; stop fabricating or inspecting the phantom string fields. Code that used the old guard to treat arbitrary unknown input as a table must validate the table independently. Keep the existing compile-time tests rejecting archive operations on live-only tables and preserve generic row inference. Update the public API documentation and regenerate the baseline only after the intended declarations are reviewed.

## Compatibility and release disposition

Both changes can break consumers at compile time even when legitimate runtime behavior is preserved. Existing `Pool` assignments from unchecked lookups, string-brand structural declarations and unknown-to-table narrowing may fail to compile. Document concrete migration examples and test them through emitted declarations. Do not label the changes purely additive or silently publish them as 3.1-compatible. Before release, determine whether the repository's public API policy requires a major version or a separately approved compatibility transition. S10 implementation approval and a future release/publication decision remain separate.

The reviewed alternative was to defer these corrections, preserve the current implementation and declarations, enumerate the exact remaining unsafe assertions/false contracts, and leave SM-11 incomplete. The Owner did not choose that alternative. Until implementation and verification complete, acceptance remains pending. Do not remove those files from the workspace lint scope, lower rule severity, add unsafe-rule suppressions, or move the assertions into unexamined helpers. Continue independent static conversions and the already approved compatibility work.

## Independently ratified request-context correction

`RequestContextPatch` may explicitly allow `undefined` for its five optional fields (`tenantId`, `actorId`, `sessionId`, `locale`, `roles`). Existing patch application merges the patch and deletes undefined optional values; public-route handling intentionally clears `sessionId`. This widening makes the input type reflect existing behavior under `exactOptionalPropertyTypes`, while `RequestContextState` remains the normalized output contract.

Engineer owns the implementation in `packages/core/src/request-context.ts` and the corresponding removal of the hiding patch assertion in `packages/tenancy/src/tenant-context.interceptor.ts`. Use a precise intermediate input type and construct or narrow normalized output honestly. Inspector must retain clear-versus-omit behavior and verify that snapshots contain no own undefined optional fields. This additive correction is within existing S10 type/lint work and does not await the two decisions above.

## Authorized execution

Inspector first adds runtime and emitted-type regressions for both approved contracts. Engineer implements the agreed changes; Architect reviews emitted public declarations and rebinds the baseline through the official procedure when a build window is available. Preserve existing tests, assertions, thresholds and role separation. The Owner's exact answer is recorded above. Keep evidence tied to the verified candidate and do not update runtime governance records manually.
