[**@stynx-nyx/angular-flow**](../index.md)

---

[@stynx-nyx/angular-flow](../index.md) / StynxFlowTaskListComponent

# Class: StynxFlowTaskListComponent

Defined in: [flow-tasks.component.ts:77](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L77)

## Implements

- `OnChanges`

## Constructors

### Constructor

> **new StynxFlowTaskListComponent**(): `StynxFlowTaskListComponent`

#### Returns

`StynxFlowTaskListComponent`

## Properties

### act

> `readonly` **act**: `EventEmitter`\<\{ `action`: `string`; `task`: [`FlowTask`](../interfaces/FlowTask.md); \}\>

Defined in: [flow-tasks.component.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L82)

---

### assign

> `readonly` **assign**: `EventEmitter`\<[`FlowTask`](../interfaces/FlowTask.md)\>

Defined in: [flow-tasks.component.ts:83](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L83)

---

### errorMessage

> **errorMessage**: `string` = `''`

Defined in: [flow-tasks.component.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L87)

---

### loading

> **loading**: `boolean` = `false`

Defined in: [flow-tasks.component.ts:86](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L86)

---

### mine

> **mine**: `boolean` = `false`

Defined in: [flow-tasks.component.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L80)

---

### status

> **status**: `string` = `'open'`

Defined in: [flow-tasks.component.ts:81](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L81)

---

### tasks

> **tasks**: [`FlowTask`](../interfaces/FlowTask.md)[] = `[]`

Defined in: [flow-tasks.component.ts:85](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L85)

## Methods

### load()

> **load**(): `Promise`\<`void`\>

Defined in: [flow-tasks.component.ts:93](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L93)

#### Returns

`Promise`\<`void`\>

---

### ngOnChanges()

> **ngOnChanges**(): `Promise`\<`void`\>

Defined in: [flow-tasks.component.ts:89](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L89)

A callback method that is invoked immediately after the
default change detector has checked data-bound properties
if at least one has changed, and before the view and content
children are checked.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnChanges.ngOnChanges`
