[**@stynx/health**](../index.md)

---

[@stynx/health](../index.md) / StynxHealthService

# Class: StynxHealthService

Defined in: [health.service.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/health.service.ts#L43)

## Constructors

### Constructor

> **new StynxHealthService**(`options`, `indicators`): `StynxHealthService`

Defined in: [health.service.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/health.service.ts#L46)

#### Parameters

##### options

[`StynxHealthModuleOptions`](../interfaces/StynxHealthModuleOptions.md)

##### indicators

[`StynxHealthIndicator`](../interfaces/StynxHealthIndicator.md)[]

#### Returns

`StynxHealthService`

## Methods

### readiness()

> **readiness**(): `Promise`\<[`StynxHealthReadinessResult`](../interfaces/StynxHealthReadinessResult.md)\>

Defined in: [health.service.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/health.service.ts#L61)

#### Returns

`Promise`\<[`StynxHealthReadinessResult`](../interfaces/StynxHealthReadinessResult.md)\>
