---
title: '@stynx-nyx/angular-storage'
---

# @stynx-nyx/angular-storage

Angular 20 document storage UI and services for tenant-scoped uploads and downloads. It includes upload/download components, document metadata service calls, XHR upload execution, and multipart upload support.

## Install

```bash
pnpm add @stynx-nyx/angular-storage
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`

## Use

```ts
import { provideStynxDefaults } from '@stynx-nyx/angular';
import {
  DocumentService,
  provideStynxMultipartUploadExecutor,
  StynxDocumentUploadComponent,
} from '@stynx-nyx/angular-storage';

bootstrapApplication(AppComponent, {
  providers: [
    provideStynxDefaults({
      angular: { apiBaseUrl: '/api', sessionMode: 'bearer' },
    }),
    DocumentService,
    provideStynxMultipartUploadExecutor(),
  ],
});
```

Import `StynxDocumentUploadComponent` or `StynxDocumentDownloadComponent` in standalone screens.

## Public Surface

- Components: `StynxDocumentUploadComponent`, `StynxDocumentDownloadComponent`.
- Services/executors: `DocumentService`, `XhrUploadExecutor`, `MultipartUploadExecutor`, `provideStynxMultipartUploadExecutor`.
- Tokens: `STYNX_UPLOAD_EXECUTOR`, `STYNX_MULTIPART_UPLOAD_OPTIONS`, `STYNX_DEFAULT_MULTIPART_UPLOAD_OPTIONS`.
- Types: upload initiation/completion, download, scan status, upload executor, multipart options, and document list item types.
- Secondary exports: `@stynx-nyx/angular-storage/testing`, locale catalogs.

## See Also

- [`@stynx-nyx/angular`](/docs/packages-web/angular)
- [`@stynx-nyx/angular-trash`](/docs/packages-web/angular-trash)
- [Reference app storage demo](/docs/reference/web#demo-surfaces)
