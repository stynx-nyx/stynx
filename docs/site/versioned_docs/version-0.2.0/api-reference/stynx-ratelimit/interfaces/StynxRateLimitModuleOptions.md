[**@stynx-nyx/ratelimit**](../index.md)

---

[@stynx-nyx/ratelimit](../index.md) / StynxRateLimitModuleOptions

# Interface: StynxRateLimitModuleOptions

Defined in: [rate-limit.module.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/rate-limit.module.ts#L10)

## Extends

- [`RateLimitGuardOptions`](RateLimitGuardOptions.md)

## Properties

### defaultLimit?

> `optional` **defaultLimit?**: `number`

Defined in: [types.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L45)

#### Inherited from

[`RateLimitGuardOptions`](RateLimitGuardOptions.md).[`defaultLimit`](RateLimitGuardOptions.md#defaultlimit)

---

### defaults?

> `optional` **defaults?**: `Record`\<`string`, \{ `limit`: `number`; `windowSeconds`: `number`; \}\>

Defined in: [types.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L53)

#### Inherited from

[`RateLimitGuardOptions`](RateLimitGuardOptions.md).[`defaults`](RateLimitGuardOptions.md#defaults)

---

### defaultWindowSeconds?

> `optional` **defaultWindowSeconds?**: `number`

Defined in: [types.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L46)

#### Inherited from

[`RateLimitGuardOptions`](RateLimitGuardOptions.md).[`defaultWindowSeconds`](RateLimitGuardOptions.md#defaultwindowseconds)

---

### distributedStrict?

> `optional` **distributedStrict?**: `boolean`

Defined in: [types.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L47)

#### Inherited from

[`RateLimitGuardOptions`](RateLimitGuardOptions.md).[`distributedStrict`](RateLimitGuardOptions.md#distributedstrict)

---

### healthCheckPathPrefixes?

> `optional` **healthCheckPathPrefixes?**: `string`[]

Defined in: [types.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L48)

#### Inherited from

[`RateLimitGuardOptions`](RateLimitGuardOptions.md).[`healthCheckPathPrefixes`](RateLimitGuardOptions.md#healthcheckpathprefixes)

---

### metrics?

> `optional` **metrics?**: [`RateLimitMetricsSink`](RateLimitMetricsSink.md)

Defined in: [rate-limit.module.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/rate-limit.module.ts#L13)

---

### policyResolver?

> `optional` **policyResolver?**: [`RateLimitPolicyResolver`](RateLimitPolicyResolver.md)

Defined in: [rate-limit.module.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/rate-limit.module.ts#L12)

---

### redis?

> `optional` **redis?**: `object`

Defined in: [types.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L49)

#### keyPrefix?

> `optional` **keyPrefix?**: `string`

#### url

> **url**: `string`

#### Inherited from

[`RateLimitGuardOptions`](RateLimitGuardOptions.md).[`redis`](RateLimitGuardOptions.md#redis)

---

### store?

> `optional` **store?**: [`RateLimitStore`](RateLimitStore.md)

Defined in: [rate-limit.module.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/rate-limit.module.ts#L11)
