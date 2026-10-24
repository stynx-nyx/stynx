---
id: ADR-0035
title: Fixed ordinary-unit execution budget
status: accepted
date: 2026-10-24
---

# ADR0035 — Fixed ordinary-unit execution budget

The Owner accepted this prospective scheduling amendment on 2026-10-24 with the
exact answer **“Approve bounded ordinary-test scheduling”**. Acceptance authorizes
the bounded implementation and independent verification below; it is not an
implemented repair, passing RC, or publication authorization. ADR0034 in the S10
worktree remains a separate pending public-result proposal.

## Observed problem and diagnostic limits

S8 retry-03 on candidate `f85c9b8c89b4d22cce2626e749c92ce98673a8ab`
passed all 184 data unit cases; the repaired compiler fixture took 19.502 seconds.
The unchanged SDK `codegen-check.spec.ts:78` case then exceeded its existing
30-second budget at 56.476 seconds. The coordinating Inspector reported load
42.48/32.17 on an eight-core, 16-GiB workstation. No peak worker/process census
was captured, so these observations do not prove a particular saturation cause.
Inspector cleanup was confirmed at 13:28:05Z; no signed receipt exists. The durable
observation is `inspector/s8-f85c9b8c-retry-03/summary.json` in the consolidation
evidence directory.

The preceding unchanged compiler case failed integrated attempts at 76.139 and
84.059 seconds against 60 seconds, while an isolated unchanged case passed in
1.573 seconds. The later bounded diagnostic-collection repair preserved its
assertions and timeout. Its passing result does not establish that the whole
unit execution resource topology is sound. The SDK isolated unchanged probe is
still pending at proposal authorship. None of these diagnostics is an RC receipt.

## Exact current topology

- `test-tasks.json` runs `test:unit` through `pnpm run test`, after `typecheck`.
  Installed DEVAI remains 2.6.2. Its `sequentialOnlyTarget`, `resolveCheckWorkers`
  and protected runner require one top-level task at a time for release runs.
  `test-task-exclusivity.json` was deliberately not adopted (DEVAI adoption
  2026-10-08 D4); adding it would not solve nested unit concurrency.
- Root `test` first runs the existing `pnpm api:baselines` precheck, then Turbo's
  test graph with all four current package selectors and no explicit package cap.
  `turbo.json` preserves each test's build dependencies, script-test build roster,
  outputs/cache behavior and the veraPDF-before-PDF test dependency.
- Default Vitest packages do not set a worker cap. The installed Vitest resolver
  uses `availableParallelism() - 1` (minimum one) outside watch mode. Data and SDK
  both use that default. Existing single-thread and sequential-file suites already
  have their own one-worker/isolation semantics and must retain them.
- The central script suite independently uses `node --test ./*.test.mjs`; other
  tool packages also use the Node test runner. Some tests spawn compiler, package
  or code-generation child processes. SDK codegen formats its 652 outputs in an
  awaited loop, not a source-visible unbounded Promise.all formatter fan-out.
  Its synchronous child has its own existing 120-second subprocess timeout; this
  does not replace the enclosing unchanged 30-second Vitest test budget.

Thus a serial release gate can still contain several package schedulers, each
with several file workers and child processes. Actual peak concurrency and its
causal contribution remain to be measured; no exact process-count claim follows
from the static topology.

## Accepted scheduling change

Adopt a fixed ordinary-unit budget, with these fixed limits:

1. Append exactly `--concurrency=2` to the existing root `turbo run test` command.
   Keep its API-baseline precheck, preverified mode, four selectors and command order.
2. Add exactly `--maxWorkers=1` to each ordinary workspace `test` command's Vitest
   invocation, preserving its config path and every chained command. Do not change
   shared Vitest defaults, pool type, isolation, file population, per-test
   concurrency declarations, or existing single-thread/sequential-file overrides.
3. Add exactly `--test-concurrency=1` to each ordinary workspace `test` command's
   Node test-runner invocation. Preserve every file argument, wildcard, preceding
   build command, and subsequent `node validate.js` or other command.

The source census currently contains 50 workspace test scripts: 46 contain
Vitest, five contain Node test-runner segments (contracts contains both). The
roster is discovered from the same four selectors, not frozen to those numbers.
A newly discovered command family is reviewed and classified; it cannot silently
bypass the budget or be dropped. The exact current paths are listed below.

These script edits intentionally also cap direct invocations of each affected
ordinary package `test` script; they are not root-invocation-only settings. Source
inspection found the affected packages’ `test:int` and `test:coverage` commands
invoke their own runners/configurations rather than forwarding to `test`; root
`test:e2e` selects the separate task. `scripts/run-coverage.mjs` invokes each
package’s `test:coverage`. Config files reused by coverage remain unchanged.
`ci-local/inside.sh` does invoke `pnpm test` and would inherit the ordinary-unit
budget intentionally. Inspector must confirm this call-path census prospectively.

This limits admission to two Turbo package slots, each with at most one test-file
worker in its declared runner. It does **not** promise only two OS processes:
Turbo's build prerequisites, package supervisors, threads and existing compiler,
codegen, database/container or test-owned child processes remain. Existing child
lifecycles and subprocess timeouts remain bounded by their current contracts;
the diagnostic census must report any remaining fan-out instead of assuming a
transitive process cap. Two/one is the accepted initial capacity setting; its adequacy remains to be verified.

Use explicit tracked CLI arguments, not an environment override, ambient CPU
mask, shared global Turbo concurrency property, test exclusion or retry. Turbo
strict environment mode remains unchanged: no new environment variable or
pass-through/allowlist is required for the limits, and existing environment
boundaries remain intact. No `NODE_OPTIONS` or Vitest/global-worker environment
escape is introduced.

Preserve task caching and declared outputs. Add explicit tracked input selectors
to `test:unit`, as needed, for the root/workspace manifests and configuration that
control this scheduling (including `turbo.json` and the shared Vitest factory),
so previous results cannot be reused against different scheduling inputs. Retain
all existing selectors and dependencies; confirm runner/verifier task-key parity.
Do not disable caches, force false cache hits, or reuse an old candidate receipt.

## Authority and prospective amendment

The existing restriction is substantive, not merely a stale assertion:

- Campaign-controls D13 requires “default concurrency for unrelated tasks remain
  unchanged”, directs proof of “unchanged unrelated default Turbo concurrency”,
  and prohibits “global serialization” for that historical privacy repair.
- D14's dynamic Redis repair adds no “global serialization” or “task-graph change”.
- The 1.6.0 privacy-tier extension says “Do not change ... unrelated concurrency”.
  Development-contract Engineering rule 9 retains that boundary.
- `local-rc-blocker-contract.test.mjs` checks that root unit `test` has no
  `--concurrency` at the D14 helper and D13 privacy sensor (currently lines 604
  and 5069). Its adjacent E2E no-concurrency check remains applicable and unchanged.

The verification-fix mandate did not silently repeal those explicit preserved-
concurrency clauses. The Owner’s exact approval recorded above now authorizes this
prospective ordinary-unit amendment. Keep the historical ADR and evidence intact;
this accepted record supersedes only the ordinary-unit scheduling restriction
going forward.
It grants no E2E, integration, coverage, mutation, performance, timeout, assertion,
threshold, population, release-version or publication change. The original privacy
six-file tier/coverage union and dynamic Redis ownership protections still apply.

Architect owns this reference and follow-up docs/trace. Engineer owns root and
workspace command plumbing and task-descriptor inputs. Inspector owns executable
sensor configuration/regressions and root-manifest freeze bindings. Constitution
Articles 6, 7, 10 and 30 require those separate checkpoints; the development
contract's rule 6 prohibits weakening tests to obtain a pass. No workflow edit or
new forbidden-action receipt is proposed. No public declaration change is intended.

## Inspector regression and acceptance plan

1. Before implementation, bind a red sensor for the exact proposed admission
   limits and discover the complete current package/command/config/file roster.
   Keep the unchanged baseline observations for comparison.
2. Replace the two unit no-concurrency assertions with positive exact-budget
   contracts plus negative controls for a missing/increased cap, omitted package,
   narrowed selector/file set, dropped build dependency/chained command, disabled
   cache, retry/timeout inflation and environment-based bypass. Preserve the E2E
   assertion and all unrelated D13/D14 checks; do not merely delete failing lines.
3. Assert before/after equality of test population, assertions, test/hook/subprocess
   timeouts, retries, isolation/pool semantics, coverage population/thresholds,
   task dependencies and output/cache declarations. Prove integration, E2E,
   coverage, mutation and standalone build commands/configuration unchanged.
4. Exercise actual orchestration with lightweight barrier-controlled fixtures to
   demonstrate no more than two package slots and one file worker per runner,
   full eventual execution, nonzero failure propagation and owned cleanup. These
   fixture observations cannot substitute for real complete-suite execution.
5. Confirm exact tracked-input/task-key invalidation for the new scheduling inputs;
   root-manifest changes require the existing three Inspector SHA bindings.
   Architect rebinds only changed executable assertion projections afterward.
6. In an exclusive window, run the unchanged SDK probe, then the full ordinary
   unit command with the proposed limits and scoped process/resource observations.
   Record peak worker/child topology and per-suite results. If it fails, diagnose;
   do not automatically loosen the limits, timeout or assertions.
7. Only a clean role-separated candidate with all required complete gates and a
   newly signed exact-tree RC may support integration. Focused passes, resource
   improvements and this accepted design alone cannot promote readiness.

## Current command roster (source observation)

- `packages-web/angular-audit/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/angular-auth/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/angular-flow/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/angular-i18n/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/angular-iam/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/angular-profile/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/angular-sessions/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/angular-storage/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/angular-tenancy/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/angular-trash/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/angular-ui/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/angular/package.json`: `vitest run --config ./vitest.config.ts`
- `packages-web/sdk/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/audit/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/auth/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/backend/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/cli/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/contracts/package.json`: `vitest run --config ./vitest.config.ts && node --test test/contracts.test.mjs`
- `packages/core/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/data/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/feature-flags/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/flow/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/health/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/i18n/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/idempotency/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/integration-adapter/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/jobs/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/logging/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/mobile-runtime/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/notifications/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/offline-sync/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/outbox/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/pdf-a-vera-docker/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/pdf-a/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/pdf/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/preferences/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/privacy/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/ratelimit/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/sessions/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/signature/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/storage/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/tenancy/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/testing/package.json`: `vitest run --config ./vitest.config.ts`
- `packages/worklist/package.json`: `vitest run --config ./vitest.config.ts`
- `test/db/package.json`: `vitest run --config ./vitest.config.ts`
- `test/packages/package.json`: `vitest run --config ./vitest.config.ts`
- `test/scripts/package.json`: `node --test ./*.test.mjs && node validate.js`
- `tools/eslint-config/package.json`: `node --test test/eslint-config.spec.mjs test/rule-families.spec.mjs`
- `tools/migration-linter/package.json`: `pnpm run build && node --test dist/test/migration-linter.spec.js dist/test/context-rules.spec.js`
- `tools/tsconfig/package.json`: `node --test test/tsconfig.spec.mjs`

## Implementation and focused verification checkpoint — 2026-10-24

Engineer `4932061c75acfc10435bd3a8e937a3e0affd6d46` committed the bounded command
and input-selector implementation. Inspector `9bf31e01c48454a1905b75d58bdb0549016aa22a`
committed the preservation/admission/cleanup sensors, baseline fixture and exact
root/descriptor bindings. Both checkpoints used normal hooks. The new sensor is
linked through the existing INV-CORE-001 governance umbrella; this record does
not change an invariant statement or a quality threshold.

The unchanged isolated SDK package passed 77/77. Inspector's final budget suite
passed 24/24 in 5.30 seconds, including actual runner barriers, failure propagation
and interruption cleanup. The original larger cohort had 157 passes and one
offline fixture-preparation failure; after exact frozen temporary-store hydration
restored fifteen locked artifacts, that unchanged Preferences fixture passed in
81.99 seconds. Preserve the failed observation and the separate successful rerun;
do not describe the original cohort as wholly green. Evidence is retained under
`inspector/adr0035-*.log` in the private consolidation evidence directory.

Normalized root freeze is
`52a026774e3090f6d5e75f04aeef446c774691281176f09a0c5847ebe4e61f7f`;
task-descriptor SHA-256 is
`7c2ace1ad4de013a71138a261f9202286308488e134e71cd2b4fd8d542ed7f61`.
Hooks/final-byte verification and exact task-plan parity remain separate checks.
The complete ordinary-unit run and fresh signed RC remain pending in the
coordinated exclusive window. No successful RC, integration, release or downstream
acceptance is asserted by these focused observations or the Architect trace bind.
