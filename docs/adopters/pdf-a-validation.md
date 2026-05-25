# PDF/A Validation

STYNX ships a validator contract in `@stynx/pdf-a` and a reference veraPDF
Docker adapter in `@stynx/pdf-a-vera-docker`. R12 targets PDF/A-2b.

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
- `pdf_a_validation_errors_total{rule_id}`
- `pdf_a_validation_duration_ms`

## Links

- [ADR-PDF-A-VALIDATOR-CONTRACT](../adr/ADR-PDF-A-VALIDATOR-CONTRACT.md)
- [`@stynx/pdf`](../../packages/pdf/README.md)
- [`@stynx/pdf-a`](../../packages/pdf-a/README.md)
- [`@stynx/pdf-a-vera-docker`](../../packages/pdf-a-vera-docker/README.md)
