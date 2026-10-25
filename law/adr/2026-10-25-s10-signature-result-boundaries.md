---
adr_id: ADR-DEVAI-ADOPTION-0043
title: Bounded Signature result boundaries
status: accepted
date: 2026-10-25
authors: ['Architect']
tags: [stynx, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0043 — Bounded Signature result boundaries

## Operative acceptance — 2026-10-25

The Owner answered **“Approve the bounded corrections and listed refusals”** for the exact reviewed proposal preserved below. Accept the exact decoder result `unknown`, canonical JSON result `string | undefined`, verify-only partial certificate representation with `Date | string` dates, and the explicitly enumerated malformed provider-response refusals in the reviewed proposal. Preserve encode/sign inputs, legacy trust behavior, native mapping order and all exclusions.

This records accepted design and implementation authority only. It does not claim completed implementation, independent verification, final API/trace binding, signed RC or integration. The proposal's exact scope, preservation requirements, explicit selected changes, exclusions and verification obligations remain binding. Unselected alternatives are not authorized.

Earlier ADR0028–0042 retain their own scopes, including the exact two-site F2 exception. The other ADR0043–0052 decisions were also answered in this batch and retain their separate scopes; historical pending-language below does not revoke those answers. Release classification/publication, formal DEVAI acceptance, #211, and downstream DETRAN/PORM acceptance remain separate. This record creates no workflow/forbidden-action receipt and grants no unrelated exception.

## Reviewed proposal custody

- Original reviewed packet: `/tmp/stynx-signature-internal-preparation-20261025/proposed-adr0043.md`.
- Original SHA-256: `71e06066fb5c47acc41372982b64b7f7554a294dafc6aa044421dde4b6367aca`.
- Exact answer source: `/tmp/stynx-owner-approvals-0043-0052-20261025.json`, a root transcription of the direct human answers; SHA-256 `c033712470dffb379e05b757cc9f1e376e2e5105b61dfe06014f794068757ead`.
- The complete original packet, including any original frontmatter, is retained in the external ratification packet's `preimages/proposed-adr0043.md`.

## Historical reviewed proposal — operative status superseded

The following reviewed body is retained as proposal evidence, with formatting-only normalization for the repository Markdown contract. The exact original bytes remain in the custody preimage. Its proposed/unapproved/pending status, allocation checks and suggested questions describe the pre-decision snapshot. They are superseded by the operative acceptance above. Its concrete contract, implementation constraints and validation obligations apply to the selected decision; historical observations remain observations, not post-change qualification.

# ADR-DEVAI-ADOPTION-0043 — Bounded Signature result boundaries

**Status:** Proposed only. No Owner approval, implementation authorization, completed migration or qualification is recorded here. Original native observations and emitted declarations are available; candidate equivalence remains required.

## Authority and problem

Existing strict/preservation work under [ADR0028](2026-10-23-s10-typed-query-adoption.md) does not itself authorize new public result contracts. [ADR0033](2026-10-23-s10-generic-boundary-disposition-proposal.md) is bounded to its browser correction and two testing assertions. Previously accepted result corrections retain their exact populations. This proposal covers the specific Signature exports and HTTP mapping obligations below; it does not expand those approvals.

The public PAdES decoder promises an envelope but returns arbitrary parsed JSON. The public canonical JSON helper accepts unknown but can return undefined. HTTP verification passes an actual JSON certificate description unchanged through its provider/backend/service chain, including supplied partial descriptions and ISO date text, while its result claims a complete input certificate with Date fields. Preserving partial descriptions is an explicit proposed compatibility choice, not a claim that the original named certificate contract admitted missing required fields. These are observable public contradictions. Neither assertions nor a generic transport return annotation proves them.

## Original evidence and limits

Inspector packet: `/tmp/stynx-signature-inspector-20261025/`:

- `public-observations.json`: 106 actual original emitted public-index observations, with `observe-public.mjs` and source custody.
- `service-observations.json`: three additional actual SignatureService legacy-chain observations, with `observe-service.mjs`.
- `public-field-table.md`: field-by-field classification.
- `original-declarations/`, `original-emitted-declarations.json` and `original-source-custody.json`: 35 genuine original declarations and hashes.

Normal original Signature build passed (2.079 seconds); the missing Health emitted entry was retained as an initial prerequisite failure, then a normal Health build passed (1.080 seconds). Existing 17 Signature test files/151 tests passed. These are baseline results, not candidate verification. HTTP observations use native Response JSON and controlled fetch, plus three explicitly labelled custom response-port controls; there were no provider network calls or production trust/service acceptance claims.

The decoder returns JSON null, booleans, numbers, strings, arrays and unrelated objects; no marker/empty marker returns null, first matching marker wins, and corrupt JSON throws SyntaxError. canonicalJson returns undefined for top-level undefined/function/symbol; its downstream hash call then throws native TypeError. Bigint throws TypeError, cycles RangeError, sparse arrays retain comma-slot behavior and nested unsupported values retain the existing textual behavior. This proposal does not redesign canonicalization.

Native JSON certificate ISO dates survive unchanged through HttpSignatureProviderClient → ProviderBackedSignatureBackend → SignatureService legacy verify. The observer supplied certificate descriptions omitting subject/issuer/serialNumber and the original implementation accepted them. That is operational evidence, not proof the provider domain promises omissions: the existing SignatureCertificateRef declaration requires those three fields. This proposal deliberately preserves the observed partial-description compatibility by making only the verification result fields optional; it does not infer that omission was already a documented provider requirement. Known revocation source case variants normalize successfully on sign/verify; validateCertificate remains uppercase-only. Historical malformed-provider successes are inventoried separately below, not automatically promoted to legitimate domain values.

## Proposed exact public changes

1. `decodePadesEvidenceBlock(document: Uint8Array)` returns **unknown**. Keep document input, marker/base64/JSON behavior, null result and errors unchanged. `PadesEvidenceEnvelope`, encodePadesEvidenceBlock, MockPadesEvidenceAdapter.sign and their input/output types stay unchanged. A decoded object is not a verified signature or trusted envelope. Direct callers must narrow before accessing fields.
2. `canonicalJson(value: unknown)` returns **string | undefined**. Preserve input and exact recursion, key order, holes, native failures and unsupported-value output. No empty-string fallback, JSON repair, coercion or RFC algorithm redesign. `sha256CanonicalJson` continues returning string on success and retaining the existing native failure for undefined canonical output; its internal call to Node hashing must honestly handle that possibility without falsely narrowing it or replacing the native error. Its public successful return and sha256's input contract do not widen.
3. Add a named **SignatureCertificateResult** used only by `VerifyResult.signerCertificate`, with optional `subject`, `issuer`, `serialNumber`, `pem` strings and optional `notBefore`/`notAfter` of **Date | string**. Explicit undefined construction forms remain permitted. This is an untrusted certificate description, not a complete request certificate or cryptographic proof. Preserve object identity and exact date text; do not parse/coerce these nested dates. Additional unknown object properties may remain at runtime but receive no invented public typed guarantee.

`SignatureCertificateRef` remains unchanged, including required subject/issuer/serialNumber and Date-based request fields. SignatureRequest, VerifyRequest.certificate, CertificateValidationRequest and all encode/sign inputs remain unchanged. `SignatureEvidence.signerCertificate` remains the original input certificate, so it does not need the verification-result correction. No other evidence/trust-proof time fields widen.

The VerifyResult change propagates through SignatureProviderClient.verifyPades, HttpSignatureProviderClient.verifyPades, SignatureBackend.verify, ProviderBackedSignatureBackend.verify and SignatureService.verify using their existing shared result. Existing Date-bearing complete certificate implementations remain valid constructions. Consumers must account for optional descriptive fields and string dates; do not silently convert them back to Date or pass the result as a complete request certificate.

## HTTP field disposition and explicitly proposed refusal boundary

Private execute becomes unknown-returning; no caller-selected generic is considered response validation. Preserve required-field checks and mapping order. This proposal chooses finite existing domain types for other public fields rather than widening every shared result to unknown. The resulting new malformed-provider refusals are an explicit part of this proposal, not a claim that historical malformed success never occurred or that earlier Owner approvals already permitted it.

| Field/operation                                     | Preserved behavior                                                                                                                    | Proposed proof/refusal                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| validate good/source                                | Existing boolean and exact uppercase enum checks/errors                                                                               | Unchanged                                                                                                                                                                                                  |
| sign signedPdfBase64                                | Existing nonempty string requirement and native Buffer result                                                                         | Unchanged                                                                                                                                                                                                  |
| verify status                                       | Existing valid/invalid/unknown check before optional mapping                                                                          | Unchanged                                                                                                                                                                                                  |
| checkedAt and optional signing/revocation dates     | Existing falsey default/omission, native Date construction, numeric/string coercion and invalid-date error                            | Keep constructed Date output; do not apply a new wire-string restriction                                                                                                                                   |
| optional CMS                                        | Existing truthy native Buffer conversion, including observed numeric arrays/Buffer JSON; falsey omission and native conversion errors | Prove native Buffer output; do not demand base64 string solely from old private alias                                                                                                                      |
| signatureId, validation reason, providerEvidenceUri | Existing falsey omission and valid string value unchanged                                                                             | Truthy non-string values become fixed redacted SignatureProviderResponseError at the original mapping position                                                                                             |
| certificateChainPem                                 | Existing falsey omission, string array values and identity                                                                            | Emitted value must be a complete string array; mixed/nonarray values become redacted response errors, without filtering or copying                                                                         |
| verify reasons                                      | Existing null/undefined creates a fresh []; valid string-array identity retained                                                      | Other nonarray/mixed values, including observed false/0/empty string, become redacted response errors; do not silently default them                                                                        |
| sign/verify revocationSource                        | Existing falsey none, native lowercase operation, recognized upper/lower/mixed-case values                                            | Validate the produced value against existing RevocationSource; unknown normalized strings now refuse rather than widening the enum. Preserve preceding native TypeError on noncallable toLowerCase         |
| verify signerCertificate                            | Existing falsey omission, partial descriptor object identity, string/Date nested date representations                                 | Check only the described optional named fields; malformed primitive/array or wrong named field types refuse. Do not require absent descriptive fields, recurse through unknown extras or normalize strings |

These are bounded response-contract checks, not cryptographic validation. They must run outside execute's transport catch as mapping currently does; do not turn a response mapping failure into a retry or wrapped transport error. Preserve actual native conversion failures and error causes, and validate the actual value returned after any repeated property read instead of assuming an earlier guard proves a later accessor value. Avoid eager whole-object parsing that moves the first failure, clones optional values or inspects ignored fields. Native JSON ordinary fields are the primary wire domain; custom-port observation traces remain explicit compatibility tests where applicable.

The observed malformed values remain historical evidence. Candidate tests must label the exact changed malformed successes as the newly selected refusal behavior if this proposal is approved. Do not edit existing assertions to claim preservation; a conflicting existing valid-domain assertion requires renewed review. The decoder and canonicalJson corrections themselves introduce no refusal.

## Caller and implementation closure

Repository source census found decoder use in Signature/PDF tests, with no production decoder caller; external consumers still exist and are not bounded by that census. canonicalJson feeds sha256CanonicalJson, which is used by existing signing/digest helpers; preserve native Node failure instead of hiding undefined through an assertion. The HTTP concrete class is supplied by SignatureModule wherever no custom provider is configured. ProviderBackedSignatureBackend forwards verification results; SignatureService's legacy verify returns that result unchanged. Regulated verification constructs its verified result separately and gains no exemption from existing trust checks.

Implementation paths are limited to Signature decoder/digest/HTTP client/types and genuinely necessary private caller narrowing. Tests, migration documentation and genuine emitted API rebinding are required. No manual generated declarations, HTTP endpoint changes, dependency upgrade, request type expansion, broad provider result union, generic native forwarding or unsafe-rule suppression is authorized. A fixed private Node Date/Buffer/hash interop operation may retain unknown arguments and prove only its actual consumed output; it must not claim arbitrary unknown arguments satisfy a typed STYNX callback. The unrelated internal CMS/ASN.1/XML work remains its existing separate scope.

## Validation and acceptance conditions

- Retain the 151 existing tests and original106+3 observations. Replay preserving cases and explicitly test only the listed new malformed refusals, with fixed redacted errors and no response data leakage.
- Original-vs-candidate decoder/digest cases cover absence/null, arbitrary JSON, first marker, parse errors, top-level undefined/function/symbol, bigint/cycle/hole behavior and downstream native hash errors.
- Actual HTTP/provider/backend/service cases cover the explicitly selected partial-certificate compatibility and string/Date dates, typed optional fields, defaults/omissions, identity, revocation normalization, request bytes, native Date/Buffer failures, transport causes and mapping priority. No network provider acceptance is inferred.
- Strict real emitted consumers demonstrate unknown decoder narrowing, canonicalJson undefined handling, partial/date-union certificate access, unchanged input certificate construction and unchanged custom provider success types. Inspect the actual declaration diff before the official final API baseline writer; original35 declarations are evidence, not a manual replacement baseline.
- Preserve all existing minimum-level, trust-profile, CMS/ByteRange, revocation, malformed evidence and regulated refusal populations under ADR-SIGNATURE-0001/0002. A type guard never establishes ADVANCED/QUALIFIED or downstream readiness.
- Normal package type/strict/tests, final combined workspace gates and signed RC remain required. No observation here claims implementation completion.

## Alternatives and decision boundary

Recommended: the three bounded result corrections plus explicitly enumerated malformed HTTP response refusals above, preserving valid declared values, explicitly selected partial-certificate compatibility, native conversions/defaults/errors and trust policy. An entirely preserving unknown result for every HTTP field would spread into shared provider/backend/service contracts and is not the selected proposal. Coercing certificates/dates, making the decoder reject arbitrary JSON, substituting canonical empty strings or preserving unchecked generic transport assertions are not selected. Independent internal Signature repairs can continue while this proposal remains pending.

Suggested Owner question: **Approve the three bounded Signature result corrections and the listed malformed-provider response refusals?**

Release classification, publication, formal DEVAI acceptance, #211, DETRAN/PORM acceptance and consumer pin/profile decisions remain separate. No Owner answer or receipt is recorded by this proposed document.
