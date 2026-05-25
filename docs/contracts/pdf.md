# PDF Contract

**Authority:** Architect (DEVAI Constitution Article 6).
**Package:** `@stynx/pdf`.

`@stynx/pdf` owns local server-side PDF rendering for STYNX consumers. It
supports deterministic fixture rendering for tests and local Playwright
Chromium rendering for `html` and `handlebars` templates.
It also exposes provider-free fixed-layout primitives and an explicit
PDF evidence appender plus a public-payroll template pack for payslip and
yearly-income report PDFs.

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

The fixed-layout helpers expose `validatePdfAStyle(buffer)`, which is a
structural check for PDF header, metadata, and font resources. It is intentionally
named PDF/A-style and must not be treated as validator-backed PDF/A conformance.

## Public Payroll Template Pack

`@stynx/pdf/public-payroll` exports `PublicPayrollPdfBuilder` for deterministic
payslip and yearly-income construction. The builder accepts an optional
`appendEvidence(input)` function so adopters can attach PAdES or verification
hints without STYNX importing adopter runtime code.

The template pack owns PDF layout and stable metadata only. Adopters keep data
selection, LGPD/legal-basis checks, RBAC/RLS/audit behavior, reconciliation,
storage keys, retention policy, and report status transitions.

## PDF Evidence

`@stynx/pdf/evidence` exports `PdfVerificationEvidenceAppender`. It draws a
public verification hint into PDF bytes when possible, uses a package-neutral
fallback marker for non-PDF payloads, and appends a
`%%STYNX-PADES-SIGNATURE` evidence block by delegating to `@stynx/signature`.

This remains provider-free deterministic evidence. It is not a legal
CMS/PKCS#7/PAdES implementation.

## Migration Notes

PEC document/report generation can move behind `PdfRenderer` before signing.
TEAT can use the same package for AIT receipts, integrity reports and probative
evidence bundles without domain coupling.
