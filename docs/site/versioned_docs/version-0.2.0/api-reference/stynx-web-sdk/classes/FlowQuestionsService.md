[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / FlowQuestionsService

# Class: FlowQuestionsService

Defined in: [packages-web/sdk/src/generated/services/FlowQuestionsService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowQuestionsService.ts#L11)

## Constructors

### Constructor

> **new FlowQuestionsService**(`httpRequest`): `FlowQuestionsService`

Defined in: [packages-web/sdk/src/generated/services/FlowQuestionsService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowQuestionsService.ts#L12)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`FlowQuestionsService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/FlowQuestionsService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowQuestionsService.ts#L12)

## Methods

### flowQuestionsDeleteFlowQuestionsByIdDelete()

> **flowQuestionsDeleteFlowQuestionsByIdDelete**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowQuestionsService.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowQuestionsService.ts#L18)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError

---

### flowQuestionsDeleteFlowQuestionsByIdScoreDeleteScore()

> **flowQuestionsDeleteFlowQuestionsByIdScoreDeleteScore**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowQuestionsService.ts:94](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowQuestionsService.ts#L94)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError

---

### flowQuestionsGetFlowQuestionsByIdGet()

> **flowQuestionsGetFlowQuestionsByIdGet**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowQuestionsService.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowQuestionsService.ts#L42)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError

---

### flowQuestionsGetFlowQuestionsByIdScoreScore()

> **flowQuestionsGetFlowQuestionsByIdScoreScore**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowQuestionsService.ts:118](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowQuestionsService.ts#L118)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError

---

### flowQuestionsPatchFlowQuestionsByIdUpdate()

> **flowQuestionsPatchFlowQuestionsByIdUpdate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowQuestionsService.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowQuestionsService.ts#L66)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`UpdateFlowQuestionDto`](../type-aliases/UpdateFlowQuestionDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError

---

### flowQuestionsPutFlowQuestionsByIdScorePutScore()

> **flowQuestionsPutFlowQuestionsByIdScorePutScore**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowQuestionsService.ts:142](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowQuestionsService.ts#L142)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`PutFlowQuestionScoreDto`](../type-aliases/PutFlowQuestionScoreDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError
