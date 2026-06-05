[**@stynx-web/angular-flow**](../index.md)

---

[@stynx-web/angular-flow](../index.md) / StynxFlowFormsComponent

# Class: StynxFlowFormsComponent

Defined in: [flow-forms.component.ts:77](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-forms.component.ts#L77)

## Implements

- `OnChanges`

## Constructors

### Constructor

> **new StynxFlowFormsComponent**(): `StynxFlowFormsComponent`

#### Returns

`StynxFlowFormsComponent`

## Properties

### create

> `readonly` **create**: `EventEmitter`\<`void`\>

Defined in: [flow-forms.component.ts:81](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-forms.component.ts#L81)

---

### errorMessage

> **errorMessage**: `string` = `''`

Defined in: [flow-forms.component.ts:86](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-forms.component.ts#L86)

---

### forms

> **forms**: [`FlowForm`](../interfaces/FlowForm.md)[] = `[]`

Defined in: [flow-forms.component.ts:84](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-forms.component.ts#L84)

---

### loading

> **loading**: `boolean` = `false`

Defined in: [flow-forms.component.ts:85](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-forms.component.ts#L85)

---

### scopeId

> **scopeId**: `string` = `''`

Defined in: [flow-forms.component.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-forms.component.ts#L80)

---

### selected

> `readonly` **selected**: `EventEmitter`\<[`FlowForm`](../interfaces/FlowForm.md)\>

Defined in: [flow-forms.component.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-forms.component.ts#L82)

## Methods

### load()

> **load**(): `Promise`\<`void`\>

Defined in: [flow-forms.component.ts:92](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-forms.component.ts#L92)

#### Returns

`Promise`\<`void`\>

---

### ngOnChanges()

> **ngOnChanges**(): `Promise`\<`void`\>

Defined in: [flow-forms.component.ts:88](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-forms.component.ts#L88)

A callback method that is invoked immediately after the
default change detector has checked data-bound properties
if at least one has changed, and before the view and content
children are checked.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnChanges.ngOnChanges`
