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

## Prospective auxiliary descriptor verification — 2026-10-13

This supersedes the product-inline proposal recorded in commit `8fce0b4e`.
Actual installed Doctor reports its generated-workflow boundary false after an
inline guard, and the unchanged adoption tests require every Doctor check true.
The uncommitted product prototype was restored; preserve that refusal and all
assertions. Product candidates retain the byte-exact generated workflow and
normal Doctor requirements. No generated-product-workflow exception is granted.

Actual comparison found that trusted published 2.4.0 and installed 2.6.1 builders
produce identical policies for the same descriptor. Only the four reviewed task
bindings above differ from default-main controls. Do not relabel a policy,
export under an unexecuted descriptor, change the trusted verifier, remove `cmp`
or accept arbitrary candidate policy.

Prepare one isolated, unmerged auxiliary branch from the final reviewed product
snapshot F. Engineer commit W0 changes only the existing registered
`.github/workflows/devai-local-rc-verify.yml` by adding closed descriptor
admission and selecting its admitted descriptor. Independent guard regressions
and Architect review produce auxiliary snapshot B descending from W0. Those
auxiliary CI/test changes never enter the product branch, package or final main.
The auxiliary branch is not claimed to pass product Doctor or the product RC.
Preserve every auxiliary commit, test result and rejected prototype externally.

In the auxiliary guard, ordinary candidate/control canonical digest equality
selects control. The sole transition requires these exact canonical digests:

- control `48c430787a229bd8ee9accb8fa731aea62cc184876957195cfadfbc4d953cfec`;
- candidate `9874165c7677c070c472d6facfe8666fd48fb680244e8cf3b51e8b44fbf77b92`.

Use the trusted verifier's canonical hashing and reconstruct candidate from
control by changing only the four tasks' exact `sensorKinds`, reviewed output
kind and population specified above. Build's output paths remain unchanged.
Require canonical equality with that reconstruction. Retain all 17 declared
tasks, the 15-node RC closure, commands, dependencies, environments, selectors,
toolchains and PASS floors; every other delta refuses. The verifier core remains
byte/structurally identical after stripping only this guard and descriptor
selection. Main still supplies trust/toolchain/environment; retain the pinned
2.4.0 package integrity/provenance, inert candidate handling, exact policy byte
comparison, signature, artifact completeness and all ordinary obligations.

Effect authority remains pending a concrete Owner decision. Freeze the final
reviewed product snapshot F as literal product candidate C; no auxiliary receipt
or CI/test change is added to C. Its normal RC may run while approval is pending.
Present exact C/F, W0 SHA/workflow blob digest and reviewed auxiliary B, with
every CI/product/law/test/config/descriptor byte fixed. One approval may authorize
the W0 `FORBID-CI-WITHOUT-ADR` receipt and one auxiliary-branch dispatch for that
exact C, allowing future B1 only as a descendant of B with append-only exact W0
receipt and Architect trace metadata added. Corpus, assertion projections,
invariants and gates remain unchanged; all other auxiliary bytes equal B and its
workflow blob equals W0. Product C retains its original generated workflow.

Record W0's receipt only in auxiliary B1's canonical authorization registry for
its ordinary pre-push scan. W0 exists solely in auxiliary ancestry; product C
has no corresponding CI change or receipt obligation. Preserve that auxiliary
receipt/branch/evidence, and never merge auxiliary CI, tests or receipt commits
into C. This avoids an unknown future product identity and does not exempt any
actual product forbidden action from its own required receipt.

Run the ordinary full signed 15-node RC and Doctor only on raw-clean product C.
Independently verify and report actual C/tree, complete signed bundle/manifest
and both remote heads before dispatch. The existing published publisher's
`--default-branch` parameter forwards the approved auxiliary branch as workflow
`--ref` while `candidate_sha` remains C. Use that supported CLI directly with
ordinary exact candidate/tree/policy/signer/trust checks; do not patch the
main-hardcoded repository wrapper or installed package. Push product C and B1
through normal hooks first; the evidence-only tag does not make C reachable.

Pin auxiliary remote=B1 immediately before dispatch and verify actual run head
B1, input C, workflow blob and unique successful `verified-local-rc` CheckRun
head C. Do not also dispatch the incompatible ordinary-main verifier for C;
preserve failures and never fabricate/delete a check. Normal protected product
integration follows. Verify full merged-main M tree equals C exactly, then the
unchanged generated main workflow must succeed on M: main now carries the new
descriptor and ordinary equality applies. Auxiliary W0 never lands, so no landed
CI receipt correction loop is introduced. A C check is not an M check.

No previous merge/bootstrap exception grants this consent; no admin bypass,
protected-setting relaxation, force push, unknown workflow edit or test
relaxation is authorized. Moving refs/controls, other post-review mutations or
incomplete RC require renewed review/authority. This rule supplies no literal
future SHA, issued receipt, dispatch, merge or publication claim. Exact-main
publication controls and independent 44-artifact verification remain required.
