[**@stynx-nyx/ratelimit**](../index.md)

---

[@stynx-nyx/ratelimit](../index.md) / RateLimitPolicyResolver

# Interface: RateLimitPolicyResolver

Defined in: [types.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L61)

## Methods

### resolve()

> **resolve**(`request`, `metadata`): `Promise`\<[`ResolvedRateLimitPolicy`](ResolvedRateLimitPolicy.md)\>

Defined in: [types.ts:62](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L62)

#### Parameters

##### request

[`RequestLike`](RequestLike.md)

##### metadata

[`RateLimitMetadata`](RateLimitMetadata.md)

#### Returns

`Promise`\<[`ResolvedRateLimitPolicy`](ResolvedRateLimitPolicy.md)\>
