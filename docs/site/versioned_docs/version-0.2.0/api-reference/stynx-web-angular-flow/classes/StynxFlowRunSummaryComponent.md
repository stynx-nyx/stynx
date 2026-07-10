[**@stynx-nyx/angular-flow**](../index.md)

---

[@stynx-nyx/angular-flow](../index.md) / StynxFlowRunSummaryComponent

# Class: StynxFlowRunSummaryComponent

Defined in: [analytics.component.ts:85](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L85)

## Implements

- `OnInit`

## Constructors

### Constructor

> **new StynxFlowRunSummaryComponent**(): `StynxFlowRunSummaryComponent`

#### Returns

`StynxFlowRunSummaryComponent`

## Properties

### errorMessage

> **errorMessage**: `string` = `''`

Defined in: [analytics.component.ts:90](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L90)

---

### loading

> **loading**: `boolean` = `false`

Defined in: [analytics.component.ts:89](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L89)

---

### summaries

> **summaries**: [`FlowRunSummary`](../interfaces/FlowRunSummary.md)[] = `[]`

Defined in: [analytics.component.ts:88](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L88)

## Methods

### load()

> **load**(): `Promise`\<`void`\>

Defined in: [analytics.component.ts:96](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L96)

#### Returns

`Promise`\<`void`\>

---

### ngOnInit()

> **ngOnInit**(): `Promise`\<`void`\>

Defined in: [analytics.component.ts:92](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L92)

A callback method that is invoked immediately after the
default change detector has checked the directive's
data-bound properties for the first time,
and before any of the view or content children have been checked.
It is invoked only once when the directive is instantiated.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnInit.ngOnInit`
