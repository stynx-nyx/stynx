[**@stynx-nyx/ratelimit**](../index.md)

---

[@stynx-nyx/ratelimit](../index.md) / DatabaseRateLimitPolicyResolver

# Class: DatabaseRateLimitPolicyResolver

Defined in: [rate-limit-policy.service.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/rate-limit-policy.service.ts#L25)

## Implements

- [`RateLimitPolicyResolver`](../interfaces/RateLimitPolicyResolver.md)

## Constructors

### Constructor

> **new DatabaseRateLimitPolicyResolver**(`options`, `database?`): `DatabaseRateLimitPolicyResolver`

Defined in: [rate-limit-policy.service.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/rate-limit-policy.service.ts#L26)

#### Parameters

##### options

[`RateLimitGuardOptions`](../interfaces/RateLimitGuardOptions.md)

##### database?

`Database`

#### Returns

`DatabaseRateLimitPolicyResolver`

## Methods

### resolve()

> **resolve**(`request`, `metadata`): `Promise`\<[`ResolvedRateLimitPolicy`](../interfaces/ResolvedRateLimitPolicy.md)\>

Defined in: [rate-limit-policy.service.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/rate-limit-policy.service.ts#L33)

#### Parameters

##### request

[`RequestLike`](../interfaces/RequestLike.md)

##### metadata

[`RateLimitMetadata`](../interfaces/RateLimitMetadata.md)

#### Returns

`Promise`\<[`ResolvedRateLimitPolicy`](../interfaces/ResolvedRateLimitPolicy.md)\>

#### Implementation of

[`RateLimitPolicyResolver`](../interfaces/RateLimitPolicyResolver.md).[`resolve`](../interfaces/RateLimitPolicyResolver.md#resolve)
