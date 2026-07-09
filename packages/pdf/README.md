# `@stynx-nyx/pdf` — server-side PDF rendering (HTML/Handlebars → PDF) with PDF/A profile support

`@stynx-nyx/pdf` renders PDFs server-side. The default `LocalPdfRenderBackend` drives headless Chromium (via Playwright) to turn HTML or Handlebars templates into PDF bytes; a `FixturePdfBackend` produces deterministic output for tests without launching a browser. For archival-grade output it supports a PDF/A profile slot — supply a conformance adapter (e.g. [`@stynx-nyx/pdf-a-vera-docker`](/docs/packages/pdf-a-vera-docker/)) and request `profile: 'pdf-a'`. Ships a ready-made public-payroll template.

## Purpose

Generating PDFs server-side (invoices, payslips, reports, signed documents) is fiddly: headless-browser lifecycle, deterministic test output, PDF/A conformance for archival/legal requirements. `@stynx-nyx/pdf` packages all three behind a single `PdfRenderer`.

You reach for it whenever your app produces PDF output. For archival/legal PDFs (PDF/A-2b), pair it with a conformance adapter.

What it does NOT do: it doesn't sign PDFs (that's [`@stynx-nyx/signature`](/docs/packages/signature/)). It doesn't store them (that's [`@stynx-nyx/storage`](/docs/packages/storage/)). It doesn't render charts/graphics beyond what HTML+CSS can express.

## Audience

Backend developers generating documents.

## Install

```bash
pnpm add @stynx-nyx/pdf playwright
npx playwright install chromium
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx-nyx/core` `^1`, `playwright` `^1`, `handlebars` `^4`.

## Quick start

```ts
import { StynxPdfModule } from '@stynx-nyx/pdf';

StynxPdfModule.forRoot({});
```

```ts
import { PdfRenderer } from '@stynx-nyx/pdf';

@Injectable()
export class InvoiceService {
  constructor(private readonly pdf: PdfRenderer) {}

  async render(invoice: Invoice): Promise<Uint8Array> {
    const result = await this.pdf.render({
      tenantId: invoice.tenantId,
      template: { id: 'invoice', engine: 'handlebars', source: invoiceTemplate },
      data: invoice,
    });
    return result.bytes;
  }
}
```

## Public API surface

### Modules

| Export           | Signature                                   | Description                                                                |
| ---------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| `StynxPdfModule` | `.forRoot(options?: StynxPdfModuleOptions)` | Registers `PdfRenderer` + the configured backend + optional PDF/A adapter. |

### Services / Injectables

| Export                    | Description                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| `PdfRenderer`             | The facade: `render(request: RenderRequest): Promise<RenderResult>`. |
| `LocalPdfRenderBackend`   | Default backend — Playwright/Chromium HTML→PDF.                      |
| `createFixturePdfBackend` | Test backend — deterministic bytes without a browser.                |

### Errors

| Export                       | Description                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PdfValidationError`         | Bad request (e.g. fixture engine without the fixture backend).                                                                                      |
| `PdfRenderError`             | Rendering failed (Chromium launch, page error).                                                                                                     |
| `PdfProfileUnsupportedError` | `profile: 'pdf-a'` requested but no conformance adapter configured. **Fires before** the Chromium render (precondition fix, R15 commit `be3f9e27`). |

### Templates

| Export                    | Description                                 |
| ------------------------- | ------------------------------------------- |
| `PublicPayrollPdfBuilder` | Ready-made public-payroll payslip template. |

### Types / Interfaces

| Export                    | Description                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `RenderRequest<TData>`    | `{ tenantId, template: { id, engine, source }, data, output?, branding?, metadata? }`. |
| `RenderResult`            | `{ bytes, contentType, sha256, pageCount, templateId, metadata }`.                     |
| `PdfRenderBackend`        | Backend interface (implement for a custom renderer).                                   |
| `LocalPdfRendererOptions` | Backend options (launch opts, timeouts, defaults).                                     |
| `PdfProfile`              | `'pdf' \| 'pdf-a'`.                                                                    |

## Configuration

| Option              | Type                     | Default                 | Description                                               |
| ------------------- | ------------------------ | ----------------------- | --------------------------------------------------------- |
| `backend`           | `PdfRenderBackend`       | `LocalPdfRenderBackend` | Render backend.                                           |
| `pdfAAdapter`       | `PdfAConformanceAdapter` | none                    | Required to satisfy `profile: 'pdf-a'` requests.          |
| `launchOptions`     | Playwright launch opts   | `{ headless: true }`    | Chromium launch config.                                   |
| `timeoutMs`         | `number`                 | `15_000`                | Per-page render timeout.                                  |
| `defaultPdfOptions` | `PDFOptions`             | A4 + printBackground    | Default `page.pdf()` options.                             |
| `baseUrl`           | `string`                 | none                    | Base href for resolving relative asset URLs in templates. |

## Examples

### Example 1 — HTML template

```ts
await pdf.render({
  tenantId: 't1',
  template: { id: 'receipt', engine: 'html', source: '<html><body><h1>Receipt</h1></body></html>' },
  data: {},
});
```

### Example 2 — PDF/A with the veraPDF adapter

```ts
import { VeraPdfDockerValidator } from '@stynx-nyx/pdf-a-vera-docker';

StynxPdfModule.forRoot({
  pdfAAdapter: new VeraPdfDockerValidator({
    /* ... */
  }),
});

await pdf.render({
  tenantId: 't1',
  template: { id: 'archive', engine: 'html', source: html },
  data: {},
  output: { profile: 'pdf-a' },
});
```

### Example 3 — fixture backend in tests

```ts
import { createFixturePdfBackend } from '@stynx-nyx/pdf';

const renderer = new PdfRenderer(createFixturePdfBackend());
const result = await renderer.render({
  tenantId: 't',
  template: { id: 'x', engine: 'fixture', source: '' },
  data: {},
});
// deterministic bytes, no Chromium
```

## Common pitfalls

- **Chromium not installed** — `npx playwright install chromium` after adding the package, or the render throws `PdfRenderError` on launch.
- **`profile: 'pdf-a'` without a configured `pdfAAdapter`** — throws `PdfProfileUnsupportedError` _before_ the render (so you don't pay the Chromium cost on a request that can't succeed). Configure an adapter.
- **Chromium under Docker resource pressure** — under-resourced containers fail browser launch intermittently. Allocate ≥512MB + `--no-sandbox` where appropriate.
- **`engine: 'fixture'` with the real backend** — throws `PdfValidationError`. Fixtures require `createFixturePdfBackend()`.

## Related packages

- [`@stynx-nyx/pdf-a`](/docs/packages/pdf-a/) — the PDF/A conformance-adapter contract.
- [`@stynx-nyx/pdf-a-vera-docker`](/docs/packages/pdf-a-vera-docker/) — a veraPDF-Docker-backed adapter implementing that contract.
- [`@stynx-nyx/signature`](/docs/packages/signature/) — sign the rendered PDF.
- [`@stynx-nyx/storage`](/docs/packages/storage/) — store the rendered PDF.
- [`@stynx-nyx/testing`](/docs/packages/testing/) — uses `createFixturePdfBackend()` in test apps.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-pdf/`](/docs/api-reference/stynx-pdf/)
