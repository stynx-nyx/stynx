# @stynx-nyx/pdf-a

## 0.2.1

### Patch Changes

- 41a2a8b: Relicense: per-package LICENSE pointer files now reference the Business
  Source License 1.1 (see the repository LICENSE for parameters); package
  manifests and tarballs pick the new license text up from this release.
- Updated dependencies [41a2a8b]
  - @stynx-nyx/logging@1.0.1

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
