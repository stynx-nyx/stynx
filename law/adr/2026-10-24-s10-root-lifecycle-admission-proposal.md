---
adr_id: ADR-DEVAI-ADOPTION-0040
title: Exact root tooling lifecycle SQL admissions
status: accepted
date: 2026-10-24
authors: ['Architect']
tags: [stynx, sql, tooling, compatibility, accepted]
---

# ADR-DEVAI-ADOPTION-0040 — Exact root tooling lifecycle SQL admissions

**Status:** Accepted on 2026-10-24; implementation and independent verification remain pending. The original proposal filename and source census are retained.

**Authority:** The Owner answered **“Approve the eleven bounded lifecycle sites”** for this exact proposal. The accepted population is eleven existing execution sites in four root tooling files: five fixed script origins and six database-name operations, with every caller, source and preservation constraint below. Existing S10 approvals remain intact. This decision does not itself implement an admission, qualify a release or create a forbidden-action receipt.

## Existing authority and delegation finding

[ADR0028](2026-10-23-s10-typed-query-adoption.md) authorizes migration, fixture and storage-install purposes through an explicitly enumerated caller set. [ADR0029](2026-10-23-s10-configurable-sql-compatibility-proposal.md) adds two reference installers. The four root callers below are absent from those sets. Neither archive compatibility nor the generated consumer-output deferral admits them.

No existing admitted API is a behavior-equivalent substitute:

- `StynxMigrationRunner.runPlatformMigrations` creates migration history, skips recorded IDs, records checksums, changes bootstrap ownership and wraps each file in its own transaction. The catalog generators replay every sorted canonical file on their existing client and put hashes in artifact provenance, without that extra history behavior.
- CLI `migrateUp` adds its journal/history and role-prefix handling. The template script already correctly invokes that CLI after database preparation; it must retain that invocation.
- `createTestApp` creates its own generated database, binds login state and initializes Nest modules/application. Its private cleanup terminates connections and drops without FORCE. It is not the same as the catalog generators' forced cleanup or the persistent named integration template.
- Storage CLIs render or verify; they do not perform the offline generator's exact objects-then-bindings installation transaction.
- No package installer implements the demo domain's two hash-bound migration sources, exact framing removal, owner admission and recognized-history checks within its caller-owned transaction.

Moving domain SQL into a public data export, or invoking these broader APIs to obtain their admission, would alter the boundary rather than preserve it.

## Exact accepted population

Line numbers identify the reviewed source snapshot, not permissions independent of source origin. Exact path, lexical scope and operation/source identity are binding.

| Caller and scope                                                                        | Existing sites | Permitted operation/source only                                                                                                                                     |
| --------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/offline-storage-catalog-generate.mjs`, existing top-level generation lifecycle | 28, 80         | CREATE the locally generated `stynx_storage_generation_` plus 32-hex UUID name; finally DROP IF EXISTS that same name WITH (FORCE).                                 |
| Same path, sorted platform-file loop                                                    | 40             | Execute the bytes read from the enumerated `.sql` files under `packages/data/migrations/platform`, retaining sorted order and hash provenance.                      |
| Same path, existing offline installation transaction                                    | 45, 46         | Execute only the imported canonical `OFFLINE_STORAGE_TEMPLATE.objects`, then `.bindings`, in their existing order.                                                  |
| `scripts/outbox-storage-catalog-generate.mjs`, existing top-level generation lifecycle  | 27, 69         | CREATE and finally DROP IF EXISTS WITH (FORCE) the same locally generated database-name family.                                                                     |
| Same path, sorted platform-file loop                                                    | 39             | Execute only the canonical platform-file bytes as above.                                                                                                            |
| `scripts/ci-local/prepare-int-template.mjs`, `main`                                     | 135, 136       | DROP IF EXISTS and CREATE the existing template name validated by `^[a-z_][a-z0-9_]*$`; retain no FORCE, prior connection termination and subsequent CLI migration. |
| `scripts/lib/demo-bookmark-storage.mjs`, `installDemoBookmarkStorage`                   | 605            | Execute only the `sql` produced by its actual `renderDemoBookmarkStorage`, after the existing owner/history admission and exact source/hash/framing verification.   |

The five script origins are platform replay in each generator, offline objects, offline bindings, and the rendered demo plan. The six database sites are create/drop in each of the three database-owning scripts. This is a closed inventory, not a root-directory or whole-file raw SQL allowance.

**Outside the new exception:** all 24 directly static statements in the four files, plus the offline generator's literal BEGIN, COMMIT and ROLLBACK, must become ordinary zero-hole repository definitions through the existing checked executor. The static statements include two fixed SET ROLE commands, parameterized backend termination and 21 demo verification/admission catalog statements. Their existing effects are preserved; static classification does not make termination read-only. No new grant to `executeTransactionControl` is needed for the three literal controls.

## Binding implementation constraints

1. Keep every actual raw driver call in the single checked executor. Database operations use a closed internal operation union and validated identifier input, never caller SQL, identifier fragments or a free FORCE flag. Separate generator create/drop-force from template create/drop. Bind each operation to the exact paths/scopes above; no public barrel or runtime service entry is introduced.
2. Preserve generator name construction, the same maintenance database/client, exact quoting, original template regexp/default/CLI option, and existing CREATE/DROP order. An implementation must not broaden targets, prefixes, deletion purpose, FORCE behavior or automatic invocation. No arbitrary caller-supplied database lifecycle function is authorized.
3. Script execution must prove the exact fixed origins in the table. A path-only `executeRawScript` allowlist is insufficient. Bind the actual canonical import/read/render origin and allowed scope; reject substitutions from arguments, request/environment text, arbitrary literals or helpers that erase origin. If a private wrapper is required, it must accept no SQL text and must read/render only these closed origins; its exact forwarding path remains part of enforcement and review.
4. Preserve the role switch immediately after `0002_extensions.sql`, complete migration population and hashes, offline objects-before-bindings atomicity, and current rollback/finally/error precedence. Do not add history tables, skip migrations, swallow rollback errors, change connection ownership or silently acquire another transaction.
5. Preserve demo real-file/symlink checks and both exact source hashes; remove only the already checked outer framing. Owner admission, recognized historical-shape refusal, installation verification and caller-owned rollback remain intact. No generic domain installer or request-supplied source is created.
6. Preserve `--write`/`--check`, output paths, atomic replacement, catalog provenance and existing template environment emission. Official generation/checks update source-bound output; no manual generated digest substitution.

## Typed tooling routing and acceptance

Private typed tooling is an implementation route, **not a new publishable package or release decision**. Repository-local `*.repository.ts` definitions may live in a private tooling workspace with explicit dependencies instead of adding domain SQL to the public data API or root dependencies solely for resolution. If selected, normal workspace/lock/freeze/build-custody rules apply; the published fixed group remains unchanged.

Actual root `.mjs` implementation files must enter a strict `allowJs`/`checkJs`, Node-aware TypeScript project and type-aware provenance gate. A companion `.d.mts` declaration alone does not prove implementation coverage. Preserve source origin across built imports; do not trust a typed declaration without a genuine repository initializer. Native Node24 source loading and all transitive imports must be verified before choosing that route; an existing simple `.ts` import does not prove an executor with `.js` siblings will resolve. Do not introduce a hidden loader, stale-dist dependency, unsafe suppression or a second driver boundary.

Use existing query-only structural ports and actual clients. No full PoolClient fiction, unchecked generic row claims, connection ownership changes or synthesized row counts. Static verifier schemas must preserve their normal FAIL reports for differing catalog facts rather than validate every field against the expected healthy constant.

Inspector acceptance must cover:

- Exact caller/function/operation population, canonical source provenance, and refusal of renamed/moved callers, arbitrary text, substituted imports/renderers, escaped forwarding and unknown operation IDs.
- Hostile/invalid identifiers, same-name custody through create and cleanup, unchanged template validation, and force/no-force distinctions.
- Exact SQL/order, role-switch point, offline transaction behavior, rollback and cleanup on each relevant failure, preserving error precedence and connection closure.
- Demo hash/framing/owner/history refusal, verification failure within caller transaction, and unchanged historical-model reporting.
- Actual typed-JavaScript routing, static24 plus three controls, strict provenance and unsupported raw calls; no lexical count alone establishes closure.
- Official disposable-database generation/check output and source hashes in a coordinated window, followed by combined C+D trace, API review and required full qualification. No generation or successful runtime test is claimed by this source review.

## Accepted bounded decision

The decision authorizes only these eleven existing root lifecycle sites through closed database operations and proven fixed script origins, with exact caller/scope binding and the preservation/negative controls above. Continue the 27 static conversions under existing authority. The historical alternative, not selected, was to defer these eleven admissions while completing independent static work, explicitly leaving their SM09/SM11 enforcement unresolved.

Neither option changes runtime public contracts, enables additional infrastructure effects, adopts a DEVAI version, publishes a package, accepts downstream DETRAN/PORM behavior or closes historical rounds. Release classification/publication and formal DEVAI acceptance remain separate. The exact Owner answer is recorded above; implementation, negative controls and final combined qualification remain pending. No new workflow, publication or exact-commit forbidden-action receipt is inferred.
