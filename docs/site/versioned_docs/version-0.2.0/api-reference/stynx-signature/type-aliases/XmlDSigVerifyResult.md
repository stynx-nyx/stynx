[**@stynx/signature**](../index.md)

---

[@stynx/signature](../index.md) / XmlDSigVerifyResult

# Type Alias: XmlDSigVerifyResult

> **XmlDSigVerifyResult** = \{ `keyId?`: `string`; `ok`: `true`; `signatureCount`: `number`; `signedReferences`: `string`[]; \} \| \{ `mismatches`: [`XmlDSigReferenceMismatch`](../interfaces/XmlDSigReferenceMismatch.md)[]; `ok`: `false`; `reason`: `string`; `signatureCount`: `number`; \}

Defined in: [packages/signature/src/xmldsig/types.ts:64](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/xmldsig/types.ts#L64)
