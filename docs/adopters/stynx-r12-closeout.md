# STYNX R12 Closeout: PDF/A Validator

**Package:** `@stynx-nyx/pdf-a@0.1.0`, `@stynx-nyx/pdf-a-vera-docker@0.1.0`
**Author roles:** Architect, Engineer, Inspector, per DEVAI Article 6.

## Surface Changes

- Add `@stynx-nyx/pdf-a` with `PdfAValidator`, validation result types, telemetry
  metric names, `NoopPdfAValidator`, and `StrictPdfAValidator`.
- Add `@stynx-nyx/pdf-a-vera-docker` with the digest-pinned veraPDF Docker adapter,
  JSON report normalization, Docker timeout handling, fixture corpus, and bench
  gate.
- No existing `@stynx-nyx/pdf` public surface is modified.

## Migration Notes

Existing `@stynx-nyx/pdf` consumers do not need to migrate. PDF/A validation is
opt-in: inject any `PdfAValidator` after PDF construction and decide the
environment failure policy locally.

## Fixture Compatibility

The validator is additive and does not change PDF byte output. Fixtures validate
adapter behavior only.

## Commands

```sh
pnpm --filter @stynx-nyx/pdf-a build test lint typecheck
pnpm --filter @stynx-nyx/pdf-a-vera-docker build test lint typecheck bench
```

## Owner Decisions

PDF/A-2b is the R12 target. Other versions and conformance levels require a
future ADR before becoming default adopter policy.
