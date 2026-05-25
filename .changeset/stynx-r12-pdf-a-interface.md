---
'@stynx/pdf-a': minor
---

Add the PDF/A validator interface, validation result types, telemetry metric
names, `NoopPdfAValidator`, and `StrictPdfAValidator`.

Adoption notes: this is an additive package. Existing `@stynx/pdf` consumers do
not migrate; adopters opt in by injecting a `PdfAValidator` after PDF generation
and choosing a local failure policy.
