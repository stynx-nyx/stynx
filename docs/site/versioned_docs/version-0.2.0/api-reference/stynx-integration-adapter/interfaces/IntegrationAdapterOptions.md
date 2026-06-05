[**@stynx/integration-adapter**](../index.md)

---

[@stynx/integration-adapter](../index.md) / IntegrationAdapterOptions

# Interface: IntegrationAdapterOptions\<TReq, TRaw, TRes\>

Defined in: [types.ts:59](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L59)

## Type Parameters

### TReq

`TReq`

### TRaw

`TRaw`

### TRes

`TRes`

## Properties

### circuitBreaker?

> `optional` **circuitBreaker?**: [`CircuitBreaker`](CircuitBreaker.md)

Defined in: [types.ts:67](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L67)

---

### circuitBreakerKey?

> `optional` **circuitBreakerKey?**: (`input`, `context`) => `string` \| `undefined`

Defined in: [types.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L66)

#### Parameters

##### input

`TReq`

##### context

[`IntegrationContext`](IntegrationContext.md)

#### Returns

`string` \| `undefined`

---

### idempotencyKey?

> `optional` **idempotencyKey?**: (`input`, `context`) => `string` \| `undefined`

Defined in: [types.ts:63](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L63)

#### Parameters

##### input

`TReq`

##### context

[`IntegrationContext`](IntegrationContext.md)

#### Returns

`string` \| `undefined`

---

### idempotencyStore?

> `optional` **idempotencyStore?**: [`IdempotencyStore`](IdempotencyStore.md)\<`TRes`\>

Defined in: [types.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L68)

---

### name

> **name**: `string`

Defined in: [types.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L60)

---

### now?

> `optional` **now?**: () => `number`

Defined in: [types.ts:71](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L71)

#### Returns

`number`

---

### parseResponse

> **parseResponse**: (`raw`, `input`, `context`) => `TRes` \| `Promise`\<`TRes`\>

Defined in: [types.ts:62](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L62)

#### Parameters

##### raw

`TRaw`

##### input

`TReq`

##### context

[`IntegrationContext`](IntegrationContext.md)

#### Returns

`TRes` \| `Promise`\<`TRes`\>

---

### request

> **request**: (`input`, `context`) => `Promise`\<`TRaw`\>

Defined in: [types.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L61)

#### Parameters

##### input

`TReq`

##### context

[`IntegrationContext`](IntegrationContext.md)

#### Returns

`Promise`\<`TRaw`\>

---

### retryPolicy?

> `optional` **retryPolicy?**: [`RetryPolicy`](RetryPolicy.md)

Defined in: [types.ts:64](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L64)

---

### sleep?

> `optional` **sleep?**: (`ms`) => `Promise`\<`void`\>

Defined in: [types.ts:70](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L70)

#### Parameters

##### ms

`number`

#### Returns

`Promise`\<`void`\>

---

### telemetry?

> `optional` **telemetry?**: [`IntegrationTelemetry`](IntegrationTelemetry.md)

Defined in: [types.ts:69](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L69)

---

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [types.ts:65](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/types.ts#L65)
