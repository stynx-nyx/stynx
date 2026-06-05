[**@stynx/flow**](../index.md)

---

[@stynx/flow](../index.md) / FlowFormsService

# Class: FlowFormsService

Defined in: [flow-forms.service.ts:135](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L135)

## Constructors

### Constructor

> **new FlowFormsService**(`db`, `requestContext`): `FlowFormsService`

Defined in: [flow-forms.service.ts:136](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L136)

#### Parameters

##### db

`Database`

##### requestContext

`RequestContext`

#### Returns

`FlowFormsService`

## Methods

### bulkUpsertAnswers()

> **bulkUpsertAnswers**(`fillId`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-forms.service.ts:305](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L305)

#### Parameters

##### fillId

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### createFill()

> **createFill**(`formId`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:267](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L267)

#### Parameters

##### formId

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### createFillFromBody()

> **createFillFromBody**(`input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:271](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L271)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### createFillWaiver()

> **createFillWaiver**(`fillId`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:365](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L365)

#### Parameters

##### fillId

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### createForm()

> **createForm**(`input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:149](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L149)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### createFormFillWaiver()

> **createFormFillWaiver**(`formId`, `fillId`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:396](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L396)

#### Parameters

##### formId

`string`

##### fillId

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### createQuestion()

> **createQuestion**(`formId`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:169](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L169)

#### Parameters

##### formId

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### createWaiver()

> **createWaiver**(`input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:353](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L353)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### deleteAnswer()

> **deleteAnswer**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:332](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L332)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### deleteFill()

> **deleteFill**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:281](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L281)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### deleteForm()

> **deleteForm**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:157](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L157)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### deleteQuestion()

> **deleteQuestion**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:177](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L177)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### deleteQuestionScore()

> **deleteQuestionScore**(`questionId`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:228](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L228)

#### Parameters

##### questionId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### deleteWaiver()

> **deleteWaiver**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:361](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L361)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### getFill()

> **getFill**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:255](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L255)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### getForm()

> **getForm**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:145](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L145)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### getFormFill()

> **getFormFill**(`formId`, `fillId`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:259](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L259)

#### Parameters

##### formId

`string`

##### fillId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### getQuestion()

> **getQuestion**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:165](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L165)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### getQuestionScore()

> **getQuestionScore**(`questionId`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:181](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L181)

#### Parameters

##### questionId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### listAnswers()

> **listAnswers**(`fillId`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-forms.service.ts:285](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L285)

#### Parameters

##### fillId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### listFills()

> **listFills**(`query?`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-forms.service.ts:233](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L233)

#### Parameters

##### query?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### listFillWaivers()

> **listFillWaivers**(`fillId`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-forms.service.ts:376](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L376)

#### Parameters

##### fillId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### listFormFillAnswers()

> **listFormFillAnswers**(`formId`, `fillId`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-forms.service.ts:289](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L289)

#### Parameters

##### formId

`string`

##### fillId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### listFormFills()

> **listFormFills**(`formId`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-forms.service.ts:251](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L251)

#### Parameters

##### formId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### listFormFillWaivers()

> **listFormFillWaivers**(`formId`, `fillId`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-forms.service.ts:386](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L386)

#### Parameters

##### formId

`string`

##### fillId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### listForms()

> **listForms**(`scopeId?`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-forms.service.ts:141](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L141)

#### Parameters

##### scopeId?

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### listQuestions()

> **listQuestions**(`formId`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-forms.service.ts:161](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L161)

#### Parameters

##### formId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### listWaivers()

> **listWaivers**(`query?`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-forms.service.ts:336](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L336)

#### Parameters

##### query?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### putQuestionScore()

> **putQuestionScore**(`questionId`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:189](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L189)

#### Parameters

##### questionId

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### updateAnswer()

> **updateAnswer**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:322](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L322)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### updateFill()

> **updateFill**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:277](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L277)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### updateForm()

> **updateForm**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:153](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L153)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### updateQuestion()

> **updateQuestion**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:173](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L173)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### updateWaiver()

> **updateWaiver**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:357](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L357)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### upsertAnswer()

> **upsertAnswer**(`fillId`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-forms.service.ts:294](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-forms.service.ts#L294)

#### Parameters

##### fillId

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>
