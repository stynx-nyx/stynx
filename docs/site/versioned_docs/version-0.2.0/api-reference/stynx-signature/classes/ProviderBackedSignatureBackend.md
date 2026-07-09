[**@stynx-nyx/signature**](../index.md)

---

[@stynx-nyx/signature](../index.md) / ProviderBackedSignatureBackend

# Class: ProviderBackedSignatureBackend

Defined in: [packages/signature/src/provider-backend.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/provider-backend.ts#L15)

## Implements

- [`SignatureBackend`](../interfaces/SignatureBackend.md)

## Constructors

### Constructor

> **new ProviderBackedSignatureBackend**(`provider`, `options?`): `ProviderBackedSignatureBackend`

Defined in: [packages/signature/src/provider-backend.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/provider-backend.ts#L16)

#### Parameters

##### provider

[`SignatureProviderClient`](../interfaces/SignatureProviderClient.md)

##### options?

###### crlUrl?

`string`

###### now?

() => `Date`

###### verificationPolicy?

[`VerificationPolicy`](../interfaces/VerificationPolicy.md)

#### Returns

`ProviderBackedSignatureBackend`

## Methods

### sign()

> **sign**(`request`): `Promise`\<[`SignatureResult`](../interfaces/SignatureResult.md)\>

Defined in: [packages/signature/src/provider-backend.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/provider-backend.ts#L25)

#### Parameters

##### request

[`SignatureRequest`](../interfaces/SignatureRequest.md)

#### Returns

`Promise`\<[`SignatureResult`](../interfaces/SignatureResult.md)\>

#### Implementation of

[`SignatureBackend`](../interfaces/SignatureBackend.md).[`sign`](../interfaces/SignatureBackend.md#sign)

---

### verify()

> **verify**(`request`): `Promise`\<[`VerifyResult`](../interfaces/VerifyResult.md)\>

Defined in: [packages/signature/src/provider-backend.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/provider-backend.ts#L66)

#### Parameters

##### request

[`VerifyRequest`](../interfaces/VerifyRequest.md)

#### Returns

`Promise`\<[`VerifyResult`](../interfaces/VerifyResult.md)\>

#### Implementation of

[`SignatureBackend`](../interfaces/SignatureBackend.md).[`verify`](../interfaces/SignatureBackend.md#verify)
