# Supplemental endpoint workload contract

[ADR-PERF-0001](../../law/adr/2026-10-10-http-performance-evidence.md) accepts
this supplemental profile and its prospective admission requirements. This is
workload authority, not a bound candidate manifest, calibration, runtime
measurement, inventory closure or PASS.

## Accepted supplemental profile

Retain all four existing local/hardening profiles, their workload isolation,
thresholds, budgets, component baselines and comparison math. Retain the separate
five-sample cold-unit proxy without interpreting its throughput as HTTP RPS.

For each additional required operation and separately required semantic case,
select a constant-arrival-rate qualification profile of **2 target requests/s
for 300 seconds**, exactly **600 scheduled target requests**, with **2
preallocated and 10 maximum VUs**. Each iteration contains exactly one target
request. Preparation, authentication, external follow-up and cleanup are distinct
traffic with explicit count, resource and quota budgets; they never fill the
600 target samples. No retry supplies a replacement target sample. The complete
profile requires all 600 scheduled outcomes, zero dropped/missing iterations,
exact functional outcomes and unfiltered full HTTP durations. Unexpected outcomes
remain in raw distributions and fail the case.

This is a new supplemental architecture choice, not an existing invariant's
sample floor or a production traffic forecast. It supplies 30 ordered observations
in the upper 5% of 600 and a five-minute sustained arrival window. That arithmetic
is not a confidence guarantee or evidence of representative production demand.
Before binding, diagnostic calibration must demonstrate the actual fixture can
sustain this workload without resource exhaustion and that the selected data,
state transitions and effects represent the declared supported composition.
High-variance/provider-sensitive cases need a prospectively reviewed larger
population if this envelope cannot support their intended evidence. Bind every
larger population and concurrency amendment before qualification. Neither an
amendment nor calibration may tune away an observed SLO failure: preserve the
failed observation and resolve its cause under the unchanged SLO. No smaller
profile is substituted after seeing an SLO failure. Calibration cannot earn PASS.

Preserve strict per-case read p50<200ms/p95<800ms and write p50<500ms/p95<2000ms,
including any stricter accepted endpoint limit. Resolve effect from actual
contracts; POST policy evaluation can be read, GET retention application can be
write. Read-only refusal has its existing exact 500/code/message and independent
no-mutation obligations for both absent and present target rows, each separately
measured; generic failures and 429 are not successful samples.

Default execution is **one owned composition and one measured operation/case at
a time**. There are no concurrent endpoint waves by default. More concurrency
requires a prospective Architect-reviewed resource/wave amendment bound before
measurement, with unchanged per-operation arrival/duration/sample requirements.
Never increase concurrency merely to claim the old eight-operation bound was
safe. Each of six currently known roots has its own complete ownership,
configuration, dependency, runtime, OpenAPI, build and fixture bindings; actual
runtime additions expand the population normally. Source count 223 is not a cap.

## Source-grounded capacity constraints

- `packages/data/src/pools.ts` defaults owner=2, app=20, reader=20 connections;
  `reference/api/src/app.module.ts` does not override them. Thus one registry
  permits 42 total connections. `DatabaseRateLimitPolicyResolver` actually uses
  the owner pool for per-request override/platform lookups, so an app=20 pool
  does not imply all 20 concurrent requests avoid waiting on owner=2. Waiting is
  part of measured latency, not removable overhead.
- `reference/api/docker-compose.yml` declares no CPU/memory allocation or
  PostgreSQL connection setting. Its fixed host Redis/S3/Cognito/API ports are
  unsafe for parallel roots without a confined override. Postgres/Redis tags
  and Cognito `latest` are not immutable executable identities. Bind actual
  image content, server `max_connections`/reserved slots, host/container limits,
  connected clients, API and generator processes, CPU/memory observations and
  owned ports/networks/volumes. No arbitrary numeric host capacity is claimed.
- Reference sessions use actual defaults from
  `packages/sessions/src/types.ts`: access=600s, idle=1800s, absolute=86400s.
  The 300s measurement fits only if every selected session is fresh enough at
  its start and survives preparation/graceful completion; a many-hour serial
  campaign cannot reuse one initial access token. Use real authentication,
  bind issued-at/expiry/subject/tenant/permission identities and account for
  refresh/revocation effects and incidental traffic. Never extend production
  session defaults, forge a token or bypass guards for this profile.
- Redis rate limiting is a weighted rolling window, implemented by
  `packages/ratelimit/src/redis-rate-limit.store.ts`; actual bucket keys bind
  scope plus IP, tenant, user or concrete route, not merely the actor. Resolve
  metadata/config/tenant override precedence through the actual policy service.
  Defaults are 120 weighted units/60s. Setup consumes quota when it uses the
  same effective bucket. New actors do not increase a tenant bucket's budget.
- Source-declared limits defeat a single demo-tenant 2/s workload: document
  download cost1/limit30, document delete/restore cost2/limit20, document
  hard-delete cost5/limit10 per60s; work-item-lock create cost2/limit2 per60s.
  Explicit metadata wins over policy overrides, so changing a DB row cannot
  raise these limits. Existing Compose creation/read/write overrides do not
  cover these operations and must not be silently broadened.
- The independent storage presign limiter defaults to 60 calls per tenant per
  minute (`packages/storage/src/s3.service.ts`); it must appear in the same
  transitive quota ledger when the target/setup path presigns. A permitted
  HTTP rate limit does not prove this second limiter's capacity.
- Reference session control wires `DeterministicSessionProviderFake`, provider
  `cognito-compatible-fake`. A measurement of that shipped reference wiring is
  labeled local reference/fake-provider only. It does not prove a real provider's
  latency, compatibility, trust or signing acceptance. Required real external
  provider evidence stays blocked if inputs are missing. Neither local S3
  emulation nor an in-memory privacy capture substitutes for real owned STYNX
  services, PostgreSQL effects or a required external provider boundary.

## Required quota and fixture admission

Before any complete run, bind each target's transitive quota ledger: exact
source/decorator/config policy, bucket identity, cost, window, limit, limiter
backend, target plus incidental events and their schedule. Prove capacity in
**every rolling window for every effective bucket**, not only average counts
per minute or a simple tenant count. Bind fresh fixture tenant memberships,
authenticated actors, eligible independent resources, keys and transitions;
record their initial populations and actual target allocation. The allocation
must preserve each tenant's realistic fixture/data conditions and normal
permissions, RLS and guards. Never split buckets through forged tenant headers,
change/reset limiter state during measurement, increase explicit limits, disable
limiting or classify throttling as success.

For a target-only quota with rate r=2/s, window W=60s and per-request cost c,
`k=floor(limit/c)` requests can fit per bucket. The uniform allocation's rough
lower bound is `ceil(r*W/k)` independent effective buckets; this is **not** an
admission proof because boundaries/jitter/setup can violate a rolling window.
A reviewed schedule needs slack and an actual bounded dispatch model. Examples:
document hard-delete needs at least60 tenant buckets before slack/incidental
traffic; work-item-lock create needs at least120. At exact 120-way round-robin,
lock requests revisit a tenant every60s, leaving no timing margin. An example
121-way schedule provides60.5s nominal spacing but still needs actual timing and
setup proof; it is not a universal allocation or a production tenant count.

A route with IP/user quotas needs genuine independent clients/subjects if the
ledger requires them; changing tenants alone cannot prove its capacity. If a
supported fixture cannot satisfy the proposed ledger with legitimate state,
stop before complete measurement and prospectively review its workload/fixture
architecture. Do not lower the rate after a failure or evade the quota.

Precreate sufficient transition targets and independent destructive-operation
inputs, with actual application/SQL contracts and declared seed provenance.
Separate setup and cleanup counters from target work. Do not repeatedly hit an
already retired/deleted/completed target or serve an idempotent cached response
while claiming repeated domain effects. Replays are separately declared semantic
cases with their own expected effect count and full HTTP samples. Preserve real
success/envelope/status semantics, business-agent versus audit-actor identities,
second-tenant negative witnesses and restricted SQL actor/RLS observations.

## Conditional weighted-window arithmetic

The actual Redis store samples application `Date.now()` before asynchronous
`evalSha`. Lua removes scores `<= now - W`, admits equality at capacity, and
does not add a refused charge. It does not filter already-recorded scores greater
than the current request's timestamp. Concurrent or delayed evaluations can
therefore arrive out of timestamp order. For example, with W=100 ms, a charge
sampled at 0 ms but evaluated after a charge sampled at 200 ms can leave both counted;
an exact timestamp-window sweep alone would report at most one.

Arithmetic must declare its assumptions rather than certify those assumptions.
For a conservative bound, require an independently verified common,
nondecreasing timebase and finite upper bound L from source timestamp sampling
to backend evaluation, including queuing, clock uncertainty and incidental
traffic. For evaluation time e, its sampled `now >= e-L`. Every retained prior
charge then has source timestamp in `(e-(W+L), e]`. A sweep over each charge's
inclusive source-timestamp bounds with width W+L gives a conservative upper
bound; expire half-open eligibility intervals before equal-time additions.
Keep the actual policy window W and uncertainty margin L distinct: the widened
proof envelope does not change the backend policy. Bind bounds for setup,
target and cleanup, actual effective buckets, costs and fresh initial state.
HTTP dispatch bounds alone are not exact source timestamps; independently
establish valid enclosing bounds and evaluation/clock assumptions.

The store's member spelling combines the sampled timestamp with a per-instance
sequence. It is not globally unique across instances; collisions can overwrite
the recorded event/weight while incrementing the total twice, leaving residual
charge after expiry. The arithmetic model also requires actual globally unique
backend members per charge across all setup, target and incidental writers.
Independently prove single-writer/member uniqueness, including sequence lifetime
and clock behavior, or refuse this model. Unique producer charge IDs do not prove
unique Redis members. No automatic assertion of this assumption or real store
repair is authorized by the arithmetic helper contract.

Unbounded delay, clock reversal, incomplete events, unverified timing assumptions
or an incompatible limiter model leaves admission unresolved. A pure helper may
report conditional maximum charge, margin and its stated assumptions; it cannot
report complete admission, authenticated bucket identity or a standalone
capacity/admission PASS. The separate presign fixed-window limiter is not the
weighted Redis model and needs its own actual-policy proof. Prove the declared
whole workload against all effective limiters before qualification; a later
timing/capacity failure remains failed evidence, not permission to lower a load,
discard events or enlarge a bound retrospectively to conceal a failed run.

## Calibration, custody and acceptance

Capture diagnostic actual API/DB/Redis/provider request rates and latencies,
connections/pool wait, CPU/memory, fixture depletion, quota decisions, generator
utilization and dropped-iteration counters on the exact owned compositions.
Use them to review the immutable manifest before its complete run. Diagnostics
cannot select endpoints away, replace missing real roots, waive slow results or
manufacture baseline history. Record any revised choice before measurement.

Use the existing pinned k6 0.49.0
[TrendSink.P algorithm](https://github.com/grafana/k6/blob/v0.49.0/metrics/sink.go#L119-L139)
for each case's raw p50/p95/p99 reconstruction: sort all durations ascending;
for percentile fraction `p` and population `n`, calculate `i = p * (n - 1)` and
linearly interpolate between values at `floor(i)` and `ceil(i)` using the
fractional part of `i`. Fractions are exactly 0.50, 0.95 and 0.99. Bind this
algorithm and the actual executable/content identity before qualification;
neither the algorithm nor population can be chosen retrospectively. Reject
empty, incomplete or nonfinite populations rather than accepting the sink's
empty-population zero. Require 600 actual target durations for this profile,
complete counters and outcome checks; optional or separately required p99 never
replaces the strict p50/p95 SLO. Each operation/case has its own distribution; no pooling or
omitting failures/warmup to hide a breach. Require exact source/build loader and
middleware custody, authenticated baseline artifacts, candidate and population
hashes, owned cleanup and published DEVAI-supported task/sensor admission.
The current runtime census explicitly has incomplete source/build/middleware
custody and cannot confer this acceptance.

600 requests is per required case, not per source declaration or a roster-wide
aggregate. Implicit HEAD/OPTIONS, selectors, inherited/dynamic/runtime extras,
known E6/CTG9 alternatives and semantic variants follow the existing population
contract. Unknown reachability or effect remains blocking. Independent Inspector
and Auditor review must verify the exact bound manifest and measured evidence;
this authority never supplies advance PASS or release approval.

## Implementation and evidence boundary

Engineer implements the supported exact producer and its source/build loader,
middleware custody, six actual mounted roots, real service fixtures and closed
machine policy. Inspector independently probes quota, under-execution, dropped
iterations, fixture and custody refusals. Architect reviews the exact machine
policy and later materializes supported admission through the final published
DEVAI CLI. No field in this prose authorizes a draft schema or hand-edited
`.devai/config` binding. Auditor independently verifies complete custody and
candidate-bound results.

The source declaration checkpoint, installed SDK transport proof and registration
census do not replace executed nominal measurements. Required missing provider
inputs remain explicit acceptance blockers. Existing historical observations,
proof-chain prefix, four k6 profiles, cold-unit proxy, SLO thresholds, mandatory
checks and release controls remain unchanged.
