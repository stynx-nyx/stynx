[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / RateLimitGuardOptions

# Interface: RateLimitGuardOptions

Defined in: [packages/ratelimit/src/types.ts:44](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L44)

## Extended by

- [`StynxRateLimitModuleOptions`](StynxRateLimitModuleOptions.md)

## Properties

### defaultLimit?

> `optional` **defaultLimit?**: `number`

Defined in: [packages/ratelimit/src/types.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L45)

---

### defaults?

> `optional` **defaults?**: `Record`\<`string`, \{ `limit`: `number`; `windowSeconds`: `number`; \}\>

Defined in: [packages/ratelimit/src/types.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L53)

---

### defaultWindowSeconds?

> `optional` **defaultWindowSeconds?**: `number`

Defined in: [packages/ratelimit/src/types.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L46)

---

### distributedStrict?

> `optional` **distributedStrict?**: `boolean`

Defined in: [packages/ratelimit/src/types.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L47)

---

### healthCheckPathPrefixes?

> `optional` **healthCheckPathPrefixes?**: `string`[]

Defined in: [packages/ratelimit/src/types.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L48)

---

### redis?

> `optional` **redis?**: `object`

Defined in: [packages/ratelimit/src/types.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L49)

#### keyPrefix?

> `optional` **keyPrefix?**: `string`

#### url

> **url**: `string`
