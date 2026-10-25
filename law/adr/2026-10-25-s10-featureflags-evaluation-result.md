---
adr_id: ADR-DEVAI-ADOPTION-0047
title: Honest opaque FeatureFlags evaluation values
status: accepted
date: 2026-10-25
authors: ['Architect']
tags: [stynx, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0047 — Honest opaque FeatureFlags evaluation values

## Operative acceptance — 2026-10-25

The Owner answered **“Approve the bounded FeatureFlags result correction”** for the exact reviewed proposal preserved below. Accept only `FlagEvaluation.value: unknown` and its propagation through the existing provider and service evaluate results. Preserve all definition/input contracts, values, identities, errors and ordering. `isEnabled` and `variant` retain their existing narrow behavior and results.

This records accepted design and implementation authority only. It does not claim completed implementation, independent verification, final API/trace binding, signed RC or integration. The proposal's exact scope, preservation requirements, explicit selected changes, exclusions and verification obligations remain binding. Unselected alternatives are not authorized.

Earlier ADR0028–0042 retain their own scopes, including the exact two-site F2 exception. The other ADR0043–0052 decisions were also answered in this batch and retain their separate scopes; historical pending-language below does not revoke those answers. Release classification/publication, formal DEVAI acceptance, #211, and downstream DETRAN/PORM acceptance remain separate. This record creates no workflow/forbidden-action receipt and grants no unrelated exception.

## Reviewed proposal custody

- Original reviewed packet: `/tmp/stynx-featureflags-inspector-20261025/proposed-adr0047.md`.
- Original SHA-256: `0f04da3c2b7493b060edcbf984fc39cee1efd0eb9eb3b81f7bbf9e5980b096dd`.
- Exact answer source: `/tmp/stynx-owner-approvals-0043-0052-20261025.json`, a root transcription of the direct human answers; SHA-256 `c033712470dffb379e05b757cc9f1e376e2e5105b61dfe06014f794068757ead`.
- The complete original packet, including any original frontmatter, is retained in the external ratification packet's `preimages/proposed-adr0047.md`.

## Historical reviewed proposal — operative status superseded

The following reviewed body is retained as proposal evidence, with formatting-only normalization for the repository Markdown contract. The exact original bytes remain in the custody preimage. Its proposed/unapproved/pending status, allocation checks and suggested questions describe the pre-decision snapshot. They are superseded by the operative acceptance above. Its concrete contract, implementation constraints and validation obligations apply to the selected decision; historical observations remain observations, not post-change qualification.

# Prospective ADR0047 — Honest opaque FeatureFlags evaluation values

Status: PROPOSED, external only, 2026-10-25. No Owner approval, governed ADR, receipt or implementation is recorded. The live ADR index ends at accepted0042; separate pending external proposals0043–0046 retain their identities. Recheck allocation before eventual repository materialization.

## Exact decision requested

Approve changing **only `FlagEvaluation.value` from `FlagValue` to `unknown`**, propagated through the existing `FeatureFlagProvider.evaluate`, `InMemoryFeatureFlagProvider.evaluate`, `JsonFileFeatureFlagProvider.evaluate` and `FeatureFlagsService.evaluate` return interface. Keep `flag`, `source`, `context` and the required own `value` field unchanged. This is an opaque field, not an unknown evaluation envelope.

Keep `FlagPrimitive`, `FlagValue`, `FlagDefinition`, `FlagSet`, `FlagContext`, constructor inputs and every fallback parameter unchanged. Keep `isEnabled(): Promise<boolean>` and `variant(): Promise<string>` unchanged. Do not add a generic result assertion, recursive validation, coercion, new rejection, caching, or provider-interface bypass.

## Verified contradiction and scope

Actual source is `packages/feature-flags/src/{index,types}.ts`. JsonFileFeatureFlagProvider uses native JSON.parse followed by selection; its current `as FlagSet` does not establish the declared result domain. The public barrel exports FlagEvaluation. The existing shared interface therefore falsely promises a boolean/string/number or one-level primitive record where actual successful evaluations return null, arrays, nested objects and an own undefined value when a truthy definition lacks default.

Inspector evidence: `/tmp/stynx-featureflags-inspector-20261025/observations.md`, `results.json`, `emitted-consumer-result.json`, `emitted-consumer.mts`, and `emitted-consumer-proof.mjs`. Original normal package build passed in1.12s; original native cohort27/27 passed (six existing plus21 added). Actual emitted TS6.0.3 consumer has zero diagnostics and includes the genuine emitted declaration: it accepts provider/facade values as FlagValue while fresh emitted execution returns those incompatible values. This is measured runtime/declaration disagreement, not merely a hypothetical malformed fixture.

Source hashes: index.ts358ddf8132bc5acdb86c4b55b85a78d29ea1dc146d0fe675e52088648d1ecc46; types.ts1411f2046e089a1e16e29f1d625bef853c29025be142b6d397226696cee50f15. Original emitted index.js4432a9ef8bce72e86bf7bd0eb374b45132c2cf580875e50544cb15d704146a5b; index.d.ts834244a7f0c78b20bf9132bfa51df0756e7c3010918d235e71cfeba960d24bc8; types.d.ts72c05f33c2dcc09dd9b139ee88aa1070e9367e8af844f89ac8d70ffe05fbf17f.

The bounded production/reference/web source search found this interface's uses only inside FeatureFlags. External consumers remain a real compatibility concern: code directly assigning `.value` to FlagValue or accessing its members must narrow it. Custom providers returning existing FlagEvaluation-compatible values remain assignable. InMemory's constructor remains constrained by FlagSet; its shared evaluate declaration becomes opaque too, without changing its runtime or broadening its input. This consequence is explicit, not an inferred stronger generic correlation.

## Preservation requirements

Preserve selection priority and exact operations. Global default null is retained; selected tenant/environment null coalesces to the original fallback while retaining that source label. Arrays/nested objects and fallback/context references retain identity. A missing default produces a present own value property with undefined. Falsy definitions use fallback. Preserve the original repeated tenantId reads (three on the selected branch), short-circuit environment reads, native optional-property behavior and errors. Invalid flag name precedes file access; native JSON SyntaxError and missing-flags TypeError precede context access. The facade forwards the result; isEnabled compares strictly with true and variant uses the existing string test/fallback.

Implementation must replace the false private JSON/definition claim using honest unknown property operations at the original read positions. Do not fully validate/rebuild the loaded file or recursively traverse selected values. Do not snapshot repeated context reads or normalize malformed inputs. Keep the typed in-memory entry path and same private selection semantics without claiming the unvalidated JSON object is FlagSet. Exact private boxing/property-read behavior must be tested where needed; an assertion or catch-and-default is not proof.

Unknown here records an unvalidated selected value. It does not claim the27 cases demonstrate every JavaScript value, nor introduce a recursive JSON contract. Such a stronger contract would require additional validation or a separate proof of all selection inputs and property operations; this proposal deliberately adds neither.

## Alternatives and recommendation

Recommended: the single opaque result field above, preserving all observed successful values and errors. It is a deliberate public declaration correction beyond the named prior result approvals; ADR0033 browser scope and ADR0039 audit scope do not already approve it.

Alternative: retain FlagEvaluation.value as FlagValue and reject values outside that type. This changes proven successful file evaluations and facade behavior, including null/array/nested/undefined outcomes, and requires an explicit behavior-change decision. It is not authorized by this proposal's recommended choice and must not be implemented as ordinary strict cleanup. Widening FlagValue globally is also excluded because that would broaden definitions and fallbacks unnecessarily.

## Validation and delivery after approval

Inspector retains all27 original cases and adds exact emitted-consumer positives for unknown plus negatives for unchecked FlagValue/member use; existing boolean/variant assignments must remain valid. Compare original/candidate selection identity, source labels, own undefined presence, repeated/context/property reads, file/parser errors and custom provider forwarding. No recursive getter traversal or new guard errors. Engineer owns only the two FeatureFlags source files and necessary actual caller adaptations if census discovers any; Inspector owns tests; Architect reviews the intended emitted declaration delta and later official baseline on the stable workspace. No speculative changes to other providers, packages or SDK generation.

Independent internal work may continue elsewhere while this decision is pending. Preserve the original false claim as an open diagnostic rather than silently applying the held rejection candidate. No claim of implementation, whole-workspace green or final RC follows from original evidence.

Release classification/publication, formal DEVAI acceptance, #211, DETRAN and PORM remain separate. Pending0043–0046 are not answered by this proposal.

Suggested Owner question: **Approve the bounded FeatureFlags result correction—make only FlagEvaluation.value opaque while preserving existing inputs, evaluation behavior and boolean/variant helpers?**

Suggested answer: **Approve the bounded FeatureFlags result correction**.
