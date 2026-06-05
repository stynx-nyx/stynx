[**@stynx/integration-adapter**](../index.md)

---

[@stynx/integration-adapter](../index.md) / RetryPolicy

# Interface: RetryPolicy

Defined in: [types.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L9)

## Properties

### baseDelayMs

> **baseDelayMs**: `number`

Defined in: [types.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L11)

---

### jitterRatio?

> `optional` **jitterRatio?**: `number`

Defined in: [types.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L13)

---

### maxAttempts

> **maxAttempts**: `number`

Defined in: [types.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L10)

---

### maxDelayMs?

> `optional` **maxDelayMs?**: `number`

Defined in: [types.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L12)

---

### retryable?

> `optional` **retryable?**: (`error`, `attempt`) => `boolean`

Defined in: [types.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L14)

#### Parameters

##### error

`unknown`

##### attempt

`number`

#### Returns

`boolean`
