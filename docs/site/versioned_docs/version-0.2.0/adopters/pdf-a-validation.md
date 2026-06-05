# PDF/A Validation

STYNX ships a validator contract in `@stynx/pdf-a` and a reference veraPDF
Docker adapter in `@stynx/pdf-a-vera-docker`. R12 targets PDF/A-2b.

R13 makes `@stynx/pdf` fixed-layout and public-payroll outputs conformant with
that target by bundling embedded Liberation fonts, an sRGB output intent,
deterministic trailer IDs, and catalog XMP metadata. The evidence appender keeps
the `%%STYNX-PADES-SIGNATURE:` marker byte-scannable but places it inside a
valid incremental PDF update rather than after the final EOF.

## Install

Pull the digest-pinned veraPDF CLI image from the ADR:

```sh
docker pull verapdf/cli@sha256:20202b4bcc2410a25db1f637c7b461a2e0dda1d97dd8a6df658286b30d56c842
```

Runtime overrides:

| Variable                   | Purpose                                     |
| -------------------------- | ------------------------------------------- |
| `STYNX_VERAPDF_IMAGE`      | Override the digest-pinned image.           |
| `STYNX_VERAPDF_DOCKER_BIN` | Use a non-default Docker binary path.       |
| `STYNX_VERAPDF_TIMEOUT_MS` | Set per-validation timeout in milliseconds. |

## NestJS Wiring

```ts
import { Injectable } from '@nestjs/common';
import { PublicPayrollPdfBuilder } from '@stynx/pdf/public-payroll';
import { VeraPdfDockerValidator } from '@stynx/pdf-a-vera-docker';

@Injectable()
export class PayrollPdfService {
  private readonly builder = new PublicPayrollPdfBuilder();
  private readonly validator = new VeraPdfDockerValidator();

  async buildPayslip(document: PayslipDocument) {
    const pdf = await this.builder.buildPayslip(document);
    const result = await this.validator.validate(pdf);
    if (!result.valid) {
      throw new Error(result.errors[0]?.message ?? 'PDF/A validation failed');
    }
    return pdf;
  }
}
```

## Failure Policy

Adopters decide the policy per environment:

- Fail-fast at generation time.
- Warn and emit telemetry while allowing output.
- Build-time strict with runtime warning during an adoption window.

SGP R11 should use the phased pattern: build-time strict/runtime warn, then
warn-mode with evidence review, then fail-fast after a trust period.

## Performance

The Docker adapter has startup cost. R12 guards cold validation at 5 s and warm
p95 at 500 ms for a 50 KB single-page fixture. For high-volume workflows, cache
successful validation by template version and PDF generation inputs. A future
HTTP sidecar may remove per-call Docker startup overhead.

## STYNX Producer Conformance

`@stynx/pdf` carries a Docker-backed conformance suite under
`packages/pdf/test/conformance/`. It renders payslip and yearly-income fixtures
with and without verification evidence, then validates each PDF with:

```sh
docker run --rm -v "$TMPDIR:/work" -w /work verapdf/cli@sha256:20202b4bcc2410a25db1f637c7b461a2e0dda1d97dd8a6df658286b30d56c842 --format json --flavour 2b <file>.pdf
```

The expected summary is `compliant=true`, `failedChecks=0`, `failedRules=0`,
and profile `PDF/A-2b validation profile`.

SGP R11 handoff: after consuming R13, re-pack the local `@stynx/pdf` tarball and
rerun the payslip/yearly-income build-time strict checks. No SGP source change is
expected for the conformance closure.

## Troubleshooting

| Rule family     | Usual meaning                                                    |
| --------------- | ---------------------------------------------------------------- |
| `6.1.2-1`       | File header or binary marker is malformed.                       |
| `6.2.2-1`       | Graphics/content stream state violates PDF/A requirements.       |
| `6.2.11.*`      | Font embedding, CID font, CIDSet, or subset metadata problem.    |
| `6.6.4-1`       | XMP PDF/A part/conformance metadata is missing or malformed.     |
| `6.7.2-1`       | Tagged PDF requirement failed; relevant to level A, not level B. |
| `6.4-*`         | Interactive form or annotation state is not archival-safe.       |
| `stynx.timeout` | Docker validation exceeded the configured timeout.               |

## Telemetry

The adapter emits these names when a logger/metrics sink is provided:

- `pdf_a_validation_attempts_total`
- `pdf_a_validation_errors_total&#123;rule_id&#125;`
- `pdf_a_validation_duration_ms`

## Links

- [ADR-PDF-A-VALIDATOR-CONTRACT](../meta/adr/ADR-PDF-A-VALIDATOR-CONTRACT.md)
- [ADR-PDF-A-CONFORMANCE](../meta/adr/ADR-PDF-A-CONFORMANCE.md)
- [`@stynx/pdf`](/docs/packages/pdf)
- `@stynx/pdf-a`
- `@stynx/pdf-a-vera-docker`
