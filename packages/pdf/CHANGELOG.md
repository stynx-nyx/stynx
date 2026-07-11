# @stynx-nyx/pdf

## 1.0.2

### Patch Changes

- cc0f53e: License and authorship metadata in manifests: SPDX `license: "BUSL-1.1"` and
  `author: "Antonio Augusto Russo <aarusso@nyxk.com.br>"` added to every
  publishable package.json. No runtime changes.
- Updated dependencies [cc0f53e]
  - @stynx-nyx/signature@0.2.2

## 1.0.1

### Patch Changes

- 41a2a8b: Relicense: per-package LICENSE pointer files now reference the Business
  Source License 1.1 (see the repository LICENSE for parameters); package
  manifests and tarballs pick the new license text up from this release.
- Updated dependencies [41a2a8b]
  - @stynx-nyx/signature@0.2.1

## 1.0.0

### Minor Changes

- 76bb600: Add deterministic fixed-layout PDF primitives, a PDF verification-evidence appender, and a public-payroll template pack for payslip and yearly-income reports.
- cb1916f: Bundle PDF/A-2b content assets, embed deterministic catalog metadata and sRGB
  output intents, and move verification evidence into a valid incremental PDF
  update so public-payroll PDFs validate with veraPDF before and after evidence.
- de034f7: Add Round 1 shared module scaffolds for PAdES signatures, PDF rendering,
  tenant-scoped feature flags, and external integration adapters.

### Patch Changes

- 745c2dd: Support PEC Round 2 adoption of shared signature, PDF, feature-flag, and integration adapter runtimes.
- Updated dependencies [745c2dd]
- Updated dependencies [99afc50]
- Updated dependencies [d06e01c]
- Updated dependencies [de034f7]
  - @stynx-nyx/signature@0.2.0

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
