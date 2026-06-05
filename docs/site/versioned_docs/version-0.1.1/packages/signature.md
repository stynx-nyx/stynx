---
title: '@stynx/signature'
---

# @stynx/signature

`@stynx/signature` is the shared STYNX facade for long-lived PAdES document
signatures, TSA timestamping, and OCSP-first certificate validation with CRL
fallback. It ports PEC's signature orchestration into a package-owned boundary
while leaving ICP-Brasil, gov.br, and other cryptographic providers behind a
stable provider contract. It also exposes XMLDSig helpers for adopter-owned
fiscal XML flows such as DCTFWeb and EFD-Reinf.

## Nest Setup

```ts
import { StynxSignatureModule } from '@stynx/signature';

StynxSignatureModule.forRoot({
  provider: {
    baseUrl: 'https://signature-provider.example',
    pathPrefix: '/mock',
    crlUrl: 'https://ca.example/crl.pem',
    timeoutMs: 15_000,
  },
  verificationPolicy: {
    requireTimestamp: true,
    requireRevocationEvidence: true,
    allowCrlFallback: true,
  },
});
```

`SignatureService` can also be constructed directly with a custom
`SignatureBackend` for tests and non-Nest consumers.

## Public API

```ts
import { SignatureService } from '@stynx/signature';

const result = await signature.sign({
  tenantId: 'tenant-a',
  actorId: 'user-a',
  document: pdf.bytes,
  documentSha256: pdf.sha256,
  tsa: { endpoint: 'https://signature-provider.example' },
  certificate: {
    subject: 'CN=Signer',
    issuer: 'CN=ICP Test',
    serialNumber: '01',
    pem: process.env.SIGNER_CERT_PEM,
  },
});
```

Primary exports:

- `StynxSignatureModule` - Nest module for provider-backed signing.
- `SignatureService` - canonical signing and verification facade.
- `HttpSignatureProviderClient` - external provider client using
  `@stynx/integration-adapter` for retry, timeout, idempotency, telemetry, and
  circuit breaking.
- `ProviderBackedSignatureBackend` - validates certificates before signing and
  maps provider responses into `SignatureEvidence`.
- `createMockSignatureBackend()` - deterministic test backend.
- `sha256`, `canonicalJson`, `sha256CanonicalJson`, and `canonicalXmlDigest` -
  deterministic digest helpers for XML, PDF, and payload evidence.
- `MockPadesEvidenceAdapter` - provider-free PAdES evidence envelopes for
  fixture-friendly sandbox signing.
- `GovBrSandboxAdapter` - gov.br advanced-signature callback simulation with
  tamper-evident evidence.
- `SequentialSigner` - ordered document-signing envelope helper with publish
  read verification.
- `XmlDSigSigner` and `XmlDSigVerifier` - enveloped XMLDSig signing,
  verification, and tamper-detection helpers for `Id`-addressed XML payloads.

## Provider Contract

The HTTP provider receives base64 documents and returns provider-owned PAdES/TSA
results:

- `POST &#123;pathPrefix&#125;/tsa/sign` - signs immutable PDF bytes and returns signed
  PDF bytes, optional CMS bytes, TSA time, revocation source, certificate chain,
  and evidence URI.
- `POST &#123;pathPrefix&#125;/tsa/ocsp/validate` - validates signer certificates with
  OCSP and optional CRL fallback.
- `POST &#123;pathPrefix&#125;/pades/verify` - verifies signed PDF or detached CMS bytes.

Provider failures are surfaced as typed package errors. Hash mismatches are
rejected before any provider call.

## PEC and TEAT Migration

PEC report flows can replace `signPades(pdf, meta)` with `SignatureService.sign`
and persist `SignatureEvidence`. TEAT AIT/evidence flows can use `verify()` for
hash/signature validation without importing PEC code or STYNX internals.

SGP fiscal XML flows can import `@stynx/signature/xmldsig` to sign DCTFWeb and
EFD-Reinf payloads while keeping PKCS#12 parsing, certificate lookup, audit, and
database updates inside SGP.
