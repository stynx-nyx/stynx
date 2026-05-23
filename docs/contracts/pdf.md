# PDF Contract

**Authority:** Architect (DEVAI Constitution Article 6).
**Package:** `@stynx/pdf`.

`@stynx/pdf` owns local server-side PDF rendering for STYNX consumers. It
supports deterministic fixture rendering for tests and local Playwright
Chromium rendering for `html` and `handlebars` templates.

## RenderRequest

Render requests include tenant scope, template id/engine/source/version,
JSON-safe data, optional branding, metadata and output options. `tenantId`,
`template.id` and `template.source` are required.

## RenderResult

Renderers return immutable PDF bytes, `application/pdf`, SHA-256 computed after
rendering, page count, template id/version and merged metadata. That SHA-256 is
the digest to pass to `@stynx/signature`.

## Local Renderer

`LocalPdfRenderBackend` renders `html` and `handlebars` templates with local
Playwright Chromium. Runtime options cover launch options, base URL injection,
timeout, default PDF options and default metadata.

## PDF/A

`output.profile: "pdf-a"` requires a configured `PdfAConformanceAdapter`.
Without one, the package throws `PdfProfileUnsupportedError` rather than
mislabeling a normal PDF as archival PDF/A.

## Migration Notes

PEC document/report generation can move behind `PdfRenderer` before signing.
TEAT can use the same package for AIT receipts, integrity reports and probative
evidence bundles without domain coupling.
