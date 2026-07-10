# @stynx-nyx/pdf-a

## 0.2.0

### Minor Changes

- 2053d9e: Add the PDF/A validator interface, validation result types, telemetry metric
  names, `NoopPdfAValidator`, and `StrictPdfAValidator`.

  Adoption notes: this is an additive package. Existing `@stynx-nyx/pdf` consumers do
  not migrate; adopters opt in by injecting a `PdfAValidator` after PDF generation
  and choosing a local failure policy.

## 0.1.0

- Add the PDF/A validator interface, validation result types, telemetry names,
  `NoopPdfAValidator`, and `StrictPdfAValidator`.
