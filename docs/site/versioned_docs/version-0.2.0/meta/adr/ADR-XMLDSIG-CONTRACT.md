# ADR-XMLDSIG-CONTRACT - XMLDSig Contract for `@stynx-nyx/signature`

**Status:** Accepted
**Date:** 2026-05-24
**Authority:** Architect, per DEVAI Constitution Article 6

## Context

SGP carries two near-identical fiscal XML signers for DCTFWeb and EFD-Reinf.
Both sign an element selected by an `Id` attribute, use enveloped XMLDSig, and
then persist the signed XML hash as fiscal evidence. STYNX already owns digest,
PAdES, GovBR sandbox, and sequential-signing helpers in `@stynx-nyx/signature`, so
XMLDSig belongs in the same package boundary.

This contract does not make STYNX a private-key store, certificate authority, or
ICP-Brasil validator. Adopters keep certificate lookup, PKCS#12 reading,
telemetry, storage, audit, and business state transitions outside this package.

## Decision

1. `@stynx-nyx/signature` exposes separate `XmlDSigSigner` and `XmlDSigVerifier`
   APIs. Signing and verification stay separate so adopters can wire key
   resolution and verification trust policy independently.
2. The default signature method is RSA-SHA256:
   `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`. RSA-SHA1 is exported as
   a constant for legacy interop but is not the default.
3. The default digest method is SHA-256:
   `http://www.w3.org/2001/04/xmlenc#sha256`.
4. The default canonicalization is inclusive Canonical XML 1.0:
   `http://www.w3.org/TR/2001/REC-xml-c14n-20010315`, because that is the live
   SGP behavior being consolidated. Exclusive Canonical XML 1.0 is also exported
   and supported for fiscal layouts that require it:
   `http://www.w3.org/2001/10/xml-exc-c14n#`.
5. The default transform set is enveloped-signature plus the selected
   canonicalization algorithm. Additional transforms are not enabled by default.
6. References are ID-based. The signer discovers `Id`, `ID`, then `id` by
   default, allows an explicit `idAttribute`, and signs `URI="#&lt;id&gt;"`.
7. Signature placement is caller-controlled. The default appends the signature to
   the signed element; DCTFWeb can override placement to append under
   `//*[local-name(.)='declaracao']`.
8. Key handling is caller-supplied. The signer accepts private-key material and
   optional certificate/public-key material for `KeyInfo`; it never loads
   PKCS#12, reaches a key vault, or embeds test/private keys in production code.
9. Verification returns `&#123; ok: true &#125;` with signed references on success and
   `&#123; ok: false, mismatches: [...] &#125;` on tamper/signature failure. Missing public
   key material is a descriptive error unless an embedded X509 `KeyInfo` is
   present and explicitly allowed.
10. Implementation uses `xml-crypto` rather than a hand-rolled XMLDSig stack.
    XML canonicalization, transform handling, and RSA signature construction are
    specification-sensitive enough that a maintained library is the lower-risk
    package boundary.

## Public Shape

```ts
import { XmlDSigSigner, XmlDSigVerifier } from '@stynx-nyx/signature/xmldsig';

const signedXml = new XmlDSigSigner().sign(xml, {
  key: { privateKeyPem, certificatePem },
  reference: { idAttribute: 'Id' },
});

const result = new XmlDSigVerifier().verify(signedXml, {
  keys: [{ keyId: 'tenant-active-cert', publicKeyPem }],
});
```

## SGP Mapping

- DCTFWeb maps cleanly by passing the declaration XML, tenant certificate
  private key, certificate material, `Id` reference discovery, and a DCTFWeb
  placement override.
- EFD-Reinf maps to the same contract with default placement because the
  signature is appended to the signed `Id` element.
- SGP keeps PKCS#12 parsing, active-certificate selection, audit, database
  update, and storage references outside the STYNX call.

## Rejected Alternatives

- **Hand-roll canonicalization and RSA signature generation.** Rejected because
  XML canonicalization and transform semantics are easy to weaken accidentally.
- **Make STYNX read PKCS#12 directly.** Rejected because key storage, password
  handling, and ICP-Brasil tenant policy are adopter concerns.
- **Expose one combined sign/verify service.** Rejected because signing and
  verification run in different trust contexts and need different key policies.
- **Default to RSA-SHA1 for legacy compatibility.** Rejected because the current
  SGP fiscal signers already use RSA-SHA256.

## Consequences

Adopters can remove duplicated XMLDSig boilerplate while retaining control of
keys and business workflows. STYNX now owns only the cryptographic XMLDSig
contract and its deterministic test fixtures; production PKI remains outside the
package.
