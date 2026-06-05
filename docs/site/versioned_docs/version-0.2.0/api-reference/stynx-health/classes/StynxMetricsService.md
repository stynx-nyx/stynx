[**@stynx/health**](../index.md)

---

[@stynx/health](../index.md) / StynxMetricsService

# Class: StynxMetricsService

Defined in: [metrics.service.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L11)

## Constructors

### Constructor

> **new StynxMetricsService**(): `StynxMetricsService`

Defined in: [metrics.service.ts:120](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L120)

#### Returns

`StynxMetricsService`

## Properties

### archiveSizeBytes

> `readonly` **archiveSizeBytes**: `Gauge`\<`"table"`\>

Defined in: [metrics.service.ts:108](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L108)

---

### auditEventsTotal

> `readonly` **auditEventsTotal**: `Counter`\<`"entity"` \| `"operation"`\>

Defined in: [metrics.service.ts:37](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L37)

---

### authzDenyTotal

> `readonly` **authzDenyTotal**: `Counter`\<`"reason"`\>

Defined in: [metrics.service.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L61)

---

### dbPoolIdle

> `readonly` **dbPoolIdle**: `Gauge`\<`"role"`\>

Defined in: [metrics.service.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L49)

---

### dbPoolInUse

> `readonly` **dbPoolInUse**: `Gauge`\<`"role"`\>

Defined in: [metrics.service.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L43)

---

### dbPoolWaiting

> `readonly` **dbPoolWaiting**: `Gauge`\<`"role"`\>

Defined in: [metrics.service.ts:55](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L55)

---

### dbQueryDuration

> `readonly` **dbQueryDuration**: `Histogram`\<`"op"`\>

Defined in: [metrics.service.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L31)

---

### hardDeleteTotal

> `readonly` **hardDeleteTotal**: `Counter`\<`"table"`\>

Defined in: [metrics.service.ts:90](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L90)

---

### httpRequestDuration

> `readonly` **httpRequestDuration**: `Histogram`\<`"method"` \| `"route"` \| `"status"` \| `"tenant_tier"`\>

Defined in: [metrics.service.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L13)

---

### httpRequestsTotal

> `readonly` **httpRequestsTotal**: `Counter`\<`"method"` \| `"route"` \| `"status"` \| `"tenant_tier"`\>

Defined in: [metrics.service.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L25)

---

### httpRequestTotal

> `readonly` **httpRequestTotal**: `Counter`\<`"method"` \| `"route"` \| `"status"` \| `"tenant_tier"`\>

Defined in: [metrics.service.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L19)

---

### idempotencyReplayTotal

> `readonly` **idempotencyReplayTotal**: `Counter`\<`string`\>

Defined in: [metrics.service.ts:73](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L73)

---

### lgpdErasureTotal

> `readonly` **lgpdErasureTotal**: `Counter`\<`"table"` \| `"strategy"`\>

Defined in: [metrics.service.ts:102](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L102)

---

### rateLimitBlockTotal

> `readonly` **rateLimitBlockTotal**: `Counter`\<`"scope"`\>

Defined in: [metrics.service.ts:67](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L67)

---

### registry

> `readonly` **registry**: `Registry`\<`"text/plain; version=0.0.4; charset=utf-8"`\>

Defined in: [metrics.service.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L12)

---

### restoreTotal

> `readonly` **restoreTotal**: `Counter`\<`"table"`\>

Defined in: [metrics.service.ts:96](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L96)

---

### sessionActiveTotal

> `readonly` **sessionActiveTotal**: `Gauge`\<`string`\>

Defined in: [metrics.service.ts:114](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L114)

---

### softDeleteTotal

> `readonly` **softDeleteTotal**: `Counter`\<`"table"`\>

Defined in: [metrics.service.ts:84](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L84)

---

### storagePresignTotal

> `readonly` **storagePresignTotal**: `Counter`\<`"op"`\>

Defined in: [metrics.service.ts:78](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L78)

## Methods

### render()

> **render**(): `Promise`\<`string`\>

Defined in: [metrics.service.ts:130](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/metrics.service.ts#L130)

#### Returns

`Promise`\<`string`\>
