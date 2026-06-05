[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / PgIdempotencyStore

# Class: PgIdempotencyStore

Defined in: [packages/idempotency/src/pg-idempotency.store.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/pg-idempotency.store.ts#L32)

## Implements

- [`IdempotencyStore`](../interfaces/IdempotencyStore.md)

## Constructors

### Constructor

> **new PgIdempotencyStore**(`options`): `PgIdempotencyStore`

Defined in: [packages/idempotency/src/pg-idempotency.store.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/pg-idempotency.store.ts#L41)

#### Parameters

##### options

`PgIdempotencyStoreOptions`

#### Returns

`PgIdempotencyStore`

## Methods

### clearReservation()

> **clearReservation**(`context`): `Promise`\<`void`\>

Defined in: [packages/idempotency/src/pg-idempotency.store.ts:167](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/pg-idempotency.store.ts#L167)

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

Defined in: [packages/idempotency/src/pg-idempotency.store.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/pg-idempotency.store.ts#L66)

#### Parameters

##### context

`IdempotencyDecisionContext`

#### Returns

`Promise`\<[`IdempotencyStoredEntry`](../interfaces/IdempotencyStoredEntry.md) \| `null`\>

#### Implementation of

[`IdempotencyStore`](../interfaces/IdempotencyStore.md).[`lookup`](../interfaces/IdempotencyStore.md#lookup)

---

### persistResponse()

> **persistResponse**(`context`, `statusCode`, `body`, `_headers?`): `Promise`\<`boolean`\>

Defined in: [packages/idempotency/src/pg-idempotency.store.ts:137](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/pg-idempotency.store.ts#L137)

#### Parameters

##### context

`IdempotencyDecisionContext`

##### statusCode

`number`

##### body

`unknown`

##### \_headers?

`Record`\<`string`, `string`\> = `{}`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`IdempotencyStore`](../interfaces/IdempotencyStore.md).[`persistResponse`](../interfaces/IdempotencyStore.md#persistresponse)

---

### reserve()

> **reserve**(`context`): `Promise`\<`boolean`\>

Defined in: [packages/idempotency/src/pg-idempotency.store.ts:102](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/pg-idempotency.store.ts#L102)

#### Parameters

##### context

`IdempotencyDecisionContext`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`IdempotencyStore`](../interfaces/IdempotencyStore.md).[`reserve`](../interfaces/IdempotencyStore.md#reserve)
