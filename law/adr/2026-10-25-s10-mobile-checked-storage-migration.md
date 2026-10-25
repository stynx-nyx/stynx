---
adr_id: ADR-DEVAI-ADOPTION-0051
title: Mobile checked storage migration
status: accepted
date: 2026-10-25
authors: ['Architect']
tags: [stynx, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0051 — Mobile checked storage migration

## Operative acceptance — 2026-10-25

The Owner answered **“Approve mobile checked migration A (Recommended)”** for the exact reviewed proposal preserved below. Select option A in full: raw storage results `unknown`/`unknown[]`, the required constructor entity vocabulary, exact checked runtime-read snapshots and refusals, and stored-draft/printer result/input corrections. The reviewed snapshot, accessor, error-timing, constructor migration and count-only collection limits are binding. This is an explicit compatibility change, not behavior-neutral cleanup. Option B, the one-site unchecked legacy exception, is not selected; F2 is not extended.

This records accepted design and implementation authority only. It does not claim completed implementation, independent verification, final API/trace binding, signed RC or integration. The proposal's exact scope, preservation requirements, explicit selected changes, exclusions and verification obligations remain binding. Unselected alternatives are not authorized.

Earlier ADR0028–0042 retain their own scopes, including the exact two-site F2 exception. The other ADR0043–0052 decisions were also answered in this batch and retain their separate scopes; historical pending-language below does not revoke those answers. Release classification/publication, formal DEVAI acceptance, #211, and downstream DETRAN/PORM acceptance remain separate. This record creates no workflow/forbidden-action receipt and grants no unrelated exception.

## Reviewed proposal custody

- Original reviewed packet: `/tmp/stynx-mobile-public-result-inspector-20261025/proposed-adr0051.md`.
- Original SHA-256: `6cda0cf65583353596fd6f5cac89ae82a44d4d0d119ad9e0598f96770395dd7f`.
- Exact answer source: `/tmp/stynx-owner-approvals-0043-0052-20261025.json`, a root transcription of the direct human answers; SHA-256 `c033712470dffb379e05b757cc9f1e376e2e5105b61dfe06014f794068757ead`.
- The complete original packet, including any original frontmatter, is retained in the external ratification packet's `preimages/proposed-adr0051.md`.

## Historical reviewed proposal — operative status superseded

The following reviewed body is retained as proposal evidence, with formatting-only normalization for the repository Markdown contract. The exact original bytes remain in the custody preimage. Its proposed/unapproved/pending status, allocation checks and suggested questions describe the pre-decision snapshot. They are superseded by the operative acceptance above. Its concrete contract, implementation constraints and validation obligations apply to the selected decision; historical observations remain observations, not post-change qualification.

# PROPOSED ADR0051 — Mobile storage truthfulness: checked migration or exact legacy preservation

External decision packet, 2026-10-25. **No choice accepted.** This final packet supersedes the provisional options and option-a-api-draft.md as operative proposal. No governed files, implementation, tests, receipts or public declarations were changed by this review. Pending0043–0050 remain independent and unanswered.

## The concrete choice

**Recommend A for honest checked storage:** remove caller-selected generic raw results, require an explicit runtime entity vocabulary, validate only actual typed runtime reads, and correct the measured stored-draft/printer payload declarations. This is a breaking constructor/read API and an intentional new stored-data validation/snapshot boundary. It preserves the measured legitimate native journey, including scalar serialized payloads, but does not claim every old custom-store identity/getter/error behavior is unchanged.

**B is the exact preservation alternative:** retain one known unchecked sandbox assertion and the existing API/runtime with an explicit separate compatibility exception. B preserves the demonstrated false Date/T guarantee and must be disclosed as such. It is not an extension inferred from F2, nor a type-safety fix.

No additional baseline is needed to present this choice. Implementation/equivalence controls below remain acceptance obligations, not completed evidence.

## Completed source and actual emitted evidence

This directory contains native.json, compiler.json and consumer.mts: a legitimate put<Date> followed by matching get<Date>/list<Date> compiles against the real emitted public package with zero TS6.0.3 diagnostics; native JSON storage returns ISO strings and the statically permitted Date method throws. Ordinary nested JSON roundtrips succeed. No fake generic argument, private mutation, declaration shim or decoder was used.

runtime-summary.json, runtime-native.json, runtime-consumer.mts and runtime-compiler.json add exactly two requested witnesses, native exit0 and strict emitted diagnostics0. A valid Record<string,unknown> input has an enumerable native toJSON returning a string. createDraft returns its constructed object payload; native serialization invokes toJSON once on the copied payload (key `payload`, receiver includes observed_at) and stores the string. A fresh runtime<'specific'> reuses the public store without rebootstrap and successfully attachEvidence→finalizeOffline→enqueue→printReceipt→submitPendingQueue. Printer receives string draft.payload; acceptedItems is1. Queue payloadJson remains an OUTER object with a nested string payload. Full reads/order and source/emitted digests are bound in the packet. No live network or downstream acceptance is claimed.

The source closure is17 runtime read calls over10 named collections. One repository implementation is InMemoryEncryptedMobileStore; production adapters are consumer-supplied. The root and ./testing exports, README constructor example and existing tests use these contracts. Generic draft/queue values reach a generic backend; a string check cannot establish the consumer-specific TEntityType on fresh persistent storage. The captured original open<T> method body SHA256 is f8ef304aaee7f5be6396af8f9d2b1be2028ccc3ead9963420811a36009010c71.

## A — exact API changes

1. MobileEncryptedStorePort and InMemoryEncryptedMobileStore raw methods become `get(collection:string,key:string):Promise<unknown>` and `list(collection:string):Promise<unknown[]>`. Remove caller-selected get/list type parameters. Missing get remains undefined; null remains null; list order/cardinality and all native JSON/base64 behavior remain. Keep put<T>, remove, clear, metadata, rawCollection and security flags unchanged. No Date revival, new put restriction or generic Jsonify assertion.
2. Add `MobileRuntimeCheckedOptions<TEntityType extends string> extends MobileRuntimeOptions` with required `readonly entityTypes: readonly TEntityType[]`. The existing seventh constructor options argument becomes required. The sixth printer argument becomes explicitly MobilePrinterPort | undefined; callers without a printer pass undefined. The first five ports/order remain. Old five/six-argument calls and old options must migrate. This is a declared input/API change, not hidden inference.
3. Preserve encrypted-store refusal first and the existing relative reads of requiredRoles, requireEvidenceToFinalize and draftIdPrefix. Then validate/copy entityTypes once. Reject missing/non-array/holey/nonstring configuration with plain TypeError `Invalid mobile runtime entityTypes`; do not include supplied data. Duplicate strings are harmless; empty list is valid and admits no draft/queue entity. Later caller array mutation cannot alter admission. Exact equality with an actual captured typed member establishes TEntityType. No fabricated generic predicate or prior-write-only cache is permitted.
4. Add `MobileStoredEntityDraft<T extends string = string> = Omit<MobileEntityDraft<T>, 'payload'> & { readonly payload: unknown }`. Only attachEvidence and finalizeOffline public results change to this stored model. Private loaded-draft helpers follow it. Keep CreateMobileDraftInput.payload and MobileEntityDraft.payload Record<string,unknown>, and keep createDraft's newly constructed result unchanged.
5. Change only MobilePrinterPort.printReceipt's `draft` input to MobileStoredEntityDraft<string>; retain the other input fields and return type. Consumer printer implementations that inspect payload must narrow it. The native witness proves this broader value already reaches the actual printer. The sandbox printer must implement the exact new declaration without assertion.
6. Keep MobileSyncQueueItem.payloadJson Record<string,unknown>, enqueue's constructed queue result, MobileBackendClientPort and all other models/results unchanged. toSyncPayload creates an outer record and can legitimately contain unknown nested draft.payload. The witness does not justify broadening the outer queue payload. Raw consumers migrate to real guards/decoders locally; no new generic helper is required as public API.

## A — exact checked boundaries, representation and errors

Full DTO checks are required only where results are consumed/returned as typed models: session, device, normative-package, numbering-reservation, entity-draft and sync-queue. Use existing field types, optionality, number domains and finite enums. No UUID/date parsing, number coercion, positivity/integer/finite restriction or additional hash validation is authorized. Draft/queue entityType additionally matches configured vocabulary. Reservation entityType remains string; existing requested-type comparisons/filtering remain in place. Nested declared location/evidence/roles structures receive complete proof. Draft.payload stays opaque unknown; queue.payloadJson receives only the honest nonnull nonarray object proof required by Record<string,unknown>, without recursive JSON restriction or visiting its unknown values.

The four evidence/print-receipt/conflict-resolution/wipe-receipt lists are currently used only for length/count: keep unknown[] and do not validate unused element DTOs. Snapshot draft/queue counts only observe status at the existing filter positions; retain those property-read semantics without inventing whole-row validation. Snapshot's session/package/device outputs do require their complete declared shapes. This closes every17 read call without treating all10 collections as full-model consumers.

**Snapshot policy is part of A, not an unresolved implementation choice.** A typed read returns a fresh ordinary checked envelope, never a type assertion over a live accessor-bearing raw object. For each structurally typed object, first create a fresh shallow own-enumerable snapshot using ordinary object-spread semantics; preserve enumerable extras, symbol keys and their shallow values. Inspect required/optional declared properties in source declaration order. If a declared key was not captured as an own enumerable property, read it at most once from the original receiver and materialize the checked value as an own data property when present/required. No retained getter is presented as stable typed data. Recursively snapshot only declared structural objects/arrays. Copy declared arrays by captured length/index with checked elements and dense presence; no overrideable iterator/map/every as proof. Do not recursively copy opaque payloads, queue payloadJson or extra properties; retain those value references. Do not freeze results or normalize data.

This deliberately changes custom-store envelope/nested-structure identity, getter acquisition timing and ownership representation. Enumerable getter reads can occur earlier during capture; getter exceptions propagate unchanged, but their timing can differ. Non-enumerable/inherited declared data can be materialized; arbitrary source prototypes are not promised on the checked view. No malicious Proxy stability or original-object proof is claimed. The raw get/list methods themselves preserve original return identity; only runtime typed consumption creates the view. This explicit snapshot choice avoids a later undisclosed guard-versus-clone decision.

Validation runs immediately after an awaited read and before the old typed consumer. Missing get undefined remains undefined so existing missing-value errors/fallbacks stay. Present malformed values or wrong entity subtype throw plain TypeError `Invalid stored mobile record: <fixed collection>` without values/keys/secrets. Original storage/getter exceptions propagate by identity. Typed list consumers validate in original index order before their old filter/mark/write logic. This is an intentional behavioral change: a malformed later item can now prevent earlier writes; present null/false can refuse earlier rather than take an old missing-value branch; invalid session can prevent a wipe before clear. Only A approval authorizes these new refusal points. The original observations remain evidence and tests must distinguish deliberate new refusals from regressions.

Both measured workflows must remain successful: ordinary Date/raw JSON storage stays unchanged and returns raw unknown; the rich-payload fresh-runtime journey uses entityTypes:['specific'] and retains its scalar payload, queue outer record, print/backend data and acceptedItems1. Constructor migration is explicit. No guarantee of arbitrary legacy custom-adapter effect order is made.

## B — exact one-site exception and honest acceptance wording

Keep all public methods/declarations, constructor calls, runtime read paths and native semantics unchanged, including the Date counterexample and scalar draft/printer contradiction. Retain only the existing `as T` in `InMemoryEncryptedMobileStore.open<T>` in packages/mobile-runtime/src/testing.ts, whose current body is:

```ts
private open<T>(value: SealedValue): T {
  return JSON.parse(Buffer.from(value.sealed, 'base64').toString('utf8')) as T;
}
```

The approved census must bind this one syntax site and semantic body, exact containing declaration/path, existing get/list forwarding and native parse expression. Preserve the installed rule's actual native diagnostics independently; do not invent a count. Suppression must be exact-site aware and fail closed for altered body, additional assertions, moved helpers, unrelated files or expanded callers. No blanket file/rule disable, generic transport exception or native bypass is included. StableJson's separate property read remains an ordinary safe fix and is outside the exception.

If B is selected, final wording must state: “Strict workspace enforcement with the previously approved F2 two-site legacy testing exception and the separately approved single mobile sandbox storage assertion; mobile caller-selected storage results remain unchecked.” Do not claim validated arbitrary T, universal zero unsafe assertions or corrected mobile result declarations. B is not already permitted by F2. This option deliberately preserves the false public guarantee for compatibility; an additive honest API does not erase that fact.

## Acceptance, bounded implementation and alternatives

For A, normal emitted consumer tests must prove raw get/list cannot be used as Date/T without checking, old result fields stay finite except the exact stored payload/printer input, constructor requires entityTypes, and wrong caller-specific vocabulary cannot be inferred from string alone. Preserve existing tests, migrate only the explicitly changed contract expectations, and add the two completed native witnesses as regressions. Test exact config/read refusal/redaction, fresh instance subtype, snapshot extra keys/identity/getter timing as the new specified contract, and raw method identity separately. Preserve count-only reads and backend/printer call count/order on valid paths. No broad malformed corpus or additional baseline is required before the decision; these are implementation controls afterward.

For B, retain all original native/emitted counterexamples and existing tests, add exact census/mutation/delegation negatives, and retain truthful acceptance wording. Do not describe B as corrected types. Either choice requires normal role-owned checkpoints, official emitted API/trace review as applicable and combined C+D qualification. No implementation, RC or merge is claimed here.

Recommendation: A meets the requested honest strict-boundary objective while preserving the concrete legitimate serialized-payload workflow. Its constructor, stored-data refusal and snapshot effects are material and explicitly included. If unchanged calls and arbitrary historical custom-store effects take precedence, choose B transparently rather than pretending a generic decoder proof exists. Deferral leaves this boundary incomplete; neither option is inferred from existing authority.

Suggested single Owner choice: **“Choose the mobile storage disposition: checked migration A, or exact one-site compatibility exception B?”** Exact affirmative labels: **“Approve mobile checked migration A”** / **“Approve mobile one-site compatibility exception B”**.

Release classification/publication, formal DEVAI acceptance, #211, DETRAN/PORM, unrelated SDK transport decisions and pending0043–0050 remain separate.
