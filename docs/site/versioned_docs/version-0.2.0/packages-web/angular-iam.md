---
title: '@stynx-nyx/angular-iam'
---

# @stynx-nyx/angular-iam

Angular 20 IAM administration UI for STYNX. It provides guarded user, role, group, membership, role-assignment, permission-matrix, and effective-permission screens backed by a `StynxSdkClient`-compatible client.

## Install

```bash
pnpm add @stynx-nyx/angular-iam
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`
- `@angular/forms ^20.2.0`
- `@angular/router ^20.2.0`
- `@stynx-nyx/angular workspace:*`
- `@stynx-nyx/angular-auth workspace:*`
- `@stynx-nyx/angular-i18n workspace:*`
- `@stynx-nyx/angular-ui workspace:*`
- `@stynx-nyx/sdk workspace:*`

## Use

```ts
import { provideStynxDefaults } from '@stynx-nyx/angular';
import { iamRoutes, provideStynxIam } from '@stynx-nyx/angular-iam';
import { StynxSdkClient } from '@stynx-nyx/sdk';

const client = new StynxSdkClient({ baseUrl: '/api', fetchFn: fetch });

bootstrapApplication(AppComponent, {
  providers: [
    provideStynxDefaults({
      iam: provideStynxIam({
        clientFactory: () => client,
      }),
    }),
  ],
});

export const routes = [{ path: 'admin', children: iamRoutes() }];
```

## Public Surface

- Providers/routes: `provideStynxIam`, `IAM_ROUTES`, `iamRoutes`.
- Services/tokens: `IamApiService`, `STYNX_IAM_CLIENT`.
- Components: users, user detail/create/disable, roles, role detail/create, groups, group detail/create, group members, group roles, permission matrix, effective permissions.
- Types/catalogs: IAM model types and `STYNX_IAM_CATALOGS`.
- Secondary exports: `@stynx-nyx/angular-iam/testing`, locale catalogs.

## See Also

- [`@stynx-nyx/angular-auth`](/docs/packages-web/angular-auth)
- [`@stynx-nyx/angular-audit`](/docs/packages-web/angular-audit)
- [Reference app IAM demo](/docs/reference/web#demo-surfaces)
