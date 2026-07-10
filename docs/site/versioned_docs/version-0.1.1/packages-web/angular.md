---
title: '@stynx-nyx/angular'
---

# @stynx-nyx/angular

Angular 20 core integration for STYNX apps. It wires the API base URL, tenant resolver, auth provider, request-id/auth/tenant/error interceptors, CSP nonce support, and shared error/toast services.

## Install

```bash
pnpm add @stynx-nyx/angular
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`
- `@angular/router ^20.2.0`

## Use

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideStynxDefaults } from '@stynx-nyx/angular';

bootstrapApplication(AppComponent, {
  providers: [
    provideStynxDefaults({
      angular: {
        apiBaseUrl: '/api',
        sessionMode: 'bearer',
        defaultTenantResolver: () => 'default-tenant-id',
      },
    }),
  ],
});
```

NgModule hosts can use `StynxAngularModule.forRoot(...)`.

## Public Surface

- Providers/modules: `provideStynxDefaults`, `provideStynxAngular`, `StynxAngularModule`.
- Interceptors/services: `AuthInterceptor`, `TenantInterceptor`, `RequestIdInterceptor`, `ErrorInterceptor`, `ErrorBannerService`, `ToastService`, `TenantContextService`.
- Components: `EmptyStateComponent`.
- Tokens/types: `STYNX_ANGULAR_OPTIONS`, `STYNX_AUTH_PROVIDER`, `STYNX_WINDOW`, module and toast/error state types.

## See Also

- [`@stynx-nyx/sdk`](/docs/packages-web/sdk)
- [`@stynx-nyx/angular-tenancy`](/docs/packages-web/angular-tenancy)
- [Reference app demo](/docs/reference/web#demo-surfaces)
