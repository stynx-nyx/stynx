# `@stynx-web/angular-trash` — Angular soft-delete recovery UI (trash can + restore)

`@stynx-web/angular-trash` is the Angular soft-delete recovery package. It provides a `<stynx-trash-list>` component listing soft-deleted records with a restore action. Backed by `@stynx/data`'s soft-delete primitives (per `ADR-001-soft-delete`) exposed through the SDK.

## Purpose

Apps with soft-delete need a "trash can" so users can recover accidentally-deleted records. Building the list + restore + cascade-conflict handling per app is repetitive. `@stynx-web/angular-trash` provides it.

You reach for it when your app soft-deletes records and wants user-facing recovery.

What it does NOT do: it doesn't implement soft-delete (the backend `@stynx/data` does). It surfaces + restores.

## Audience

Angular frontend developers building data-management UIs.

## Install

```bash
pnpm add @stynx-web/angular-trash
```

**Peer dependencies:** `@angular/core` `^18`, `@stynx-web/angular` `^1`, `@stynx-web/angular-ui` `^1`, `@stynx-web/sdk` `^1`.

## Quick start

```ts
import { provideTrash } from '@stynx-web/angular-trash';

export const appConfig = { providers: [provideTrash()] };
```

```html
<stynx-trash-list [entityType]="'order'" />
```

## Public API surface

### Providers

| Export         | Description                                           |
| -------------- | ----------------------------------------------------- |
| `provideTrash` | Registers the trash adapter + component dependencies. |

### Components

| Selector             | Component            | Key inputs / outputs         | Description                                                |
| -------------------- | -------------------- | ---------------------------- | ---------------------------------------------------------- |
| `<stynx-trash-list>` | `TrashListComponent` | `[entityType]`; `(restored)` | Lists soft-deleted records of a type with restore actions. |

### Services

| Export            | Description                                        |
| ----------------- | -------------------------------------------------- |
| `SdkTrashAdapter` | Wraps the SDK's list-deleted + restore operations. |

### Types

| Export  | Description                                                                          |
| ------- | ------------------------------------------------------------------------------------ |
| (types) | Trash view-model types. See [TypeDoc](/docs/api-reference/stynx-web-angular-trash/). |

## Configuration

| Option           | Type      | Default | Description                            |
| ---------------- | --------- | ------- | -------------------------------------- |
| `confirmRestore` | `boolean` | `false` | Require confirmation before restoring. |
| `pageSize`       | `number`  | `20`    | List pagination.                       |

## Examples

### Example 1 — trash for one entity type

```html
<stynx-trash-list entityType="document" (restored)="refreshList()" />
```

### Example 2 — with restore confirmation

```html
<stynx-trash-list entityType="order" [confirmRestore]="true" />
```

## Common pitfalls

- **Restore-conflict when the parent is also deleted** — restoring a child whose parent is still soft-deleted is a cascade conflict (per `ADR-001-soft-delete`). The component surfaces the conflict; the user must restore the parent first. The UI can't paper over backend-mandated cascade rules.
- **Trash list across tenants** — like all STYNX data, soft-deleted records are tenant-scoped server-side. The UI shows the current tenant's trash only.

## Related packages

- [`@stynx-web/angular`](/docs/packages-web/angular/) — the foundation.
- [`@stynx/data`](/docs/packages/data/) — the soft-delete cascade primitives (`ADR-001-soft-delete`).

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-trash/`](/docs/api-reference/stynx-web-angular-trash/)
