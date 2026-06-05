[**@stynx/integration-adapter**](../index.md)

---

[@stynx/integration-adapter](../index.md) / InMemoryIdempotencyStore

# Class: InMemoryIdempotencyStore\<TRes\>

Defined in: [index.ts:72](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L72)

## Type Parameters

### TRes

`TRes`

## Implements

- [`IdempotencyStore`](../interfaces/IdempotencyStore.md)\<`TRes`\>

## Constructors

### Constructor

> **new InMemoryIdempotencyStore**\<`TRes`\>(): `InMemoryIdempotencyStore`\<`TRes`\>

#### Returns

`InMemoryIdempotencyStore`\<`TRes`\>

## Methods

### get()

> **get**(`key`): `Promise`\<`TRes` \| `undefined`\>

Defined in: [index.ts:75](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L75)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`TRes` \| `undefined`\>

#### Implementation of

[`IdempotencyStore`](../interfaces/IdempotencyStore.md).[`get`](../interfaces/IdempotencyStore.md#get)

---

### set()

> **set**(`key`, `value`): `Promise`\<`void`\>

Defined in: [index.ts:79](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L79)

#### Parameters

##### key

`string`

##### value

`TRes`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IdempotencyStore`](../interfaces/IdempotencyStore.md).[`set`](../interfaces/IdempotencyStore.md#set)
