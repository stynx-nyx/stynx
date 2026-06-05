# `@stynx/health` — `/health` + `/readiness` endpoints with pluggable dependency checks

`@stynx/health` exposes Kubernetes-style liveness and readiness probes. `/health` returns 200 if the process is alive (no dep checks). `/readiness` runs registered checks (DB, Redis, S3, custom) and returns 200 only if all pass.

## Purpose

Every production container needs `/health` + `/readiness` for orchestration probes (Kubernetes, ECS, etc.). Hand-rolling per app drifts. `@stynx/health` provides the structure + a pluggable check registry.

You reach for it on every STYNX app deployed to a container orchestrator.

What it does NOT do: it's not metrics (use `@stynx/logging` for logs and a separate metrics layer for Prom-style). It doesn't run automatic alerting.

## Audience

Backend developers + ops. The endpoints are consumed by Kubernetes liveness/readiness probes or your orchestrator's equivalent.

## Install

```bash
pnpm add @stynx/health
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx/core` `^1`.

## Quick start

```ts
import { StynxHealthModule } from '@stynx/health';

StynxHealthModule.forRoot({
  checks: [
    { name: 'db', check: async () => ({ ok: true }) },
    { name: 'redis', check: async () => ({ ok: await ping() }) },
  ],
});
```

```bash
# K8s liveness probe
curl http://app:3000/health
# → 200 {"status":"ok"}

# K8s readiness probe
curl http://app:3000/readiness
# → 200 {"status":"ok","checks":{"db":"ok","redis":"ok"}}
```

## Public API surface

### Modules

| Export              | Signature                               | Description                     |
| ------------------- | --------------------------------------- | ------------------------------- |
| `StynxHealthModule` | `.forRoot(options: StynxHealthOptions)` | Registers controller, services. |

### Services / Injectables

| Export           | Description                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `HealthService`  | Runs registered checks.                                                                   |
| `MetricsService` | Lightweight metric capture (request count, error rate); exposed at `/metrics` if enabled. |

### Guards

| Export      | Description                                                                   |
| ----------- | ----------------------------------------------------------------------------- |
| `InfoGuard` | Protects `/info` and `/metrics` if exposed (requires `info:read` permission). |

### Endpoints (1 controller)

| Method | Path         | Auth                              | Description                                              |
| ------ | ------------ | --------------------------------- | -------------------------------------------------------- |
| `GET`  | `/health`    | public                            | Liveness probe. Always returns 200 if the process is up. |
| `GET`  | `/readiness` | public                            | Readiness probe. Returns 200 only if all checks pass.    |
| `GET`  | `/info`      | bearer + `info:read` (if guarded) | App info (version, commit).                              |
| `GET`  | `/metrics`   | bearer + `info:read` (if enabled) | Prometheus-style metrics.                                |

### Types / Interfaces

| Export               | Description                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| `StynxHealthOptions` | `forRoot()` options.                                                         |
| `HealthCheck`        | `{ name: string; check: () => Promise<{ ok: boolean; detail?: unknown }> }`. |

## Configuration

### `StynxHealthModule.forRoot()` options

| Option               | Type            | Default | Description        |
| -------------------- | --------------- | ------- | ------------------ |
| `checks`             | `HealthCheck[]` | `[]`    | Registered checks. |
| `exposeInfo`         | `boolean`       | `false` | Mount `/info`.     |
| `exposeMetrics`      | `boolean`       | `false` | Mount `/metrics`.  |
| `readinessTimeoutMs` | `number`        | `2_000` | Per-check timeout. |

## Examples

### Example 1 — DB check

```ts
checks: [
  {
    name: 'postgres',
    check: async () => {
      try {
        await this.db.execute('SELECT 1');
        return { ok: true };
      } catch (e) {
        return { ok: false, detail: e.message };
      }
    },
  },
],
```

### Example 2 — Kubernetes probe spec

```yaml
livenessProbe:
  httpGet: { path: /health, port: 3000 }
  initialDelaySeconds: 10
readinessProbe:
  httpGet: { path: /readiness, port: 3000 }
  initialDelaySeconds: 5
```

### Example 3 — guarded info endpoint

```ts
StynxHealthModule.forRoot({ exposeInfo: true });
// Then mount InfoGuard at /info via your auth wiring
```

## Common pitfalls

- **Slow check blocks readiness rollouts** — keep checks under 500ms. Use `readinessTimeoutMs` to bound.
- **Mixing liveness + readiness semantics** — liveness should NOT check downstream deps; readiness should. Don't put a DB check on liveness or your pod gets restarted when the DB hiccups.
- **Exposing `/metrics` without auth** in a public service — leaks operational data. Use `InfoGuard`.

## Related packages

- [`@stynx/core`](/docs/packages/core/) — provides `RequestContext` (rarely used here, but consistent).
- [`@stynx/logging`](/docs/packages/logging/) — pair the metrics with structured logs.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-health/`](/docs/api-reference/stynx-health/)
