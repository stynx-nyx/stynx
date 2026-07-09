# @stynx-nyx/pdf

## Unreleased

- Bundle Liberation font assets and an sRGB ICC profile for fixed-layout
  PDF/A-2b output.
- Embed subset fonts, deterministic trailer IDs, XMP PDF/A metadata, and sRGB
  output intents in `FixedLayoutDocumentBuilder`.
- Move verification evidence placement into a valid incremental PDF update so
  `%%STYNX-PADES-SIGNATURE` remains byte-scannable without trailing bytes after
  `%%EOF`.
- Add veraPDF-backed conformance coverage for public-payroll payslip and
  yearly-income PDFs.

## 0.2.0

- Add deterministic fixed-layout PDF primitives backed by `pdf-lib`.
- Add a PDF verification-evidence appender that draws verification hints and
  delegates STYNX PAdES evidence blocks to `@stynx-nyx/signature`.
- Add a public-payroll template pack for payslip and yearly-income report PDFs.
- Add PDF/A-style structural validation helpers without claiming real PDF/A
  conformance.
