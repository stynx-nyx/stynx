# HTTP endpoint SLO and evidence contract

[ADR-PERF-0001](../../law/adr/2026-10-10-http-performance-evidence.md) accepts the
additive genuine HTTP producer for INV-PERF-001. This contract describes required
implementation and evidence; the producer, complete mounted inventory and nominal
measurements are not yet accepted as complete. Existing historical evidence stays
unchanged.

## Endpoint identity and SLO binding

The closed measurement manifest must identify each required endpoint by source
package/file/controller/handler, HTTP method, normalized runtime path and mounted
composition identity. Preserve global/version prefixes and distinguish ambiguous
same-path registrations. Bind permission/public metadata, read/write effect,
fixture operation, expected successful response semantics, SLO authority and
thresholds. Generated runtime/OpenAPI routes must reconcile against source
controllers, inheritance and dynamic registrations. The textual
`scripts/list-routes.mjs` census is a candidate list, not sufficient proof of the
mounted population; missing directories or unknown decorator shapes cannot
silently reduce it. Include routes found only at runtime or in generated OpenAPI.

Every implemented non-public endpoint outside its exact documented bootstrap
exclusion is required. The existing
[bootstrap allow-list](../../law/invariants/RBAC-001-allowlist.json) names only
three reference pre-auth operations. Preserve its current entries/justifications
and each actual explicit public marker; do not add exclusions through a workload
manifest. A public-tenant marker must retain its actual tenancy contract, rather
than being treated as an arbitrary permission bypass. Each exclusion carries its
exact source authority and mounted identity and is independently checked. Merely
unmounted, hard to seed, destructive, slow or unknown is not an exclusion.

Default SLOs from
[INV-PERF-001](../../law/invariants/INV-PERF-001.json) are:

| Operation | p50      | p95       |
| --------- | -------- | --------- |
| Read      | < 200 ms | < 800 ms  |
| Write     | < 500 ms | < 2000 ms |

Equality fails these strict inequalities. Preserve stricter accepted per-endpoint
SLOs. GET/HEAD versus mutating methods is an initial classifier, not permission to
misclassify a read implemented through POST or a GET side effect. Resolve effect
from the actual handler contract; unknown effect blocks the manifest. Do not use
the cold-unit proxy's 5000/9000 ms limits as HTTP SLOs.

A source census on the 1.6.0 Architect checkpoint found 210 routes, seven carrying
its `Public` marker and 203 other candidates, including 44 reference routes.
These counts are a discovery checkpoint, not a fixed cap or full runtime claim.
The appendix enumerates those candidates so fixture coverage cannot silently be
reduced to the existing six routes. The mounted framework inventory must also
include inherited controllers such as `GuardedPreferencesController`, and
supported compositions for APIs not mounted by `reference/api`. Final completeness
requires exact reconciliation; a future source addition changes the required
population even when this discovery appendix has not yet been refreshed.

## Shared AST producer and composition closure

Use one shared TypeScript AST-backed source declaration producer for route
inventory, API coverage/OpenAPI and the performance population. Its declaration
record includes source file/package/class/handler identity, exact attached route
decorator(s), verb/path arguments and source position, class prefix and inherited
method origin, imported decorator symbol identity and attached class/method
permission/public/public-tenant/system/read-only metadata. Parse inline/multiple
and multiline decorators correctly. Resolve handler/class metadata using the
actual guard/framework precedence, including inherited classes; unknown aliases,
computed route arguments, inheritance or dynamic registration require explicit
supported resolution or fail closed. Do not infer public status from a preceding
500-character window, an unrelated previous method or `/health`/`ready` prefixes.
In particular `/_probes/readonly-write` is protected despite preceding public
probe methods.

Keep two distinct projections. The shared AST result contains class records,
own method declarations, inheritance edges and source origins. The declaration
projection contains each own decorated handler once: 223 at this checkpoint,
including the seven base `PreferencesController` declarations.
`GuardedPreferencesController` declares zero own handlers; it must not add seven
synthetic source declarations. The mounted projection expands its seven inherited
handlers for that actual subclass and composition, retaining the base origin plus
the mounted class identity. A second composition may mount the same origin again
without changing the source declaration count. Never flatten these identities or
inflate declaration CSV counts with mounted copies. Future source methods change
the declaration population normally; 223 is a checkpoint, not a cap.

Preserve the existing API-coverage source-root configuration unless a separately
reviewed change expands it. Its current 215 declarations exclude the eight domain
declarations. Full performance discovery includes all 223, so the domain routes
need a declared supported OpenAPI/runtime composition and measurements, or remain
an explicit blocking inventory gap. Do not silently alter the global API root
configuration or drop domain routes to make the counts agree.

The shared internal implementation belongs at
`scripts/lib/nest-route-declarations.mjs`; the list-routes CSV shape, filters and
deterministic ordering remain compatible. API coverage retains existing
path-diagnostic fields but adds method-aware declaration/operation diagnostics;
path-only matches cannot satisfy strict coverage. All three consumers must use
the same declaration identity and metadata rather than keeping competing parsers.

Support no-argument/string-literal route paths and static string arrays without
silently selecting the first element. Statically resolved Controller options must
retain their path arrays, version/host selectors and relevant composition context.
Emit the exact Cartesian registrations actually admitted by the framework.
Unsupported computed values refuse with source/class/member diagnostics; never
invent a root route, discard a path alternative or execute arbitrary source to
resolve it. Track explicit HEAD/OPTIONS and other supported verbs accurately.
Preserve an ALL registration as such until a bound composition supplies its
complete supported method roster; expansion must retain that provenance and
cover each actual supported method. An unresolved ALL population cannot pass as
GET-only, empty or guessed OpenAPI coverage. Implicit framework-generated HEAD or
OPTIONS routes must be identified from the mounted adapter, distinguished from
explicit declarations and accounted for in the admitted runtime population.

The mounted record adds composition ID and source/config digest, actual registered
controller/class identity, global/version prefixes, effective handler metadata,
method and normalized full route. Reconcile source declarations to actual runtime
routes and composition-specific OpenAPI operations bijectively, preserving
alternative registrations. An inherited base handler and its mounted subclass
are linked explicitly; registering the same declaration in another composition
is a distinct mounted identity, not an accidental double count.

Two declarations sharing METHOD/path cannot be flattened into a single global
OpenAPI operation. The four E6/CTG9 pairs are POST
`/offline-sync/numbering-reservations`,
`/offline-sync/numbering-reservations/:id/cancel`,
`/offline-sync/sync-batches` and `/offline-sync/conflicts/:id/resolve`.
`OfflineSyncController` and `CTG9OfflineSyncController` are supported alternatives
with distinct contracts. Bind and measure each in its explicit supported
composition and generate/check its corresponding operation identity. A collision
inside one composition is an error, never last-writer-wins. One surviving global
OpenAPI object cannot prove both declarations. Preserve current API/SDK consumers
and make any generated compatibility changes through their ordinary review and
regeneration boundaries, without silently weakening coverage checks.

For existing generated API consumers, retain the current E6 operation as an
explicit declared compatibility projection for these four pairs, preserving its
existing URL, operation contract and identity. Record the selected source and
complete alternative operation records in `x-stynx-operation-variants`, each bound
to its exact source/controller and admitted composition. Generate/verify
composition-specific OpenAPI artifacts for E6 and CTG9, with their actual request,
response, security and parameter contracts. The compatibility projection is not
the complete measurement inventory. Strict API coverage, SDK route evidence and
performance coverage must inspect every declared variant and composition. SDK
smoke must exercise the actual client operation for each variant, not merely count
extension entries. A generated CTG9 client/service may use an additive reviewed
namespace and its corresponding artifact while preserving existing E6 clients.
All original E6 and CTG9 assertions remain. Do not merge schemas into permissive
cross-variant combinations, rename runtime URLs, silently select a sort winner,
or treat identical method/path as identical implementations. New unknown
alternative groups require explicit architectural composition mapping; otherwise
refuse. This representation supplies no permission for a collision inside one
running composition.

Independent Inspector discovery found 223 source declarations including the eight
domain declarations, with 215 in the current API-coverage source roots. The old
line census omitted seven inline Preferences handlers and six inline Session
Control handlers; the global OpenAPI operation projection overwrites four
alternative E6/CTG9 operations. These are concrete producer defects to repair,
not grounds to narrow the population. Source counts alone still do not resolve
mounted inheritance or dynamic registrations. All known additions are listed
below; no machine PASS is claimed from this document.

## Governed composition and published SDK identity registry

Canonical authority is
[http-api-compositions.json](../../law/policy/http-api-compositions.json), with
[its closed schema](../../law/schemas/http-api-compositions.schema.json).
`schemaVersion`, `policyId`, `policyVersion`, `repositoryId`, `authority` and
`scope` identify this declaration-alternative/ID-compatibility registry.
`compatibilityBaseline` pins release 1.5.7, exact commit
`03f9a6ae8938dfaa64a33870d60f9f8b448efe10`, the canonical OpenAPI path and raw
SHA-256 `8b02df7a376724c08c2801444acdad0a7f3c29ed93b000adf41825372600ef5d`.
Mutable generated OpenAPI is never authority for adding a compatibility entry.

Each `compositions` entry has stable `id`, exact controller `source`/`className`
and confined `artifactPath`. The initial entries are `offline-e6` and
`offline-ctg9`; they select `OfflineSyncController` and
`CTG9OfflineSyncController`, respectively. Each `alternatives` entry names exact
uppercase `method`, normalized OpenAPI `path` with named parameters,
`primaryCompositionId` and complete unique `compositionIds`. Only the four
explicit POST collision groups are admitted, with E6 primary. Additional groups
require an Architect registry amendment; a source sort order cannot add authority.

Validate the schema plus semantic identity: unique composition IDs/controller
identities/artifact paths; known referenced composition IDs; primary membership;
no duplicate method/path group; actual source declarations exactly matching every
registered group; no missing, extra or ambiguous variants; and collision refusal
inside one mounted composition. Preserve parameter names, selectors and URLs;
do not collapse distinct sources because parameter-erased paths happen to match.
Missing/unknown/mismatched policy, unsafe paths or an unresolved source identity
refuse the affected generation/verification rather than inventing a primary.

Generate each composition artifact with the exact selected controller's own
operation contracts and all referenced schemas. A global compatibility projection
retains E6 for the four groups, identifies its selected composition explicitly,
and carries complete `x-stynx-operation-variants` records. Each record contains
its `compositionId`, exact source/controller/handler and complete operation
metadata (parameters, request body, responses, security and actual operation ID),
without recursively nesting the variant array. Every referenced component must
resolve. Composition artifacts retain their own exact variant identity and
cannot be replaced by a global last-writer projection. SDK smoke must exercise
actual client operations from the corresponding artifacts, preserving the current
E6 surface and adding CTG9 under a reviewed additive namespace when necessary.

`operationIdCompatibility` is a closed set of 26 real published identities across
eight source files whose handler-based IDs change under corrected discovery.
Each entry binds exact `source`, `className`, current/immutable-base `handler`,
uppercase `method`, named OpenAPI `path`, the old public `operationId` and raw
`baselineSourceSha256`. The IDs and source hashes were derived from the immutable
base OpenAPI and source, not inferred from names in today's generated output.
Keep these exact old primary operation IDs and resulting SDK methods; emit
`x-stynx-handler` with the actual discovered handler so compatibility spelling is
never confused with source identity. Keep the source/tag/service identity and
all existing public SDK exports. Newly discovered handlers/endpoints and isolated
fixtures without such an exact immutable-baseline entry use the actual handler
ID; never apply a blanket `handler` suffix or source/path wildcard.

Compatibility is about public identity, not freezing defective metadata. Correct
body/query/parameter/response/security information from exact AST/runtime
contracts still applies while preserving old operation names and supported calls.
Do not remove a published method or make its old valid invocation invalid merely
because the discovery implementation improved. Independently compare the entire
211-operation 1.5.7 primary roster and emitted SDK surface, not just the 26 entries;
unchanged identities must also survive. Stale/reassigned mappings or duplicate
output operation IDs are blocking. Adding mappings requires Architect review and
immutable published provenance; it cannot bless a new fixture's arbitrary ID.

This registry does not assert that either controller has been mounted, that
inheritance is closed or that an HTTP workload ran. The later runtime producer
must separately bind actual class/composition/config identities and reconcile all
routes. Existing API source roots and the separate domain population stay as
declared above. Schema-valid policy or generated variants alone cannot earn PASS.

## Additive task and workload

Proposed required node `test:http-performance`, runner
`stynx-http-performance-v1`, repository-root cwd and argv
`node scripts/run-http-performance.mjs --scenario all` are implementation
obligations. Preserve the existing `test:performance` cold-unit node and every
existing descriptor node/profile/dependency. Use existing `reference:apps` and
`db:rls` prerequisites plus the actual additional dependency closure; do not
substitute a dependency's cached PASS for fresh measurements. A partial scenario
selector remains diagnostic and cannot produce complete evidence.

The immutable workload manifest must map every required endpoint to a mounted
composition, admitted setup and nominal measurement operation, specifying its
arrival model/rate/duration/VUs and expected operation counts. Preserve these
existing profiles:

| Scenario       | Local rate/s | Duration | Local preallocated/max VUs | Hardening rate/s | Hardening preallocated/max VUs |
| -------------- | -----------: | -------- | -------------------------- | ---------------: | ------------------------------ |
| auth           |          100 | 5m       | 20/200                     |               10 | 4/25                           |
| crud           |           10 | 10m      | 2/20                       |                4 | 4/25                           |
| upload         |           50 | 5m       | 10/100                     |                5 | 4/25                           |
| cascade-delete |           25 | 5m       | 10/100                     |                2 | 4/25                           |

Added endpoint workloads must be explicitly reviewed and population-bound before
a run; an unspecified workload is incomplete. Do not shorten the existing
profiles, lower rates, skip endpoints or replace nominal measurements with a
few smoke requests. Positive samples alone do not establish nominal load. Record
configured arrivals and actual started/completed/dropped iterations and each
endpoint's executed successful population. Missing operations, dropped iterations
or unexplained under-execution block complete PASS. Any mathematical arrival
rounding must be fixed in the workload declaration and report, not invented after
a failing run.

Preserve existing component and aggregate scenario thresholds:

| Scenario       | Component p99 limits                                                  | HTTP p95  | Failure rate |
| -------------- | --------------------------------------------------------------------- | --------- | ------------ |
| auth           | auth verification < 10 ms                                             | < 500 ms  | < 0.01       |
| crud           | data transaction < 2 ms; rate limit < 1 ms; idempotency lookup < 5 ms | < 750 ms  | < 0.02       |
| upload         | storage presign < 50 ms                                               | < 1000 ms | < 0.02       |
| cascade-delete | data transaction < 2 ms                                               | < 1000 ms | < 0.02       |

The current workflow's presign environment value 500 conflicts with the accepted
50 ms policy/default. A 500 ms run does not prove 50. The new producer enforces 50;
any existing-workflow correction needs Engineer/Inspector ownership and the exact
workflow authorization receipt. No threshold is raised by this contract.

## Owned execution and actual distributions

Use an isolated owned Compose project and a nonconflicting network/port plan.
The canonical Compose currently publishes fixed ports; serialize against other
fixture owners or use a reviewed confined override. Never stop/remove ambient
stacks. For each auth, crud, upload and cascade-delete scenario, start a fresh
owned reference stack, reach `/healthz` and `/readyz`, run the exact k6 scenario,
validate new nonempty JSON/HTML outputs, compare required baselines and tear down
owned volumes before the next scenario. Preserve campaign D24.45 isolation.
Additional framework campaigns have the same declared ownership and cleanup
obligation. Startup, readiness, measurement, baseline or teardown failure is
blocking. Preserve rejected outputs for diagnosis.

Measure full HTTP durations per method/normalized route/composition. Tag and
export actual per-endpoint distributions with p50/med and p95, sample counts,
throughput and failures, and optional p99. Aggregate scenario statistics cannot
hide an endpoint breach. Custom response-header timings, warmup omission and the
existing best-of-three idempotency component lookup remain honestly labeled
component measurements and cannot substitute for full endpoint tails. Public
login/probes and external S3 upload latency never fill protected endpoint cells.
All functional checks and accepted success/status semantics remain required;
failing application responses are not successful fast endpoint samples.

Reject absent/nonfinite statistics, missing or zero required populations,
failed/dropped checks, stale/cross-candidate summaries and incomplete profiles.
The existing runner's nonempty-file check and zero exit alone are insufficient.
Do not fabricate counters, infer latency from a build/unit duration, or accept a
cached report as a new measurement.

## Required read-only refusal witness

The closed roster includes `GET /_probes/readonly-write` as the exact
`expected-refusal` operation defined in
[ADR-PERF-0001](../../law/adr/2026-10-10-http-performance-evidence.md#characterized-expected-refusal-operation).
The authorized request must produce HTTP 500, `code: READONLY_VIOLATION` and
message `Read-only transaction cannot execute a write statement` through the
actual application/database path. Preserve its characterized envelope and
source-produced context. No generic 500, other error, 2xx, rate-limit response
or fabricated refusal qualifies. Existing unauthenticated, permission and
rate-limit rejection tests remain separate required behavioral witnesses.

Bind real-database full-visibility before/after snapshots and exact target
queries for both missing and existing `tenancy.tenant_settings` target rows;
prove the attempted insert/update did not change business state or `updated_at`.
Use isolated owned fixture state without competing writers and independently
check the refusal/rollback boundary. Error response assertions alone and an
RLS-filtered empty result are insufficient. Declare incidental audit/rate-limit
telemetry separately and keep the real guards active.

Measure this operation's own full HTTP distribution, strict read p50 < 200 ms
and p95 < 800 ms, sample counts, complete arrival execution and exact failure
counts. Retain it in the required manifest and report. Any expected-status
classification is confined to this exact added operation and cannot modify the
existing four scenarios' response checks, failure budgets, thresholds or loads.
An unexpected response still contributes a failure and cannot disappear from
latency or population accounting. A matching fast error without the database
proof cannot earn PASS.

## Additional workload review boundary

The accepted
[supplemental endpoint workload](supplemental-endpoint-workload.md) schedules
exactly 600 target requests at 2/s for 300 seconds, with 2 preallocated/10 maximum
VUs, for each additional required operation and separately required semantic
case. One owned composition and one measured case execute at a time by default.
Setup/authentication/follow-up/cleanup traffic is separately budgeted and never
fills the target samples. This profile is a new architecture choice, not a
production demand forecast, calibration result or advance performance PASS.
Actual weighted rolling-window quotas, tenant/client allocation, session expiry,
real fixture transitions and DB/provider/host capacity must satisfy the linked
contract before an immutable qualification manifest is bound. Bind the exact
percentile algorithm before any qualifying run. Larger populations or concurrency
need prospective review/binding; no retrospective adjustment may tune away an
observed SLO failure. All existing four profiles and strict SLOs remain intact.

INV-PERF-001 declares p50/p95 limits under nominal load; it does not prescribe a
numeric HTTP sample minimum, rate, duration or VU count. The cold-unit proxy's
five samples are unrelated. An added endpoint workload must therefore bind a
reviewed sample and capacity model before measurement: exact per-operation
arrival rate/duration/count, percentile calculation and minimum population,
fixture capacity, resource/wave concurrency, session/permission/rate-limit
budgets and setup/cleanup isolation. Review the actual transitive operation
costs and representative data; a numeric envelope copied from another endpoint
alone does not establish nominal load.

Neither a few smoke requests nor a shared aggregate rate divided implicitly
across the roster establishes each endpoint's required workload. Capacity
calibration is diagnostic and non-promoting; bind the resulting reviewed
manifest before a complete run. No rate, sample floor, duration, population or
rounding may be reduced after a failed run to obtain PASS. Additional workload
choices leave all four accepted scenario profiles and their gates unchanged.
Until the exact additional envelope and fixture/resource capacity are reviewed
and bound, the complete performance proof remains incomplete.

## Baseline custody

Preserve [ADR-HARDENING-0001](../../law/adr/2026-09-12-k6-baseline-comparison.md)
and `test/perf/k6/baseline-reference.json`. Required component metrics are
`auth_verify_duration_ms`, `data_tx_overhead_ms`, `storage_presign_duration_ms`,
`ratelimit_overhead_ms` and `idempotency_lookup_ms`, in their applicable scenarios.
Validate both required p95/p99 values before comparison. Preserve the rule:
both tails must exceed the effective baseline by both >10% and >1 ms to count as
degraded; the effective baseline is max(previous successful value, committed
reference floor). Do not lower floors or alter the comparator's math.

Bind the authenticated previous successful main run, exact artifact identity,
scenario/profile, candidate/source identities and raw summary digests. An
explicitly pre-acquired verified baseline can avoid network access during the
measurement task. If fetching, admit only the required read-only authenticated
transport and keep credentials out of logs/reports. Missing, expired or mismatched
artifacts fail closed. First seed remains allowed only when actual discovery
proves there was no prior successful main run. The helper's no-baseline and
unusable-metric skips do not establish complete PASS.

Use the current workflow run's original `created_at` as the fixed discovery
cutoff, including current reruns. From authenticated complete main-run discovery,
select the latest prior-created successful run by creation time and run ID whose
completion is proved strictly before the cutoff. Select the run before looking
for its artifacts; a scenario-only run or missing artifact never permits an older
substitute. If another prior-created main run has `run_attempt > 1` and
`updated_at` after the cutoff, refuse unresolved historical rerun state until
authenticated attempt history resolves it. If another successful main run was
created at or before the cutoff and its completion timestamp equals the cutoff,
refuse the ambiguous second-resolution order before considering an older run.
Empty, deleted or truncated discovery cannot establish first seed in this
repository with known prior successful runs.

Read-only transport must authenticate the canonical repository/workflow and
complete pagination, retain exact response/archive digests, and reject duplicate
or truncated populations. Use HTTPS with credentials kept on the authenticated
API origin and separated from redirected archive delivery. Validate the closed
archive member roster and exact bytes before consuming summaries. Artifact API
metadata alone does not establish the run attempt; retain
`attemptVerified: false` until exact attempt provenance is independently proved.
Metadata projection, ZIP parsing and comparison helpers alone confer no origin,
transport or readiness verdict. Existing archives must retain their actual
scenario/profile and executed thresholds; they cannot retroactively qualify
complete endpoint coverage or the 50 ms presign gate.

## Toolchain, inputs and admitted environment

Bind the new producer, workload/SLO/route manifest and census/coverage producers;
all k6 scripts/checks/reference floors; canonical reference Compose, role-init
SQL, Dockerfile, migrations and setup; actual measured package/domain source and
its transitive build closure; root manifests/lock/workspace/Turbo/TypeScript and
shared tool configuration; descriptor, invariant and adoption/RC policies. Do not
exclude backend/flow dependencies simply because the old proxy selects only
ratelimit/reference paths. Broad source selectors remain valid until a narrower
complete transitive closure is independently established.

Actual execution identities include Node24, pnpm9.15.0, Docker CLI and Compose
plugin, k6 (currently image `grafana/k6:0.49.0`), the built reference image and its
actual runtime binary, PostgreSQL16, Redis7, LocalStack3.8.1 and cognito-local.
Record resolved image digests/IDs and executable bytes through the supported
protected toolchain mechanism. Moving tags, including Node24 and cognito-local
latest, are not immutable identity. Do not invent unsupported map keys before
published CLI/schema verification.

Admit only consumed reviewed environment keys: Docker host/config/socket settings,
`CI`, fixed `COMPOSE_BAKE=false`, explicit local base/readiness/S3 URLs and test
tenant/email, the exact selected per-scenario rates/duration/VUs, presign50 and
bound baseline identities. A private build may use a securely provisioned
`NODE_AUTH_TOKEN_FILE`; never print/commit its value and always remove the owned
temporary file. DB helper variables belong only if that actual producer consumes
them. Refuse wildcard ambient K6/profile overrides; diagnostic override support
in the old runner is not trusted-task permission. Record configured owner/app/
reader roles accurately; the owned fixture's restricted `stynx_app` identity
cannot be replaced by an owner connection or mislabeled independent reader proof.
Use nonproduction fixture identities only, never invented provider approval.

Docker/DB task effects require explicit supported local-write admission. No remote
write is inferred. Final task/sensor field names, population identity and output
contract must match verified published DEVAI2.4 and its registered binding. Update
Architect adoption policy first and materialize through that CLI; never hand-edit
`.devai/config`. No draft schema field or plain command exit can create a reading.

## Required report and independent acceptance

The producer emits `test/perf/k6/results/http-performance-report.json` plus raw
scenario artifacts. Required structured fields/semantics are:

- Report schema/version; exact candidate commit/tree; task descriptor, population,
  workload, SLO and complete input digests; actual toolchain/container identities.
- Selected nominal profile and owned composition identities; exact required,
  executed and excluded endpoint rosters with exclusion authority; configured
  versus actual iteration/operation counts and any dropped/failed samples.
- Each endpoint's method/path/source/composition/effect, declared SLO authority,
  actual full HTTP distribution/counts/success semantics and pass/fail result;
  unchanged scenario/component threshold and functional-check outcomes.
- Baseline run/head/artifact/source/profile identities, reference-floor digest,
  comparison observations, raw JSON/HTML digests and exact output custody.
- Readiness and owned cleanup results; final completeness and verdict. Missing
  facts remain missing/refused; do not synthesize a PASS cell from exit0.

Inspector regressions must independently reject missing routes/metrics, unknown
inventory drift, public/external substitution, empty/shortened/partial populations,
strict threshold equality, endpoint breaches hidden by aggregate success, stale
or mismatched candidate/baseline reports, inappropriate first seeding, failed
startup/cleanup and unbound task/output populations. Preserve comparison math and
existing functional assertions. Real HTTP integration and complete fresh nominal
measurement on the exact candidate are mandatory after successful adoption and
ordinary role-separated implementation; this document is not that evidence.

## Source discovery appendix

The following literal candidate inventory retains the old census's 203
non-Public-marked candidates plus the thirteen independently discovered inline
declarations, totaling 216 of the 223 AST declarations. Paths are source-relative
before any global/version prefixes. Blank permissions and unmounted/inherited
routes remain reconciliation obligations; they are not automatic exclusions.
Final admitted measurement must bind the actual mounted roster and every omitted
or additional route. This appendix alone cannot make it complete.

### BookmarkTagController

Source: `domain/demo-bookmark/api/src/demo-bookmark/controllers/bookmark-tag.controller.ts`.

| Method | Source path                                         | Handler  | Source permission/marker      |
| ------ | --------------------------------------------------- | -------- | ----------------------------- |
| GET    | `/api/demo/bookmark/bookmark-tag`                   | `list`   | `demo:bookmark:read;readonly` |
| POST   | `/api/demo/bookmark/bookmark-tag`                   | `create` | `demo:bookmark:write`         |
| DELETE | `/api/demo/bookmark/bookmark-tag/:bookmark_id/:tag` | `remove` | `demo:bookmark:write`         |

### BookmarkController

Source: `domain/demo-bookmark/api/src/demo-bookmark/controllers/bookmark.controller.ts`.

| Method | Source path                       | Handler  | Source permission/marker      |
| ------ | --------------------------------- | -------- | ----------------------------- |
| GET    | `/api/demo/bookmark/bookmark`     | `list`   | `demo:bookmark:read;readonly` |
| POST   | `/api/demo/bookmark/bookmark`     | `create` | `demo:bookmark:write`         |
| DELETE | `/api/demo/bookmark/bookmark/:id` | `remove` | `demo:bookmark:write`         |
| GET    | `/api/demo/bookmark/bookmark/:id` | `get`    | `demo:bookmark:read;readonly` |
| PATCH  | `/api/demo/bookmark/bookmark/:id` | `update` | `demo:bookmark:write`         |

### StynxAuditController

Source: `packages/audit/src/audit.controller.ts`.

| Method | Source path   | Handler | Source permission/marker |
| ------ | ------------- | ------- | ------------------------ |
| GET    | `/_audit/log` | `list`  | `platform:audit:read:*`  |

### StynxAuthController

Source: `packages/auth/src/auth.controller.ts`.

| Method | Source path                        | Handler         | Source permission/marker      |
| ------ | ---------------------------------- | --------------- | ----------------------------- |
| GET    | `/_platform/perms/:sid`            | `inspect`       | `platform:perms:inspect:*`    |
| POST   | `/_platform/perms/:sid/invalidate` | `invalidate`    | `platform:perms:invalidate:*` |
| POST   | `/sessions/logout`                 | `logout`        | ``                            |
| POST   | `/sessions/switch`                 | `switchSession` | ``                            |

### FlowAgentRulesController

Source: `packages/flow/src/controllers/agent-rules.controller.ts`.

| Method | Source path             | Handler  | Source permission/marker    |
| ------ | ----------------------- | -------- | --------------------------- |
| DELETE | `/flow/agent-rules/:id` | `delete` | `flow:write:design`         |
| GET    | `/flow/agent-rules/:id` | `get`    | `flow:read:design;readonly` |
| PATCH  | `/flow/agent-rules/:id` | `update` | `flow:write:design`         |

### FlowAnalyticsController

Source: `packages/flow/src/controllers/analytics.controller.ts`.

| Method | Source path                 | Handler     | Source permission/marker       |
| ------ | --------------------------- | ----------- | ------------------------------ |
| GET    | `/flow/analytics/dashboard` | `dashboard` | `flow:read:analytics;readonly` |
| GET    | `/flow/open-tasks`          | `openTasks` | `flow:read:analytics;readonly` |

### FlowAnswersController

Source: `packages/flow/src/controllers/answers.controller.ts`.

| Method | Source path         | Handler  | Source permission/marker |
| ------ | ------------------- | -------- | ------------------------ |
| DELETE | `/flow/answers/:id` | `delete` | `flow:execute:task`      |
| PATCH  | `/flow/answers/:id` | `update` | `flow:execute:task`      |

### FlowEdgesController

Source: `packages/flow/src/controllers/edges.controller.ts`.

| Method | Source path       | Handler  | Source permission/marker    |
| ------ | ----------------- | -------- | --------------------------- |
| DELETE | `/flow/edges/:id` | `delete` | `flow:write:design`         |
| GET    | `/flow/edges/:id` | `get`    | `flow:read:design;readonly` |
| PATCH  | `/flow/edges/:id` | `update` | `flow:write:design`         |

### FlowEffectsController

Source: `packages/flow/src/controllers/effects.controller.ts`.

| Method | Source path              | Handler    | Source permission/marker |
| ------ | ------------------------ | ---------- | ------------------------ |
| POST   | `/flow/effects/dispatch` | `dispatch` | `flow:admin:*`           |

### FlowEventsController

Source: `packages/flow/src/controllers/events.controller.ts`.

| Method | Source path    | Handler | Source permission/marker     |
| ------ | -------------- | ------- | ---------------------------- |
| GET    | `/flow/events` | `list`  | `flow:read:runtime;readonly` |

### FlowFillsController

Source: `packages/flow/src/controllers/fills.controller.ts`.

| Method | Source path                   | Handler             | Source permission/marker     |
| ------ | ----------------------------- | ------------------- | ---------------------------- |
| GET    | `/flow/fills`                 | `list`              | `flow:read:runtime;readonly` |
| POST   | `/flow/fills`                 | `create`            | `flow:execute:task`          |
| GET    | `/flow/fills/:fillId/answers` | `answers`           | `flow:read:runtime;readonly` |
| POST   | `/flow/fills/:fillId/answers` | `upsertAnswer`      | `flow:execute:task`          |
| PUT    | `/flow/fills/:fillId/answers` | `bulkUpsertAnswers` | `flow:execute:task`          |
| GET    | `/flow/fills/:fillId/waivers` | `waivers`           | `flow:read:runtime;readonly` |
| POST   | `/flow/fills/:fillId/waivers` | `createWaiver`      | `flow:execute:task`          |
| DELETE | `/flow/fills/:id`             | `delete`            | `flow:execute:task`          |
| GET    | `/flow/fills/:id`             | `get`               | `flow:read:runtime;readonly` |
| PATCH  | `/flow/fills/:id`             | `update`            | `flow:execute:task`          |

### FlowFormsController

Source: `packages/flow/src/controllers/forms.controller.ts`.

| Method | Source path                                 | Handler            | Source permission/marker     |
| ------ | ------------------------------------------- | ------------------ | ---------------------------- |
| GET    | `/flow/forms`                               | `list`             | `flow:read:design;readonly`  |
| POST   | `/flow/forms`                               | `create`           | `flow:write:design`          |
| GET    | `/flow/forms/:formId/fills`                 | `fills`            | `flow:read:runtime;readonly` |
| POST   | `/flow/forms/:formId/fills`                 | `createFill`       | `flow:execute:task`          |
| GET    | `/flow/forms/:formId/fills/:fillId`         | `fillDetail`       | `flow:read:runtime;readonly` |
| GET    | `/flow/forms/:formId/fills/:fillId/answers` | `fillAnswers`      | `flow:read:runtime;readonly` |
| GET    | `/flow/forms/:formId/fills/:fillId/waivers` | `fillWaivers`      | `flow:read:runtime;readonly` |
| POST   | `/flow/forms/:formId/fills/:fillId/waivers` | `createFillWaiver` | `flow:assign:task`           |
| GET    | `/flow/forms/:formId/questions`             | `questions`        | `flow:read:design;readonly`  |
| POST   | `/flow/forms/:formId/questions`             | `createQuestion`   | `flow:write:design`          |
| DELETE | `/flow/forms/:id`                           | `delete`           | `flow:write:design`          |
| GET    | `/flow/forms/:id`                           | `get`              | `flow:read:design;readonly`  |
| PATCH  | `/flow/forms/:id`                           | `update`           | `flow:write:design`          |

### FlowGraphsController

Source: `packages/flow/src/controllers/graphs.controller.ts`.

| Method | Source path                                | Handler                  | Source permission/marker    |
| ------ | ------------------------------------------ | ------------------------ | --------------------------- |
| GET    | `/flow/graphs`                             | `list`                   | `flow:read:design;readonly` |
| POST   | `/flow/graphs`                             | `create`                 | `flow:write:design`         |
| GET    | `/flow/graphs/:graphId/edges`              | `listEdges`              | `flow:read:design;readonly` |
| POST   | `/flow/graphs/:graphId/edges`              | `createEdge`             | `flow:write:design`         |
| GET    | `/flow/graphs/:graphId/nodes`              | `listNodes`              | `flow:read:design;readonly` |
| POST   | `/flow/graphs/:graphId/nodes`              | `createNode`             | `flow:write:design`         |
| GET    | `/flow/graphs/:graphId/transition-effects` | `listTransitionEffects`  | `flow:read:design;readonly` |
| POST   | `/flow/graphs/:graphId/transition-effects` | `createTransitionEffect` | `flow:write:design`         |
| DELETE | `/flow/graphs/:id`                         | `delete`                 | `flow:write:design`         |
| GET    | `/flow/graphs/:id`                         | `get`                    | `flow:read:design;readonly` |
| PATCH  | `/flow/graphs/:id`                         | `update`                 | `flow:write:design`         |
| GET    | `/flow/graphs/:id/export`                  | `export`                 | `flow:read:design;readonly` |
| POST   | `/flow/graphs/:id/publish`                 | `publish`                | `flow:publish:design`       |
| POST   | `/flow/graphs/import`                      | `import`                 | `flow:write:design`         |

### FlowNodeFormRulesController

Source: `packages/flow/src/controllers/node-form-rules.controller.ts`.

| Method | Source path                 | Handler  | Source permission/marker    |
| ------ | --------------------------- | -------- | --------------------------- |
| DELETE | `/flow/node-form-rules/:id` | `delete` | `flow:write:design`         |
| GET    | `/flow/node-form-rules/:id` | `get`    | `flow:read:design;readonly` |
| PATCH  | `/flow/node-form-rules/:id` | `update` | `flow:write:design`         |

### FlowNodeRunsController

Source: `packages/flow/src/controllers/node-runs.controller.ts`.

| Method | Source path           | Handler | Source permission/marker     |
| ------ | --------------------- | ------- | ---------------------------- |
| GET    | `/flow/node-runs`     | `list`  | `flow:read:runtime;readonly` |
| GET    | `/flow/node-runs/:id` | `get`   | `flow:read:runtime;readonly` |

### FlowNodesController

Source: `packages/flow/src/controllers/nodes.controller.ts`.

| Method | Source path                       | Handler           | Source permission/marker    |
| ------ | --------------------------------- | ----------------- | --------------------------- |
| DELETE | `/flow/nodes/:id`                 | `delete`          | `flow:write:design`         |
| GET    | `/flow/nodes/:id`                 | `get`             | `flow:read:design;readonly` |
| PATCH  | `/flow/nodes/:id`                 | `update`          | `flow:write:design`         |
| GET    | `/flow/nodes/:nodeId/agent-rules` | `listAgentRules`  | `flow:read:design;readonly` |
| POST   | `/flow/nodes/:nodeId/agent-rules` | `createAgentRule` | `flow:write:design`         |
| GET    | `/flow/nodes/:nodeId/form-rules`  | `listFormRules`   | `flow:read:design;readonly` |
| POST   | `/flow/nodes/:nodeId/form-rules`  | `createFormRule`  | `flow:write:design`         |

### FlowPoliciesController

Source: `packages/flow/src/controllers/policies.controller.ts`.

| Method | Source path                              | Handler      | Source permission/marker     |
| ------ | ---------------------------------------- | ------------ | ---------------------------- |
| POST   | `/flow/policies/evaluate`                | `evaluate`   | `flow:read:runtime;readonly` |
| DELETE | `/flow/policies/rules/:id`               | `deleteRule` | `flow:write:design`          |
| GET    | `/flow/policies/rules/:id`               | `getRule`    | `flow:read:design;readonly`  |
| PATCH  | `/flow/policies/rules/:id`               | `updateRule` | `flow:write:design`          |
| GET    | `/flow/policies/sets`                    | `listSets`   | `flow:read:design;readonly`  |
| POST   | `/flow/policies/sets`                    | `createSet`  | `flow:write:design`          |
| DELETE | `/flow/policies/sets/:id`                | `deleteSet`  | `flow:write:design`          |
| GET    | `/flow/policies/sets/:id`                | `getSet`     | `flow:read:design;readonly`  |
| PATCH  | `/flow/policies/sets/:id`                | `updateSet`  | `flow:write:design`          |
| GET    | `/flow/policies/sets/:policySetId/rules` | `listRules`  | `flow:read:design;readonly`  |
| POST   | `/flow/policies/sets/:policySetId/rules` | `createRule` | `flow:write:design`          |

### FlowQuestionsController

Source: `packages/flow/src/controllers/questions.controller.ts`.

| Method | Source path                 | Handler       | Source permission/marker    |
| ------ | --------------------------- | ------------- | --------------------------- |
| DELETE | `/flow/questions/:id`       | `delete`      | `flow:write:design`         |
| GET    | `/flow/questions/:id`       | `get`         | `flow:read:design;readonly` |
| PATCH  | `/flow/questions/:id`       | `update`      | `flow:write:design`         |
| DELETE | `/flow/questions/:id/score` | `deleteScore` | `flow:write:design`         |
| GET    | `/flow/questions/:id/score` | `score`       | `flow:read:design;readonly` |
| PUT    | `/flow/questions/:id/score` | `putScore`    | `flow:write:design`         |

### FlowRunsController

Source: `packages/flow/src/controllers/runs.controller.ts`.

| Method | Source path               | Handler        | Source permission/marker       |
| ------ | ------------------------- | -------------- | ------------------------------ |
| GET    | `/flow/runs`              | `list`         | `flow:read:runtime;readonly`   |
| GET    | `/flow/runs/:id`          | `get`          | `flow:read:runtime;readonly`   |
| PATCH  | `/flow/runs/:id`          | `update`       | `flow:admin:*`                 |
| GET    | `/flow/runs/:id/activity` | `activity`     | `flow:read:runtime;readonly`   |
| GET    | `/flow/runs/:id/events`   | `listEvents`   | `flow:read:runtime;readonly`   |
| GET    | `/flow/runs/:id/facts`    | `facts`        | `flow:read:runtime;readonly`   |
| GET    | `/flow/runs/:id/nodes`    | `listNodeRuns` | `flow:read:runtime;readonly`   |
| GET    | `/flow/runs/:id/tasks`    | `listTasks`    | `flow:read:runtime;readonly`   |
| POST   | `/flow/runs/ensure`       | `ensure`       | `flow:read:runtime`            |
| GET    | `/flow/runs/summary`      | `summary`      | `flow:read:analytics;readonly` |

### FlowScopesController

Source: `packages/flow/src/controllers/scopes.controller.ts`.

| Method | Source path        | Handler  | Source permission/marker    |
| ------ | ------------------ | -------- | --------------------------- |
| GET    | `/flow/scopes`     | `list`   | `flow:read:design;readonly` |
| POST   | `/flow/scopes`     | `create` | `flow:write:design`         |
| DELETE | `/flow/scopes/:id` | `delete` | `flow:write:design`         |
| GET    | `/flow/scopes/:id` | `get`    | `flow:read:design;readonly` |
| PATCH  | `/flow/scopes/:id` | `update` | `flow:write:design`         |

### FlowSignalController

Source: `packages/flow/src/controllers/signal.controller.ts`.

| Method | Source path    | Handler  | Source permission/marker |
| ------ | -------------- | -------- | ------------------------ |
| POST   | `/flow/signal` | `signal` | `flow:read:runtime`      |

### FlowTasksController

Source: `packages/flow/src/controllers/tasks.controller.ts`.

| Method | Source path                     | Handler       | Source permission/marker     |
| ------ | ------------------------------- | ------------- | ---------------------------- |
| GET    | `/flow/tasks`                   | `list`        | `flow:read:runtime;readonly` |
| GET    | `/flow/tasks/:id`               | `get`         | `flow:read:runtime;readonly` |
| POST   | `/flow/tasks/:id/accept`        | `accept`      | `flow:execute:task`          |
| POST   | `/flow/tasks/:id/act`           | `act`         | `flow:execute:task`          |
| POST   | `/flow/tasks/:id/assign`        | `assign`      | `flow:assign:task`           |
| GET    | `/flow/tasks/:id/candidates`    | `candidates`  | `flow:assign:task;readonly`  |
| POST   | `/flow/tasks/:id/decline`       | `decline`     | `flow:execute:task`          |
| POST   | `/flow/tasks/:id/unaccept`      | `unaccept`    | `flow:execute:task`          |
| POST   | `/flow/tasks/:id/unassign`      | `unassign`    | `flow:assign:task`           |
| POST   | `/flow/tasks/:id/withdraw`      | `withdraw`    | `flow:execute:task`          |
| GET    | `/flow/tasks/roles/:role/users` | `usersByRole` | `flow:assign:task;readonly`  |
| GET    | `/flow/tasks/users/:id`         | `user`        | `flow:assign:task;readonly`  |

### FlowTransitionEffectsController

Source: `packages/flow/src/controllers/transition-effects.controller.ts`.

| Method | Source path                    | Handler  | Source permission/marker    |
| ------ | ------------------------------ | -------- | --------------------------- |
| DELETE | `/flow/transition-effects/:id` | `delete` | `flow:write:design`         |
| GET    | `/flow/transition-effects/:id` | `get`    | `flow:read:design;readonly` |
| PATCH  | `/flow/transition-effects/:id` | `update` | `flow:write:design`         |

### FlowWaiversController

Source: `packages/flow/src/controllers/waivers.controller.ts`.

| Method | Source path         | Handler  | Source permission/marker     |
| ------ | ------------------- | -------- | ---------------------------- |
| GET    | `/flow/waivers`     | `list`   | `flow:read:runtime;readonly` |
| POST   | `/flow/waivers`     | `create` | `flow:execute:task`          |
| DELETE | `/flow/waivers/:id` | `delete` | `flow:execute:task`          |
| PATCH  | `/flow/waivers/:id` | `update` | `flow:execute:task`          |

### StynxHealthController

Source: `packages/health/src/health.controller.ts`.

| Method | Source path | Handler           | Source permission/marker |
| ------ | ----------- | ----------------- | ------------------------ |
| GET    | `/healthz`  | `liveness`        | ``                       |
| GET    | `/info`     | `info`            | ``                       |
| GET    | `/metrics`  | `metricsEndpoint` | ``                       |
| GET    | `/readyz`   | `readiness`       | ``                       |

### I18nController

Source: `packages/i18n/src/i18n.controller.ts`.

| Method | Source path                | Handler           | Source permission/marker |
| ------ | -------------------------- | ----------------- | ------------------------ |
| GET    | `/_tenancy/i18n/overrides` | `listOverrides`   | ``                       |
| PUT    | `/_tenancy/i18n/overrides` | `updateOverrides` | ``                       |

### CTG9OfflineSyncController

Source: `packages/offline-sync/src/ctg9-offline-sync.controller.ts`.

| Method | Source path                                                   | Handler              | Source permission/marker           |
| ------ | ------------------------------------------------------------- | -------------------- | ---------------------------------- |
| POST   | `/offline-sync/conflicts/:id/resolve`                         | `resolveConflict`    | `offline-sync:conflicts:resolve`   |
| POST   | `/offline-sync/numbering-reservations`                        | `reserveNumbering`   | `offline-sync:numbering:reserve`   |
| POST   | `/offline-sync/numbering-reservations/:id/block`              | `blockNumbering`     | `offline-sync:numbering:block`     |
| POST   | `/offline-sync/numbering-reservations/:id/cancel`             | `cancelNumbering`    | `offline-sync:numbering:cancel`    |
| POST   | `/offline-sync/numbering-reservations/:id/close`              | `closeNumbering`     | `offline-sync:numbering:close`     |
| GET    | `/offline-sync/numbering-reservations/:id/consumption`        | `getConsumption`     | `offline-sync:numbering:read`      |
| POST   | `/offline-sync/numbering-reservations/:id/reconcile`          | `reconcileNumbering` | `offline-sync:numbering:reconcile` |
| POST   | `/offline-sync/numbering-reservations/:id/settle`             | `settleNumbering`    | `offline-sync:numbering:settle`    |
| POST   | `/offline-sync/sync-batches`                                  | `submitBatch`        | `offline-sync:batches:submit`      |
| GET    | `/offline-sync/sync-batches/:deviceId/:deviceBatchId/receipt` | `getBatchReceipt`    | `offline-sync:batches:read`        |
| GET    | `/offline-sync/sync-items/:idempotencyKey/receipt`            | `getItemReceipt`     | `offline-sync:items:read`          |

### OfflineSyncController

Source: `packages/offline-sync/src/offline-sync.controller.ts`.

| Method | Source path                                       | Handler            | Source permission/marker         |
| ------ | ------------------------------------------------- | ------------------ | -------------------------------- |
| POST   | `/offline-sync/conflicts/:id/resolve`             | `resolveConflict`  | `offline-sync:conflicts:resolve` |
| POST   | `/offline-sync/numbering-reservations`            | `reserveNumbering` | `offline-sync:numbering:reserve` |
| POST   | `/offline-sync/numbering-reservations/:id/cancel` | `cancelNumbering`  | `offline-sync:numbering:cancel`  |
| POST   | `/offline-sync/sync-batches`                      | `submitBatch`      | `offline-sync:batches:submit`    |

### PrivacyController

Source: `packages/privacy/src/privacy.controller.ts`.

| Method | Source path          | Handler          | Source permission/marker |
| ------ | -------------------- | ---------------- | ------------------------ |
| POST   | `/privacy/erasures`  | `eraseSubject`   | ``                       |
| POST   | `/privacy/exports`   | `exportData`     | ``                       |
| GET    | `/privacy/retention` | `applyRetention` | ``                       |

### SessionControlController

Source: `packages/sessions/src/control/session-control.controller.ts`.

| Method | Source path                                               | Handler   | Source permission/marker |
| ------ | --------------------------------------------------------- | --------- | ------------------------ |
| POST   | `/auth/session-administration/subjects/:subjectId/revoke` | `subject` | ``                       |

### SessionJwksController

Source: `packages/sessions/src/jwks.controller.ts`.

| Method | Source path              | Handler | Source permission/marker |
| ------ | ------------------------ | ------- | ------------------------ |
| GET    | `/.well-known/jwks.json` | `jwks`  | ``                       |

### TenancyController

Source: `packages/tenancy/src/tenancy.controller.ts`.

| Method | Source path            | Handler   | Source permission/marker |
| ------ | ---------------------- | --------- | ------------------------ |
| GET    | `/tenants`             | `list`    | ``                       |
| POST   | `/tenants`             | `create`  | ``                       |
| GET    | `/tenants/:id`         | `get`     | ``                       |
| PATCH  | `/tenants/:id`         | `update`  | ``                       |
| POST   | `/tenants/:id/archive` | `archive` | ``                       |
| POST   | `/tenants/:id/purge`   | `purge`   | ``                       |
| POST   | `/tenants/:id/suspend` | `suspend` | ``                       |

### DocumentsController

Source: `reference/api/src/sample/documents.controller.ts`.

| Method | Source path               | Handler      | Source permission/marker        |
| ------ | ------------------------- | ------------ | ------------------------------- |
| POST   | `/documents`              | `create`     | `sample:document:write`         |
| DELETE | `/documents/:id`          | `delete`     | `sample:document:delete`        |
| POST   | `/documents/:id/complete` | `complete`   | `sample:document:write`         |
| GET    | `/documents/:id/download` | `download`   | `sample:document:read;readonly` |
| DELETE | `/documents/:id/hard`     | `hardDelete` | `sample:document:hard-delete`   |
| POST   | `/documents/:id/restore`  | `restore`    | `sample:document:restore`       |

### RecordNotesController

Source: `reference/api/src/sample/record-notes.controller.ts`.

| Method | Source path                 | Handler      | Source permission/marker           |
| ------ | --------------------------- | ------------ | ---------------------------------- |
| GET    | `/record-notes`             | `list`       | `sample:record-note:read;readonly` |
| POST   | `/record-notes`             | `create`     | `sample:record-note:write`         |
| DELETE | `/record-notes/:id`         | `delete`     | `sample:record-note:delete`        |
| GET    | `/record-notes/:id`         | `get`        | `sample:record-note:read;readonly` |
| PATCH  | `/record-notes/:id`         | `update`     | `sample:record-note:write`         |
| DELETE | `/record-notes/:id/hard`    | `hardDelete` | `sample:record-note:hard-delete`   |
| POST   | `/record-notes/:id/restore` | `restore`    | `sample:record-note:restore`       |

### RecordsController

Source: `reference/api/src/sample/records.controller.ts`.

| Method | Source path            | Handler      | Source permission/marker      |
| ------ | ---------------------- | ------------ | ----------------------------- |
| GET    | `/records`             | `list`       | `sample:record:read;readonly` |
| POST   | `/records`             | `create`     | `sample:record:write`         |
| DELETE | `/records/:id`         | `delete`     | `sample:record:delete`        |
| GET    | `/records/:id`         | `get`        | `sample:record:read;readonly` |
| PATCH  | `/records/:id`         | `update`     | `sample:record:write`         |
| DELETE | `/records/:id/hard`    | `hardDelete` | `sample:record:hard-delete`   |
| POST   | `/records/:id/restore` | `restore`    | `sample:record:restore`       |
| GET    | `/records/trash`       | `trash`      | `sample:record:read;readonly` |

### ReferenceProbesController

Source: `reference/api/src/sample/reference-probes.controller.ts`.

| Method | Source path               | Handler         | Source permission/marker     |
| ------ | ------------------------- | --------------- | ---------------------------- |
| GET    | `/_probes/readonly-write` | `readonlyWrite` | `sample:probe:read;readonly` |

### WorkItemEntriesController

Source: `reference/api/src/sample/work-item-entries.controller.ts`.

| Method | Source path                      | Handler      | Source permission/marker               |
| ------ | -------------------------------- | ------------ | -------------------------------------- |
| GET    | `/work-item-entries`             | `list`       | `sample:work-item-entry:read;readonly` |
| POST   | `/work-item-entries`             | `create`     | `sample:work-item-entry:write`         |
| DELETE | `/work-item-entries/:id`         | `delete`     | `sample:work-item-entry:delete`        |
| GET    | `/work-item-entries/:id`         | `get`        | `sample:work-item-entry:read;readonly` |
| PATCH  | `/work-item-entries/:id`         | `update`     | `sample:work-item-entry:write`         |
| DELETE | `/work-item-entries/:id/hard`    | `hardDelete` | `sample:work-item-entry:hard-delete`   |
| POST   | `/work-item-entries/:id/restore` | `restore`    | `sample:work-item-entry:restore`       |

### WorkItemLocksController

Source: `reference/api/src/sample/work-item-locks.controller.ts`.

| Method | Source path                    | Handler      | Source permission/marker              |
| ------ | ------------------------------ | ------------ | ------------------------------------- |
| GET    | `/work-item-locks`             | `list`       | `sample:work-item-lock:read;readonly` |
| POST   | `/work-item-locks`             | `create`     | `sample:work-item-lock:write`         |
| DELETE | `/work-item-locks/:id`         | `delete`     | `sample:work-item-lock:delete`        |
| GET    | `/work-item-locks/:id`         | `get`        | `sample:work-item-lock:read;readonly` |
| PATCH  | `/work-item-locks/:id`         | `update`     | `sample:work-item-lock:write`         |
| DELETE | `/work-item-locks/:id/hard`    | `hardDelete` | `sample:work-item-lock:hard-delete`   |
| POST   | `/work-item-locks/:id/restore` | `restore`    | `sample:work-item-lock:restore`       |

### WorkItemsController

Source: `reference/api/src/sample/work-items.controller.ts`.

| Method | Source path               | Handler      | Source permission/marker         |
| ------ | ------------------------- | ------------ | -------------------------------- |
| GET    | `/work-items`             | `list`       | `sample:work-item:read;readonly` |
| POST   | `/work-items`             | `create`     | `sample:work-item:write`         |
| DELETE | `/work-items/:id`         | `delete`     | `sample:work-item:delete`        |
| GET    | `/work-items/:id`         | `get`        | `sample:work-item:read;readonly` |
| PATCH  | `/work-items/:id`         | `update`     | `sample:work-item:write`         |
| DELETE | `/work-items/:id/hard`    | `hardDelete` | `sample:work-item:hard-delete`   |
| POST   | `/work-items/:id/restore` | `restore`    | `sample:work-item:restore`       |
| GET    | `/work-items/trash`       | `trash`      | `sample:work-item:read;readonly` |

### Additional inline Preferences declarations

Source: `packages/preferences/src/preferences.controller.ts`. The inherited
`GuardedPreferencesController` composition in `reference/api/src/app.module.ts`
must retain these routes and its actual guard metadata. These seven handlers were
omitted by the old line census.

| Method | Source path                      | Handler         |
| ------ | -------------------------------- | --------------- |
| GET    | `/profile`                       | `profile`       |
| PATCH  | `/profile`                       | `patchProfile`  |
| GET    | `/profile/preferences`           | `get`           |
| PUT    | `/profile/preferences`           | `put`           |
| PATCH  | `/profile/preferences`           | `patch`         |
| DELETE | `/profile/preferences`           | `reset`         |
| DELETE | `/profile/preferences/:category` | `resetCategory` |

### Additional inline Session Control declarations

Source: `packages/sessions/src/control/session-control.controller.ts`. These six
handlers were omitted by the old line census. The multiline subject-revocation
handler is already in the appendix above and must not be counted twice. Absence
of a simple permission decorator is not public status; preserve the controller's
trusted session/context and actual mounted admission contract.

| Method | Source path                             | Handler     |
| ------ | --------------------------------------- | ----------- |
| GET    | `/auth/sessions`                        | `list`      |
| DELETE | `/auth/sessions/:sid`                   | `revoke`    |
| POST   | `/auth/sessions/revoke-others`          | `others`    |
| POST   | `/auth/sessions/logout-current`         | `logout`    |
| POST   | `/auth/sessions/revoke-all`             | `all`       |
| GET    | `/auth/session-operations/:operationId` | `operation` |
