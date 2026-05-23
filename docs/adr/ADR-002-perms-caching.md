---
adr_id: ADR-002
title: Permission Resolution Caching
status: accepted
date: 2026-05-16
authors: ['@aarusso']
tags: [stynx, auth, performance, post-c4]
---

# ADR-002 — Permission Resolution Caching

**Authority:** Architect.
**Related:** [`docs/arch/STYNX-SPEC-v0.6.md`](../arch/STYNX-SPEC-v0.6.md) §5, §6, §7, §12. Pre-pilot history: file was at `specs/STYNX-ADR-002-perms-caching.md` until C-4 Session S5 (commit `cb734ac`); re-authored to DEVAI ADR schema in C-4 Session T3.

## Status

Accepted on 2026-05-16 (re-authored to DEVAI schema; underlying decision pre-dates the C-4 pilot — original Status was "Proposed"; accepted as of stynx v1.0 release prep).

## Affected Rules

- `INV-RBAC-001` references endpoint-to-role bindings; the caching strategy here is the runtime that satisfies it.
- `packages/auth/`'s `PermissionGuard` + `PermissionCache` + `EffectiveHashComputer` are the implementation surfaces.
- `packages/ratelimit/`'s SLO histograms (GAP-006) are the monitoring surface for cache hit rate + drift detection.

## Decisions

See "## 2. Decision" section below for the full decision detail. The headline: in-process LRU cache keyed by `(tenant_id, user_id, perms_hash)` with TTL, backed by a Redis fallback for cross-instance coherence; cache invalidation via `perms_hash` change detection on every request (cheap; the JWT carries it).

## Alternatives Considered

See "## 3. Alternatives considered" below.

## Consequences

See "## 4. Consequences" below.

## Context

The full context is in §1 below; the headline: every authenticated request carries a STYNX bearer JWT with a `perms_hash` claim; the guard layer converts `@Permission` decorators into O(1) set-membership checks. Question this ADR answers: where does the resolved set live, how does it stay fresh, what does the hot path cost?

---

## 1. Context

Every authenticated request carries a STYNX bearer JWT whose `perms_hash` claim is a short digest of the user's effective permissions in the active tenant (STYNX‑SPEC §5.3). The guard layer converts `@Permission('resource:action:scope')` decorators into O(1) set‑membership checks against a resolved permission set. The question this ADR answers: where does that resolved set live, how does it stay fresh, and what does the hot path cost?

### 1.1 Effective permission set, defined

For a session bound to `(user_id, tenant_id)`:

```
effective(user, tenant) = union(
  perms_of_roles(memberships_roles(user, tenant)),
  direct_perms(user, tenant),                          // rare; exception grants
  perms_of_groups(group_memberships(user, tenant)),    // via group→role assignments
  platform_perms(user)                                 // cross-tenant platform roles
)
```

Resolution walks five join tables (`auth.memberships`, `auth.membership_roles`, `auth.role_perms`, `auth.group_memberships`, `auth.group_roles`) plus platform grants. In SQL this is 2–3 joins per branch with a final UNION; on modern PG with warm indexes, ~5–15 ms end‑to‑end for a user in a well‑populated tenant. That's **too slow** for the request hot path — we'd pay it on every request.

### 1.2 Cache requirements

- **Sub‑millisecond hot‑path cost.** Guard executes on every authorized route; any cost here multiplies by request volume.
- **Invalidation within seconds** when roles or permissions change. Tenant admin adds a role → user sees the new permission on next request, not next login.
- **Wildcard expansion** pre‑computed. `document:*:*` matches `document:read:*` in O(1), not via pattern matching at request time.
- **Tamper‑resistant.** Client‑side caching of the permission set (e.g. in the JWT itself) is unsafe — users must not influence the set.
- **Session‑scoped correctness.** Impersonation and tenant switching create new sessions with new permission sets; old sessions must not leak.

---

## 2. Decision

### 2.1 Storage — Redis, keyed by session

The resolved, wildcard‑expanded permission set is stored in Redis at key `perms:{sid}` alongside the session record. Shape:

```
perms:{sid} = {
  set:  ["document:read:*", "document:write:*", "document:read:own", ...],  // expanded strings
  hash: "b3c1...",                 // sha256(set_sorted_joined), 8-byte prefix
  computed_at: 1735000000,         // unix seconds
  user_id: "...",
  tenant_id: "...",
  generation: 7                    // monotonic per (user, tenant); see §2.5
}
```

TTL matches the session's absolute expiry (12h max per STYNX‑SPEC §12). The set is eagerly computed at session creation and refreshed only on invalidation events.

### 2.2 JWT carries the hash, not the set

The STYNX bearer JWT carries `perms_hash` — the 8‑byte prefix of the SHA‑256 of the sorted, joined permission set. It does **not** carry the set itself. Two reasons:

1. **Size.** A set of 40 permissions × 25 chars avg = 1 kB. JWTs are passed on every request; 1 kB per request at 1 000 rps = 1 MB/s per pod of header traffic. The hash is 16 chars.
2. **Freshness.** If the set were in the JWT, rotating it would require issuing a new JWT on every permission change. With the hash + Redis pattern, the JWT stays the same across permission updates; Redis contents update and the hash rotates only when the set actually changes.

The hash serves as a freshness check (§2.4).

### 2.3 Hot path — the guard

For every request, the guard does:

```
1. Decode JWT → {sub, sid, tenant_id, perms_hash, exp, ...}       [JWT verify via JWKS, ~0.05ms cached]
2. Redis GET perms:{sid}                                          [~0.3ms p50, ~1ms p99 on LAN]
3. If null OR stored.hash != jwt.perms_hash:                      [cache miss / stale; see §2.4]
     → Re-resolve effective perms from DB
     → SETEX perms:{sid} with new hash and set
4. Check required permission ∈ stored.set                         [O(1) set lookup; negligible]
5. If absent, raise 403
```

**Expected hot path cost: p99 < 2 ms** including network round‑trip to Redis. Well under our `@stynx/auth` SLO of 10 ms for token verify (STYNX‑SPEC §26).

### 2.4 Invalidation

Permission changes happen via admin actions: role creation/deletion, role‑to‑user assignment, role‑permission adjustment, group membership changes, platform role grants. Every such mutation fires an invalidation event.

#### Direct invalidation path (preferred)

The mutating service (in `@stynx/auth`) writes to the DB, then publishes to a Redis channel:

```
PUBLISH perms:invalidate "{user_id}:{tenant_id}"            // narrowest scope
PUBLISH perms:invalidate "*:{tenant_id}"                    // role change affects all users in tenant
PUBLISH perms:invalidate "*:*"                              // platform role grant
```

Every STYNX pod subscribes (one Redis connection per pod, long‑lived, outside PgBouncer). On event:

1. Enumerate matching `perms:{sid}` keys via scan + filter (see §2.7 on enumeration cost).
2. For each matching key, either DELETE or re‑compute and SET.

**Chosen strategy: DELETE, re‑compute lazily on next request.** Most invalidated sessions won't see another request in the next few seconds; eager recompute wastes cycles. The next request takes the miss penalty (~15 ms one‑time) and populates fresh.

#### Secondary invalidation path — hash drift (defensive)

The DB stores the user's current `perms_hash` on `auth.memberships` (`effective_hash`, `effective_hash_generation`), updated by the mutating service **inside the same transaction** as the permission change. At session creation, this hash is copied into the JWT.

If the pub/sub invalidation is missed (pod restart, Redis pub/sub message loss — Redis pub/sub is fire‑and‑forget), the **next request** from the affected session:

1. Has a stale JWT (old `perms_hash`).
2. Redis lookup returns a set matching the JWT's hash (stale).
3. The guard **also queries `auth.memberships.effective_hash`** for the session's `(user_id, tenant_id)`. This is a covered index lookup — O(1) — and is added to the Redis GET as a batched query.
4. If `auth.memberships.effective_hash != redis.hash`, recompute.

**This secondary check costs ~0.5 ms per request as a batched DB query.** The batching happens via a short‑lived in‑memory cache of `(user_id, tenant_id) → effective_hash` inside each pod (TTL 1 s). At 1 000 rps with 100 unique users, that's ~100 DB queries/second for the hash probe — negligible.

The combination of primary pub/sub + secondary hash probe gives us **eventual consistency within ~1 second** of any permission change, with a strict guarantee that no request ever sees a set inconsistent with the current DB state past the 1 s hash‑probe TTL.

### 2.5 Generation counter

Each `auth.memberships` row carries `effective_hash_generation bigint NOT NULL DEFAULT 0`. Every mutation that affects the user's effective set increments this counter as part of the same DB transaction:

```sql
UPDATE auth.memberships
SET effective_hash = :new_hash,
    effective_hash_generation = effective_hash_generation + 1
WHERE user_id = :u AND tenant_id = :t;
```

The generation is included in the JWT and in the Redis record. It exists for two reasons:

1. **Ordering during concurrent updates.** If admin A grants a permission while admin B revokes a role, two transactions race; the one that commits later should "win" by having the higher generation.
2. **Debug/audit.** "User saw generation N at 14:03 but the current DB state is N+2" is a diagnosable statement during incident review.

### 2.6 What counts as a "mutation affecting effective set"

- `INSERT`/`DELETE` on `auth.membership_roles` for this membership.
- `INSERT`/`DELETE` on `auth.direct_perms` for this membership.
- `INSERT`/`DELETE` on `auth.group_memberships` for this membership.
- `INSERT`/`DELETE` on `auth.role_perms` for any role bound to this membership (direct or via group).
- `INSERT`/`DELETE` on `auth.group_roles` for any group this membership belongs to.
- Platform role changes on `auth.users` (all memberships of the user).

Each of these is a discrete mutation path in `@stynx/auth`. Each is responsible for recomputing `effective_hash` for every affected membership as part of its transaction. A trigger‑based alternative was considered and rejected (§3.3).

### 2.7 Session enumeration on invalidation

Redis's `KEYS` is O(N); `SCAN` is acceptable but not cheap at scale. For "invalidate all sessions of tenant T" we need to find all `perms:{sid}` with `tenant_id = T`.

**Solution: secondary index in Redis.**

```
sessions_by_user:{user_id}    SET of sids
sessions_by_tenant:{tenant_id} SET of sids
```

Maintained by `@stynx/sessions` at session create (SADD) and session revoke (SREM). Invalidation then becomes:

```
SMEMBERS sessions_by_tenant:{tenant_id}   → [sid1, sid2, ...]
For each sid: DEL perms:{sid}
```

This turns an O(N_sessions) SCAN into an O(K_matching) pipelined DEL. At tens‑to‑hundreds of tenants with hundreds of active sessions each, the secondary‑index cost is negligible. Both sets have their own TTLs matching session lifetimes.

---

## 3. Alternatives considered

### 3.1 Set‑in‑JWT

Encode the permission set directly in the JWT. Pros: no Redis dependency on the hot path; cache is "free" via the client. Cons: JWT size (as computed in §2.2); permission changes require JWT rotation (either short‑lived JWTs with refresh, which we do, or server‑side blocklist, which erodes the stateless‑token property entirely).

Rejected. The size cost and the coupling between permission changes and JWT lifecycle outweigh the simplicity gain.

### 3.2 In‑memory per‑pod cache

Skip Redis; each pod caches `(user_id, tenant_id) → set` in an LRU map. Pros: no network hop on hot path. Cons: invalidation is harder (each pod must subscribe to pub/sub and track its own cache); memory unbounded without tuning; cold starts hit the DB.

**Partial adoption: yes, as a second tier.** Each pod maintains an LRU of (sid → set) with a 5‑second TTL on top of Redis. Hot path becomes: in‑memory → Redis → DB. Typical request doesn't touch Redis at all; Redis is only hit after the in‑memory entry expires. This further cuts hot‑path latency.

**But not as the only tier.** Invalidation propagation still needs Redis pub/sub; pure in‑memory caches suffer from stale reads across pods.

### 3.3 Trigger‑based hash recomputation

Put triggers on all permission‑affecting tables that recompute `effective_hash` for every affected membership inside the trigger. Pros: the mutating service can't forget to update the hash. Cons: triggers would need to walk the role→permission graph themselves; trigger logic is harder to test; `auth.role_perms` mutations affect potentially thousands of memberships, so a trigger there would do unbounded work inside a single statement.

Rejected. The mutating paths in `@stynx/auth` are few (six, per §2.6) and each one gets unit‑tested for hash‑update behavior. A linter rule on `auth.*` schema migrations detects new tables added to the permission graph without corresponding hash‑update logic.

### 3.4 Authorization service (external engine)

Delegate resolution to an external service (OpenFGA, SpiceDB, OPA). Pros: offloads the graph work; well‑tested. Cons: another dependency with its own availability story; cache and invalidation concerns move but don't disappear; overkill for RBAC without relationship authz (which we explicitly rule out in STYNX‑SPEC §1.2).

Rejected for v1.0. Revisit if we ever adopt relationship authz (not on the roadmap).

---

## 4. Consequences

### 4.1 Positive

- Hot‑path authorization check is O(1) after a ~0.3 ms Redis GET, often served from in‑memory LRU at ~0 ms.
- Permission changes visible within ~1 s globally (pub/sub typical; hash probe ceiling).
- No correctness dependency on pub/sub reliability — the hash probe is the safety net.
- JWTs stay small and stable across permission changes; tokens don't need to rotate.
- Debug narrative is clear: `(sid, generation)` pins the exact permission state the session had.

### 4.2 Negative

- Every permission‑affecting mutation path in `@stynx/auth` must update `auth.memberships.effective_hash` + `effective_hash_generation`. Six paths, each must be correct. Mitigation: unit tests per path, plus a `stynx doctor` check that the set of mutating functions matches the expected list (any new function touching these tables fails CI until explicitly acknowledged).
- Redis availability is on the request hot path for all cold‑cache requests. Mitigation: in‑memory LRU absorbs most requests; Redis downtime degrades to a DB fallback path with higher latency but correct results. A feature flag `perms.db_fallback_on_redis_down` enables this mode.
- The hash probe query is +1 DB query per request for users whose in‑pod `(user_id, tenant_id)` cache is stale. At 1 000 rps across 100 unique users the cost is ~100 qps on a covered index — acceptable. At very high user diversity (~10 000 unique users/sec) this becomes significant; at that scale we'd either extend the in‑pod TTL or batch probes.

### 4.3 Operational tooling

- `GET /_platform/perms/:sid` — platform admin can inspect the current resolved set, hash, generation, and computed‑at time for any session. Useful for "user says they can't do X" tickets.
- `POST /_platform/perms/:sid/invalidate` — manual invalidation button for support.
- Metric: `perms_cache_hit_total{tier}` where `tier ∈ {in_memory, redis, db}`. Expect in_memory > 90 % in steady state.
- Metric: `perms_hash_drift_total{source}` where `source ∈ {pubsub_missed, stale_session, unknown}`. Non‑zero values flag correctness issues.

---

## 5. Test strategy

Mandatory tests for `@stynx/auth` permission cache:

1. **Freshness.** Create user with role R; log in; assert perm P. Grant user role S (adds perm Q). Assert next request sees Q within 2 s (pub/sub path) and within (5 s + pod‑LRU TTL) even when pub/sub is dropped.
2. **Invalidation fan‑out.** Create 100 users in a tenant; grant a new role at tenant level; assert all 100 sessions' cache entries are invalidated or refreshed within 2 s.
3. **Hash drift detection.** Simulate missed pub/sub by disabling subscribers; mutate permissions; assert the hash probe detects drift on the next request and recomputes.
4. **Generation ordering.** Two concurrent transactions modify the same membership; assert the later‑committing wins (higher generation stored).
5. **Impersonation isolation.** Admin impersonates user U; verify the impersonation session has its own `sid` and its own cache entry; revoking impersonation invalidates only the impersonation session.
6. **Tenant switch isolation.** User with memberships in T1 and T2 switches tenant; verify old session's cache is destroyed, new session has fresh cache.
7. **Redis down behavior.** Simulate Redis unavailable; assert fallback to DB query succeeds and correctness holds; metric `perms_cache_hit_total{tier="db"}` increments.
8. **Wildcard expansion correctness.** Role grants `document:*:*`; expanded cache contains `document:read:*`, `document:write:*`, etc. for all currently‑registered permission keys under `document:`.

---

## 6. Rollout and versioning

This mechanism ships with `@stynx/auth` v1.0. The `auth.memberships.effective_hash` and `effective_hash_generation` columns, plus the secondary index sets in Redis, are introduced by the platform's bootstrap migration.

Any change to the set of mutating paths (§2.6) requires an RFC amendment to this ADR.

---

_End of ADR‑002._
