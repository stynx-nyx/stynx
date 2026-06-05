[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / RateLimitPolicyResolver

# Interface: RateLimitPolicyResolver

Defined in: [packages/ratelimit/src/types.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L61)

## Methods

### resolve()

> **resolve**(`request`, `metadata`): `Promise`\<[`ResolvedRateLimitPolicy`](ResolvedRateLimitPolicy.md)\>

Defined in: [packages/ratelimit/src/types.ts:62](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L62)

#### Parameters

##### request

`RequestLike`

##### metadata

[`RateLimitMetadata`](RateLimitMetadata.md)

#### Returns

`Promise`\<[`ResolvedRateLimitPolicy`](ResolvedRateLimitPolicy.md)\>
