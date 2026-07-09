[**@stynx-nyx/idempotency**](../index.md)

---

[@stynx-nyx/idempotency](../index.md) / IdempotencyBackend

# Interface: IdempotencyBackend

Defined in: [types.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L41)

## Methods

### acquireLock()

> **acquireLock**(`context`, `token`): `Promise`\<`boolean`\>

Defined in: [types.ts:44](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L44)

#### Parameters

##### context

[`IdempotencyDecisionContext`](IdempotencyDecisionContext.md)

##### token

`string`

#### Returns

`Promise`\<`boolean`\>

---

### get()

> **get**(`context`): `Promise`\<[`IdempotencyStoredEntry`](IdempotencyStoredEntry.md) \| `null`\>

Defined in: [types.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L42)

#### Parameters

##### context

[`IdempotencyDecisionContext`](IdempotencyDecisionContext.md)

#### Returns

`Promise`\<[`IdempotencyStoredEntry`](IdempotencyStoredEntry.md) \| `null`\>

---

### isLocked()

> **isLocked**(`context`): `Promise`\<`boolean`\>

Defined in: [types.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L46)

#### Parameters

##### context

[`IdempotencyDecisionContext`](IdempotencyDecisionContext.md)

#### Returns

`Promise`\<`boolean`\>

---

### releaseLock()

> **releaseLock**(`context`, `token`): `Promise`\<`void`\>

Defined in: [types.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L45)

#### Parameters

##### context

[`IdempotencyDecisionContext`](IdempotencyDecisionContext.md)

##### token

`string`

#### Returns

`Promise`\<`void`\>

---

### set()

> **set**(`context`, `entry`): `Promise`\<`void`\>

Defined in: [types.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L43)

#### Parameters

##### context

[`IdempotencyDecisionContext`](IdempotencyDecisionContext.md)

##### entry

[`IdempotencyStoredEntry`](IdempotencyStoredEntry.md)

#### Returns

`Promise`\<`void`\>
