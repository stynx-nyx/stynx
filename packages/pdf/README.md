# @stynx/pdf

`@stynx/pdf` is the shared STYNX server-side PDF generation package. It provides
a local renderer backed by Playwright Chromium plus a deterministic fixture
backend for tests. It does not depend on a remote PDF service.

## Nest Setup

```ts
import { StynxPdfModule } from '@stynx/pdf';

StynxPdfModule.forRoot({
  defaultPdfOptions: { format: 'A4', printBackground: true },
  timeoutMs: 15_000,
  defaultMetadata: { product: 'stynx' },
});
```

## Public API

```ts
import { PdfRenderer } from '@stynx/pdf';

const pdf = await renderer.render({
  tenantId: 'tenant-a',
  template: {
    id: 'receipt',
    engine: 'handlebars',
    source: '<html><body>Receipt {{number}}</body></html>',
    version: '1',
  },
  data: { number: 'AIT-1' },
});
```

Primary exports:

- `StynxPdfModule` - Nest module that wires `PdfRenderer` to the local backend.
- `PdfRenderer` - validates render requests and delegates to a backend.
- `LocalPdfRenderBackend` - renders `html` and `handlebars` templates locally
  with Playwright Chromium.
- `createFixturePdfBackend()` - deterministic lightweight backend for tests.

## PDF/A

`output.profile: "pdf-a"` is not silently treated as a regular PDF. The local
backend throws `PdfProfileUnsupportedError` unless a `PdfAConformanceAdapter` is
configured. That keeps regulatory archival output explicit and auditable.

## Signature Interop

`RenderResult.sha256` is computed after bytes are rendered. That digest is the
only value that should be passed to `SignatureRequest.documentSha256`.

## PEC and TEAT Migration

PEC report generation can move document creation behind `PdfRenderer` before
calling `@stynx/signature`. TEAT can use the same renderer for AIT receipts,
integrity reports, and probative evidence packages without coupling to PEC.
