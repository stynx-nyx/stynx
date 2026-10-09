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

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference).

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

| Option                    | Type                               | Default                                  | Description                                                                                                                                                                                                                                           |
| ------------------------- | ---------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`                | `'govbr-sandbox' \| 'http'`        | (required)                               | Provider backend.                                                                                                                                                                                                                                     |
| `govbr`                   | `GovBrOptions`                     | required for `provider: 'govbr-sandbox'` | GovBR sandbox creds.                                                                                                                                                                                                                                  |
| `http`                    | `HttpProviderOptions`              | required for `provider: 'http'`          | Custom-provider HTTP config.                                                                                                                                                                                                                          |
| `tsa.url`                 | `string`                           | n/a                                      | TSA endpoint. Required for `PAdES-B-T` and higher.                                                                                                                                                                                                    |
| `defaultProfile`          | `PadesProfile`                     | `'PAdES-B-B'`                            | Default profile.                                                                                                                                                                                                                                      |
| `trustProfile`            | `SignatureTrustProfile`            | none                                     | Single regulated trust profile (1.5.0).                                                                                                                                                                                                               |
| `trustProfiles`           | `readonly SignatureTrustProfile[]` | none                                     | Further declared profiles (UPS-SIG-07). The declared set is `trustProfile` plus this list; a repeated `id` throws at `forRoot`. Once set, a regulated call naming a production profile outside the set fails with `SignatureProfileNotDeclaredError`. |
| `trustProfileAggregation` | `'all' \| 'any'`                   | `'all'`                                  | Readiness rule over the declared set: `all` is down when any declared profile is down; `any` is up while one is ready, with the failing profiles listed.                                                                                              |

## Examples

### Example 1 — sign a generated payslip

```ts
const pdfBytes = await pdfRenderer.render({/* payslip */});
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

### Example 4 — several trust profiles in one module (UPS-SIG-07)

One module serves two tenants whose profiles trust disjoint roots. The verifier
takes the union of both anchor sets; each profile's own `trustAnchorsPem` is
intersected with it per call, so an artifact anchored only in tenant A's root is
refused under tenant B's profile. Profile selection per request stays in your
code.

```ts
const tenantA = {
  id: 'tenant-a-clinical',
  revision: '3',
  environment: 'production',
  trustAnchorsPem: [rootA] /* ... */,
};
const tenantB = {
  id: 'tenant-b-clinical',
  revision: '1',
  environment: 'production',
  trustAnchorsPem: [rootB] /* ... */,
};

SignatureHealthIntegration.forRoot({
  signatureOptions: {
    provider: { pathPrefix: '/pades' },
    trustProfiles: [tenantA, tenantB],
    trustProfileAggregation: 'any', // one tenant down does not down the other
    verifier: createCmsTrustVerifier({
      trustAnchorsPem: [rootA, rootB],
      tsaTrustAnchorsPem: [rootA, rootB],
      // Real signed bytes that verify fully under the named profile and revision.
      readinessChallenge: async (profile) => challengeStore.load(profile.id, profile.revision),
    }),
  },
});

// Per request: resolve the profile by tenant and document kind, then call as usual.
await signatureService.sign({
  ...request,
  minimumSignatureLevel: 'ADVANCED',
  trustProfile: resolve(tenantId, kind),
});
```

`/readiness` then reports `signature.profiles[]` with each profile's `id`,
`revision`, status, capabilities and `verifierKind`, or its down reason.

## Common pitfalls

- **A new profile revision needs a new challenge artifact.** `readinessChallenge` must return bytes labelled with the exact `id` and `revision`; after a revision bump the profile stays down until the store has a challenge for it. Nothing is cached across profiles.
- **Undeclared production profiles are refused once `trustProfiles` is set**, by `id` and `revision`, with `SignatureProfileNotDeclaredError`; add the profile to the list (one revision per `id`) rather than passing it ad hoc.
- **Canonicalization order matters** for some providers — apply your provider's documented order; otherwise validation fails downstream.
- **TSA latency** can be high (seconds to tens-of-seconds). Don't run signing on a request path; use a background job.
- **Certificate chain not trusted** at the verifier — bundle the chain in the signature or pre-distribute trust anchors.

## Related packages

- [`@stynx-nyx/pdf`](/docs/packages/pdf/) — produces the unsigned PDF.
- [`@stynx-nyx/storage`](/docs/packages/storage/) — stores signed PDFs.
- [STYNX framework — ADR-XMLDSIG-CONTRACT](/docs/meta/adr/ADR-XMLDSIG-CONTRACT/) — the contract.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-signature/`](/docs/api-reference/stynx-signature/)

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@peculiar/x509`: `^2.1.0`
- `@stynx-nyx/health`: `workspace:*`
- `@stynx-nyx/integration-adapter`: `workspace:*`
- `@xmldom/xmldom`: `^0.9.10`
- `asn1js`: `^3.0.10`
- `pdf-lib`: `^1.17.1`
- `pkijs`: `^3.4.1`
- `xml-crypto`: `^6.1.2`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@nestjs/testing`: `^11.1.26`
- `@types/node`: `24.13.4`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
