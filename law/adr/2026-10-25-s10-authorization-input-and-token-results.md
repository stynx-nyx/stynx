---
adr_id: ADR-DEVAI-ADOPTION-0045
title: Raw Authorization inputs and verified token representation
status: accepted
date: 2026-10-25
authors: ['Architect']
tags: [stynx, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0045 — Raw Authorization inputs and verified token representation

## Operative acceptance — 2026-10-25

The Owner answered **“Preserve verified byte tokens (Recommended)”** for the exact reviewed proposal preserved below. Select the preservation option: raw TokenVerifier/Cognito Authorization input becomes `unknown`, and `AuthVerificationResult.token` becomes `string | Uint8Array`. Preserve the proven successful byte-token authentication and token identity, original Backend `[123]` custom-verifier forwarding, and native error/order behavior. The alternative that refuses successful byte tokens is not selected. Principal and AuthContext are not widened.

This records accepted design and implementation authority only. It does not claim completed implementation, independent verification, final API/trace binding, signed RC or integration. The proposal's exact scope, preservation requirements, explicit selected changes, exclusions and verification obligations remain binding. Unselected alternatives are not authorized.

Earlier ADR0028–0042 retain their own scopes, including the exact two-site F2 exception. The other ADR0043–0052 decisions were also answered in this batch and retain their separate scopes; historical pending-language below does not revoke those answers. Release classification/publication, formal DEVAI acceptance, #211, and downstream DETRAN/PORM acceptance remain separate. This record creates no workflow/forbidden-action receipt and grants no unrelated exception.

## Reviewed proposal custody

- Original reviewed packet: `/tmp/stynx-auth-input-contract-preparation-20261025/proposed-adr0045.md`.
- Original SHA-256: `15df9688965ba6f4554e9f3c782f6333ae9af7a80ce8abb6e56c781a6671b0cf`.
- Exact answer source: `/tmp/stynx-owner-approvals-0043-0052-20261025.json`, a root transcription of the direct human answers; SHA-256 `c033712470dffb379e05b757cc9f1e376e2e5105b61dfe06014f794068757ead`.
- The complete original packet, including any original frontmatter, is retained in the external ratification packet's `preimages/proposed-adr0045.md`.

## Historical reviewed proposal — operative status superseded

The following reviewed body is retained as proposal evidence, with formatting-only normalization for the repository Markdown contract. The exact original bytes remain in the custody preimage. Its proposed/unapproved/pending status, allocation checks and suggested questions describe the pre-decision snapshot. They are superseded by the operative acceptance above. Its concrete contract, implementation constraints and validation obligations apply to the selected decision; historical observations remain observations, not post-change qualification.

# ADR-DEVAI-ADOPTION-0045 — Raw Authorization inputs and verified token representation

Status: **PROPOSED**, external review packet, 2026-10-25. No Owner answer, acceptance, implementation or publication is asserted. ADR0043 and ADR0044 remain independent pending decisions. ADR0045 is reserved externally; recheck the index before writing a repository record. This packet supersedes its preserved `proposed-adr0045.pre-byte-success.md` draft because the new native evidence proves successful byte-token authentication, not merely malformed input behavior.

## Exact decision and recommendation

Both options correct the public TokenVerifier and Cognito raw-header parameter to `unknown` and preserve Backend forwarding, including the original `[123]` custom-verifier success. Choose one of these **two mutually exclusive token-result dispositions**:

| Choice                                          | Public result                                        | Runtime consequence                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Preserve verified byte tokens (recommended)** | `AuthVerificationResult.token: string \| Uint8Array` | Preserve the proven original successful byte-token path and its exact returned Uint8Array identity. String tokens remain strings. External consumers that assume string must narrow.                                                                                                          |
| **Require string tokens**                       | Keep `AuthVerificationResult.token: string`          | Add the explicit Cognito refusal `InvalidCredentialError('Bearer token must be a string')` for every non-string derived token. This removes a **proven successful authentication path**, including valid signed JWT bytes; it is a deliberate compatibility break, not a preservation repair. |

Recommend the first option: it adds one precise result union, preserves observed success and leaves existing production consumers unchanged because none consumes this result's token field. It does not widen the result to arbitrary unknown. The second option is available only as an explicit behavioral choice, not an implementation default.

Suggested question: **“For the raw Authorization correction, preserve verified byte tokens with a string | Uint8Array result, or deliberately require string tokens?”** Suggested labels: “Preserve verified byte tokens (Recommended)” and “Require string tokens”. Approval of either option includes the raw-input correction and only that option's stated result/behavior scope.

## Original contract contradiction and measured evidence

The original protected Backend guard passes the raw authorization header to its custom verifier, despite `TokenVerifier.verifyAuthorizationHeader(value: string | string[] | undefined)`. The original `packages/backend/test/unit/behavior-coverage.spec.ts` case “auth guard accepts non-string array headers and omits blank resolver header” requires `[123]` to reach a custom verifier unchanged, then accepts the request and omits a blank tenant header. Its verifier returns only `{principal}`; the following case intentionally omits Principal.claims. The earlier attempted malformed-header refusal failed this preserved test (200/201). The original forwarding was restored and the original201 cohort passed. That restored assertion is unfinished strict debt, not an approved exception.

Inspector's actual original emitted Cognito observations are in `/tmp/stynx-auth-input-inspector-20261025/observations.json` (24 cases) and `trim-results.json` (6 supplemental cases), with source custody and copied public declarations in `summary.json`. The24 controls made zero fetch calls. They cover nullish/empty/sparse input, mixed first-element TypeErrors, inherited/index getters, actual method receivers, six sentinel identities, lazy operation order and custom methods returning a malformed string token.

The6 supplemental controls establish:

- A locally signed valid RS256 JWT supplied by a custom header method chain as Uint8Array **succeeds through original Cognito and installed native JOSE**. The principal is `native-byte-user`; returned token is the **same Uint8Array object**. There is one controlled local JWKS Response and zero live network calls. This is native local cryptographic behavior, not real-provider acceptance.
- Invalid bytes produce existing InvalidCredentialError('Invalid Compact JWS').
- Number, object, undefined and null derived tokens produce existing InvalidCredentialError('Compact JWS must be a string or Uint8Array'), with no fetch.
- The observed trace is `issuer → startsWith → slice → trim → issuer`; the first issuer read is constructor configuration, the later read is verification options. Source order also retains dynamic JOSE import and resolveJwks before the verification call.

Installed `packages/auth/node_modules/jose` resolves to jose6.2.3. Its native `dist/webapi/jws/compact/verify.js` accepts Uint8Array, decodes it, accepts strings, and otherwise throws JWSInvalid with the message above. `jwtVerify` then verifies signature and claims. Its actual public overload accepts string | Uint8Array and returns the typed verification result. This matches the measured successful byte case and contradicts STYNX's current token:string promise.

## Exact public surface and consumer closure

Recommended option changes exactly these declarations:

1. `packages/contracts/src/auth.ts`: `TokenVerifier.verifyAuthorizationHeader(value: unknown): Promise<AuthVerificationResult>`; change only `AuthVerificationResult.token` from string to string | Uint8Array.
2. `packages/auth/src/cognito-token-verifier.ts`: corresponding public parameter unknown, return remains Promise<AuthVerificationResult> with the honest widened token field.
3. `packages/backend/src/auth/auth-context.guard.ts`: remove the protected header assertion and forward the same raw value at the same read/call position. Its public method signatures do not otherwise change.

The existing contracts and auth root barrels already expose these declarations. Backend's exported AuthContextGuard and StynxAuthModuleOptions propagate TokenVerifier by reference; no new export-map/subpath/constructor option is required. Principal, principal claims, timestamps/tokenUse, PrincipalMapper return, tenant policy/context and request attachments remain unchanged. The alternative string-only choice omits the token union and adds only its explicit refusal.

The current source census is `/tmp/stynx-auth-input-contract-preparation-20261025/{production-census.txt,caller-census.txt,plan.json}`: 14 production references and90 test references, not14 distinct methods. Direct source review confirms:

- CognitoTokenVerifier is the actual production implementation and sole construction of this AuthVerificationResult token in that census.
- AuthContextGuard has two invocations: optional-public passes the existing admitted string; protected passes raw header. It checks/uses principal, then sends the unchanged result to the configured PrincipalMapper. It does not read token.
- DefaultPrincipalMapper returns result.principal only. Tenant resolution receives principal and relevant request metadata, not token.
- Auth module options store the TokenVerifier interface; the module has no separate token interpretation.
- No production consumer in the scoped packages/packages-web/reference/domain census performs string operations on this AuthVerificationResult.token. This is a repository census, not a promise about external adopters.

External verifiers must accept raw input according to their declared policy. External code reading result.token must narrow string vs Uint8Array under the recommended choice; external custom mappers also receive that union via the same result interface. Old string-producing verifiers remain valid outputs. Existing narrower method implementations may remain structurally assignable because of TypeScript method bivariance; that is not proof they handle all runtime raw values. Do not change the interface to a function property or use false overloads to hide this impact.

## Honest implementation and preservation bounds

Keep native Array.isArray and its original first-index Get; otherwise use the exact original input. Nullish authorization retains the optional startsWith skip and Missing bearer token. Preserve the actual startsWith Get/call and original receiver with literal 'Bearer ', its truthiness check, lazy slice Get/call with argument7, and trim Get/call on that returned value. Do not stringify/clone/header-filter or claim the entire value is a string because it has methods. Results stay unknown until checked. Private exact operation-specific property/call handling is permitted; no generic typed forwarder, assertion, fake string predicate or unchecked custom callback output.

Preserve custom getter errors/sentinels and actual primitive boxing/receivers. Noncallable operations retain observed TypeError behavior; native message comparisons belong in the candidate matrix, and any unavoidable message difference must be disclosed rather than silently described as exact equivalence. Do not convert extraction TypeErrors into credential rejection. Public optional-auth headerToString/Bearer syntax admission and its existing catches/principal checks remain unchanged.

**Recommended byte-preserving route:** after extraction, preserve existing JOSE import, resolveJwks and issuer-option evaluation positions. At the original verification boundary, honestly discriminate `string` or native `Uint8Array`, then use the ordinary typed `jwtVerify` call with its actual JWKS resolver/options. Return the exact captured token, without decoding or copying it. No call to native JOSE with an asserted input, no Reflect.apply result laundering and no new opaque verification-result predicate is needed.

For all other extracted types, preserve the installed native invalid-token outcome at this same boundary: construct the installed `errors.JWSInvalid('Compact JWS must be a string or Uint8Array')` inside the existing try/catch after the original prerequisites/options evaluation, so the current known-code mapping still produces InvalidCredentialError with the original message. This is an explicit version-bound reproduction of the native rejected-domain check, not an authentication shortcut. Inspector must compare all original rejected-domain/error/order controls, including actual local JOSE behavior, before acceptance. Do not use this route for otherwise accepted byte/string inputs or skip signature/claims verification. Cross-realm/proxy/native-buffer behavior must follow the same actual native instance admission and subsequent decoder behavior; no structural byte-array predicate or arbitrary object coercion.

The native instanceof admission may be performed once for proof and again internally by JOSE; no equivalence under monkey-patched Uint8Array Symbol.hasInstance or replaced native JOSE exports is promised. Ordinary byte subclasses and native decoding errors remain subject to measured before/after controls. If a concrete supported case cannot preserve behavior, report it instead of introducing a broader native-call exemption.

**Alternative string-only route:** use the same extraction and prerequisite/order preservation, but at that boundary refuse every non-string token with the fixed redacted error named above. This intentionally changes valid-byte success, invalid-byte parsing errors, rejected non-string messages, and any byte verification/JWKS fetch that would have followed. No byte-to-string normalization is implied. These are explicit consequences of the alternate Owner choice.

Neither option adds full custom-verifier result validation. Keep the original missing-token/missing-claims tests; no result reconstruction, new required-field guard, broadened Principal or undocumented rejection is part of this task. Existing optional-public null rejection compatibility stays operationally intact without expanding this proposal into all result-nullability declarations.

## Candidate verification required after the selected approval

1. Preserve all original Backend201 assertions, particularly `[123]`, blank tenant omission, missing token/claims, mapper/resolver identity/errors and optional-public nominal/verified paths.
2. Replay original native24+6. For recommended choice, valid signed byte token must still succeed with exact identity/principal and the single controlled JWKS response; invalid bytes and other native rejected types retain their messages/order. For string-only choice, keep the original success as historical evidence and add explicitly authorized new-refusal assertions; never relabel that as preserved success.
3. Keep existing JWT signature, claims, issuer/audience/token-use, JWKS outages and error-code tests. Add receiver/getter/error ordering, byte subclass/native decode and no unexpected live network controls as needed for the actual implementation. No real credentials/provider calls.
4. Build/typecheck actual contracts/auth/backend and strict profiles. Emitted consumers must show the precise unknown input and selected token type; under the union choice string-only consumption must require honest narrowing, both string and Uint8Array outputs must compile, and unrelated result fields remain unchanged.
5. Review actual barrel/caller declarations and use the official API baseline writer only once the source and declarations are stable. No manual generated declarations, suppression, fake native signature, exception or waived assertion.

## Exclusions and current status

No change to general JWT validator APIs, session token formats, HTTP header serialization, default Principal mapping, tenant authorization, requests sent by browser clients, credential storage, or runtime provider configuration. A byte result here is a direct in-process verifier result, not a new wire contract. No F2 extension, ADR0041/0042 expansion, or implicit Signature/Worklist approval.

Release classification/version/publication, formal DEVAI acceptance, #211, DETRAN and PORM remain separate. Existing implementation and verification work may continue independently; this proposal creates no receipt or publication authority. No implementation or new RC claim is made.

Architect review used live source and the actual original30 native observations. New Architect Graft calls: zero; the prior Engineer census call is not recounted.
