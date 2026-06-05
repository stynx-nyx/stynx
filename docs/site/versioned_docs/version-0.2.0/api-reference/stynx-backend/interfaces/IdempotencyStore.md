[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / IdempotencyStore

# Interface: IdempotencyStore

Defined in: [packages/idempotency/src/types.ts:29](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L29)

## Methods

### clearReservation()

> **clearReservation**(`context`): `Promise`\<`void`\>

Defined in: [packages/idempotency/src/types.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L38)

#### Parameters

##### context

`IdempotencyDecisionContext`

#### Returns

`Promise`\<`void`\>

---

### lookup()

> **lookup**(`context`): `Promise`\<[`IdempotencyStoredEntry`](IdempotencyStoredEntry.md) \| `null`\>

Defined in: [packages/idempotency/src/types.ts:30](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L30)

#### Parameters

##### context

`IdempotencyDecisionContext`

#### Returns

`Promise`\<[`IdempotencyStoredEntry`](IdempotencyStoredEntry.md) \| `null`\>

---

### persistResponse()

> **persistResponse**(`context`, `statusCode`, `body`, `headers?`): `Promise`\<`boolean`\>

Defined in: [packages/idempotency/src/types.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L32)

#### Parameters

##### context

`IdempotencyDecisionContext`

##### statusCode

`number`

##### body

`unknown`

##### headers?

`Record`\<`string`, `string`\>

#### Returns

`Promise`\<`boolean`\>

---

### reserve()

> **reserve**(`context`): `Promise`\<`boolean`\>

Defined in: [packages/idempotency/src/types.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L31)

#### Parameters

##### context

`IdempotencyDecisionContext`

#### Returns

`Promise`\<`boolean`\>
