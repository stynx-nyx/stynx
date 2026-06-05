[**@stynx/signature**](../index.md)

---

[@stynx/signature](../index.md) / HttpSignatureProviderClient

# Class: HttpSignatureProviderClient

Defined in: [packages/signature/src/http-provider-client.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/http-provider-client.ts#L61)

## Constructors

### Constructor

> **new HttpSignatureProviderClient**(`options?`): `HttpSignatureProviderClient`

Defined in: [packages/signature/src/http-provider-client.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/http-provider-client.ts#L66)

#### Parameters

##### options?

[`HttpSignatureProviderOptions`](../interfaces/HttpSignatureProviderOptions.md) = `{}`

#### Returns

`HttpSignatureProviderClient`

## Methods

### signPades()

> **signPades**(`request`): `Promise`\<[`ProviderSignResult`](../interfaces/ProviderSignResult.md)\>

Defined in: [packages/signature/src/http-provider-client.ts:110](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/http-provider-client.ts#L110)

#### Parameters

##### request

[`ProviderSignRequest`](../interfaces/ProviderSignRequest.md)

#### Returns

`Promise`\<[`ProviderSignResult`](../interfaces/ProviderSignResult.md)\>

---

### validateCertificate()

> **validateCertificate**(`request`): `Promise`\<[`CertificateValidationResult`](../interfaces/CertificateValidationResult.md)\>

Defined in: [packages/signature/src/http-provider-client.ts:81](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/http-provider-client.ts#L81)

#### Parameters

##### request

[`CertificateValidationRequest`](../interfaces/CertificateValidationRequest.md)

#### Returns

`Promise`\<[`CertificateValidationResult`](../interfaces/CertificateValidationResult.md)\>

---

### verifyPades()

> **verifyPades**(`request`): `Promise`\<[`VerifyResult`](../interfaces/VerifyResult.md)\>

Defined in: [packages/signature/src/http-provider-client.ts:152](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/http-provider-client.ts#L152)

#### Parameters

##### request

[`ProviderVerifyRequest`](../interfaces/ProviderVerifyRequest.md)

#### Returns

`Promise`\<[`VerifyResult`](../interfaces/VerifyResult.md)\>
