# ADR: PDF/A Validator Contract

**Status:** Accepted.
**Date:** 2026-05-25.
**Author role:** Architect, per DEVAI Constitution Article 6.
**Supersedes:** [ADR-PDF-A-BOUNDARY](ADR-PDF-A-BOUNDARY.md).

## Context

R10 kept PDF/A validation outside STYNX because a regulatory archival claim
without a real validator would overstate package guarantees. R11 added
deterministic PDF construction surfaces in `@stynx/pdf`, including public
payroll builders and PDF evidence appenders, but those helpers still expose
PDF/A-style structural checks only.

SGP adoption then surfaced the missing shared validation seam: adopters need a
single STYNX-blessed way to validate archival PDFs before deciding whether to
warn, block, or phase enforcement. STYNX owns the platform validation surface;
adopters own their policy decision and any high-volume caching.

## Decision

1. Target conformance is PDF/A-2b. PDF/A-2b sits on the PDF 1.7 family and is
   enough for visual reproducibility, which is the minimum regulatory archive
   bar for R12. PDF/A-2a tagged structure and PDF/A-2u Unicode guarantees remain
   future scope.

2. The default backend is veraPDF, invoked through the official Docker CLI
   image. The planned `verapdf/verapdf` image name was checked on 2026-05-25 and
   is not pullable from Docker Hub. R12 therefore pins the pullable official CLI
   image:
   `verapdf/cli@sha256:20202b4bcc2410a25db1f637c7b461a2e0dda1d97dd8a6df658286b30d56c842`.
   Future bumps must run:

   ```sh
   docker pull verapdf/cli
   docker inspect verapdf/cli --format '{{index .RepoDigests 0}}'
   ```

3. STYNX exposes the validator shape in `@stynx/pdf-a`:

   ```ts
   interface PdfAValidator {
     validate(pdf: Uint8Array, opts?: PdfAValidateOptions): Promise<PdfAValidationResult>;
   }
   ```

   `PdfAValidationResult` includes `valid`, `declared`, `rulesetVersion`,
   `validatedAt`, `durationMs`, and `errors[]`. `NoopPdfAValidator` always
   passes for explicit opt-out wiring. `StrictPdfAValidator` always fails so
   adopters cannot accidentally claim validation without a real backend.

4. Package split:
   - `@stynx/pdf-a` owns types, the interface, stubs, and telemetry sink shapes.
   - `@stynx/pdf-a-vera-docker` owns Docker invocation and veraPDF JSON report
     normalization.
   - A future `@stynx/pdf-a-vera-http` may wrap a sidecar service if adopters
     need long-lived verifier workers.

5. Validators emit per-call telemetry suitable for `@stynx/logging` or an
   adopter metrics sink:
   - `pdf_a_validation_attempts_total`
   - `pdf_a_validation_errors_total&#123;rule_id&#125;`
   - `pdf_a_validation_duration_ms`

6. Failure policy remains adopter-owned. Supported policies are fail-fast at
   generation time, warn plus telemetry, or build-time strict/runtime warn. SGP
   R11 should phase from build-time strict/runtime warn to warn-mode, then to
   fail-fast after a trust period.

7. Docker image pinning is by digest. The adapter default is a digest, never a
   mutable tag. CI can probe `verapdf/cli:latest` for early breakage detection,
   but adopters consume the digest-pinned default unless they override it.

8. Performance targets are cold validation at or below 5 s and warm validation
   p95 at or below 500 ms for a 50 KB single-page PDF. The R12 bench is a guard,
   not a universal production SLO; high-volume adopters should cache by
   template version or run a future sidecar.

9. Boundary clarification: STYNX owns the validation API, reference adapter,
   report normalization, and telemetry names. Adopters own environment policy,
   retry/circuit decisions around Docker, and per-template validation caches.

## Consequences

- `@stynx/pdf` can stay focused on rendering and deterministic construction.
- SGP and other adopters can use one `PdfAValidator` seam across build, runtime,
  and acceptance tooling.
- The veraPDF Docker adapter is intentionally operational: callers must have a
  working Docker daemon and compatible image platform.
- The R10 documented exclusion is superseded only for validation. PDF generation
  and legal acceptance semantics remain explicitly separated.

## Alternatives

- Keep PDF/A fully adopter-owned. Rejected because SGP now has a repeated gap
  across adopter workflows, and shared validation is platform-level behavior.
- Add validation directly inside `@stynx/pdf`. Rejected because generation and
  validation have different runtime dependencies, failure policies, and release
  cadence.
- Use a bundled JVM or native veraPDF binary. Rejected for R12 because Docker
  gives a clearer digest-pinned runtime and avoids host-level Java setup.
- Implement conversion to PDF/A. Rejected because R12 validates existing output;
  conversion changes bytes and needs a separate compatibility round.
- Require PDF/A-2a. Rejected because tagged PDF is valuable but not required for
  the first archival validation contract.

## References

- [ADR-PDF-A-BOUNDARY](ADR-PDF-A-BOUNDARY.md)
- [`@stynx/pdf`](../../../packages/pdf/README.md)
- [`@stynx/signature`](../../../packages/signature/README.md)
- SGP `docs/meta/gov/audit/diag/round-2-stynx-adoption-gaps.md`
- [veraPDF documentation](https://docs.verapdf.org/)
- [veraPDF Docker Hub repository](https://hub.docker.com/r/verapdf/cli)
