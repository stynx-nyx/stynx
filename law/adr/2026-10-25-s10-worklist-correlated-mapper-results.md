---
adr_id: ADR-DEVAI-ADOPTION-0044
title: Input-correlated Worklist row mapper results
status: accepted
date: 2026-10-25
authors: ['Architect']
tags: [stynx, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0044 — Input-correlated Worklist row mapper results

## Operative acceptance — 2026-10-25

The Owner answered **“Approve the bounded mapper result corrections”** for the exact reviewed proposal preserved below. Accept exactly the two public mapper result corrections: `mapItemRow` status/deadlineKind and `mapEventRow` kind track their declared input property types. Preserve direct runtime values, including the historical `enqueued` result; finite service, event-sink, input and physical-query contracts remain unchanged. The implementation must prove the real generic correlation without an unchecked overload or result assertion.

This records accepted design and implementation authority only. It does not claim completed implementation, independent verification, final API/trace binding, signed RC or integration. The proposal's exact scope, preservation requirements, explicit selected changes, exclusions and verification obligations remain binding. Unselected alternatives are not authorized.

Earlier ADR0028–0042 retain their own scopes, including the exact two-site F2 exception. The other ADR0043–0052 decisions were also answered in this batch and retain their separate scopes; historical pending-language below does not revoke those answers. Release classification/publication, formal DEVAI acceptance, #211, and downstream DETRAN/PORM acceptance remain separate. This record creates no workflow/forbidden-action receipt and grants no unrelated exception.

## Reviewed proposal custody

- Original reviewed packet: `/tmp/stynx-worklist-strict-residue-20261025/proposed-adr0044.md`.
- Original SHA-256: `895c2b6bfc7a0506f753364e0fbb1a3c39dbede15e80907dba6c5cd138722732`.
- Exact answer source: `/tmp/stynx-owner-approvals-0043-0052-20261025.json`, a root transcription of the direct human answers; SHA-256 `c033712470dffb379e05b757cc9f1e376e2e5105b61dfe06014f794068757ead`.
- The complete original packet, including any original frontmatter, is retained in the external ratification packet's `preimages/proposed-adr0044.md`.

## Historical reviewed proposal — operative status superseded

The following reviewed body is retained as proposal evidence, with formatting-only normalization for the repository Markdown contract. The exact original bytes remain in the custody preimage. Its proposed/unapproved/pending status, allocation checks and suggested questions describe the pre-decision snapshot. They are superseded by the operative acceptance above. Its concrete contract, implementation constraints and validation obligations apply to the selected decision; historical observations remain observations, not post-change qualification.

# ADR-DEVAI-ADOPTION-0044 — Input-correlated Worklist row mapper results

**Status:** External proposed record only; repository allocation/index must be rechecked when the coordinated law-write window opens. ADR0043 is the separately reviewed Signature proposal. No Owner approval, implementation or candidate qualification is recorded here.

## Exact problem and authority

The public root barrel exports mapItemRow and mapEventRow. Both accept WorklistRow = Record<string, unknown>. Three fields are forwarded without conversion or validation: item status/deadlineKind and event kind. Their current return annotations instead promise WorklistItemRecord/WorklistEvent finite enums. Existing behavior-coverage explicitly requires direct mapEventRow with kind enqueued to preserve enqueued, although the physical event enum uses enqueue.

That direct utility assertion is not a malformed physical database fixture to repair. An enum guard would change the admitted broad mapper behavior; an assertion/unchecked overload would preserve the false declaration. Existing approved ADR0028 strict work and ADR0032/0033 result decisions do not include this new public result correction. This proposal preserves runtime and requests only the narrowly identified published declaration change.

## Original evidence

Inspector packet `/tmp/stynx-worklist-public-mappers-inspector-20261025/` contains:

- `observations-finite.json`: 22 observations through the actual original emitted public index. All three fields preserve arbitrary strings including enqueued, null, undefined, number, boolean, object/array/function/symbol identities. Absent fields still become own output properties with undefined. Valid pending/absolute/enqueue values remain finite. Each field is read once at its original position, thrown getter identity is retained, and later invalid-date failures occur afterward.
- `emitted.json`, `declarations/`, `before.json`: original declaration/source custody after a normal Worklist build (6.6 seconds).
- `consumer.mts` and `tsconfig.json`: strict original emitted row-utils/types consumer compiles while assigning mapper output from object status/symbol deadline/arbitrary kind to finite enum fields, demonstrating the inaccurate promise.

The first full-root-barrel consumer encountered unrelated third-party Drizzle declaration errors; that failed attempt is retained. The successful probe targets the exact original emitted row-utils/types declaration modules without source aliases or skipLibCheck. It is not a claim that the whole package-root consumer passed. No candidate implementation has been built or tested by this proposal.

## Proposed exact change

Change only the TWO public mapper result signatures so their THREE copied fields track the declared input property types. Retain the current broad WorklistRow domain and every runtime expression's order and result. A concrete target is:

```ts
export function mapItemRow<R extends WorklistRow>(
  row: R,
): Omit<WorklistItemRecord, 'status' | 'deadlineKind'> & {
  status: R['status'];
  deadlineKind: R['deadlineKind'];
};

export function mapEventRow<R extends WorklistRow>(
  row: R,
): Omit<WorklistEvent, 'kind'> & { kind: R['kind'] };
```

These are specification signatures, not permission to implement an unchecked overload. The actual function body must typecheck with those same generics and real property reads, without a return assertion. All other mapped fields retain their existing types. The three result properties remain required/own even when their value is undefined; do not use a Pick that incorrectly preserves optional output presence.

A broad WorklistRow caller gets unknown for the forwarded fields. An input whose status is genuinely declared pending keeps that property type; an input whose kind is enqueued gets that declared value/type, not WorklistEventKind. Ordinary inference may widen an object literal to string; this proposal does not force literal inference or pretend that arbitrary input has been runtime-enum-validated. Missing properties remain accepted and must not be converted into newly required input fields. Existing any/assertion abuse by a consumer is not a validation guarantee supplied by this mapper.

## Honest implementation mechanics

Use the same mapping body, with a private checked indexed-read helper if TypeScript needs to retain the correlation:

```ts
function readRowField<R extends WorklistRow, K extends keyof R>(row: R, key: K): R[K] {
  return row[key];
}
```

Call this at the original status/deadlineKind/kind expression positions, not before mapping begins. The helper returns exactly the selected input value; it does not assert the whole row, inspect an enum or accept a caller-selected unrelated return type. Preserve a single property Get, getter receiver, identity and subsequent error timing. Do not pre-read these fields in a wrapper, normalize them, spread/copy the source to overwrite fields, map twice, or turn a future return cast into a misleading generic guarantee.

The generic implementation and missing-property inference must be demonstrated by normal installed TypeScript checks and emitted consumers. If TypeScript cannot prove the actual implementation without assertion, stop and report the specific limitation; do not silently substitute a false overload. A conservative unknown-result/private checked-core design is a reviewed alternative, but not an automatic fallback that broadens the accepted public delta.

## Finite internal services remain finite

WorklistItemRecord, WorklistEvent, WorklistItemStatus, WorklistEventKind, deadline enums, service methods, event sinks, HTTP/wire types and input DTOs do not widen. The physical query schemas already prove status/event-kind enums and nullable deadlineKind. Preserve those actual parsed row types through local variables and callbacks so generic mapping retains the finite result. Do not erase a checked row to WorklistRow and later recover enum types by assertion.

Seven current mapping sites require review:

- worklist-items.service.ts: item list; event list; claimingMutation latest event; itemMutation new events; mutationResult all events; getInTransaction item.
- worklist-sla.service.ts: detectBreaches event mapping.

These use typed repository outputs. Keep the existing database/schema validation for malformed physical enums, cardinality, parameters, context/RLS and row-count rules. Do not add redundant public mapper enum refusals or a raw SQL/executor exception. If a caller lacks actual checked field evidence, fix its local typed flow or validate its real boundary; do not widen the service result.

The three-file/four-finding internal cleanup, queue opaque-field preservation and SQL-error/other schema work remain independent. This proposal does not approve changes to their behavior or invent additional public corrections.

## Compatibility and verification

This is a compile-time public correction. External code assigning the broad direct result to WorklistItemRecord/WorklistEvent will need to narrow the three properties or supply a genuinely narrower input type. Validated service consumers retain their current declarations and behavior. No external consumer census can be inferred from the seven internal call sites.

Before acceptance:

1. Retain the original enqueued test and replay all22 observations, including opaque identity, own undefined fields, single getter reads and error ordering. Do not weaken them or relabel direct success as malformed-row refusal.
2. Compile the actual generic implementation without casts, overload laundering or suppressions. Strict emitted consumers must cover broad WorklistRow→unknown, missing fields, optional fields/undefined, inferred string versus explicit literal inputs, object/symbol forwarding, readonly input properties and invalid explicit generic arguments. A supplied generic that conflicts with the actual input must not manufacture an enum output.
3. Check every internal mapping site and existing Worklist service/event-sink tests. Malformed physical rows must still fail their checked schema while direct mapper arbitrary values remain preserved. Confirm no additional SQL, changed context or mapping order.
4. Compare emitted declarations: only the two mapper result signatures and strictly necessary supporting type references change. All finite record/enum/service/sink declarations remain identical. Run the genuine official API baseline procedure only in the later coordinated qualification window; no manual emitted baseline edits.
5. Preserve normal strict/test/build gates and the combined C+D signed RC. Original baseline success is not implementation verification or integration.

## Decision and alternatives

Recommended: the input-correlated signatures and genuinely checked implementation above, preserving broad direct input and all observed runtime behavior. Rejected alternatives for this proposal: silently reject enqueued, narrow the public input, widen all service/event enums to unknown, preserve three assertions as a new exception, or add an overload that merely promises unproved finite values.

Suggested Owner question: **Approve the two Worklist mapper result corrections, preserving their three raw fields and existing finite service contracts?**

Release classification/publication, formal DEVAI acceptance, #211 and downstream DETRAN/PORM remain separate. This proposed record contains no Owner answer, receipt or implementation authorization.
