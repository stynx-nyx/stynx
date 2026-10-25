---
adr_id: ADR-DEVAI-ADOPTION-0042
title: Honest native i18n results and exact notification propagation
status: accepted
date: 2026-10-24
authors: ['Architect']
tags: [stynx, i18n, notifications, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0042 — Honest native i18n results and exact notification propagation

**Status:** Accepted on 2026-10-24; implementation and independent verification remain pending. Native formatter, production-chain, dispatch and existing native-adapter observations below are completed; implementation equivalence and combined qualification are not claimed. The proposal filename and evidence are retained.

**Authority:** The Owner answered **“Approve the bounded native i18n correction”** for this exact proposal. This accepts the enumerated unknown result and notification adapter-port corrections, their preserving caller migrations and exactly two private native SDK boundaries. It adds no unsafe-rule exception, arbitrary native forwarding, live AWS action or wider input correction. Release classification/publication, formal DEVAI acceptance, #211 and downstream DETRAN/PORM remain separate.

## Existing authority and genuine gap

[ADR0028](2026-10-23-s10-typed-query-adoption.md) requires honest strict boundaries while preserving behavior. [ADR0033](2026-10-23-s10-generic-boundary-disposition-proposal.md) permits exactly two testing-helper assertions and a bounded browser correction; neither covers backend ICU return values. The result corrections in [ADR0032](2026-10-23-s10-public-representation-proposal.md), [ADR0034](2026-10-23-s10-audit-outbox-result-proposal.md) and [ADR0039](2026-10-24-s10-audit-opaque-result-proposal.md), and the Offline contexts in [ADR0041](2026-10-24-s10-offline-hook-context-proposal.md), retain their exact scopes. Those prior decisions did not cover the public i18n and notification contracts below; the exact new Owner approval recorded here supplies that bounded authority. No prior approval is widened and this decision adds no unsafe-rule exception.

CatalogService.translate accepts `Record<string, unknown>` variables and forwards the native formatter result unchanged through two unsafe `as string` assertions. LocaleService and ErrorTranslatorService forward that same value, while their declarations and core ErrorTranslator promise string. NotificationTemplateRenderer likewise forwards translations into string-declared RenderedContent and ChannelSendInput fields. This is an actual public type contradiction, not a missing cast or ordinary malformed-row refusal.

## Verified evidence and limits

The actual i18n package declares intl-messageformat `^11.2.8` and resolves **11.2.14**. The separate lock entry 10.7.18 is not its package-root resolution. The native declaration returns `string | T | (string | T)[]`; with the existing unknown variables and callbacks, an unconditional narrower output is not justified.

Inspector evidence under `/tmp/stynx-i18n-native-inspector-20261024/`, preserved under `inspector/i18n-native-20261024`, includes:

- `native-formatter.json`: 40 observations using the genuine package-root constructor. Simple interpolation preserves object/array identity and can return true, symbol or function; rich callbacks can return arbitrary primitives, null/undefined/bigint, objects and cycles. Mixed parts can be arrays. Callback errors retain identity.
- `production-chain.json`: fresh normal emitted i18n and notifications, no formatter test aliases. 66 matrix observations through Catalog → Locale → ErrorTranslator, four error/missing-key controls, and tenant admission before variable reads. Exact and en-US fallback paths preserve native values.
- 33 renderer observations plus two error controls. Subject or explicit title paths can forward rich values; original body-only truncation sometimes succeeds (including arrays) and sometimes throws. Neither string coercion nor universal refusal describes the old behavior.
- 12 observations through both actual error filters and native Express `response.json`, with a controlled ArgumentsHost and logger. This is not a full Nest-controller/PG proof. Object/array messages serialize; undefined/symbol results omit message; bigint/cycles retain TypeError serialization failure. Core logs before serialization; localized filter logs after it.

The completed `notification-boundaries.json` adds 22 actual SES/SNS adapter/serializer observations using native SDK clients and controlled local request handlers: object/array/boolean/bigint/symbol/function/cycle values reached the handler as serialized strings; null/undefined omitted the body field. These observations establish native serialization and adapter behavior, **not AWS service acceptance or live calls**. Eleven native `pg.prepareValue` observations show object→JSON text, array→PostgreSQL array text and primitive→text behavior, with cyclic-object failure. The current converted InApp adapter accepts string only and rejects the other ten observed cases before query; that is contrasted against the captured historical raw binds, not treated as the old behavior.

`notification-dispatch-admitted.json` adds 12 actual dispatch observations (six JSON-reachable values × email/inapp): the custom adapter receives the exact rendered values through the checked claim/persist path. An initial observer omitted actorId and correctly hit admission failures; its evidence is retained, and only that observer was repaired to an admitted context. No production admission was weakened.

All 16 tracked sources in that observation snapshot were unchanged. The ordinary/int/stryker i18n configs currently alias a stub that String-coerces substitutions. Their existing cases remain valuable for their asserted behavior but cannot substitute for native ICU evidence. Preserve them and add genuine native coverage; do not delete assertions or claim that stub success validates arbitrary native results.

## Accepted exact public correction

Use **unknown** for the native translation result. An invented scalar/array union would exclude observed functions, symbols, bigint, undefined or future callback values already permitted by the current variables contract. `string | unknown | unknown[]` is merely unknown; no caller-selected generic is proof of a result.

Change only these public result/propagation declarations:

1. `packages/i18n/src/catalog.service.ts`: CatalogService.translate return `unknown`, remove its two string assertions.
2. `packages/i18n/src/locale.service.ts`: LocaleService.t return `unknown`.
3. `packages/i18n/src/error-translator.service.ts`: ErrorTranslatorService.translate return `unknown`; `packages/core/src/tokens.ts`: ErrorTranslator.translate return `unknown` so the actual implementation remains honest. Existing string-returning translators remain valid implementations.
4. `packages/notifications/src/templates/types.ts`: RenderedContent `subject?: unknown`, `body: unknown`, `inAppTitle: unknown`, retaining actual required/optional keys.
5. `packages/notifications/src/adapters/channel-adapter.ts`: ChannelSendInput `subject?: unknown` and `body: unknown`, because the actual dispatch passes those rendered values to the adapter. This is explicitly an adapter-port input correction as well as a result correction, not an unnoticed widening. Other ChannelSendInput fields and ChannelSendResult remain unchanged.

These names are already exported. Consumers that require strings must narrow at their own semantic boundary. Existing string construction remains possible; unconditional string operations on these outputs cease to typecheck. Do not add a public arbitrary native-invocation helper, unchecked generic formatter overload, string coercion, forced JSON normalization or optional decoder that preserves an unconditional string promise.

The following **inputs stay unchanged**: translation key/locale/vars/tenant arguments, string catalog registration and override contracts, NotifyRequest, NotificationTemplate, recipient/channel/options inputs, provider response contracts and persisted/read InboxItem text fields. No Angular i18n API is included. No dependency upgrade, endpoint, storage DDL, new grant or delivery mechanism is authorized by this proposal.

## Runtime and caller implementation constraints

Preserve native formatter construction and exact/fallback/missing-key branches, ICU errors and callback error identity, opaque references, context admission, locale selection and caching. No preformat traversal of unknown variables or serialization is added.

The two existing filters may forward unknown message values through their existing body/logging calls. Preserve message key presence before serialization, serializer omission/failure and each filter's existing logging/HTTP order. Do not manufacture a string error-message guarantee, normalize failures, or change global generated error schemas without separately proving an actually affected declaration. No official API/SDK generation is inferred solely from an internal anonymous error body.

Notification renderer retains required-variable admission, subject → body → explicit-title/fallback evaluation, exact undefined-subject omission and nullish subject fallback. Its private truncation boundary must honestly operate on unknown while reproducing the original property reads, comparison, slice call receiver, coercion and native errors; it must not introduce an eager `typeof value === 'string'` refusal. In particular, short array/object/function values with suitable length may remain values, ordinary objects without usable slice can fail, and custom getter/call errors remain in their original order. A private bounded property/call adapter may establish only the operations actually performed, never claim a full string. Inspector must cover these branches before accepting the implementation.

Dispatch preserves the exact content fields/identities and existing recipient construction, adapter selection, try/catch, error classification, retry/persist and PII-safe logging order. Custom adapters receive the same runtime values and now see honest unknown declarations. Built-in adapters retain their current configuration/address refusal and circuit/timeout behavior.

### Exactly two native provider interop boundaries

SES `EmailSesChannelAdapter.sendEmail` and SNS `SmsSnsChannelAdapter.publish` currently pass the rendered values into the native SDK constructor. Native observation confirms serialization beyond the declared SDK string input. Preserving those values requires honest dynamic interop, not a false SDK input type; local serializer success does not establish vendor-service acceptance.

A permitted implementation shape keeps **arguments, actual constructed command and awaited response unknown** across an exact private call to the statically imported SendEmailCommand or PublishCommand and that adapter's actual client.send receiver. It may use native Reflect.construct/Reflect.apply while retaining the original receiver, evaluation order and original command instance. It must never assert or predicate that unknown inputs satisfy SendEmailCommandInput/PublishCommandInput, expose command.input as typed strings, use a replacement command/client, or claim that a class-instance check proves input fields. Validate only response fields actually consumed when deriving the unchanged ChannelSendResult; do not inspect ignored response fields or introduce gratuitous guards/errors. Keep original truthiness/default behavior for consumed optional values where valid native output permits it.

This is an exact two-site private external-library boundary, not a generic constructor/method registry or permission to invoke STYNX typed callbacks reflectively to conceal a false contract. Static/census controls must refuse substituted constructors, methods, arbitrary forwarding, public export and casts. Native serializer and error identity must match the existing ordinary constructor/send path under no-network tests before acceptance. No live AWS invocation is required or authorized by this proposal.

### In-app bound values

The historical `d1287704` InAppPostgresChannelAdapter passed `input.subject ?? ''` and `input.body` directly as bound values $6/$7 to the unchanged INSERT. The new checked repository currently constrains both to string; this is not evidence that earlier native-rendered values were rejected. Preserve the original bound value identity and PostgreSQL-driver preparation/errors rather than normalize them in the renderer. The captured original path and native pg preparation confirm that these **two existing parameter slots only** require honest unknown schemas to preserve the driver domain; all other parameter validation, static SQL, no-return cardinality, tenant/RLS and transaction checks remain. This internal C+D regression repair is already within ADR0028 behavior-preservation authority and does not depend on a new public decision. Preserve native `toPostgres`, coercion and error behavior; do not replace it with renderer normalization. This creates no SQL-text interpolation or raw execution exception. Stored/read title/body remain governed by the actual text columns and their checked result schemas.

## Selected decision and preserved alternatives

- Selected: honest unknown output/adapter-port types with the exact preserving migrations above, under the Owner answer recorded here. This is a real public compile-time correction; release classification remains separate.
- Restrict vars/results to strings or primitives, coerce/join output, or reject rich results early: changes currently successful inputs/values and is not the preservation design. It would need an explicit different behavioral decision; not selected by this decision.
- Not selected: add an unsafe assertion exception. This is not covered by F2 or this decision. Do not silently retain the two formatter casts or move them to a helper.
- Historical alternative, not selected: defer this correction. Independent approved C+D work continues, but this boundary remains incomplete until implemented and verified and cannot yet be reported as strict closure.

## Validation and completion

The bounded no-network native notification adapter/caller observation packet is complete as described above. Before implementation acceptance, compare the accepted fixed native interop implementation against the original path; preserve existing test populations and add genuine native formatter/chain/serializer/renderer/provider/PG-parameter regressions. Test constructor identity, exact caller closure, argument/error identity, ignored-field nonaccess and circuit/timeout/error precedence; no arbitrary native forwarding route.

Emitted strict consumer tests must retain string implementations/construction, require narrowing for unknown result/content fields, preserve all unrelated public input types, and demonstrate no unconditional string proof. Existing stub tests remain, with native tests independently wired into required gates. Run targeted strict/type/runtime checks, review the final emitted API delta through the official procedure and perform combined C+D qualification. Design acceptance is not implementation or a passing RC. Formal DEVAI acceptance, publication/release classification, #211 and downstream DETRAN/PORM remain separate.

## Accepted bounded decision

The decision authorizes honest unknown native i18n results and their exact core translator/notification result-and-adapter propagation, including the two fixed private native SDK boundaries needed to preserve actual runtime behavior. The separate internal restoration of the two existing in-app bound-value slots remains within existing preservation authority. Keep all other input APIs, values/identity, existing successful native behavior, serializer/provider/database errors, transaction safeguards and delivery ordering unchanged. No new unsafe exception, live AWS action, publication or downstream acceptance is included.
