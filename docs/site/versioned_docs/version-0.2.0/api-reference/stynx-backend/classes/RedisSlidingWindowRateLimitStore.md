[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / RedisSlidingWindowRateLimitStore

# Class: RedisSlidingWindowRateLimitStore

Defined in: [packages/ratelimit/src/redis-rate-limit.store.ts:63](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/redis-rate-limit.store.ts#L63)

## Implements

- [`RateLimitStore`](../interfaces/RateLimitStore.md)
- `OnModuleInit`
- `OnModuleDestroy`

## Constructors

### Constructor

> **new RedisSlidingWindowRateLimitStore**(`options?`): `RedisSlidingWindowRateLimitStore`

Defined in: [packages/ratelimit/src/redis-rate-limit.store.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/redis-rate-limit.store.ts#L68)

#### Parameters

##### options?

[`RateLimitGuardOptions`](../interfaces/RateLimitGuardOptions.md)

#### Returns

`RedisSlidingWindowRateLimitStore`

## Methods

### consume()

> **consume**(`context`): `Promise`\<[`RateLimitDecision`](../interfaces/RateLimitDecision.md)\>

Defined in: [packages/ratelimit/src/redis-rate-limit.store.ts:84](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/redis-rate-limit.store.ts#L84)

#### Parameters

##### context

[`RateLimitDecisionContext`](../interfaces/RateLimitDecisionContext.md)

#### Returns

`Promise`\<[`RateLimitDecision`](../interfaces/RateLimitDecision.md)\>

#### Implementation of

[`RateLimitStore`](../interfaces/RateLimitStore.md).[`consume`](../interfaces/RateLimitStore.md#consume)

---

### onModuleDestroy()

> **onModuleDestroy**(): `Promise`\<`void`\>

Defined in: [packages/ratelimit/src/redis-rate-limit.store.ts:112](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/redis-rate-limit.store.ts#L112)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleDestroy.onModuleDestroy`

---

### onModuleInit()

> **onModuleInit**(): `Promise`\<`void`\>

Defined in: [packages/ratelimit/src/redis-rate-limit.store.ts:74](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/redis-rate-limit.store.ts#L74)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleInit.onModuleInit`
