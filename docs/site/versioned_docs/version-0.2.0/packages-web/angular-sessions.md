---
title: '@stynx-nyx/angular-sessions'
---

# @stynx-nyx/angular-sessions

Angular 20 active-session UI for STYNX account and administration screens. It can use the SDK-backed adapter or a host-provided adapter to list and revoke sessions.

## Install

```bash
pnpm add @stynx-nyx/angular-sessions
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`

## Use

```ts
import { provideStynxSessions, StynxActiveSessionsComponent } from '@stynx-nyx/angular-sessions';
import { StynxSdkClient } from '@stynx-nyx/sdk';

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
- Secondary exports: `@stynx-nyx/angular-sessions/testing`, locale catalogs.

## See Also

- [`@stynx-nyx/angular-auth`](/docs/packages-web/angular-auth)
- [`@stynx-nyx/sdk`](/docs/packages-web/sdk)
- [Reference app dashboard demo](/docs/reference/web#demo-surfaces)
