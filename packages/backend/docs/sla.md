---
title: backend/sla
---

# `StynxSlaModule` — per-route SLA monitoring with threshold breach detection

`StynxSlaModule` instruments every controller method with the `SlaMonitorInterceptor`. It records p50 / p95 / p99 timing buckets per route + emits a breach event when a window's percentile exceeds the declared threshold.

## When to mount

In any production app. Mount via `StynxPlatformPipelineModule.forRoot({ sla: {...} })` (preferred) or directly.

## Wiring

```ts
import { StynxSlaModule } from '@stynx-nyx/backend';

StynxSlaModule.forRoot({
  thresholds: { p99: '500ms', p50: '100ms' },
  windowMs: 60_000,
  perRoute: {
    'POST /orders': { p99: '1s' }, // override for slow routes
  },
});
```

## Configuration

| Option       | Type                           | Default            | Description                                    |
| ------------ | ------------------------------ | ------------------ | ---------------------------------------------- |
| `thresholds` | `Record<percentile, duration>` | `{ p99: '500ms' }` | Cross-route defaults.                          |
| `windowMs`   | `number`                       | `60_000`           | Sliding window.                                |
| `perRoute`   | `Record<route, thresholds>`    | `{}`               | Per-route overrides.                           |
| `breachSink` | `(event) => Promise<void>`     | logs only          | Where to send breach events (PagerDuty, etc.). |

## Common pitfalls

- **Threshold too tight on a chatty endpoint** — your alerts page noisy. Tune per-route.
- **Window too short** — small-N percentile estimation; noisy. Use ≥1 minute windows.
- **`breachSink` blocking the request** — sink calls should be fire-and-forget or queued.

## Related

- [`backend/pipeline`](/docs/packages/backend/pipeline/) — preferred mount.
- [`@stynx-nyx/health`](/docs/packages/health/) — adjacent (probes vs SLA breach detection).
- [`@stynx-nyx/logging`](/docs/packages/logging/) — breach events route through here.
