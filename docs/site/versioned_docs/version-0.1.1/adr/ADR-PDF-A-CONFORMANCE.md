# ADR: PDF/A-2b Conformance for STYNX PDF Output

**Status:** Accepted.
**Date:** 2026-05-25.
**Author role:** Architect, per DEVAI Constitution Article 6.
**Related:** [ADR-PDF-A-VALIDATOR-CONTRACT](ADR-PDF-A-VALIDATOR-CONTRACT.md).

## Context

R12 established the validator contract and the digest-pinned veraPDF Docker
adapter. SGP R11 then validated byte-stable PDFs produced by `@stynx/pdf` and
found five PDF/A-2b failures in STYNX-owned output: standard-14 fonts were not
embedded, trailer `/ID` was absent, evidence bytes were appended after
`%%EOF`, DeviceRGB had no output intent, and catalog XMP metadata was missing.

This ADR defines the content-side conformance baseline for PDFs emitted by
`FixedLayoutDocumentBuilder` and by
`PdfVerificationEvidenceAppender.embedVerificationHint`.

## Decision

1. STYNX fixed-layout PDFs target PDF/A-2b. Validator-backed conformance remains
   external and is still owned by `@stynx/pdf-a` and
   `@stynx/pdf-a-vera-docker`.

2. `@stynx/pdf` bundles deterministic binary assets:

   | Asset                                     | SHA-256                                                            |
   | ----------------------------------------- | ------------------------------------------------------------------ |
   | `assets/fonts/LiberationSans-Regular.ttf` | `76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8` |
   | `assets/fonts/LiberationSans-Bold.ttf`    | `788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173` |
   | `assets/fonts/LiberationMono-Regular.ttf` | `f2b83c763e8afd21709333370bed4774337fae82267937e2b5aea7e2fbd922c1` |
   | `assets/color/sRGB-IEC61966-2.1.icc`      | `b3599c68b79236e5ce69d8dd22178157553631c5fe829130602cde98d8764790` |

3. The font corpus is Liberation Sans Regular, Liberation Sans Bold, and
   Liberation Mono Regular from Liberation Fonts 2.1.5. The package keeps the
   upstream license as `assets/fonts/LICENSE-LIBERATION-FONTS`. Custom fonts are
   embedded through `@pdf-lib/fontkit` with subsetting enabled.

4. The RGB output profile is the ICC registry's
   `sRGB_IEC61966-2-1_no_black_scaling.icc`, bundled as
   `assets/color/sRGB-IEC61966-2.1.icc` with its redistribution notice at
   `assets/color/LICENSE-SRGB-ICC`.

5. `FixedLayoutDocumentBuilder.save()` writes catalog-level PDF/A plumbing
   before serialization:
   - deterministic trailer `/ID` derived from title, author, and creation date;
   - catalog `/OutputIntents` pointing at the bundled sRGB ICC profile;
   - catalog `/Metadata` XMP stream mirroring Info dictionary fields and
     declaring `pdfaid:part=2` plus `pdfaid:conformance=B`.

6. The evidence appender no longer concatenates raw bytes after the final EOF.
   It draws the verification hint with the same embedded Liberation Sans font,
   saves a conformant PDF body, and appends the
   `%%STYNX-PADES-SIGNATURE:` envelope inside a valid incremental update object.
   This preserves SGP's byte-scan extraction contract while ensuring the final
   bytes end at the newest `%%EOF`.

7. Byte stability remains required for fixed inputs. Asset versions, hashes,
   metadata timestamps, trailer IDs, and evidence inputs are deterministic.
   Changes to any bundled binary asset require an ADR update and a changeset.

## Consequences

- `@stynx/pdf` now owns real PDF/A-2b content generation for its fixed-layout
  and public-payroll surfaces.
- Consumers still decide when validation is a hard failure. They should validate
  with `@stynx/pdf-a-vera-docker` when claiming archival conformance.
- The package gains one runtime dependency, `@pdf-lib/fontkit`, to embed real
  fonts.
- Evidence extraction remains compatible with existing byte scanners because
  the marker is still present in the PDF byte stream.

## Alternatives

- Use standard-14 fonts and document the limitation. Rejected because PDF/A
  forbids relying on unembedded standard fonts.
- Convert all color to DeviceGray and skip ICC output intents. Rejected because
  output intents are a clearer baseline if templates later add non-black RGB.
- Store the evidence envelope only in a sidecar record. Rejected because SGP
  already consumes the byte-scannable marker from PDF bytes.
- Add a full CMS/PAdES implementation in this round. Rejected because R13 fixes
  PDF/A placement and conformance; legal signing semantics remain the
  adopter/provider boundary defined by `@stynx/signature`.

## References

- [ADR-PDF-A-VALIDATOR-CONTRACT](ADR-PDF-A-VALIDATOR-CONTRACT.md)
- [`@stynx/pdf`](/docs/packages/pdf)
- [PDF/A Validation adopter guide](/docs/adopters/pdf-a-validation)
