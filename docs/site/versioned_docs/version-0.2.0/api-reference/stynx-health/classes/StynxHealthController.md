[**@stynx/health**](../index.md)

---

[@stynx/health](../index.md) / StynxHealthController

# Class: StynxHealthController

Defined in: [health.controller.ts:27](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/health.controller.ts#L27)

## Constructors

### Constructor

> **new StynxHealthController**(`healthService`, `metrics`, `options`): `StynxHealthController`

Defined in: [health.controller.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/health.controller.ts#L28)

#### Parameters

##### healthService

[`StynxHealthService`](StynxHealthService.md)

##### metrics

[`StynxMetricsService`](StynxMetricsService.md)

##### options

[`StynxHealthModuleOptions`](../interfaces/StynxHealthModuleOptions.md)

#### Returns

`StynxHealthController`

## Methods

### info()

> **info**(): `object`

Defined in: [health.controller.ts:67](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/health.controller.ts#L67)

#### Returns

`object`

##### status

> **status**: `string` = `'ok'`

---

### liveness()

> **liveness**(): `object`

Defined in: [health.controller.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/health.controller.ts#L36)

#### Returns

`object`

##### status

> **status**: `string` = `'ok'`

---

### metricsEndpoint()

> **metricsEndpoint**(`request`, `response`): `Promise`\<`void`\>

Defined in: [health.controller.ts:55](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/health.controller.ts#L55)

#### Parameters

##### request

[`RequestLike`](../interfaces/RequestLike.md)

##### response

[`ResponseLike`](../interfaces/ResponseLike.md)

#### Returns

`Promise`\<`void`\>

---

### readiness()

> **readiness**(): `Promise`\<[`StynxHealthReadinessResult`](../interfaces/StynxHealthReadinessResult.md)\>

Defined in: [health.controller.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/health.controller.ts#L43)

#### Returns

`Promise`\<[`StynxHealthReadinessResult`](../interfaces/StynxHealthReadinessResult.md)\>
