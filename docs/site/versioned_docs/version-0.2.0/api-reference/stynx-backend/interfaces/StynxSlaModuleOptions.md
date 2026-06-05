[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / StynxSlaModuleOptions

# Interface: StynxSlaModuleOptions

Defined in: [packages/backend/src/sla/sla.module.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/sla.module.ts#L16)

## Extends

- [`SlaMonitorInterceptorOptions`](SlaMonitorInterceptorOptions.md)

## Properties

### aggregateEvery?

> `optional` **aggregateEvery?**: `number`

Defined in: [packages/backend/src/sla/types.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/types.ts#L36)

#### Inherited from

[`SlaMonitorInterceptorOptions`](SlaMonitorInterceptorOptions.md).[`aggregateEvery`](SlaMonitorInterceptorOptions.md#aggregateevery)

---

### categoryResolver?

> `optional` **categoryResolver?**: [`SlaCategoryResolver`](SlaCategoryResolver.md)

Defined in: [packages/backend/src/sla/sla.module.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/sla.module.ts#L17)

---

### sink?

> `optional` **sink?**: [`SlaEventSink`](SlaEventSink.md)

Defined in: [packages/backend/src/sla/sla.module.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/sla.module.ts#L18)

---

### thresholdsMs?

> `optional` **thresholdsMs?**: `Record`\<`string`, `number`\>

Defined in: [packages/backend/src/sla/types.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/types.ts#L35)

#### Inherited from

[`SlaMonitorInterceptorOptions`](SlaMonitorInterceptorOptions.md).[`thresholdsMs`](SlaMonitorInterceptorOptions.md#thresholdsms)

---

### windowSize?

> `optional` **windowSize?**: `number`

Defined in: [packages/backend/src/sla/types.ts:37](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/types.ts#L37)

#### Inherited from

[`SlaMonitorInterceptorOptions`](SlaMonitorInterceptorOptions.md).[`windowSize`](SlaMonitorInterceptorOptions.md#windowsize)
