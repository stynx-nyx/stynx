# `@stynx-nyx/angular-trash` — Angular soft-delete recovery UI (trash can + restore)

`@stynx-nyx/angular-trash` is the Angular soft-delete recovery package. It provides a `<stynx-trash-list>` component listing soft-deleted records with a restore action. Backed by `@stynx-nyx/data`'s soft-delete primitives (per `ADR-001-soft-delete`) exposed through the SDK.

## Purpose

Apps with soft-delete need a "trash can" so users can recover accidentally-deleted records. Building the list + restore + cascade-conflict handling per app is repetitive. `@stynx-nyx/angular-trash` provides it.

You reach for it when your app soft-deletes records and wants user-facing recovery.

What it does NOT do: it doesn't implement soft-delete (the backend `@stynx-nyx/data` does). It surfaces + restores.

## Audience

Angular frontend developers building data-management UIs.

## Install

```bash
pnpm add @stynx-nyx/angular-trash
```

## Quick start

```ts
import { provideTrash } from '@stynx-nyx/angular-trash';

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

- [`@stynx-nyx/angular`](/docs/packages-web/angular/) — the foundation.
- [`@stynx-nyx/data`](/docs/packages/data/) — the soft-delete cascade primitives (`ADR-001-soft-delete`).

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-trash/`](/docs/api-reference/stynx-web-angular-trash/)

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/angular-auth`: `workspace:*`
- `@stynx-nyx/angular-i18n`: `workspace:*`
- `@stynx-nyx/angular-ui`: `workspace:*`
- `@stynx-nyx/sdk`: `workspace:*`
- `rxjs`: `^7.8.2`

### Optional dependencies

_None._

### Peer dependencies

- `@angular/common`: `>=20.3.0 <22`
- `@angular/core`: `>=20.3.0 <22`

### Development-only dependencies

- `@angular/common`: `21.2.19`
- `@angular/compiler`: `21.2.19`
- `@angular/compiler-cli`: `21.2.19`
- `@angular/core`: `21.2.19`
- `@angular/platform-browser`: `21.2.19`
- `@types/node`: `24.12.4`
- `jsdom`: `^29.0.2`
- `ng-packagr`: `21.2.3`
- `tslib`: `^2.8.1`
- `typescript`: `5.9.3`

<!-- stynx:generated-dependencies:end -->
