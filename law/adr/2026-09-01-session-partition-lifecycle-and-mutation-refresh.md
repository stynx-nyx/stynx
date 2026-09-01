# ADR — Session partition lifecycle and protected mutation refresh

- **Status:** Accepted
- **Date:** 2026-09-01
- **Authority:** Architect
- **Amends:** `2026-08-24-ci-economy.md` Decision 6a
- **Related:** `ADR-SESSIONS-0001-provider-neutral-session-control.md`,
  `2026-08-16-trusted-local-rc-evidence.md`, and D24.33–D24.45 of
  `2026-08-24-stynx-1.1.1-campaign-controls.md`

## Context

The exact STYNX 1.1.2 candidate at commit
`588c96736e423c5550fbc355c3e4b5118dcd5ced`, tree
`e8fe5e651514e4541ea82544c288703966ea88b3`, passed local-RC environment and
toolchain preflight but failed `reference:apps` after UTC crossed from August
to September. The migrated integration template contained only
`auth.sessions_2026_08`; session rows timestamped on 1 September therefore
failed with PostgreSQL error `23514`, “no partition of relation sessions found
for row”. The template-cloning contract was functioning as designed, but it
faithfully cloned time-stale DDL.

The same PREPARE attempt failed `test:mutation` before any package start. A
bounded zero-execution diagnostic proved that the protected tag, 77-artifact
population, two historical rebind steps, and exact 37,433-byte source summary
can all be reconstructed. The current-candidate validator then rejected the
PR's changed-path population before publication. Several newly changed paths
are genuine mutation inputs, including generated i18n source catalogs. The
database repair established by this decision also changes `@stynx-nyx/data`
and `@stynx-nyx/sessions` inputs. Adding those paths to a zero-execution
allowlist would falsely preserve results whose complete input projection has
changed.

## Decision 1 — Monthly partitions remain declarative and are maintained ahead

`auth.sessions` remains a range-partitioned table by `created_at`. STYNX does
not rotate a populated ordinary “current” table into a partition at month end.
That design would move correctness onto a lock-sensitive period-boundary DDL
operation, complicate late-arriving rows, and make a missed rollover harder to
recover safely.

An additive platform migration supplies one idempotent, concurrency-safe
`auth.ensure_session_partitions` function. It:

- derives UTC calendar-month bounds from a supplied reference instant;
- creates the reference month and a fixed two-month look-ahead;
- serializes creators with a transaction-scoped advisory lock and rechecks
  catalog state after acquiring it;
- derives identifiers internally and never interpolates caller-provided names;
- verifies an existing relation is an attached partition with the exact bound;
- fails on name, relation-kind, attachment, or bound drift; and
- runs with a fixed safe `search_path` under the migration owner.

The migration creates the current and next two partitions immediately. The
migration runner invokes the maintenance function after every migration pass,
including a pass where every migration was already recorded. This makes normal
application startup and migrated-template preparation refresh the horizon
instead of treating schema-migration idempotence as partition-maintenance
idempotence.

The session mirror calls the same function in its transaction before inserting
the session row. This is the final on-write safety path for a process that has
remained alive longer than the look-ahead horizon. It follows the existing
`audit.ensure_monthly_partition` pattern and executes before partition routing.
No trigger is used: routing failure can occur before a row trigger on a missing
partition can repair the partition map.

The function is executable by the application role only through a bounded
zero-argument facade that maintains the clock-relative horizon. Arbitrary
reference-time maintenance remains owner-only. Session writes fail closed if
partition maintenance itself fails.

## Decision 2 — A default partition is an outage buffer, not accepted steady state

The migration adds `auth.sessions_default` as the default partition. It keeps a
direct or legacy writer from losing a session solely because proactive
maintenance was missed. The normal writer must still maintain the bounded
horizon before insertion.

Maintenance refuses to attach a monthly partition when the default partition
already contains rows in that month. It reports a stable, bounded operational
error and leaves those rows intact. Moving accumulated default rows is an
explicit repair operation because it requires stronger locks and independent
verification; it is never performed silently on the request path. Tests and
operational checks require the default partition to remain empty during normal
operation.

## Decision 3 — Template freshness is positively verified

The integration-template preparation command gains a non-destructive
maintenance mode. It connects to the named migrated template, verifies the
maintenance function exists, advances the partition horizon, verifies exact
current/next partition bounds and an empty default partition, and exits before
any clone is created. The normal rebuild mode performs the same verification
after migration.

The trusted local-RC wrapper executes this maintenance mode before handing
control to DEVAI. Missing function, missing partition, wrong bound, default-row
debt, connection failure, or template-name drift fails before the governed
graph starts. Credentials remain environment-only and are never written to
evidence or diagnostics.

## Decision 4 — Candidate mutation evidence refreshes only changed projections

The protected 38-package source composition remains immutable input. Candidate
handling evolves from `zero-mutation-candidate-rebind-v2` to a protected-source
selective refresh:

1. Materialize and authenticate the exact protected 77-artifact source and the
   exact chained 37,433-byte summary as before.
2. Validate the exact candidate, tree, cleanliness, roster, thresholds,
   targets, artifact bindings, source provenance, environment, and toolchain.
3. Compare the complete source and candidate mutation-input tree entries for
   every package.
4. Exclude only policy-enumerated, byte-bound non-behavioral paths such as
   package `README.md` files. Source, test, configuration, generated runtime
   catalog, migration, manifest, and lockfile changes are never documentation
   exclusions.
5. Require the computed changed-projection package set to equal the exact
   policy roster before any package starts.
6. Copy unchanged package report/result bytes from protected source; execute
   each changed-projection package exactly once with the unchanged mutation
   target and threshold contract.
7. Validate fresh process results, reports, scores, status totals, portability,
   and candidate input projections, then publish one complete 38-package
   candidate summary atomically.

An unexpected changed path, changed-projection roster, package start, missing
fresh report, failed score, infrastructure error, interruption, or publication
failure preserves the authenticated source and leaves no accepted candidate
composition. There is no fallback to zero-execution acceptance, partial
evidence, stale result substitution, or a second package attempt.

The candidate summary distinguishes `fresh` and `protected-reused` provenance.
Reused entries retain their original report/result bytes and historical input
identity plus the exact non-behavioral exclusion contract. Fresh entries bind
the current candidate input projection and successful process tuple.

## Decision 5 — Selective refresh has no ambient cheap-gate marker dependency

The exact candidate at commit
`05ee9ad4b0fc155c64916eddcc85bc65055874f8`, tree
`072dc4333b715a7b27fcb0ec483415a1579e705c`, passed every PREPARE dependency
through documentation, but `test:mutation` failed after 1,930 milliseconds and
before any package start. Protected source materialization and validation-only
selective rebind both passed independently with zero package starts. The next
statement required the ignored file
`.devai/state/check-cache/v1/artifacts/d24-32-cheap-gates.json`; no repository
code creates that file, so a fresh worktree cannot satisfy the prerequisite.

That marker belonged to D24.32's one-time, manually sequenced four-package
composition. It is not an input to this decision's protected-source selective
refresh and cannot authenticate PREPARE results: its schema contains only the
candidate, tree, 14 historical gate names, Boolean pass values, and opaque
digests. Retaining it would make a fresh PREPARE depend on untracked ambient
state and would still not bind those values to DEVAI's task descriptors,
inputs, dependency results, toolchain, or environment.

The selective-refresh branch therefore must not read or require the D24.32
marker. It continues to fail closed on the exact candidate and tree,
cleanliness, protected source and reconstruction chain, complete mutation-input
projections, exact 38-package refresh selection, roster, targets, thresholds,
infrastructure preflight, process outcomes, artifact bindings, atomic
publication, and every DEVAI dependency of `release:prepare`. The marker
validator remains unchanged for the legacy D24.32 composition branch where its
campaign-specific contract applies.

Inspector owns the assertion-only regression proving that the
`protected-source-selective-refresh-v1` path reaches infrastructure preflight
and the exact package roster without reading the ambient marker. Engineer owns
only removal of that one call from the selective-refresh branch. No test,
threshold, target, package, dependency, gate, evidence identity, or protected
input is removed or weakened.

The resulting governed runner is exactly 109,259 bytes, SHA-256
`1c1e04f4fa08692f2a228af3c3d0c336355e1d88d2ec741affbdd1d6c6c6f030`,
Git blob `8f2ca9a7b42d3751376458104c183dac3eb992fb`. Architect rebinds only the
existing `devai145Adoption.governanceRunnerTransition.target` identity to those
bytes; its source identity and every other policy field remain unchanged.

## Verification

Inspector sensors must prove:

- migration from an empty database creates current, next, next-plus-one, and
  default session partitions with exact UTC bounds;
- maintenance is idempotent and concurrent calls produce one exact population;
- a synthetic month rollover succeeds without rebuilding the database;
- wrong relation, attachment, or bound and nonempty-default debt fail closed;
- the session writer invokes maintenance before insert;
- template maintenance mode advances a stale template and rejects drift;
- protected materialization still reconstructs the exact source with zero
  package starts;
- documentation-only changes select no fresh package;
- generated i18n, migration, session, test, target, config, manifest, or
  lockfile changes select every and only affected packages;
- a selection mismatch fails before package start;
- unchanged artifacts are byte-identical, fresh artifacts are candidate-bound,
  publication is atomic, and interruption leaves no accepted partial state;
  and
- no credential, workstation path, raw Stryker output, or protected source byte
  leaks into tracked content or exported evidence.

No test, mutation target, threshold, roster member, RLS rule, evidence signer,
or protected provenance identity is weakened by this decision.

## Authorization boundary

This decision authorizes the role-separated local implementation and
non-PREPARE verification requested by the Owner. It does not authorize a new
PREPARE attempt, standalone package mutation run, evidence publication, push,
merge, tag, release dispatch, `publish:true`, registry publication, deployment,
repository-settings change, or token change.
