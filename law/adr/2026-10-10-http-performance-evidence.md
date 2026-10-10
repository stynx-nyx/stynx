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
9. **Supplemental per-operation qualification.** Accept the
   [supplemental workload contract](../../docs/performance/supplemental-endpoint-workload.md):
   each additional required operation/semantic case schedules exactly 600 target
   requests at 2/s for 300 seconds with 2 preallocated/10 maximum VUs. Default
   execution is one owned composition and one measured operation/case at a time.
   This new sampling design is not a production forecast, existing invariant
   sample floor or advance PASS. Before qualification, bind the percentile
   algorithm, legitimate rolling-window quota allocation, real fixture/resource
   capacity and immutable manifest following non-promoting calibration.
   Prospectively review and bind any larger population or concurrency amendment;
   never tune away an observed SLO failure. Preserve every existing profile,
   threshold, control and strict per-endpoint SLO. Missing admission, fixtures,
   source/build custody or required provider inputs remain blocking.

## Characterized expected-refusal operation

`GET /_probes/readonly-write` remains a required protected operation. Its
existing API-matrix and error-matrix E2E characterizations require HTTP **500**,
`code: READONLY_VIOLATION` and message exactly
`Read-only transaction cannot execute a write statement`. The handler attempts
an insert/update of `tenancy.tenant_settings` through a reader/read-only
transaction. Its successful functional outcome is that exact refusal, with
independent real-database proof that the attempted business write did not occur.
The existing response assertions alone do not establish that database proof.

Bind this one operation as `expected-refusal`, separately from ordinary successful
business operations. Execute the real authenticated, permitted handler with its
normal guards, rate limiting, interceptors and database path. Preserve its
characterized error envelope, including any source-produced context; do not
invent a `statusCode` field or accept arbitrary context as proof of refusal.
A 2xx response, generic 500, wrong code/message, 401/403/429, timeout or transport
error fails the operation. No general 5xx allowance follows from this binding.

Before and after the isolated workload, obtain full-visibility read-only database
evidence for the attempted target and affected business state, including target
row existence and original values/`updated_at`; bind the queries, snapshot
identities and digests to the owned fixture and candidate. Cover both absent-row
insert and present-row update witnesses. No other writer may make that proof
ambiguous. Independently verify rollback/no mutation; an error string, empty
application-role/RLS view or restored state after a hidden mutation is
insufficient. Normal separately declared audit/rate-limit telemetry is not the
forbidden business mutation and must not be silently disabled.

Record every request's full HTTP duration and its exact outcome, with this
operation's own p50/p95, scheduled/completed/sample/failure counts and raw digest
binding. Retain the stricter read limits p50 < 200 ms and p95 < 800 ms for this
read-only refusal path. Include it in complete endpoint population and workload
accounting. A confined expected-status declaration may recognize only this
characterized response for its added workload; it must not change any of the
four existing k6 scenarios' failure budgets, checks, response classification,
loads or thresholds. This is an explicit measured negative witness, not an
exclusion, changed public status or advance runtime PASS.

## Runtime custody and conditional quota reconstruction

The complete producer uses a fresh owned worker with its trusted preloader
installed before any owned application import. Bind the actual Node24 executable
and use its supported synchronous
[`node:module.registerHooks`](https://nodejs.org/download/release/v24.20.0/docs/api/module.html#moduleregisterhooksoptions)
resolve/load interfaces rather than assuming a private CommonJS compile hook
also covers every evaluated module. Refuse ambient preloads, transforms,
compile-cache shortcuts and preexisting owned cache entries. Capture the actual
resolved module closure and evaluated bytes, not merely a caller's source path
and class name.

Produce an independent fresh, nonincremental build receipt binding exact source,
lockfile, manifests, compiler/options/configuration and toolchain inputs to
emitted JavaScript and source maps. Include every actually resolved workspace
output and runtime dependency; reference compilation can emit package source
under its own output root while package exports resolve another output root.
Refuse stale/unknown outputs, unbuilt TypeScript, path escapes, unsupported
transforms and missing closure members. Maps and input hashes alone do not prove
which bytes or class object were evaluated.

For these supported roots, use verified explicit module exports for mounted
constructors and inherited handler origins. Capture actual constructor and
prototype property identities before Nest application creation; bind the source
export declaration and fresh emitted export/class relation, then reconcile those
same objects with actual Nest registration before/after initialization and
measurement. Exporting a composition-owned private reference wrapper is an
acceptable additive private-app change. Class-name matching, copied
`Function.toString()` or a source-map claim is insufficient. Unresolved private,
anonymous, replaced or decorated constructor/handler provenance is refused;
general instrumentation of emitted application code is not authorized by this
decision. Known framework registration observers must be narrowly bound and
independently tested; they do not authorize arbitrary module-cache replacement.

Reuse the real owned bootstrap configuration for all six supported roots,
including normal authentication/permission guards, pipeline, real Helmet,
CORS and body parsers. A reviewed additive observer receipt at the actual
middleware factory-to-registration boundary may record the consumed options and
returned callback identity. Match that actual identity and order to the Express
stack, with exact dependency bytes/configuration and before/after consistency.
Do not recognize security middleware by function text alone or replace it with
a no-op. Unknown middleware, selector overlap, route reachability, implicit HEAD
or OPTIONS remains explicit until independently closed. A verified build alone
cannot promote an incomplete registration census to complete evidence.

The i18n root must implement the accepted
[protected tenant administration contract](../../docs/framework/contracts/i18n-administration-1.6.md).
Privacy remains unresolved: its current unguarded controller, self-elevating
owner service and default no-op Cognito adapter cannot qualify a protected real
provider root. This decision invents neither privileged privacy scope nor
provider approval. Bind the actual authorized privilege/provider contract and
independent evidence before qualifying that root; it remains in the population.

The Redis weighted limiter removes scores at or below `now - W`, refuses only
when `current + cost > limit`, and does not charge refused attempts. Its source
samples `Date.now()` before asynchronous backend evaluation, so evaluation order
need not match timestamp order. A pure `(end-W, end]` arithmetic sweep is not
unconditional proof of actual store capacity. Follow the conditional lag/timebase
contract in the [supplemental workload](../../docs/performance/supplemental-endpoint-workload.md#conditional-weighted-window-arithmetic).
Require independent actual backend member uniqueness as well: the store's
timestamp/per-instance sequence can collide across writers and leave residual
total charge after expiry. Producer charge IDs do not prove that property.
The arithmetic kernel supplies no admission verdict, verified assumptions,
bucket authentication or complete producer evidence. No new task/sensor schema
field, load change, exclusion or threshold change follows from these contracts.

## Completion boundary

Acceptance requires the reconciled closed roster, supported mounted compositions,
exact task/sensor admission, independent fail-closed tests and fresh complete
nominal HTTP evidence on the actual candidate. Until then the missing measurement
remains explicit. No existing test, load, threshold, sample requirement or
mandatory task population is weakened.

## Composition registry and minor SDK compatibility

The Architect-owned `law/policy/http-api-compositions.json` and its closed schema
bind the two exact E6/CTG9 controller alternatives, four known POST collision
groups, explicit E6 compatibility primary and confined per-composition artifacts.
Unknown groups or variants remain refused. Their declaration mapping does not
substitute for actual mounted-runtime evidence.

The same registry records 26 exact published operation-ID compatibility mappings,
derived only from the raw 1.5.7 OpenAPI and source at immutable base
`03f9a6ae8938dfaa64a33870d60f9f8b448efe10`. Preserve existing primary SDK names
and exports while exposing the corrected actual handler in `x-stynx-handler`.
New endpoints/fixtures without an exact mapping use actual handler IDs. Correct
request/query/security metadata remains required; identity compatibility is not
permission to freeze a defect or admit cross-variant schemas. Follow the exact
registry semantics in the endpoint contract, and independently verify all old
primary client operations plus every admitted variant. No generated file or
mutable operation spelling can create compatibility authority.
