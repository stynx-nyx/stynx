[**@stynx-nyx/ratelimit**](../index.md)

---

[@stynx-nyx/ratelimit](../index.md) / RateLimitMetricsSink

# Interface: RateLimitMetricsSink

Defined in: [types.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L56)

## Methods

### incrementBlocked()

> **incrementBlocked**(`scope`): `void`

Defined in: [types.ts:57](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L57)

#### Parameters

##### scope

`string`

#### Returns

`void`

---

### recordLatency()?

> `optional` **recordLatency**(`scope`, `elapsedMs`): `void`

Defined in: [types.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L58)

#### Parameters

##### scope

`string`

##### elapsedMs

`number`

#### Returns

`void`
