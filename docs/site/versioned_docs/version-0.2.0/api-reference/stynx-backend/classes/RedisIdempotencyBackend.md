[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / RedisIdempotencyBackend

# Class: RedisIdempotencyBackend

Defined in: [packages/idempotency/src/redis-idempotency.backend.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/redis-idempotency.backend.ts#L16)

## Implements

- [`IdempotencyBackend`](../interfaces/IdempotencyBackend.md)
- `OnModuleInit`
- `OnModuleDestroy`

## Constructors

### Constructor

> **new RedisIdempotencyBackend**(`options?`): `RedisIdempotencyBackend`

Defined in: [packages/idempotency/src/redis-idempotency.backend.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/redis-idempotency.backend.ts#L19)

#### Parameters

##### options?

[`IdempotencyInterceptorOptions`](../interfaces/IdempotencyInterceptorOptions.md)

#### Returns

`RedisIdempotencyBackend`

## Methods

### acquireLock()

> **acquireLock**(`context`, `token`): `Promise`\<`boolean`\>

Defined in: [packages/idempotency/src/redis-idempotency.backend.ts:51](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/redis-idempotency.backend.ts#L51)

#### Parameters

##### context

`IdempotencyDecisionContext`

##### token

`string`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`IdempotencyBackend`](../interfaces/IdempotencyBackend.md).[`acquireLock`](../interfaces/IdempotencyBackend.md#acquirelock)

---

### get()

> **get**(`context`): `Promise`\<[`IdempotencyStoredEntry`](../interfaces/IdempotencyStoredEntry.md) \| `null`\>

Defined in: [packages/idempotency/src/redis-idempotency.backend.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/redis-idempotency.backend.ts#L34)

#### Parameters

##### context

`IdempotencyDecisionContext`

#### Returns

`Promise`\<[`IdempotencyStoredEntry`](../interfaces/IdempotencyStoredEntry.md) \| `null`\>

#### Implementation of

[`IdempotencyBackend`](../interfaces/IdempotencyBackend.md).[`get`](../interfaces/IdempotencyBackend.md#get)

---

### isLocked()

> **isLocked**(`context`): `Promise`\<`boolean`\>

Defined in: [packages/idempotency/src/redis-idempotency.backend.ts:73](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/redis-idempotency.backend.ts#L73)

#### Parameters

##### context

`IdempotencyDecisionContext`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`IdempotencyBackend`](../interfaces/IdempotencyBackend.md).[`isLocked`](../interfaces/IdempotencyBackend.md#islocked)

---

### onModuleDestroy()

> **onModuleDestroy**(): `Promise`\<`void`\>

Defined in: [packages/idempotency/src/redis-idempotency.backend.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/redis-idempotency.backend.ts#L80)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleDestroy.onModuleDestroy`

---

### onModuleInit()

> **onModuleInit**(): `Promise`\<`void`\>

Defined in: [packages/idempotency/src/redis-idempotency.backend.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/redis-idempotency.backend.ts#L25)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleInit.onModuleInit`

---

### releaseLock()

> **releaseLock**(`context`, `token`): `Promise`\<`void`\>

Defined in: [packages/idempotency/src/redis-idempotency.backend.ts:62](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/redis-idempotency.backend.ts#L62)

#### Parameters

##### context

`IdempotencyDecisionContext`

##### token

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IdempotencyBackend`](../interfaces/IdempotencyBackend.md).[`releaseLock`](../interfaces/IdempotencyBackend.md#releaselock)

---

### set()

> **set**(`context`, `entry`): `Promise`\<`void`\>

Defined in: [packages/idempotency/src/redis-idempotency.backend.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/redis-idempotency.backend.ts#L42)

#### Parameters

##### context

`IdempotencyDecisionContext`

##### entry

[`IdempotencyStoredEntry`](../interfaces/IdempotencyStoredEntry.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IdempotencyBackend`](../interfaces/IdempotencyBackend.md).[`set`](../interfaces/IdempotencyBackend.md#set)
