# ADR: PDF/A Boundary

**Status:** Superseded by [ADR-PDF-A-VALIDATOR-CONTRACT](ADR-PDF-A-VALIDATOR-CONTRACT.md) (2026-05-25).
**Date:** 2026-05-24.
**Author role:** Architect, per DEVAI Article 6.

Original "documented exclusion" decision is retained below for historical
context. STYNX now ships validation via `@stynx-nyx/pdf-a` and
`@stynx-nyx/pdf-a-vera-docker`; see the successor ADR for the current contract.

## Context

`@stynx-nyx/pdf` provides server-side PDF rendering and a `PdfAConformanceAdapter`
hook, but it does not implement PDF/A conversion or validation internally. SGP
currently keeps byte-stable `pdf-lib` builders for payslip and yearly-income
PDF/A-style reports, with golden fixtures that assert exact output bytes.

The R10 choice was whether STYNX should own a shared PDF/A adapter, provide
lower-level deterministic primitives, or explicitly keep PDF/A conformance
outside the package boundary.

## Decision

STYNX will not ship a built-in PDF/A conformance adapter in R10. PDF/A
conformance remains adopter-owned unless a future round brings a real validator
and conversion implementation with fixture compatibility evidence. The
`PdfAConformanceAdapter` interface stays as the integration point for adopters
that already have a compliant converter.

In R11 follow-up work, STYNX may ship deterministic fixed-layout helpers and
explicit adopter-compatible template packs, provided they are documented as
PDF/A-style structural output rather than validator-backed PDF/A conformance.

## Rationale

PDF/A is a regulatory archival claim, not a generic rendering feature. A shared
adapter without real conformance validation would imply more assurance than the
package can provide. SGP's current local builders intentionally preserve
byte-stable golden fixtures and domain-specific metadata; moving that logic into
STYNX without a validator would increase risk while reducing audit clarity.

## Consequences

- `@stynx-nyx/pdf` continues to reject `output.profile: "pdf-a"` unless callers
  configure a `PdfAConformanceAdapter`.
- SGP can replace duplicated PDF construction with an explicit public-payroll
  template pack while keeping orchestration, product semantics, and regulatory
  acceptance in SGP.
- Future STYNX work may add deterministic primitives or a real adapter only with
  validator-backed tests and adopter fixture compatibility evidence.
