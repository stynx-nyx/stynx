# `@stynx-nyx/angular-ui` — shared Angular UI primitives (tables, dialogs, toasts, banners)

`@stynx-nyx/angular-ui` is STYNX's shared component library — the design-system surface every STYNX frontend draws from. Standalone Angular components: data tables with pagination, confirmation dialogs, loading spinners, banners, icons, toast notifications. All themeable via CSS custom properties, all standalone (no NgModule required).

## Purpose

Every STYNX frontend needs the same UI primitives: a paginated table, a confirm-before-delete dialog, a loading spinner, toast notifications. Rebuilding these per app produces inconsistent UX. `@stynx-nyx/angular-ui` provides them once, themeable.

You reach for it whenever you build STYNX frontend screens — it's the visual vocabulary.

What it does NOT do: it's not a full design system (no form controls library — use Angular Material or your own for inputs). It doesn't impose a router or layout shell.

## Audience

Angular frontend developers building STYNX UIs.

## Install

```bash
pnpm add @stynx-nyx/angular-ui
```

**Peer dependencies:** `@angular/core` `^18`, `@angular/common` `^18`, `@stynx-nyx/angular` `^1`.

## Quick start

```ts
import { Component } from '@angular/core';
import { TableComponent, ConfirmDialogComponent } from '@stynx-nyx/angular-ui';

@Component({
  standalone: true,
  imports: [TableComponent, ConfirmDialogComponent],
  template: ` <stynx-table [rows]="users" [columns]="columns" [pageSize]="20" /> `,
})
export class UsersPage {}
```

## Public API surface

### Components

| Selector                  | Component                                                     | Key inputs / outputs                              | Description                                                 |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `<stynx-table>`           | `TableComponent`                                              | `[rows]`, `[columns]`, `[pageSize]`; `(rowClick)` | Data table with built-in pagination.                        |
| `<stynx-pagination>`      | `PaginationComponent`                                         | `[total]`, `[pageSize]`, `[page]`; `(pageChange)` | Standalone pagination control.                              |
| `<stynx-confirm-dialog>`  | `ConfirmDialogComponent`                                      | `[title]`, `[message]`; `(confirm)`, `(cancel)`   | Confirm-before-action modal.                                |
| `<stynx-loading-spinner>` | `LoadingSpinnerComponent`                                     | `[size]`, `[label]`                               | Loading indicator.                                          |
| `<stynx-banner>`          | `BannerComponent`                                             | `[type]`, `[message]`, `[dismissible]`            | Inline banner (info / warn / error).                        |
| `<stynx-icon>`            | `IconComponent`                                               | `[name]`, `[size]`                                | Icon renderer.                                              |
| `<stynx-toast-container>` | `ToastContainerComponent`                                     | —                                                 | Mount once at app root; renders toasts from `ToastService`. |
| `<stynx-empty-state>`     | `EmptyStateComponent` (re-exported from `@stynx-nyx/angular`) | `[message]`                                       | Empty-state placeholder.                                    |

### Services

| Export         | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `ToastService` | Programmatically push toasts. `.success(msg)`, `.error(msg)`, `.info(msg)`. |

## Configuration

Theming is via CSS custom properties — no module config. Override design tokens at the app root:

| CSS variable            | Default       | Description               |
| ----------------------- | ------------- | ------------------------- |
| `--stynx-color-primary` | (brand blue)  | Primary action color.     |
| `--stynx-color-danger`  | (red)         | Destructive action color. |
| `--stynx-density`       | `comfortable` | `comfortable \| compact`. |
| `--stynx-radius`        | `6px`         | Corner radius.            |

## Examples

### Example 1 — confirm dialog

```html
<stynx-confirm-dialog
  *ngIf="showDelete"
  title="Delete user?"
  message="This cannot be undone."
  (confirm)="onDelete()"
  (cancel)="showDelete = false"
/>
```

### Example 2 — toasts

```ts
import { ToastService } from '@stynx-nyx/angular-ui';

@Component({
  /* ... */
})
export class SaveButton {
  private readonly toast = inject(ToastService);
  async save() {
    await this.api.save();
    this.toast.success('Saved');
  }
}
```

Mount `<stynx-toast-container>` once at the app root for toasts to render.

### Example 3 — theming

```css
:root {
  --stynx-color-primary: #6d28d9;
  --stynx-density: compact;
}
```

## Common pitfalls

- **Forgetting `<stynx-toast-container>` at root** — `ToastService.success()` pushes a toast but nothing renders it. Mount the container once.
- **Importing components into an NgModule app** — these are standalone components; import them into the `imports` array of a standalone component or NgModule, not declare them.
- **Table with huge datasets** — `<stynx-table>` paginates client-side by default; for server-side data, drive `[rows]` from a paged API call + `(pageChange)`.

## Related packages

- [`@stynx-nyx/angular`](/docs/packages-web/angular/) — the foundation; provides `ToastService`'s underlying mechanism + the empty-state component.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-ui/`](/docs/api-reference/stynx-web-angular-ui/)
