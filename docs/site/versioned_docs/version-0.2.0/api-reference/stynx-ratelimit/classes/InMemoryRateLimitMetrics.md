[**@stynx-nyx/ratelimit**](../index.md)

---

[@stynx-nyx/ratelimit](../index.md) / InMemoryRateLimitMetrics

# Class: InMemoryRateLimitMetrics

Defined in: [metrics.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/metrics.ts#L5)

## Implements

- [`RateLimitMetricsSink`](../interfaces/RateLimitMetricsSink.md)

## Constructors

### Constructor

> **new InMemoryRateLimitMetrics**(): `InMemoryRateLimitMetrics`

#### Returns

`InMemoryRateLimitMetrics`

## Methods

### histogramSnapshot()

> **histogramSnapshot**(`buckets?`): `Record`\<`string`, `Record`\<`string`, `number`\>\>

Defined in: [metrics.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/metrics.ts#L33)

#### Parameters

##### buckets?

`number`[] = `DEFAULT_BUCKETS_MS`

#### Returns

`Record`\<`string`, `Record`\<`string`, `number`\>\>

---

### incrementBlocked()

> **incrementBlocked**(`scope`): `void`

Defined in: [metrics.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/metrics.ts#L9)

#### Parameters

##### scope

`string`

#### Returns

`void`

#### Implementation of

[`RateLimitMetricsSink`](../interfaces/RateLimitMetricsSink.md).[`incrementBlocked`](../interfaces/RateLimitMetricsSink.md#incrementblocked)

---

### latencyPercentile()

> **latencyPercentile**(`scope`, `pct`): `number` \| `undefined`

Defined in: [metrics.ts:23](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/metrics.ts#L23)

#### Parameters

##### scope

`string`

##### pct

`50` \| `95` \| `99`

#### Returns

`number` \| `undefined`

---

### recordLatency()

> **recordLatency**(`scope`, `elapsedMs`): `void`

Defined in: [metrics.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/metrics.ts#L13)

#### Parameters

##### scope

`string`

##### elapsedMs

`number`

#### Returns

`void`

#### Implementation of

[`RateLimitMetricsSink`](../interfaces/RateLimitMetricsSink.md).[`recordLatency`](../interfaces/RateLimitMetricsSink.md#recordlatency)

---

### snapshot()

> **snapshot**(): `Record`\<`string`, `number`\>

Defined in: [metrics.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/metrics.ts#L19)

#### Returns

`Record`\<`string`, `number`\>
