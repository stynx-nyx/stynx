---
title: '@stynx-web/sdk'
---

# @stynx-web/sdk

Framework-agnostic TypeScript SDK for STYNX APIs. It provides fetch-based HTTP transport, auth/tenant provider hooks, token/session helpers, authorization helpers, STYNX error mapping, Cognito hosted-UI URL helpers, and generated OpenAPI artifacts.

## Install

```bash
pnpm add @stynx-web/sdk
```

## Peer Dependencies

- None.

## Use

```ts
import { StynxSdkClient } from '@stynx-web/sdk';

const client = new StynxSdkClient({
  baseUrl: '/api',
  fetchFn: fetch,
  authProvider,
  tenantProvider,
});

const records = await client.get('/sample/records');
```

## Public Surface

- Clients/transport: `StynxSdkClient`, `StynxApiClient`, `StynxHttpTransport`.
- Auth/session/tenant: auth provider, token store, frontend session manager, tenant provider, Cognito URL helpers, JWT helpers.
- Authorization/errors/http: permission/role helpers, `StynxSdkError`, `createStynxSdkError`, HTTP request/response option types.
- Generated API: exports from `src/generated`.
- Secondary exports: `@stynx-web/sdk/testing`.

## See Also

- [`@stynx-web/angular`](/docs/packages-web/angular)
- [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth)
- [Reference app demo](/docs/reference/web#demo-surfaces)
