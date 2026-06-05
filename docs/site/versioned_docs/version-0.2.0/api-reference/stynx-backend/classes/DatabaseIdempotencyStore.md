[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / DatabaseIdempotencyStore

# Class: DatabaseIdempotencyStore

Defined in: [packages/idempotency/src/database-idempotency.store.ts:27](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/database-idempotency.store.ts#L27)

## Implements

- [`IdempotencyStore`](../interfaces/IdempotencyStore.md)

## Constructors

### Constructor

> **new DatabaseIdempotencyStore**(`database?`, `options?`): `DatabaseIdempotencyStore`

Defined in: [packages/idempotency/src/database-idempotency.store.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/database-idempotency.store.ts#L28)

#### Parameters

##### database?

`Database`

##### options?

[`IdempotencyInterceptorOptions`](../interfaces/IdempotencyInterceptorOptions.md)

#### Returns

`DatabaseIdempotencyStore`

## Methods

### clearReservation()

> **clearReservation**(`context`): `Promise`\<`void`\>

Defined in: [packages/idempotency/src/database-idempotency.store.ts:142](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/database-idempotency.store.ts#L142)

#### Parameters

##### context

`IdempotencyDecisionContext`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IdempotencyStore`](../interfaces/IdempotencyStore.md).[`clearReservation`](../interfaces/IdempotencyStore.md#clearreservation)

---

### lookup()

> **lookup**(`context`): `Promise`\<[`IdempotencyStoredEntry`](../interfaces/IdempotencyStoredEntry.md) \| `null`\>

Defined in: [packages/idempotency/src/database-idempotency.store.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/database-idempotency.store.ts#L35)

#### Parameters

##### context

`IdempotencyDecisionContext`

#### Returns

`Promise`\<[`IdempotencyStoredEntry`](../interfaces/IdempotencyStoredEntry.md) \| `null`\>

#### Implementation of

[`IdempotencyStore`](../interfaces/IdempotencyStore.md).[`lookup`](../interfaces/IdempotencyStore.md#lookup)

---

### persistResponse()

> **persistResponse**(`context`, `statusCode`, `body`, `headers?`): `Promise`\<`boolean`\>

Defined in: [packages/idempotency/src/database-idempotency.store.ts:103](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/database-idempotency.store.ts#L103)

#### Parameters

##### context

`IdempotencyDecisionContext`

##### statusCode

`number`

##### body

`unknown`

##### headers?

`Record`\<`string`, `string`\> = `{}`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`IdempotencyStore`](../interfaces/IdempotencyStore.md).[`persistResponse`](../interfaces/IdempotencyStore.md#persistresponse)

---

### reserve()

> **reserve**(`context`): `Promise`\<`boolean`\>

Defined in: [packages/idempotency/src/database-idempotency.store.ts:72](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/database-idempotency.store.ts#L72)

#### Parameters

##### context

`IdempotencyDecisionContext`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`IdempotencyStore`](../interfaces/IdempotencyStore.md).[`reserve`](../interfaces/IdempotencyStore.md#reserve)
