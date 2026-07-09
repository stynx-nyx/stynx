# XMLDSig Contract

**Package:** `@stynx-nyx/signature`
**Subpath:** `@stynx-nyx/signature/xmldsig`
**Authority:** Architect, per DEVAI Constitution Article 6

`@stynx-nyx/signature/xmldsig` signs and verifies enveloped XMLDSig payloads for
adopter-owned fiscal XML flows such as DCTFWeb and EFD-Reinf.

## Signing

```ts
import { XmlDSigSigner } from '@stynx-nyx/signature/xmldsig';

const signedXml = new XmlDSigSigner().sign(payloadXml, {
  key: {
    privateKeyPem,
    certificatePem,
  },
  reference: { idAttribute: 'Id' },
});
```

Defaults:

- reference attributes: `Id`, `ID`, then `id`
- signature method: RSA-SHA256
- digest method: SHA-256
- transforms: enveloped-signature plus canonicalization
- canonicalization: inclusive Canonical XML 1.0 for SGP compatibility
- signature location: append to the signed element

DCTFWeb can keep its declaration-level placement:

```ts
new XmlDSigSigner().sign(payloadXml, {
  key: { privateKeyPem, certificatePem },
  location: { reference: "//*[local-name(.)='declaracao']" },
});
```

## Verification

```ts
import { XmlDSigVerifier } from '@stynx-nyx/signature/xmldsig';

const result = new XmlDSigVerifier().verify(signedXml, {
  keys: [{ keyId: 'tenant-active-cert', publicKeyPem }],
});

if (!result.ok) {
  audit.warn({ mismatches: result.mismatches }, 'XML signature mismatch');
}
```

Verification returns a discriminated result:

- `{ ok: true, signatureCount, signedReferences, keyId? }`
- `{ ok: false, signatureCount, reason, mismatches }`

Missing key material throws `XmlDSigVerificationError` unless an embedded
X509Certificate `KeyInfo` is present and allowed.

## Threat Model

This package detects signed-payload tampering and invalid XMLDSig signatures. It
does not prove tenant authorization, certificate freshness, revocation status,
certificate-chain trust, ICP-Brasil policy compliance, or storage integrity.
Adopters must keep those checks in their local certificate, audit, and workflow
layers.

## Adopter Boundary

Keep these concerns outside STYNX:

- PKCS#12 parsing and password handling
- active tenant certificate lookup
- key vault or HSM integration
- revocation checking and ICP-Brasil policy validation
- persistence of signed XML and signed XML hash
- business state transitions after signing
