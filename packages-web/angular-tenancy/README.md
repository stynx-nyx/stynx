# `@stynx-nyx/angular-tenancy` — Angular tenant switcher + context + header interceptor

`@stynx-nyx/angular-tenancy` is the Angular multi-tenant package. It provides a tenant-switcher + tenant-picker component, a `TenantContextService` holding the active tenant, and an HTTP interceptor that injects the tenant header into every backend call. Pairs with the backend's [`@stynx-nyx/tenancy`](/docs/packages/tenancy/).

## Purpose

Multi-tenant frontends need: a way to switch the active tenant, a place to read the current tenant, and automatic injection of the tenant header so the backend scopes data correctly. `@stynx-nyx/angular-tenancy` provides all three.

You reach for it when your app serves users who belong to multiple tenants.

What it does NOT do: it doesn't enforce tenant isolation (the backend RLS does). It doesn't manage tenant lifecycle (admin endpoints + `@stynx-nyx/angular-iam` do).

## Audience

Angular frontend developers building multi-tenant UIs.

## Install

```bash
pnpm add @stynx-nyx/angular-tenancy
```

**Peer dependencies:** `@angular/core` `^18`, `@stynx-nyx/angular` `^1`, `@stynx-nyx/sdk` `^1`.

## Quick start

```ts
import { provideTenancy } from '@stynx-nyx/angular-tenancy';

export const appConfig = { providers: [provideTenancy()] };
```

```html
<stynx-tenant-switcher />
```

## Public API surface

### Providers

| Export           | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| `provideTenancy` | Registers the tenant context service + interceptor + components. |

### Components

| Selector                  | Component                 | Description                                                                    |
| ------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `<stynx-tenant-switcher>` | `TenantSwitcherComponent` | Dropdown to switch the active tenant; updates context without page reload.     |
| `<stynx-tenant-picker>`   | `TenantPickerComponent`   | Initial tenant selection (e.g. post-login when the user has multiple tenants). |

### Services

| Export                 | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `TenantContextService` | `current` (signal), `switchTo(tenantId)`, `availableTenants`. |

### Interceptors

| Export              | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `tenantInterceptor` | Injects the active tenant id as a header on every backend request. |

### Types

| Export  | Description                                                                             |
| ------- | --------------------------------------------------------------------------------------- |
| (types) | Tenant view-model types. See [TypeDoc](/docs/api-reference/stynx-web-angular-tenancy/). |

## Configuration

| Option             | Type      | Default         | Description                                |
| ------------------ | --------- | --------------- | ------------------------------------------ |
| `headerName`       | `string`  | `'X-Tenant-Id'` | Must match the backend's tenant source.    |
| `persistSelection` | `boolean` | `true`          | Remember the chosen tenant across reloads. |

## Examples

### Example 1 — tenant switcher in the header

```html
<header>
  <stynx-tenant-switcher />
</header>
```

### Example 2 — reading current tenant in a component

```ts
import { TenantContextService } from '@stynx-nyx/angular-tenancy';

@Component({
  /* ... */
})
export class Dashboard {
  private readonly tenancy = inject(TenantContextService);
  tenant = this.tenancy.current; // signal
}
```

### Example 3 — post-login tenant picker

```html
<stynx-tenant-picker *ngIf="user.tenants.length > 1" (selected)="onTenantChosen($event)" />
```

## Common pitfalls

- **`headerName` mismatch** — must equal the backend's tenant source (`@stynx-nyx/tenancy` `headerName` when `source: 'header'`), or the backend doesn't see the tenant.
- **Stale context after tab restore** — if `persistSelection` is off, restoring a tab loses the tenant. Default-on mitigates.
- **Switching tenant without refreshing data** — the switcher updates context but in-flight component data may be stale; subscribe to `current` and refetch.

## Related packages

- [`@stynx-nyx/angular`](/docs/packages-web/angular/) — the foundation (also ships a base tenant context service).
- [`@stynx-nyx/tenancy`](/docs/packages/tenancy/) — the backend counterpart.
- [`@stynx-nyx/angular-iam`](/docs/packages-web/angular-iam/) — tenant admin management.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-tenancy/`](/docs/api-reference/stynx-web-angular-tenancy/)

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/angular-i18n`: `workspace:*`
- `rxjs`: `^7.8.2`

### Optional dependencies

_None._

### Peer dependencies

- `@angular/common`: `>=20.3.0 <22`
- `@angular/core`: `>=20.3.0 <22`
- `@angular/forms`: `>=20.3.0 <22`

### Development-only dependencies

- `@angular/common`: `21.2.19`
- `@angular/compiler`: `21.2.19`
- `@angular/compiler-cli`: `21.2.19`
- `@angular/core`: `21.2.19`
- `@angular/forms`: `21.2.19`
- `@angular/platform-browser`: `21.2.19`
- `@types/node`: `24.12.4`
- `jsdom`: `^29.0.2`
- `ng-packagr`: `21.2.3`
- `tslib`: `^2.8.1`
- `typescript`: `5.9.3`

<!-- stynx:generated-dependencies:end -->
