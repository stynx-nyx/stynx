# Signature Contract

**Authority:** Architect (DEVAI Constitution Article 6).
**Package:** `@stynx/signature`.

This contract defines the implementation-free shape for PAdES/TSA signing and
verification. It is derived from PEC's signature requirements in
`../pec/docs/pec/signatures.md`, PEC's OCSP-with-CRL-fallback decision in
`../pec/docs/project/decisions/0001-certificate-validation-ocsp-crl.md`, and the
PEC runtime inventory for `signature-digital-signature` plus `integration-tsa`.

## SignatureRequest

| Field            | Required | Description                                                                |
| ---------------- | -------- | -------------------------------------------------------------------------- |
| `tenantId`       | yes      | Tenant scope for audit and storage ownership.                              |
| `actorId`        | yes      | Authenticated actor requesting the signature.                              |
| `document`       | yes      | Immutable PDF/PDF-A bytes to sign.                                         |
| `documentSha256` | yes      | SHA-256 hex digest of `document`.                                          |
| `tsa.endpoint`   | yes      | TSA endpoint selected by the host application.                             |
| `certificate`    | yes      | Subject, issuer, serial, and validity metadata for the signer certificate. |
| `algorithm`      | no       | `pades-baseline-t` or `pades-ltv`; defaults to `pades-ltv`.                |
| `idempotencyKey` | no       | Host-level key used to avoid duplicate signing.                            |

## SignatureResult

`SignatureResult` returns signed bytes, detached CMS bytes when available, and
`SignatureEvidence`.

`SignatureEvidence` must preserve:

- signature id;
- document SHA-256;
- signing time and TSA time;
- signer certificate reference;
- certificate chain when available;
- revocation source: `ocsp`, `crl`, `embedded`, or `none`;
- revocation check time;
- optional provider evidence URI.

## VerifyRequest and VerifyResult

Verification receives the original bytes and hash plus signed bytes or CMS
signature bytes. `VerifyResult.status` is `valid`, `invalid`, or `unknown`.
Unknown is reserved for provider uncertainty, not for missing local validation.

## Revocation Rule

Verification must attempt OCSP first. CRL fallback is allowed only when policy
permits it and OCSP failed temporarily. Results must expose which source was
used so auditors can distinguish primary validation from fallback evidence.

## PEC Cross-Link

The round prompt references PEC `INV-06`; current PEC docs expose the active
PAdES/TSA requirement through `docs/pec/signatures.md` and the generated
signature invariants around returning CMS, ICP chain, TSA, and immutability.
