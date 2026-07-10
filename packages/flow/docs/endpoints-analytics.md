---
title: flow/endpoints-analytics
---

# Endpoints — analytics

Read-only aggregates over runs + tasks. Backed by `FlowAnalyticsService`. These power dashboards in [`@stynx-nyx/angular-flow`](/docs/packages-web/angular-flow/).

## Analytics (`/flow`)

| Method | Path                        | Description                                                                                  |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------- |
| `GET`  | `/flow/open-tasks`          | Aggregate of open (incomplete) tasks, grouped by assignee / role / node. The "my work" feed. |
| `GET`  | `/flow/analytics/dashboard` | Dashboard rollup: run counts by status, task throughput, bottleneck nodes.                   |

## Notes

- These endpoints are read-optimized aggregates; they don't mutate state.
- For per-run detail use `GET /flow/runs/:id/activity` (see [endpoints-runs-tasks](/docs/packages/flow/endpoints-runs-tasks/)); for the global picture use these.
- The dashboard rollup is computed on read; for high-traffic dashboards, cache the response at the edge.
