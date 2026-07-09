[**@stynx-nyx/idempotency**](../index.md)

---

[@stynx-nyx/idempotency](../index.md) / StynxIdempotencyModuleOptions

# Interface: StynxIdempotencyModuleOptions

Defined in: [idempotency.module.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/idempotency.module.ts#L10)

## Extends

- [`IdempotencyInterceptorOptions`](IdempotencyInterceptorOptions.md)

## Properties

### backend?

> `optional` **backend?**: [`IdempotencyBackend`](IdempotencyBackend.md)

Defined in: [idempotency.module.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/idempotency.module.ts#L12)

---

### defaultHeaderName?

> `optional` **defaultHeaderName?**: `string`

Defined in: [types.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L50)

#### Inherited from

[`IdempotencyInterceptorOptions`](IdempotencyInterceptorOptions.md).[`defaultHeaderName`](IdempotencyInterceptorOptions.md#defaultheadername)

---

### durableStrict?

> `optional` **durableStrict?**: `boolean`

Defined in: [types.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L58)

#### Inherited from

[`IdempotencyInterceptorOptions`](IdempotencyInterceptorOptions.md).[`durableStrict`](IdempotencyInterceptorOptions.md#durablestrict)

---

### metrics?

> `optional` **metrics?**: [`IdempotencyMetricsSink`](IdempotencyMetricsSink.md)

Defined in: [idempotency.module.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/idempotency.module.ts#L13)

---

### redis?

> `optional` **redis?**: `object`

Defined in: [types.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L54)

#### keyPrefix?

> `optional` **keyPrefix?**: `string`

#### url

> **url**: `string`

#### Inherited from

[`IdempotencyInterceptorOptions`](IdempotencyInterceptorOptions.md).[`redis`](IdempotencyInterceptorOptions.md#redis)

---

### replayKeyHeaderName?

> `optional` **replayKeyHeaderName?**: `string`

Defined in: [types.ts:51](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L51)

#### Inherited from

[`IdempotencyInterceptorOptions`](IdempotencyInterceptorOptions.md).[`replayKeyHeaderName`](IdempotencyInterceptorOptions.md#replaykeyheadername)

---

### replayMarkerHeaderName?

> `optional` **replayMarkerHeaderName?**: `string`

Defined in: [types.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L52)

#### Inherited from

[`IdempotencyInterceptorOptions`](IdempotencyInterceptorOptions.md).[`replayMarkerHeaderName`](IdempotencyInterceptorOptions.md#replaymarkerheadername)

---

### store?

> `optional` **store?**: [`IdempotencyStore`](IdempotencyStore.md)

Defined in: [idempotency.module.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/idempotency.module.ts#L11)

---

### ttlMs?

> `optional` **ttlMs?**: `number`

Defined in: [types.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L53)

#### Inherited from

[`IdempotencyInterceptorOptions`](IdempotencyInterceptorOptions.md).[`ttlMs`](IdempotencyInterceptorOptions.md#ttlms)

---

### waitAttempts?

> `optional` **waitAttempts?**: `number`

Defined in: [types.ts:59](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L59)

#### Inherited from

[`IdempotencyInterceptorOptions`](IdempotencyInterceptorOptions.md).[`waitAttempts`](IdempotencyInterceptorOptions.md#waitattempts)

---

### waitIntervalMs?

> `optional` **waitIntervalMs?**: `number`

Defined in: [types.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L60)

#### Inherited from

[`IdempotencyInterceptorOptions`](IdempotencyInterceptorOptions.md).[`waitIntervalMs`](IdempotencyInterceptorOptions.md#waitintervalms)
