[**@stynx/signature**](../index.md)

---

[@stynx/signature](../index.md) / SignatureBackend

# Interface: SignatureBackend

Defined in: [packages/signature/src/types.ts:92](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L92)

## Methods

### sign()

> **sign**(`request`): `Promise`\<[`SignatureResult`](SignatureResult.md)\>

Defined in: [packages/signature/src/types.ts:93](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L93)

#### Parameters

##### request

[`SignatureRequest`](SignatureRequest.md)

#### Returns

`Promise`\<[`SignatureResult`](SignatureResult.md)\>

---

### verify()

> **verify**(`request`): `Promise`\<[`VerifyResult`](VerifyResult.md)\>

Defined in: [packages/signature/src/types.ts:94](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L94)

#### Parameters

##### request

[`VerifyRequest`](VerifyRequest.md)

#### Returns

`Promise`\<[`VerifyResult`](VerifyResult.md)\>
