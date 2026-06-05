[**@stynx/signature**](../index.md)

---

[@stynx/signature](../index.md) / SignatureProviderClient

# Interface: SignatureProviderClient

Defined in: [packages/signature/src/types.ts:151](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L151)

## Methods

### signPades()

> **signPades**(`request`): `Promise`\<[`ProviderSignResult`](ProviderSignResult.md)\>

Defined in: [packages/signature/src/types.ts:153](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L153)

#### Parameters

##### request

[`ProviderSignRequest`](ProviderSignRequest.md)

#### Returns

`Promise`\<[`ProviderSignResult`](ProviderSignResult.md)\>

---

### validateCertificate()

> **validateCertificate**(`request`): `Promise`\<[`CertificateValidationResult`](CertificateValidationResult.md)\>

Defined in: [packages/signature/src/types.ts:152](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L152)

#### Parameters

##### request

[`CertificateValidationRequest`](CertificateValidationRequest.md)

#### Returns

`Promise`\<[`CertificateValidationResult`](CertificateValidationResult.md)\>

---

### verifyPades()

> **verifyPades**(`request`): `Promise`\<[`VerifyResult`](VerifyResult.md)\>

Defined in: [packages/signature/src/types.ts:154](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L154)

#### Parameters

##### request

[`ProviderVerifyRequest`](ProviderVerifyRequest.md)

#### Returns

`Promise`\<[`VerifyResult`](VerifyResult.md)\>
