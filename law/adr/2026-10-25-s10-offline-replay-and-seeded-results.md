---
adr_id: ADR-DEVAI-ADOPTION-0048
title: Exact Offline replay and seeded-snapshot result corrections
status: accepted
date: 2026-10-25
authors: ['Architect']
tags: [stynx, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0048 — Exact Offline replay and seeded-snapshot result corrections

## Operative acceptance — 2026-10-25

The Owner answered **“Approve the bounded Offline result corrections”** for the exact reviewed proposal preserved below. Accept sections A–C of the reviewed proposal: opaque replay-capable batch results and exactly the seed-derived range, reservation and consumption result fields, with the enumerated store/service/controller and official response propagation. Preserve inputs, complete constructed ACK/domain models, genuinely narrow PostgreSQL results, runtime successes and the stated numeric invariants. The alternative of refusing proven replay/seed successes is not selected; no general Offline result downgrade is authorized.

This records accepted design and implementation authority only. It does not claim completed implementation, independent verification, final API/trace binding, signed RC or integration. The proposal's exact scope, preservation requirements, explicit selected changes, exclusions and verification obligations remain binding. Unselected alternatives are not authorized.

Earlier ADR0028–0042 retain their own scopes, including the exact two-site F2 exception. The other ADR0043–0052 decisions were also answered in this batch and retain their separate scopes; historical pending-language below does not revoke those answers. Release classification/publication, formal DEVAI acceptance, #211, and downstream DETRAN/PORM acceptance remain separate. This record creates no workflow/forbidden-action receipt and grants no unrelated exception.

## Reviewed proposal custody

- Original reviewed packet: `/tmp/stynx-offline-output3-boundary-20261025/proposed-adr0048.md`.
- Original SHA-256: `c8428d0ffe64320b500868fe379d5eda60e8389b3f1f0cb747d8498279527bc1`.
- Exact answer source: `/tmp/stynx-owner-approvals-0043-0052-20261025.json`, a root transcription of the direct human answers; SHA-256 `c033712470dffb379e05b757cc9f1e376e2e5105b61dfe06014f794068757ead`.
- The complete original packet, including any original frontmatter, is retained in the external ratification packet's `preimages/proposed-adr0048.md`.

## Historical reviewed proposal — operative status superseded

The following reviewed body is retained as proposal evidence, with formatting-only normalization for the repository Markdown contract. The exact original bytes remain in the custody preimage. Its proposed/unapproved/pending status, allocation checks and suggested questions describe the pre-decision snapshot. They are superseded by the operative acceptance above. Its concrete contract, implementation constraints and validation obligations apply to the selected decision; historical observations remain observations, not post-change qualification.

# Prospective ADR0048 — Exact Offline replay and seeded-snapshot result corrections

PROPOSED, external only,2026-10-25. No Owner answer, governed ADR, implementation release or receipt. Pending0043–0047 are independent. This revision supersedes the provisional range-only scope; its prior bytes are preserved in proposed-adr0048-before-reservation-closure.md. Recheck ADR allocation before eventual repository materialization.

## Decision in one paragraph

Preserve existing runtime successes and inputs. Correct the replay-capable batch methods to return an opaque result while retaining complete constructed ACK models. Separately represent memory seed-derived range snapshots as JSON results, and correct only the four reservation fields and one consumption field copied from those snapshots, plus their exact forwarding result/page types. Keep other identities, statuses, inputs, normal constructed range creation and concrete PostgreSQL range/reservation guarantees. This is neither a blanket Offline unknown downgrade nor permission to reject unusual successful seeds/replays.

## Evidence and readiness

The three original blocking assertions are postgres-durable.ts replayClosedBatch JSON.parse→CTG9SubmitSyncBatchResult; eligible legacy entry.body→that DTO; range-administration.ts JSON.parse(JSON.stringify(range))→NumberingRange.

Inspector original native31/31 and genuine emitted public-barrel consumer are in `/tmp/stynx-offline-output3-inspector-20261025/`. `emitted-consumer-public-barrel-result.json` records TS6 strict diagnostics[], actual declaration inclusion, and successful typed seed/get returning consumerAttributes7 and whole7. No aliases/shims: a normal minimal Ratelimit build resolved the original missing-dist failure, which remains preserved alongside the implementation-only proof. Existing original tests already require incomplete `{replayed:true}` and `{replayedLegacy:true}` successes. Native31 covers stored JSON null/scalars/arrays, opaque legacy identity/second Get/thenable adoption, archive byte/header effects, native serializer errors and seed/get.

The material propagation question is now answered by `reservation-propagation-result.json` and its observer: two actual public-barrel scenarios,16 operations, no errors. A structurally valid typed seed with top-level toJSON replacing nextNumber by string '1' succeeds. reserve/replay/cancel return string startNumber/nextNumber '1' with endNumber10; range reads after reserve show nextNumber11, cancellation restores1. The nested-attributes7 control preserves ordinary numeric reservation1/1/1 while range get/list/cancel retain attributes7.

Source snapshots: postgres-durable d5232f3060e36928bdef7ee9d86e04e07fd7c14d5300ccf30c5c4a8329e64a6e; range-administration70a2babad79b3b1f4b16980427dc374c1f9ad29348ba7482fa6ef113a9677d94; memory87b495a4719557c757f5ea4b5230839a6326ca2f7640172bc4af51540cda6cdf. Propagation emitted memory e696b58ea4c7cd6b4a5f1d9b0185aef14c5c5ca83412b70ac5a0dec0955a6e82. Preserve all existing A2 work and test assertions.

Additional field closure below is source-derived, not claimed as a further native campaign. The measured successful allocation establishes that the issue is not confined to get/list/cancel. No additional large native matrix is needed to ask this concrete decision; the small remaining projection controls belong to implementation verification.

## A. Opaque replay-capable batch result only

Retain CTG9SubmitSyncBatchResult and SubmitSyncBatchResult as complete constructed ACK models, and keep all input/receipt/item/status contracts. Change only replay-capable PostgresOfflineSyncStore.submitDurableSyncBatch, OfflineSyncDurableStore.submitDurableSyncBatch, and both OfflineSyncService.submitSyncBatch overload results to Promise<unknown>. Internal pgSubmit/replayClosedBatch must cease claiming a complete ACK. A decorative `ACK | unknown` union is still unknown, not a discriminator.

The one-argument service overload can reach durable replay whenever runtime policyResolver is set; omitting options is not proof of E6-only behavior. Both input overloads remain unchanged. Concrete InMemoryOfflineSyncStore.submitDurableSyncBatch may retain its proven constructed ACK result, and concrete legacy store.submitSyncBatch retains its existing finite result. No new legacy idempotency input port or generic transport contract.

Closed stored JSON is narrower than the whole method: eligible legacy entry.body is already unknown and is read again after response effects, then assimilated by async return. Preserve that second Get, arbitrary successful body identity, thenable behavior and errors. Do not cache the eligibility value, validate complete ACK, wrap the result with a discriminator, reserialize it or weaken original tests. Keep archived bytes independent from the decoded programmatic result.

## B. Range snapshot results, without widening range inputs

Keep NumberingRange, NumberingRangePage, CreateNumberingRangeInput, OfflineSyncConsumerAttributes and every seed/operation input unchanged. Introduce distinct output-only names (final naming may follow repository conventions):

- OfflineSyncJsonSnapshot: null, boolean, number, string, arrays and string-keyed objects recursively; actual parsed JavaScript number domain, not a new finite-number guard.
- NumberingRangeSnapshot: NumberingRange or OfflineSyncJsonSnapshot. This is not a complete range proof.
- NumberingRangeSnapshotPage: same items/cursor field presence, items are snapshots, nextCursor is a copied JSON value or undefined/null as the existing algorithm permits. Do NOT widen the shared OfflineSyncPage<T> cursor or existing NumberingRangePage globally.

Use these only for memory getNumberingRange/listNumberingRanges/cancelNumberingRange and the corresponding three durable-port/service result declarations. Normal create stays NumberingRange: rangeCreation canonicalizes/reparses attributes; memory creation builds its own range/receipt; PG creation-receipt replay reconstructs a checked expected range. Concrete PG get/list/cancel keep their narrower actual return types. seedNumberingRange(NumberingRange):void remains unchanged.

Why the page cursor is included: memory list returns the last cloned item's id directly. Its sort invokes left.id.localeCompare(right.id); that does not prove every returned id is a string because the native method coerces its other argument. Do not retain a string cursor guarantee based only on the sort or assert a complete range after filtering. This is source-derived closure; preserve all current filtering/sorting/cursor behavior and test the exact case during implementation.

No recursive traversal of the original opaque caller input is authorized. Preserve original stringify/parse receiver/read order, undefined-top SyntaxError, BigInt/cycle errors and detached snapshot semantics. Prove a fresh native parsed JSON result honestly, without new arbitrary depth/size rejection. Distinguish the trusted internally constructed snapshot path from arbitrary typed seed serialization; no generic clone<T> assertion or full-range seed guard.

## C. Exact connected reservation/consumption closure

Memory allocateReservation selects the same snapshot map, then copies range.id, range.series and range.nextNumber. Add separate seed-capable result models retaining all existing fields except the exact copied ones:

| Result                                  | Changed field(s)                         | Honest domain and preserved fields                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed-capable legacy/durable reservation | rangeId, series, startNumber, nextNumber | Each is a copied snapshot property: JSON value or undefined. Preserve required field presence even when value is undefined. All other fields, including endNumber:number, generated reservationId, supplied tenant/org/entity/actor/device/shift, validUntil and finite status, keep existing declarations. Do not add numeric-string coercion. |
| Seed-capable consumption entry          | number                                   | JSON value (the first successful loop value may be a string, array/object, boolean or null; later native += may produce a string/number). Keep status/serverEntityId/finalizedAt unchanged. Undefined cannot enter this loop through the initial <= comparison; do not broaden the field gratuitously.                                          |
| Consumption/reconciliation result       | consumption element type                 | Preserve reservationId/status/reconciliationId and original result structure; substitute only the seed-capable entry type.                                                                                                                                                                                                                      |
| Reconciliation record/page              | nested result.consumption                | Preserve actor/tenant/reservation identities, claimedNumbers, timestamps, userRef, idempotencyKey and normal page cursor.                                                                                                                                                                                                                       |

Retain the original NumberingReservation, CTG9NumberingReservation, NumberingConsumptionEntry/Result, ReconcileNumberingResult and NumberingReconciliationRecord domain models for genuine typed PostgreSQL/constructed uses. Add output variants via actual field replacement, not a generic assertion. Port/service returns can use the compatible seed-capable output model; existing narrow custom-store implementations remain assignable. Do not widen reservation inputs, claimedNumbers, or all fields to unknown.

Exact source basis: allocation copies the four fields; endNumber uses subtraction and stays a JavaScript number, including existing NaN/Infinity behavior. The allocation loop seeds consumption entries with its actual loop value; projectNumberingConsumption copies the entry and changes only status. Reservation replay returns the stored object; cancel and transition spread it while changing status. reconcile persists the projected consumption result; list replay uses structuredClone. These operations explain the propagation without inferring new business policy.

Keep missingOnServer and unexpectedOnServer as number arrays if the implementation preserves and explicitly proves the existing private invariants: missing values must belong to the native Set of validated numeric claims; applied entries are retrieved/updated under validated numeric item.reservedNumber keys from the same numeric-key/entry correlation. The seed's nonnumeric entries are not silently promoted to applied by a string comparison. Do not widen these arrays for convenience or use an unchecked predicate. Capture the current nonnumeric-consumption reconciliation control and prove key/entry correspondence; if actual counterevidence disproves this narrow invariant, stop and report the exact field before expanding the decision.

## Exact method propagation

Memory and their corresponding public store ports:

- Range reads: getNumberingRange, listNumberingRanges, cancelNumberingRange (3).
- Legacy reservation: reserveNumbering, replayNumberingReservation, cancelNumberingReservation (3).
- Durable reservation: reserveDurableNumbering, replayDurableNumberingReservation, cancelDurableNumberingReservation, blockNumberingReservation, closeNumberingReservation, settleNumberingReservation (6).
- Consumption/reconciliation: getNumberingConsumption, reconcileNumberingReservation, listNumberingReconciliations (3).

The service has the same forwarding set except no separate public legacy replay method (its reserveNumbering calls that port internally):14 methods. The batch result correction in A is separately scoped. Concrete PostgreSQL reservation/consumption methods retain narrow results; its batch replay return changes as in A. All normal input interfaces remain unchanged, and all ordinary built-in values/behavior remain identical.

Private affected implementation files: types.ts; in-memory-offline-sync.store.ts; range-administration.ts; reservation-admission.ts; consumption-projection.ts; reconciliation.ts; listing.ts where consumed fields require honest narrow views; offline-sync.service.ts; postgres-durable.ts; postgres-offline-sync.store.ts; postgres-ranges.ts only for genuine narrow constructed-clone proof. Do not modify database schemas, identifiers, SQL, queue mutation rules, import manifests or replay capabilities. Private operators/property reads must retain original coercion/receiver/error behavior; broad shape guards or type laundering are not authorized.

Source-built reservations remain complete objects with finite status and ordinary fields; this correction names only the seed-derived fields. It does not change the ACK, NumberingRange or reservation input DTOs globally. Other Offline APIs stay outside scope.

## Controller, official schema and consumer impact

Affected source forwarding controllers are OfflineSyncController.reserveNumbering/cancelNumbering/submitBatch and CTG9OfflineSyncController.reserveNumbering/cancelNumbering/blockNumbering/closeNumbering/reconcileNumbering/settleNumbering/getConsumption/submitBatch. These are exact existing operations, not new endpoints. The range/reconciliation-list forwarding methods have no controller callers in the reviewed source census; do not invent routes.

Preserve CTG9 archived StreamableFile handling and all authorization/idempotency/status/header order. Official output contracts must distinguish opaque replay programmatic values from actual HTTP serialization. Propagate only affected response models/operations with real composition binding; keep unrelated input schemas, shared JsonValue/UnknownJson semantics and all unrelated generated services unchanged. If a particular composition proves a narrower concrete PG/nonreplay implementation, record that proof rather than infer it from the service overload. Preserve complete ACK and range/reservation schemas as their genuine constructed domain models; do not advertise them as unconditional replay/seed outputs.

Direct callers now must narrow opaque replay values or the exact seed-derived fields. Existing typed input construction and narrow concrete PG/create calls stay valid. Official writer then one dual-composition SDK generation, exact emitted consumers/custom request behavior and intended Architect API-baseline review follow stable source. This decision does not solve D4's separate generic BaseHttpRequest guarantee.

## Validation, alternatives and authority

Keep original incomplete ACK tests and31 native observations; retain the16-operation propagation packet. Implementation controls extend that same tiny seed fixture to consumption, empty-claims reconciliation/replay/list and one status transition, proving the copied number survives while numeric claim/mutation invariants remain. Add one id/series/page-cursor projection case where the original algorithm succeeds. These are bounded affected-field verification, not an open-ended native campaign or prerequisite to another public question.

Verify ordinary constructed ACK/PG/create signatures remain narrow, inputs unchanged, all changed output fields are honest, all required fields retain presence, and no new coercions/refusals/serializer replays occur. Preserve private key/arithmetic/error order and all unrelated tests. Final stable build, official API/trace, full workspace gates and signed RC remain mandatory; this proposal claims none of them.

Recommended: exact preservation and output corrections A–C. Alternative: retain the old finite results by rejecting incomplete replay/serialized seeds at new guards. That loses proven successful behavior and requires explicit behavior-change authorization; it is not permitted by this recommended proposal. Keeping assertions, using a generic JSON clone proof or broad unknown results everywhere is not acceptable.

This is a genuine bounded public-result decision beyond ADR0041 contexts and ADR0039 audit, now supported by successful native/emitted observations. Suggested Owner question after root review: **Approve the bounded Offline replay and seeded-result corrections, preserving existing successes and inputs while updating only the affected result fields, forwarding methods and official response contracts?** Suggested answer: **Approve the bounded Offline result corrections**.

Pending0043–0047 remain unanswered. F2 remains exactly two testing sites. Formal DEVAI acceptance, #211, DETRAN/PORM, release classification/publication remain separate. No repository writes/checks/builds in this review. Graft increment:2 calls, estimated124400 tokens saved; graph source spans were checked against live files, and graph results are discovery rather than current runtime verification.
