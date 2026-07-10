---
title: '@stynx-nyx/angular-tenancy'
---

# @stynx-nyx/angular-tenancy

Angular 20 tenancy integration for STYNX. It resolves the active tenant, initializes tenant context, adds `X-Tenant-Id` through an HTTP interceptor, and exposes tenant picker/switcher components.

## Install

```bash
pnpm add @stynx-nyx/angular-tenancy
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`
- `@angular/forms ^20.2.0`

## Use

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideTenancy } from '@stynx-nyx/angular-tenancy';

bootstrapApplication(AppComponent, {
  providers: [
    provideTenancy({
      defaultTenantResolver: () => localStorage.getItem('tenant-id'),
    }),
  ],
});
```

`provideStynxAngular(...)` and `provideStynxDefaults(...)` call `provideTenancy(...)` for the core Angular integration.

## Public Surface

- Providers/interceptors: `provideTenancy`, `TenantInterceptor`.
- Services/components: `TenantContextService`, `StynxTenantPickerComponent`, `StynxTenantSwitcherComponent`.
- Tokens/types: `STYNX_TENANCY_OPTIONS`, `STYNX_TENANCY_WINDOW`, tenancy option, tenant, and resolution context types.
- Secondary exports: `@stynx-nyx/angular-tenancy/testing`, locale catalogs.

## See Also

- [`@stynx-nyx/angular`](/docs/packages-web/angular)
- [`@stynx-nyx/sdk`](/docs/packages-web/sdk)
- [Reference app tenant demo](/docs/reference/web#demo-surfaces)
