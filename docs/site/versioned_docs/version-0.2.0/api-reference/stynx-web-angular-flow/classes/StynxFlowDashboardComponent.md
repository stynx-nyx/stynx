[**@stynx-web/angular-flow**](../index.md)

---

[@stynx-web/angular-flow](../index.md) / StynxFlowDashboardComponent

# Class: StynxFlowDashboardComponent

Defined in: [analytics.component.ts:192](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L192)

## Implements

- `OnChanges`

## Constructors

### Constructor

> **new StynxFlowDashboardComponent**(): `StynxFlowDashboardComponent`

#### Returns

`StynxFlowDashboardComponent`

## Properties

### errorMessage

> `readonly` **errorMessage**: `WritableSignal`\<`string`\>

Defined in: [analytics.component.ts:198](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L198)

---

### graphId

> **graphId**: `string` = `''`

Defined in: [analytics.component.ts:202](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L202)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [analytics.component.ts:197](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L197)

---

### metrics

> `readonly` **metrics**: `WritableSignal`\<[`FlowDashboardAnalytics`](../interfaces/FlowDashboardAnalytics.md) \| `undefined`\>

Defined in: [analytics.component.ts:196](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L196)

---

### scopeCode

> **scopeCode**: `string` = `''`

Defined in: [analytics.component.ts:201](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L201)

---

### scopeId

> **scopeId**: `string` = `''`

Defined in: [analytics.component.ts:200](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L200)

## Methods

### load()

> **load**(): `Promise`\<`void`\>

Defined in: [analytics.component.ts:208](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L208)

#### Returns

`Promise`\<`void`\>

---

### ngOnChanges()

> **ngOnChanges**(): `Promise`\<`void`\>

Defined in: [analytics.component.ts:204](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L204)

A callback method that is invoked immediately after the
default change detector has checked data-bound properties
if at least one has changed, and before the view and content
children are checked.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnChanges.ngOnChanges`

---

### percent()

> **percent**(`value`): `string`

Defined in: [analytics.component.ts:238](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L238)

#### Parameters

##### value

`number`

#### Returns

`string`
