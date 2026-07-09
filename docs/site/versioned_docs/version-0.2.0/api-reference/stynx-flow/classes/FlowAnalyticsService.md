[**@stynx-nyx/flow**](../index.md)

---

[@stynx-nyx/flow](../index.md) / FlowAnalyticsService

# Class: FlowAnalyticsService

Defined in: [flow-analytics.service.ts:30](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-analytics.service.ts#L30)

## Constructors

### Constructor

> **new FlowAnalyticsService**(`db`): `FlowAnalyticsService`

Defined in: [flow-analytics.service.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-analytics.service.ts#L31)

#### Parameters

##### db

`Database`

#### Returns

`FlowAnalyticsService`

## Methods

### dashboard()

> **dashboard**(`query?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-analytics.service.ts:136](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-analytics.service.ts#L136)

#### Parameters

##### query?

`AnalyticsQuery` = `{}`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### openTasks()

> **openTasks**(`query?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-analytics.service.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-analytics.service.ts#L33)

#### Parameters

##### query?

`AnalyticsQuery` = `{}`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### runsSummary()

> **runsSummary**(`query?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-analytics.service.ts:79](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-analytics.service.ts#L79)

#### Parameters

##### query?

`AnalyticsQuery` = `{}`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>
