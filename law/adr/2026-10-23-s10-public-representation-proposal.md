---
adr_id: ADR-DEVAI-ADOPTION-0032
title: Honest public PostgreSQL result representations
status: accepted
date: 2026-10-23
authors: ['Architect']
tags: [stynx, data, types, compatibility]
---

# ADR-DEVAI-ADOPTION-0032 — Public result representations

**Status:** Accepted on 2026-10-24; implementation and independent verification remain required. The original proposal date and filename are retained for provenance.

**Authority:** On 2026-10-24 the Owner answered **“Approve result type corrections; assess release separately”** for the bounded result families below. This approval is separate from ADR0030's pool/marker changes and ADR0031's two generated-output deferrals; their existing approvals remain intact. Internal behavior-preserving schema corrections continue independently.

## Decision

Implement the bounded public result type corrections below, retaining existing runtime values, accepted construction forms, SQL, normalization paths, null/fallback semantics and errors. Use honest unions and operation-specific validation rather than converting values to fit an inaccurate existing declaration. Public callers may need narrowing after the emitted declarations change; release classification remains separate. No publication, new SQL exception, expanded input domain or downstream DETRAN/PORM acceptance is authorized. Supplemental ADR0034, direct raw retirement results, append-result metadata and the later archive metadata/generic-result findings are not added to this approval.

## Evidence and limits

Inspector observed PostgreSQL 18.6 with the installed stock pg parser and actual generated repository create/get calls. Temporary observations are `/tmp/stynx-inspector-scalar-observation.json` and emitted declarations `/tmp/stynx-inspector-generated-timestamp.d.ts`; these are review artifacts, not durable repository proof or a passing final candidate.

- Int8 `9007199254740993` returns the exact decimal string, beyond JavaScript's safe integer limit.
- Ordinary timestamptz returns a Date retaining milliseconds; SQL null returns null.
- PostgreSQL positive/negative infinity returns numeric positive/negative Infinity.
- Finite PostgreSQL year 294276 returns an Invalid Date object, because PostgreSQL's finite range exceeds JavaScript Date's representable range.
- The actual generated repository create/get paths preserve these five timestamp forms, while its clean emitted declaration still says `created_at: string | null`.
- Existing idempotency `Date.parse(String(value))` loses the observed Date's 789 milliseconds and produces NaN for Invalid Date/Infinity. Replacing it with `getTime()` would change behavior.

Auth, inbox, jobs and outbox mappings were inspected in source but have not all been independently exercised through their exact public adapters by this observation packet. Their focused regressions remain required before acceptance. Sources and operation-specific normalization details are inventoried in `/tmp/stynx-engineer-representation-inventory.md`; durable tests and final emitted declarations must replace reliance on temporary artifacts before closeout.

## Accepted representation contracts

For raw timestamp result fields, use a named documented result type equivalent to `Date | string | number`, preserving existing Date/string construction forms. The numeric branch denotes only numeric positive/negative Infinity at the database-result validation boundary; TypeScript cannot express those two numeric literal types separately. The validator accepts `value instanceof Date` (including Invalid Date), strings from existing configured parsers/ports without imposing a new finite `Date.parse` restriction, and exactly `value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY`. Arbitrary finite numbers, NaN and unrelated objects do not become timestamp results. Keep null only where already nullable and keep existing optional property construction forms; do not synthesize omitted fields or remove own null properties.

This is a representation guarantee, not a finite-instant guarantee. Do not replace it with `z.date()`, coerce to ISO, clone or repair invalid Dates, add a database CHECK, or reject a previously valid driver row to force a narrower public type. Existing operation-specific normalizers and domain checks remain authoritative.

| Exact public family                                                                                                                                                                                     | Bounded correction                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/auth/src/permission-query.service.ts`: `ResolvedPermissionState.generation` and `probeHash` result generation                                                                                 | Widen from number to `string \| number`; preserve exact bigint decimal strings, numeric fallback `0`, and existing legitimate numeric configured-parser results. Do not round, stringify fallback, impose a new safe-integer ceiling, or alter the two SQL statements. Type validation must not silently normalize representation; existing database/domain constraints remain in force. |
| `packages/notifications/src/types.ts`: `InboxItem.createdAt`, optional `readAt` and `dismissedAt`; `NotificationInboxService.list`                                                                      | Use the raw timestamp result union, adding null to the two nullable optional fields. Preserve optional construction, own-null returned fields and row values. Do not change HTTP/input DTOs or unrelated `DeliveryRecord`/`DispatchClaim` declarations without an actual affected return path.                                                                                           |
| `packages/outbox/src/types.ts`: legacy `OutboxRow.ackTime`, `nextAttemptAt`, `createdAt`, `updatedAt`                                                                                                   | Use the raw timestamp union with the existing nullability. Preserve the legacy direct projection and the separate event-dispatch adapter's explicit ISO output. Do not remove previously valid string construction forms or normalize the legacy mode.                                                                                                                                   |
| `packages/cli/src/generate-module.ts`: generated entity record result fields of type timestamptz                                                                                                        | Emit the honest raw timestamp result union, retaining nullable fields. Keep timestamp HTTP input DTOs as strings, ordinary blueprint acceptance and direct repository runtime unchanged. This removes the representation blocker to separately eligible static list/get/delete; ADR0031's partial-write/adoption deferrals remain in force.                                              |
| `packages/jobs/src/types.ts`: `JobRecord.runAt/lockedUntil/startedAt/finishedAt/createdAt/updatedAt`; `ScheduleRecord.nextRunAt/lastEnqueuedAt/createdAt/updatedAt`                                     | Correct raw database result fields to account for numeric infinity, Invalid Date and existing parser representations, preserving field nullability and original Date construction. Scheduling/enqueue input contracts and later domain/time arithmetic are not widened or normalized.                                                                                                    |
| Modern outbox raw results: `OutboxEventRow.createdAt`, `OutboxEventSummary.createdAt`, delivery `nextAttemptAt/leaseUntil/updatedAt`, attempt `leasedAt/completedAt`, and raw cursor/health projections | Correct only raw returned timestamp fields and derived raw values. Preserve nullability, existing Date construction and method-specific transformations. Do not broaden existing Date-only request contracts merely because a returned field shares an interface today.                                                                                                                  |

An already mapped field stays mapped: retirement JSON uses `new Date(...)`, so `OutboxEventRetirement.retiredAt` remains Date (possibly Invalid Date under its existing mapper), not a newly raw timestamp union. Event-mode dispatch's `.toISOString()` remains explicit. Health aggregate and cursor paths require source-by-source review: distinguish a raw timestamp projection from a number/date calculated by existing logic before widening the exported field.

`OutboxEventListCursor` currently serves both input and output. Preserve the existing request type and its runtime Date validation. If raw page results can contain values the request rejects, introduce a distinct honest result cursor type for `OutboxEventListPage.nextCursor` rather than claiming those values are newly accepted query inputs. Document the existing non-finite continuation limitation and preserve its error behavior; do not invent normalization or a new supported pagination domain.

## Preservation requirements

1. Make no SQL, timezone, ordering, JSON, precision, coercion or database-domain change to obtain the desired type. No silent finite-only guard. An `isfinite` SQL constraint proves finite PostgreSQL values, not JavaScript Date representability.
2. Retain public object construction forms already accepted at compile time: strings, Dates, nullable values and optional keys where originally allowed. Honest result unions may require consumer narrowing; that impact is explicit rather than falsely called fully source compatible.
3. Preserve existing mapper outcomes and errors at their existing layer. A later `.toISOString()` failure is not authority to reject every selected timestamp before a branch that previously ignored it. Do not replace explicit domain errors with early generic row errors. Narrow typed code without inventing conversions or successful behavior for previously failing inputs.
4. Internal session/offline/idempotency representation-preserving schema fixes are ordinary implementation under existing approval: accept actual driver forms, retain ISO/domain-error/Date.parse/fallback logic, and avoid validation of unused projections that newly changes success. They do not require another public contract approval unless an exported shape changes.
5. Preserve the single checked executor and existing fixed projection validation. These type corrections create no generic raw SQL entry and do not expand ADR0028/0029 admissions. Malformed unrelated row shapes still fail with redacted infrastructure errors.
6. Inspector adds exact adapter regressions, emitted-type consumer examples, stock and supported configured-parser cases, null/omission distinction, bigint precision and timestamp sentinels/out-of-range values. Existing assertions and quality gates remain intact. Review derived-field behavior before expanding the final changed-field census.
7. Architect reviews the final emitted public declarations and regenerates official baselines after intended changes and tests are complete. No baseline hand edits, false “3.1-compatible” label or publication inference. Formal DEVAI acceptance and downstream consumer acceptance remain separate.

## Remaining distinct decisions

The fake Transaction driver's PoolClient/generic-row mismatch and Flow/worklist partial-mutation strategy are outside this decision. ADR0031 remains exactly its two accepted emitted-output deferrals. If evidence reveals an additional public family or a required behavioral change, report the concrete delta rather than treating this decision as blanket permission.
