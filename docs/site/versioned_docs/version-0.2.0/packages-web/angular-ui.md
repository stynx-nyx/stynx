---
title: '@stynx-nyx/angular-ui'
---

# @stynx-nyx/angular-ui

Angular 20 UI primitives for STYNX web applications. The package is intentionally small: it provides reusable shell pieces for status, tables, pagination, toast, confirmation, loading, empty states, and icons while leaving app layout to the host.

## Install

```bash
pnpm add @stynx-nyx/angular-ui
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`

## Use

```ts
import { Component } from '@angular/core';
import {
  StynxBannerComponent,
  StynxTableComponent,
  StynxToastContainerComponent,
} from '@stynx-nyx/angular-ui';

@Component({
  standalone: true,
  imports: [StynxBannerComponent, StynxTableComponent, StynxToastContainerComponent],
  template: `
    <stynx-banner tone="info" message="Ready"></stynx-banner>
    <stynx-table [columns]="columns" [rows]="rows"></stynx-table>
    <stynx-toast-container></stynx-toast-container>
  `,
})
export class AppComponent {}
```

## Public Surface

- Components: `StynxBannerComponent`, `StynxConfirmDialogComponent`, `EmptyStateComponent`, `StynxIconComponent`, `StynxLoadingSpinnerComponent`, `StynxPaginationComponent`, `StynxTableComponent`, `StynxToastContainerComponent`.
- Services: `StynxToastService`.
- Icons: `STYNX_ICON_NAMES` and `StynxIconName`; host apps should inline or mount `assets/sprite.svg` so `&lt;stynx-icon&gt;` symbols resolve.
- Secondary exports: `@stynx-nyx/angular-ui/testing`, locale catalogs.

## See Also

- [`@stynx-nyx/angular`](/docs/packages-web/angular)
- [`@stynx-nyx/angular-i18n`](/docs/packages-web/angular-i18n)
- [Reference app dashboard demo](/docs/reference/web#demo-surfaces)
