[**@stynx/signature**](../index.md)

---

[@stynx/signature](../index.md) / SequentialSigner

# Class: SequentialSigner

Defined in: [packages/signature/src/sequential.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/sequential.ts#L40)

## Constructors

### Constructor

> **new SequentialSigner**(`options`): `SequentialSigner`

Defined in: [packages/signature/src/sequential.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/sequential.ts#L41)

#### Parameters

##### options

###### allowedReaderRoles?

`string`[]

###### expectedSignerIds

`string`[]

###### now?

() => `Date`

#### Returns

`SequentialSigner`

## Methods

### append()

> **append**(`envelope`, `signer`): [`SequentialEnvelope`](../interfaces/SequentialEnvelope.md)

Defined in: [packages/signature/src/sequential.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/sequential.ts#L61)

#### Parameters

##### envelope

[`SequentialEnvelope`](../interfaces/SequentialEnvelope.md)

##### signer

[`SequentialSignerRef`](../interfaces/SequentialSignerRef.md)

#### Returns

[`SequentialEnvelope`](../interfaces/SequentialEnvelope.md)

---

### create()

> **create**(`payload`): [`SequentialEnvelope`](../interfaces/SequentialEnvelope.md)

Defined in: [packages/signature/src/sequential.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/sequential.ts#L49)

#### Parameters

##### payload

`Uint8Array`

#### Returns

[`SequentialEnvelope`](../interfaces/SequentialEnvelope.md)

---

### publish()

> **publish**(`envelope`): [`SequentialEnvelope`](../interfaces/SequentialEnvelope.md)

Defined in: [packages/signature/src/sequential.ts:75](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/sequential.ts#L75)

#### Parameters

##### envelope

[`SequentialEnvelope`](../interfaces/SequentialEnvelope.md)

#### Returns

[`SequentialEnvelope`](../interfaces/SequentialEnvelope.md)

---

### read()

> **read**(`envelope`, `role`): [`SequentialReadResult`](../interfaces/SequentialReadResult.md)

Defined in: [packages/signature/src/sequential.ts:86](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/sequential.ts#L86)

#### Parameters

##### envelope

[`SequentialEnvelope`](../interfaces/SequentialEnvelope.md)

##### role

`string`

#### Returns

[`SequentialReadResult`](../interfaces/SequentialReadResult.md)

---

### verify()

> **verify**(`envelope`): [`SequentialVerifyResult`](../interfaces/SequentialVerifyResult.md)

Defined in: [packages/signature/src/sequential.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/sequential.ts#L82)

#### Parameters

##### envelope

[`SequentialEnvelope`](../interfaces/SequentialEnvelope.md)

#### Returns

[`SequentialVerifyResult`](../interfaces/SequentialVerifyResult.md)
