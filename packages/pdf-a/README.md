# `@stynx/pdf-a` — the PDF/A conformance-adapter contract (pure types)

`@stynx/pdf-a` is the pure-types contract package for PDF/A conformance validation. It defines the `PdfAValidator` interface, the version/conformance enums (`PdfAVersion`, `PdfAConformance`), the validation result + rule-location shapes, telemetry counter names, and two stub implementations (`noop` and `strict`) for tests. The concrete validator lives in [`@stynx/pdf-a-vera-docker`](/docs/packages/pdf-a-vera-docker/); `@stynx/pdf` consumes the contract via its `pdfAAdapter` slot.

## Purpose

PDF/A conformance (the archival PDF standard — A-1/A-2/A-3/A-4 with b/u/a conformance levels) needs a validator, but the validator implementation is heavyweight (veraPDF, a Docker container). Separating the _contract_ (this package) from the _implementation_ lets `@stynx/pdf` depend on a tiny types package and lets you swap validators (veraPDF-Docker, a hosted service, a stub for tests) without touching `@stynx/pdf`.

You reach for `@stynx/pdf-a` when authoring a custom PDF/A validator adapter, or when you need the type shapes for handling validation results.

What it does NOT do: it doesn't validate anything (pure types + stubs). The real validation is in `@stynx/pdf-a-vera-docker`.

## Audience

Backend developers authoring or consuming PDF/A validators. Most apps consume the veraPDF adapter rather than implementing their own.

## Install

```bash
pnpm add @stynx/pdf-a
```

**No runtime peer dependencies** — pure types + lightweight stubs.

## Quick start

```ts
import type { PdfAValidator, PdfAValidationResult } from '@stynx/pdf-a';

// Implement a custom validator
export class MyPdfAValidator implements PdfAValidator {
  async validate(bytes: Uint8Array, options): Promise<PdfAValidationResult> {
    // ... your validation logic
    return { valid: true, version: 'A-2', conformance: 'b', failures: [] };
  }
}
```

## Public API surface

### Types / Interfaces

| Export                 | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `PdfAValidator`        | The contract: `validate(bytes, options): Promise<PdfAValidationResult>`. |
| `PdfAValidateOptions`  | `{ version?: PdfAVersion; conformance?: PdfAConformance }`.              |
| `PdfAValidationResult` | `{ valid, version, conformance, failures }`.                             |
| `PdfAVersion`          | `'A-1' \| 'A-2' \| 'A-3' \| 'A-4'`.                                      |
| `PdfAConformance`      | `'b' \| 'u' \| 'a'`.                                                     |
| `PdfARuleLocation`     | Where in the document a rule failed.                                     |
| `PdfAValidationLogger` | Optional logging hook.                                                   |

### Telemetry constants

| Export                            | Description                          |
| --------------------------------- | ------------------------------------ |
| `PDF_A_VALIDATION_ATTEMPTS_TOTAL` | Counter name: validation attempts.   |
| `PDF_A_VALIDATION_DURATION_MS`    | Histogram name: validation duration. |
| `PDF_A_VALIDATION_ERRORS_TOTAL`   | Counter name: validation errors.     |

### Stubs (for tests)

| Export                | Description                                                                |
| --------------------- | -------------------------------------------------------------------------- |
| `NoopPdfAValidator`   | Always returns `valid: true`. For tests that don't care about conformance. |
| `StrictPdfAValidator` | Always returns `valid: false`. For asserting the failure path.             |

## Configuration

No runtime configuration — pure types. The implementing adapter (`@stynx/pdf-a-vera-docker`) carries the config.

## Examples

### Example 1 — wiring a validator into `@stynx/pdf`

```ts
import { StynxPdfModule } from '@stynx/pdf';
import { VeraPdfDockerValidator } from '@stynx/pdf-a-vera-docker';

StynxPdfModule.forRoot({ pdfAAdapter: new VeraPdfDockerValidator({}) });
```

### Example 2 — noop stub in tests

```ts
import { NoopPdfAValidator } from '@stynx/pdf-a';

StynxPdfModule.forRoot({ pdfAAdapter: new NoopPdfAValidator() });
// PDF/A requests succeed without invoking the heavyweight validator
```

### Example 3 — asserting the failure path

```ts
import { StrictPdfAValidator } from '@stynx/pdf-a';

const renderer = new PdfRenderer(backend, { pdfAAdapter: new StrictPdfAValidator() });
await expect(renderer.render({ output: { profile: 'pdf-a' }, ... })).rejects.toThrow();
```

## Common pitfalls

- **Confusing the contract with the validator** — this package validates nothing. Use `@stynx/pdf-a-vera-docker` for real validation.
- **Conformance level mismatch** — requesting `A-2 a` (accessible) requires tagged PDF; most HTML→PDF output is `A-2 b` (basic). Default to `b` unless you've ensured accessibility tagging.

## Related packages

- [`@stynx/pdf`](/docs/packages/pdf/) — consumes this contract via its `pdfAAdapter` slot.
- [`@stynx/pdf-a-vera-docker`](/docs/packages/pdf-a-vera-docker/) — the concrete veraPDF-backed implementation.
- [STYNX framework — ADR-PDF-A-VALIDATOR-CONTRACT](/docs/meta/adr/ADR-PDF-A-VALIDATOR-CONTRACT/) — the contract decision.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-pdf-a/`](/docs/api-reference/stynx-pdf-a/)
