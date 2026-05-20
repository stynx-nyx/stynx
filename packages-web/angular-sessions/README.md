# @stynx-web/angular-sessions

Angular 20 active-session UI for STYNX account and administration screens. It can use the SDK-backed adapter or a host-provided adapter to list and revoke sessions.

## Install

```bash
pnpm add @stynx-web/angular-sessions
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`

## Use

```ts
import { provideStynxSessions, StynxActiveSessionsComponent } from '@stynx-web/angular-sessions';
import { StynxSdkClient } from '@stynx-web/sdk';

const client = new StynxSdkClient({ baseUrl: '/api', fetchFn: fetch });

bootstrapApplication(AppComponent, {
  providers: [
    provideStynxSessions({
      clientFactory: () => client,
    }),
  ],
});
```

Use `StynxActiveSessionsComponent` in a standalone component or route.

## Public Surface

- Providers: `provideStynxSessions`.
- Components: `StynxActiveSessionsComponent`.
- Adapters/tokens: `SdkSessionsAdapter`, `STYNX_SESSIONS_CLIENT`, `STYNX_SESSIONS_ADAPTER`.
- Types: sessions adapter, SDK client, session item, and revoke/list types.
- Secondary exports: `@stynx-web/angular-sessions/testing`, locale catalogs.

## See Also

- [`@stynx-web/angular-auth`](../angular-auth/README.md)
- [`@stynx-web/sdk`](../sdk/README.md)
- [Reference app dashboard demo](../../reference/web/README.md#demo-surfaces)
