[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / InMemoryIdempotencyMetrics

# Class: InMemoryIdempotencyMetrics

Defined in: [packages/idempotency/src/metrics.ts:3](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/metrics.ts#L3)

## Implements

- [`IdempotencyMetricsSink`](../interfaces/IdempotencyMetricsSink.md)

## Constructors

### Constructor

> **new InMemoryIdempotencyMetrics**(): `InMemoryIdempotencyMetrics`

#### Returns

`InMemoryIdempotencyMetrics`

## Methods

### incrementReplay()

> **incrementReplay**(): `void`

Defined in: [packages/idempotency/src/metrics.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/metrics.ts#L6)

#### Returns

`void`

#### Implementation of

[`IdempotencyMetricsSink`](../interfaces/IdempotencyMetricsSink.md).[`incrementReplay`](../interfaces/IdempotencyMetricsSink.md#incrementreplay)

---

### snapshot()

> **snapshot**(): `object`

Defined in: [packages/idempotency/src/metrics.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/metrics.ts#L10)

#### Returns

`object`

##### replayCount

> **replayCount**: `number`
