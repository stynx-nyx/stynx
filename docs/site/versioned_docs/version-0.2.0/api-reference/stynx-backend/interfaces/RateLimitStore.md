[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / RateLimitStore

# Interface: RateLimitStore

Defined in: [packages/ratelimit/src/types.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L40)

## Methods

### consume()

> **consume**(`context`): `Promise`\<[`RateLimitDecision`](RateLimitDecision.md)\>

Defined in: [packages/ratelimit/src/types.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L41)

#### Parameters

##### context

[`RateLimitDecisionContext`](RateLimitDecisionContext.md)

#### Returns

`Promise`\<[`RateLimitDecision`](RateLimitDecision.md)\>
