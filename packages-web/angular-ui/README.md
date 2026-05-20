# @stynx-web/angular-ui

Angular 20 UI primitives for STYNX web applications. The package is intentionally small: it provides reusable shell pieces for status, tables, pagination, toast, confirmation, loading, empty states, and icons while leaving app layout to the host.

## Install

```bash
pnpm add @stynx-web/angular-ui
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
} from '@stynx-web/angular-ui';

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
- Icons: `STYNX_ICON_NAMES` and `StynxIconName`; host apps should inline or mount `assets/sprite.svg` so `<stynx-icon>` symbols resolve.
- Secondary exports: `@stynx-web/angular-ui/testing`, locale catalogs.

## See Also

- [`@stynx-web/angular`](../angular/README.md)
- [`@stynx-web/angular-i18n`](../angular-i18n/README.md)
- [Reference app dashboard demo](../../reference/web/README.md#demo-surfaces)
