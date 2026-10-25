---
adr_id: ADR-DEVAI-ADOPTION-0050
title: Honest i18n override results and cache propagation
status: accepted
date: 2026-10-25
authors: ['Architect']
tags: [stynx, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0050 — Honest i18n override results and cache propagation

## Operative acceptance — 2026-10-25

The Owner answered **“Approve the bounded i18n override correction”** for the exact reviewed proposal preserved below. Accept the exact recursive JSON override value/record representation, five named public override results, the named cache setter input, and two controller results with official OpenAPI/SDK propagation. Preserve catalog/register/update inputs except that exact cache handoff, native values and ordering. The separately described private disk ICU proof work does not widen public inputs.

This records accepted design and implementation authority only. It does not claim completed implementation, independent verification, final API/trace binding, signed RC or integration. The proposal's exact scope, preservation requirements, explicit selected changes, exclusions and verification obligations remain binding. Unselected alternatives are not authorized.

Earlier ADR0028–0042 retain their own scopes, including the exact two-site F2 exception. The other ADR0043–0052 decisions were also answered in this batch and retain their separate scopes; historical pending-language below does not revoke those answers. Release classification/publication, formal DEVAI acceptance, #211, and downstream DETRAN/PORM acceptance remain separate. This record creates no workflow/forbidden-action receipt and grants no unrelated exception.

## Reviewed proposal custody

- Original reviewed packet: `/tmp/stynx-i18n-public-result-inspector-20261025/proposed-adr0050.md`.
- Original SHA-256: `cab77731e8116d4f5bfbc87fa6812ee9237787a8d124cc9f425bfeab080c9895`.
- Exact answer source: `/tmp/stynx-owner-approvals-0043-0052-20261025.json`, a root transcription of the direct human answers; SHA-256 `c033712470dffb379e05b757cc9f1e376e2e5105b61dfe06014f794068757ead`.
- The complete original packet, including any original frontmatter, is retained in the external ratification packet's `preimages/proposed-adr0050.md`.

## Historical reviewed proposal — operative status superseded

The following reviewed body is retained as proposal evidence, with formatting-only normalization for the repository Markdown contract. The exact original bytes remain in the custody preimage. Its proposed/unapproved/pending status, allocation checks and suggested questions describe the pre-decision snapshot. They are superseded by the operative acceptance above. Its concrete contract, implementation constraints and validation obligations apply to the selected decision; historical observations remain observations, not post-change qualification.

# PROPOSED ADR0050 — Honest i18n override results and cache propagation

External prospective record, 2026-10-25. Not accepted or materialized in law. The live index ends at accepted0042; separately reserved pending0043–0049 remain unanswered. No implementation or approval follows from this draft.

## Decision requested

Approve the following exact result correction while preserving values, existing public inputs except the named cache handoff, native errors and ordering:

1. Add an exported recursive `I18nOverrideValue = string | number | boolean | null | I18nOverrideValue[] | { [key: string]: I18nOverrideValue }` and record-valued `I18nTenantOverrides = Record<string, I18nOverrideValue>` (equivalent existing genuinely recursive JSON type may be reused without changing its other uses).
2. Change exactly these five public Promise results from Record<string,string> to I18nTenantOverrides: CatalogService.tenantOverrides; I18nAdminService.listOverrides, listTenantOverrides, updateOverrides and updateTenantOverrides. All remain records, not whole-result unknown. Preserve key prefix filtering and the checked JSON row domain.
3. Change CatalogService.setTenantOverrides's overrides input to I18nTenantOverrides, retaining its void result and original shallow copy, context gate, virtual call and cache timing. This is an explicit additional public input widening necessary because primeTenantOverrides and I18nAdminService.update already call that overridable public method with the actual richer returned records. Do not bypass the method using a new private cache setter or cast its argument. Existing string callers remain valid; subclass declaration compatibility must be checked and documented.
4. Propagate those results through the two inferred I18nController methods and only GET/PUT /_tenancy/i18n/overrides response schemas. Run the official API writer and one normal dual-composition SDK generation for the affected operations/models, retaining error unions and all input models. Generated SDK files are not edited manually. No shared generic transport or global JSON alias redesign is authorized.

I18nCatalogMessages, StynxI18nModuleOptions.catalogs, registerCatalog, TenantOverrideUpdateInput.catalog and locale remain string-declared inputs; their valid calls and methods remain unchanged. This decision does not make rich values valid ICU messages or promise successful translation of every stored JSON value. The formatter retains its own current failures. ADR0042's already accepted translate/Locale/ErrorTranslator/notifications unknown results remain unchanged.

## Completed evidence and actual closure

`native.json` in this directory observes genuine normal emitted public exports, actual Transaction.run with complete query row/argument schemas over a controlled driver, installed native formatter and no network/DB. All five override methods return an object-valued prefixed key. Both update methods accept ordinary string-only updates, retain the untouched object key and unrelated settings, finish the write transaction, then call the original public cache setter. Roles reader/owner/app, readonly/replica flags and context ordering are recorded. `compiler.json` is actual TS6.0.3 strict public-package consumer evidence with zero diagnostics; all five results are currently assignable to Record<string,string> despite these native values.

Live caller closure: CatalogService.primeTenantOverrides → public tenantOverrides then public setTenantOverrides; I18nAdminService's two public list wrappers → private list, two public update wrappers → private update → public cache setter; controller's GET and PUT forward tenant methods. Existing installed/integration/unit callers also exercise context/cache behavior. Current official OpenAPI and SDK I18NService declare the two successful responses Record<string,string>; their exact correction is included. No other production consumer was found by graph search plus live source verification.

## Private disk ICU boundary, independently preserving

The same native packet proves workspace JSON string message `Hello Reader` and genuine ICU AST message `AST Reader` both succeed. The private loadJsonCatalog assertion and private string-valued catalogs therefore cannot be repaired by rejecting nonstrings without changing successful behavior. Use an honest private unknown message representation and exact fixed native IntlMessageFormat construction/formatting boundary, preserving original selection/truthiness, receiver, construction timing, errors and returned values. Do not assert that arbitrary JSON is a valid ICU AST, add a global native-forwarding helper, or normalize a message. This private behavior-preservation work does not widen public registration/update/catalog options. The implementation must prove native instance/result handling honestly and preserve native malformed-message errors; no generic assertion is authorized.

## Alternatives, impact and acceptance

Recommended: the exact result/cache declaration correction above. A string-only guard, dropping rich prefixed entries, JSON/string coercion or restricting existing settings rows would remove completed native successes and is not this proposal. Retaining the casts as another exception is also not authorized. Deferral leaves this strict/public boundary incomplete while independent work continues.

Existing consumers assuming string values must narrow; emitted controller/SDK return types change. Existing input and successful runtime behavior is retained, but public cache setter now explicitly accepts the already propagated JSON domain. Validation must preserve all existing tests and the five native traces, string-only input assignability, cache subclass dispatch, context-before-read, transaction-before-cache-write, native disk AST/string behavior and native error identity/order. Add real emitted consumers requiring result narrowing and accepting prior string callers; review only intended declarations and official outputs. No additional broad native matrix is required before asking this bounded decision; implementation equivalence remains required afterward.

Question for Owner: “Approve the bounded i18n override result and cache correction?” Exact suggested affirmative: “Approve the bounded i18n override correction”.

No release classification/publication, formal DEVAI acceptance, #211 action, live downstream acceptance or DETRAN/PORM change is included. No Owner answer has been received.
