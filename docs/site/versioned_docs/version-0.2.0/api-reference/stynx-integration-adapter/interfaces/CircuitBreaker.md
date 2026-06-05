[**@stynx/integration-adapter**](../index.md)

---

[@stynx/integration-adapter](../index.md) / CircuitBreaker

# Interface: CircuitBreaker

Defined in: [types.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L52)

## Methods

### beforeRequest()

> **beforeRequest**(`key`): `Promise`\<[`CircuitSnapshot`](CircuitSnapshot.md)\>

Defined in: [types.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L53)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`CircuitSnapshot`](CircuitSnapshot.md)\>

---

### recordFailure()

> **recordFailure**(`key`): `Promise`\<[`CircuitSnapshot`](CircuitSnapshot.md)\>

Defined in: [types.ts:55](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L55)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`CircuitSnapshot`](CircuitSnapshot.md)\>

---

### recordSuccess()

> **recordSuccess**(`key`): `Promise`\<`void`\>

Defined in: [types.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L54)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`void`\>

---

### snapshot()

> **snapshot**(`key`): [`CircuitSnapshot`](CircuitSnapshot.md)

Defined in: [types.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L56)

#### Parameters

##### key

`string`

#### Returns

[`CircuitSnapshot`](CircuitSnapshot.md)
