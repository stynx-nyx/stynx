# @stynx-web/angular-trash

Angular 20 trash recovery UI for STYNX soft-delete workflows. It provides a reusable list component and SDK-backed adapter for browsing, restoring, and hard-deleting archived resources.

## Install

```bash
pnpm add @stynx-web/angular-trash
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`

## Use

```ts
import { provideStynxTrash, StynxTrashListComponent } from '@stynx-web/angular-trash';
import { StynxSdkClient } from '@stynx-web/sdk';

const client = new StynxSdkClient({ baseUrl: '/api', fetchFn: fetch });

bootstrapApplication(AppComponent, {
  providers: [
    provideStynxTrash(client, {
      kinds: [{ key: 'records', label: 'Records' }],
    }),
  ],
});
```

Use `StynxTrashListComponent` in a standalone screen.

## Public Surface

- Providers: `provideStynxTrash`.
- Components: `StynxTrashListComponent`.
- Adapters/tokens: `SdkTrashAdapter`, `STYNX_TRASH_CLIENT`, `STYNX_TRASH_OPTIONS`, `STYNX_TRASH_ADAPTER`, `STYNX_DEFAULT_TRASH_KINDS`.
- Types: trash item, kind config, adapter, page, options, restore, and hard-delete types.
- Secondary exports: `@stynx-web/angular-trash/testing`, locale catalogs.

## See Also

- [`@stynx-web/angular-storage`](../angular-storage/README.md)
- [`@stynx-web/angular-auth`](../angular-auth/README.md)
- [Reference app trash demo](../../reference/web/README.md#demo-surfaces)
