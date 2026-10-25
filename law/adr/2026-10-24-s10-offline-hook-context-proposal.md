---
adr_id: ADR-DEVAI-ADOPTION-0041
title: Honest Offline hook contexts
status: accepted
date: 2026-10-24
authors: ['Architect']
tags: [stynx, offline-sync, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0041 — Honest Offline hook contexts

**Status:** Accepted on 2026-10-24; implementation and independent verification remain pending. The proposal filename and source-reviewed evidence are retained.

**Authority:** The Owner answered **“Approve the bounded Offline hook-context correction”** for this exact proposal. The accepted scope is the five exported interfaces, seven methods and four production carrier sites below, with necessary options/store/internal/reference caller migration and the stated preservation controls. No four-site production unsafe-rule exception is approved. ADR0033 F2 remains limited to its two testing-helper assertions. Formal DEVAI acceptance, release classification/publication, DETRAN/PORM, #211 and historical closure remain separate.

## Existing authority

[ADR0028](2026-10-23-s10-typed-query-adoption.md) requires strict honest boundaries while preserving public behavior. [ADR0033 F2](2026-10-23-s10-generic-boundary-disposition-proposal.md) supersedes the no-exception rule only for the two existing testing-helper assertions; it does not authorize these production casts. [ADR0032](2026-10-23-s10-public-representation-proposal.md), [ADR0034](2026-10-23-s10-audit-outbox-result-proposal.md) and [ADR0039](2026-10-24-s10-audit-opaque-result-proposal.md) concern bounded result representations, not Offline hook inputs. [ADR0040](2026-10-24-s10-root-lifecycle-admission-proposal.md) concerns exact root lifecycle operations. All prior approvals retain their own exact scope; this decision adds only the bounded Offline hook-context correction below.

## Concrete contradiction and scope

The public `types.ts` interfaces OfflineSyncItemApplier, OfflineSyncEventPort, OfflineSyncConcurrencyDetector, OfflineSyncHandoffPort and OfflineSyncConflictResolver promise `Transaction` in seven methods (apply; appendInTransaction/appendManyInTransaction; detect; permits; resolve/allowedActions). Both module.forRoot and module.inMemory currently accept the same StynxOfflineSyncModuleOptions; DurableBatchExecutionOptions.ports also uses that type. No store/port generic correlation exists.

Exactly four production construction sites contradict that promise:

- `packages/offline-sync/src/offline-sync.service.ts:649`: custom-store resolver fallback passes a new `{}` after the existing specialized resolveWithPort and resolutionEventPort checks.
- `packages/offline-sync/src/in-memory-offline-sync.store.ts:1029`: new `{token:randomUUID()}` shared by allowedActions, resolve and resolution events.
- same file:1240: new token passed to integrity-conflict allowedActions.
- same file:1936: new per-item token shared by pre-apply/handoff/apply/concurrency/conflict/events.

These objects have no SQL or Transaction lifecycle methods. Memory mutation frames, ownership checks and rollback are implemented separately. Postgres paths supply real Transaction objects and must retain them. pre-apply.ts merely forwards the supplied context; changing its private parameter cannot repair the exported callback promise.

Source and initial census: `/tmp/stynx-offline-production-transaction-disposition-20261024/{review.md,hashes.json}`. Existing identity evidence: ctg9-parity.spec.ts:583–614 retains same item apply/event object, distinct items, serial order and no appendMany; pre-apply tests preserve detector/handoff identity; memory domain-outcome tests preserve frame rollback/late callback refusal. Actual PostgreSQL identity test remains distinct. None was rerun for this review.

## Accepted bounded correction

Use an honest common public context, preserving the actual objects and all callback signatures apart from their first argument type. A concrete minimal declaration is:

```ts
export type OfflineSyncHookContext =
  import('@stynx-nyx/data').Transaction | { readonly token?: string };
```

The second branch describes both current non-database carriers: empty fallback and token-bearing memory context. It is a structural carrier, NOT proof of a database, backend discriminator, transaction capability or rollback protocol. Do not freeze, tag, clone, add methods, wrap, replace or reconstruct the objects. The optional readonly property describes observation; it must not make the existing runtime object immutable. An even more conservative `object` common-context declaration is honest but discards useful native Transaction narrowing information; it is not the selected declaration for this decision.

Replace the first argument in exactly the five interfaces/seven methods with this alias. Propagate it through the two stores' resolveWithPort signatures, shared pre-apply forwarding and options/execution types only as needed. Real PG internal transactions stay Transaction, SQL/lifecycle code remains unchanged. The memory tokens and fallback empty object now satisfy the type directly; delete only the four false assertions. No suppressions or unchecked callback invocation adapter.

Callback implementations that ignore the context or use identity remain valid. Implementations that use SQL must establish the actual capability before using it. `instanceof Transaction` is an honest native-class narrowing where the callback is coupled to the installed native database backend; do not infer complete Transaction from a `query` or `token` property. Do not add a universal exported predicate or brand claiming complete Transaction. Structural/multiple-package external adapters may instead need their own real capability contract; no implicit acceptance of duplicate-package native class identities is claimed by this proposal.

Illustrative callback migration:

```ts
async apply(context, item, scope) {
  if (!(context instanceof Transaction)) {
    throw new TypeError('This application requires a database transaction');
  }
  return applyInDatabase(context, item, scope);
}
```

This example is NOT permission to change existing supported error semantics blindly. For the concrete reference SQL-only adapter, verify original successful PG behavior and choose its explicit unsupported-non-database refusal within this accepted bounded migration. The core Offline library must preserve its current fallback/in-memory routing and all errors/identities; it must not preempt callbacks with a new central guard.

## Exact impact and consumer closure

`types.ts` is exported by the package root. `StynxOfflineSyncModuleOptions`, DurableBatchExecutionOptions and exported memory/Postgres store method declarations propagate the parameter correction; method names, return types, input payloads and service endpoints are unchanged. It is a real compile-time correction: a callback body cannot unconditionally call query/run/etc on the common context. Existing Transaction-only callback annotations require review; TypeScript method bivariance is not proof they handle both backends, so emitted tests must exercise contextual callback bodies and consumption, not rely solely on assignment rejection.

The concrete production SQL-dependent consumer found by targeted symbol census is `reference/api/src/performance/offline-bookmark.ts`: apply/append use Transaction.run, transactionIdentity, AuditSqlSink and a WeakMap<Transaction,...>. Migrate its actual callback boundary with honest narrowing while retaining its native PG transaction checks and effects. Reference module wiring remains PostgreSQL. Unit/integration fixture annotations using Transaction as an identity-only object must become honest context/unknown annotations while retaining all identity and rollback assertions. External consumers require the same explicit migration note. This review did not inspect downstream repositories and grants no downstream changes.

Do not default new generic port types to Transaction while letting the same module/memory path accept them without store correlation. That would relocate the mismatch. A fully correlated backend-generic API is a larger alternative and unnecessary for this minimal correction.

## Alternatives not selected or authorized

1. Exact four-site production legacy exception: would require a separate explicit Owner amendment to O5/SM11, exact syntax/native-diagnostic census and disclosure that the callback Transaction promise remains false. F2 authorizes only the two testing helper assertions and cannot be reused. This is an available explicit tradeoff, not automatic fallback.
2. Real/dummy Transaction, testing helper dependency, Proxy, reflecting typed callbacks, false guards or overloads: not a faithful internal fix. They change capabilities/shape/errors/lifecycle or hide the same public contradiction.
3. Deferral: independent approved work continues, but these production findings leave strict completion incomplete. Do not claim C+D qualified.

## Required focused evidence before implementation acceptance

Inspector should capture the current four branches before source changes: own shape/prototype/UUID allocation, original callback receiver and lazy gets, exact shared and distinct identities, returned/error identity, missing-method native failure, fallback priority with/without specialized resolveWithPort and resolutionEventPort, no new SQL. Retain existing frame/rollback/sibling/late async cases and actual PG transaction identity/RLS cases. The source-reviewed baseline controls already exist in part; missing branch controls are not claimed passed.

After correction, emitted strict consumers must prove: identity-only callbacks work with memory/fallback and native contexts; unguarded native methods on the common context fail compilation; genuine native narrowing permits actual Transaction operations; return/input/public endpoint shapes unchanged. Do not force rejection of narrower method assignment when TypeScript's method bivariance permits it. The runtime census must show exactly the original four allocation sites and zero replacement facade casts. Run relevant offline/reference tests, strict rules, and eventual official API baseline under the combined C+D qualification—not a separate publication.

## Accepted decision

The decision authorizes the bounded Offline hook-context type correction for these five exported interfaces/seven methods and their necessary options/store/internal/reference propagation. Preserve real PostgreSQL Transaction objects and the current empty/token memory carriers, callback identities, ordering, mutation frames, errors and SQL; require native capability narrowing for SQL-dependent consumers and remove exactly the four production facade assertions. This is a public type correction, not a production unsafe-rule exception, a new database implementation, or a downstream/release/publication approval.

The exact Owner answer is recorded above. The focused baseline and emitted-consumer plan remain implementation acceptance conditions, not completed results. This design acceptance does not claim source implementation, passing tests or combined C+D qualification. Preserve existing tests, assertion intent and quality gates under development-contract rule 6; no closure, release or downstream authority is inferred.
