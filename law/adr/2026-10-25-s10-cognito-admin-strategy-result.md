---
adr_id: ADR-DEVAI-ADOPTION-0046
title: Honest Cognito admin environment strategy
status: accepted
date: 2026-10-25
authors: ['Architect']
tags: [stynx, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0046 — Honest Cognito admin environment strategy

## Operative acceptance — 2026-10-25

The Owner answered **“Approve the bounded strategy correction”** for the exact reviewed proposal preserved below. Accept only `CognitoAdminAdapterOptions.credentialsStrategy?: string`, preserving the finite named credential-strategy alias and explicit override contract. Preserve arbitrary/empty environment values, supplied credential identity, native resolution order and existing errors; no credential behavior or input normalization is added.

This records accepted design and implementation authority only. It does not claim completed implementation, independent verification, final API/trace binding, signed RC or integration. The proposal's exact scope, preservation requirements, explicit selected changes, exclusions and verification obligations remain binding. Unselected alternatives are not authorized.

Earlier ADR0028–0042 retain their own scopes, including the exact two-site F2 exception. The other ADR0043–0052 decisions were also answered in this batch and retain their separate scopes; historical pending-language below does not revoke those answers. Release classification/publication, formal DEVAI acceptance, #211, and downstream DETRAN/PORM acceptance remain separate. This record creates no workflow/forbidden-action receipt and grants no unrelated exception.

## Reviewed proposal custody

- Original reviewed packet: `/tmp/stynx-runtime21-cognito-strategy-gap-20261025/proposed-adr0046.md`.
- Original SHA-256: `8166a69d8774bd85581e09d530b9588a278578b305f1419c765dfdac2affcee0`.
- Exact answer source: `/tmp/stynx-owner-approvals-0043-0052-20261025.json`, a root transcription of the direct human answers; SHA-256 `c033712470dffb379e05b757cc9f1e376e2e5105b61dfe06014f794068757ead`.
- The complete original packet, including any original frontmatter, is retained in the external ratification packet's `preimages/proposed-adr0046.md`.

## Historical reviewed proposal — operative status superseded

The following reviewed body is retained as proposal evidence, with formatting-only normalization for the repository Markdown contract. The exact original bytes remain in the custody preimage. Its proposed/unapproved/pending status, allocation checks and suggested questions describe the pre-decision snapshot. They are superseded by the operative acceptance above. Its concrete contract, implementation constraints and validation obligations apply to the selected decision; historical observations remain observations, not post-change qualification.

# Prospective ADR0046 — Honest Cognito admin environment strategy

2026-10-25. EXTERNAL PROPOSAL ONLY. No Owner decision, implementation or completed native verification is claimed. Current repository ADR index ends at0042; external pending0043 Signature,0044 Worklist and0045 Authorization are reserved and remain independent. Recheck index/reservations before any repository materialization. Current review checkout HEAD948cacd10cb0237ac2354986cd166a0ac7d2dd1c.

## Exact mismatch and authority

packages/auth/src/cognito-admin.adapter.ts:34 exports CognitoAdminCredentialStrategy = 'default-chain' | 'profile' | 'provided'. AdapterOptions.credentialsStrategy (:40) and OptionsFromEnvOverrides.credentialsStrategy (:50) use it. The environment factory (:445–496) promises AdapterOptions but returns every non-nullish STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY string unchanged, including empty or unknown strings. Its cast supplies no validation. The root index reexports this module; the captured original emitted d.ts repeats the finite promise.

The private resolver (:414–442) explicitly recognizes default-chain and profile; all other strategies use the explicit credentials branch. Thus an output-only correction that cannot be passed to the adapter would break the existing helper/constructor composition. Source evidence establishes the mismatch, but native original observations are still pending and must precede a decision question.

Accepted ADR0030 concerns pool/table-marker contracts;0031 bounded generated SQL deferrals;0032 named PostgreSQL representations;0033 F2/browser;0034/0039 audit/outbox results;0035/0036 verification;0037/0038 exact auxiliary actions;0040 exact tooling lifecycle;0041 Offline hooks;0042 i18n/notification boundaries. None approves this Cognito admin option correction. Pending0045 addresses Authorization input/verified token representation, not admin credential strategy. Internal removal of an assertion cannot make the current finite public return true while preserving arbitrary strings. A concrete public decision is therefore necessary after evidence; this does not block unrelated already-approved work.

## Recommended minimal preservation choice (not accepted)

Change only CognitoAdminAdapterOptions.credentialsStrategy from optional CognitoAdminCredentialStrategy to optional string. Keep CognitoAdminCredentialStrategy finite and unchanged, and keep CognitoAdminOptionsFromEnvOverrides.credentialsStrategy finite. Remove the false environment assertion; do not change the runtime helper/resolver.

This honestly describes the environment result and constructor composition. It also makes arbitrary string constructor options expressible to TypeScript callers; that is an explicit bounded input/declaration effect, not merely an output-only change. It does not add a fourth named credential strategy or new AWS credential mechanism: default-chain/profile remain their exact branches, and every other string still requires explicit credentials. Optionality, all other option fields and AWS credential types remain unchanged.

Affected declaration is one property in the exported interface, flowing through the existing helper return and constructor signature. Existing Options consumers that narrow the property to the three-literal alias must add narrowing. Existing finite values remain assignable. Repository source census finds no production property consumer requiring finite assumptions outside this module; existing package/central tests call the factory. External consumers are not assumed absent. No SDK/OpenAPI propagation is presently implicated; verify emitted consumer closure before final baseline. Release classification stays separate.

## Runtime and error contract retained

- Factory reads region, pool and endpoint as today, refuses missing region/pool before strategy evaluation, then preserves explicit override > non-nullish env string > AWS_PROFILE-derived fallback. Empty strategy is not missing.
- Profile lookup and conditional returned profile property stay in their original positions; do not skip getters merely because strategy is not profile. Preserve returned endpoint/credentials/fallback-order conditional spreads and exact object/provider identity.
- Constructor resolves credentials before constructing the SDK client. default-chain returns undefined; profile uses original profile/nullish AWS_PROFILE fallback and missing-profile IdentityAdminError; every other strategy uses original truthy explicit-credentials check and existing Provided credentials strategy requires explicit credentials error. No early enum refusal, coercion, normalization or new provider invocation.
- No network/AWS operation, credential retrieval, schema of provider results or administrative permission change is authorized by this type correction.

## Alternatives

A. Recommended preservation above: one property becomes string, finite named alias/override retained.
B. Keep finite declarations by explicitly rejecting unknown/empty environment strategies. This changes factory successes and the timing of existing constructor errors, and may remove successful explicit-credential construction. It is a behavior decision, not an internal typing fix; exact native successes must be disclosed before choosing it.
C. Keep AdapterOptions finite but add a separate environment-result type plus constructor union. This can preserve runtime but adds more public surface and still broadens constructor accepted type. Prefer A unless an actual consumer constraint justifies C.

## Required evidence before presenting decision

Inspector original no-network native observer: known/unknown/empty strings; absent/nullish fallback; override priority; profile conditional property; region/pool/endpoint/strategy/profile getter ordering; unknown/empty constructor path with absent credentials and supplied object/provider; provider not called and identity preserved. Capture original emitted strict consumer proving the finite result mismatch. Keep factory observations separate from AWS service/credential acceptance, which is not tested.

After any approval: unchanged original tests plus exact native replay, alias/override finite negative consumer controls, widened Options/helper-to-constructor positive consumer, affected normal build/type/lint and official intended public API baseline. No runtime changes merely to make the type fix pass.

Prospective concise question, only after native evidence: “Approve the bounded Cognito admin strategy correction: preserve arbitrary environment strings by typing the adapter option as string, while retaining the finite named strategy and explicit override types?”

No approval receipt, generated workflow, publication, formal DEVAI acceptance, #211 or downstream DETRAN/PORM disposition is included. All prior approvals and pending0043/0044/0045 remain unchanged.
