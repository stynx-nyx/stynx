---
adr_id: ADR-DEVAI-ADOPTION-0031
title: Generated partial writes and adoption SQL disposition
status: accepted
date: 2026-10-23
authors: ['Architect']
tags: [stynx, cli, generated, sql, compatibility]
---

# ADR-DEVAI-ADOPTION-0031 — Generated SQL disposition

**Status:** Accepted narrow legacy-output deferral; independent implementation and acceptance remain pending. The review filename is retained.

**Authority:** On 2026-10-23, the Owner answered **“Approve the explicit legacy-output deferral; complete independent work”**. The approval covers exactly generated partial create/update and arbitrary adoption SQL rewrites. It authorizes no new dynamic executor, field limit, consumer mutation or timestamp type/serialization change. The separately identified timestamp caveat below remains pending. Existing approvals and active S7/S8/S10 work remain intact. This decision explicitly amends ADR0029's incorrect feasibility assumption rather than broadening its registry permission.

## Scope finding

The workspace source lint checks actual TypeScript execution in `packages/cli/src/generate-module.ts` and `packages/cli/src/adopt.ts`. SQL-looking text inside a template or replacement string is not itself a PostgreSQL call executed by the CLI. A clean lint result for those authoring files therefore cannot establish compliance of their emitted consumer programs.

However, [ADR0029](2026-10-23-s10-configurable-sql-compatibility-proposal.md), under its explicit exclusions, requires generated CRUD to emit static literal repositories and the adoption rewriter to follow that contract. ADR0028 includes CLI/testing in C4. Generated output cannot silently be excluded from the approved acceptance claim merely because the authoring source passes lint.

The external DEVAI architecture's §3 also specifies static generated-module query limits and §7 describes typed queries in its own generator output. That DEVAI generator is distinct from the existing STYNX CLI. This proposal changes neither external foundation text nor downstream consumer acceptance. The local ADR obligation is sufficient to require a decision here.

## Exact blockers

### Generated partial create/update

`packages/cli/src/generate-module.ts` accepts 2–64 fields per entity, including mandatory `id` and `tenant_id`. `renderRepository` emits create and update methods whose runtime column list is the subset of writable fields actually supplied. Create omits absent fields so PostgreSQL defaults apply; update names only supplied columns, preserving column-specific trigger behavior and one-statement semantics.

Up to 62 writable fields permit up to 2^62 subsets. Exhaustively emitting a static statement for every subset is not a practical implementation of the supported input contract. Calling the set finite does not solve this constraint.

The existing [generator contract](../../docs/framework/contracts/cli-generator-1.5.md) requires nullable/defaulted create fields to remain optional and update fields to be partial. Replacing omitted values with null, repeating defaults in application code, full-column `CASE` updates, issuing one statement per field, reducing the field limit, or changing the blueprint vocabulary would change those semantics. Forwarding dynamic SQL through a generic helper or server function does not make it static and is not already covered by ADR0029.

List, get and delete have fixed text after blueprint validation, but static text alone does not establish a compatible row schema. For entities without `timestamptz`, these operations are independently eligible for literal `defineQuery` conversion after verifying the scalar/nullability contracts below. Keep timestamp-bearing operations unchanged pending their separate type/runtime disposition; do not reject those blueprints or silently drop their operations. Their schemas must reflect actual PostgreSQL output representations and nullability rather than inventing stronger guarantees from existing interface assertions.

### Pending generated timestamp type/runtime contract

`renderRepository` emits `string` for every field other than `integer` and `boolean`, including `timestamptz`. The installed stock `pg-types` text parser binds OID 1184 to `postgres-date`, which returns `Date` for ordinary timestamps. The generated direct repository therefore declares a string while returning a date object. A new `z.string()` result validator would reject legitimate existing rows; `z.date()` with a new emitted `Date` type changes the consumer's compile-time contract; converting the value to ISO text changes direct repository runtime behavior. HTTP JSON serialization already producing text does not authorize that direct-runtime change.

The timestamp policy must also account for PostgreSQL infinity: the installed `postgres-date` parser returns numeric positive/negative infinity for those values. The generated DDL does not prohibit them. A blanket `Date` type or validator would therefore still need a declared database-domain restriction or a broader honest representation. Custom host parsers are another configuration boundary and cannot be assumed absent without a documented contract.

This is an additional pending public type/runtime choice. It is **not** included in ADR0030's approved pool/marker corrections, and the accepted legacy-output disposition must not be treated as permission to change timestamp types or serialization. Collect emitted declaration and direct repository evidence, then present the concrete timestamp alternatives together before implementation. No additional question or implied approval is created by this caveat.

A read-only census of every supported blueprint scalar found:

| Blueprint type            | Existing emitted result type | Stock PostgreSQL/pg representation              | Disposition                                                                                                |
| ------------------------- | ---------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `uuid`                    | `string`                     | String                                          | No intrinsic representation mismatch found; preserve existing UUID/domain semantics.                       |
| `text`, `varchar(1..255)` | `string`                     | String                                          | No intrinsic representation mismatch found; validate limits without changing existing character semantics. |
| `integer`                 | `number`                     | Int4 parsed as number                           | No intrinsic representation mismatch found; preserve int32 bounds.                                         |
| `boolean`                 | `boolean`                    | Boolean                                         | No intrinsic representation mismatch found.                                                                |
| `timestamptz`             | `string`                     | Ordinary `Date`; infinity sentinels are numbers | Unresolved public type/runtime mismatch; do not convert silently.                                          |
| Nullable forms            | Adds `null`                  | Null                                            | Existing nullability shape matches; do not confuse omitted create inputs with null result values.          |

The vocabulary rejects bigint, numeric, JSON, arrays and custom SQL types, so those are not additional current generator scalar cases. Timestamp HTTP input DTOs accept strings deliberately; do not change them merely because database result types differ. This census is source/parser inspection, not completed runtime verification.

### Arbitrary adoption rewrites

`codemodPoolUsage` in `packages/cli/src/adopt.ts` rewrites matching consumer `this.pool.query(...)` or `this.client.query(...)` calls to `Database.tx(... trx.query(...))`, alongside import/constructor substitutions. It is a regex transformation over arbitrary consumer code. The source does not supply authoritative parameter limits, result schemas, cardinality or even reliably parse every SQL expression.

A generated permissive row record, unchecked generic or inferred type assertion would not provide the required runtime validation. Executing arbitrary supplied SQL through an approved registry ID, script entry or server-side wrapper would enlarge an exception and bypass the intended contract. Automatically throwing, deleting SQL operations or leaving imports half-rewritten would change existing adoption behavior.

## Accepted bounded disposition: explicit legacy-output deferral

The Owner approved the following narrow amendment to ADR0029's feasibility assumption:

1. Continue typed static conversion of generated list/get/delete for non-timestamp entities and all actual CLI-owned SQL execution under the existing rules. Timestamp-bearing repository outputs retain their existing behavior pending the separate decision above; blueprint acceptance and operation availability do not change. Keep definitions in emitted `*.repository.ts`; validate against the blueprint and real PostgreSQL result shapes.
2. Preserve the current generated create/update statement construction and existing adoption SQL rewrite behavior as explicitly deferred legacy consumer output. Do not add an executor entry, broaden ADR0029's registry, or admit generic SQL forwarding. `Transaction.query` remains the already preserved public compatibility API; its presence in legacy output must be disclosed as noncompliant with the static target.
3. Record these two output families in the S10 acceptance census and release migration notes. Do not claim that the CLI generator/adoption output satisfies SM-09 or the external DEVAI static rule. Full SM-09 acceptance remains pending for this population even if direct workspace calls pass local lint. Do not exclude materialized output from a gate to manufacture a pass.
4. Preserve current blueprint limits, omitted-default behavior, column-specific updates, one-statement behavior, RLS/context and adoption rollback/idempotence tests. Inspector adds or retains materialized-output tests that distinguish static converted operations from the documented legacy output. Existing product assertions remain required; no deletion or weakening to accommodate this disposition.
5. Track a follow-up public-contract design for typed generator mutations and schema-informed adoption. A future generator may require explicit operation shapes; a future codemod may produce a review report and convert only operations with supplied schemas. Those are distinct public behavior decisions, not implementation details authorized by this deferral.

This option preserves existing public behavior and the static SQL rule's meaning while making the remaining work visible. It does not complete all SM-09 work and must not be described as such.

## Acceptance consequences of the accepted disposition

| Population                                                         | Permitted completion claim after its required tests pass                                                                                              | Remaining limitation                                                                                                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actual PostgreSQL execution performed by STYNX CLI/runtime sources | Direct workspace no-raw-query adoption may complete within the previously approved executor population.                                               | Green source lint says nothing about string-produced consumer programs.                                                                                                             |
| Materialized generated list/get/delete                             | For non-timestamp entities, static typed-query adoption may complete after generated-source lint, schema/runtime checks and packed-consumer evidence. | Timestamp-bearing entities remain pending their distinct public type/runtime decision; whole-generator completion cannot be inferred from the eligible subset.                      |
| Materialized generated create/update                               | Existing behavior preserved and explicitly deferred.                                                                                                  | Static literal SQL and corresponding SM-09 generated-output acceptance remain incomplete.                                                                                           |
| Arbitrary adoption SQL rewrites                                    | Existing adoption behavior preserved and explicitly deferred.                                                                                         | Runtime parameter/row/cardinality validation and typed-output SM-09 acceptance remain incomplete.                                                                                   |
| Overall S10 / formal DEVAI acceptance                              | Report completed populations with their candidate evidence.                                                                                           | Do not mark the entire CLI or full SM-09 complete. External findings remain findings; any narrower local acceptance denominator must explicitly name this Owner-approved amendment. |

The incomplete pieces are not just missing implementation effort: the arbitrary adoption input contains no authoritative runtime row schema or parameter constraints. TypeScript generic annotations are erased and do not supply a validator; parsing a SQL string alone cannot recover every database expression, custom type, nullability or application invariant. Obtaining an authoritative schema or preserving a manual review step requires new inputs or a changed public contract. Likewise, supporting every partial mutation as literal text without changing current write semantics creates an infeasible output population. Completing the full target therefore requires either new input contracts or an explicit dynamic exception, not a renamed generic executor.

## Alternatives requiring separate design

**A bounded generated-mutation exception:** Permit only generator-described create/update operations through a dedicated checked executor contract: immutable validated blueprint identifiers and column vocabulary, runtime selected-column subset, bound values, validated operation arguments and row shape, existing tenant/actor context, and preserved omission/trigger semantics. It would accept no arbitrary SQL fragments and cover no adoption calls. This is still dynamic SQL and a new public execution capability, outside ADR0029's ten existing families. It needs a concrete API, generated-output admission policy, runtime tests and explicit external acceptance disclosure before implementation. A manifest or operation name is not an authorization credential. This proposal does not supply enough implementation authority to choose this alternative automatically.

**A redesigned static generator/adopter:** Require explicit finite mutation shapes in a new input dialect or restrict partial writes, and require authoritative schema input before converting arbitrary consumer queries. This can support truly static operations but changes current public behavior and requires a consumer migration and release classification decision. Do not introduce an unapproved field limit or silently reinterpret existing blueprints.

Neither alternative solves arbitrary automatic adoption solely by adding a generic forwarding API. The adoption component still needs schema-informed conversion or an explicit deferred/unconverted outcome.

## Decision and execution boundaries

The Owner selected the explicit legacy-output deferral above. Preserve generated create/update and adoption SQL behavior while completing the independently eligible work. The alternatives remain unapproved. Timestamp result typing/serialization is a distinct pending contract choice; do not infer its approval from this decision. Inspector and Engineer keep their separate roles; Architect updates the generator contract and acceptance census to reflect this bounded disposition.

No publication or release version is selected here. ADR0030's approved type corrections and separate release assessment remain in force. No generated DETRAN or PORM files are changed, and issues #317–320 retain their downstream acceptance obligations.
