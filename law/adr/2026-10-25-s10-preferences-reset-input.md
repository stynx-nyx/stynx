---
adr_id: ADR-DEVAI-ADOPTION-0049
title: Honest Preferences reset category input
status: accepted
date: 2026-10-25
authors: ['Architect']
tags: [stynx, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0049 — Honest Preferences reset category input

## Operative acceptance — 2026-10-25

The Owner answered **“Approve the bounded Preferences reset input correction”** for the exact reviewed proposal preserved below. Accept only the first public `PreferencesService.reset` parameter changing to `string | null`. Preserve the original controller/custom-subclass forwarding and receiver/order, base membership refusal with status 404, remaining parameters, inputs and result contracts.

This records accepted design and implementation authority only. It does not claim completed implementation, independent verification, final API/trace binding, signed RC or integration. The proposal's exact scope, preservation requirements, explicit selected changes, exclusions and verification obligations remain binding. Unselected alternatives are not authorized.

Earlier ADR0028–0042 retain their own scopes, including the exact two-site F2 exception. The other ADR0043–0052 decisions were also answered in this batch and retain their separate scopes; historical pending-language below does not revoke those answers. Release classification/publication, formal DEVAI acceptance, #211, and downstream DETRAN/PORM acceptance remain separate. This record creates no workflow/forbidden-action receipt and grants no unrelated exception.

## Reviewed proposal custody

- Original reviewed packet: `/tmp/stynx-preferences-controller-inspector-20261025/proposed-adr0049.md`.
- Original SHA-256: `3a232a6485308e7c3101d0b0ec6868cf08a70f8531b89b39f8746902bd3c0997`.
- Exact answer source: `/tmp/stynx-owner-approvals-0043-0052-20261025.json`, a root transcription of the direct human answers; SHA-256 `c033712470dffb379e05b757cc9f1e376e2e5105b61dfe06014f794068757ead`.
- The complete original packet, including any original frontmatter, is retained in the external ratification packet's `preimages/proposed-adr0049.md`.

## Historical reviewed proposal — operative status superseded

The following reviewed body is retained as proposal evidence, with formatting-only normalization for the repository Markdown contract. The exact original bytes remain in the custody preimage. Its proposed/unapproved/pending status, allocation checks and suggested questions describe the pre-decision snapshot. They are superseded by the operative acceptance above. Its concrete contract, implementation constraints and validation obligations apply to the selected decision; historical observations remain observations, not post-change qualification.

# Prospective ADR0049 — Honest Preferences reset category input

PROPOSED, external only,2026-10-25. No Owner answer or implementation release. Pending0043–0048 are independent; recheck the live index/allocation before governed materialization. No repository writes/checks/builds in this review.

## Exact recommended correction

Change only the first public parameter of PreferencesService.reset from `PreferenceCategory | null` to `string | null`. Preserve expectedRevision, optional/default scope, Promise<PreferencesDocument>, every PreferenceCategory/PreferenceValues/patch/store contract, controller route and response. Remove the controller's `category as PreferenceCategory` and retain the direct `this.preferences.reset(category, this.revision(ifMatch), this.scope(request))` invocation. Do not guard the category in the controller, capture/reorder the method call, or use `.call`/a generic unknown bridge.

The base service continues its existing membership check and PREFERENCES_CATEGORY_NOT_FOUND404 for unsupported strings, including empty string, at the original point after default scope evaluation. Null still resets all categories. This broadens the declaration to the input domain the public controller already forwards; it does not make arbitrary categories valid in the base implementation or change the finite named category type.

## Concrete original evidence

`/tmp/stynx-preferences-controller-inspector-20261025/{summary.json,native-result.json,emitted-consumer-result.json,emitted-consumer.mts}`. Eleven actual original public-barrel native observations; four relevant existing tests PASS (six unrelated tests were filtered/skipped, not a full-suite claim). Actual TS6 emitted consumer has zero diagnostics and includes both real controller/service declarations. A legitimate subclass overriding reset(category:string|null) is assignable to PreferencesService and receives 'extension' and '' from the original public controller, returning the same PreferencesDocument successfully. The base declaration rejects the same direct arbitrary-string call at compile time, while its actual implementation already checks membership and raises404.

Source hashes: controllerca6063a620428f66e8de89ccb1960f95b16c30b044be8e3661d668868082aab3; service109cb95f67c8de111b98fd3728145ad1ac80a197f2bf504306800b603ce7057d. Original emitted controller declaration8f08a57cbc4b32b3ea5880441829e724ab042e9dd886969d1b94bcd338f43ef7; service declaratione3e7082e1e9b7f68c9c5ac8195da1c1c7fdfef7d3afe10565a9ff4183a68853f. Native JSON evidence binds emitted JS too.

Preserved order: query ownKeys, reset method Get, revision evaluation, request claims/sub/tenant Gets, invocation with original service receiver, then ETag. A throwing reset getter prevents scope reads. Invalid revision fails before scope; scope refusal precedes base category refusal. An own `reset.call` getter is untouched by the original direct invocation. Unsupported number/class method observations are retained as observations, not new public callable guarantees.

## Minimal implementation bounds

Owned source paths are packages/preferences/src/preferences.service.ts and preferences.controller.ts. No other production/reference call sites were found beyond the controller's null reset and string category reset; external subclass/direct consumers remain relevant.

Keep the existing includes operation and original category list. A checked structural readonly-string view of that same array can accept a string parameter without an enum assertion; it must not freeze/copy or substitute a hardcoded predicate. A structural `Record<string,unknown>` view of the already typed cloned PreferenceOverrides can support the same delete at the same position without claiming category is a finite enum. No new runtime guard or Reflect invocation is needed. Verify actual TypeScript assignability; do not force it with an assertion/overload if the compiler disagrees.

Specific preservation caveat: the current category array can be passed as changedPaths to the existing audit sink on whole reset. Do not replace the dynamic membership check with a supposedly immutable finite-key proof, change that sharing, or broaden this proposal into audit/event behavior repair. The proposed reset input type does not require a finite-category proof after membership: the implementation only deletes that supplied key and forwards the existing path/action strings.

Keep all existing default scope, read/clone/delete/mutate/revision/event behavior and native failures. Do not admit number/object/unknown category inputs; string|null is the exact correction. No result/type weakening, input schema regeneration or generic SDK result correction is included. The controller already declares a string path parameter, so official route input semantics need not change; confirm writer/emitted comparison later rather than hand-edit generated output.

## Compatibility, alternatives, validation

A direct typed base.reset('extension',...) now compiles and still returns the same404. Wider existing subclass overrides continue to work; narrower existing finite-category overrides remain subject to ordinary TypeScript override compatibility and must not be silently rewritten. Measure real emitted assignment examples for both. All successful supported category/null behavior is unchanged.

Alternative: validate finite categories before calling the service from the controller. This would reject the proven legitimate subclass 'extension'/empty-string successes and change method/scope/refusal ordering. That is a different behavior-change decision and is not the recommendation. A Reflect.apply route to evade the false typed parameter is unnecessary and not approved.

Inspector retains all11 observations and existing4 assertions, adds the now-accepted direct string input consumer with unchanged404, finite and wider subclass assignment controls, and exact before/after method/receiver/error/ETag parity. Keep result/input models otherwise identical. Architect reviews the single intended emitted service parameter delta in the final official API baseline after stable build; ordinary full gates/RC remain required.

Suggested Owner question: **Approve the bounded Preferences reset input correction—accept string|null in the service declaration while preserving base membership404, custom subclass forwarding and all existing behavior?** Suggested answer: **Approve the bounded Preferences reset input correction**.

This public input declaration correction is not automatically authorized by browser ADR0033 or other named result approvals. No implementation is applied before the answer. #211, formal DEVAI acceptance, DETRAN/PORM, release classification/publication remain separate. Additional Graft calls for0049:0 (this turn's total remains2/~124400 estimated tokens saved).
