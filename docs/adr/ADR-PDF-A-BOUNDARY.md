# ADR: PDF/A Boundary

**Status:** Accepted.
**Date:** 2026-05-24.
**Author role:** Architect, per DEVAI Article 6.

## Context

`@stynx/pdf` provides server-side PDF rendering and a `PdfAConformanceAdapter`
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

## Rationale

PDF/A is a regulatory archival claim, not a generic rendering feature. A shared
adapter without real conformance validation would imply more assurance than the
package can provide. SGP's current local builders intentionally preserve
byte-stable golden fixtures and domain-specific metadata; moving that logic into
STYNX without a validator would increase risk while reducing audit clarity.

## Consequences

- `@stynx/pdf` continues to reject `output.profile: "pdf-a"` unless callers
  configure a `PdfAConformanceAdapter`.
- SGP keeps its local PDF/A builders and can update its R10 adoption diagnostic
  from "missing STYNX API" to "intentionally adopter-local by STYNX decision."
- Future STYNX work may add deterministic primitives or a real adapter only with
  validator-backed tests and adopter fixture compatibility evidence.
