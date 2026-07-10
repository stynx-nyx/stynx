[**@stynx-nyx/angular-flow**](../index.md)

---

[@stynx-nyx/angular-flow](../index.md) / StynxFlowFillEditorComponent

# Class: StynxFlowFillEditorComponent

Defined in: [flow-fills.component.ts:221](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L221)

## Implements

- `OnChanges`

## Constructors

### Constructor

> **new StynxFlowFillEditorComponent**(): `StynxFlowFillEditorComponent`

#### Returns

`StynxFlowFillEditorComponent`

## Properties

### answer

> `readonly` **answer**: `EventEmitter`\<`Partial`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)\>\>

Defined in: [flow-fills.component.ts:226](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L226)

---

### answers

> **answers**: [`FlowAnswer`](../interfaces/FlowAnswer.md)[] = `[]`

Defined in: [flow-fills.component.ts:224](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L224)

---

### fill

> **fill**: `Partial`\<[`FlowFill`](../interfaces/FlowFill.md)\> \| `undefined`

Defined in: [flow-fills.component.ts:222](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L222)

---

### questions

> **questions**: [`FlowQuestion`](../interfaces/FlowQuestion.md)[] = `[]`

Defined in: [flow-fills.component.ts:223](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L223)

---

### saveAnswers

> `readonly` **saveAnswers**: `EventEmitter`\<`Partial`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)\>[]\>

Defined in: [flow-fills.component.ts:227](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L227)

---

### submitted

> `readonly` **submitted**: `EventEmitter`\<`Partial`\<[`FlowFill`](../interfaces/FlowFill.md)\>\>

Defined in: [flow-fills.component.ts:225](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L225)

---

### waiveQuestion

> `readonly` **waiveQuestion**: `EventEmitter`\<[`FlowQuestion`](../interfaces/FlowQuestion.md)\>

Defined in: [flow-fills.component.ts:228](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L228)

## Methods

### answerFor()

> **answerFor**(`questionId`): [`FlowAnswer`](../interfaces/FlowAnswer.md) \| `undefined`

Defined in: [flow-fills.component.ts:238](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L238)

#### Parameters

##### questionId

`string`

#### Returns

[`FlowAnswer`](../interfaces/FlowAnswer.md) \| `undefined`

---

### beginSignature()

> **beginSignature**(`question`, `event`): `void`

Defined in: [flow-fills.component.ts:311](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L311)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

##### event

`PointerEvent`

#### Returns

`void`

---

### booleanValue()

> **booleanValue**(`question`): `boolean`

Defined in: [flow-fills.component.ts:254](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L254)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

#### Returns

`boolean`

---

### clearSignature()

> **clearSignature**(`question`, `event`): `void`

Defined in: [flow-fills.component.ts:333](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L333)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

##### event

`Event`

#### Returns

`void`

---

### dateValue()

> **dateValue**(`question`): `string`

Defined in: [flow-fills.component.ts:263](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L263)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

#### Returns

`string`

---

### drawSignature()

> **drawSignature**(`question`, `event`): `void`

Defined in: [flow-fills.component.ts:316](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L316)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

##### event

`PointerEvent`

#### Returns

`void`

---

### endSignature()

> **endSignature**(`question`, `event`): `void`

Defined in: [flow-fills.component.ts:323](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L323)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

##### event

`PointerEvent`

#### Returns

`void`

---

### fileCollection()

> **fileCollection**(`question`): `string`

Defined in: [flow-fills.component.ts:306](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L306)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

#### Returns

`string`

---

### isLongText()

> **isLongText**(`question`): `boolean`

Defined in: [flow-fills.component.ts:280](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L280)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

#### Returns

`boolean`

---

### isQuestionVisible()

> **isQuestionVisible**(`question`): `boolean`

Defined in: [flow-fills.component.ts:268](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L268)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

#### Returns

`boolean`

---

### isSelected()

> **isSelected**(`question`, `optionValue`): `boolean`

Defined in: [flow-fills.component.ts:346](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L346)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

##### optionValue

`unknown`

#### Returns

`boolean`

---

### ngOnChanges()

> **ngOnChanges**(): `void`

Defined in: [flow-fills.component.ts:233](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L233)

A callback method that is invoked immediately after the
default change detector has checked data-bound properties
if at least one has changed, and before the view and content
children are checked.

#### Returns

`void`

#### Implementation of

`OnChanges.ngOnChanges`

---

### numberValue()

> **numberValue**(`question`): `string`

Defined in: [flow-fills.component.ts:258](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L258)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

#### Returns

`string`

---

### optionKey()

> **optionKey**(`value`): `string`

Defined in: [flow-fills.component.ts:459](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L459)

#### Parameters

##### value

`unknown`

#### Returns

`string`

---

### optionValueFromKey()

> **optionValueFromKey**(`question`, `key`): `unknown`

Defined in: [flow-fills.component.ts:455](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L455)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

##### key

`string`

#### Returns

`unknown`

---

### questionOptions()

> **questionOptions**(`question`): `object`[]

Defined in: [flow-fills.component.ts:354](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L354)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

#### Returns

`object`[]

---

### questionTextMaxLength()

> **questionTextMaxLength**(`question`): `number`

Defined in: [flow-fills.component.ts:285](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L285)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

#### Returns

`number`

---

### saveAllAnswers()

> **saveAllAnswers**(): `void`

Defined in: [flow-fills.component.ts:369](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L369)

#### Returns

`void`

---

### setFileAnswer()

> **setFileAnswer**(`question`, `event`): `void`

Defined in: [flow-fills.component.ts:302](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L302)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

##### event

`StynxDocumentUploadCompletedEvent`

#### Returns

`void`

---

### setMultiselectValue()

> **setMultiselectValue**(`question`, `selectedOptions`): `void`

Defined in: [flow-fills.component.ts:342](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L342)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

##### selectedOptions

`HTMLCollectionOf`\<`HTMLOptionElement`\>

#### Returns

`void`

---

### setValue()

> **setValue**(`question`, `value`): `void`

Defined in: [flow-fills.component.ts:293](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L293)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

##### value

`unknown`

#### Returns

`void`

---

### textValue()

> **textValue**(`question`): `string`

Defined in: [flow-fills.component.ts:249](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L249)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

#### Returns

`string`

---

### valueFor()

> **valueFor**(`question`): `unknown`

Defined in: [flow-fills.component.ts:242](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-fills.component.ts#L242)

#### Parameters

##### question

[`FlowQuestion`](../interfaces/FlowQuestion.md)

#### Returns

`unknown`
