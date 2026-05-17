# @stynx-web/angular-flow

Angular standalone components and route helpers for STYNX Flow.

This package is host-mounted. Applications provide a configured `StynxSdkClient` through `provideStynxFlow(...)`, then mount `flowRoutes()` under any route prefix.

The graph canvas intentionally does not bundle Cytoscape. It renders a stable list-based fallback with node and edge selection outputs. Hosts that need richer graph layout can wrap `StynxFlowGraphCanvasComponent` or replace it at the route level while reusing the service and models.

The package includes generic Flow fill execution controls for boolean, number,
date, select, multiselect, answer serialization, and question-level waiver
entry. Reference-web route/access E2E coverage is seeded for host mounting. A
shared host store remains optional; add one only if richer package-owned screens
need centralized graph/form/task state, selection, loading, refresh, and error
handling.

## Exports

- `FlowApiService` for `/flow/*` backend calls.
- Flow design, runtime, form, fill, waiver, task, and analytics models.
- Standalone components for graph design, forms, fills, waivers, tasks, and open-task analytics.
- `FLOW_ROUTES` and `flowRoutes()` for host routing.

## Minimal Setup

```ts
import { provideStynxFlow, flowRoutes } from '@stynx-web/angular-flow';
import { StynxSdkClient } from '@stynx-web/sdk';

const client = new StynxSdkClient({
  baseUrl: '/api',
  fetchFn: fetch,
});

export const appConfig = {
  providers: [provideStynxFlow(client)],
};

export const routes = [{ path: 'flow', children: flowRoutes() }];
```
