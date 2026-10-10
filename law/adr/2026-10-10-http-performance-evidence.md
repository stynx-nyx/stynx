---
adr_id: ADR-PERF-0001
title: Complete endpoint latency evidence alongside existing performance gates
status: accepted
date: 2026-10-10
authors: ['Architect']
tags: [performance, slo, evidence, devai, release]
---

# ADR-PERF-0001 — Complete endpoint latency evidence

## Authority and current evidence

The Owner's complete 1.6.0 audit-remediation mandate, recorded in
[ADR-0019](2026-10-10-minor-release-1.6.0.md), includes genuine measurement of
[INV-PERF-001](../invariants/INV-PERF-001.json). This decision specifies the
additive producer and admission boundary. It supplies no advance PASS, completed
implementation, new production input or exception to an existing gate.

The existing `pnpm test:perf` is a cold-unit subprocess proxy with five default
samples and its existing 5000 ms p50, 9000 ms p95 and 0.2 executions/s policy.
Keep that command, its actual comparison operators, task `test:performance`,
profiles and required task population. Its throughput does not measure HTTP RPS.
The four k6 scenarios make actual HTTP requests but cover six protected reference
routes and aggregate HTTP/component metrics. They do not establish every
protected endpoint's p50/p95. Source, mounted runtime and OpenAPI inventories have
not yet been reconciled into complete performance evidence.

## Decision

1. **Additive complete measurement.** Add a separate `test:http-performance`
   descriptor node with repository-root cwd, runner identity
   `stynx-http-performance-v1` and literal argv
   `node scripts/run-http-performance.mjs --scenario all`. That producer is a
   required implementation deliverable, not an existing command. Preserve every
   existing task, dependency, scenario, functional check, load, threshold and
   release precondition. The new task requires the existing reference-app and
   RLS prerequisites and any additional actual composition/build dependencies.
   A dependency/cache hit cannot replace fresh HTTP measurements.
2. **Closed endpoint population.** Follow the
   [endpoint SLO and producer contract](../../docs/performance/http-endpoint-slos.md).
   Every implemented non-public endpoint outside an exact authorized bootstrap
   exclusion must have a declared SLO, admitted fixture composition and executed
   nominal workload. Reconcile the source census, runtime mounted routes and
   generated OpenAPI, including inherited/dynamic routes and framework modules
   absent from the reference application. An unmounted framework endpoint needs
   a supported dedicated mounted composition; absence from the sample is not an
   exclusion. One shared TypeScript AST-backed declaration census must feed route
   inventory, API coverage/OpenAPI and the performance manifest, with exact
   method/class/inherited metadata and separate mounted-composition identity.
   Public status cannot come from nearby text or a path-prefix heuristic.
   Same-method/path alternatives such as E6 and CTG9 need separate admitted
   compositions and operation identities; overwriting one OpenAPI operation with
   another is not coverage. A collision within one mounted composition refuses.
   Unknown or unresolved inventory drift blocks complete evidence.
   Do not expand the bootstrap allow-list, classify an unknown route as public,
   or use external S3/auth/probe traffic to fill protected endpoint cells.
3. **Existing strict SLOs.** Default read limits are p50 < 200 ms and
   p95 < 800 ms; write limits are p50 < 500 ms and p95 < 2000 ms. Preserve any
   stricter accepted endpoint declaration. Check full HTTP latency per canonical
   method/route/composition, and fail a declared p50 or p95 limit breach. Public
   bootstrap operations may remain in scenario setup, but do not dilute endpoint
   distributions. Preserve all existing k6 scenario and component gates in
   addition to these endpoint limits.
4. **Presign policy interpretation.** ADR-HARDENING-0001 decision 3 and the
   scenario default require `storage_presign_duration_ms` p99 < 50 ms. The
   current hardening workflow's explicit 500 ms environment value does not
   supersede that accepted decision. It cannot establish the 50 ms gate merely
   by succeeding. Complete new evidence must enforce 50 ms; align the existing
   workflow through an ordinary separately owned correction and exact workflow
   receipt before claiming policy coherence. This decision neither edits that
   workflow nor raises a threshold, changes a nominal profile or relabels old
   successful evidence as having executed 50 ms.
5. **Fresh owned scenario state.** Preserve campaign D24.45: execute auth,
   crud, upload and cascade-delete, each against a fresh owned stack, with
   health/readiness, fresh summaries, baseline checks and successful teardown.
   Each additional endpoint campaign declares its full workload and owned
   composition. Keep the existing local and hardening nominal profiles;
   diagnostic shortened/reduced/scenario-only runs cannot satisfy the complete
   task. Refuse missing endpoint operations, under-execution and dropped
   iterations. Setup/cleanup must not destroy an ambient stack or database.
6. **Fail-closed results and baseline.** Require structured candidate-,
   population- and input-bound reports with real positive endpoint samples,
   finite p50/p95, actual k6 checks/threshold outcomes, raw artifact digests and
   successful cleanup. Missing or stale output, incomplete populations, runtime
   errors and failed gates refuse PASS, even when a helper exits zero.
   Preserve ADR-HARDENING-0001's comparison math and reference floors. Require
   usable required metric tails and exact authenticated previous-success
   artifact provenance before comparison; the helper's missing-metric skip or
   no-baseline branch cannot confer complete PASS. Keep the existing first-seed
   rule only for proven absence of a prior successful main run; a lost/expired
   artifact is not permission to seed.
7. **Exact admission and tooling.** Bind source/build/SLO/population inputs,
   actual executable and container identities and a closed reviewed environment.
   Docker/DB writes require the published CLI's supported explicit local-write
   task admission. Wildcard ambient `STYNX_K6_*` forwarding and tag strings
   alone are not protected toolchain identity. Adopt verified published DEVAI
   2.4 before materializing its exact supported sensor/task schema. Author
   policy through normal role boundaries and registered CLI binding; never
   hand-edit `.devai/config`, invent draft fields or derive a PASS solely from
   task exit code. No remote-write authority is inferred.
8. **Independent implementation evidence.** Engineer owns producer, descriptor
   and eventual workflow correction. Inspector owns meaningful closedness,
   workload, fixture and boundary regressions plus actual nominal HTTP runs;
   Architect binds SLO/authority and eventual trace/API projections; Auditor
   independently reviews custody and complete populations. Preserve old
   observations, signer trust, normal hooks and all release controls. This
   document alone does not close an issue or a machine cell.

## Completion boundary

Acceptance requires the reconciled closed roster, supported mounted compositions,
exact task/sensor admission, independent fail-closed tests and fresh complete
nominal HTTP evidence on the actual candidate. Until then the missing measurement
remains explicit. No existing test, load, threshold, sample requirement or
mandatory task population is weakened.
