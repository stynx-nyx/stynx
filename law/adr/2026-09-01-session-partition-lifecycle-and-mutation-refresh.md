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

## Decision 6 — Protected materialization creates its ignored parent

The exact candidate at commit
`5bd8945e4e0c501f37490dec1e106d4e1791d210`, tree
`b39e4a80f23aee098333a8ddac7c115d30662fd7`, passed every PREPARE dependency
through documentation. Its `test:mutation` node then failed after 1,599
milliseconds and before any package start. A bounded diagnostic exposed the
underlying error: the protected-source materializer attempted to create its
private staging directory beneath `.devai/state/check-cache/v1/artifacts`, but
that ignored parent does not exist in a fresh worktree. The non-recursive staging
creation therefore raised `ENOENT` before protected reconstruction or mutation
execution could proceed.

The materializer now creates only the parent of its governed final evidence
directory, recursively, immediately before deriving its private staging path.
The staging directory itself remains a fresh non-recursive creation, so residue,
collision, and interruption continue to fail closed. An explicitly supplied
diagnostic staging path is not created or repaired by this behavior. Protected
tag, manifest, artifact, reconstruction-chain, roster, projection, process,
atomic-publication, and package-start controls remain unchanged.

Inspector binds the D24.46 materialization sensor to a nested destination whose
parent is initially absent. Engineer owns only the parent initialization and
reuse of that exact parent for the private staging path. The resulting governed
runner is exactly 109,440 bytes, SHA-256
`68f0c18a75a2c7ac98df58f0766e553e03eb5271b3715daaa71f14ce7145e63d`,
Git blob `96944a68fc2825cf5bbca1562471774441a7f7ca`. Architect rebinds only the existing
`devai145Adoption.governanceRunnerTransition.target` identity to those bytes;
its source identity and every other policy field remain unchanged.

## Decision 7 — A refreshed lockfile is a shared mutation input, not a rebind drift

The exact candidate at commit `d93cfe1e5b072ed666e4c11f1a15271944ecdb39`, tree
`51fec4e124e3aac8a1e5777ebe2593587c264a05`, carries the repaired 86-path changed-path
population and passes the release-policy, blocker-contract, trace, roster, security, and
complete unit surfaces. A bounded validation-only invocation of the governed runner's
`rebindCandidateComposition` against the exact materialized protected source, with a
package-start sentinel, stopped at `candidate rebind DEVAI target lockfile identity drifted`
with zero package starts. A PREPARE at this candidate would fail `test:mutation` before any
package start.

The cause is the repaired lockfile. The chained source candidate
`f8a3521a944abc4b5c8a07e1ebae8d349e549fd7` binds `pnpm-lock.yaml` at exactly 959,802 bytes,
SHA-256 `32afdd6bdad69213129226d9e26611594dbf298536dc2d81374713682cf3d98e`. That lockfile
fails `pnpm audit --prod` with two high browserslist advisories (`GHSA-c83g-rgw3-j3cx`,
`GHSA-73wf-gq98-2v4g`) and two low postcss-selector-parser advisories
(`GHSA-w9m9-85wc-3x92`); the preserved `security` diagnostic of the 1 September attempt
records that gate failing on exactly those four. The Engineer repair pinned the patched
versions, and reverting the pins is not an available disposition.

The selective-refresh branch inherited the D24.42 zero-execution rule that the current
lockfile must be byte-identical to the source lockfile apart from declared provider records.
That rule protected reused results. Under `protected-source-selective-refresh-v1` no result
is reused: `pnpm-lock.yaml` is a shared mutation input of every roster package, so any
lockfile change selects the complete roster for fresh execution, exactly as Decision 4
requires. The branch already treats the root manifest this way by exempting the current
manifest from its target identity and field comparisons. The lockfile receives the same
treatment.

Under selective refresh the runner validates only the source lockfile against
`semanticMutationInputTransition.sourceLockfile`, requires `lockfileTransitions` to remain
empty so no lockfile record is normalized or excluded from the input comparison, and
otherwise lets the lockfile difference drive refresh selection through the unchanged
input-projection comparison. It does not bind the current lockfile to a policy identity and
does not compare the current lockfile to the source. The `sourceLockfile` and
`targetLockfile` pair remains the record of the provider transition already validated in
the protected source and is not consulted for the current candidate. The legacy
`zero-mutation-candidate-rebind-v2` branch keeps every lockfile control unchanged.

No test, mutation target, threshold, roster member, non-behavioral exclusion, protected
source identity, materialization step, artifact binding, process provenance, environment,
or toolchain control is weakened.

Inspector owns only assertion-only sensors and lands them red first. They must prove that
the selective-refresh branch accepts a changed lockfile with zero package starts, still
rejects a non-empty transition list, and still selects every package whose shared input
changed; and that the legacy branch still rejects any lockfile difference. Engineer owns
only the selective-refresh lockfile controls in `scripts/run-mutation-evidence.mjs`.
Architect rebinds only the existing `governanceRunnerTransition.target` identity to the
resulting runner bytes and the actual changed assertion projection in `law/trace.json`.
Every touched path is already a member of the exact 86-path population, so
`allowedChangedPaths` does not change.
The resulting governed runner is exactly 110,019 bytes, SHA-256
`45ac846430f6ef2b5404b7c12d557d62d71cc180f5052c557b37747261f1e58b`, Git blob
`3664c010e1f5c08a30b7890c29e6acc5bf332680`.

DEVAI Architect and an independent reviewer must return `PASS` with no must-fix before the
Architect checkpoint is committed. The candidate remains NOT READY until the validation-only
invocation returns success with zero package starts on the resulting exact commit and tree.

## Decision 8 — Mutation startup diagnostics remain portable and observable

The exact candidate at commit `877e0c8ce39887fa4470c30653dca0fb775acdf7`, tree
`7c71e76774a39f5e90ca109ec85bb098a0eacb22`, received two Owner-authorized PREPARE
attempts on 2 September 2026. Both passed nineteen freshly executed mutation packages before
`@stynx-nyx/flow`. The first attempt ran from 02:58Z through 04:22Z; its nineteen recorded package
durations total 4,379,329 milliseconds, and its 4,421,006-millisecond mutation node then reported
`mutation-harness-failure (rejected-workstation-path)` without a score suffix. The protected
diagnostic is exactly 3,020 bytes with SHA-256
`d77c99293354e49dc63ed0faed30093374c9287786889da28693f2efa957ec6b`. The missing score suffix
binds the missing-report path: the flow subprocess exited nonzero without publishing
`reports/mutation/mutation.json`.

A later standalone flow diagnostic was not PREPARE credit and left prohibited setup residue, but
it independently showed that the unchanged flow population could complete in 17 minutes 27
seconds at score 90.83 with status totals Killed 792, Survived 79, CompileError 607, Ignored 310,
and NoCoverage 1. Its normal reporter output included the percent-encoded repository URL
`file:///Volumes/Thiamat%20II/...`. The first failure occurred before the flow report existed and
well before a normal flow duration. Flow is the first roster package whose mutation-test
population starts Testcontainers, and no Colima container event was recorded in the failure
minute. A transient container or spawn failure during Stryker startup is therefore only the
leading hypothesis; the underlying cause is not recoverable and is not a finding.

The second PREPARE ran from 12:48Z through 13:59Z. Its protected diagnostic is exactly 2,974 bytes
with SHA-256 `24884c78590df7b5df208915009605a4d2abdfbabd6a4bb9ebfc588d21aa02fc` and exposed only
`mutation evidence failed`. The independently verified cause was
`packages/flow/stryker-setup-1.js`, created by the standalone diagnostic. The file was a regular
mode-`0644` runner-owned helper at 2,411 bytes and SHA-256
`11ea94ed9ba49a916fb0f6cbb365e896f4ce67958009f7a4320ceebaba14febb`; it was removed before this
decision, and the governed worktree has no remaining mutation residue. This setup-residue refusal
occurred before flow started and was collapsed by the fatal reporter's generic fallback.

The two plant gaps are distinct. First, repository-text normalization recognized only the raw
repository root and raw `file://` form. Node and Stryker percent-encode the space in the volume
name, so routine encoded ESM frames and report locations survived normalization and matched the
otherwise mandatory `file://` host-path rejection. Second, subprocess output was discarded after
classification, while the fatal reporter hid the three portable setup-residue failures. The first
attempt's actual startup error is consequently unrecoverable.

Repository normalization now recognizes the raw root, its `encodeURI` form, and both raw and
`pathToFileURL` repository URLs in text and JSON string values. This exception applies only to the
exact repository root. External `file://`, `/Users/`, `/home/`, `/private/`, `/tmp/`,
`/var/folders/`, Windows drive, and UNC paths remain rejected for classification. A failing
subprocess contributes only its credential-checked, repository-normalized, fixed-host-marker,
UTF-8-safe 4,096-byte tail to the bounded portable failure record; raw stdout and stderr are never
written to evidence. Credential-shaped material is replaced by the existing fixed rejection
message. Fatal reporting admits only the existing package-scoped mutation failures and the exact
three setup-residue messages; every other error remains `mutation evidence failed`.

`scripts/lib/mutation-evidence.mjs` is a shared mutation input, so it is added to the exact
`allowedChangedPaths` population and its change selects the complete 38-package roster already
required fresh by Decision 7. No result, target, threshold, roster member, protected source,
lockfile identity or transition, toolchain, environment, retry, fallback, or normalization of
mutation results changes. The resulting governed runner is exactly 110,798 bytes, SHA-256
`2d2978b3a4adf500d35266d9b59153cc11caf53ddc17b58cd11cab8a29e78339`, Git blob
`893a3fd1763607cd047b59458351491ff3bc8485`. Architect rebinds only the existing
`devai145Adoption.governanceRunnerTransition.target` and the actual Inspector assertion projection
in `law/trace.json`; every other policy and trace field remains unchanged.

Inspector sensors land before the Engineer implementation and prove encoded repository
normalization, unchanged external-host rejection, credential refusal, bounded redaction accepted
by focused-evidence safety checks, absence of raw persistence, and exact fatal-message exposure.
The candidate remains NOT READY until the complete local verification, exact changed-path
equality, and validation-only protected-source rebind all pass with zero package starts.

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
