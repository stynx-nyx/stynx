[**@stynx/signature**](../index.md)

---

[@stynx/signature](../index.md) / SignatureService

# Class: SignatureService

Defined in: [packages/signature/src/signature.service.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/signature.service.ts#L36)

## Constructors

### Constructor

> **new SignatureService**(`backend?`): `SignatureService`

Defined in: [packages/signature/src/signature.service.ts:37](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/signature.service.ts#L37)

#### Parameters

##### backend?

[`SignatureBackend`](../interfaces/SignatureBackend.md) = `...`

#### Returns

`SignatureService`

## Methods

### sign()

> **sign**(`request`): `Promise`\<[`SignatureResult`](../interfaces/SignatureResult.md)\>

Defined in: [packages/signature/src/signature.service.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/signature.service.ts#L39)

#### Parameters

##### request

[`SignatureRequest`](../interfaces/SignatureRequest.md)

#### Returns

`Promise`\<[`SignatureResult`](../interfaces/SignatureResult.md)\>

---

### verify()

> **verify**(`request`): `Promise`\<[`VerifyResult`](../interfaces/VerifyResult.md)\>

Defined in: [packages/signature/src/signature.service.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/signature.service.ts#L48)

#### Parameters

##### request

[`VerifyRequest`](../interfaces/VerifyRequest.md)

#### Returns

`Promise`\<[`VerifyResult`](../interfaces/VerifyResult.md)\>
