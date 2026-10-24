---
adr_id: ADR-DEVAI-ADOPTION-0028
title: STYNX typed-query adoption, strict workspace lint and bounded legacy archive compatibility
status: accepted
date: 2026-10-23
authors: ['Architect']
tags: [stynx, devai, data, lint, adoption]
---

# ADR-DEVAI-ADOPTION-0028 — Typed queries and strict workspace lint (S10 SM-09, SM-11)

**Status:** Accepted design; implementation and acceptance remain pending.

**Authority:** The Owner approved the S10 plan's recommended O-1 through O-10 decisions on 2026-10-23, including O-3's workspace-only enforcement and single raw-script entry, O-4's reference/domain API scope, O-5's prohibition on new unsafe-rule suppressions, O-7's combined C1–C4+D PR and signed RC, and O-8's exclusion of publication. On 2026-10-23, after reviewing the fifteen dynamic archive execution sites, the Owner additionally answered **“Approve the narrow legacy bridge.”** The question explicitly disclosed that preserving arbitrary consumer tables and Drizzle expressions cannot satisfy static SQL unchanged, and that custom Drizzle types have limited runtime row-validation guarantees. It proposed a single checked executor preserving parameter binding, RLS and transaction safeguards; it distinguished the existing migration/RLS/fixture script approval from runtime archive compatibility. This record binds that bounded action approval, not a claim that the Owner supplied a commit SHA.

**Related decision:** [ADR-DEVAI-ADOPTION-0027](2026-10-23-s10-app-guc-dialect-and-workspace-boundaries.md) governs the preceding A+B work. Existing approvals, applied migrations, historical release evidence and downstream consumer acceptance remain separate.

## Contract and scope

Foundation `02-architecture.md` §3, D-030 and D-058 define the typed-query contract implemented by `@stynx-nyx/data`. Query definitions belong in **`*.repository.ts`**, not the `*.queries.ts` location proposed in the earlier S10 planning prose. A definition uses a unique name, zero-interpolation `sql` literal, contiguous `$n` placeholders, a bounded parameter tuple, a row schema and explicit `one`, `zero-or-one`, `many` or `none` cardinality. Finite identifier or ordering alternatives require separate static definitions.

`Transaction.run` parses arguments before execution, binds values, checks cardinality and validates every returned row in every environment. Invalid rows must not leak row contents through errors. Schemas must reflect real PostgreSQL result representations and nullability; a type assertion, permissive record schema or coercion alone is not proof of a structured row contract. Existing successful behavior, failure contracts, transaction boundaries, deadlines, tenant context and public method signatures remain preserved.

The implementation scope is STYNX's backend packages, workspace tools, reference API and `domain/*/api`, with the web and remaining workspace lint debt included in SM-11. Consumer DETRAN/PORM deployment, data import, provider acceptance and cutover remain outside this change.

## One checked execution boundary

1. Concentrate STYNX-authored raw PostgreSQL driver calls and raw `Transaction` execution delegation in `packages/data/src/checked-executor.ts`. Its admitted entries are the checked typed runner `executeTypedQuery`, the lifecycle entry `executeRawScript`, and the closed archive operation entry `executeLegacyArchive`, and the separately approved configured-operation entry `executeConfiguredQuery` governed by [ADR0029](2026-10-23-s10-configurable-sql-compatibility-proposal.md); internal compatibility delegates are restricted to the existing `Transaction.query`/`execute` wrappers. The workspace rules are `stynx/no-raw-query` and `stynx/define-query-location`. The existing internal `typed-query.ts` export of `executeTypedQuery` may remain a compatibility re-export without introducing a runtime dependency cycle. There is no `data` package-wide exemption. Static application operations use `defineQuery` and `Transaction.run`; lifecycle operations and the bounded legacy cases below have distinct entry points and call-site admission.
2. Preserve the public `Transaction.query` and `Transaction.execute` signatures and behavior for compatibility. They delegate through the execution boundary and remain internal-use APIs in documentation; preserving them does not permit new STYNX application callers. Their historical raw-result contract must not be described as typed row validation.
3. The approved raw-script entry serves migration files, migration control, the RLS-negative engine, controlled test/LGPD fixtures and storage installation utilities. Admitted families are `data/src/migration-runner.ts`, `cli/src/migrate.ts`, `cli/engines/rls-negative.mjs`, `testing/src/{create-test-app,fixtures,lgpd-fixture}.ts`, and `{outbox,offline-sync}/src/storage-cli.ts`. ADR0029 separately adds the two existing reference installer callers; it grants no general reference application-query escape. Transaction-control and context setup stay within the checked execution boundary. Static catalog/state queries in these families should still use typed definitions where applicable. No runtime service may route ordinary queries through this entry to evade the rule.
4. A script entry must not manufacture a checked application row type from unvalidated driver output. Return no application rows, retain an explicitly raw compatibility result, or validate the required result shape at the boundary. Do not label raw lifecycle output as `TypedQuery` evidence.
5. Workspace-only lint must identify PostgreSQL/Transaction receiver provenance, aliases, destructuring and indirect imports, and must reject prohibited calls outside the executor. Unrelated APIs named `query` or `execute` remain valid. Admission of script and legacy entry points is exact and tested; a source rename or generic helper must not turn the entry into a broad escape. Published ESLint profile defaults remain unchanged.

### Structural executors and affected-row commands

The shared `executeTypedQuery(client, query, params)` may be exported additively so existing structural query-only ports, including `StorageVerifierTransaction` and `PgQueryExecutor`, retain their interfaces. It enforces the same parameter, cardinality and row checks as `Transaction.run`; it is not an untyped escape and does not require consumers to add a new `run` method. `Transaction.run` and its result type remain unchanged.

An additive `executeTypedCommand(client, query, params): Promise<number | null>` accepts only `TypedQuery<P, R, 'none'>`. It performs the same parameter validation before issuing SQL, requires no returned rows, and returns the driver's affected-row count (`null` when unavailable). It issues the original statement exactly once. It must not add `RETURNING`, perform a second query, synthesize a count from unrelated state, or widen required database grants. Invalid cardinality and malformed driver count evidence fail as infrastructure errors; zero is distinct from unavailable. Existing callers remain responsible for their established null-count fallback semantics. Inspector must cover invalid parameters/no execution, zero and positive counts, unavailable count, unexpected returned rows and no extra statement. This is a narrow additive implementation of the approved typed-query conversion, not an expansion of dynamic SQL authority.

An additive `executeTypedQueryResult(client, query, params)` returns `{ value: ResultOf<Q>, rowCount: number | null }`, using the same parameter, row and cardinality validation and exactly one driver execution as `executeTypedQuery`. The latter returns the validated value unchanged; this companion also retains actual driver count metadata without inferring it from returned-row length. Existing sessions purge/erase statements already use `DELETE ... RETURNING sid` while exposing driver `rowCount`; preserve that distinction and their existing SQL. Missing count is `null`, malformed count fails, and existing caller fallback semantics remain unchanged. Inspector must cover results where returned-row length differs from the driver's affected-row count, unavailable counts, invalid rows and no duplicate execution. This additive static-query companion creates no dynamic SQL exemption and does not relax `executeTypedCommand`'s `none` cardinality.

Database transaction setup may use a closed executor-owned operation union for begin/commit/rollback, savepoints, supported isolation modes and transaction-local context. Only existing transaction-control callers are admitted. Savepoint/identifier construction remains constrained and values remain bound; this is not a generic raw-script privilege for `database.ts`.

## Approved legacy archive bridge

The bridge is a **STYNX compatibility exception**, limited to existing generic archive operations. It does not amend the external foundation, broaden raw-script authority or claim unconditional future DEVAI acceptance.

The protected public surfaces are:

- `ArchiveSelectQuery<TTable, TMode>`: its constructor, `where`, `orderBy`, `limit`, `offset`, `toSQL`, `execute`, `then`, `catch` and `finally`, retaining their result and PromiseLike behavior.
- `createTransactionSelectRoot` and `Transaction.select().from(table).withDeleted()/onlyDeleted()`.
- `Transaction.softDelete`, including dry-run cascade planning; `restoreFromArchive`; `restoreWithCascade`; `hardDelete`; and `hardDeleteFromArchive`, including its existing `archiveTable` option.

The baseline at `880e3183f638f7c026293f8eb6db471d0c74dc64` contains exactly fifteen dynamic execution sites. An earlier count of fourteen was arithmetic error; the enumerated operations did not change.

| Source under `packages/data/src`  | Baseline lines                    | Count |
| --------------------------------- | --------------------------------- | ----: |
| `query-helpers.ts`                | 273                               |     1 |
| `transaction.ts`                  | 226, 238                          |     2 |
| `internal/archive-relations.ts`   | 116, 136, 149, 176, 209, 224, 289 |     7 |
| `internal/archive-restore.ts`     | 85, 106, 117                      |     3 |
| `internal/soft-delete-cascade.ts` | 188, 204                          |     2 |

These are compatibility-sensitive runtime paths used by storage, Flow and the reference API. Static registry/catalog lookups, relation-size measurement and literal GUC-setting statements in the same files are excluded from this exception and migrate normally.

The bridge must satisfy all of the following:

1. Only the listed operation families may reach it. Keep the operation surface closed; do not introduce a general public arbitrary-SQL archive helper. New runtime operation families require a new architectural decision.
2. Derive and quote identifiers from the existing Drizzle table metadata, canonical catalog/registry information or the existing explicitly supplied archive-table option. Preserve the current archive-table option's meaning. Treat strings as identifiers, never executable SQL, and bind values as parameters. Retain support for existing Drizzle predicate/order expressions without relabeling them zero-hole static definitions.
3. Preserve active-transaction checks, app/reader/owner behavior, read-only refusal, explicit irreversible-deletion confirmation, tenant RLS context, archive/mirror existence checks, cascade depth/row bounds, restore conflict handling, rollback and metrics behavior.
4. Validate fixed result projections and archive metadata using explicit runtime shapes: identifiers, existence flags, counts, archive IDs, timestamps and declared nullability. Validate known built-in column representations where metadata supplies a real runtime contract. Do not treat `z.record(z.unknown())`, a generic cast or `mapFromDriverValue` coercion as proof of `TTable['$inferSelect']`.
5. Drizzle `$type<T>` refinements are erased at runtime; custom type mappers and arbitrary SQL fragments do not supply complete validation schemas. Catalog-recursive child tables may not have a Drizzle table object. Preserve these existing compatibility cases and document the resulting validation limits rather than rejecting them silently, inventing shape guarantees or requiring a new public schema-registry argument. The exception therefore does not satisfy literal-SQL analysis or complete arbitrary-row validation; strict typed-query guarantees apply to the static path.
6. Keep driver execution in the same single checked module. The legacy bridge remains distinct from the lifecycle script entry and from `defineQuery`. Its small call-site inventory and limited guarantees must remain visible in lint acceptance and future DEVAI verification.

## SM-11 and delivery sequence

The existing C1–C4 grouping remains an implementation sequence, combined with D into one PR and one signed RC after A+B integration. C1 establishes the execution boundary and foundation packages; C2 converts offline-sync; C3 converts remaining runtime packages; C4 covers CLI/testing, tools, web, reference and domain sources. D removes the workspace `strict: false` relaxation and aligns the root config. The public `strict` option is not removed from the published profiles.

All installed `@typescript-eslint/no-unsafe-*` rules and `no-explicit-any` must be at error for the final workspace scope, with zero lint warnings. The Owner-selected F2 in [ADR0033](2026-10-23-s10-generic-boundary-disposition-proposal.md), accepted on 2026-10-24, prospectively amends the original no-exception requirement only for the two existing fakeTransaction assertions under its exact census. Describe the result as strict workspace enforcement with the approved two-site legacy testing exception; do not claim universal zero-unsafe enforcement. No additional suppression, new assertion, blanket file disable or browser-cast exception is authorized. Use validated boundaries, precise types and safe narrowing. Inspector owns the existing test/CommonJS fixes and new regressions; Engineer owns implementation; Architect owns trace and public API baseline review. Preserve tests, assertion intent, coverage thresholds and ordinary gates. Changesets and generated package README updates follow the fixed-group rules where required, but S10 performs no publication.

## Required verification and honest acceptance

- Inspector first demonstrates rejection of direct, aliased, destructured and indirectly imported raw query calls; permitted non-database methods; wrong definition locations; dynamic `sql` interpolation; and misuse of either special executor entry outside its admitted scope.
- Typed-query tests cover no SQL on invalid arguments, all cardinalities, nullability, PostgreSQL bigint/date/numeric representations, invalid row rejection and error redaction. Real PostgreSQL integration covers transaction/RLS behavior and each converted package's observable contracts.
- Archive tests preserve existing generic-table and custom-column behavior and exercise hostile identifier/value strings, malformed fixed rows, reader/inactive/foreign-tenant refusal, explicit delete confirmation, rollback, cascade limits, restore conflicts and PromiseLike/result compatibility. Tests distinguish known fixed validation from the documented custom-type limit.
- Configuration tests enumerate the installed unsafe-rule family, require error levels, include reference/domain sources, verify ADR0033 F2's exact two-site census, deny all additional suppression escape paths and preserve published-profile behavior. The final source census must reconcile every raw call to the single executor and the admitted compatibility surface.
- Run trace, public API, byte-freeze, package/unit/integration and complete signed RC checks on the integrated candidate. Evidence remains tied to that candidate; branch success is not merge or publication.
- A locally built DEVAI v3 CLI is sufficient for the later formal `devai check --only lint` acceptance; publication of that CLI is not required. Present this legacy exception explicitly to that verification. If the v3 rule does not recognize it, report the resulting finding and keep formal SM-09 acceptance pending. Do not disable the rule, suppress the finding or declare a pass from STYNX-local lint alone.
- No result here closes downstream DETRAN/PORM acceptance, security/provider trust, imports, outbox cutover or the repository's separate observation-scorecard gaps.
