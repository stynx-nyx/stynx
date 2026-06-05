[**@stynx-web/angular-flow**](../index.md)

---

[@stynx-web/angular-flow](../index.md) / StynxFlowRunActivityComponent

# Class: StynxFlowRunActivityComponent

Defined in: [flow-run-activity.component.ts:140](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-run-activity.component.ts#L140)

## Implements

- `OnChanges`

## Constructors

### Constructor

> **new StynxFlowRunActivityComponent**(): `StynxFlowRunActivityComponent`

#### Returns

`StynxFlowRunActivityComponent`

## Properties

### errorMessage

> `readonly` **errorMessage**: `WritableSignal`\<`string`\>

Defined in: [flow-run-activity.component.ts:147](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-run-activity.component.ts#L147)

---

### events

> `readonly` **events**: `WritableSignal`\<[`FlowEvent`](../interfaces/FlowEvent.md)[]\>

Defined in: [flow-run-activity.component.ts:145](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-run-activity.component.ts#L145)

---

### hasNextPage

> `readonly` **hasNextPage**: `WritableSignal`\<`boolean`\>

Defined in: [flow-run-activity.component.ts:148](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-run-activity.component.ts#L148)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [flow-run-activity.component.ts:146](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-run-activity.component.ts#L146)

---

### pageSize

> **pageSize**: `number` = `25`

Defined in: [flow-run-activity.component.ts:151](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-run-activity.component.ts#L151)

---

### runId

> **runId**: `string` = `''`

Defined in: [flow-run-activity.component.ts:150](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-run-activity.component.ts#L150)

---

### selected

> `readonly` **selected**: `EventEmitter`\<[`FlowEvent`](../interfaces/FlowEvent.md)\>

Defined in: [flow-run-activity.component.ts:152](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-run-activity.component.ts#L152)

## Methods

### loadNextPage()

> **loadNextPage**(): `Promise`\<`void`\>

Defined in: [flow-run-activity.component.ts:164](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-run-activity.component.ts#L164)

#### Returns

`Promise`\<`void`\>

---

### ngOnChanges()

> **ngOnChanges**(): `Promise`\<`void`\>

Defined in: [flow-run-activity.component.ts:154](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-run-activity.component.ts#L154)

A callback method that is invoked immediately after the
default change detector has checked data-bound properties
if at least one has changed, and before the view and content
children are checked.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnChanges.ngOnChanges`

---

### refresh()

> **refresh**(): `Promise`\<`void`\>

Defined in: [flow-run-activity.component.ts:159](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-run-activity.component.ts#L159)

#### Returns

`Promise`\<`void`\>
