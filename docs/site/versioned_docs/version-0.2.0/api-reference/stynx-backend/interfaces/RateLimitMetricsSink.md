[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / RateLimitMetricsSink

# Interface: RateLimitMetricsSink

Defined in: [packages/ratelimit/src/types.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L56)

## Methods

### incrementBlocked()

> **incrementBlocked**(`scope`): `void`

Defined in: [packages/ratelimit/src/types.ts:57](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L57)

#### Parameters

##### scope

`string`

#### Returns

`void`

---

### recordLatency()?

> `optional` **recordLatency**(`scope`, `elapsedMs`): `void`

Defined in: [packages/ratelimit/src/types.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L58)

#### Parameters

##### scope

`string`

##### elapsedMs

`number`

#### Returns

`void`
