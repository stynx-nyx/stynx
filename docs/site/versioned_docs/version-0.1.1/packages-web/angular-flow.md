---
title: '@stynx-nyx/angular-flow'
---

# @stynx-nyx/angular-flow

Angular standalone components and route helpers for STYNX Flow design, runtime, fill execution, task assignment, waivers, run activity, and analytics. The package is host-mounted: apps provide a configured Flow client, then mount `flowRoutes()` under any route prefix.

## Install

```bash
pnpm add @stynx-nyx/angular-flow
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`
- `@angular/router ^20.2.0`

## Use

```ts
import { provideStynxDefaults } from '@stynx-nyx/angular';
import { flowRoutes, provideStynxFlow } from '@stynx-nyx/angular-flow';
import { StynxSdkClient } from '@stynx-nyx/sdk';

const client = new StynxSdkClient({ baseUrl: '/api', fetchFn: fetch });

bootstrapApplication(AppComponent, {
  providers: [
    provideStynxDefaults({
      flow: provideStynxFlow({
        clientFactory: () => client,
      }),
    }),
  ],
});

export const routes = [{ path: 'flow', children: flowRoutes() }];
```

## Public Surface

- Providers/routes: `provideStynxFlow`, `FLOW_ROUTES`, `flowRoutes`.
- Services/tokens: `FlowApiService`, `STYNX_FLOW_CLIENT`, `STYNX_FLOW_TENANT_CHANGED`.
- Components: graph canvas/designer/dialogs, forms, fills, tasks, waivers, run activity, dashboard, open tasks, run summary, empty state.
- Types: Flow design/runtime/form/fill/task/waiver/analytics client and model types.
- Secondary exports: `@stynx-nyx/angular-flow/testing`, locale catalogs.

## See Also

- [`@stynx-nyx/angular-auth`](/docs/packages-web/angular-auth)
- [`@stynx-nyx/angular-storage`](/docs/packages-web/angular-storage)
- [`@stynx-nyx/angular-ui`](/docs/packages-web/angular-ui)
- [Reference app Flow demo](/docs/reference/web#demo-surfaces)
