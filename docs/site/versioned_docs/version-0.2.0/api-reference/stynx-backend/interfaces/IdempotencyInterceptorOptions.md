[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / IdempotencyInterceptorOptions

# Interface: IdempotencyInterceptorOptions

Defined in: [packages/idempotency/src/types.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L49)

## Extended by

- [`StynxIdempotencyModuleOptions`](StynxIdempotencyModuleOptions.md)

## Properties

### defaultHeaderName?

> `optional` **defaultHeaderName?**: `string`

Defined in: [packages/idempotency/src/types.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L50)

---

### durableStrict?

> `optional` **durableStrict?**: `boolean`

Defined in: [packages/idempotency/src/types.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L58)

---

### redis?

> `optional` **redis?**: `object`

Defined in: [packages/idempotency/src/types.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L54)

#### keyPrefix?

> `optional` **keyPrefix?**: `string`

#### url

> **url**: `string`

---

### replayKeyHeaderName?

> `optional` **replayKeyHeaderName?**: `string`

Defined in: [packages/idempotency/src/types.ts:51](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L51)

---

### replayMarkerHeaderName?

> `optional` **replayMarkerHeaderName?**: `string`

Defined in: [packages/idempotency/src/types.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L52)

---

### ttlMs?

> `optional` **ttlMs?**: `number`

Defined in: [packages/idempotency/src/types.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L53)

---

### waitAttempts?

> `optional` **waitAttempts?**: `number`

Defined in: [packages/idempotency/src/types.ts:59](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L59)

---

### waitIntervalMs?

> `optional` **waitIntervalMs?**: `number`

Defined in: [packages/idempotency/src/types.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L60)
