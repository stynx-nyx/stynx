---
adr_id: ADR-DEVAI-ADOPTION-0039
title: Honest audit opaque read results and JSON wire projection
status: accepted
date: 2026-10-24
authors: ['Architect']
tags: [stynx, audit, types, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0039 — Honest audit opaque read results and JSON wire projection

**Status:** Accepted on 2026-10-24; implementation and independent verification remain pending. The original proposal filename and evidence are retained.

**Authority:** The Owner answered **“Approve the bounded audit result corrections”** for this exact proposal. The selected decision covers only the six audited read-result fields and their official legacy HTTP/OpenAPI/SDK propagation below. Existing ADR0032/0033/0034 approvals remain accepted and unchanged. Release classification, publication, formal DEVAI acceptance and downstream DETRAN/PORM acceptance remain separate.

## Original authority finding and supplemental decision

ADR0032's six families do not include audit. ADR0033 B1's four audit browser calls use curated `/audit/events` and its authoritative `before`/`after` object declarations; the record explicitly separates that endpoint from `/_audit/log`. ADR0034 accepted decision item1 and its affected-field list name audit `occurredAt` and its HTTP projection only. The exact answer “Approve the three bounded result corrections” does not grant every result-field change in those packages. ADR0029 allows the existing configured audit read family and requires opaque payload preservation, but it does not turn an inaccurate exported Record declaration into proof or grant a blanket public API correction.

Consequently internal preservation of actual opaque values is already required, but changing the exported guarantees below is now authorized by this bounded supplemental disposition. No new approval is needed merely to implement existing guards/SQL shapes, prepare the proposal or continue independent work.

## Actual return-path census

| Public result field                   | Concrete return path and current mapper                                                                                                                            | Evidence / implication                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuditSqlListItem.oldData`, `newData` | `AuditSqlReader.list`: PORM and stynx_events use `row.old_data ?? null` / `row.new_data ?? null`; audit_log uses `row.payload?.old ?? null` / `.new ?? null`       | Optional `Record<string,unknown> \| null` declarations are too narrow for preserved JSON scalars and arrays. PORM baseline actually observed these values; other mode paths follow the same exact source forwarding.                                                                                |
| `AuditSqlListItem.pk`, `metadata`     | stynx_events uses `row.pk ?? null` / `row.metadata ?? null`; audit_log metadata is a newly constructed object `{tags: row.tags ?? {}, payload: row.payload ?? {}}` | stynx_events JSONB columns lack object-only constraints and mapper forwards values; actual adjacent reader observations passed. The audit_log wrapper itself remains an object even when its nested unknown values are scalar/array: no extra wrapper correction. PORM does not return pk/metadata. |
| `AuditLogItem.tags`, `payload`        | `StynxAuditService.listLog` → private `mapLogRow`: `row.tags ?? {}`, `row.payload ?? {}`                                                                           | Non-nullish JSON scalars/arrays are forwarded unchanged; null/undefined become fresh objects exactly as before. DDL declares JSONB, without object-only CHECK. Actual service and Nest observations passed.                                                                                         |
| `AuditLogWireItem.tags`, `payload`    | Real Nest `GET /_audit/log`, explicit `@stynx-json-response-type AuditLogWirePage`                                                                                 | Same values pass through existing JSON serialization. Wire declaration must describe actual serialized JSON (including serialization null where supported); no new mapper or custom serializer. Actual Nest observations passed.                                                                    |

The exact source locations are `packages/audit/src/sql-adapter.ts` exported item and methods `listAuditLog`, `listStynxEvents`, `listPormLoggedActions`; `packages/audit/src/types.ts` LogItem/WireItem; `packages/audit/src/audit.service.ts` mapLogRow; platform `packages/data/migrations/platform/0008_audit.sql` audit.log/events definitions. The existing SQL function accepts JSONB old/new values, and current source DDL has no object-only predicate for these columns. No SQL/DDL change is proposed.

### Explicit exclusions

- Exported `AuditEvent` in audit/types.ts has no repository method return or production consumer found by the targeted source census. Its similar oldData/newData names are insufficient grounds to widen it. Leave it unchanged.
- `AuditEventEnvelope`, AuditSink/write/writeInTransaction, all other write/request inputs, and their existing JSON.stringify/truthiness semantics remain unchanged.
- Angular AuditEventSummary/Detail and curated `/audit/events` before/after/metadata remain unchanged. No evidence connects those host routes to these raw adapter results.
- Existing timestamp corrections, ID/count Number conversions, cursor JSON/null forwarding, SQL filters/parameter order, RLS/context, result defaults and errors remain unchanged. No archive public-type correction or additional SQL exception.

## Concrete minimal choices

### Selected: honest result unions, original runtime preserved

Correct only the affected result fields above. The accepted direct-result domain is `Record<string,unknown> | unknown[] | string | number | boolean`; add null/optional exactly where the old named construction allowed it or the mapper returns it. This preserves all previously permitted Record construction without pretending recursive consumer payloads have a newly known business shape. Existing nullable old/new/pk/metadata fields retain optionalness and null; LogItem tags/payload remain present and use their existing nullish-to-object fallback.

Do not replace the old Record construction domain with a recursively restrictive JsonValue type: Record<string,unknown> may contain opaque extension values, and existing approved work preserves those identities. Validation should establish the admitted top-level representation while preserving opaque nested values, not clone/strip/coerce them. Do not add a numeric finiteness limit based on timestamp rules; JSON numeric conversion is a different path. An exotic configured parser result outside the measured/source-supported domain must be reported, not asserted into this union. This top-level domain is not a recursive assertion of JSON purity.

For the wire fields, describe **serialized JSON**, not the direct opaque objects: objects/arrays, string, number, boolean and null, recursively using JSON values. The current emitter already maps nested `unknown` to its existing JsonValue component and understands arrays/unions. Prefer the existing JSON component/projection where it can express this exact domain; no new UnknownJson escape, manual schema or emitter bypass. Direct Record construction must continue to allow nested Date/undefined and keep their identity. HTTP observes normal Date→ISO, undefined object-property omission and numeric Infinity→null; these are existing serializer effects, not transformations to add in the service. Old generated object/array JSON construction remains possible; callers must narrow a result that can now be scalar. The newly introduced Wire source declaration describes output and does not broaden any input contract. Its optional property markers must remove only tags/payload from the generated required list; `objectSchemaFromMembers` already derives requiredness from TypeScript questionToken. Preserve cyclic-value, BigInt and throwing-toJSON serializer failures at the existing HTTP layer; do not eagerly serialize or pre-reject those opaque direct values. The successful wire domain is JSON, while serialization can still fail. Stock PostgreSQL JSON parsing alone is not a guarantee for every existing supplied executor/opaque result domain.

`AuditSqlListItem.oldData/newData/pk/metadata` keep their optional named-object construction and explicit null branch. Actual mapped values have null for absent/nullish fields. `AuditLogItem.tags/payload` keep their required keys, admit the direct non-null union and retain nullish→fresh independent `{}` defaults. `AuditLogWireItem.tags/payload` become optional output properties whose present values admit the JSON wire domain including null. Direct opaque Record values can carry `toJSON`: an undefined/function/symbol result causes JSON object-property omission, while scalar/null results are serialized normally. This is existing serializer behavior, not absence of the required direct service keys. No null-to-object normalization or forced property retention is added after serialization. Validation of fixed row fields remains mandatory; opaque nested values are neither cloned nor recursively rejected.

A result may no longer be assignable to a Record-only consumer or write envelope without narrowing. That is the explicit compile-time consequence; all previously valid object construction remains possible. Release classification remains separately reserved.

### Historical alternative — not selected: retain the declared shape and defer

Keep the existing raw adapter implementations and disclose that the affected static conversion/strict typing work remains incomplete. This does not make SM09/SM11 or the final C+D candidate complete and creates no new exception. It permits independent work to continue, but does not satisfy the remaining goal by itself.

Rejecting scalar/array rows, coercing them to `{}`, wrapping them, recursive stripping, adding a cast, or treating them as malformed solely because of the old Record annotation would change successful behavior or launder the contradiction. An optional decoder cannot justify an unchanged unconditional Record result.

## Public/emitter/SDK blast radius

`AuditSqlListResult.items` inherits the four SQL-item corrections. Targeted source search finds no additional production direct consumer of AuditSqlListItem/Result outside their owning reader; external TypeScript consumers still require narrowing. These SQL-adapter result types are not the current generated legacy route schema.

`AuditLogPage.items` and `AuditLogWirePage.items` propagate tags/payload changes. Official API writer updates exactly the default primary/legacy snapshots and offline-e6/offline-ctg9 compositions if discovery confirms the same route inclusion. The existing official SDK single dual-composition generation then updates `AuditLogWireItem` and its schema in default and OfflineCtg9 trees; pages/services reference these models. Keep handwritten legacy `AuditLogItem`/`AuditLogPage` and schema aliases bound to the generated Wire identities, not duplicate types. No new endpoint, route annotation, generic transport change, manual generated edit or generator exemption is needed.

Current focused ADR0034 writer/SDK/emitted-consumer successes remain true for their then-current bytes; they do not verify this supplemental change. Rerun the targeted official writer/checks and a single dual generation after stable inputs, then emitted consumer/schema identity tests. Do not relabel old hashes as the new output.

## Completed observation evidence and implementation acceptance

Observed baseline: `/Users/aarusso/.local/share/stynx/consolidation-2026-10-23/inspector/cd-audit32-baseline-20261024/observations.json` and adjacent `observe.mjs`. The packet contains all 32 mask cases and 118 behavioral observations of actual emitted reader runtime, including PORM scalar/array/opaque old_data/new_data through accepted result wrappers. It is mocked executor behavior, not live PostgreSQL or downstream PORM acceptance. Malformed-input observations describe historical behavior, not automatic authority to accept every malformed row in a new schema.

The original118 packet did not cover adjacent fields. That gap is now closed by `packages/audit/test/wiring/audit-json-results.wiring-spec.ts`: **18/18 passed**, 143ms test time /2.057s outer, existing single-worker audit configuration. It invokes actual AuditSqlReader and StynxAuditService and real Nest `/_audit/log`, using a narrow mocked database transport and overridden guards. It proves:

- stynx_events pk/metadata/oldData/newData preserve object, array, string, number and boolean values/identity; null, undefined and absent fields map to null;
- listLog tags/payload preserve the same non-nullish forms/identity; nullish/absent fields become separate fresh `{}` values;
- real HTTP preserves ordinary legal JSON; nested Date serializes to ISO, undefined object properties disappear and nested Infinity becomes null while direct nested objects remain untouched;
- driver error identity is retained, and InvalidDate timestamp mapping still throws RangeError directly and becomes the existing HTTP500.

Logs: `/Users/aarusso/.local/share/stynx/consolidation-2026-10-23/inspector/cd-post-ab-focals-20261024/audit-json-adjacent-before.{json,stdout.log,stderr.log}`. This is actual source plus real Nest serialization over mocked transport, **not live PostgreSQL, RLS/auth acceptance or downstream PORM proof**. Top-level numeric sentinel serialization follows the same existing JSON rule; the observed adjacent sentinel was nested, so do not describe it as an executed top-level case. Preserve this distinction in any added implementation test.

Baseline custody and compile/import/provenance costs are recorded in `inspector/cd-audit32-baseline-20261024/baseline-summary.json`: original 32 filter masks and 118 behavior observations, actual audit/data compiles and imports, and three still-raw reader sites. The baseline is not a claim of strict-lint or static-conversion completion. Existing ADR0034 generated SDK/emitted-consumer 3/3 successes remain preserved evidence for their previous exact bytes.

Under the accepted decision, add emitted-public-consumer tests retaining old object construction, requiring narrowing for new scalars/arrays, preserving optional/null distinctions, and proving optional wire omission, preserved serializer failures, and write/curated frontend inputs unchanged. Preserve prior tests and all gate populations. Final baseline/RC remain later combined-C+D work.

## Authorized implementation and independent work

Engineer may implement the bounded result corrections and resume the reviewed exact32 SQL-definition tranche with its operation/caller and wrapper constraints. Do not impose an object-only payload schema or broaden any excluded type/input. Continue unrelated strict/provenance work under existing approvals. The result approval does not authorize speculative generation of the128/128/256 audit families or waive their baseline, provenance and measurement requirements. Official writer/checks and single dual-composition SDK generation follow stable source inputs; implementation, emitted consumers and final combined qualification remain pending.

## Original review question — selected by the recorded answer

Approve the bounded audit **read-result** correction: AuditSqlListItem oldData/newData/pk/metadata and AuditLogItem tags/payload admit the observed scalar/array/object forms with existing optionalness/defaults; the legacy AuditLogWireItem tags/payload and official generated SDK describe actual JSON serialization, including optional wire presence when an opaque value serializes to omission. Preserve opaque nested values and every existing SQL, runtime mapping/error, cursor, input and curated endpoint contract. Include only necessary official generation, caller narrowing and validation. Release classification/publication, formal DEVAI and downstream DETRAN/PORM acceptance remain separate.

The unselected alternative was to defer these exact result corrections and corresponding static conversions while continuing independent work, explicitly leaving that portion of SM09/SM11 incomplete. Neither option authorizes a new broad query or lint exception.

### Serializer-presence precision — verified actual Nest controls

The complete adjacent file now passes **23/23**, retaining the earlier18 cases and adding five serializer controls (1.899s outer, exit0). Actual listLog retains own tags/payload keys and exact opaque object identity without invoking its own toJSON. Actual Nest invokes that method twice: undefined removes both wire keys; null and a string serialize as returned. Direct cyclic and nested-BigInt objects remain unchanged; JSON.stringify throws TypeError and the actual route retains HTTP500. These are observed transport/serializer behaviors, not live PostgreSQL evidence.

Evidence: `/Users/aarusso/.local/share/stynx/consolidation-2026-10-23/inspector/cd-post-ab-focals-20261024/audit-json-serializer-controls.{json,stdout.log,stderr.log}`; actual test source `packages/audit/test/wiring/audit-json-results.wiring-spec.ts`. Function/symbol omission follows the standard serializer rule but is not claimed as an additional executed case here. A toJSON-thrown error also remains an existing serializer error, not a newly normalized result.

Therefore this proposal explicitly makes only **wire** tags/payload presence optional. Direct required-key/default semantics remain intact. This is the same two legacy-log result fields within the six-field audit correction, not another input, endpoint or permission expansion. The exact Owner answer above accepts this bounded correction; implementation and independent verification remain pending.
