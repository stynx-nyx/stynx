[**@stynx-nyx/angular-flow**](../index.md)

---

[@stynx-nyx/angular-flow](../index.md) / StynxFlowFillsComponent

# Class: StynxFlowFillsComponent

Defined in: [flow-fills.component.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L41)

## Implements

- `OnChanges`

## Constructors

### Constructor

> **new StynxFlowFillsComponent**(): `StynxFlowFillsComponent`

#### Returns

`StynxFlowFillsComponent`

## Properties

### create

> `readonly` **create**: `EventEmitter`\<`void`\>

Defined in: [flow-fills.component.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L47)

---

### errorMessage

> **errorMessage**: `string` = `''`

Defined in: [flow-fills.component.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L52)

---

### fills

> **fills**: [`FlowFill`](../interfaces/FlowFill.md)[] = `[]`

Defined in: [flow-fills.component.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L50)

---

### formId

> **formId**: `string` = `''`

Defined in: [flow-fills.component.ts:44](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L44)

---

### loading

> **loading**: `boolean` = `false`

Defined in: [flow-fills.component.ts:51](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L51)

---

### selected

> `readonly` **selected**: `EventEmitter`\<[`FlowFill`](../interfaces/FlowFill.md)\>

Defined in: [flow-fills.component.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L48)

---

### targetId

> **targetId**: `string` = `''`

Defined in: [flow-fills.component.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L46)

---

### targetType

> **targetType**: `string` = `''`

Defined in: [flow-fills.component.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L45)

## Methods

### load()

> **load**(): `Promise`\<`void`\>

Defined in: [flow-fills.component.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L58)

#### Returns

`Promise`\<`void`\>

---

### ngOnChanges()

> **ngOnChanges**(): `Promise`\<`void`\>

Defined in: [flow-fills.component.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L54)

A callback method that is invoked immediately after the
default change detector has checked data-bound properties
if at least one has changed, and before the view and content
children are checked.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnChanges.ngOnChanges`
