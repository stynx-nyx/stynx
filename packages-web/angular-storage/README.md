# `@stynx-web/angular-storage` — Angular file upload + download with presigned-URL flow

`@stynx-web/angular-storage` is the Angular file-handling package. It provides a document-upload component (drag-drop + progress), a document-download component, and the upload executors (multipart + XHR) that drive direct-to-S3 uploads via presigned URLs. Backed by the backend's [`@stynx/storage`](/docs/packages/storage/) presign endpoints.

## Purpose

File upload in browsers is fiddly: presigned-URL negotiation, direct-to-S3 PUT (so files don't proxy through your API), progress tracking, multipart for large files. `@stynx-web/angular-storage` packages the whole flow behind two components.

You reach for it when your app uploads or downloads user files.

What it does NOT do: it doesn't store files (S3 does, via the backend's presign). It doesn't scan/transform files.

## Audience

Angular frontend developers building file-upload features.

## Install

```bash
pnpm add @stynx-web/angular-storage
```

**Peer dependencies:** `@angular/core` `^18`, `@stynx-web/angular` `^1`, `@stynx-web/sdk` `^1`.

## Quick start

```html
<stynx-document-upload
  [accept]="'application/pdf'"
  [maxSizeBytes]="10_000_000"
  (uploaded)="onUploaded($event)"
/>
```

## Public API surface

### Components

| Selector                    | Component                   | Key inputs / outputs                                     | Description                                                  |
| --------------------------- | --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `<stynx-document-upload>`   | `DocumentUploadComponent`   | `[accept]`, `[maxSizeBytes]`; `(uploaded)`, `(progress)` | Drag-drop upload with progress; runs the presigned-URL flow. |
| `<stynx-document-download>` | `DocumentDownloadComponent` | `[documentId]`;                                          | Secure download via presigned URL.                           |

### Services

| Export            | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `DocumentService` | Programmatic upload/download; wraps the SDK's storage operations. |

### Upload executors

| Export                    | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `MultipartUploadExecutor` | Multipart upload for large files (chunked, resumable). |
| `XhrUploadExecutor`       | Single-PUT upload via XHR (progress events).           |

### Types

| Export  | Description                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------ |
| (types) | Upload/download view-model types. See [TypeDoc](/docs/api-reference/stynx-web-angular-storage/). |

## Configuration

| Option                    | Type     | Default     | Description                      |
| ------------------------- | -------- | ----------- | -------------------------------- |
| `multipartThresholdBytes` | `number` | `5_000_000` | Files above this use multipart.  |
| `concurrency`             | `number` | `3`         | Parallel multipart-part uploads. |

## Examples

### Example 1 — upload with progress

```html
<stynx-document-upload (progress)="pct = $event" (uploaded)="onDone($event)" />
<progress [value]="pct" max="100"></progress>
```

### Example 2 — programmatic download

```ts
import { DocumentService } from '@stynx-web/angular-storage';

@Component({
  /* ... */
})
export class Viewer {
  private readonly docs = inject(DocumentService);
  async download(id: string) {
    const url = await this.docs.getDownloadUrl(id);
    window.open(url, '_blank');
  }
}
```

### Example 3 — restrict file types + size

```html
<stynx-document-upload [accept]="'image/png,image/jpeg'" [maxSizeBytes]="2_000_000" />
```

## Common pitfalls

- **Bucket CORS not configured** — direct-to-S3 PUT fails the browser preflight. The backend bucket must allow the app's origin (see [`@stynx/storage`](/docs/packages/storage/)).
- **Presigned-URL expiry mid-upload** — large files on slow networks can outlast the presign TTL. Bump the backend's `presignTtl` for big files.
- **Multipart threshold too low** — many small parts add overhead. Tune `multipartThresholdBytes`.

## Related packages

- [`@stynx-web/angular`](/docs/packages-web/angular/) — the foundation.
- [`@stynx/storage`](/docs/packages/storage/) — the backend counterpart (presign endpoints + S3).

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-storage/`](/docs/api-reference/stynx-web-angular-storage/)
