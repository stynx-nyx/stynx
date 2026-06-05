[**@stynx/ratelimit**](../index.md)

---

[@stynx/ratelimit](../index.md) / PgRateLimitStore

# Class: PgRateLimitStore

Defined in: [pg-rate-limit.store.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/pg-rate-limit.store.ts#L31)

## Implements

- [`RateLimitStore`](../interfaces/RateLimitStore.md)

## Constructors

### Constructor

> **new PgRateLimitStore**(`options`): `PgRateLimitStore`

Defined in: [pg-rate-limit.store.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/pg-rate-limit.store.ts#L39)

#### Parameters

##### options

[`PgRateLimitStoreOptions`](../interfaces/PgRateLimitStoreOptions.md)

#### Returns

`PgRateLimitStore`

## Methods

### consume()

> **consume**(`context`): `Promise`\<[`RateLimitDecision`](../interfaces/RateLimitDecision.md)\>

Defined in: [pg-rate-limit.store.ts:63](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/pg-rate-limit.store.ts#L63)

#### Parameters

##### context

[`RateLimitDecisionContext`](../interfaces/RateLimitDecisionContext.md)

#### Returns

`Promise`\<[`RateLimitDecision`](../interfaces/RateLimitDecision.md)\>

#### Implementation of

[`RateLimitStore`](../interfaces/RateLimitStore.md).[`consume`](../interfaces/RateLimitStore.md#consume)
