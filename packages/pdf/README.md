# @stynx/pdf

`@stynx/pdf` is the shared server-side PDF generation facade for NestJS
applications. PEC currently owns PDF artifact creation in
`documents-document-mgmt`; TEAT will consume the same boundary for receipts and
evidence documents.

The first release is a scaffold. A real renderer can be plugged in later; the
included fixture renderer is for unit tests and local contract exercises.

## Public API

```ts
import { PdfRenderer, createFixturePdfBackend } from '@stynx/pdf';

const renderer = new PdfRenderer(createFixturePdfBackend());
const result = await renderer.render({
  tenantId: 'tenant-a',
  template: {
    id: 'receipt',
    engine: 'fixture',
    source: 'Receipt {{number}}',
  },
  data: { number: 'AIT-1' },
});
```

Primary exports:

- `PdfRenderer` - facade that validates render requests and delegates to a
  provider.
- `PdfRenderBackend` - provider interface for Chromium, wkhtmltopdf, or
  domain-specific renderers.
- `createFixturePdfBackend()` - deterministic text-to-PDF-like backend for
  tests.
- `RenderRequest`, `RenderResult`, and template configuration types.

## Template Engine Plug Points

Templates are identified by `TemplateRef.engine`. The initial contract names
`fixture`, `handlebars`, and `html` engines, but it does not force a renderer.
Production consumers should bind their preferred implementation behind
`PdfRenderBackend`.

## Fonts and Branding

Brand packs are carried by `RenderRequest.branding`. The facade treats fonts,
logos, color tokens, and locale as render inputs so tenants and environments can
select branded artifacts without changing domain code.

## Interop with @stynx/signature

`RenderResult.sha256` is the stable digest that `@stynx/signature` should use as
`SignatureRequest.documentSha256`. Renderers must not mutate bytes after hashing.

## PEC and TEAT Migration

PEC R2 will migrate document generation behind this provider interface. TEAT R2
can use the same API for evidence receipts and signed output bundles.
