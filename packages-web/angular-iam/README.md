# @stynx-web/angular-iam

Angular 20 IAM administration UI for STYNX. It provides guarded user, role, group, membership, role-assignment, permission-matrix, and effective-permission screens backed by a `StynxSdkClient`-compatible client.

## Install

```bash
pnpm add @stynx-web/angular-iam
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`
- `@angular/forms ^20.2.0`
- `@angular/router ^20.2.0`
- `@stynx-web/angular workspace:*`
- `@stynx-web/angular-auth workspace:*`
- `@stynx-web/angular-i18n workspace:*`
- `@stynx-web/angular-ui workspace:*`
- `@stynx-web/sdk workspace:*`

## Use

```ts
import { provideStynxDefaults } from '@stynx-web/angular';
import { iamRoutes, provideStynxIam } from '@stynx-web/angular-iam';
import { StynxSdkClient } from '@stynx-web/sdk';

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
- Secondary exports: `@stynx-web/angular-iam/testing`, locale catalogs.

## See Also

- [`@stynx-web/angular-auth`](../angular-auth/README.md)
- [`@stynx-web/angular-audit`](../angular-audit/README.md)
- [Reference app IAM demo](../../reference/web/README.md#demo-surfaces)
