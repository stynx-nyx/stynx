# Signature Contract

**Authority:** Architect (DEVAI Constitution Article 6).
**Package:** `@stynx-nyx/signature`.

`@stynx-nyx/signature` owns the STYNX signing facade and evidence shape. External
providers such as ICP-Brasil or gov.br own the cryptographic PAdES/TSA work.

## Runtime Boundary

`SignatureService.sign()` validates the document hash locally, validates the
signer certificate through OCSP with CRL fallback when allowed, delegates PAdES
signing to a configured provider, and returns `SignatureEvidence`.

`SignatureService.verify()` validates the document hash locally, requires signed
PDF bytes or CMS bytes, then delegates signature verification to the provider.

## Provider Wire Contract

- `POST &#123;pathPrefix&#125;/tsa/sign`: request includes base64 PDF, SHA-256,
  algorithm, TSA options, signer certificate and credential metadata; response
  includes signed PDF base64, optional CMS base64, TSA time, revocation source,
  certificate chain and evidence URI.
- `POST &#123;pathPrefix&#125;/tsa/ocsp/validate`: request includes signer certificate,
  tenant/actor context, CRL URL and fallback policy; response includes
  `good`, `OCSP` or `CRL`, checked time, optional chain and reason.
- `POST &#123;pathPrefix&#125;/pades/verify`: request includes original document bytes,
  hash and signed bytes or CMS; response includes `valid`, `invalid`, or
  `unknown` plus verification evidence.

## Evidence Rules

Evidence must preserve document SHA-256, signing time, TSA time when available,
signer certificate metadata, revocation source, revocation check time,
certificate chain and provider evidence URI when available. Unknown verification
status is reserved for provider uncertainty, not missing local inputs.

## Migration Notes

PEC's report signing flow maps directly to `SignatureService.sign()` and should
persist `SignatureEvidence`. TEAT can use `verify()` for AIT/evidence hash and
signature validation without importing PEC implementation code.
