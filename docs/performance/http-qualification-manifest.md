# Source-bound HTTP qualification manifest

The Architect-owned [manifest](../../law/policy/http-qualification-manifest.json)
and [closed schema](../../law/schemas/http-qualification-manifest.schema.json)
materialize the operation roster and supplemental workload accepted by
[ADR-PERF-0001](../../law/adr/2026-10-10-http-performance-evidence.md). They grant no
runtime admission or performance verdict. `readinessPromoting` remains false.

## Population and identity

The source checkpoint contains 223 own route declarations, including eight domain
declarations. Seven exact attached `@Public()` declarations are listed individually
in `publicExclusions`; only the three existing reference authentication routes
carry the bootstrap-allowlist classification. An unannotated health, JWKS or
framework endpoint is not excluded by its name. There are 216 required own
declarations. The inherited Preferences methods retain their original declaration
identities and bind the actual `GuardedPreferencesController` mount separately.

All five add-on modules import the reference `AppModule`. Consequently, 188 common
required declarations provisionally mount in each of six roots, with 28 required
add-on declarations: 1,156 required declaration/composition pairs. Separate
read-only absent/present, privacy retention dry-run/apply, privacy JSON/CSV export,
CTG9 applied/closed-replay/pending-reapplication and nullable-shift reservation
cases expand this to **1,167 provisional cases**, 700,200 target requests and
350,100 seconds (**97.25 hours**) of serial target windows. Build, fixture setup,
admission, negative controls, grace, shutdown, final checks and the four existing
profiles add time. This arithmetic is neither an ETA nor an admitted runtime count.

The parent derives the complete runtime roster from the actual owned application,
then reconciles it with every source declaration, the composition policy,
OpenAPI operations, inherited mounts and method/path/host/version selectors.
Implicit HEAD/OPTIONS and dynamically registered routes require actual observation;
they are not assumed covered by GET. Unknown registrations, absent required routes,
ambiguous duplicates and unresolved selectors refuse admission. The current source
count is never a cap. Additional required runtime cases need a prospective manifest
successor; source and historical evidence are not silently rewritten.

`cases` is the complete provisional cross-product of each required operation's
`compositionIds` and `semanticCases`. A case ID is
`compositionId.originId.semanticCaseId`; no duplicate tuple or ID is admitted.
The origin ID is the first 16 hexadecimal characters of SHA-256 of the exact UTF-8
`declarationId`; consumers also compare the full declaration and source/method
digests. A short-ID collision refuses rather than merging declarations.

The live fresh-build parent reads the exact tracked manifest bytes from its owned
checkout. It binds their SHA-256 and selects a listed case; a caller-supplied
manifest object, samples or recipe cannot grant authority. The manifest's source
checkpoint records provenance, not a requirement to run that old commit: every
bound source, factory, module and artifact must match the selected actual candidate.
Changed bound bytes require an Architect-reviewed successor before qualification.

## Exact case digest

For a selected case, construct the following object from the manifest itself:

```text
{
  case: {
    caseId, compositionId, originId, semanticCaseId,
    fixtureRecipeId, fixtureContract, effect, expectedStatus,
    preparationDeadlineSeconds: 180, scheduledTargets: 600,
    sourceSha256, methodSha256
  },
  operation, semanticCase, fixtureContract, composition,
  qualificationProfile, compositionPolicy
}
```

`operation`, `semanticCase`, `fixtureContract` and `composition` are the entire
matching records. The `case` fields come from those records and the selected tuple;
`caseSha256` is omitted. Serialize recursively with lexicographically sorted object
keys, unchanged array order, JSON string escaping and no whitespace, encoded as
UTF-8. Values must be JSON values with finite numbers; duplicate JSON keys,
undefined values, ambiguous references or noncanonical input refuse. SHA-256 of
those bytes must equal the listed `caseSha256`. Bind the whole manifest digest as
well; case hashes do not authorize modifying another part of the roster.

## Functional preparation and outcomes

Each operation binds its exact controller and handler source bytes, parameter and
return declarations, decorators, installed-service contract, fixture group and
unique recipe ID. OpenAPI pointers bind the exact existing artifact and operation;
they do not manufacture absent domain OpenAPI operations or runtime results.
An absent artifact binding is an explicit reconciliation blocker. Generated
OpenAPI 200 defaults do not override actual Nest status defaults or manual service
response handling. The declared nominal status must be independently reconciled
with real source/service/runtime behavior before admission; a discrepancy routes
to the responsible producer, not a permissive list of success statuses.

The preparation implementation must implement the exact listed recipe through
real supported services and owned fixture resources. Missing recipes refuse.
The parent independently binds the actual request/path/query/body/header, actor,
tenant, permission, object, reservation, revision and effect allocation for all
600 targets. It verifies initial state and the exact expected response envelope,
bytes/headers where required, SQL/object/audit effects and final state. A generic
2xx or fast failure never substitutes for the handler contract. Exact source
return types and OpenAPI pointers are references to those obligations, not evidence
that a response was validated.

Setup, authentication, refresh, follow-up and cleanup have independently derived
counts, deadlines and transitive quota charges before admission. Each case's
post-listen preparation deadline is 180 seconds; large static populations may be
preseeded through the separately reviewed owned setup stage. Mutating cases have
600 independently eligible effects or transitions. Read fixtures are nonempty
and populated where the contract reads rows; metadata/health endpoints use their
actual non-row contract. Closed replay proves unchanged independently archived ACK
bytes, status and replay headers, with zero repeated domain/consumption/audit effects.
It cannot fill fresh-application cells. The nullable-shift case uses actual null,
distinct eligible device/scope allocations and single-active-reservation proof.

For readonly refusal, absent and present target rows are separate cases with the
exact 500/code/message/context and independent full-visibility before/after
rollback proof. Privacy retention true and false bind their actual conditional
permissions and different read/write effects; omitted `dryRun` is an independent
equivalence control for true. Tenant HTTP may never invoke global identity disable
or whole-partition jobs. Privacy exports use the real owned S3-compatible service,
tenant keys and independently opened JSON/CSV ZIP bytes. The shipped session fake
and synthetic authenticated reference business-agent mapping remain explicitly
local reference fixtures. No production signing/provider/DETRAN parity is claimed.

The group read-population declaration is a preparation minimum for row-backed
reads, not an instruction to invent database rows for JWKS, health or configuration
metadata. Any more specific operation contract wins. Allocate legitimate tenants,
memberships, actors and state; do not reset limiter state, raise limits, forge an
identity, bypass guards or count a repeated idempotent response as a new effect.
Actual effective metadata/configuration and transitive presign quotas must fit
every rolling window, including incidental traffic and proven timestamp/member
identity assumptions. An unbound quota allocation refuses.

## Timing and persistent custody

The supplemental full HTTP sample is explicitly
`fullHttpMs = nativeResponse.timings.blocked + nativeResponse.timings.duration`.
The pinned [k6 v0.49.0 tracer](https://raw.githubusercontent.com/grafana/k6/v0.49.0/lib/netext/httpext/tracer.go)
records connection acquisition in `blocked` and sending/waiting/receiving in
`duration`. Connecting and TLS fields are retained, not added a second time.
This prospective selection includes connection/setup waits; it excludes unrelated
JavaScript iteration/preparation time. Retain all native timing fields and exact
request/response evidence. Redirects, retries and replacement requests are zero.
The four original profiles retain their existing native metrics and comparison
math. `storage_presign_duration_ms` p99 < 50 ms is an additional component
requirement for document creation, not a 50 ms whole-HTTP limit.

One real constant-arrival-rate case runs at a time, using the separately bound
[finite derivative](finite-k6-derivative.md) of k6 v0.49.0. The manifest's
`generatorVersion` records upstream ancestry; the derivative policy and actual
source/build/native identity determine the selected executable. This clarification
changes no roster or case digest. The fixed profile remains 2 targets/s for
300 seconds, exactly 600 scheduled/started/completed/raw targets, two preallocated
and ten maximum VUs. Keep every outcome in the raw distribution. Zero missing,
dropped or duplicate targets; no failure filtering or pooling. Reconstruct pinned
sorted-linear-interpolation quantiles from all 600 finite samples. Strict read
p50 < 200/p95 < 800 ms and write p50 < 500/p95 < 2000 ms remain unchanged.

The persistent worker chronology is START → FACTORY → INIT → LISTEN →
PREPARATION_COMPLETE → READY → MEASUREMENT_START → MEASUREMENT_COMPLETE → CLOSE →
FINAL → TERMINAL. The parent owns the generator process, raw output and listener
corroboration; a worker cannot receive a caller sample array as proof. Preserve
startup 30s, preparation 180s, arrivals 300s, completion grace 30s, shutdown 30s,
final checks 30s and parent operation deadline 600s. No bound is an excuse to drop
samples. Missed bounds refuse with actual owned resumable cleanup.

All existing six admission floors, additional privacy floors, native/toolchain,
fresh-build, module/middleware, registry, transport and lifecycle obligations remain
required. Unfilled floors, calibration, source census, structural schema validity
and successful component tests do not qualify a complete application. Retain all
historical rejected observations and the 1.5.7 evidence bytes/proof-chain prefix.
