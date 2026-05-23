# @stynx/signature

`@stynx/signature` is the shared STYNX facade for long-lived document signatures:
PAdES/PDF signatures, TSA timestamping, and OCSP-first certificate status checks
with CRL fallback. It centralizes the contract currently carried by PEC's
`signature-digital-signature` and `integration-tsa` domains so PEC R2 and TEAT
R2 can converge on one platform API.

This round intentionally ships a typed scaffold. The cryptographic provider is
pluggable and the default provider rejects calls until the PEC implementation is
ported.

## Public API

```ts
import { SignatureService, createMockSignatureBackend } from '@stynx/signature';

const service = new SignatureService(createMockSignatureBackend());
const result = await service.sign({
  tenantId: 'tenant-a',
  actorId: 'user-a',
  document: new Uint8Array([1, 2, 3]),
  documentSha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
  tsa: { endpoint: 'https://tsa.example.test' },
  certificate: { subject: 'CN=Signer', issuer: 'CN=ICP Test', serialNumber: '01' },
});
```

Primary exports:

- `SignatureService` - orchestration facade for signing and verification.
- `SignatureBackend` - provider interface implemented by a real PAdES/TSA/OCSP
  backend.
- `createMockSignatureBackend()` - deterministic test backend for consumers.
- Request/result types for signing and verification.

## Threat Model

The package boundary assumes callers have already enforced authentication,
authorization, tenant membership, and object-storage access. The signature
backend must still protect against:

- signing a different document than the hash recorded in audit evidence;
- accepting revoked certificates when OCSP is unavailable;
- silently dropping TSA or revocation evidence from the result;
- re-signing unchanged content instead of reusing recorded evidence where the
  domain policy requires idempotent signing.

Each signing and verification operation should emit an `@stynx/audit` event with
tenant, actor, document hash, signer certificate metadata, TSA evidence, and
revocation source.

## Algorithms and Providers

The initial contract requires SHA-256 document hashing and PAdES-compatible CMS
signatures. Real implementations are expected to use the optional provider
dependencies declared in `package.json`:

- `pkijs` and `asn1js` for CMS/ASN.1 handling;
- `@peculiar/x509` for certificate parsing and chain metadata.

Provider-specific TSA, OCSP, and CRL HTTP clients remain implementation details
behind `SignatureBackend`.

## TSA Configuration

`SignatureRequest.tsa` carries the TSA endpoint plus optional policy OID,
timeout, and headers. The service forwards this configuration without owning
provider credentials. Host applications should load credentials through their
normal secret-management path.

## OCSP and CRL Handling

Verification must attempt OCSP first. Temporary OCSP failure may fall back to CRL
if `VerificationPolicy.allowCrlFallback` is true. Results expose the revocation
source as `ocsp`, `crl`, `embedded`, or `none` so auditors can distinguish happy
path from fallback evidence.

## PEC and TEAT Migration

PEC R2 will migrate its PAdES/TSA implementation into a `SignatureBackend`.
TEAT R2 can consume the same API for signed receipts and evidence artifacts.
