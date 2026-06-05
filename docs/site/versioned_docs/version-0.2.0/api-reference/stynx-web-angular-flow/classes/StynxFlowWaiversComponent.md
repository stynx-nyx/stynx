[**@stynx-web/angular-flow**](../index.md)

---

[@stynx-web/angular-flow](../index.md) / StynxFlowWaiversComponent

# Class: StynxFlowWaiversComponent

Defined in: [flow-waivers.component.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-waivers.component.ts#L39)

## Implements

- `OnChanges`

## Constructors

### Constructor

> **new StynxFlowWaiversComponent**(): `StynxFlowWaiversComponent`

#### Returns

`StynxFlowWaiversComponent`

## Properties

### create

> `readonly` **create**: `EventEmitter`\<`void`\>

Defined in: [flow-waivers.component.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-waivers.component.ts#L45)

---

### errorMessage

> **errorMessage**: `string` = `''`

Defined in: [flow-waivers.component.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-waivers.component.ts#L50)

---

### loading

> **loading**: `boolean` = `false`

Defined in: [flow-waivers.component.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-waivers.component.ts#L49)

---

### scopeId

> **scopeId**: `string` = `''`

Defined in: [flow-waivers.component.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-waivers.component.ts#L42)

---

### selected

> `readonly` **selected**: `EventEmitter`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)\>

Defined in: [flow-waivers.component.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-waivers.component.ts#L46)

---

### targetId

> **targetId**: `string` = `''`

Defined in: [flow-waivers.component.ts:44](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-waivers.component.ts#L44)

---

### targetType

> **targetType**: `string` = `''`

Defined in: [flow-waivers.component.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-waivers.component.ts#L43)

---

### waivers

> **waivers**: [`FlowWaiver`](../interfaces/FlowWaiver.md)[] = `[]`

Defined in: [flow-waivers.component.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-waivers.component.ts#L48)

## Methods

### load()

> **load**(): `Promise`\<`void`\>

Defined in: [flow-waivers.component.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-waivers.component.ts#L56)

#### Returns

`Promise`\<`void`\>

---

### ngOnChanges()

> **ngOnChanges**(): `Promise`\<`void`\>

Defined in: [flow-waivers.component.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-waivers.component.ts#L52)

A callback method that is invoked immediately after the
default change detector has checked data-bound properties
if at least one has changed, and before the view and content
children are checked.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnChanges.ngOnChanges`
