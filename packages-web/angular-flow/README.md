# @stynx-web/angular-flow

Angular standalone components and route helpers for STYNX Flow design, runtime, fill execution, task assignment, waivers, run activity, and analytics. The package is host-mounted: apps provide a configured Flow client, then mount `flowRoutes()` under any route prefix.

## Install

```bash
pnpm add @stynx-web/angular-flow
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`
- `@angular/router ^20.2.0`

## Use

```ts
import { provideStynxDefaults } from '@stynx-web/angular';
import { flowRoutes, provideStynxFlow } from '@stynx-web/angular-flow';
import { StynxSdkClient } from '@stynx-web/sdk';

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
- Secondary exports: `@stynx-web/angular-flow/testing`, locale catalogs.

## See Also

- [`@stynx-web/angular-auth`](../angular-auth/README.md)
- [`@stynx-web/angular-storage`](../angular-storage/README.md)
- [`@stynx-web/angular-ui`](../angular-ui/README.md)
- [Reference app Flow demo](../../reference/web/README.md#demo-surfaces)
