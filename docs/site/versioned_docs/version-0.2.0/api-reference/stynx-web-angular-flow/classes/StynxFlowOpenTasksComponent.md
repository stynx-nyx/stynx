[**@stynx-nyx/angular-flow**](../index.md)

---

[@stynx-nyx/angular-flow](../index.md) / StynxFlowOpenTasksComponent

# Class: StynxFlowOpenTasksComponent

Defined in: [analytics.component.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L34)

## Implements

- `OnInit`

## Constructors

### Constructor

> **new StynxFlowOpenTasksComponent**(): `StynxFlowOpenTasksComponent`

#### Returns

`StynxFlowOpenTasksComponent`

## Properties

### errorMessage

> **errorMessage**: `string` = `''`

Defined in: [analytics.component.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L39)

---

### loading

> **loading**: `boolean` = `false`

Defined in: [analytics.component.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L38)

---

### tasks

> **tasks**: [`FlowOpenTask`](../interfaces/FlowOpenTask.md)[] = `[]`

Defined in: [analytics.component.ts:37](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L37)

## Methods

### load()

> **load**(): `Promise`\<`void`\>

Defined in: [analytics.component.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L45)

#### Returns

`Promise`\<`void`\>

---

### ngOnInit()

> **ngOnInit**(): `Promise`\<`void`\>

Defined in: [analytics.component.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/analytics.component.ts#L41)

A callback method that is invoked immediately after the
default change detector has checked the directive's
data-bound properties for the first time,
and before any of the view or content children have been checked.
It is invoked only once when the directive is instantiated.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnInit.ngOnInit`
