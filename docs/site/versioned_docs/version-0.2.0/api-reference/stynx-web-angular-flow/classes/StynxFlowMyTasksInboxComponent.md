[**@stynx-web/angular-flow**](../index.md)

---

[@stynx-web/angular-flow](../index.md) / StynxFlowMyTasksInboxComponent

# Class: StynxFlowMyTasksInboxComponent

Defined in: [flow-tasks.component.ts:141](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L141)

## Implements

- `OnInit`

## Constructors

### Constructor

> **new StynxFlowMyTasksInboxComponent**(): `StynxFlowMyTasksInboxComponent`

#### Returns

`StynxFlowMyTasksInboxComponent`

## Properties

### act

> `readonly` **act**: `EventEmitter`\<\{ `action`: `string`; `task`: [`FlowTask`](../interfaces/FlowTask.md); \}\>

Defined in: [flow-tasks.component.ts:164](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L164)

---

### assign

> `readonly` **assign**: `EventEmitter`\<[`FlowTask`](../interfaces/FlowTask.md)\>

Defined in: [flow-tasks.component.ts:165](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L165)

---

### errorMessage

> `readonly` **errorMessage**: `WritableSignal`\<`string`\>

Defined in: [flow-tasks.component.ts:152](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L152)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [flow-tasks.component.ts:151](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L151)

---

### tasks

> `readonly` **tasks**: `WritableSignal`\<[`FlowTask`](../interfaces/FlowTask.md)[]\>

Defined in: [flow-tasks.component.ts:150](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L150)

## Accessors

### pollingIntervalMs

#### Get Signature

> **get** **pollingIntervalMs**(): `number`

Defined in: [flow-tasks.component.ts:160](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L160)

##### Returns

`number`

#### Set Signature

> **set** **pollingIntervalMs**(`value`): `void`

Defined in: [flow-tasks.component.ts:155](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L155)

##### Parameters

###### value

`string` \| `number` \| `null` \| `undefined`

##### Returns

`void`

## Methods

### ngOnInit()

> **ngOnInit**(): `void`

Defined in: [flow-tasks.component.ts:167](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L167)

A callback method that is invoked immediately after the
default change detector has checked the directive's
data-bound properties for the first time,
and before any of the view or content children have been checked.
It is invoked only once when the directive is instantiated.

#### Returns

`void`

#### Implementation of

`OnInit.ngOnInit`

---

### refresh()

> **refresh**(): `Promise`\<`void`\>

Defined in: [flow-tasks.component.ts:179](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-tasks.component.ts#L179)

#### Returns

`Promise`\<`void`\>
