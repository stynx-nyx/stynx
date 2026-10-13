---
adr_id: ADR-DEVAI-ADOPTION-0022
title: Supported task-bound readings and complete individual scorecard collection
status: accepted
date: 2026-10-12
authors: ['Architect']
tags: [devai, evidence, scorecard, sensor-inputs, task-admission]
---

# ADR-DEVAI-ADOPTION-0022 — Supported task-bound collection

## Authority and diagnosis

The Owner's 1.6.1 mandate prioritizes evidence collection before practical audit
remediation. The verified 1.6.0 main observation contains 43 UNKNOWN and the two
existing N/A cells; absence of admitted readings is not evidence of 43 product
failures. Published DEVAI 2.6.0 supports individual task-bound measurements but
refuses a task-backed sensor in any preset with `SENSE_TASK_PRESET_REFUSED`.
This decision prospectively amends the recording protocol of ADOPTION-0014 and
the sensor-input portion of ADOPTION-0021; other requirements remain binding.
No historical reading, scorecard, chain prefix, threshold or population is edited.

## Supported inputs and exact command identity

Policy `stynx.devai-adoption` advances 1.6.2 → 1.6.3. Replace the refused ad hoc
`type_check.argv` and declare these supported task-mode sensor inputs:

| Sensor            | Existing descriptor node | Exact argv retained     | Population            |
| ----------------- | ------------------------ | ----------------------- | --------------------- |
| `type_check`      | `typecheck`              | `pnpm run typecheck`    | `workspace-typecheck` |
| `build`           | `build`                  | `pnpm run build`        | `workspace-build`     |
| `perf_test`       | `test:performance`       | `pnpm run test:perf`    | `cold-unit-perf`      |
| `migration_check` | `db:rls`                 | `pnpm run devai:db-rls` | `migration-rls`       |

Each input is exactly `{ taskId, population }`. Engineer registers the named
sensor in that existing task's `sensorKinds` and adds the matching
`outputContract.population`. Use supported `command-result` output kind for
typecheck, cold-unit performance and migration; `workspace-build` for build,
retaining its declared output paths. Preserve exact argv, cwd, dependencies,
runner, input selectors, environment allowlist and toolchain keys. The label is
not a measurement; executing an admitted task and recording its actual output
is required. The ordinary RC graph/commands remain the same fifteen nodes.

Task-bound sensing requires the actual supported prerequisite check-cache receipt
(schema 1.1.0, affected or RC profile), bound to the exact repository, candidate,
policy, task keys and result digests. Execute the required prerequisites through
the registered check path first. Raw stdout or a signed export cannot substitute
for that cache receipt; the selected sensor task still executes anew.

The performance task is the retained cold-unit subprocess measurement. It is
not k6, HTTP qualification, endpoint latency or native performance. No k6 or
mutation execution is authorized. Do not add those tasks to obtain a green cell.

Architect rematerializes sensor inputs only through installed published CLI
`init bind` from the adoption policy, after the descriptor checkpoint is present.
Inspect its actual dry-run/write receipts and Doctor. Never hand-edit generated
`.devai/config` or pretend a refusal succeeded. Descriptor changes move exact
candidate/task identity; rebind the prospective 1.6.1 release descriptor digest
only after independent inspection of this named additive admission change. Keep
the historical 1.6.0 descriptor identity immutable.

## Complete supported recording protocol

At a clean, fixed exact candidate, execute and record inventory regeneration
first, including atomically published inventory bodies in dependency order.
Then execute every registered first-pass member of the installed canonical sweep
individually in its canonical order and record each actual returned reading.
Finally execute/record both registered second-pass readers and independently
observe the full scorecard. Preserve the installed canonical sensor population;
individual invocation is a supported admission path, not permission to omit a
failing member. A task-mode preset refusal is not worked around by modifying the
installed package or supplying synthetic member context.
Capture both actual stdout and stderr gate envelopes, including returned
`error.context.payload.results`; failed readings are not discarded merely because
the CLI reports `ACTION_GATE_FAILED` on stderr. Preserve original failed attempts
and append corrections when an earlier collector parsed the streams incorrectly.

Inspector owns the recording session; Auditor independently verifies exact
candidate/inputs/outcomes, append-only custody, history preservation and full
population. Use registered producer-side instance/supersession for a genuinely
new measurement; identical recording remains idempotent and collisions refuse.
Wrong-kind commands, extra arguments, foreign candidates, unbound populations
and missing provenance still refuse. An error produces no fabricated reading or
PASS. Explicitly record any unsupported/unexecuted measurement as an observation
limitation in the audit report; preserve its UNKNOWN/REVIEW/FAIL outcome as the
machine actually emits it.

Execute only admitted practical ordinary measurements. If the installed preset
contains a member requiring prohibited k6 or mutation execution, do not execute
it and disclose that exact member as NOT_OBSERVED/NOT_RUN; do not silently remove
it from the declared population or relabel it N/A. Existing cold-unit performance
may execute because its exact task contains neither prohibited workload.

## Unresolved supported interfaces

DEVAI 2.6.0 does not admit arbitrary task-mode `coveragePath` replacement or
service-profile/native integration shortcuts. Coverage requires a genuine
executed population, complete result roster/reporter and its supported provenance;
ordinary test success alone is not coverage evidence. Keep those cells UNKNOWN
until the actual supported inputs are available. Upstream fixes belong to the
dedicated DEVAI session and may be adopted only after independent publication
verification. This amendment establishes no future package capability.

Preserve the two existing N/A cells, unchanged thresholds/lookbacks/minimum
samples/exclusions, historical 1.5.7 observation bytes and proof-chain prefix.
`readiness_promoting=false` remains mandatory. Practical green cells are earned
by actual new measurements and product repairs, never a weaker denominator or a
claim that full audit PASS is a release precondition.

## Prospective published DEVAI 2.6.1 patch adoption

The Owner's continuing 1.6.1 mandate authorizes the narrow upstream repair and
published dependency adoption needed for this collection protocol. This is
prospective authority: it does not assert that 2.6.1 is published, installed or
accepted. Before adoption, independently verify its actual registry archive,
integrity, source/tag/release identities and complete installed file population.
Architect records those exact observed identities in the package identity policy;
Engineer then pins the published version and lockfile. An unpublished archive,
sibling source or rehearsal package cannot supply the final adoption.

This patch is limited to consistent executable-test filename classification,
Doctor's declaration bootstrap admission and task-bound dry-run authority. It
adds no adopter input interface, inventory capability, release scope or sensor
population. The current adopter source policy and exact task declarations remain
unchanged. Constitution 1.0.2 and its pinned digest remain unchanged.

After the exact published package is installed, Architect uses its registered
CLI under the declared toolchain. Inspect read-only
`init upgrade --target . --as-role architect --format json` before the matching
operation with `--write`. The isolated prepublication rehearsal proposed only
these generated refresh targets:

- `.devai/constitution.md`;
- `.devai/config/github-actions-host-adapter.json`;
- `.devai/config/authority-policy.json`;
- `.devai/config/upgrade-receipt.json`.

The actual installed plan governs; a changed target set, refusal or unresolved
obligation requires review of the concrete result before mutation. Then inspect
and apply `init bind --target . --adopter-policy law/policy/devai-adoption.json
--as-role architect --write --format json`, retaining the operational-law then
adopter-policy ordering in ADOPTION-0010. Never hand-edit generated configuration,
change adapter selection, refresh an unrelated hook or silently accept retired
keys. Verify generated digests, postchecks, current/no-op upgrade readback and
unskipped Doctor. Existing exact forbidden-action receipts grant only their
recorded operations; any actual workflow edit requires its own exact-commit
Owner receipt under the existing controls.

Inspector independently rebinds dependency freezes and verifies the installed
package. Legitimate `.e2e.ts` and `.wiring-spec.ts` tests must agree between the
trace and executable-test classifiers without renaming or relabeling tests.
Doctor may report task declarations ready without execution-prerequisite
receipts only as `declaration-plan`, `diagnostic-only` readiness. Actual task
execution must still refuse missing or foreign prerequisite receipts. Task-bound
dry-run must preserve the normal Inspector declaration/consent boundary; a
read-only host plan must not bypass the task's declared local-write authority.
None of these results is an execution receipt, reading or release verdict.

Hash and preserve every preexisting observation/proof file, the historical 1.5.7
observation bytes and proof-chain prefix. No k6 or mutation execution is
introduced. The two existing N/A cells, thresholds, populations, lookbacks,
minimum samples, exclusions and `readiness_promoting=false` remain unchanged.
A partial adoption or failed check remains visible; it cannot be promoted to a
successful collection or overall audit PASS.

## Published 2.6.1 adoption record — 2026-10-13

Independent upstream publication verification completed before actual adoption:
registry/archive SHA-256
`b6e481480d9273d2cbefc5519034d6f9841050552ea2262846fb81f6b1aca311`,
signed tag object `5686a85acb3b7e5e02a66abdff20ac4ca3af61cb`, source commit
`082eefb196d9240516ab947ba9985f39d2a99251` and tree
`39c1ba2080863ed5f02bea0e306348fa4bb9b65d`. The exact registry integrity,
tarball and source identities are recorded in
[package identity policy 1.8.0](../policy/devai-package-identity.json).
The immutable [DEVAI v2.6.1 release](https://github.com/aarusso-nyx/devai/releases/tag/v2.6.1)
is dependency publication evidence, not STYNX publication or readiness.

A normal frozen-lockfile install supplied the published package; all 423 installed
payload files independently matched its registry archive. The actual installed
upgrade preview admitted exactly `MIG-2.6.1-runtime-repair-identity-refresh`, with
no retired keys, replaced defaults, obligations or refusals. Its five targets
were the constitution pointer, project version, adopter-policy binding receipt,
compiled authority and GitHub host adapter. The project/receipt version refresh
is the same reviewed result as the isolated rehearsals, not an additional policy
interface. The upgrade receipt is the sixth generated changed file. No workflow,
constitution pin, adopter source policy, task descriptor or operational-law bytes
changed; no generated file was edited by hand.

Registered upgrade/write followed by adopter-policy bind/write passed under the
Architect declaration. All five upgrade target digests matched, the journal
reported no interrupted bind, and the final upgrade preview was current/no-op.
Unskipped Doctor passed all 16 checks. Its four task rows were declaration-plan,
diagnostic-only readiness; they establish no execution-prerequisite receipt or
measurement standing. Independent Inspector package/freeze checks remain required.
All 125 preexisting historical record/proof/state files and the source adoption
policy remained byte-identical. No canonical observation, proof-chain append,
k6 or mutation execution was performed by this adoption.

## Prospective exact descriptor trust transition — 2026-10-13

Actual pre-RC comparison found that the trusted published 2.4.0 and installed
2.6.1 builders produce identical policies for the same descriptor, but the four
reviewed task-binding changes above make the candidate policy differ from the
default-branch control descriptor. Preserve that refusal. Do not relabel the
policy, export under an unexecuted descriptor, change the trusted verifier pin,
remove `cmp`, or accept arbitrary candidate policy.

Permit a single closed STYNX-owned admission extension in the otherwise
package-generated `.github/workflows/devai-local-rc-verify.yml`, paired with its
existing operations reference. This prospectively amends only the earlier
generated-workflow no-edit rule for this reviewed guard; the generated verifier
core, package integrity/provenance, inert candidate handling and protected
main-sourced trust/toolchain/environment controls remain unchanged. Future
registered generation must preserve this reviewed extension or refuse pending
review, never silently erase it. No `.devai/config` hand edit is authorized.

The ordinary path requires candidate and control descriptor canonical digests
equal and reconstructs from control. The sole transition path requires both:

- control digest `48c430787a229bd8ee9accb8fa731aea62cc184876957195cfadfbc4d953cfec`;
- candidate digest `9874165c7677c070c472d6facfe8666fd48fb680244e8cf3b51e8b44fbf77b92`.

Use the pinned trusted verifier's canonical hashing and independently reconstruct
the expected candidate from control by changing only the four named tasks:
their exact `sensorKinds`, the reviewed `outputContract.kind` and matching
population in the table above. Build retains its original output paths. Require
canonical equality with that reconstructed descriptor before selecting candidate
for policy reconstruction. Every other descriptor field, all 17 declared tasks,
the ordinary 15-node RC closure, commands, dependencies, environments, selectors,
toolchains and required PASS floors remain unchanged. Any other descriptor delta
refuses. Preserve exact reconstructed-policy byte comparison, signature/trust,
artifact completeness and every ordinary verifier obligation. Once main carries
the reviewed descriptor, normal equality applies; this is not a general candidate
descriptor fallback.

Effect authority remains pending a concrete Owner decision. Prepare Engineer CI
commit W0, independent Inspector regressions, and final Architect bindings before
requesting approval. Present W0's exact SHA/workflow blob digest and a reviewed
final snapshot F descending from W0, with all product/law/tests/config/descriptor
bytes fixed. One approval may authorize the exact W0 `FORBID-CI-WITHOUT-ADR`
receipt and one reviewed-branch dispatch for a later candidate C only when C
descends from F and its only tracked changes are append-only exact-action
receipts and Architect trace metadata with corpus/projections/invariants/gates
unchanged. Workflow bytes equal W0; all other frozen bytes equal F. Independently
verify and report actual C/tree, successful signed 15-node RC and immutable
manifest before dispatch. Resolve the workflow ref to that exact C, retain main
controls, and use normal protected integration. An actual rebased landed CI
receipt remains bound to the same approved workflow blob and action mandate.

No previous merge-method/bootstrap exception supplies this new dispatch consent;
no administrator bypass or protected-setting relaxation is authorized. A changed
workflow, additional source change, moved control identity or incomplete RC
requires renewed review/authority. This prospective rule is not an approval of an
unknown literal SHA, an issued receipt, a dispatched run or publication success.
Inspector must prove ordinary equality, the sole exact transition and refusal
of every unapproved descriptor/task/floor change through the actual guard.
