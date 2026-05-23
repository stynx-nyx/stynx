# PDF Contract

**Authority:** Architect (DEVAI Constitution Article 6).
**Package:** `@stynx/pdf`.

This contract defines the server-side PDF rendering boundary that PEC document
management and TEAT receipt/evidence flows can consume without importing
domain-specific rendering internals.

## RenderRequest

| Field              | Required | Description                                                       |
| ------------------ | -------- | ----------------------------------------------------------------- |
| `tenantId`         | yes      | Tenant scope for branding, audit, and output ownership.           |
| `template.id`      | yes      | Stable template identifier.                                       |
| `template.engine`  | yes      | Template engine key such as `fixture`, `handlebars`, or `html`.   |
| `template.source`  | yes      | Template source or provider-local template body.                  |
| `template.version` | no       | Version pin for durable evidence.                                 |
| `data`             | yes      | JSON-safe render data owned by the consuming domain.              |
| `branding`         | no       | Tenant brand inputs: logo, font, color, locale.                   |
| `output.profile`   | no       | `pdf` or `pdf-a`; signed regulatory artifacts should use `pdf-a`. |

## RenderResult

Renderers return:

- `bytes` containing the immutable PDF bytes;
- `contentType` equal to `application/pdf`;
- `sha256`, the digest consumed by `@stynx/signature`;
- `pageCount`;
- template id and optional version;
- metadata copied from the request and renderer.

## Signature Interop

`RenderResult.sha256` is the only digest that may be handed to
`SignatureRequest.documentSha256`. A renderer must not mutate bytes after
hashing.

## Provider Boundary

The package does not mandate Chromium, wkhtmltopdf, or a specific template
library. Those choices remain provider implementations behind `PdfRenderBackend`.
