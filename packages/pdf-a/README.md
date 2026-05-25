# @stynx/pdf-a

`@stynx/pdf-a` defines the STYNX PDF/A validation contract. It contains only
types, telemetry names, and stubs; it does not invoke veraPDF, Docker, Java, or
any PDF parser.

## Install

```sh
pnpm add @stynx/pdf-a
```

`@stynx/logging` is an optional peer for adopters that want to connect
validation telemetry to the standard logging surface.

## Interface

```ts
import type { PdfAValidator } from '@stynx/pdf-a';

async function archive(pdf: Uint8Array, validator: PdfAValidator) {
  const result = await validator.validate(pdf, { version: 'A-2', conformance: 'b' });
  if (!result.valid) throw new Error(result.errors[0]?.message ?? 'PDF/A validation failed');
}
```

## Stubs

- `NoopPdfAValidator` always passes and is useful only when an adopter has made
  an explicit opt-out decision.
- `StrictPdfAValidator` always fails and is the safer default for environments
  that must not claim PDF/A validation until a real adapter is wired.

Use `@stynx/pdf-a-vera-docker` for the reference veraPDF Docker backend. See
[`docs/adopters/pdf-a-validation.md`](../../docs/adopters/pdf-a-validation.md)
for wiring, policy, and troubleshooting guidance.
