---
adr_id: ADR-DEVAI-ADOPTION-0029
title: Bounded compatibility operations for existing configurable SQL APIs
status: accepted
date: 2026-10-23
authors: ['Architect']
tags: [stynx, devai, data, compatibility]
---

# ADR-DEVAI-ADOPTION-0029 — Bounded configurable SQL compatibility

**Status:** Accepted design; implementation and acceptance remain pending. The review filename is retained so the Owner's linked proposal remains resolvable.

**Authority:** On 2026-10-23, the Owner answered **“Approve the bounded registry”** to this exact question: “Approve ADR0029’s bounded compatibility registry for the ten existing configurable-SQL families and two reference installer callers? It preserves public APIs and safeguards, permits only reviewed operations and identifier slots, and keeps formal DEVAI acceptance and DETRAN/PORM acceptance separate. The proposal is linked above.” This records action approval, not a commit-specific receipt or completed verification. The earlier archive-only approval in [ADR0028](2026-10-23-s10-typed-query-adoption.md) remains independently bounded to its fifteen sites.

## Decision

Adopt a closed compatibility-operation registry for the existing ten families below, plus the two existing reference lifecycle callers identified separately. Preserve current public APIs and behavior while centralizing execution and validation. This is a disclosed STYNX exception to the foundation's zero-interpolation literal-SQL contract; it does not amend the external foundation, make the external DEVAI rule pass automatically, authorize publication, or close DETRAN/PORM acceptance.

A redesign that removes arbitrary configured identifiers or requires new consumer schemas remains outside this decision and belongs in a separately approved compatibility change, potentially a future major release.

## Exact approved population

The inspection anchors below identify the existing operations before conversion; line numbers will move during implementation. Counts distinguish actual source execution sites from three matcher operations sharing a single helper. No family may be broadened to arbitrary methods in its package.

| Family and existing variability                                                          | Exact caller files and inspection anchors                                                                                                              | Permitted operation scope                                                                                                                                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configurable `PgIdempotencyStore`, table and six column names                            | `packages/idempotency/src/pg-idempotency.store.ts` (69, 105, 146, 169); `packages/backend/src/idempotency/pg-idempotency.store.ts` (72, 106, 146, 169) | Lookup, reservation, response persistence and reservation removal; preserve both exported implementations and query-only executor ports.                                            |
| Configurable `PgRateLimitStore`, table and five column names                             | `packages/ratelimit/src/pg-rate-limit.store.ts` (78); `packages/backend/src/rate-limit/pg-rate-limit.store.ts` (72, 105)                               | Existing bucket hit/upsert and backend cleanup.                                                                                                                                     |
| `SqlTenantEntitlementFallback` relation and tenant/subject/email/optional active columns | `packages/backend/src/auth/sql-tenant-entitlement.fallback.ts` (101)                                                                                   | Existing entitlement lookup only; preserve no-subject/email refusal and tenant scoping.                                                                                             |
| `loadPormRoleMetaRows` configured metadata view                                          | `packages/backend/src/identity-admin/pg-local-sync.adapter.ts` (449)                                                                                   | Existing role-domain lookup; this is framework API compatibility, not PORM acceptance.                                                                                              |
| Audit SQL adapters with configured schema/table                                          | `packages/audit/src/sql-adapter.ts` (134, 302, 388, 459)                                                                                               | Table-mode sink and reader modes `audit_log`, `stynx_events`, `porm_logged_actions`; fixed function-mode operations migrate statically.                                             |
| Legacy outbox transport with consumer `table` and `ackTable`                             | `packages/outbox/src/outbox.service.ts` (1816, 1862, 1942, 1979, 1992, 2065, 2081, 2129, 2145, 2191)                                                   | Only the existing legacy transport operations, ownership checks, claim/dispatch/ACK behavior and consumer storage mapping.                                                          |
| Privacy catalog/override table and PII column bindings                                   | `packages/privacy/src/privacy.service.ts` (339, 360, 486, 524, 543)                                                                                    | Existing retention selection, export and erasure operations; preserve policy selection, redaction and authorization.                                                                |
| Catalog-derived foreign-key verification and consumer tenant binding                     | `packages/outbox/src/storage.ts` (386); `packages/offline-sync/src/storage.ts` (438), `import-preflight.ts` (78), `import-state.ts` (248)              | Existing binding/catalog checks and imported tenant lookup only.                                                                                                                    |
| Audit partition catalog maintenance                                                      | `packages/audit/src/audit.service.ts` (191, 251, 252)                                                                                                  | Existing partition inspection, detach and removal selected by current maintenance policy; no new deletion authority or broader targets.                                             |
| Public test matcher counts over arbitrary Drizzle tables                                 | `packages/testing/src/matchers.ts` (`scalar`, 29)                                                                                                      | Only `expectInArchive`, `expectNotInLive`, `expectRestored` count operations; three callers share one driver-execution helper. This is not a generic testing-package SQL exemption. |

## Required implementation limits

1. Use `packages/data/src/checked-executor.ts` as the sole raw execution boundary. Identify each compatibility operation by a closed, reviewed ID and exact caller. Keep the closed SQL operation definitions in `packages/data/src/configured-query.repository.ts`, with execution through `executeConfiguredQuery(client, operation, identifiers, params)` in the checked executor. That entry accepts no SQL text or fragment argument. Fixed query structure, allowed identifier slots, parameter contracts, result contracts and finite modes belong to reviewed definitions. Callers cannot register or replace definitions at runtime; a name plus arbitrary text must never confer admission. Preserve feature dependency direction by keeping these definitions independent of feature-package imports.
2. Allow runtime variability only for the existing configuration/catalog/Drizzle identifiers and already established finite modes. Validate and quote identifier components; bind all values. Preserve PostgreSQL case-folding semantics where current APIs previously emitted unquoted identifiers. Do not accept statement separators, operators or caller-authored SQL expressions as identifiers. The archive bridge's existing Drizzle-expression exception does not extend to these families.
3. Preserve constructor options, exported signatures, structural executor ports, response shapes, default tables, column naming semantics, role/RLS checks, transaction boundaries, locks, deadlines, ownership/ACK controls and maintenance policy. Do not add `RETURNING` solely to count affected rows or require additional column privileges. Use the approved typed-command result path where appropriate.
4. Validate fixed result schemas, cardinalities, counts, identifiers, timestamps and nullable fields. For privacy exports or metadata carrying consumer-defined payloads, validate known envelopes and legal JSON/metadata constraints while preserving existing opaque payload semantics. Do not invent guarantees about unknown consumer object shapes or silently require a new schema registry. Document the remaining limitation explicitly.
5. Registry admission must be enforced in the workspace lint and tested for direct, aliased, destructured and indirect access. Wrong caller, wrong operation, unrestricted dynamic text and malformed identifier inputs fail closed. No package-wide exemption, new unsafe-rule suppression or general runtime `executeRawScript` use is permitted.
6. Inspector tests must compare preserved default and custom bindings, identifier quoting/case behavior, hostile identifiers and values, malformed fixed rows, affected-row semantics, unauthorized/foreign-tenant cases and transaction/error behavior. Existing integration evidence and assertions remain required.
7. Keep the exact population visible in the final census and present the exception to formal DEVAI v3 acceptance. If the external rule rejects it, record the finding and leave formal acceptance pending. Do not weaken or suppress the external rule.

### Operation-specific legacy executor normalization

Both existing `PgIdempotencyStore` implementations accept structural query executors whose results may be driver result objects or arrays. Preserve the established response-persistence convention: an array result contributes its `length` as legacy completion-count metadata, even when the existing update has no `RETURNING`; an object result retains its existing `rowCount` fallback. Label this compatibility metadata distinctly from an actual driver affected-row count. Do not add `RETURNING`, perform an extra read, or apply the strict typed command's empty-row cardinality to this legacy array representation.

Preserve lookup's established `[undefined]` array result as no row, producing `null`. This is a narrow normalization for the existing idempotency lookup adapter only. It does not authorize globally removing malformed rows, accepting malformed fixed projections, or weakening static typed-query validation. Other operation/result contracts must reject malformed evidence according to their defined schemas.

These conventions preserve existing public executor behavior under the Owner's compatibility approval. They do not change `executeTypedCommand`, whose result remains the actual driver `rowCount` or `null`, with no synthesized count and no returned rows.

## Two additional existing lifecycle callers

The earlier O-3 list omitted the reference application's existing lifecycle installation entry points. The Owner approved only routing these existing operations through the already governed migration/script API:

- `reference/api/src/app.module.ts` migration-file execution (inspection line 157).
- `reference/api/src/performance/offline-storage.ts` installation of generated offline objects and role bindings (inspection lines 87–88).

These receive no general application-query escape. Query forwarding in reference or package adapters must use executor-owned checked adapters rather than create additional raw delegation sites. Existing lifecycle effects and environment boundaries remain unchanged.

## Explicitly excluded from the exception

Convert finite Flow design/form table sets, Flow/worklist/audit/outbox filter/order variants, fixed task function alternatives, constant column lists and offline's closed twelve import kinds to static literal repository definitions. Preserve update-column/trigger behavior rather than replacing a partial update with an indiscriminate full update. Reference sample archive-table unions are finite and need no new exception. CLI-generated CRUD can emit literal repositories at generation time; the adoption rewriter must follow that contract. Unrelated non-database `execute` methods are not SQL calls.

Implementation and verification must remain within this approved population. The decision does not retroactively enlarge the archive-only bridge or create a general dynamic-SQL exemption.
