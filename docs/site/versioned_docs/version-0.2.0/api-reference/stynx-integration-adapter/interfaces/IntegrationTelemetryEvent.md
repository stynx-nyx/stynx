[**@stynx/integration-adapter**](../index.md)

---

[@stynx/integration-adapter](../index.md) / IntegrationTelemetryEvent

# Interface: IntegrationTelemetryEvent

Defined in: [types.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L32)

## Properties

### adapter

> **adapter**: `string`

Defined in: [types.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L33)

---

### attempt

> **attempt**: `number`

Defined in: [types.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L35)

---

### circuitBreakerKey?

> `optional` **circuitBreakerKey?**: `string`

Defined in: [types.ts:37](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L37)

---

### context

> **context**: [`IntegrationContext`](IntegrationContext.md)

Defined in: [types.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L40)

---

### durationMs?

> `optional` **durationMs?**: `number`

Defined in: [types.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L38)

---

### error?

> `optional` **error?**: `unknown`

Defined in: [types.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L39)

---

### idempotencyKey?

> `optional` **idempotencyKey?**: `string`

Defined in: [types.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L36)

---

### phase

> **phase**: `"start"` \| `"success"` \| `"retry"` \| `"failure"` \| `"circuit-open"` \| `"idempotency-hit"`

Defined in: [types.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L34)
