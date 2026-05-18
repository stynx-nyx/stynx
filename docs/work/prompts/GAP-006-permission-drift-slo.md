# GAP-006 — SLO Latency Histogram + Proactive Permission Drift Re-sync

**Priority:** MINOR  
**Packages:** `packages/ratelimit`, `packages/auth` (permission cache)  
**Run from:** `./stynx` repo root

---

## Context

Two minor gaps compared to pec:

1. **Latency histogram** — `InMemoryRateLimitMetrics` tracks only blocked-count
   counters. pec also records p50/p95/p99 latency buckets per scope, enabling
   SLO alerting without an external metrics agent.

2. **Permission drift re-sync** — `@stynx/auth`'s permission cache does not
   proactively refresh stale entries. It relies on pub/sub invalidation events.
   If the Redis channel is temporarily unreachable, permissions can remain stale
   indefinitely. pec adds a `driftResyncIntervalMs` option that triggers a
   background refresh for any cache entry older than the interval.

These are independent additions; implement them in the order shown below.

---

## Goal

Add a `LatencyHistogram` class to `packages/ratelimit` and integrate it into
the rate-limit pipeline. Add a `driftResyncIntervalMs` option to the permission
cache in `packages/auth`.

---

## Step 1 — Read current state

Before writing any code, read these files in full:

- `packages/ratelimit/src/metrics.ts`
- `packages/ratelimit/src/types.ts`
- `packages/ratelimit/src/rate-limit.guard.ts`
- `packages/ratelimit/src/index.ts`
- The permission cache implementation in `packages/auth/src/` — likely
  `permission-cache.ts` or similar; scan `ls packages/auth/src/` first.

---

## Step 2 — Add `LatencyHistogram` to `packages/ratelimit/src/metrics.ts`

Replace (or extend) the file with:

```typescript
import type { RateLimitMetricsSink } from './types';

const DEFAULT_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export class InMemoryRateLimitMetrics implements RateLimitMetricsSink {
  private readonly blocked = new Map<string, number>();
  private readonly latencies = new Map<string, number[]>();

  incrementBlocked(scope: string): void {
    this.blocked.set(scope, (this.blocked.get(scope) ?? 0) + 1);
  }

  recordLatency(scope: string, elapsedMs: number): void {
    const list = this.latencies.get(scope) ?? [];
    list.push(elapsedMs);
    this.latencies.set(scope, list);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.blocked.entries());
  }

  latencyPercentile(scope: string, pct: 50 | 95 | 99): number | undefined {
    const list = this.latencies.get(scope);
    if (!list || list.length === 0) return undefined;
    const sorted = [...list].sort((a, b) => a - b);
    const idx = Math.ceil((pct / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  histogramSnapshot(
    buckets: number[] = DEFAULT_BUCKETS_MS,
  ): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    for (const [scope, list] of this.latencies.entries()) {
      const counts: Record<string, number> = {};
      for (const bucket of buckets) {
        counts[`le_${bucket}`] = list.filter((v) => v <= bucket).length;
      }
      counts['count'] = list.length;
      result[scope] = counts;
    }
    return result;
  }
}
```

---

## Step 3 — Add `recordLatency` to `RateLimitMetricsSink` in `packages/ratelimit/src/types.ts`

Extend the `RateLimitMetricsSink` interface:

```typescript
export interface RateLimitMetricsSink {
  incrementBlocked(scope: string): void;
  recordLatency?(scope: string, elapsedMs: number): void;
}
```

The method is optional (`?`) to preserve compatibility with any existing
external implementations.

---

## Step 4 — Instrument the rate-limit guard

In `packages/ratelimit/src/rate-limit.guard.ts`, wrap the store lookup with a
timing call and emit `recordLatency` if the sink supports it. The pattern:

```typescript
const start = performance.now();
// … existing store.increment() / check logic …
const elapsed = performance.now() - start;
this.metrics?.recordLatency?.(metadata.scope, elapsed);
```

Locate the section in `canActivate` (or equivalent) where the rate-limit check
takes place and add the timing wrapper there.

---

## Step 5 — Add `driftResyncIntervalMs` to the permission cache

Locate the permission cache class in `packages/auth/src/`. It will likely be
named `PermissionCacheService`, `PermCacheService`, or `permission-cache.ts`.

1. Add `driftResyncIntervalMs?: number` to the options interface (the one
   injected via `STYNX_AUTH_OPTIONS` or equivalent token).

2. In the cache class constructor or `onModuleInit`, if
   `driftResyncIntervalMs` is set, schedule a periodic background sweep:

```typescript
if (this.options.driftResyncIntervalMs) {
  setInterval(
    () => void this.resyncStaleCacheEntries(),
    this.options.driftResyncIntervalMs,
  ).unref(); // unref so the interval does not block process exit
}
```

3. Add the `resyncStaleCacheEntries()` method:

```typescript
private async resyncStaleCacheEntries(): Promise<void> {
  const now = Date.now();
  const staleThresholdMs = this.options.driftResyncIntervalMs ?? 0;
  for (const [key, entry] of this.cache.entries()) {
    if (now - entry.cachedAt >= staleThresholdMs) {
      try {
        await this.refreshEntry(key);
      } catch {
        // Background refresh — swallow errors to avoid crashing the process
      }
    }
  }
}
```

`refreshEntry` should replicate the existing DB/Redis lookup logic for a
single cache key. If the permission cache does not already have this
factored out, extract the lookup path into a private `refreshEntry(key)`
helper.

---

## Step 6 — Export new additions from index files

- `packages/ratelimit/src/index.ts` — `export * from './metrics'` already
  covers `InMemoryRateLimitMetrics`. Verify `latencyPercentile` and
  `histogramSnapshot` are callable from the exported type.
- `packages/auth/src/index.ts` — no new exports needed; `driftResyncIntervalMs`
  is part of the existing options interface.

---

## Step 7 — Add unit tests

### `packages/ratelimit`

In `test/packages/` add `rate-limit-metrics.test.ts`:

```typescript
// 1. Create InMemoryRateLimitMetrics instance
// 2. Record 10 latency samples for scope 'api:write': [1, 2, 3, ..., 10]
// 3. Verify latencyPercentile('api:write', 50) === 5 or 6 (median)
// 4. Verify latencyPercentile('api:write', 95) === 10
// 5. Verify histogramSnapshot() has 'api:write' with correct bucket counts
// 6. Verify incrementBlocked + snapshot still work as before
```

### `packages/auth` (permission drift)

In `test/packages/` add `permission-drift-resync.test.ts`:

```typescript
// 1. Construct permission cache with driftResyncIntervalMs = 100ms and a mock DB
// 2. Populate a cache entry with cachedAt = Date.now() - 200
// 3. Wait 150ms for the background interval to fire
// 4. Verify that the mock DB lookup was called (entry was refreshed)
// 5. Verify the entry's cachedAt was updated
```

Use `Vitest.useFakeTimers()` and `Vitest.advanceTimersByTimeAsync()` to avoid
real-time waits.

---

## Verification

```bash
# TypeScript builds
pnpm --filter @stynx/ratelimit build
pnpm --filter @stynx/auth build

# Unit tests pass
pnpm --filter @stynx/ratelimit test
pnpm --filter @stynx/auth test

# Lint clean
pnpm --filter @stynx/ratelimit lint
pnpm --filter @stynx/auth lint
```

---

## Acceptance criteria

- [ ] `InMemoryRateLimitMetrics` has `recordLatency()`, `latencyPercentile()`, `histogramSnapshot()`
- [ ] `RateLimitMetricsSink` interface has optional `recordLatency?`
- [ ] Rate-limit guard emits `recordLatency` on each check
- [ ] Auth permission cache accepts `driftResyncIntervalMs` and proactively refreshes stale entries
- [ ] Background interval uses `.unref()` so it does not prevent clean process exit
- [ ] Unit tests cover p50/p95/p99 percentile calculation and drift re-sync trigger
- [ ] `pnpm build`, `pnpm test:unit`, `pnpm lint` all green
