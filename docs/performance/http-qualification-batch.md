# Serial HTTP qualification batch

The Architect-owned [batch policy](../../law/policy/http-qualification-batch.json),
[policy schema](../../law/schemas/http-qualification-batch.schema.json) and
[evidence schema](../../law/schemas/http-qualification-batch-evidence.schema.json)
bind coordination under [ADR-PERF-0001](../../law/adr/2026-10-10-http-performance-evidence.md).
They declare engineering requirements, not implementation, execution authority,
verified archives or performance acceptance. The existing Owner campaign mandate
covers this remediation; ordinary role separation and exact action receipts apply.

## Complete order and entry

The required entry remains `node scripts/run-http-performance.mjs --scenario all`.
Its implementation is an Engineer deliverable. It derives the complete roster from
exact candidate-owned [manifest](../../law/policy/http-qualification-manifest.json)
bytes through the existing closed manifest validation, never caller arrays. Iterate
compositions in the manifest's composition-array order, then cases in their
manifest-array order within that composition. Run one composition and one case at
a time. Runtime additions require the normal prospective manifest successor; no
source count or provisional case count caps them.

Preserve the [per-case contract](http-qualification-manifest.md): every operation,
composition and semantic case has its own complete population, exact outcome,
unfiltered durations, effect proof, quota allocation and independent custody.
Do not pool samples, stitch partial windows, replace dropped requests or select
an attempt because its latency is lowest. Keep every failed and incomplete
attempt. Unsupported recipes, unfilled floors and stale bindings refuse before
corresponding effects; a component return with nonqualifying flags is BLOCKED.

The four original auth, crud, upload and cascade-delete scenarios remain required,
each against a genuinely fresh owned stack with health/readiness, raw summaries,
exact executable/container identities, closed environment, authenticated baseline
and successful teardown. Preserve all workload, threshold, component, failure-budget
and comparison semantics and the separate cold-unit proxy. The existing ambient
scenario helper, wildcard environment forwarding and mutable image tag do not
confer admission merely by exiting zero. Their actual launcher must satisfy the
existing owned-stack/tool/baseline contract. This batch supplies no new backend
requirement or exception to a mandatory task.

## Live ownership and archive boundary

Engineer owns a private coordinator and the fixed CLI. The current fresh-build
parent remains the only source of build/runtime capabilities. Build once per
composition and reuse only its live opaque handle after complete rechecks;
each case still owns a fresh fixture. A refused handle stays refused. Normal close
can retry actual owned cleanup but cannot restore runtime authority.

Before any build/resource operation, durably publish BEGIN. Before case effects,
publish CASE_BEGIN with a fresh attempt UUID. Follow the complete persistent case
chronology and deadlines. Before closing a build, archive the actual parent-owned
attempt evidence outside its disposable sandbox. Closing currently deletes that
sandbox; a path in a returned report is not durable custody.

The parent-owned archive operation derives a fixed artifact roster from private
attempt state, including failure paths. It accepts the actual handle and an
internally owned destination, never caller file rows, callbacks, samples, floors
or cleanup claims. It may read refused-state evidence without reopening the
handle. Files are bounded regular snapshots with the policy's permissions and
byte limit; hash and parse the same acquired bytes. Publish an archive index
atomically and durably only after its required closure exists. An archive failure
blocks sandbox deletion and retains partial diagnostics separately. Actual owned
child/fixture cleanup must still proceed or remain safely resumable. A private
unsealed-attempt state set before effects may let normal close reap resources
and then refuse sandbox removal; only successful actual archive publication
clears that state. A caller acknowledgment cannot clear it. Raw private credentials
or keys are never automatically exported to public release evidence.

Artifacts have one schema-listed role and a portable path relative to the owned
archive. Reject duplicate paths, contradictory identities and any member outside
the actual source-derived roster. Qualified archives require every listed role;
failed/blocked archives may retain only what actually exists, without fabricated
empty substitutes. Shared build/native/fixture evidence may be referenced through
its verified closed evidence graph; its raw supporting bodies must remain
available and independently reverified. A reference hash alone is not provenance.
The acceptance-role artifact must match the acceptance receipt digest. Use the
existing verifier's supported acyclic signed/raw evidence graph: the receipt
cannot require the digest of the final archive that contains that receipt.
No new receipt format or signing authority is introduced.

Archive status QUALIFIED requires actual full case acceptance and known absent
owned resources. Other terminal states have no acceptance receipt. The JSON
schema's acceptance object describes a required verified fact; a caller or writer
setting its booleans to true does not prove it. Only the admitted source-owned
verifier, through actual trusted origin and complete raw closure, establishes
credit. Current component-only results cannot be changed to QUALIFIED by this
coordinator. No schema-valid document fills an admission floor.

## Closed records and transitions

The evidence schema is a closed union of these three machine documents:

- `http-qualification-journal-event`: batch UUID, contiguous sequence, prior exact
  event-byte digest, static binding digest, event, composition/case/attempt/archive
  selectors, state, UTC observation timestamp and `readinessPromoting: false`.
- `http-qualification-attempt-archive`: batch/attempt UUID, exact static binding,
  case tuple, terminal state, bounded artifact roster, cleanup state and verified
  acceptance reference or null. It retains all required raw and custody evidence.
- `http-qualification-batch-index`: binding, complete planned roster, all attempts,
  four original-profile states/evidence references, journal head and honest overall
  status. It is a derived view, not independent execution authority.

The static binding has exact candidate commit/tree and manifest, batch-policy,
evidence-schema and producer-closure digests. The case tuple has case ID, case
digest and composition. Actual toolchain/environment/native/population/fixture,
measurement and task identities remain required in the verified evidence closure;
the static binding is not a substitute for them.

| Journal event | Required semantic state                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| BEGIN         | Sequence zero, null predecessor; exact whole-batch binding; no case or attempt.    |
| ROOT_BEGIN    | Selected composition, no case/attempt; actual build acquisition begins.            |
| CASE_BEGIN    | Exact next case/composition and fresh attempt UUID; RUNNING; no archive yet.       |
| CASE_SEALED   | Same actual attempt; archive digest; terminal state agrees with archive.           |
| ROOT_CLOSED   | Actual composition cleanup/absence evidence; no active child/fixture.              |
| PAUSE         | No measurement continues; actual cleanup outcome and pending cases retained.       |
| RESUME        | Same binding; prior evidence reverified; no unknown owned resource remains.        |
| STOP          | Failed, blocked or unknown state retained; remaining cases remain pending.         |
| FINAL         | Exact roster, qualifying attempt selection, original gates and cleanup reverified. |

All nonzero sequences have the exact prior byte digest. Reject gaps, duplicate
IDs, unknown fields/events, altered bindings, illegal transitions and semantic
contradictions, including a case belonging to another composition. Null selectors
are explicit absence, not wildcard authority. Timestamps never rank better runs
or override sequence/provenance. Schema validation alone cannot prove this graph. ROOT_CLOSED uses the actual
composition cleanup evidence digest in its archive selector; it is not a case
attempt archive. FINAL leaves that selector null. The derived index references
the final event digest, so neither document contains a circular self-reference.

Default stop is the first nonqualified case after capture and actual cleanup.
No automatic retry. A later genuine remediation attempt keeps the prior failure
and its repair evidence; the verifier must establish resolution under the exact
accepted inputs. Select the latest independently admitted attempt in journal
order for each case, with every prior nonqualified attempt explicitly accounted
for. A later failure prevents selecting an older success. Never select by measured
latency, omit failed attempts or substitute a sibling population's PASS.

## Resume and final aggregation

In-process resume may retain actual private capabilities only after active
operation cleanup. Interrupted measurements remain failed/incomplete; a new
attempt needs its own full window and fresh fixture.

After process restart, derive new opaque builds. Resume selects an internally
created batch UUID, not an arbitrary caller ledger or file. Never deserialize a
handle or adopt a saved PID. A hash-linked journal is a scheduling/tamper-evidence
input, not authenticated origin: its writer can recompute self-hashes. Prior case
credit requires the established trusted verifier to reverify its authenticated
execution origin, entire raw closure, current exact bindings and all existing
freshness rules. Unsupported verification leaves that case uncredited and overall
completion blocked. No new signing format or DEVAI receipt field is invented here.

Interrupted BEGIN/RUNNING without verified cleanup remains UNKNOWN. Use the
actually supported owned-process/resource mechanism to establish absence; a
stored PID, cleanup JSON or disappeared lock cannot do so. Unknown cleanup blocks
new actuation and deletion. Retain torn/ambiguous journal bytes and refuse trusted
resume rather than truncating history into apparent success. A completed archive
plus its authenticated terminal acceptance is the case restart commit point.

No cross-candidate reuse exception is introduced. A changed candidate, manifest,
producer or required identity invalidates credit unless an already supported
verifier expressly proves permitted reuse; matching case names or version strings
are insufficient. Prepare final release source/version/control bindings before
long qualification to avoid accidental stale-candidate work.

Overall PASS requires a bijection between the complete actual admitted roster and
its verified latest qualifying attempts, every required original-profile/gate
result, known cleanup and no unresolved failure, unknown or orphan population.
The index's booleans do not establish those facts. Keep `readinessPromoting: false`;
a complete observation does not replace RC, protected CI or publication controls.
Historical 1.5.7 evidence and every rejected later attempt remain unchanged.

## Implementation and verification boundary

Implement shared roster validation, private serial coordination and parent-owned
attempt archival first. Full effects/quota/runtime/native/fixture/SLO acceptance
and the trusted restart-credit path remain independent required work. Inspector
regressions use the actual production components for real file/child/cleanup and
archive/resume boundaries; small test rosters never qualify the full population.
Architect binds ensuing schema/trace/control changes and Auditor independently
reviews custody. Registered DEVAI bindings use the verified published CLI only.
This policy grants no hand-edited configuration, new workflow, floor replacement,
native execution or unverified resume credit.
