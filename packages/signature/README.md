# `@stynx-nyx/signature` — PAdES/TSA signing for PDF outputs via GovBR + provider sandboxes

`@stynx-nyx/signature` is STYNX's document-signing substrate. It produces PAdES (PDF Advanced Electronic Signatures) per ADR-XMLDSIG-CONTRACT, supporting the GovBR (Brazilian government) signing sandbox plus generic HTTP-based provider backends. Used by `@stynx-nyx/pdf` flows that need legally-binding signatures (SPED-fiscal, signed payslips, archived documents).

## Purpose

Regulated document outputs (Brazilian SPED-fiscal, signed payroll, archived legal docs) require signatures conforming to a specific PAdES profile plus an authoritative timestamp from a TSA (Time-Stamping Authority). Doing this by hand is brittle — canonicalization rules, certificate-chain validation, TSA negotiation all need consistent treatment.

You reach for `@stynx-nyx/signature` when a STYNX output needs to be legally signed. Most STYNX apps don't need it; regulated apps (financial, healthcare, government-facing) do.

What it does NOT do: it doesn't sign tokens or JWTs (use `@stynx-nyx/sessions`). It doesn't produce XMLDSig for arbitrary XML (focused on PDF/PAdES). It doesn't run a TSA itself (consumes one).

## Audience

Backend developers in regulated domains.

## Install

```bash
pnpm add @stynx-nyx/signature
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx-nyx/core` `^1`, `pdf-lib` `^1` (for PAdES manipulation).

## Quick start

```ts
import { StynxSignatureModule } from '@stynx-nyx/signature';

StynxSignatureModule.forRoot({
  provider: 'govbr-sandbox',
  govbr: { clientId: '...', clientSecret: '...' },
  tsa: { url: 'http://timestamp.example.com' },
});
```

```ts
import { PadesService } from '@stynx-nyx/signature';

@Injectable()
export class SignedPdfService {
  constructor(private readonly pades: PadesService) {}

  async sign(pdfBytes: Uint8Array): Promise<Uint8Array> {
    return this.pades.sign(pdfBytes, { profile: 'PAdES-B-T' });
  }
}
```

## Public API surface

### Modules

| Export                 | Signature                                  | Description                                                       |
| ---------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `StynxSignatureModule` | `.forRoot(options: StynxSignatureOptions)` | Registers signature service, provider backend, sequential signer. |

### Services / Injectables

| Export                              | Description                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `PadesService`                      | High-level PAdES signing: `sign(pdfBytes, options)`, `verify(pdfBytes)`.                       |
| `ProviderBackend`                   | The signing-provider abstraction. Default impls: `GovBrSandboxProvider`, `HttpProviderClient`. |
| `SequentialSigner`                  | Multi-signature sequential signing.                                                            |
| `DigestService` (alias `sha256Hex`) | Standalone SHA-256 helper.                                                                     |

### Backends

| Export                 | Description                                 |
| ---------------------- | ------------------------------------------- |
| `GovBrSandboxProvider` | Brazilian GovBR signing sandbox impl.       |
| `HttpProviderClient`   | Generic HTTP-based signature provider impl. |

### Errors

| Export                     | Code                        | Description                      |
| -------------------------- | --------------------------- | -------------------------------- |
| `SignatureValidationError` | `SIGNATURE_INVALID`         | Verification rejected.           |
| `SignatureProviderError`   | `SIGNATURE_PROVIDER_FAILED` | Provider call failed.            |
| `TsaError`                 | `TSA_FAILED`                | Timestamp authority call failed. |

### Types / Interfaces

| Export                    | Description                                                    |
| ------------------------- | -------------------------------------------------------------- |
| `StynxSignatureOptions`   | `forRoot()` options.                                           |
| `SignatureBackend`        | Provider abstraction interface.                                |
| `SignatureCertificateRef` | Certificate reference.                                         |
| `SignatureEvidence`       | Post-sign evidence (cert, timestamp, hash).                    |
| `PadesProfile`            | `'PAdES-B-B' \| 'PAdES-B-T' \| 'PAdES-B-LT' \| 'PAdES-B-LTA'`. |

## Configuration

### `StynxSignatureModule.forRoot()` options

| Option           | Type                        | Default                                  | Description                                        |
| ---------------- | --------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `provider`       | `'govbr-sandbox' \| 'http'` | (required)                               | Provider backend.                                  |
| `govbr`          | `GovBrOptions`              | required for `provider: 'govbr-sandbox'` | GovBR sandbox creds.                               |
| `http`           | `HttpProviderOptions`       | required for `provider: 'http'`          | Custom-provider HTTP config.                       |
| `tsa.url`        | `string`                    | n/a                                      | TSA endpoint. Required for `PAdES-B-T` and higher. |
| `defaultProfile` | `PadesProfile`              | `'PAdES-B-B'`                            | Default profile.                                   |

## Examples

### Example 1 — sign a generated payslip

```ts
const pdfBytes = await pdfRenderer.render({
  /* payslip */
});
const signed = await pades.sign(pdfBytes, { profile: 'PAdES-B-T', tsaUrl: 'http://tsa.example' });
await storage.put(`signed/${id}.pdf`, signed);
```

### Example 2 — verify an inbound signed document

```ts
const result = await pades.verify(receivedBytes);
if (!result.valid)
  throw new SignatureValidationError('Signature did not verify', { detail: result.reason });
```

### Example 3 — sequential signatures

```ts
const signed1 = await pades.sign(bytes, { signer: 'employer' });
const signed2 = await sequentialSigner.append(signed1, { signer: 'employee' });
```

## Common pitfalls

- **Canonicalization order matters** for some providers — apply your provider's documented order; otherwise validation fails downstream.
- **TSA latency** can be high (seconds to tens-of-seconds). Don't run signing on a request path; use a background job.
- **Certificate chain not trusted** at the verifier — bundle the chain in the signature or pre-distribute trust anchors.

## Related packages

- [`@stynx-nyx/pdf`](/docs/packages/pdf/) — produces the unsigned PDF.
- [`@stynx-nyx/storage`](/docs/packages/storage/) — stores signed PDFs.
- [STYNX framework — ADR-XMLDSIG-CONTRACT](/docs/meta/adr/ADR-XMLDSIG-CONTRACT/) — the contract.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-signature/`](/docs/api-reference/stynx-signature/)
