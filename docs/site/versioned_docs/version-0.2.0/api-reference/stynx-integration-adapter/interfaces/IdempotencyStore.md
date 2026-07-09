[**@stynx-nyx/integration-adapter**](../index.md)

---

[@stynx-nyx/integration-adapter](../index.md) / IdempotencyStore

# Interface: IdempotencyStore\<TRes\>

Defined in: [types.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L47)

## Type Parameters

### TRes

`TRes`

## Methods

### get()

> **get**(`key`): `Promise`\<`TRes` \| `undefined`\>

Defined in: [types.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L48)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`TRes` \| `undefined`\>

---

### set()

> **set**(`key`, `value`): `Promise`\<`void`\>

Defined in: [types.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L49)

#### Parameters

##### key

`string`

##### value

`TRes`

#### Returns

`Promise`\<`void`\>
