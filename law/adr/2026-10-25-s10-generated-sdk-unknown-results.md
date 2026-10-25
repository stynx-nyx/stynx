---
adr_id: ADR-DEVAI-ADOPTION-0052
title: Honest generated SDK results with caller-owned decoding
status: accepted
date: 2026-10-25
authors: ['Architect']
tags: [stynx, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0052 — Honest generated SDK results with caller-owned decoding

## Operative acceptance — 2026-10-25

The Owner answered **“Approve the bounded generated SDK unknown-result correction”** for the exact reviewed proposal preserved below. Select option A: both generated composition transport cores and exactly 222 endpoint methods return `CancelablePromise<unknown>`, with the named real caller migrations and optional genuine application-owned decoding. Preserve input/model declarations and exact raw runtime, handle, cancellation, receiver, rejection and identity contracts. This is a compiler-breaking public correction. The larger raw-plus-checked generated snapshot alternative is deferred and not authorized by this decision; known schema/model debt remains explicitly separate.

This records accepted design and implementation authority only. It does not claim completed implementation, independent verification, final API/trace binding, signed RC or integration. The proposal's exact scope, preservation requirements, explicit selected changes, exclusions and verification obligations remain binding. Unselected alternatives are not authorized.

Earlier ADR0028–0042 retain their own scopes, including the exact two-site F2 exception. The other ADR0043–0052 decisions were also answered in this batch and retain their separate scopes; historical pending-language below does not revoke those answers. Release classification/publication, formal DEVAI acceptance, #211, and downstream DETRAN/PORM acceptance remain separate. This record creates no workflow/forbidden-action receipt and grants no unrelated exception.

## Reviewed proposal custody

- Original reviewed packet: `/tmp/stynx-sdk-public-request-inspector-20261025/proposed-adr0052.md`.
- Original SHA-256: `1e1c90b2300765b25202084d4f66080ce43ffe7afe53955889304ab7795438e8`.
- Exact answer source: `/tmp/stynx-owner-approvals-0043-0052-20261025.json`, a root transcription of the direct human answers; SHA-256 `c033712470dffb379e05b757cc9f1e376e2e5105b61dfe06014f794068757ead`.
- The complete original packet, including any original frontmatter, is retained in the external ratification packet's `preimages/proposed-adr0052.md`.

## Historical reviewed proposal — operative status superseded

The following reviewed body is retained as proposal evidence, with formatting-only normalization for the repository Markdown contract. The exact original bytes remain in the custody preimage. Its proposed/unapproved/pending status, allocation checks and suggested questions describe the pre-decision snapshot. They are superseded by the operative acceptance above. Its concrete contract, implementation constraints and validation obligations apply to the selected decision; historical observations remain observations, not post-change qualification.

# Proposed ADR0052 — Honest generated SDK results with caller-owned decoding

Status: **PROPOSED**, 2026-10-25. External decision packet only. No Owner approval, governed ADR, implementation, official generation or qualification is claimed. This finalizes option A from grouped-decision-proposal.md; option B remains a deferred larger alternative, not a request for unconditional generation of 222 validators.

## Decision requested

**Approve the bounded generated SDK unknown-result correction.**

This explicitly permits changing the two generated composition transport cores and exactly 222 generated endpoint methods to return `CancelablePromise<unknown>`, removing the unsupported caller-selected transport result generic. Preserve every existing input/model declaration and raw runtime behavior, including custom transport identity, returned handle, cancellation and rejection. Callers may obtain typed results through genuine application-owned decoding using the existing `ResponseDecoder<T>` contract and ordinary Promise chaining. No built-in decoder or mandatory response refusal is added.

This is a **compile-time breaking public API correction**. It is not implicit authority from ADR0033 B1/O5, an unsafe-rule exception or an acceptance of pending ADR0043–0051. Release classification/publication remains a separate decision.

## Evidence and rationale

The actual exported default and OfflineCtg9 SDK declarations permit `request<Date>` with zero TypeScript 6.0.3 diagnostics. Both genuine emitted clients, using controlled native fetch/Response, resolve a JSON string; calling the compiled Date method throws TypeError. No runtime check proves the arbitrary selected type. Exact evidence is summary.json, consumer.mts, runtime-compiler.json, native.json, source-emitted-custody.json and fetch-rejection.json alongside this proposal.

The original native controls cover seven groups: response-header precedence; 204 undefined; malformed JSON logging SyntaxError then resolving undefined; ApiError status and parsed-body/request identity; abort/CancelError; custom endpoint receiver/body/returned-handle/resolved-value identity; and independent fetch-rejection sentinel identity. Custom forwarding was observed through a JavaScript custom request implementation, not claimed as a TypeScript assignability proof. No network, new SDK build or official code generation was used.

A concrete optional caller migration has now been verified. Witness SHA256 `803836c1926ed7ca9af9ff481ec9b0dbd8272f481d8ad80d7ef8c8476da0b8e5` compiled with **zero diagnostics** under TypeScript 6.0.3 against actual exported SDK declarations SHA256 `ce183b235d9bc4b0f0135aa0b2386da68679adc7d9b6827ee7d542d8f1c23275`. Six native cases passed: each composition's real generated reservation call produces a validated fresh fourteen-field result; a mismatch is rejected only by the optional caller decoder while raw remains accepted; and a getter sentinel preserves exception identity and observation order through native Promise.then. The default decoder checks its finite status/nonnull shift; the alternate respects its declared string status/nullable shift.

See optional-caller-summary.json, optional-caller-compiler.json, optional-caller-native.json and optional-caller-decoder-witness.mts. Existing source/emit bindings remained unchanged. This proves a real application decoding pattern against the existing emitted SDK; it does not yet verify the proposed new emitted declarations. Getter controls use native Promise.then, whereas valid/mismatch controls use actual generated methods and controlled fetch. It is not proof of server authorization, business constraints, exhaustive hostile-object safety or a complete generated output schema.

## Exact public scope

The retained decoder-operation-inventory.json binds all **211 default plus 11 OfflineCtg9 methods**, across forty generated service files, to operation/source/model information. Both exported clients, `GeneratedStynxSdk` and `OfflineCtg9.GeneratedOfflineCtg9Sdk`, are included.

1. Both generated `BaseHttpRequest.request<T>` declarations become non-generic `request(options): CancelablePromise<unknown>`.
2. Both generated `FetchHttpRequest.request<T>` implementations and their core `request<T>` helper lose the unsupported result type parameter and honestly return unknown.
3. All 222 endpoint methods retain their names, parameter types/defaults, input/body models and request-option construction, but change their result annotation to `CancelablePromise<unknown>`.
4. Existing `CancelablePromise<T>` remains generic as a real promise container; this decision does not erase legitimate promise or `ResponseDecoder<T>` generics. The custom request constructor contract may reference the changed base type but gains no new runtime requirement or constructor parameter.

Consumers relying on inferred DTO result properties must narrow or decode before use. Calls explicitly supplying the removed result type argument must migrate. Custom TypeScript request implementations need actual declaration/assignability validation; compatibility of every external subtype is not presumed. Their runtime constructors and calls retain original behavior.

The repository caller census found no production consumer relying on generated endpoint result DTOs. The packed composition test retains 211 method-discovery checks, eight paired endpoint calls with passthrough sentinels and three embedded input-consumer calls. scripts/verify-consumer-fixtures.mjs checks client/method presence. Existing audit wire alias consumers remain separately required. Handwritten StynxSdkClient/Angular consumers retain their prior ADR0033 B1 scope. The exact bounded census and source hashes are in actual-caller-migration-inventory.json; external published consumers cannot be exhaustively enumerated.

## Runtime preservation and optional decoding

There is no new request, response read, cloning, normalization, shape validation, error wrapping or decoder invocation in the generated path. Preserve actual custom constructor/receiver, exact options/body, one request invocation, original returned handle and resolved object identity, rejection identity, metadata, cancellation and native failure/coercion ordering. Unknown is an honest declaration of the observed boundary, not a new runtime behavior.

An application can retain `pending`, then call `pending.then(realDecoder)`. The derived value is an ordinary Promise, **not** a CancelablePromise. Cancellation remains available on the original handle; no new cancellation forwarding or post-settlement decoder cancellation guarantee is introduced. Application decoders own their explicit validation, getter observations, snapshot identity and errors. The verified witness constructs fresh ordinary fields rather than claiming that a mutable source object or changing getter permanently satisfies a DTO. No type assertion or generic conforms<T> may substitute for its proof.

## Models, defaults and other approvals remain separate

Preserve existing exported input/model names and construction declarations, direct backend/store/service APIs, response metadata and the current parser default-response mapping. This proposal does not remove default→200/ProblemDetails metadata or silently replace concrete shared models. Endpoint return annotations stop asserting those unions; the parser/model records remain intact.

Known fidelity debt stays visible: description-only JsonValue currently maps to `{}` and reaches 183 generated operations (primary closure 35 inputs/179 outputs); JsonValue/FlowJsonObject cross input/output directions. ProblemDetails appears in all 222 current unions and its opaque dictionary cleanup is separately authorized. Three SyncBatchReceipt positions currently describe Blob|null despite observed built-in HTTP Buffer JSON. Choosing unknown transport results does not repair or newly authorize changes to these exported models, generate validators from descriptions, or declare them exhaustive wire contracts.

Already accepted exact opaque-any cleanup, the closed-empty three-input/zero-output correction and ADR0039 audit projection continue under their existing authority. No global input narrowing, JsonValue downgrade, Uint8Array emitter override, filter/error behavior change or binary Wire DTO is approved here. Pending ADR0043–0051 remain unanswered and are neither accepted nor displaced. Known model fidelity issues must remain recorded; no all-model-correct or all-222-decoder-ready claim is allowed.

## Implementation and acceptance requirements

Engineer authoring scope is packages-web/sdk/codegen/core/BaseHttpRequest.ts.template, FetchHttpRequest.ts.template and request.ts.template, plus packages-web/sdk/codegen/render.mjs. Use genuine unknown transport values and remove unsupported result assertions without adding a generic forwarding workaround, suppressions or ambient type laundering. Preserve native promise/callback/cancellation execution. Generate both composition cores and the exact forty service files through the official generator; review dependent import/JSDoc changes rather than hand-edit generated files.

Inspector must retain original input, transport and runtime assertions; verify actual custom request assignability and public emitted consumers; prove unvalidated result access and removed result-type arguments now fail compilation; and prove the real optional decoder pattern succeeds against the new emitted package. Repeat the seven original native control groups and exact packed dual-composition forwarding tests on changed output. The existing six-case witness is prerequisite evidence, not a substitute for postimplementation validation.

Architect reviews the exact generated scope and intended emitted declaration difference. Coordinate with already-authorized stable document changes for the normal official dual-composition generation, readonly generation check, emitted consumer checks, trace/API baseline and final qualification. This proposal authorizes no premature baseline rebinding or manual generated edits. No extra HTTP performance campaign follows.

## Deferred alternative and exclusions

The larger raw-plus-checked design remains documented in grouped-source-wire-disposition.md and decoder-feasibility-disposition.md. It would add snapshots, validation/refusals and cancellation semantics, and needs complete source-derived models plus an explicit default-success-union choice. It is not selected here and cannot be treated as a ready promise to generate 222 authoritative validators.

Unknown passthrough is recommended because it honestly removes the unsupported guarantee while preserving the user's existing runtime and custom transport behavior. The public compile-time migration is explicit. This decision does not approve release classification, publication, formal DEVAI acceptance, #211 action or DETRAN/PORM changes.
