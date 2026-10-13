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
