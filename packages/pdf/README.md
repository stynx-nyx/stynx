# @stynx/pdf

`@stynx/pdf` is the shared STYNX server-side PDF generation package. It provides
a local renderer backed by Playwright Chromium plus a deterministic fixture
backend for tests. It also provides deterministic fixed-layout primitives and a
public-payroll report template pack for adopter-owned payslip and yearly-income
PDF construction. It does not depend on a remote PDF service.

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
- `FixedLayoutDocumentBuilder` and `validatePdfAStyle()` - provider-free
  `pdf-lib` helpers for stable fixed-layout PDFs and honest structural checks.
- `PdfVerificationEvidenceAppender` - draws a verification hint into PDF bytes
  and appends a STYNX PAdES evidence block through `@stynx/signature`.
- `PublicPayrollPdfBuilder` - adopter-compatible payslip and yearly-income
  template pack exposed through `@stynx/pdf/public-payroll`.

## PDF Evidence

```ts
import { PdfVerificationEvidenceAppender } from '@stynx/pdf/evidence';

const appender = new PdfVerificationEvidenceAppender({
  defaultSignerName: 'SGP report-service',
});

const signedPdf = await appender.embedVerificationHint({
  payload,
  verifyUrl: '/verify/document',
  reason: 'Official report',
});
```

The appender mutates PDF bytes only. It delegates the provider-free
`%%STYNX-PADES-SIGNATURE` evidence envelope to `@stynx/signature` and does not
claim legal CMS/PKCS#7/PAdES signing.

## Public Payroll Templates

```ts
import { PublicPayrollPdfBuilder } from '@stynx/pdf/public-payroll';

const builder = new PublicPayrollPdfBuilder({
  appendEvidence: (input) => appender.embedVerificationHint(input),
});

const pdf = await builder.buildPayslip(document);
const validation = builder.validatePdfAStyle(pdf);
```

The template pack is framework-agnostic. Consumers keep database reads,
LGPD/legal-basis checks, RBAC/RLS/audit behavior, storage keys, report status
transitions, and payroll/fiscal reconciliation in their own repositories.

## PDF/A

`output.profile: "pdf-a"` is not silently treated as a regular PDF. The local
backend throws `PdfProfileUnsupportedError` unless a `PdfAConformanceAdapter` is
configured. That keeps regulatory archival output explicit and auditable.

`validatePdfAStyle()` is a structural helper only. It checks for a PDF header,
metadata, and font resources; it is not a validator-backed PDF/A conformance
adapter.

For validator-backed conformance checks, wire `@stynx/pdf-a` with the reference
`@stynx/pdf-a-vera-docker` adapter after rendering. See
[`docs/adopters/pdf-a-validation.md`](../../docs/adopters/pdf-a-validation.md).

## Signature Interop

`RenderResult.sha256` is computed after bytes are rendered. That digest is the
only value that should be passed to `SignatureRequest.documentSha256`.

## PEC and TEAT Migration

PEC report generation can move document creation behind `PdfRenderer` before
calling `@stynx/signature`. TEAT can use the same renderer for AIT receipts,
integrity reports, and probative evidence packages without coupling to PEC.
SGP can wrap `PublicPayrollPdfBuilder` for official payslip and yearly-income
PDF construction while keeping its product semantics local.
